// api/cl-dropbox-callback.js
// OAuth callback for Dropbox — Task 10 CL Connections.
// Redirect URI registered in Dropbox app: https://staxai.com.au/api/cl-dropbox-callback
//
// Multi-account: pushes onto profiles.cl_dropbox_accounts (jsonb array).
// Each entry: { account_email, access_token, refresh_token, connected_at, folders: [] }
// Reconnecting an existing account_email updates tokens in place and
// preserves connected_at and folders.
//
// Dropbox API specifics (different from Microsoft):
// - Token endpoint:  POST https://api.dropboxapi.com/oauth2/token
//                    (form-urlencoded, returns access_token, refresh_token,
//                    expires_in, scope, account_id, uid). A refresh_token is
//                    only returned when the original authorize URL was
//                    requested with token_access_type=offline — that flag is
//                    set by the initiate code in cl-settings-logic.js (Step 7).
// - Account info:    POST https://api.dropboxapi.com/2/users/get_current_account
//                    Authorization: Bearer <access_token>
//                    Empty body, NO Content-Type header (Dropbox RPC convention
//                    for no-arg calls). Returns { account_id, name, email, ... }.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DROPBOX_CLIENT_ID = process.env.DROPBOX_CLIENT_ID;
const DROPBOX_CLIENT_SECRET = process.env.DROPBOX_CLIENT_SECRET;
const REDIRECT_URI = 'https://staxai.com.au/api/cl-dropbox-callback';

function decodeState(state) {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch (e) {
    return { userId: state };
  }
}

function redirectError(res, details) {
  return res.redirect('/cl-settings.html?error=dropbox_failed&details=' + encodeURIComponent(details || 'unknown'));
}

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query || {};

  if (error) {
    console.error('Dropbox OAuth error from provider:', error, error_description);
    return redirectError(res, error_description || error);
  }

  if (!code) {
    console.error('Dropbox callback hit with no code');
    return redirectError(res, 'no_code');
  }

  const stateObj = decodeState(state);
  const userId = stateObj.userId || (typeof state === 'string' ? state : null);
  if (!userId) {
    console.error('Dropbox callback could not resolve userId from state');
    return redirectError(res, 'no_user');
  }

  if (!DROPBOX_CLIENT_ID || !DROPBOX_CLIENT_SECRET) {
    console.error('Dropbox callback: Dropbox credentials not configured');
    return redirectError(res, 'not_configured');
  }

  try {
    // 1. Exchange code for tokens (Dropbox OAuth2 token endpoint)
    const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        grant_type: 'authorization_code',
        client_id: DROPBOX_CLIENT_ID,
        client_secret: DROPBOX_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('Dropbox token exchange failed:', tokenData.error, tokenData.error_description);
      return redirectError(res, tokenData.error_description || tokenData.error || 'token_exchange_failed');
    }

    // 2. Fetch the Dropbox account email — used as the unique key per entry.
    // Dropbox RPC convention: POST with Authorization header, empty body,
    // and NO Content-Type header for no-arg calls.
    let accountEmail = null;
    try {
      const accountRes = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tokenData.access_token },
      });
      const accountData = await accountRes.json();
      accountEmail = accountData.email || null;
    } catch (accountErr) {
      console.error('Dropbox get_current_account lookup failed:', accountErr && accountErr.message);
    }

    if (!accountEmail) {
      console.error('Dropbox callback: could not determine account email from get_current_account');
      return redirectError(res, 'no_account_email');
    }

    // 3. Read existing cl_dropbox_accounts array
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const profileRes = await supabase
      .from('profiles')
      .select('cl_dropbox_accounts')
      .eq('id', userId)
      .maybeSingle();

    if (profileRes.error) {
      console.error('Dropbox callback: profile read failed:', profileRes.error.message);
      return redirectError(res, profileRes.error.message);
    }

    const currentAccounts = Array.isArray(profileRes.data && profileRes.data.cl_dropbox_accounts)
      ? profileRes.data.cl_dropbox_accounts
      : [];

    // 4. Update existing entry in place or push a new one
    const existingIdx = currentAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
    if (existingIdx > -1) {
      currentAccounts[existingIdx].access_token = tokenData.access_token;
      if (tokenData.refresh_token) {
        currentAccounts[existingIdx].refresh_token = tokenData.refresh_token;
      }
      // connected_at and folders preserved as-is
    } else {
      var entry = {
        account_email: accountEmail,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        connected_at: new Date().toISOString(),
        folders: [],
      };
      currentAccounts.push(entry);
    }

    // 5. Write the array back
    const updateRes = await supabase
      .from('profiles')
      .update({ cl_dropbox_accounts: currentAccounts })
      .eq('id', userId);

    if (updateRes.error) {
      console.error('Dropbox profile update failed:', updateRes.error.message);
      return redirectError(res, updateRes.error.message);
    }

    return res.redirect('/cl-settings.html?connected=dropbox');
  } catch (err) {
    console.error('Dropbox callback exception:', err && err.message ? err.message : err);
    return redirectError(res, (err && err.message) || 'exception');
  }
}
