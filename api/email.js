/**
 * api/email.js
 *
 * AI Email Assistant API
 * action: scan → fetch, summarise and categorise emails via Claude
 *
 * Supports Gmail and Outlook (Microsoft Graph).
 * Categories are passed dynamically from the client — never hardcoded.
 * message_url is stored at scan time for deep-link on email card tap.
 *
 * Uses fetch() for all HTTP calls — matches cl-email-scan.js pattern.
 */

const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function refreshGmailToken(refreshToken) {
  var res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token'
    })
  });
  var data = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function refreshOutlookToken(refreshToken) {
  var params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access'
  }).toString();
  var res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(params).toString()
    },
    body: params
  });
  var data = await res.json();
  if (!data.access_token) throw new Error('Outlook token refresh failed: ' + JSON.stringify(data));
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Email fetchers
// ---------------------------------------------------------------------------

async function fetchGmailMessages(accessToken, maxResults) {
  var listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=' + maxResults + '&q=in:inbox',
    { headers: { 'Authorization': 'Bearer ' + accessToken } }
  );
  if (!listRes.ok) {
    var errBody = await listRes.json().catch(function () { return {}; });
    throw new Error('Gmail API returned ' + listRes.status + ': ' + ((errBody.error && errBody.error.message) || ''));
  }
  var listData = await listRes.json();
  if (!listData.messages) return [];

  var emails = [];
  for (var i = 0; i < listData.messages.length && i < maxResults; i++) {
    var msg = listData.messages[i];
    var detailRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msg.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date',
      { headers: { 'Authorization': 'Bearer ' + accessToken } }
    );
    if (!detailRes.ok) continue;
    var m = await detailRes.json();
    if (!m || !m.payload) continue;
    var headers = m.payload.headers || [];
    function getHeader(name) { return (headers.find(function (h) { return h.name === name; }) || {}).value || ''; }
    var fromRaw = getHeader('From');
    var fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) || [];
    emails.push({
      id:          m.id,
      provider:    'gmail',
      sender:      fromMatch[2] ? fromMatch[1].replace(/"/g, '').trim() : fromRaw,
      email:       fromMatch[2] || fromRaw,
      subject:     getHeader('Subject') || '(no subject)',
      date:        getHeader('Date'),
      snippet:     m.snippet || '',
      message_url: 'https://mail.google.com/mail/u/0/#inbox/' + m.id
    });
  }
  return emails;
}

async function fetchOutlookMessages(accessToken, maxResults) {
  var listRes = await fetch(
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=' + maxResults + '&$select=id,subject,from,receivedDateTime,bodyPreview,webLink',
    { headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' } }
  );
  if (!listRes.ok) {
    var errBody = await listRes.json().catch(function () { return {}; });
    throw new Error('Outlook API returned ' + listRes.status + ': ' + (errBody.error && errBody.error.message || ''));
  }
  var listData = await listRes.json();
  if (!listData.value) return [];

  return listData.value.map(function (m) {
    return {
      id:          m.id,
      provider:    'outlook',
      sender:      (m.from && m.from.emailAddress && m.from.emailAddress.name) || '',
      email:       (m.from && m.from.emailAddress && m.from.emailAddress.address) || '',
      subject:     m.subject || '(no subject)',
      date:        m.receivedDateTime,
      snippet:     m.bodyPreview || '',
      message_url: m.webLink || null
    };
  });
}

// ---------------------------------------------------------------------------
// Claude categorisation
// ---------------------------------------------------------------------------

async function categoriseEmails(emails, categories, businessName, industry) {
  if (!emails.length) return [];

  var categoryList = categories
    .filter(function (c) { return c.enabled; })
    .map(function (c) { return c.id + ': ' + c.label; })
    .join(', ');

  var emailList = emails.map(function (e, i) {
    return '[' + i + '] From: ' + e.sender + ' <' + e.email + '>\nSubject: ' + e.subject + '\nPreview: ' + (e.snippet || '').substring(0, 150);
  }).join('\n\n');

  var prompt = 'You are an email assistant for a ' + industry + ' business called ' + businessName + '.\n\nAnalyse the following emails and for each one return a JSON array. Each item must have:\n- index: the email index number\n- summary: a 2-3 sentence plain-English summary of the email\n- category: one of these category IDs: ' + categoryList + '\n\nReturn ONLY a valid JSON array with no additional text, markdown, or explanation.\n\nEmails:\n' + emailList;

  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    var data = await res.json();
    var text = data && data.content && data.content[0] ? data.content[0].text : '[]';
    var clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('Categorisation error:', e.message);
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

  var authHeader = req.headers['authorization'] || '';
  var token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised' });

  var supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    var authRes = await supabase.auth.getUser(token);
    if (authRes.error || !authRes.data || !authRes.data.user) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    var user = authRes.data.user;

    var body = req.body || {};
    if (body.action !== 'scan') return res.status(400).json({ error: 'Invalid action' });

    var profileRes = await supabase
      .from('profiles')
      .select('ea_connected_emails, business_name, industry')
      .eq('id', user.id)
      .single();

    if (profileRes.error) return res.status(500).json({ error: 'Could not load profile' });
    var profile = profileRes.data;

    var eaEmails = Array.isArray(profile.ea_connected_emails) ? profile.ea_connected_emails : [];
    var gmailEntry = eaEmails.find(function (e) { return (e.provider === 'gmail' || e.provider === 'google') && e.access_token; });
    var outlookEntry = eaEmails.find(function (e) { return (e.provider === 'microsoft' || e.provider === 'outlook') && e.access_token; });

    if (!gmailEntry && !outlookEntry) {
      return res.status(400).json({ error: 'No email account connected. Connect Gmail or Outlook from Settings to begin scanning.' });
    }

    var categories = Array.isArray(body.categories) && body.categories.length > 0
      ? body.categories
      : [{ id: 'general', label: 'General', enabled: true }];

    var maxResults = 20;
    var businessName = profile.business_name || 'your business';
    var industry = profile.industry || 'general business';
    var allEmails = [];

    if (gmailEntry) {
      var gmailToken = gmailEntry.access_token;
      if (gmailEntry.refresh_token) {
        try {
          gmailToken = await refreshGmailToken(gmailEntry.refresh_token);
          gmailEntry.access_token = gmailToken;
          await supabase.from('profiles').update({ ea_connected_emails: eaEmails }).eq('id', user.id);
        } catch (refreshErr) {
          console.error('Gmail token refresh failed:', refreshErr.message);
          return res.status(401).json({ error: 'Gmail token expired. Please reconnect Gmail in Settings.' });
        }
      }
      try {
        var gmailEmails = await fetchGmailMessages(gmailToken, maxResults);
        allEmails = allEmails.concat(gmailEmails);
      } catch (fetchErr) {
        console.error('Gmail fetch error:', fetchErr.message);
        return res.status(502).json({ error: 'Gmail API error: ' + fetchErr.message });
      }
    }

    if (outlookEntry) {
      var outlookToken = outlookEntry.access_token;
      if (outlookEntry.refresh_token) {
        try {
          outlookToken = await refreshOutlookToken(outlookEntry.refresh_token);
          outlookEntry.access_token = outlookToken;
          await supabase.from('profiles').update({ ea_connected_emails: eaEmails }).eq('id', user.id);
        } catch (refreshErr) {
          console.error('Outlook token refresh failed:', refreshErr.message);
          return res.status(401).json({ error: 'Outlook token expired. Please reconnect Outlook in Settings.' });
        }
      }
      try {
        var outlookEmails = await fetchOutlookMessages(outlookToken, maxResults);
        allEmails = allEmails.concat(outlookEmails);
      } catch (fetchErr) {
        console.error('Outlook fetch error:', fetchErr.message);
        return res.status(502).json({ error: 'Outlook API error: ' + fetchErr.message });
      }
    }

    if (!allEmails.length) {
      return res.status(200).json({ emails: [] });
    }

    var categorised = await categoriseEmails(allEmails, categories, businessName, industry);

    var results = allEmails.map(function (email, i) {
      var analysis = categorised.find(function (c) { return c.index === i; }) || {};
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

    var rows = results.map(function (r) {
      return {
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
      };
    });

    var storeRes = await supabase
      .from('email_summaries')
      .upsert(rows, { onConflict: 'user_id,message_id' });

    if (storeRes.error) {
      console.error('Store error:', storeRes.error.message);
    }

    return res.status(200).json({ emails: results });

  } catch (err) {
    console.error('EA scan error:', err.message || err);
    return res.status(500).json({ error: 'Scan failed: ' + (err.message || 'Unknown error') });
  }
};
