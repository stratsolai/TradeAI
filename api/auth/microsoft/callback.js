module.exports = async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.redirect('/chatbot-settings.html?error=no_code');
  }

  try {
    const https = require('https');

    // Exchange code for tokens
    const tokenData = await new Promise((resolve, reject) => {
      const postData = new URLSearchParams({
        code: code,
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: `${req.headers.origin || 'https://trade-ai-seven-blue.vercel.app'}/api/auth/microsoft/callback`,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read'
      }).toString();

      const options = {
        hostname: 'login.microsoftonline.com',
        path: '/common/oauth2/v2.0/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const msReq = https.request(options, (msRes) => {
        let data = '';
        msRes.on('data', (chunk) => { data += chunk; });
        msRes.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      msReq.on('error', reject);
      msReq.write(postData);
      msReq.end();
    });

    if (tokenData.error) {
      throw new Error(tokenData.error);
    }

    // Get user email
    const userInfo = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.microsoft.com',
        path: '/v1.0/me',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      };

      const msReq = https.request(options, (msRes) => {
        let data = '';
        msRes.on('data', (chunk) => { data += chunk; });
        msRes.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      msReq.on('error', reject);
      msReq.end();
    });

    // Store tokens in database
    const userId = state;
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    await new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
      url.searchParams.append('id', `eq.${userId}`);

      const updateData = JSON.stringify({
        outlook_access_token: tokenData.access_token,
        outlook_refresh_token: tokenData.refresh_token,
        outlook_connected_email: userInfo.mail || userInfo.userPrincipalName,
        email_connected: true
      });

      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      };

      const supabaseReq = https.request(options, (supabaseRes) => {
        supabaseRes.on('data', () => {});
        supabaseRes.on('end', resolve);
      });

      supabaseReq.on('error', reject);
      supabaseReq.write(updateData);
      supabaseReq.end();
    });

    // Redirect back to settings with success
    res.redirect('/chatbot-settings.html?email_connected=outlook');

  } catch (error) {
    console.error('Microsoft OAuth error:', error);
    res.redirect('/chatbot-settings.html?error=oauth_failed');
  }
};
