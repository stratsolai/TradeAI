// api/cl-servicem8-callback.js
// OAuth callback for ServiceM8 — Task 13 Tool Connections.
// Redirect URI registered in ServiceM8: https://staxai.com.au/api/cl-servicem8-callback
//
// Multi-account: pushes onto profiles.cl_servicem8_accounts (jsonb array).
// Each entry: { account_email, access_token, refresh_token, connected_at }
// Reconnecting an existing account_email updates tokens in place and
// preserves connected_at.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SERVICEM8_CLIENT_ID = process.env.SERVICEM8_CLIENT_ID;
const SERVICEM8_CLIENT_SECRET = process.env.SERVICEM8_CLIENT_SECRET;
const REDIRECT_URI = 'https://staxai.com.au/api/cl-servicem8-callback';

function decodeState(state) {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch (e) {
    return { userId: state };
  }
}

function redirectError(res, details) {
  return res.redirect('/cl-settings.html?error=servicem8_failed&details=' + encodeURIComponent(details || 'unknown') + '&tab=tool-connections');
}

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query || {};

  if (error) {
    console.error('ServiceM8 OAuth error from provider:', error, error_description);
    return redirectError(res, error_description || error);
  }

  if (!code) {
    console.error('ServiceM8 callback hit with no code');
    return redirectError(res, 'no_code');
  }

  const stateObj = decodeState(state);
  const userId = stateObj.userId || (typeof state === 'string' ? state : null);
  if (!userId) {
    console.error('ServiceM8 callback could not resolve userId from state');
    return redirectError(res, 'no_user');
  }

  if (!SERVICEM8_CLIENT_ID || !SERVICEM8_CLIENT_SECRET) {
    console.error('ServiceM8 callback: ServiceM8 credentials not configured');
    return redirectError(res, 'not_configured');
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch('https://go.servicem8.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SERVICEM8_CLIENT_ID,
        client_secret: SERVICEM8_CLIENT_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('ServiceM8 token exchange failed:', tokenData.error, tokenData.error_description);
      return redirectError(res, tokenData.error_description || tokenData.error || 'token_exchange_failed');
    }

    // 2. Fetch account email from company endpoint
    let accountEmail = null;
    try {
      const companyRes = await fetch('https://api.servicem8.com/api_1.0/company.json', {
        headers: { 'Authorization': 'Bearer ' + tokenData.access_token },
      });
      const companyData = await companyRes.json();
      // ServiceM8 company.json returns an array — take the first entry
      if (Array.isArray(companyData) && companyData.length > 0) {
        accountEmail = companyData[0].email || companyData[0].name || null;
      } else if (companyData && companyData.email) {
        accountEmail = companyData.email;
      }
    } catch (companyErr) {
      console.error('ServiceM8 company lookup failed:', companyErr && companyErr.message);
    }

    if (!accountEmail) {
      console.error('ServiceM8 callback: could not determine account email from company endpoint');
      return redirectError(res, 'no_account_email');
    }

    // 3. Read existing cl_servicem8_accounts array
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const profileRes = await supabase
      .from('profiles')
      .select('cl_servicem8_accounts')
      .eq('id', userId)
      .maybeSingle();

    if (profileRes.error) {
      console.error('ServiceM8 callback: profile read failed:', profileRes.error.message);
      return redirectError(res, profileRes.error.message);
    }

    const currentAccounts = Array.isArray(profileRes.data && profileRes.data.cl_servicem8_accounts)
      ? profileRes.data.cl_servicem8_accounts
      : [];

    // 4. Update existing entry in place or push a new one
    const existingIdx = currentAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
    if (existingIdx > -1) {
      currentAccounts[existingIdx].access_token = tokenData.access_token;
      if (tokenData.refresh_token) {
        currentAccounts[existingIdx].refresh_token = tokenData.refresh_token;
      }
      // connected_at preserved as-is
    } else {
      var entry = {
        account_email: accountEmail,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        connected_at: new Date().toISOString(),
      };
      currentAccounts.push(entry);
    }

    // 5. Write the array back
    const updateRes = await supabase
      .from('profiles')
      .update({ cl_servicem8_accounts: currentAccounts })
      .eq('id', userId);

    if (updateRes.error) {
      console.error('ServiceM8 profile update failed:', updateRes.error.message);
      return redirectError(res, updateRes.error.message);
    }

    return res.redirect('/cl-settings.html?connected=servicem8&tab=tool-connections');
  } catch (err) {
    console.error('ServiceM8 callback exception:', err && err.message ? err.message : err);
    return redirectError(res, (err && err.message) || 'exception');
  }
}
