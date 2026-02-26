module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, folderId } = req.body;

  if (!userId || !folderId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const https = require('https');
  const querystring = require('querystring');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const claudeApiKey = process.env.CLAUDE_API_KEY;

  try {
    console.log('Importing images from folder:', folderId);

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

    // List image files in folder
    const imageFiles = await new Promise((resolve, reject) => {
      const query = `'${folderId}' in parents and (mimeType contains 'image/')`;
      const options = {
        hostname: 'www.googleapis.com',
        path: `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=50`,
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

    console.log(`Found ${imageFiles.length} images in folder`);

    let importedCount = 0;

    // Import each image
    for (const file of imageFiles.slice(0, 20)) { // Limit to 20 images to avoid timeout
      try {
        // Check if already imported
        const alreadyImported = await new Promise((resolve, reject) => {
          const url = new URL(`${supabaseUrl}/rest/v1/gdrive_imported_files`);
          const qs = querystring.stringify({
            user_id: `eq.${userId}`,
            file_id: `eq.${file.id}`
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
                resolve(parsed.length > 0);
              } catch (e) {
                reject(e);
              }
            });
          });

          supabaseReq.on('error', reject);
          supabaseReq.end();
        });

        if (alreadyImported) {
          console.log(`Skipping ${file.name} - already imported`);
          continue;
        }

        // Download image from Drive
        const imageData = await new Promise((resolve, reject) => {
          const options = {
            hostname: 'www.googleapis.com',
            path: `/drive/v3/files/${file.id}?alt=media`,
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          };

          const driveReq = https.request(options, (driveRes) => {
            const chunks = [];
            driveRes.on('data', (chunk) => { chunks.push(chunk); });
            driveRes.on('end', () => {
              const buffer = Buffer.concat(chunks);
              resolve(buffer.toString('base64'));
            });
          });

          driveReq.on('error', reject);
          driveReq.end();
        });

        // Save to content library
        const contentId = await new Promise((resolve, reject) => {
          const url = new URL(`${supabaseUrl}/rest/v1/content_library`);

          const insertData = JSON.stringify({
            user_id: userId,
            content_type: 'image',
            source_type: 'gdrive',
            title: file.name,
            image_url: `data:${file.mimeType};base64,${imageData}`,
            category: 'general',
            tags: ['google-drive', 'import']
          });

          const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            }
          };

          const supabaseReq = https.request(options, (supabaseRes) => {
            let data = '';
            supabaseRes.on('data', (chunk) => { data += chunk; });
            supabaseRes.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                resolve(parsed[0]?.id);
              } catch (e) {
                reject(e);
              }
            });
          });

          supabaseReq.on('error', reject);
          supabaseReq.write(insertData);
          supabaseReq.end();
        });

        // Track as imported
        await new Promise((resolve, reject) => {
          const url = new URL(`${supabaseUrl}/rest/v1/gdrive_imported_files`);

          const insertData = JSON.stringify({
            user_id: userId,
            file_id: file.id,
            file_name: file.name,
            content_library_id: contentId
          });

          const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
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
          supabaseReq.write(insertData);
          supabaseReq.end();
        });

        console.log(`✅ Imported: ${file.name}`);
        importedCount++;

      } catch (error) {
        console.error(`Error importing ${file.name}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      count: importedCount,
      total: imageFiles.length
    });

  } catch (error) {
    console.error('Import error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
