export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// djb2 hash for source_ref dedup
function djb2(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h = h >>> 0; }
  return h.toString(36);
}

// Refresh Google OAuth token
async function refreshGoogleToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  return data.access_token;
}

// Binary MIME types that need Claude document API for text extraction
const BINARY_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

// Google Workspace export MIME mappings
const EXPORT_MIME_MAP = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

// Fetch text content from a Drive file — uses export API for Google Workspace
// and text files, Claude document API for binary formats (PDF, Word, etc.)
async function fetchDriveFileText(fileId, mimeType, accessToken) {
  // Binary files — download as base64 and extract via Claude
  if (BINARY_MIME_TYPES.includes(mimeType)) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return extractBinaryFileText(base64, mimeType);
  }

  // Google Workspace native formats — use export API
  const exportMime = EXPORT_MIME_MAP[mimeType];
  if (exportMime) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!res.ok) return null;
    const text = await res.text();
    return text.substring(0, 8000);
  }

  // Plain text — download directly
  if (mimeType === 'text/plain') {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!res.ok) return null;
    const text = await res.text();
    return text.substring(0, 8000);
  }

  return null;
}

// Extract text from a binary file (PDF, Word, etc.) via Claude document API
async function extractBinaryFileText(base64Data, mimeType) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64Data } },
        { type: 'text', text: 'Extract all text content from this document. Return only the raw text, preserving structure. No commentary.' }
      ]}],
    }),
  });
  const data = await response.json();
  if (data.content && data.content[0]) return data.content[0].text;
  return null;
}

// Run unified CL extraction prompt against content
async function runExtractionPrompt(content, fileName, mimeType, businessName, industry, categoryList, toolIdList) {
  const isImage = mimeType.startsWith('image/');
  const systemPrompt = isImage
    ? 'You are a content extraction assistant for a business content library. You are processing an image asset from Google Drive. Based on the filename, folder, and context provided, assign a category and tool tags. Return a JSON array with exactly one object.'
    : 'You are a content extraction assistant for a business content library. Extract discrete pieces of business information from the provided source material. Group content by logical sections — headings, themes, or structural divisions such as quadrants or chapters. Do not split individual bullet points into separate items. Return only a valid JSON array. Each element must have: title (string, max 10 words, must include the document title as context), body (string, clean plain text — summarise prose content in your own words, or preserve bullet points intact if no prose is present — never add context, explanations or detail not present in the source), category (string, must be from the category list), tool_tags (array of tool IDs from the tool ID list). No preamble, no explanation, no markdown fences. Empty array if nothing relevant found.';

  const userContent = isImage
    ? 'Business: ' + businessName + ' (' + industry + ').\nFile name: ' + fileName + '\nMime type: ' + mimeType + '\nCategory list: ' + categoryList + '\nTool ID list: ' + toolIdList + '\nReturn a JSON array with one object: { "title": filename without extension, "body": "Image asset: " + filename, "category": most relevant category, "tool_tags": array of relevant tool IDs }. JSON only.'
    : 'Business: ' + businessName + ' (' + industry + ').\nActive categories: ' + categoryList + '\nActive tool IDs: ' + toolIdList + '\n\nSOURCE CONTENT (' + fileName + '):\n' + content + '\n\nExtract all logical sections as separate items. Include the document title in every item title for context. Preserve bullet points intact where no prose exists. Summarise only what is explicitly present — do not infer or fabricate. JSON array only.';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  const data = await response.json();
  const raw = data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { action, userId, folderId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    // --- LIST FOLDERS ---
    if (action === 'list-folders') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('cl_drive_access_token, cl_drive_refresh_token')
        .eq('id', userId)
        .single();

      if (!profile?.cl_drive_access_token) throw new Error('Google Drive not connected');

      let accessToken = profile.cl_drive_access_token;
      try {
        accessToken = await refreshGoogleToken(profile.cl_drive_refresh_token);
        await supabase.from('profiles').update({ cl_drive_access_token: accessToken }).eq('id', userId);
      } catch (e) {}

      const driveRes = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType%3D'application%2Fvnd.google-apps.folder'&fields=files(id,name)&pageSize=50",
        { headers: { Authorization: 'Bearer ' + accessToken } }
      );
      const driveData = await driveRes.json();
      return res.status(200).json({ success: true, folders: driveData.files || [] });
    }

    // --- IMPORT DRIVE FILES (images + documents) ---
    if (action === 'import-images' || action === 'import-docs' || action === 'import-all') {
      if (!folderId) return res.status(400).json({ error: 'folderId required' });

      const { data: profile } = await supabase
        .from('profiles')
        .select('cl_drive_access_token, cl_drive_refresh_token, industry, business_name, cl_active_categories, cl_custom_categories')
        .eq('id', userId)
        .single();

      if (!profile?.cl_drive_access_token) throw new Error('Google Drive not connected');

      let accessToken = profile.cl_drive_access_token;
      try {
        accessToken = await refreshGoogleToken(profile.cl_drive_refresh_token);
        await supabase.from('profiles').update({ cl_drive_access_token: accessToken }).eq('id', userId);
      } catch (e) {}

      const businessName = profile.business_name || 'this business';
      const industry = profile.industry || 'general';
      const defaultCats = ['Services', 'Products & Equipment', 'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Company News', 'Team & Culture', 'Community & Events'];
      const activeFromProfile = Array.isArray(profile.cl_active_categories) ? profile.cl_active_categories : defaultCats;
      const customFromProfile = Array.isArray(profile.cl_custom_categories) ? profile.cl_custom_categories : [];
      const categoryList = activeFromProfile.concat(customFromProfile).join(', ');
      const toolIdList = 'chatbot, social, email, strategic-plan, news-digest, bi, tender, quote-enhancer, swms, customer-updates, handover-docs, review-booster, design-viz';

      const folderRes = await fetch(
        'https://www.googleapis.com/drive/v3/files/' + folderId + '?fields=name',
        { headers: { Authorization: 'Bearer ' + accessToken } }
      );
      const folderData = await folderRes.json();
      const folderName = folderData.name || folderId;

      const filesRes = await fetch(
        'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent("'" + folderId + "' in parents and trashed=false") + '&fields=files(id,name,mimeType,size,createdTime,thumbnailLink,webContentLink)&pageSize=100',
        { headers: { Authorization: 'Bearer ' + accessToken } }
      );
      const filesData = await filesRes.json();
      const files = filesData.files || [];
      let imported = 0;
      for (const file of files) {
        const isImage = file.mimeType.startsWith('image/');
        const isDoc = [
          'application/vnd.google-apps.document',
          'application/vnd.google-apps.spreadsheet',
          'application/vnd.google-apps.presentation',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
        ].includes(file.mimeType);

        if (!isImage && !isDoc) continue;

        let textContent = null;
        if (isDoc) {
          textContent = await fetchDriveFileText(file.id, file.mimeType, accessToken);
          if (!textContent) continue;
        }

        const items = await runExtractionPrompt(
          textContent || '',
          file.name,
          file.mimeType,
          businessName,
          industry,
          categoryList,
          toolIdList
        );

        for (const item of items) {
          const sourceRef = 'gdrive:' + file.id + ':' + djb2(String(item.title));
          const row = {
            user_id: userId,
            title: String(item.title || file.name).substring(0, 200),
            content_text: String(item.body || ''),
            category: item.category || activeFromProfile[0] || 'general',
            tool_tags: Array.isArray(item.tool_tags) ? item.tool_tags : [],
            status: 'pending',
            source: 'google-drive',
            source_ref: sourceRef,
          };
          const { error } = await supabase.from('content_library').upsert(row, { onConflict: 'source_ref' });
          if (!error) imported++;
        }
      }

      return res.status(200).json({ success: true, imported, total: files.length });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('drive-import error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
