// api/cl-fergus-callback.js
// OAuth callback for Fergus — Task 13 Tool Connections.
// Redirect URI registered in Fergus: https://staxai.com.au/api/cl-fergus-callback
//
// Multi-account: pushes onto profiles.cl_fergus_accounts (jsonb array).
// Each entry: { account_name, access_token, refresh_token, connected_at }
// Reconnecting an existing account_name updates tokens in place and
// preserves connected_at.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FERGUS_CLIENT_ID = process.env.FERGUS_CLIENT_ID;
const FERGUS_CLIENT_SECRET = process.env.FERGUS_CLIENT_SECRET;
const REDIRECT_URI = 'https://staxai.com.au/api/cl-fergus-callback';

function decodeState(state) {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch (e) {
    return { userId: state };
  }
}

function redirectError(res, details) {
  return res.redirect('/cl-settings.html?error=fergus_failed&details=' + encodeURIComponent(details || 'unknown') + '&tab=tool-connections');
}

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query || {};

  if (error) {
    console.error('Fergus OAuth error from provider:', error, error_description);
    return redirectError(res, error_description || error);
  }

  if (!code) {
    console.error('Fergus callback hit with no code');
    return redirectError(res, 'no_code');
  }

  const stateObj = decodeState(state);
  const userId = stateObj.userId || (typeof state === 'string' ? state : null);
  if (!userId) {
    console.error('Fergus callback could not resolve userId from state');
    return redirectError(res, 'no_user');
  }

  if (!FERGUS_CLIENT_ID || !FERGUS_CLIENT_SECRET) {
    console.error('Fergus callback: Fergus credentials not configured');
    return redirectError(res, 'not_configured');
  }

  try {
    const tokenRes = await fetch('https://app.fergus.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: FERGUS_CLIENT_ID,
        client_secret: FERGUS_CLIENT_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('Fergus token exchange failed:', tokenData.error, tokenData.error_description);
      return redirectError(res, tokenData.error_description || tokenData.error || 'token_exchange_failed');
    }

    let accountName = null;
    try {
      const profileRes = await fetch('https://app.fergus.com/api/v2/users/me', {
        headers: { 'Authorization': 'Bearer ' + tokenData.access_token },
      });
      const profileData = await profileRes.json();
      if (profileData && profileData.data) {
        accountName = profileData.data.company_name || profileData.data.email || profileData.data.name || null;
      } else if (profileData && (profileData.company_name || profileData.email)) {
        accountName = profileData.company_name || profileData.email;
      }
    } catch (profileErr) {
      console.error('Fergus profile lookup failed:', profileErr && profileErr.message);
    }

    if (!accountName) {
      accountName = 'Fergus Account';
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const profileResult = await supabase
      .from('profiles')
      .select('cl_fergus_accounts')
      .eq('id', userId)
      .maybeSingle();

    if (profileResult.error) {
      console.error('Fergus callback: profile read failed:', profileResult.error.message);
      return redirectError(res, profileResult.error.message);
    }

    const currentAccounts = Array.isArray(profileResult.data && profileResult.data.cl_fergus_accounts)
      ? profileResult.data.cl_fergus_accounts
      : [];

    const existingIdx = currentAccounts.findIndex(function (a) { return a && a.account_name === accountName; });
    if (existingIdx > -1) {
      currentAccounts[existingIdx].access_token = tokenData.access_token;
      if (tokenData.refresh_token) {
        currentAccounts[existingIdx].refresh_token = tokenData.refresh_token;
      }
    } else {
      var entry = {
        account_name: accountName,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        connected_at: new Date().toISOString(),
      };
      currentAccounts.push(entry);
    }

    const updateRes = await supabase
      .from('profiles')
      .update({ cl_fergus_accounts: currentAccounts })
      .eq('id', userId);

    if (updateRes.error) {
      console.error('Fergus profile update failed:', updateRes.error.message);
      return redirectError(res, updateRes.error.message);
    }

    return res.redirect('/cl-settings.html?connected=fergus&tab=tool-connections');
  } catch (err) {
    console.error('Fergus callback exception:', err && err.message ? err.message : err);
    return redirectError(res, (err && err.message) || 'exception');
  }
}
