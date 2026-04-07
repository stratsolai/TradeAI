// api/cl-onedrive-callback.js
// OAuth callback for OneDrive — Task 10 CL Connections.
// Redirect URI registered in Azure: https://staxai.com.au/api/cl-onedrive-callback
//
// Multi-account: pushes onto profiles.cl_onedrive_accounts (jsonb array).
// Each entry: { account_email, access_token, refresh_token, connected_at, folders: [] }
// Reconnecting an existing account_email updates tokens in place and
// preserves connected_at and folders.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const REDIRECT_URI = 'https://staxai.com.au/api/cl-onedrive-callback';
const SCOPES = 'Files.Read.All offline_access User.Read';

function decodeState(state) {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch (e) {
    return { userId: state };
  }
}

function redirectError(res, details) {
  return res.redirect('/cl-settings.html?error=onedrive_failed&details=' + encodeURIComponent(details || 'unknown'));
}

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query || {};

  if (error) {
    console.error('OneDrive OAuth error from provider:', error, error_description);
    return redirectError(res, error_description || error);
  }

  if (!code) {
    console.error('OneDrive callback hit with no code');
    return redirectError(res, 'no_code');
  }

  const stateObj = decodeState(state);
  const userId = stateObj.userId || (typeof state === 'string' ? state : null);
  if (!userId) {
    console.error('OneDrive callback could not resolve userId from state');
    return redirectError(res, 'no_user');
  }

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    console.error('OneDrive callback: Microsoft credentials not configured');
    return redirectError(res, 'not_configured');
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: SCOPES,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('OneDrive token exchange failed:', tokenData.error, tokenData.error_description);
      return redirectError(res, tokenData.error_description || tokenData.error || 'token_exchange_failed');
    }

    // 2. Fetch the Microsoft account email — used as the unique key per entry
    let accountEmail = null;
    try {
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { 'Authorization': 'Bearer ' + tokenData.access_token },
      });
      const meData = await meRes.json();
      accountEmail = meData.mail || meData.userPrincipalName || null;
    } catch (meErr) {
      console.error('OneDrive /me lookup failed:', meErr && meErr.message);
    }

    if (!accountEmail) {
      console.error('OneDrive callback: could not determine account email from /me');
      return redirectError(res, 'no_account_email');
    }

    // 3. Read existing cl_onedrive_accounts array
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const profileRes = await supabase
      .from('profiles')
      .select('cl_onedrive_accounts')
      .eq('id', userId)
      .maybeSingle();

    if (profileRes.error) {
      console.error('OneDrive callback: profile read failed:', profileRes.error.message);
      return redirectError(res, profileRes.error.message);
    }

    const currentAccounts = Array.isArray(profileRes.data && profileRes.data.cl_onedrive_accounts)
      ? profileRes.data.cl_onedrive_accounts
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
      .update({ cl_onedrive_accounts: currentAccounts })
      .eq('id', userId);

    if (updateRes.error) {
      console.error('OneDrive profile update failed:', updateRes.error.message);
      return redirectError(res, updateRes.error.message);
    }

    return res.redirect('/cl-settings.html?connected=onedrive');
  } catch (err) {
    console.error('OneDrive callback exception:', err && err.message ? err.message : err);
    return redirectError(res, (err && err.message) || 'exception');
  }
}
