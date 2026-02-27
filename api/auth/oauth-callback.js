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
  } else if (path.includes('/meta/')) {
    provider = 'meta';
  }
  
  console.log('Detected provider:', provider);
  
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error(`${provider} returned error:`, error, error_description);
    const redirectPage = provider === 'meta' ? 'social-settings' : 'content-library';
    return res.redirect(`/${redirectPage}.html?error=${provider}_error&details=${error_description}`);
  }

  if (!code) {
    console.error('No code in callback');
    return res.redirect(`/content-library.html?error=no_code`);
  }

  console.log('Code received, state (userId):', state);

  // ── META / FACEBOOK ──────────────────────────────────────────────────────────
  if (provider === 'meta') {
    try {
      const https = require('https');
      const APP_BASE_URL = 'https://trade-ai-seven-blue.vercel.app';
      const REDIRECT_URI = `${APP_BASE_URL}/api/auth/meta/callback`;
      const GRAPH = 'v19.0';
      const userId = state;

      function httpsGet(hostname, path, params = '') {
        const fullPath = params ? `${path}?${params}` : path;
        return new Promise((resolve, reject) => {
          https.get({ hostname, path: fullPath }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
          }).on('error', reject);
        });
      }

      function httpsPost(hostname, path, params) {
        const body = params.toString();
        return new Promise((resolve, reject) => {
          const req = https.request({
            hostname, path, method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
          }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
          });
          req.on('error', reject);
          req.write(body);
          req.end();
        });
      }

      // Step 1: Exchange code for short-lived token
      const tokenData = await httpsPost('graph.facebook.com', `/${GRAPH}/oauth/access_token`,
        new URLSearchParams({
          client_id:     process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri:  REDIRECT_URI,
          code
        })
      );

      if (!tokenData.access_token) throw new Error(tokenData.error?.message || 'Token exchange failed');

      // Step 2: Exchange for long-lived token (~60 days)
      const longTokenData = await httpsGet('graph.facebook.com', `/${GRAPH}/oauth/access_token`,
        new URLSearchParams({
          grant_type:        'fb_exchange_token',
          client_id:         process.env.META_APP_ID,
          client_secret:     process.env.META_APP_SECRET,
          fb_exchange_token: tokenData.access_token
        }).toString()
      );
      const userToken = longTokenData.access_token || tokenData.access_token;

      // Step 3: Get user's Facebook Pages
      const pagesData = await httpsGet('graph.facebook.com',
        `/${GRAPH}/me/accounts`,
        `fields=id,name,access_token,category&access_token=${userToken}`
      );

      if (!pagesData.data?.length) throw new Error('No Facebook Pages found. Please create a Facebook Page first.');

      const page      = pagesData.data[0];
      const pageToken = page.access_token;
      const pageId    = page.id;
      const pageName  = page.name;

      // Step 4: Get linked Instagram Business account (optional)
      let instagramId   = null;
      let instagramName = null;
      try {
        const igData = await httpsGet('graph.facebook.com',
          `/${GRAPH}/${pageId}`,
          `fields=instagram_business_account&access_token=${pageToken}`
        );
        instagramId = igData.instagram_business_account?.id || null;
        if (instagramId) {
          const igProfile = await httpsGet('graph.facebook.com',
            `/${GRAPH}/${instagramId}`,
            `fields=name,username&access_token=${pageToken}`
          );
          instagramName = igProfile.username || igProfile.name || null;
        }
      } catch(e) {
        console.log('No Instagram account linked:', e.message);
      }

      // Step 5: Save to Supabase
      const querystring = require('querystring');
      const updateData = {
        meta_connected:     true,
        meta_user_token:    userToken,
        meta_page_id:       pageId,
        meta_page_name:     pageName,
        meta_page_token:    pageToken,
        meta_token_expires: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        ...(instagramId ? { instagram_account_id: instagramId, instagram_username: instagramName } : {})
      };

      await new Promise((resolve, reject) => {
        const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/profiles`);
        const qs  = querystring.stringify({ id: `eq.${userId}` });
        const body = JSON.stringify(updateData);
        const options = {
          hostname: url.hostname,
          path: `${url.pathname}?${qs}`,
          method: 'PATCH',
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'Prefer': 'return=minimal'
          }
        };
        const supabaseReq = https.request(options, (supabaseRes) => {
          supabaseRes.on('data', () => {});
          supabaseRes.on('end', () => { console.log('Meta tokens saved'); resolve(); });
        });
        supabaseReq.on('error', reject);
        supabaseReq.write(body);
        supabaseReq.end();
      });

      const successMsg = instagramId ? 'meta_and_instagram' : 'meta_only';
      console.log(`Meta connected — Page: ${pageName}${instagramId ? ', Instagram: @' + instagramName : ''}`);
      return res.redirect(`/social-settings.html?connected=${successMsg}`);

    } catch (err) {
      console.error('Meta OAuth error:', err);
      return res.redirect(`/social-settings.html?error=meta_failed&details=${encodeURIComponent(err.message)}`);
    }
  }

  // ── GOOGLE / MICROSOFT (existing logic unchanged) ────────────────────────────
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
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
        });
        msReq.on('error', reject);
        msReq.write(postData);
        msReq.end();
      });
    } else {
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
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
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

    // Get user email
    let userEmail = null;
    
    if (provider === 'google') {
      const userInfo = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'www.googleapis.com',
          path: '/oauth2/v2/userinfo',
          method: 'GET',
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        };
        const googleReq = https.request(options, (googleRes) => {
          let data = '';
          googleRes.on('data', (chunk) => { data += chunk; });
          googleRes.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
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
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        };
        const msReq = https.request(options, (msRes) => {
          let data = '';
          msRes.on('data', (chunk) => { data += chunk; });
          msRes.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
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
      const body = JSON.stringify(updateData);
      const options = {
        hostname: url.hostname,
        path: `${url.pathname}?${qs}`,
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Prefer': 'return=minimal'
        }
      };
      const supabaseReq = https.request(options, (supabaseRes) => {
        supabaseRes.on('data', () => {});
        supabaseRes.on('end', () => { console.log('Database updated successfully'); resolve(); });
      });
      supabaseReq.on('error', reject);
      supabaseReq.write(body);
      supabaseReq.end();
    });

    console.log('Success! Redirecting...');
    
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
