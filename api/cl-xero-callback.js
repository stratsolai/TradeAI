// api/cl-xero-callback.js
// OAuth callback for Xero — Task 13 Tool Connections.
// Redirect URI registered in Xero: https://staxai.com.au/api/cl-xero-callback
//
// Multi-account: pushes onto profiles.cl_xero_accounts (jsonb array).
// Each entry: { account_name, tenant_id, access_token, refresh_token, connected_at }
// Reconnecting an existing tenant_id updates tokens in place and
// preserves connected_at.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const REDIRECT_URI = 'https://staxai.com.au/api/cl-xero-callback';

function decodeState(state) {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch (e) {
    return { userId: state };
  }
}

function redirectError(res, details) {
  return res.redirect('/cl-settings.html?error=xero_failed&details=' + encodeURIComponent(details || 'unknown') + '&tab=tool-connections');
}

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query || {};

  if (error) {
    console.error('Xero OAuth error from provider:', error, error_description);
    return redirectError(res, error_description || error);
  }

  if (!code) {
    console.error('Xero callback hit with no code');
    return redirectError(res, 'no_code');
  }

  const stateObj = decodeState(state);
  const userId = stateObj.userId || (typeof state === 'string' ? state : null);
  if (!userId) {
    console.error('Xero callback could not resolve userId from state');
    return redirectError(res, 'no_user');
  }

  if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET) {
    console.error('Xero callback: Xero credentials not configured');
    return redirectError(res, 'not_configured');
  }

  try {
    // 1. Exchange code for tokens
    const basicAuth = Buffer.from(XERO_CLIENT_ID + ':' + XERO_CLIENT_SECRET).toString('base64');
    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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
      console.error('Xero token exchange failed:', tokenData.error, tokenData.error_description);
      return redirectError(res, tokenData.error_description || tokenData.error || 'token_exchange_failed');
    }

    // 2. Fetch Xero connections to get tenant name and tenant_id.
    // The Xero connections endpoint requires Content-Type: application/json
    // even for GET requests — without it the API may return an error page
    // or an unexpected response shape.
    let tenantId = null;
    let accountName = null;
    try {
      const connRes = await fetch('https://api.xero.com/connections', {
        headers: {
          'Authorization': 'Bearer ' + tokenData.access_token,
          'Content-Type': 'application/json',
        },
      });
      if (!connRes.ok) {
        console.error('Xero connections API returned HTTP', connRes.status, connRes.statusText);
        const errBody = await connRes.text();
        console.error('Xero connections response body:', errBody.substring(0, 500));
        return redirectError(res, 'connections_api_' + connRes.status);
      }
      const connections = await connRes.json();
      if (!Array.isArray(connections)) {
        console.error('Xero connections response is not an array:', JSON.stringify(connections).substring(0, 500));
        return redirectError(res, 'connections_unexpected_shape');
      }
      if (connections.length > 0) {
        var org = connections.find(function (c) { return c.tenantType === 'ORGANISATION'; }) || connections[0];
        tenantId = org.tenantId || null;
        accountName = org.tenantName || null;
      }
    } catch (connErr) {
      console.error('Xero connections lookup failed:', connErr && connErr.message);
    }

    // If the connections array is empty (no organisation connected to
    // the Xero account yet), save the connection with a placeholder
    // tenant_id derived from the id_token sub claim. A real tenant_id
    // will be available once an organisation is connected in Xero.
    if (!tenantId) {
      var sub = null;
      if (tokenData.id_token) {
        try {
          var payload = tokenData.id_token.split('.')[1];
          var decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
          sub = decoded.sub || null;
        } catch (decodeErr) {
          console.error('Xero id_token decode failed:', decodeErr && decodeErr.message);
        }
      }
      tenantId = sub || ('xero-pending-' + Date.now());
      accountName = 'Xero Account';
      console.log('Xero callback: no tenants found, using placeholder tenant_id:', tenantId);
    }

    // 3. Read existing cl_xero_accounts array
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const profileRes = await supabase
      .from('profiles')
      .select('cl_xero_accounts')
      .eq('id', userId)
      .maybeSingle();

    if (profileRes.error) {
      console.error('Xero callback: profile read failed:', profileRes.error.message);
      return redirectError(res, profileRes.error.message);
    }

    const currentAccounts = Array.isArray(profileRes.data && profileRes.data.cl_xero_accounts)
      ? profileRes.data.cl_xero_accounts
      : [];

    // 4. Update existing entry in place or push a new one
    const existingIdx = currentAccounts.findIndex(function (a) { return a && a.tenant_id === tenantId; });
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
        account_name: accountName || 'Xero Organisation',
        tenant_id: tenantId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        connected_at: new Date().toISOString(),
      };
      currentAccounts.push(entry);
    }

    // 5. Write the array back
    const updateRes = await supabase
      .from('profiles')
      .update({ cl_xero_accounts: currentAccounts })
      .eq('id', userId);

    if (updateRes.error) {
      console.error('Xero profile update failed:', updateRes.error.message);
      return redirectError(res, updateRes.error.message);
    }

    return res.redirect('/cl-settings.html?connected=xero&tab=tool-connections');
  } catch (err) {
    console.error('Xero callback exception:', err && err.message ? err.message : err);
    return redirectError(res, (err && err.message) || 'exception');
  }
}
