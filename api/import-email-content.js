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
  const claudeApiKey = process.env.CLAUDE_API_KEY;

  try {
    console.log('Importing content from emails for user:', userId);

    // Get user's email tokens
    const userData = await new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
      const qs = querystring.stringify({
        id: `eq.${userId}`,
        select: 'gmail_access_token,outlook_access_token,gmail_connected_email,outlook_connected_email'
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

    const gmailToken = userData.gmail_access_token;
    const outlookToken = userData.outlook_access_token;

    console.log('Gmail connected:', !!gmailToken);
    console.log('Outlook connected:', !!outlookToken);

    if (!gmailToken && !outlookToken) {
      return res.status(400).json({ error: 'No email connected' });
    }

    let importedImages = 0;
    let importedTestimonials = 0;

    // Process Gmail
    if (gmailToken) {
      const gmailResults = await processGmailContent(gmailToken, userId, claudeApiKey, supabaseUrl, supabaseKey);
      importedImages += gmailResults.images;
      importedTestimonials += gmailResults.testimonials;
    }

    // Process Outlook
    if (outlookToken) {
      const outlookResults = await processOutlookContent(outlookToken, userId, claudeApiKey, supabaseUrl, supabaseKey);
      importedImages += outlookResults.images;
      importedTestimonials += outlookResults.testimonials;
    }

    return res.status(200).json({
      success: true,
      images: importedImages,
      testimonials: importedTestimonials,
      message: `Imported ${importedImages} images and ${importedTestimonials} testimonials`
    });

  } catch (error) {
    console.error('Email import error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// GMAIL PROCESSING
// ============================================
async function processGmailContent(accessToken, userId, claudeApiKey, supabaseUrl, supabaseKey) {
  const https = require('https');
  let imagesCount = 0;
  let testimonialsCount = 0;

  try {
    // Get recent emails with attachments
    const messageList = await new Promise((resolve, reject) => {
      const querystring = require('querystring');
      const query = querystring.stringify({
        maxResults: 20,
        q: 'has:attachment'
      });

      const options = {
        hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/me/messages?${query}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });

    if (!messageList.messages || messageList.messages.length === 0) {
      return { images: 0, testimonials: 0 };
    }

    // Process first 10 messages
    for (const msg of messageList.messages.slice(0, 10)) {
      try {
        const message = await new Promise((resolve, reject) => {
          const options = {
            hostname: 'gmail.googleapis.com',
            path: `/gmail/v1/users/me/messages/${msg.id}`,
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          };

          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(e);
              }
            });
          });

          req.on('error', reject);
          req.end();
        });

        // Extract subject and body
        const headers = message.payload.headers || [];
        const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
        const subject = subjectHeader ? subjectHeader.value : 'No subject';

        let body = '';
        if (message.payload.body && message.payload.body.data) {
          body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
        } else if (message.payload.parts && message.payload.parts[0]) {
          const textPart = message.payload.parts.find(p => p.mimeType === 'text/plain');
          if (textPart && textPart.body && textPart.body.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        }

        // Check for testimonials in email body
        if (body && (body.toLowerCase().includes('thank') || body.toLowerCase().includes('great job') || body.toLowerCase().includes('excellent'))) {
          // Use Claude to extract testimonial
          const testimonial = await extractTestimonial(body, subject, claudeApiKey);
          
          if (testimonial) {
            await insertContent(userId, 'testimonial', 'email-import', {
              title: `Testimonial from email: ${subject}`,
              content_text: testimonial,
              category: 'testimonial',
              tags: ['email', 'testimonial']
            }, supabaseUrl, supabaseKey);
            
            testimonialsCount++;
          }
        }

        // Process attachments
        if (message.payload.parts) {
          for (const part of message.payload.parts) {
            if (part.filename && part.mimeType && part.mimeType.startsWith('image/')) {
              try {
                // Get attachment
                const attachment = await new Promise((resolve, reject) => {
                  const options = {
                    hostname: 'gmail.googleapis.com',
                    path: `/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${accessToken}`
                    }
                  };

                  const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                      try {
                        resolve(JSON.parse(data));
                      } catch (e) {
                        reject(e);
                      }
                    });
                  });

                  req.on('error', reject);
                  req.end();
                });

                // Save image to library
                await insertContent(userId, 'image', 'email-import', {
                  title: part.filename,
                  image_url: `data:${part.mimeType};base64,${attachment.data}`,
                  description: `From email: ${subject}`,
                  category: 'general',
                  tags: ['email', 'attachment']
                }, supabaseUrl, supabaseKey);

                imagesCount++;
              } catch (error) {
                console.error(`Error processing attachment ${part.filename}:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing message ${msg.id}:`, error);
      }
    }

  } catch (error) {
    console.error('Gmail processing error:', error);
  }

  return { images: imagesCount, testimonials: testimonialsCount };
}

// ============================================
// OUTLOOK PROCESSING
// ============================================
async function processOutlookContent(accessToken, userId, claudeApiKey, supabaseUrl, supabaseKey) {
  const https = require('https');
  let imagesCount = 0;
  let testimonialsCount = 0;

  try {
    // Get recent emails
    const messages = await new Promise((resolve, reject) => {
      const querystring = require('querystring');
      const query = querystring.stringify({
        '$top': 20,
        '$filter': 'hasAttachments eq true'
      });

      const options = {
        hostname: 'graph.microsoft.com',
        path: `/v1.0/me/messages?${query}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });

    if (!messages.value || messages.value.length === 0) {
      return { images: 0, testimonials: 0 };
    }

    // Process first 10
    for (const msg of messages.value.slice(0, 10)) {
      try {
        const subject = msg.subject || 'No subject';
        const body = msg.body?.content || '';

        // Check for testimonials
        if (body && (body.toLowerCase().includes('thank') || body.toLowerCase().includes('great job') || body.toLowerCase().includes('excellent'))) {
          const testimonial = await extractTestimonial(body, subject, claudeApiKey);
          
          if (testimonial) {
            await insertContent(userId, 'testimonial', 'email-import', {
              title: `Testimonial from email: ${subject}`,
              content_text: testimonial,
              category: 'testimonial',
              tags: ['email', 'testimonial']
            }, supabaseUrl, supabaseKey);
            
            testimonialsCount++;
          }
        }

        // Get attachments
        const attachments = await new Promise((resolve, reject) => {
          const options = {
            hostname: 'graph.microsoft.com',
            path: `/v1.0/me/messages/${msg.id}/attachments`,
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          };

          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(e);
              }
            });
          });

          req.on('error', reject);
          req.end();
        });

        // Process image attachments
        if (attachments.value) {
          for (const att of attachments.value) {
            if (att.contentType && att.contentType.startsWith('image/')) {
              await insertContent(userId, 'image', 'email-import', {
                title: att.name,
                image_url: `data:${att.contentType};base64,${att.contentBytes}`,
                description: `From email: ${subject}`,
                category: 'general',
                tags: ['email', 'attachment']
              }, supabaseUrl, supabaseKey);

              imagesCount++;
            }
          }
        }
      } catch (error) {
        console.error(`Error processing Outlook message ${msg.id}:`, error);
      }
    }

  } catch (error) {
    console.error('Outlook processing error:', error);
  }

  return { images: imagesCount, testimonials: testimonialsCount };
}

// ============================================
// HELPER FUNCTIONS
// ============================================
async function extractTestimonial(emailBody, subject, claudeApiKey) {
  const https = require('https');

  const prompt = `Extract a customer testimonial from this email if present. Only return the actual testimonial quote from the customer, nothing else.

Subject: ${subject}
Body: ${emailBody.substring(0, 1000)}

If this contains a positive testimonial or feedback, return ONLY the testimonial text (1-3 sentences).
If there's no clear testimonial, return "NONE".`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    const text = response.content[0].text.trim();
    return (text && text !== 'NONE') ? text : null;
  } catch (error) {
    console.error('Testimonial extraction error:', error);
    return null;
  }
}

async function insertContent(userId, contentType, sourceType, data, supabaseUrl, supabaseKey) {
  const https = require('https');

  return new Promise((resolve, reject) => {
    const url = new URL(`${supabaseUrl}/rest/v1/content_library`);

    const insertData = JSON.stringify({
      user_id: userId,
      content_type: contentType,
      source_type: sourceType,
      ...data
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
}
