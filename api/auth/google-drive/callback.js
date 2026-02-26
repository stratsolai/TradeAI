module.exports = async (req, res) => {
  console.log('Google Drive OAuth callback hit');
  console.log('Query params:', req.query);
  
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('Google returned error:', error, error_description);
    return res.redirect(`/content-library.html?error=google_error&details=${error_description}`);
  }

  if (!code) {
    console.error('No code in callback');
    return res.redirect('/content-library.html?error=no_code');
  }

  console.log('Code received, state (userId):', state);

  try {
    const https = require('https');
    const querystring = require('querystring');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    console.log('Client ID exists:', !!clientId);
    console.log('Client Secret exists:', !!clientSecret);

    if (!clientId || !clientSecret) {
      throw new Error('Google credentials not configured');
    }

    const redirectUri = `${req.headers.origin || 'https://trade-ai-seven-blue.vercel.app'}/api/auth/google-drive/callback`;
    console.log('Redirect URI:', redirectUri);

    // Exchange code for tokens
    const postData = querystring.stringify({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    console.log('Requesting token from Google...');

    const tokenData = await new Promise((resolve, reject) => {
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
          console.log('Google response status:', googleRes.statusCode);
          console.log('Google response:', data);
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      googleReq.on('error', (err) => {
        console.error('Request error:', err);
        reject(err);
      });
      
      googleReq.write(postData);
      googleReq.end();
    });

    if (tokenData.error) {
      console.error('Google token error:', tokenData.error, tokenData.error_description);
      throw new Error(tokenData.error_description || tokenData.error);
    }

    console.log('Token received successfully!');

    // Store tokens in database
    const userId = state;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    console.log('Saving to database for user:', userId);

    await new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
      const qs = querystring.stringify({ id: `eq.${userId}` });

      const updateData = JSON.stringify({
        gdrive_access_token: tokenData.access_token,
        gdrive_refresh_token: tokenData.refresh_token,
        gdrive_connected: true
      });

      const options = {
        hostname: url.hostname,
        path: `${url.pathname}?${qs}`,
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
        supabaseRes.on('end', () => {
          console.log('Database updated successfully');
          resolve();
        });
      });

      supabaseReq.on('error', reject);
      supabaseReq.write(updateData);
      supabaseReq.end();
    });

    console.log('Success! Redirecting...');
    res.redirect('/content-library.html?gdrive_connected=true');

  } catch (error) {
    console.error('Google Drive OAuth error:', error);
    res.redirect(`/content-library.html?error=oauth_failed&details=${encodeURIComponent(error.message)}`);
  }
};
