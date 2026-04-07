// api/cl-oauth-initiate.js — Task 10 Step 6.5 (prereq for Step 7)
//
// OAuth initiate for the new CL standalone connections. Handles OneDrive,
// SharePoint, and Dropbox only. Builds the provider authorize URL with the
// env-side client_id and the new standalone callback redirect URI, then
// 302-redirects the browser to the provider.
//
// The existing api/auth/initiate.js handles google, google-drive, gmail,
// and microsoft for the shared oauth-callback.js flow. That file is NOT
// touched — this new endpoint runs in parallel for the three providers
// added by Task 10 CL Connections.
//
// Successful OAuth lands on:
//   /api/cl-onedrive-callback   → cl_onedrive_accounts
//   /api/cl-sharepoint-callback → cl_sharepoint_accounts
//   /api/cl-dropbox-callback    → cl_dropbox_accounts
//
// State: base64-encoded JSON { userId, provider } — the standalone callbacks
// decode this to resolve the user.

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, userId } = req.query;
  if (!provider || !userId) return res.status(400).json({ error: 'Missing provider or userId' });

  const APP_BASE_URL = 'https://staxai.com.au';

  const PROVIDERS = {
    onedrive: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      scopes: 'Files.Read.All offline_access User.Read',
      redirectUri: APP_BASE_URL + '/api/cl-onedrive-callback',
      flavour: 'microsoft',
    },
    sharepoint: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      scopes: 'Sites.Read.All offline_access User.Read',
      redirectUri: APP_BASE_URL + '/api/cl-sharepoint-callback',
      flavour: 'microsoft',
    },
    dropbox: {
      clientId: process.env.DROPBOX_CLIENT_ID,
      authUrl: 'https://www.dropbox.com/oauth2/authorize',
      scopes: 'account_info.read files.metadata.read files.content.read',
      redirectUri: APP_BASE_URL + '/api/cl-dropbox-callback',
      flavour: 'dropbox',
    },
  };

  const config = PROVIDERS[provider];
  if (!config) return res.status(400).json({ error: 'Unknown provider: ' + provider });
  if (!config.clientId) return res.status(500).json({ error: provider + ' client ID not configured' });

  const state = Buffer.from(JSON.stringify({ userId: userId, provider: provider })).toString('base64');

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes,
    state: state,
  });

  if (config.flavour === 'microsoft') {
    // response_mode=query forces the code/state on the URL query string
    // (consistent with the existing Outlook flow). prompt=select_account lets
    // a user connect a second account without being silently signed in to
    // the first.
    params.set('response_mode', 'query');
    params.set('prompt', 'select_account');
  }

  if (config.flavour === 'dropbox') {
    // Required for Dropbox to issue a refresh token. Without this flag,
    // Dropbox returns only a short-lived access token (~4 hours) and the
    // import endpoint cannot refresh it.
    params.set('token_access_type', 'offline');
  }

  return res.redirect(302, config.authUrl + '?' + params.toString());
};
