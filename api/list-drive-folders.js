module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const https = require('https');
  const querystring = require('querystring');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  try {
    console.log('Fetching Drive access token for user:', userId);

    // Get user's Drive token
    const userData = await new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
      const qs = querystring.stringify({
        id: `eq.${userId}`,
        select: 'gdrive_access_token'
      });

      const options = {
        hostname: url.hostname,
        path: `${url.pathname}?${qs}`,
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      };

      const supabaseReq = https.request(options, (supabaseRes) => {
        let data = '';
        supabaseRes.on('data', (chunk) => { data += chunk; });
        supabaseRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed[0] || {});
          } catch (e) {
            reject(e);
          }
        });
      });

      supabaseReq.on('error', reject);
      supabaseReq.end();
    });

    const accessToken = userData.gdrive_access_token;

    if (!accessToken) {
      return res.status(400).json({ error: 'Drive not connected' });
    }

    console.log('Access token found, fetching folders...');

    // List folders from Drive
    const folders = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.googleapis.com',
        path: `/drive/v3/files?q=${encodeURIComponent("mimeType='application/vnd.google-apps.folder'")}&fields=files(id,name)&pageSize=100`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      };

      const driveReq = https.request(options, (driveRes) => {
        let data = '';
        driveRes.on('data', (chunk) => { data += chunk; });
        driveRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'Drive API error'));
            } else {
              resolve(parsed.files || []);
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      driveReq.on('error', reject);
      driveReq.end();
    });

    console.log(`Found ${folders.length} folders`);

    return res.status(200).json({
      success: true,
      folders: folders
    });

  } catch (error) {
    console.error('List folders error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
