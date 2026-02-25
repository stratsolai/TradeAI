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
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${req.headers.origin || 'https://trade-ai-seven-blue.vercel.app'}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      }).toString();

      const options = {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const googleReq = https.request(options, (googleRes) => {
        let data = '';
        googleRes.on('data', (chunk) => { data += chunk; });
        googleRes.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      googleReq.on('error', reject);
      googleReq.write(postData);
      googleReq.end();
    });

    if (tokenData.error) {
      throw new Error(tokenData.error);
    }

    // Get user email
    const userInfo = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.googleapis.com',
        path: '/oauth2/v2/userinfo',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      };

      const googleReq = https.request(options, (googleRes) => {
        let data = '';
        googleRes.on('data', (chunk) => { data += chunk; });
        googleRes.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      googleReq.on('error', reject);
      googleReq.end();
    });

    // Store tokens in database
    const userId = state; // We'll pass userId as state
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    await new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
      url.searchParams.append('id', `eq.${userId}`);

      const updateData = JSON.stringify({
        gmail_access_token: tokenData.access_token,
        gmail_refresh_token: tokenData.refresh_token,
        gmail_connected_email: userInfo.email,
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
    res.redirect('/chatbot-settings.html?email_connected=gmail');

  } catch (error) {
    console.error('Google OAuth error:', error);
    res.redirect('/chatbot-settings.html?error=oauth_failed');
  }
};
