/**
 * /api/email-scan.js
 *
 * Scans connected Gmail and/or Outlook inboxes,
 * uses Claude to categorise each email, returns structured list.
 *
 * ENV VARS:
 *   CLAUDE_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  (for Gmail token refresh)
 *   MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (for Outlook token refresh)
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────

function httpsRequest(method, hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname, path, method,
      headers: {
        ...headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── TOKEN REFRESH ────────────────────────────────────────────────────────────

async function refreshGmailToken(refreshToken) {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token'
  });

  const resp = await httpsRequest('POST', 'oauth2.googleapis.com', '/token', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(params.toString())
  }, null);

  // Override body since it's form data
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

async function refreshOutlookToken(refreshToken) {
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         'https://graph.microsoft.com/Mail.Read offline_access'
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path: '/common/oauth2/v2.0/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

// ─── GMAIL FETCHER ────────────────────────────────────────────────────────────

async function fetchGmailEmails(accessToken) {
  // Get message list (last 50 unread)
  const listResp = await httpsRequest('GET', 'gmail.googleapis.com',
    '/gmail/v1/users/me/messages?maxResults=50&q=is:unread+in:inbox&labelIds=INBOX',
    { 'Authorization': `Bearer ${accessToken}` }
  );

  if (!listResp.body?.messages?.length) return [];

  // Fetch details for each message (parallel, batch of 20)
  const messages = listResp.body.messages.slice(0, 30);
  const emails = [];

  for (const msg of messages) {
    try {
      const detail = await httpsRequest('GET', 'gmail.googleapis.com',
        `/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { 'Authorization': `Bearer ${accessToken}` }
      );

      if (detail.status !== 200) continue;

      const headers = detail.body.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const fromRaw = getHeader('From');
      const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
      const sender      = fromMatch ? fromMatch[1].trim().replace(/"/g, '') : fromRaw;
      const senderEmail = fromMatch ? fromMatch[2] : fromRaw;

      const snippet = detail.body.snippet || '';

      emails.push({
        id:           msg.id,
        provider:     'gmail',
        sender,
        senderEmail,
        subject:      getHeader('Subject'),
        preview:      snippet.substring(0, 200),
        receivedAt:   new Date(parseInt(detail.body.internalDate)).toISOString(),
        unread:       detail.body.labelIds?.includes('UNREAD') ?? true,
        rawLabels:    detail.body.labelIds || []
      });
    } catch(e) {
      console.log('[email-scan] Error fetching Gmail message:', e.message);
    }
  }

  return emails;
}

// ─── OUTLOOK FETCHER ──────────────────────────────────────────────────────────

async function fetchOutlookEmails(accessToken) {
  const resp = await httpsRequest('GET', 'graph.microsoft.com',
    '/v1.0/me/mailFolders/Inbox/messages?$top=30&$filter=isRead eq false&$select=id,from,subject,bodyPreview,receivedDateTime,isRead',
    {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  );

  if (resp.status !== 200 || !resp.body?.value?.length) return [];

  return resp.body.value.map(msg => ({
    id:           msg.id,
    provider:     'outlook',
    sender:       msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown',
    senderEmail:  msg.from?.emailAddress?.address || '',
    subject:      msg.subject || '(No subject)',
    preview:      (msg.bodyPreview || '').substring(0, 200),
    receivedAt:   msg.receivedDateTime,
    unread:       !msg.isRead
  }));
}

// ─── CLAUDE CATEGORISER ───────────────────────────────────────────────────────

async function categoriseEmails(emails, claudeKey, businessName, industry) {
  if (!emails.length) return [];

  // Build a compact list for Claude to categorise in one shot
  const emailList = emails.map((e, i) =>
    `${i}: FROM: ${e.sender} <${e.senderEmail}> | SUBJECT: ${e.subject} | PREVIEW: ${e.preview?.substring(0, 120)}`
  ).join('\n');

  const systemPrompt = `You are an email categorisation assistant for ${businessName}, a ${industry} business.

Categorise each email into EXACTLY one of these categories:
- urgent: Customer complaints, overdue invoices, time-sensitive requests, anything needing immediate attention
- leads: First contact from potential new customers enquiring about work
- enquiries: Questions or follow-ups from existing customers
- jobs: Job bookings, schedule changes, supplier coordination, site communications
- invoices: Bills, quotes, payment confirmations, overdue notices, financial documents
- industry: Trade newsletters, industry body updates, supplier promos, regulatory updates, trade news
- low: Marketing emails, automated notifications, spam, anything non-urgent

Also determine if each email is urgent (true/false) — urgent means it needs a response today.

Respond with ONLY a JSON array, no other text:
[{"index": 0, "category": "leads", "urgent": false}, ...]`;

  const response = await httpsRequest('POST', 'api.anthropic.com', '/v1/messages',
    {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01'
    },
    {
      model: 'claude-haiku-4-5-20251001',  // Fast + cheap for categorisation
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Categorise these emails:\n\n${emailList}` }]
    }
  );

  if (response.status !== 200) {
    console.error('[email-scan] Claude error:', response.body);
    // Return emails with default category if Claude fails
    return emails.map(e => ({ ...e, category: 'low', urgent: false }));
  }

  try {
    const text = response.body.content?.[0]?.text || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    const categorised = JSON.parse(clean);

    return emails.map((email, i) => {
      const match = categorised.find(c => c.index === i);
      return {
        ...email,
        category: match?.category || 'low',
        urgent: match?.urgent || false
      };
    });
  } catch(e) {
    console.error('[email-scan] Parse error:', e.message);
    return emails.map(e => ({ ...e, category: 'low', urgent: false }));
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, providers, businessName, industry } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const claudeKey   = process.env.CLAUDE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!claudeKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get user's tokens
    const { data: profile } = await supabase
      .from('profiles')
      .select('gmail_access_token, gmail_refresh_token, outlook_access_token, outlook_refresh_token')
      .eq('id', userId)
      .single();

    let allEmails = [];

    // ── Gmail ──────────────────────────────────────────────────────────────
    if (providers.includes('gmail') && profile?.gmail_access_token) {
      try {
        console.log('[email-scan] Fetching Gmail...');
        let token = profile.gmail_access_token;

        // Try to refresh token if we have a refresh token
        if (profile.gmail_refresh_token) {
          const refreshed = await refreshGmailToken(profile.gmail_refresh_token);
          if (refreshed.access_token) {
            token = refreshed.access_token;
            await supabase.from('profiles')
              .update({ gmail_access_token: token })
              .eq('id', userId);
          }
        }

        const gmailEmails = await fetchGmailEmails(token);
        allEmails = allEmails.concat(gmailEmails);
        console.log(`[email-scan] Fetched ${gmailEmails.length} Gmail emails`);
      } catch(e) {
        console.error('[email-scan] Gmail error:', e.message);
      }
    }

    // ── Outlook ────────────────────────────────────────────────────────────
    if (providers.includes('outlook') && profile?.outlook_access_token) {
      try {
        console.log('[email-scan] Fetching Outlook...');
        let token = profile.outlook_access_token;

        if (profile.outlook_refresh_token) {
          const refreshed = await refreshOutlookToken(profile.outlook_refresh_token);
          if (refreshed.access_token) {
            token = refreshed.access_token;
            await supabase.from('profiles')
              .update({ outlook_access_token: token })
              .eq('id', userId);
          }
        }

        const outlookEmails = await fetchOutlookEmails(token);
        allEmails = allEmails.concat(outlookEmails);
        console.log(`[email-scan] Fetched ${outlookEmails.length} Outlook emails`);
      } catch(e) {
        console.error('[email-scan] Outlook error:', e.message);
      }
    }

    if (!allEmails.length) {
      return res.status(200).json({ success: true, emails: [], message: 'No new emails found' });
    }

    // ── Categorise with Claude ─────────────────────────────────────────────
    console.log(`[email-scan] Categorising ${allEmails.length} emails...`);
    const categorised = await categoriseEmails(allEmails, claudeKey, businessName, industry);

    // ── If News Digest active, save industry emails to content library ─────
    const { data: profileFull } = await supabase
      .from('profiles')
      .select('active_tools')
      .eq('id', userId)
      .single();

    if (profileFull?.active_tools?.includes('news-digest')) {
      const industryEmails = categorised.filter(e => e.category === 'industry');
      for (const email of industryEmails) {
        await supabase.from('content_library').upsert({
          user_id: userId,
          title: email.subject,
          content_type: 'industry-news',
          source: `email-${email.provider}`,
          tool_source: 'news-digest',
          status: 'approved',
          metadata: JSON.stringify({
            sender: email.sender,
            senderEmail: email.senderEmail,
            preview: email.preview,
            receivedAt: email.receivedAt
          })
        }, { onConflict: 'user_id,title' });
      }
    }

    return res.status(200).json({ success: true, emails: categorised });

  } catch(err) {
    console.error('[email-scan] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
};
