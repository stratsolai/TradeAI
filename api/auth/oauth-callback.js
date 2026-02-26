module.exports = async (req, res) => {
  console.log('OAuth callback hit');
  console.log('Path:', req.url);
  console.log('Query params:', req.query);
  
  // Determine provider from the URL path
  const path = req.url || '';
  let provider = 'unknown';
  
  if (path.includes('/google-drive/')) {
    provider = 'google-drive';
  } else if (path.includes('/google/')) {
    provider = 'google';
  } else if (path.includes('/microsoft/')) {
    provider = 'microsoft';
  }
  
  console.log('Detected provider:', provider);
  
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error(`${provider} returned error:`, error, error_description);
    return res.redirect(`/content-library.html?error=${provider}_error&details=${error_description}`);
  }

  if (!code) {
    console.error('No code in callback');
    return res.redirect(`/content-library.html?error=no_code`);
  }

  console.log('Code received, state (userId):', state);

  try {
    const https = require('https');
    const querystring = require('querystring');

    const clientId = provider === 'microsoft' 
      ? process.env.MICROSOFT_CLIENT_ID 
      : process.env.GOOGLE_CLIENT_ID;
    
    const clientSecret = provider === 'microsoft'
      ? process.env.MICROSOFT_CLIENT_SECRET
      : process.env.GOOGLE_CLIENT_SECRET;
    
    console.log('Client ID exists:', !!clientId);
    console.log('Client Secret exists:', !!clientSecret);

    if (!clientId || !clientSecret) {
      throw new Error(`${provider} credentials not configured`);
    }

    const redirectUri = `${req.headers.origin || 'https://trade-ai-seven-blue.vercel.app'}/api/auth/${provider === 'google-drive' ? 'google-drive' : provider}/callback`;
    console.log('Redirect URI:', redirectUri);

    // Exchange code for tokens
    let tokenData;
    
    if (provider === 'microsoft') {
      // Microsoft OAuth
      const postData = new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read'
      }).toString();

      tokenData = await new Promise((resolve, reject) => {
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
            console.log('Microsoft response status:', msRes.statusCode);
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
    } else {
      // Google OAuth (for both Gmail and Drive)
      const postData = querystring.stringify({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });

      tokenData = await new Promise((resolve, reject) => {
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
    }

    if (tokenData.error) {
      console.error(`${provider} token error:`, tokenData.error, tokenData.error_description);
      throw new Error(tokenData.error_description || tokenData.error);
    }

    console.log('Token received successfully!');

    // Get user email (for Gmail and Outlook)
    let userEmail = null;
    
    if (provider === 'google') {
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

      userEmail = userInfo.email;
    } else if (provider === 'microsoft') {
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

      userEmail = userInfo.mail || userInfo.userPrincipalName;
    }

    // Store tokens in database
    const userId = state;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    console.log('Saving to database for user:', userId);

    let updateData = {};
    
    if (provider === 'google') {
      updateData = {
        gmail_access_token: tokenData.access_token,
        gmail_refresh_token: tokenData.refresh_token,
        gmail_connected_email: userEmail,
        email_connected: true
      };
    } else if (provider === 'microsoft') {
      updateData = {
        outlook_access_token: tokenData.access_token,
        outlook_refresh_token: tokenData.refresh_token,
        outlook_connected_email: userEmail,
        email_connected: true
      };
    } else if (provider === 'google-drive') {
      updateData = {
        gdrive_access_token: tokenData.access_token,
        gdrive_refresh_token: tokenData.refresh_token,
        gdrive_connected: true
      };
    }

    await new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
      const qs = querystring.stringify({ id: `eq.${userId}` });

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
      supabaseReq.write(JSON.stringify(updateData));
      supabaseReq.end();
    });

    console.log('Success! Redirecting...');
    
    // Redirect based on provider
    if (provider === 'google-drive') {
      res.redirect('/content-library.html?gdrive_connected=true');
    } else {
      res.redirect('/chatbot-settings.html?email_connected=' + provider);
    }

  } catch (error) {
    console.error(`${provider} OAuth error:`, error);
    const redirectPage = provider === 'google-drive' ? 'content-library' : 'chatbot-settings';
    res.redirect(`/${redirectPage}.html?error=oauth_failed&details=${encodeURIComponent(error.message)}`);
  }
};
