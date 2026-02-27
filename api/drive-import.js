/**
 * /api/drive-import.js
 *
 * Unified Google Drive & email content import API — routes on req.body.action:
 *   'list-folders'    → list Google Drive folders for picker
 *   'import-images'   → import images from a Drive folder into content library
 *   'import-email'    → import content from a connected email source
 *
 * Replaces: list-drive-folders.js + import-drive-images.js + import-email-content.js
 *
 * ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    https.get({ hostname, path, headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject);
  });
}

function formPost(hostname, path, params) {
  return new Promise((resolve, reject) => {
    const body = params.toString();
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── TOKEN REFRESH ────────────────────────────────────────────────────────────

async function refreshGmailToken(refreshToken) {
  return formPost('oauth2.googleapis.com', '/token', new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token'
  }));
}

async function getValidToken(userId, supabase) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('gmail_access_token, gmail_refresh_token')
    .eq('id', userId)
    .single();

  if (!profile?.gmail_access_token) throw new Error('Google account not connected');

  // Try to refresh
  if (profile.gmail_refresh_token) {
    try {
      const refreshed = await refreshGmailToken(profile.gmail_refresh_token);
      if (refreshed.access_token) {
        await supabase.from('profiles')
          .update({ gmail_access_token: refreshed.access_token })
          .eq('id', userId);
        return refreshed.access_token;
      }
    } catch(e) {
      console.log('[drive-import] Token refresh failed, using existing:', e.message);
    }
  }

  return profile.gmail_access_token;
}

// ─── ACTION: LIST FOLDERS ─────────────────────────────────────────────────────

async function handleListFolders(req, res) {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const token = await getValidToken(userId, supabase);

    // List folders from Drive
    const resp = await httpsGet(
      'www.googleapis.com',
      '/drive/v3/files?q=mimeType%3D%22application%2Fvnd.google-apps.folder%22+and+trashed%3Dfalse&fields=files(id,name,modifiedTime)&orderBy=name&pageSize=50',
      { 'Authorization': `Bearer ${token}` }
    );

    if (resp.status !== 200) {
      return res.status(400).json({ error: 'Failed to list Drive folders', details: resp.body });
    }

    const folders = (resp.body.files || []).map(f => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime
    }));

    return res.status(200).json({ success: true, folders });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

// ─── ACTION: IMPORT IMAGES ────────────────────────────────────────────────────

async function handleImportImages(req, res) {
  const { userId, folderId, folderName, category } = req.body;
  if (!userId || !folderId) return res.status(400).json({ error: 'userId and folderId required' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const token = await getValidToken(userId, supabase);

    // List image files in the folder
    const query = encodeURIComponent(
      `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`
    );
    const resp = await httpsGet(
      'www.googleapis.com',
      `/drive/v3/files?q=${query}&fields=files(id,name,mimeType,thumbnailLink,webContentLink,createdTime,size)&pageSize=100&orderBy=createdTime+desc`,
      { 'Authorization': `Bearer ${token}` }
    );

    if (resp.status !== 200) {
      return res.status(400).json({ error: 'Failed to list folder images', details: resp.body });
    }

    const files = resp.body.files || [];
    if (!files.length) return res.status(200).json({ success: true, imported: 0, message: 'No images found in folder' });

    // Save each image reference to content library
    let imported = 0;
    for (const file of files) {
      // Build a direct image URL using Drive's export link
      const imageUrl = `https://drive.google.com/uc?export=view&id=${file.id}`;
      const thumbUrl = file.thumbnailLink || imageUrl;

      const { error } = await supabase.from('content_library').upsert({
        user_id:      userId,
        title:        file.name,
        content_type: 'image',
        file_url:     imageUrl,
        thumbnail_url: thumbUrl,
        source:       'google-drive',
        tool_source:  'drive-import',
        category:     category || 'completed-jobs',
        status:       'approved',
        metadata:     JSON.stringify({
          driveFileId: file.id,
          mimeType: file.mimeType,
          folderName: folderName || folderId,
          size: file.size,
          createdTime: file.createdTime
        })
      }, { onConflict: 'user_id,title' });

      if (!error) imported++;
    }

    return res.status(200).json({ success: true, imported, total: files.length });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

// ─── ACTION: IMPORT EMAIL CONTENT ─────────────────────────────────────────────

async function handleImportEmail(req, res) {
  const { userId, source, maxItems } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const token = await getValidToken(userId, supabase);
    const limit = Math.min(maxItems || 20, 50);

    // Fetch recent emails that might have useful content
    // Focuses on emails with attachments or from known trade sources
    const query = encodeURIComponent('has:attachment OR from:newsletter OR from:industry');
    const resp = await httpsGet(
      'gmail.googleapis.com',
      `/gmail/v1/users/me/messages?maxResults=${limit}&q=${query}&labelIds=INBOX`,
      { 'Authorization': `Bearer ${token}` }
    );

    if (!resp.body?.messages?.length) {
      return res.status(200).json({ success: true, imported: 0, message: 'No matching emails found' });
    }

    let imported = 0;
    for (const msg of resp.body.messages.slice(0, limit)) {
      try {
        const detail = await httpsGet(
          'gmail.googleapis.com',
          `/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { 'Authorization': `Bearer ${token}` }
        );

        if (detail.status !== 200) continue;

        const headers   = detail.body.payload?.headers || [];
        const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
        const subject   = getHeader('Subject');
        const from      = getHeader('From');
        const date      = getHeader('Date');
        const snippet   = detail.body.snippet || '';

        if (!subject) continue;

        await supabase.from('content_library').upsert({
          user_id:      userId,
          title:        subject,
          content_type: 'email-content',
          source:       'gmail',
          tool_source:  'drive-import',
          status:       'pending',
          metadata:     JSON.stringify({ from, date, preview: snippet, messageId: msg.id })
        }, { onConflict: 'user_id,title' });

        imported++;
      } catch(e) {
        console.log('[drive-import] Email import error:', e.message);
      }
    }

    return res.status(200).json({ success: true, imported });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

// ─── MAIN ROUTER ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body;

  try {
    if (action === 'list-folders')  return await handleListFolders(req, res);
    if (action === 'import-images') return await handleImportImages(req, res);
    if (action === 'import-email')  return await handleImportEmail(req, res);
    return res.status(400).json({ error: 'action must be list-folders, import-images, or import-email' });
  } catch(err) {
    console.error('[drive-import]', err);
    return res.status(500).json({ error: err.message });
  }
};
