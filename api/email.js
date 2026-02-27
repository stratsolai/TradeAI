/**
 * /api/email.js
 *
 * Unified email API — routes on req.body.action:
 *   'scan'  → scan Gmail/Outlook inbox and categorise with Claude
 *   'draft' → generate a reply draft for a given email
 *
 * Replaces: email-scan.js + email-draft.js
 *
 * ENV: CLAUDE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *      MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
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

function formPost(hostname, path, params) {
  return new Promise((resolve, reject) => {
    const body = params.toString();
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
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

async function refreshOutlookToken(refreshToken) {
  return formPost('login.microsoftonline.com', '/common/oauth2/v2.0/token', new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         'https://graph.microsoft.com/Mail.Read offline_access'
  }));
}

// ─── GMAIL FETCHER ────────────────────────────────────────────────────────────

async function fetchGmailEmails(accessToken) {
  const listResp = await httpsRequest('GET', 'gmail.googleapis.com',
    '/gmail/v1/users/me/messages?maxResults=50&q=is:unread+in:inbox&labelIds=INBOX',
    { 'Authorization': `Bearer ${accessToken}` }
  );

  if (!listResp.body?.messages?.length) return [];

  const emails = [];
  for (const msg of listResp.body.messages.slice(0, 30)) {
    try {
      const detail = await httpsRequest('GET', 'gmail.googleapis.com',
        `/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { 'Authorization': `Bearer ${accessToken}` }
      );
      if (detail.status !== 200) continue;

      const headers   = detail.body.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      const fromRaw   = getHeader('From');
      const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/);

      emails.push({
        id:          msg.id,
        provider:    'gmail',
        sender:      fromMatch ? fromMatch[1].trim().replace(/"/g, '') : fromRaw,
        senderEmail: fromMatch ? fromMatch[2] : fromRaw,
        subject:     getHeader('Subject'),
        preview:     (detail.body.snippet || '').substring(0, 200),
        receivedAt:  new Date(parseInt(detail.body.internalDate)).toISOString(),
        unread:      detail.body.labelIds?.includes('UNREAD') ?? true
      });
    } catch(e) {
      console.log('[email] Gmail message error:', e.message);
    }
  }
  return emails;
}

// ─── OUTLOOK FETCHER ──────────────────────────────────────────────────────────

async function fetchOutlookEmails(accessToken) {
  const resp = await httpsRequest('GET', 'graph.microsoft.com',
    '/v1.0/me/mailFolders/Inbox/messages?$top=30&$filter=isRead eq false&$select=id,from,subject,bodyPreview,receivedDateTime,isRead',
    { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  );

  if (resp.status !== 200 || !resp.body?.value?.length) return [];

  return resp.body.value.map(msg => ({
    id:          msg.id,
    provider:    'outlook',
    sender:      msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown',
    senderEmail: msg.from?.emailAddress?.address || '',
    subject:     msg.subject || '(No subject)',
    preview:     (msg.bodyPreview || '').substring(0, 200),
    receivedAt:  msg.receivedDateTime,
    unread:      !msg.isRead
  }));
}

// ─── CLAUDE CATEGORISER ───────────────────────────────────────────────────────

async function categoriseEmails(emails, claudeKey, businessName, industry) {
  if (!emails.length) return [];

  const emailList = emails.map((e, i) =>
    `${i}: FROM: ${e.sender} <${e.senderEmail}> | SUBJECT: ${e.subject} | PREVIEW: ${e.preview?.substring(0, 120)}`
  ).join('\n');

  const response = await httpsRequest('POST', 'api.anthropic.com', '/v1/messages',
    { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: `You are an email categorisation assistant for ${businessName}, a ${industry} business.
Categorise each email into EXACTLY one of: urgent, leads, enquiries, jobs, invoices, industry, low.
Also set urgent true/false (urgent = needs response today).
Respond ONLY with a JSON array: [{"index": 0, "category": "leads", "urgent": false}, ...]`,
      messages: [{ role: 'user', content: `Categorise:\n\n${emailList}` }]
    }
  );

  try {
    const text  = response.body.content?.[0]?.text || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    const cats  = JSON.parse(clean);
    return emails.map((email, i) => {
      const match = cats.find(c => c.index === i);
      return { ...email, category: match?.category || 'low', urgent: match?.urgent || false };
    });
  } catch {
    return emails.map(e => ({ ...e, category: 'low', urgent: false }));
  }
}

// ─── ACTION: SCAN ─────────────────────────────────────────────────────────────

async function handleScan(req, res) {
  const { userId, providers, businessName, industry } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const claudeKey   = process.env.CLAUDE_API_KEY;
  const supabase    = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: profile } = await supabase
    .from('profiles')
    .select('gmail_access_token, gmail_refresh_token, outlook_access_token, outlook_refresh_token, active_tools')
    .eq('id', userId)
    .single();

  let allEmails = [];

  if (providers.includes('gmail') && profile?.gmail_access_token) {
    try {
      let token = profile.gmail_access_token;
      if (profile.gmail_refresh_token) {
        const refreshed = await refreshGmailToken(profile.gmail_refresh_token);
        if (refreshed.access_token) {
          token = refreshed.access_token;
          await supabase.from('profiles').update({ gmail_access_token: token }).eq('id', userId);
        }
      }
      allEmails = allEmails.concat(await fetchGmailEmails(token));
    } catch(e) { console.error('[email/scan] Gmail error:', e.message); }
  }

  if (providers.includes('outlook') && profile?.outlook_access_token) {
    try {
      let token = profile.outlook_access_token;
      if (profile.outlook_refresh_token) {
        const refreshed = await refreshOutlookToken(profile.outlook_refresh_token);
        if (refreshed.access_token) {
          token = refreshed.access_token;
          await supabase.from('profiles').update({ outlook_access_token: token }).eq('id', userId);
        }
      }
      allEmails = allEmails.concat(await fetchOutlookEmails(token));
    } catch(e) { console.error('[email/scan] Outlook error:', e.message); }
  }

  if (!allEmails.length) {
    return res.status(200).json({ success: true, emails: [], message: 'No new emails found' });
  }

  const categorised = await categoriseEmails(allEmails, claudeKey, businessName, industry);

  // Save industry emails to content library if News Digest is active
  if (profile?.active_tools?.includes('news-digest')) {
    for (const email of categorised.filter(e => e.category === 'industry')) {
      await supabase.from('content_library').upsert({
        user_id: userId,
        title: email.subject,
        content_type: 'industry-news',
        source: `email-${email.provider}`,
        tool_source: 'news-digest',
        status: 'approved',
        metadata: JSON.stringify({ sender: email.sender, senderEmail: email.senderEmail, preview: email.preview, receivedAt: email.receivedAt })
      }, { onConflict: 'user_id,title' });
    }
  }

  return res.status(200).json({ success: true, emails: categorised });
}

// ─── ACTION: DRAFT ────────────────────────────────────────────────────────────

async function handleDraft(req, res) {
  const { emailFrom, emailSubject, emailPreview, emailCategory, businessName, industry } = req.body;
  const claudeKey = process.env.CLAUDE_API_KEY;

  const categoryContext = {
    urgent:    'Urgent — respond promptly and address the issue directly.',
    leads:     'New sales lead — warm, professional, offer to quote or discuss.',
    enquiries: 'Customer enquiry — helpful and clear.',
    jobs:      'Job/scheduling — practical, confirm details, clear next steps.',
    invoices:  'Invoice/payment — professional, clear on figures and timelines.',
    industry:  'Industry/supplier — brief acknowledgement.',
    low:       'Low priority — brief and polite.'
  };

  const response = await httpsRequest('POST', 'api.anthropic.com', '/v1/messages',
    { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `You are a professional email assistant for ${businessName}, a ${industry} business.
Write a professional, friendly reply. Sound like a real tradesperson — concise, under 150 words.
${categoryContext[emailCategory] || 'Be helpful and professional.'}
End with a sign-off using "${businessName}". No subject line. No placeholders.
Respond with ONLY the email body, ready to send.`,
      messages: [{ role: 'user', content: `Draft a reply:\nFrom: ${emailFrom}\nSubject: ${emailSubject}\nMessage: ${emailPreview}` }]
    }
  );

  const draft = response.body.content?.[0]?.text?.trim() || '';
  return res.status(200).json({ success: true, draft });
}

// ─── MAIN ROUTER ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body;

  try {
    if (action === 'scan')  return await handleScan(req, res);
    if (action === 'draft') return await handleDraft(req, res);
    return res.status(400).json({ error: 'action must be "scan" or "draft"' });
  } catch(err) {
    console.error('[email]', err);
    return res.status(500).json({ error: err.message });
  }
};
