/**
 * api/email.js
 *
 * AI Email Assistant API
 * action: scan → fetch, summarise and categorise emails via Claude
 *
 * Supports Gmail and Outlook (Microsoft Graph).
 * Categories are passed dynamically from the client — never hardcoded.
 * message_url is stored at scan time for deep-link on email card tap.
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpsRequest(method, hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const options = { method, hostname, path, headers };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function refreshGmailToken(refreshToken) {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token'
  }).toString();
  const res = await httpsRequest(
    'POST', 'oauth2.googleapis.com', '/token',
    { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params) },
    params
  );
  if (!res.body.access_token) throw new Error('Gmail token refresh failed');
  return res.body.access_token;
}

async function refreshOutlookToken(refreshToken) {
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access'
  }).toString();
  const res = await httpsRequest(
    'POST', 'login.microsoftonline.com', '/common/oauth2/v2.0/token',
    { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params) },
    params
  );
  if (!res.body.access_token) throw new Error('Outlook token refresh failed');
  return res.body.access_token;
}
// ---------------------------------------------------------------------------
// Email fetchers
// ---------------------------------------------------------------------------

async function fetchGmailMessages(accessToken, maxResults) {
  const listRes = await httpsRequest(
    'GET', 'gmail.googleapis.com',
    `/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in:inbox`,
    { 'Authorization': `Bearer ${accessToken}` }
  );
  if (!listRes.body.messages) return [];

  const emails = [];
  for (const msg of listRes.body.messages.slice(0, maxResults)) {
    const detailRes = await httpsRequest(
      'GET', 'gmail.googleapis.com',
      `/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { 'Authorization': `Bearer ${accessToken}` }
    );
    const m = detailRes.body;
    if (!m || !m.payload) continue;
    const headers = m.payload.headers || [];
    const getHeader = (name) => (headers.find(h => h.name === name) || {}).value || '';
    const fromRaw = getHeader('From');
    const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) || [];
    emails.push({
      id:          m.id,
      provider:    'gmail',
      sender:      fromMatch[2] ? fromMatch[1].replace(/"/g, '').trim() : fromRaw,
      email:       fromMatch[2] || fromRaw,
      subject:     getHeader('Subject') || '(no subject)',
      date:        getHeader('Date'),
      snippet:     m.snippet || '',
      message_url: `https://mail.google.com/mail/u/0/#inbox/${m.id}`
    });
  }
  return emails;
}

async function fetchOutlookMessages(accessToken, maxResults) {
  const listRes = await httpsRequest(
    'GET', 'graph.microsoft.com',
    `/v1.0/me/mailFolders/inbox/messages?$top=${maxResults}&$select=id,subject,from,receivedDateTime,bodyPreview,webLink`,
    { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
  );
  if (!listRes.body.value) return [];

  return listRes.body.value.map(m => ({
    id:          m.id,
    provider:    'outlook',
    sender:      (m.from && m.from.emailAddress && m.from.emailAddress.name)  || '',
    email:       (m.from && m.from.emailAddress && m.from.emailAddress.address) || '',
    subject:     m.subject || '(no subject)',
    date:        m.receivedDateTime,
    snippet:     m.bodyPreview || '',
    message_url: m.webLink || null
  }));
}
// ---------------------------------------------------------------------------
// Claude categorisation
// ---------------------------------------------------------------------------

async function categoriseEmails(emails, categories, businessName, industry) {
  if (!emails.length) return [];

  const categoryList = categories
    .filter(c => c.enabled)
    .map(c => c.id + ': ' + c.label)
    .join(', ');

  const emailList = emails.map((e, i) =>
    `[${i}] From: ${e.sender} <${e.email}>\nSubject: ${e.subject}\nPreview: ${e.snippet.substring(0, 150)}`
  ).join('\n\n');

  const prompt = `You are an email assistant for a ${industry} business called ${businessName}.\n\nAnalyse the following emails and for each one return a JSON array. Each item must have:\n- index: the email index number\n- summary: a 2-3 sentence plain-English summary of the email\n- category: one of these category IDs: ${categoryList}\n\nReturn ONLY a valid JSON array with no additional text, markdown, or explanation.\n\nEmails:\n${emailList}`;

  const res = await httpsRequest(
    'POST', 'api.anthropic.com', '/v1/messages',
    {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    {
      model:    'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    }
  );

  const text = res.body && res.body.content && res.body.content[0]
    ? res.body.content[0].text : '[]';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}
// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorised' });

  const body       = req.body || {};
  const { action } = body;

  if (action !== 'scan') return res.status(400).json({ error: 'Invalid action' });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('ea_connected_emails, business_name, industry')
    .eq('id', user.id)
    .single();

  if (profileError) return res.status(500).json({ error: 'Could not load profile' });

  const eaEmails = Array.isArray(profile.ea_connected_emails) ? profile.ea_connected_emails : [];
  const gmailEntry = eaEmails.find(function(e) { return (e.provider === 'gmail' || e.provider === 'google') && e.access_token; });
  const outlookEntry = eaEmails.find(function(e) { return (e.provider === 'microsoft' || e.provider === 'outlook') && e.access_token; });

  if (!gmailEntry && !outlookEntry) {
    return res.status(400).json({ error: 'No email account connected. Connect Gmail or Outlook from Settings to begin scanning.' });
  }

  const categories   = Array.isArray(body.categories) && body.categories.length > 0
    ? body.categories
    : [{ id: 'general', label: 'General', enabled: true }];

  const maxResults   = 20;
  const businessName = profile.business_name || 'your business';
  const industry     = profile.industry       || 'general business';
  let   allEmails    = [];

  if (gmailEntry) {
    try {
      let accessToken = gmailEntry.access_token;
      try {
        const gmailEmails = await fetchGmailMessages(accessToken, maxResults);
        allEmails = allEmails.concat(gmailEmails);
      } catch (fetchErr) {
        if (gmailEntry.refresh_token) {
          accessToken = await refreshGmailToken(gmailEntry.refresh_token);
          gmailEntry.access_token = accessToken;
          await supabase.from('profiles').update({ ea_connected_emails: eaEmails }).eq('id', user.id);
          const gmailEmails = await fetchGmailMessages(accessToken, maxResults);
          allEmails = allEmails.concat(gmailEmails);
        }
      }
    } catch (err) {
      console.error('Gmail fetch error:', err.message);
    }
  }

  if (outlookEntry) {
    try {
      let accessToken = outlookEntry.access_token;
      try {
        const outlookEmails = await fetchOutlookMessages(accessToken, maxResults);
        allEmails = allEmails.concat(outlookEmails);
      } catch (fetchErr) {
        if (outlookEntry.refresh_token) {
          accessToken = await refreshOutlookToken(outlookEntry.refresh_token);
          outlookEntry.access_token = accessToken;
          await supabase.from('profiles').update({ ea_connected_emails: eaEmails }).eq('id', user.id);
          const outlookEmails = await fetchOutlookMessages(accessToken, maxResults);
          allEmails = allEmails.concat(outlookEmails);
        }
      }
    } catch (err) {
      console.error('Outlook fetch error:', err.message);
    }
  }

  if (!allEmails.length) {
    return res.status(200).json({ emails: [] });
  }

  const categorised = await categoriseEmails(allEmails, categories, businessName, industry);

  const results = allEmails.map((email, i) => {
    const analysis = categorised.find(c => c.index === i) || {};
    return {
      id:          email.id,
      provider:    email.provider,
      sender:      email.sender,
      email:       email.email,
      subject:     email.subject,
      date:        email.date,
      summary:     analysis.summary || '',
      category:    analysis.category || 'general',
      message_url: email.message_url || null,
      handled:     false
    };
  });

  const rows = results.map(r => ({
    user_id:      user.id,
    message_id:   r.id,
    provider:     r.provider,
    sender:       r.sender,
    sender_email: r.email,
    subject:      r.subject,
    received_at:  r.date,
    summary:      r.summary,
    category:     r.category,
    message_url:  r.message_url,
    handled:      false
  }));

  const { error: storeError } = await supabase
    .from('email_summaries')
    .upsert(rows, { onConflict: 'user_id,message_id' });

  if (storeError) {
    console.error('Store error:', storeError.message);
  }

  return res.status(200).json({ emails: results });
};
