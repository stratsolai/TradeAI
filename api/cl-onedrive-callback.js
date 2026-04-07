// api/cl-onedrive-callback.js
// OAuth callback for OneDrive — Task 10 CL Connections.
// Redirect URI registered in Azure: https://staxai.com.au/api/cl-onedrive-callback
// Exchanges the authorisation code for tokens and writes them to profiles
// for the user identified in the state parameter.

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const updatePayload = {
      cl_onedrive_connected: true,
      cl_onedrive_access_token: tokenData.access_token,
    };
    if (tokenData.refresh_token) {
      updatePayload.cl_onedrive_refresh_token = tokenData.refresh_token;
    }

    const updateRes = await supabase
      .from('profiles')
      .update(updatePayload)
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
