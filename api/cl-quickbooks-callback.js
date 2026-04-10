// api/cl-quickbooks-callback.js
// OAuth callback for QuickBooks — Task 13 Tool Connections.
// Redirect URI registered in Intuit: https://staxai.com.au/api/cl-quickbooks-callback
//
// Multi-account: pushes onto profiles.cl_quickbooks_accounts (jsonb array).
// Each entry: { account_name, realm_id, access_token, refresh_token, connected_at }
// Reconnecting an existing realm_id updates tokens in place and
// preserves connected_at.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const QUICKBOOKS_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID;
const QUICKBOOKS_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;
const REDIRECT_URI = 'https://staxai.com.au/api/cl-quickbooks-callback';

function decodeState(state) {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch (e) {
    return { userId: state };
  }
}

function redirectError(res, details) {
  return res.redirect('/cl-settings.html?error=quickbooks_failed&details=' + encodeURIComponent(details || 'unknown') + '&tab=tool-connections');
}

export default async function handler(req, res) {
  const { code, state, error, error_description, realmId } = req.query || {};

  if (error) {
    console.error('QuickBooks OAuth error from provider:', error, error_description);
    return redirectError(res, error_description || error);
  }

  if (!code) {
    console.error('QuickBooks callback hit with no code');
    return redirectError(res, 'no_code');
  }

  const stateObj = decodeState(state);
  const userId = stateObj.userId || (typeof state === 'string' ? state : null);
  if (!userId) {
    console.error('QuickBooks callback could not resolve userId from state');
    return redirectError(res, 'no_user');
  }

  if (!realmId) {
    console.error('QuickBooks callback: no realmId in query');
    return redirectError(res, 'no_realm');
  }

  if (!QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_CLIENT_SECRET) {
    console.error('QuickBooks callback: QuickBooks credentials not configured');
    return redirectError(res, 'not_configured');
  }

  try {
    // 1. Exchange code for tokens
    const basicAuth = Buffer.from(QUICKBOOKS_CLIENT_ID + ':' + QUICKBOOKS_CLIENT_SECRET).toString('base64');
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': 'Basic ' + basicAuth,
      },
      body: new URLSearchParams({
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('QuickBooks token exchange failed:', tokenData.error, tokenData.error_description);
      return redirectError(res, tokenData.error_description || tokenData.error || 'token_exchange_failed');
    }

    // 2. Fetch company name from CompanyInfo endpoint
    let accountName = null;
    try {
      const companyRes = await fetch(
        'https://quickbooks.api.intuit.com/v3/company/' + realmId + '/companyinfo/' + realmId,
        {
          headers: {
            'Authorization': 'Bearer ' + tokenData.access_token,
            'Accept': 'application/json',
          },
        }
      );
      const companyData = await companyRes.json();
      if (companyData.CompanyInfo) {
        accountName = companyData.CompanyInfo.CompanyName || null;
      }
    } catch (companyErr) {
      console.error('QuickBooks CompanyInfo lookup failed:', companyErr && companyErr.message);
    }

    // 3. Read existing cl_quickbooks_accounts array
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const profileRes = await supabase
      .from('profiles')
      .select('cl_quickbooks_accounts')
      .eq('id', userId)
      .maybeSingle();

    if (profileRes.error) {
      console.error('QuickBooks callback: profile read failed:', profileRes.error.message);
      return redirectError(res, profileRes.error.message);
    }

    const currentAccounts = Array.isArray(profileRes.data && profileRes.data.cl_quickbooks_accounts)
      ? profileRes.data.cl_quickbooks_accounts
      : [];

    // 4. Update existing entry in place or push a new one
    const existingIdx = currentAccounts.findIndex(function (a) { return a && a.realm_id === realmId; });
    if (existingIdx > -1) {
      currentAccounts[existingIdx].access_token = tokenData.access_token;
      if (tokenData.refresh_token) {
        currentAccounts[existingIdx].refresh_token = tokenData.refresh_token;
      }
      if (accountName) {
        currentAccounts[existingIdx].account_name = accountName;
      }
      // connected_at preserved as-is
    } else {
      var entry = {
        account_name: accountName || 'QuickBooks Company',
        realm_id: realmId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        connected_at: new Date().toISOString(),
      };
      currentAccounts.push(entry);
    }

    // 5. Write the array back
    const updateRes = await supabase
      .from('profiles')
      .update({ cl_quickbooks_accounts: currentAccounts })
      .eq('id', userId);

    if (updateRes.error) {
      console.error('QuickBooks profile update failed:', updateRes.error.message);
      return redirectError(res, updateRes.error.message);
    }

    return res.redirect('/cl-settings.html?connected=quickbooks&tab=tool-connections');
  } catch (err) {
    console.error('QuickBooks callback exception:', err && err.message ? err.message : err);
    return redirectError(res, (err && err.message) || 'exception');
  }
}
