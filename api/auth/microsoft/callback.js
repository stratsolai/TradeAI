module.exports = async (req, res) => {
  console.log('Microsoft callback hit!');
  console.log('Query params:', req.query);
  
  const { code, state, error, error_description } = req.query;

  // Check if Microsoft returned an error
  if (error) {
    console.error('Microsoft returned error:', error, error_description);
    return res.redirect(`/chatbot-settings.html?error=microsoft_error&details=${error_description}`);
  }

  if (!code) {
    console.error('No code in callback');
    return res.redirect('/chatbot-settings.html?error=no_code');
  }

  console.log('Code received:', code.substring(0, 20) + '...');
  console.log('State (userId):', state);

  try {
    const https = require('https');

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    
    console.log('Client ID exists:', !!clientId);
    console.log('Client Secret exists:', !!clientSecret);
    console.log('Client ID (first 10 chars):', clientId?.substring(0, 10));

    if (!clientId || !clientSecret) {
      throw new Error('Microsoft credentials not configured');
    }

    const redirectUri = `${req.headers.origin || 'https://trade-ai-seven-blue.vercel.app'}/api/auth/microsoft/callback`;
    console.log('Redirect URI:', redirectUri);

    // Exchange code for tokens
    const postData = new URLSearchParams({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read'
    }).toString();

    console.log('Requesting token from Microsoft...');

    const tokenData = await new Promise((resolve, reject) => {
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
          console.log('Microsoft response:', data);
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      msReq.on('error', (err) => {
        console.error('Request error:', err);
        reject(err);
      });
      
      msReq.write(postData);
      msReq.end();
    });

    if (tokenData.error) {
      console.error('Microsoft token error:', tokenData.error, tokenData.error_description);
      throw new Error(tokenData.error_description || tokenData.error);
    }

    console.log('Token received successfully!');

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

    console.log('User info retrieved:', userInfo.mail || userInfo.userPrincipalName);

    // Store tokens in database
    const userId = state;
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    console.log('Saving to database for user:', userId);

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
    res.redirect('/chatbot-settings.html?email_connected=outlook');

  } catch (error) {
    console.error('Microsoft OAuth error:', error);
    res.redirect(`/chatbot-settings.html?error=oauth_failed&details=${encodeURIComponent(error.message)}`);
  }
};
