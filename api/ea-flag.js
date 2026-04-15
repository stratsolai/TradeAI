// api/ea-flag.js — Email Assistant flag toggle
// Sets is_flagged on an email_summaries row and performs best-effort
// write-back to Gmail (STARRED label) or Outlook (flag.flagStatus).
// Write-back failure does not block the UI or return an error.
//
// Auth: JWT Bearer token required.
//
// Request body:
//   messageId  — required, the email_summaries row id
//   provider   — required, 'gmail' or 'outlook'
//   flagState  — required, boolean true or false
//
// Response: { success: true }

export const config = { maxDuration: 30 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

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
  if (!data.access_token) throw new Error('Gmail token refresh failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function refreshOutlookToken(refreshToken) {
  var params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read offline_access'
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── JWT auth ──────────────────────────────────────────────
  var authHeader = req.headers['authorization'] || '';
  var token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised' });

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  var authRes = await supabase.auth.getUser(token);
  if (authRes.error || !authRes.data || !authRes.data.user) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  var userId = authRes.data.user.id;

  // ── Parse request ─────────────────────────────────────────
  var body = req.body || {};
  var messageId = body.messageId;
  var provider = body.provider;
  var flagState = body.flagState;

  if (!messageId) return res.status(400).json({ error: 'messageId required' });
  if (!provider || (provider !== 'gmail' && provider !== 'outlook')) {
    return res.status(400).json({ error: 'provider must be gmail or outlook' });
  }
  if (typeof flagState !== 'boolean') {
    return res.status(400).json({ error: 'flagState must be a boolean' });
  }

  // ── Update Supabase ───────────────────────────────────────
  var updateRes = await supabase
    .from('email_summaries')
    .update({ is_flagged: flagState })
    .eq('id', messageId)
    .eq('user_id', userId);

  if (updateRes.error) {
    console.error('[ea-flag] Supabase update error:', updateRes.error.message);
    return res.status(500).json({ error: 'Could not update flag' });
  }

  // ── Best-effort provider write-back ───────────────────────
  try {
    // Load the email row to get the external message_id
    var emailRes = await supabase
      .from('email_summaries')
      .select('message_id, provider')
      .eq('id', messageId)
      .eq('user_id', userId)
      .single();

    console.log('[ea-flag] Email row lookup — found:', !!emailRes.data, 'message_id:', emailRes.data ? emailRes.data.message_id : 'N/A', 'error:', emailRes.error ? emailRes.error.message : 'none');

    if (!emailRes.data || !emailRes.data.message_id) {
      console.log('[ea-flag] No external message_id — skipping write-back');
      return res.status(200).json({ success: true });
    }

    var externalMsgId = emailRes.data.message_id;
    console.log('[ea-flag] External message ID:', externalMsgId.substring(0, 40));

    // Load OAuth token from ea_connected_emails
    var profileRes = await supabase
      .from('profiles')
      .select('ea_connected_emails')
      .eq('id', userId)
      .single();

    var accounts = (profileRes.data && Array.isArray(profileRes.data.ea_connected_emails))
      ? profileRes.data.ea_connected_emails : [];

    console.log('[ea-flag] EA accounts loaded — count:', accounts.length, 'providers:', accounts.map(function(a) { return a ? a.provider : 'null'; }).join(', '));

    // Find matching account by provider
    var providerMatch = provider === 'gmail' ? ['gmail', 'google'] : ['microsoft', 'outlook'];
    var account = accounts.find(function(a) {
      return a && providerMatch.indexOf(a.provider) > -1;
    });

    console.log('[ea-flag] Account match — found:', !!account, 'hasAccessToken:', !!(account && account.access_token), 'hasRefreshToken:', !!(account && account.refresh_token));

    if (!account || !account.access_token) {
      console.log('[ea-flag] No account or no access token — skipping write-back');
      return res.status(200).json({ success: true });
    }

    // Refresh token before write-back — stored access tokens expire after ~1 hour
    var accessToken = account.access_token;
    if (account.refresh_token) {
      try {
        if (provider === 'gmail') {
          accessToken = await refreshGmailToken(account.refresh_token);
        } else {
          accessToken = await refreshOutlookToken(account.refresh_token);
        }
        account.access_token = accessToken;
        await supabase.from('profiles').update({ ea_connected_emails: accounts }).eq('id', userId);
        console.log('[ea-flag] Token refreshed for', provider);
      } catch (refreshErr) {
        console.error('[ea-flag] Token refresh failed:', refreshErr.message);
      }
    }

    if (provider === 'gmail') {
      // Gmail: add or remove STARRED label
      var gmailUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(externalMsgId) + '/modify';
      var gmailBody = flagState
        ? { addLabelIds: ['STARRED'] }
        : { removeLabelIds: ['STARRED'] };

      console.log('[ea-flag] Gmail write-back — url:', gmailUrl, 'body:', JSON.stringify(gmailBody));
      var gmailResp = await fetch(gmailUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(gmailBody)
      });
      console.log('[ea-flag] Gmail write-back response — status:', gmailResp.status, 'ok:', gmailResp.ok);
      if (!gmailResp.ok) {
        var gmailErr = await gmailResp.text().catch(function() { return ''; });
        console.error('[ea-flag] Gmail write-back failed:', gmailResp.status, gmailErr.substring(0, 500));
      }
    } else {
      // Outlook: set flag.flagStatus
      var outlookUrl = 'https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(externalMsgId);
      var outlookBody = {
        flag: { flagStatus: flagState ? 'flagged' : 'notFlagged' }
      };

      console.log('[ea-flag] Outlook write-back — url:', outlookUrl.substring(0, 80), 'body:', JSON.stringify(outlookBody));
      var outlookResp = await fetch(outlookUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(outlookBody)
      });
      console.log('[ea-flag] Outlook write-back response — status:', outlookResp.status, 'ok:', outlookResp.ok);
      if (!outlookResp.ok) {
        var outlookErr = await outlookResp.text().catch(function() { return ''; });
        console.error('[ea-flag] Outlook write-back failed:', outlookResp.status, outlookErr.substring(0, 500));
      }
    }
  } catch (writebackErr) {
    // Best-effort: log but do not fail
    console.error('[ea-flag] Write-back error:', writebackErr.message);
  }

  return res.status(200).json({ success: true });
}
