export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { logAnthropicUsage } from '../lib/usage-logger.js';
import {
  ALLOWED_TOOL_IDS as CL_ALLOWED_TOOL_IDS,
  ALL_CATEGORIES as CL_ALL_CATEGORIES,
  CATEGORY_LOOKUP as CL_CATEGORY_LOOKUP,
  DISCARD_CATEGORIES as CL_DISCARD_CATEGORIES,
  buildSingleItemPrompt,
  applyCategoryToolMatrix,
  applyToolOutputMatrix
} from '../lib/cl-prompts.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function refreshGmailToken(refreshToken) {
  var res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  var data = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function refreshOutlookToken(refreshToken) {
  var params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access'
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

// CL extraction prompt — sourced from lib/cl-prompts.js. The email variant
// includes the From-header sentence in RULE 8 so the model can tell
// self-sent campaigns from received supplier promos.
var CL_EXTRACTION_SYSTEM_PROMPT = buildSingleItemPrompt({ source: 'email' });

async function runClExtractionPrompt(emailBody, subject, sender, userId) {
  var userContent = 'SOURCE CONTENT (Email from ' + (sender || 'unknown sender') + ', subject: ' + subject + '):\n' + emailBody.substring(0, 6000);
  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: CL_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }]
    })
  });
  var data = await response.json();
  logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'ea-extraction' });
  if (data.error) {
    console.error('[EA] CL extraction Claude API error:', JSON.stringify(data.error));
    return [];
  }
  var raw = data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    var clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('[EA] CL extraction JSON parse error:', e.message, 'raw:', raw.substring(0, 500));
    return [];
  }
}

// ---------------------------------------------------------------------------
// Gmail MIME body extraction — matches cl-email-scan.js
// ---------------------------------------------------------------------------

function decodeBase64Url(str) {
  var base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(base64).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')
    );
  } catch (e) {
    return atob(base64);
  }
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function findPart(payload, mimeType) {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body && payload.body.data) return payload;
  if (payload.parts) {
    for (var i = 0; i < payload.parts.length; i++) {
      var found = findPart(payload.parts[i], mimeType);
      if (found) return found;
    }
  }
  return null;
}

function extractEmailBody(payload) {
  if (!payload) return '';
  var plainPart = findPart(payload, 'text/plain');
  if (plainPart) return decodeBase64Url(plainPart.body.data);
  var htmlPart = findPart(payload, 'text/html');
  if (htmlPart) return stripHtml(decodeBase64Url(htmlPart.body.data));
  return '';
}

// ---------------------------------------------------------------------------
// Claude categorisation
// ---------------------------------------------------------------------------

var EA_SYSTEM_PROMPT = 'You are an email categorisation assistant for a business inbox. ' +
  'For each email, produce a short plain-English summary and assign it to exactly one category.\n\n' +
  'Return a JSON array. Each item must have:\n' +
  '- "index": integer — the email index number from the input\n' +
  '- "summary": string — a 2-3 sentence plain-English summary of the email\n' +
  '- "category": string — must exactly match one of the category IDs provided\n\n' +
  'RULES:\n' +
  '1. Return ONLY a valid JSON array. No preamble, no explanation, no markdown fences.\n' +
  '2. category must exactly match one of the provided category IDs — copy it character-for-character.\n' +
  '3. If an email does not fit any category well, use the "other" category as the fallback.\n' +
  '4. Summary should capture what the email is about and any action required.';

async function categoriseEmails(emails, categories, businessName, industry, userId) {
  if (!emails.length) return [];

  var categoryList = categories
    .filter(function(c) { return c.enabled; })
    .map(function(c) {
      var entry = c.id + ': ' + c.label;
      if (c.description) entry += ' — ' + c.description;
      return entry;
    })
    .join('\n');

  var emailList = emails.map(function(e, i) {
    return '[' + i + '] From: ' + e.sender + ' <' + e.email + '>\nSubject: ' + e.subject + '\nBody: ' + (e.body || '').substring(0, 2000);
  }).join('\n\n');

  var userContent = 'Business: ' + businessName + ' (' + industry + ')\n\nCategory IDs: ' + categoryList + '\n\nEmails:\n' + emailList;

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: EA_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }]
    })
  });

  var data = await response.json();
  console.log('[EA] Claude response status:', response.status, 'has content:', !!(data.content && data.content[0]));
  logAnthropicUsage({ tool_id: 'email', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'ea-summary' });

  if (data.error) {
    console.error('[EA] Claude API error:', JSON.stringify(data.error));
    throw new Error('Claude API error: ' + (data.error.message || JSON.stringify(data.error)));
  }

  var raw = data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    var clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('[EA] Claude JSON parse error:', e.message, 'raw:', raw.substring(0, 500));
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret || (req.headers['x-internal-secret'] || '') !== internalSecret) {
    return res.status(401).json({ error: 'Unauthorised — missing or invalid internal secret' });
  }

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  var { userId, accountEmail, provider, jobId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (!accountEmail) return res.status(400).json({ error: 'accountEmail required' });
  if (!provider) return res.status(400).json({ error: 'provider required' });

  try {
    console.log('[EA] Scan start — userId:', userId, 'provider:', provider, 'account:', accountEmail);

    var profileRes = await supabase
      .from('profiles')
      .select('ea_connected_emails, cl_connected_emails, business_name, industry')
      .eq('id', userId)
      .single();
    if (profileRes.error) return res.status(500).json({ error: 'Could not load profile' });
    var profile = profileRes.data;

    var eaEmails = Array.isArray(profile.ea_connected_emails) ? profile.ea_connected_emails : [];

    // Build a (provider|email) lookup for accounts also connected in the
    // Content Library. When the account being scanned is in this set, EA's
    // CL writeback path skips — the CL email scanner is the authoritative
    // ingestion source for that account, so EA pushing newsletters too
    // would create cross-tool duplicates in content_library.
    //
    // Gmail-side: CL stores entries with provider 'gmail' or 'google';
    // Outlook-side: 'microsoft' or 'outlook'. We normalise both sides to
    // a canonical 'gmail' / 'outlook' key so the lookup works regardless
    // of which historical naming a connection was saved under.
    function canonicalEmailProvider(p) {
      var s = String(p || '').toLowerCase();
      if (s === 'gmail' || s === 'google') return 'gmail';
      if (s === 'microsoft' || s === 'outlook') return 'outlook';
      return s;
    }
    var clConnectedEmails = Array.isArray(profile.cl_connected_emails) ? profile.cl_connected_emails : [];
    var clConnectedKeys = new Set(
      clConnectedEmails
        .filter(function(e) { return e && e.email; })
        .map(function(e) {
          return canonicalEmailProvider(e.provider) + '|' + String(e.email).toLowerCase();
        })
    );
    var scanAccountKey = canonicalEmailProvider(provider) + '|' + String(accountEmail || '').toLowerCase();
    var clWritebackEnabled = !clConnectedKeys.has(scanAccountKey);
    if (!clWritebackEnabled) {
      console.log('[EA] CL writeback disabled — account is also connected in CL email scan:', scanAccountKey);
    }

    var entry = eaEmails.find(function(e) {
      return e && e.email === accountEmail && (
        (provider === 'gmail' && (e.provider === 'gmail' || e.provider === 'google')) ||
        (provider === 'outlook' && (e.provider === 'microsoft' || e.provider === 'outlook'))
      );
    });
    if (!entry || !entry.access_token) {
      return res.status(400).json({ error: 'Account not connected: ' + accountEmail });
    }

    // Load settings for categories
    var settingsRes = await supabase
      .from('email_assistant_settings')
      .select('categories')
      .eq('user_id', userId)
      .maybeSingle();
    var categories = (settingsRes.data && Array.isArray(settingsRes.data.categories) && settingsRes.data.categories.length > 0)
      ? settingsRes.data.categories
      : [
          { id: 'urgent', label: 'Urgent', description: 'Emails requiring immediate attention or a same-day response', enabled: true },
          { id: 'enquiries', label: 'Leads', description: 'New enquiries and expressions of interest from potential customers', enabled: true },
          { id: 'projects', label: 'Projects', description: 'Emails related to active or upcoming work, projects, and jobs', enabled: true },
          { id: 'financial', label: 'Financial', description: 'Invoices, statements, receipts, payments, and financial correspondence', enabled: true },
          { id: 'customers', label: 'Customers', description: 'Correspondence from existing customers including service requests, follow-ups, and feedback', enabled: true },
          { id: 'operations', label: 'Operations', description: 'Supplier, staff, compliance, and general business correspondence', enabled: true },
          { id: 'newsletters', label: 'Newsletters / Marketing', description: 'Promotional emails, newsletters, industry updates, and marketing material', enabled: true },
          { id: 'other', label: 'Other', description: 'Emails that do not clearly fit any other category', enabled: true }
        ];

    var businessName = profile.business_name || 'your business';
    var industry = profile.industry || 'general business';

    // Token refresh
    var accessToken = entry.access_token;
    if (entry.refresh_token) {
      try {
        if (provider === 'gmail') {
          accessToken = await refreshGmailToken(entry.refresh_token);
        } else {
          accessToken = await refreshOutlookToken(entry.refresh_token);
        }
        entry.access_token = accessToken;
        await supabase.from('profiles').update({ ea_connected_emails: eaEmails }).eq('id', userId);
        console.log('[EA] Token refreshed for', accountEmail);
      } catch (refreshErr) {
        console.error('[EA] Token refresh failed:', refreshErr.message);
        return res.status(401).json({ error: 'Token expired. Please reconnect ' + provider + ' in Settings.' });
      }
    }

    // Lookback window
    var lookbackDays = parseInt(entry.lookback_days) || 30;
    console.log('[EA] Lookback:', lookbackDays, 'days');

    // Fetch messages
    var allEmails = [];

    if (provider === 'gmail') {
      var afterTimestamp = Math.floor((Date.now() - lookbackDays * 24 * 60 * 60 * 1000) / 1000);
      var query = 'after:' + afterTimestamp;
      console.log('[EA] Gmail query:', query);

      var messages = [];
      var pageToken = null;
      do {
        var listUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent(query) + '&maxResults=50';
        if (pageToken) listUrl += '&pageToken=' + encodeURIComponent(pageToken);
        var listRes = await fetch(listUrl, { headers: { Authorization: 'Bearer ' + accessToken } });
        if (!listRes.ok) {
          var errBody = await listRes.json().catch(function() { return {}; });
          var errMsg = (errBody.error && errBody.error.message) || ('Gmail API returned ' + listRes.status);
          console.error('[EA] Gmail list error:', listRes.status, errMsg);
          return res.status(502).json({ error: 'Gmail API error: ' + errMsg });
        }
        var listData = await listRes.json();
        if (listData.messages) messages = messages.concat(listData.messages);
        pageToken = listData.nextPageToken || null;
        console.log('[EA] Gmail page — count:', (listData.messages || []).length, 'total:', messages.length, 'hasNext:', !!pageToken);
      } while (pageToken);

      for (var gi = 0; gi < messages.length; gi++) {
        var msgRes = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + messages[gi].id + '?format=full',
          { headers: { Authorization: 'Bearer ' + accessToken } }
        );
        if (!msgRes.ok) { console.error('[EA] Gmail detail error:', messages[gi].id, msgRes.status); continue; }
        var msgData = await msgRes.json();
        var headers = msgData.payload && msgData.payload.headers ? msgData.payload.headers : [];
        var subject = (headers.find(function(h) { return h.name === 'Subject'; }) || {}).value || '(no subject)';
        var fromRaw = (headers.find(function(h) { return h.name === 'From'; }) || {}).value || '';
        var dateVal = (headers.find(function(h) { return h.name === 'Date'; }) || {}).value || '';
        var emailBody = extractEmailBody(msgData.payload);
        if (!emailBody || emailBody.trim().length < 30) { console.log('[EA] Skipped — body too short:', messages[gi].id); continue; }
        var fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) || [];
        allEmails.push({
          id: msgData.id,
          provider: 'gmail',
          sender: fromMatch[2] ? fromMatch[1].replace(/"/g, '').trim() : fromRaw,
          email: fromMatch[2] || fromRaw,
          subject: subject,
          date: dateVal,
          body: emailBody,
          message_url: 'https://mail.google.com/mail/u/0/#inbox/' + msgData.id
        });
      }
    }

    if (provider === 'outlook') {
      var afterDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
      console.log('[EA] Outlook filter: receivedDateTime ge', afterDate);

      var nextLink = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=' + encodeURIComponent('receivedDateTime ge ' + afterDate) + '&$top=50&$select=id,subject,from,receivedDateTime,body,webLink&$orderby=receivedDateTime desc';
      var olMessages = [];
      while (nextLink) {
        var olListRes = await fetch(nextLink, { headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' } });
        if (!olListRes.ok) {
          var olErrBody = await olListRes.json().catch(function() { return {}; });
          var olErrMsg = (olErrBody.error && olErrBody.error.message) || ('Graph API returned ' + olListRes.status);
          console.error('[EA] Outlook list error:', olListRes.status, olErrMsg);
          return res.status(502).json({ error: 'Outlook API error: ' + olErrMsg });
        }
        var olListData = await olListRes.json();
        if (olListData.value) olMessages = olMessages.concat(olListData.value);
        nextLink = olListData['@odata.nextLink'] || null;
        console.log('[EA] Outlook page — count:', (olListData.value || []).length, 'total:', olMessages.length, 'hasNext:', !!nextLink);
      }

      for (var oi = 0; oi < olMessages.length; oi++) {
        var m = olMessages[oi];
        var olBody = m.body && m.body.content ? (m.body.contentType === 'html' ? stripHtml(m.body.content) : m.body.content) : '';
        if (!olBody || olBody.trim().length < 30) continue;
        allEmails.push({
          id: m.id,
          provider: 'outlook',
          sender: (m.from && m.from.emailAddress && m.from.emailAddress.name) || '',
          email: (m.from && m.from.emailAddress && m.from.emailAddress.address) || '',
          subject: m.subject || '(no subject)',
          date: m.receivedDateTime,
          body: olBody,
          message_url: m.webLink || null
        });
      }
    }

    console.log('[EA] Total emails fetched:', allEmails.length);

    // ── Pre-filter — skip emails already stored in email_summaries ────
    if (allEmails.length > 0) {
      var allMsgIds = allEmails.map(function(e) { return e.id; });
      var existingRes = await supabase
        .from('email_summaries')
        .select('message_id')
        .eq('user_id', userId)
        .in('message_id', allMsgIds);
      if (existingRes.error) {
        console.error('[EA] Pre-filter query error:', existingRes.error.message);
      } else if (existingRes.data && existingRes.data.length > 0) {
        var existingIds = new Set();
        existingRes.data.forEach(function(row) { existingIds.add(row.message_id); });
        var beforeCount = allEmails.length;
        allEmails = allEmails.filter(function(e) { return !existingIds.has(e.id); });
        console.log('[EA] Pre-filtered — already in email_summaries:', beforeCount - allEmails.length, 'remaining:', allEmails.length);
      }
    }

    // ── Cursor — resume from previous batch if cursor exists ──────────
    var BATCH_SIZE = 50;
    var cursorData = null;
    var processedIds = [];
    if (jobId) {
      var cursorRes = await supabase.from('cl_scan_cursors').select('*').eq('job_id', jobId).maybeSingle();
      if (cursorRes.data) {
        cursorData = cursorRes.data;
        processedIds = Array.isArray(cursorData.processed_ids) ? cursorData.processed_ids : [];
      }
    }

    // Filter out already-processed emails and take the next batch
    var remaining = allEmails.filter(function(e) { return processedIds.indexOf(e.id) === -1; });
    var batch = remaining.slice(0, BATCH_SIZE);
    var moreAfterBatch = remaining.length > BATCH_SIZE;
    console.log('[EA] Cursor — total:', allEmails.length, 'alreadyProcessed:', processedIds.length, 'remaining:', remaining.length, 'batch:', batch.length, 'morePending:', moreAfterBatch);

    if (!batch.length) {
      if (jobId) await supabase.from('cl_scan_cursors').delete().eq('job_id', jobId);
      return res.status(200).json({ imported: 0, skipped: 0, total: 0, morePending: false });
    }

    // Categorise
    var categorised = await categoriseEmails(batch, categories, businessName, industry, userId);
    console.log('[EA] Categorised:', categorised.length, 'of', batch.length);

    // Build category ID lookup for normalisation
    var catLookup = {};
    categories.forEach(function(c) { if (c.id) catLookup[c.id.toLowerCase()] = c.id; });

    // Store results
    var imported = 0;
    var skipped = 0;
    for (var ri = 0; ri < batch.length; ri++) {
      var email = batch[ri];
      var analysis = categorised.find(function(c) { return c.index === ri; }) || {};
      var rawCat = analysis.category || '';
      var normCat = catLookup[rawCat.toLowerCase()] || rawCat || categories[0].id;

      // Save email body to cl-assets as .txt (mirrors cl-email-scan.js pattern)
      var bodyUrl = null;
      if (email.body) {
        try {
          var emailStoragePath = userId + '/ea-email/' + email.id.substring(0, 80) + '.txt';
          await supabase.storage.from('cl-assets').upload(emailStoragePath, Buffer.from(email.body, 'utf-8'), { contentType: 'text/plain', upsert: false });
          bodyUrl = emailStoragePath;
        } catch (uploadErr) {
          console.error('[EA] cl-assets upload error:', uploadErr.message, 'emailId:', email.id);
        }
      }

      var row = {
        user_id: userId,
        message_id: email.id,
        provider: email.provider,
        sender: email.sender,
        sender_email: email.email,
        subject: email.subject,
        received_at: email.date,
        summary: analysis.summary || '',
        category: normCat,
        message_url: email.message_url,
        handled: false,
        body_url: bodyUrl
      };

      var storeRes = await supabase
        .from('email_summaries')
        .upsert(row, { onConflict: 'user_id,message_id', ignoreDuplicates: true });
      if (storeRes.error) {
        console.error('[EA] Store error:', storeRes.error.message, 'messageId:', email.id);
        skipped++;
      } else {
        imported++;
      }

      // ── CL Tool Outputs push — Newsletter / Marketing emails ──────────
      // Skipped when the same email account is also connected in CL's
      // own email scanner (computed once at scan start as
      // clWritebackEnabled). Avoids cross-tool duplicates in content_library.
      if (normCat === 'newsletters' && email.body && clWritebackEnabled) {
        try {
          var clItems = await runClExtractionPrompt(email.body, email.subject, email.sender + ' <' + email.email + '>', userId);
          if (Array.isArray(clItems) && clItems.length > 0) {
            var clItem = clItems[0];
            var clNormCat = clItem.category ? (CL_CATEGORY_LOOKUP[String(clItem.category).toLowerCase()] || 'Industry News') : 'Industry News';
            var clIsDiscard = CL_DISCARD_CATEGORIES.indexOf(clNormCat) > -1;
            var clStatus = clIsDiscard ? 'archived' : (clItem.disposition === 'discard' ? 'archived' : 'approved');
            var clToolTags = Array.isArray(clItem.tool_tags) ? clItem.tool_tags.filter(function(t) { return CL_ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
            clToolTags = applyCategoryToolMatrix(clNormCat, clToolTags);
            // Pattern B write — also union in the Tool Output Matrix
            // recipients for the email tool so downstream consumers
            // (bi, strategic-plan, news-digest, chatbot, subcontractor-mgmt)
            // get tagged regardless of how the AI categorised the email.
            clToolTags = Array.from(new Set([...clToolTags, ...applyToolOutputMatrix('email')]));
            var clRow = {
              user_id: userId,
              title: String(clItem.title || email.subject || '(no subject)').substring(0, 200),
              content_text: String(clItem.body || ''),
              category: clNormCat,
              tool_tags: clToolTags,
              status: clStatus,
              source: 'tool',
              tool_source: 'email-assistant',
              source_ref: 'ea-newsletter:' + email.id,
              source_detail: { sender: email.sender, sender_email: email.email, subject: email.subject, provider: email.provider, account_email: accountEmail }
            };
            var clRes = await supabase.from('content_library').upsert(clRow, { onConflict: 'source_ref', ignoreDuplicates: true });
            if (clRes.error) {
              console.error('[EA] CL newsletter push error:', clRes.error.message, 'messageId:', email.id);
            } else {
              console.log('[EA] CL newsletter pushed — messageId:', email.id, 'category:', clNormCat, 'status:', clStatus);
            }
          } else {
            console.log('[EA] CL newsletter extraction returned no items — messageId:', email.id);
          }
        } catch (clErr) {
          console.error('[EA] CL newsletter push exception:', clErr.message, 'messageId:', email.id);
        }
      }
    }

    // ── Cursor — save or clean up ──────────────────────────────────────
    var batchProcessedIds = processedIds.concat(batch.map(function(e) { return e.id; }));

    if (moreAfterBatch && jobId) {
      var cursorRow = {
        job_id: jobId,
        user_id: userId,
        processed_ids: batchProcessedIds,
        imported: imported,
        approved: 0,
        pending: 0,
        rejected: 0,
        skipped: skipped,
        auto_archived: 0,
        fin_docs_paired: 0,
        deduped: 0,
        updated_at: new Date().toISOString()
      };
      if (cursorData) {
        await supabase.from('cl_scan_cursors').update(cursorRow).eq('id', cursorData.id);
      } else {
        cursorRow.created_at = new Date().toISOString();
        await supabase.from('cl_scan_cursors').insert(cursorRow);
      }
      console.log('[EA] Batch complete — morePending. Processed so far:', batchProcessedIds.length, 'of', allEmails.length);
      return res.status(200).json({ imported: imported, skipped: skipped, total: batch.length, morePending: true });
    }

    // All emails processed — clean up cursor and write last_scanned_at
    if (jobId) {
      await supabase.from('cl_scan_cursors').delete().eq('job_id', jobId);
    }

    // Update last_scanned_at
    entry.last_scanned_at = new Date().toISOString();
    await supabase.from('profiles').update({ ea_connected_emails: eaEmails }).eq('id', userId);
    console.log('[EA] last_scanned_at updated for', accountEmail);

    console.log('[EA] Scan complete — imported:', imported, 'skipped:', skipped, 'total:', allEmails.length);
    return res.status(200).json({ imported: imported, skipped: skipped, total: allEmails.length, morePending: false });

  } catch (err) {
    console.error('[EA] Scan error:', err.message || err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
