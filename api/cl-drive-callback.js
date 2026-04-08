// api/cl-drive-callback.js
// OAuth callback for Google Drive — Task 10 CL Connections.
// Redirect URI registered in Google Cloud: https://staxai.com.au/api/cl-drive-callback
//
// Multi-account: pushes onto profiles.cl_drive_accounts (jsonb array).
// Each entry: { account_email, access_token, refresh_token, connected_at, folders: [] }
// Reconnecting an existing account_email updates tokens in place and
// preserves connected_at and folders.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'https://staxai.com.au/api/cl-drive-callback';

function decodeState(state) {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch (e) {
    return { userId: state };
  }
}

function redirectError(res, details) {
  return res.redirect('/cl-settings.html?error=drive_failed&details=' + encodeURIComponent(details || 'unknown'));
}

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query || {};

  if (error) {
    console.error('Google Drive OAuth error from provider:', error, error_description);
    return redirectError(res, error_description || error);
  }

  if (!code) {
    console.error('Google Drive callback hit with no code');
    return redirectError(res, 'no_code');
  }

  const stateObj = decodeState(state);
  const userId = stateObj.userId || (typeof state === 'string' ? state : null);
  if (!userId) {
    console.error('Google Drive callback could not resolve userId from state');
    return redirectError(res, 'no_user');
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Google Drive callback: Google credentials not configured');
    return redirectError(res, 'not_configured');
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('Google Drive token exchange failed:', tokenData.error, tokenData.error_description);
      return redirectError(res, tokenData.error_description || tokenData.error || 'token_exchange_failed');
    }

    // 2. Fetch the Google account email — used as the unique key per entry
    let accountEmail = null;
    try {
      const meRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': 'Bearer ' + tokenData.access_token },
      });
      const userInfo = await meRes.json();
      accountEmail = userInfo.email || null;
    } catch (meErr) {
      console.error('Google Drive userinfo lookup failed:', meErr && meErr.message);
    }

    if (!accountEmail) {
      console.error('Google Drive callback: could not determine account email from userinfo');
      return redirectError(res, 'no_account_email');
    }

    // 3. Read existing cl_drive_accounts array
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const profileRes = await supabase
      .from('profiles')
      .select('cl_drive_accounts')
      .eq('id', userId)
      .maybeSingle();

    if (profileRes.error) {
      console.error('Google Drive callback: profile read failed:', profileRes.error.message);
      return redirectError(res, profileRes.error.message);
    }

    const currentAccounts = Array.isArray(profileRes.data && profileRes.data.cl_drive_accounts)
      ? profileRes.data.cl_drive_accounts
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
      .update({ cl_drive_accounts: currentAccounts })
      .eq('id', userId);

    if (updateRes.error) {
      console.error('Google Drive profile update failed:', updateRes.error.message);
      return redirectError(res, updateRes.error.message);
    }

    return res.redirect('/cl-settings.html?connected=google-drive');
  } catch (err) {
    console.error('Google Drive callback exception:', err && err.message ? err.message : err);
    return redirectError(res, (err && err.message) || 'exception');
  }
}
