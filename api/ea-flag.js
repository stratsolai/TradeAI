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

    if (!emailRes.data || !emailRes.data.message_id) {
      // Cannot write back without external message id
      return res.status(200).json({ success: true });
    }

    var externalMsgId = emailRes.data.message_id;

    // Load OAuth token from ea_connected_emails
    var profileRes = await supabase
      .from('profiles')
      .select('ea_connected_emails')
      .eq('id', userId)
      .single();

    var accounts = (profileRes.data && Array.isArray(profileRes.data.ea_connected_emails))
      ? profileRes.data.ea_connected_emails : [];

    // Find matching account by provider
    var providerMatch = provider === 'gmail' ? ['gmail', 'google'] : ['microsoft', 'outlook'];
    var account = accounts.find(function(a) {
      return a && providerMatch.indexOf(a.provider) > -1;
    });

    if (!account || !account.access_token) {
      return res.status(200).json({ success: true });
    }

    if (provider === 'gmail') {
      // Gmail: add or remove STARRED label
      var gmailUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(externalMsgId) + '/modify';
      var gmailBody = flagState
        ? { addLabelIds: ['STARRED'] }
        : { removeLabelIds: ['STARRED'] };

      await fetch(gmailUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + account.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(gmailBody)
      });
    } else {
      // Outlook: set flag.flagStatus
      var outlookUrl = 'https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(externalMsgId);
      var outlookBody = {
        flag: { flagStatus: flagState ? 'flagged' : 'notFlagged' }
      };

      await fetch(outlookUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + account.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(outlookBody)
      });
    }
  } catch (writebackErr) {
    // Best-effort: log but do not fail
    console.error('[ea-flag] Write-back error:', writebackErr.message);
  }

  return res.status(200).json({ success: true });
}
