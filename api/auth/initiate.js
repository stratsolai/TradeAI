module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, userId } = req.query;
  if (!provider || !userId) return res.status(400).json({ error: 'Missing provider or userId' });

  const APP_BASE_URL = 'https://trade-ai-seven-blue.vercel.app';

  const PROVIDERS = {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
      redirectUri: APP_BASE_URL + '/api/auth/google/callback'
    },
    'google-drive': {
      clientId: process.env.GOOGLE_CLIENT_ID,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      scopes: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email',
      redirectUri: APP_BASE_URL + '/api/auth/google-drive/callback'
    },
    gmail: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
      redirectUri: APP_BASE_URL + '/api/auth/google/callback'
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      scopes: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access',
      redirectUri: APP_BASE_URL + '/api/auth/microsoft/callback'
    }
  };

  const config = PROVIDERS[provider];
  if (!config) return res.status(400).json({ error: 'Unknown provider: ' + provider });

  const state = Buffer.from(JSON.stringify({ userId, provider })).toString('base64');

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes,
    access_type: 'offline',
    prompt: 'consent',
    state
  });

  return res.redirect(302, config.authUrl + '?' + params.toString());
};
