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
    console.log('Fetching user email tokens for:', userId);

    // Get user's email tokens
    const userData = await new Promise((resolve, reject) => {
      const parsedUrl = new URL(`${supabaseUrl}/rest/v1/profiles`);
      const query = querystring.stringify({
        id: `eq.${userId}`,
        select: 'gmail_access_token,outlook_access_token,gmail_connected_email,outlook_connected_email'
      });

      const options = {
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}?${query}`,
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
            console.log('User data fetched:', parsed[0] ? 'Found' : 'Not found');
            resolve(parsed[0] || {});
          } catch (e) {
            console.error('Parse error:', e);
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

    let emails = [];

    // Fetch from Gmail
    if (gmailToken) {
      console.log('Fetching Gmail emails...');
      emails = await fetchGmailEmails(gmailToken);
      console.log('Gmail emails fetched:', emails.length);
    }

    // Fetch from Outlook
    if (outlookToken) {
      console.log('Fetching Outlook emails...');
      emails = await fetchOutlookEmails(outlookToken);
      console.log('Outlook emails fetched:', emails.length);
    }

    if (emails.length === 0) {
      console.log('No emails found to scan');
      return res.status(200).json({ success: true, count: 0, message: 'No emails found' });
    }

    console.log('Extracting FAQs with Claude...');
    // Use Claude to extract Q&A pairs
    const extractedFAQs = await extractFAQsWithClaude(emails, claudeApiKey);
    console.log('FAQs extracted:', extractedFAQs.length);

    // Save to database
    let savedCount = 0;
    for (const faq of extractedFAQs) {
      try {
        await new Promise((resolve, reject) => {
          const parsedUrl = new URL(`${supabaseUrl}/rest/v1/learned_faqs`);

          const insertData = JSON.stringify({
            user_id: userId,
            question: faq.question,
            answer: faq.answer,
            source_email_id: faq.emailId,
            source_email_subject: faq.subject,
            confidence_score: faq.confidence || 50
          });

          const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname,
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
            supabaseRes.on('end', () => {
              savedCount++;
              resolve();
            });
          });

          supabaseReq.on('error', reject);
          supabaseReq.write(insertData);
          supabaseReq.end();
        });
      } catch (err) {
        console.error('Error saving FAQ:', err);
      }
    }

    console.log('Saved FAQs:', savedCount);

    return res.status(200).json({
      success: true,
      count: savedCount,
      message: `Found ${savedCount} potential FAQs`
    });

  } catch (error) {
    console.error('Email scan error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Fetch emails from Gmail
async function fetchGmailEmails(accessToken) {
  const https = require('https');

  try {
    // Get list of messages (last 50, from customers only)
    const messageList = await new Promise((resolve, reject) => {
      const querystring = require('querystring');
      const query = querystring.stringify({
        maxResults: 50,
        q: 'from:-me'
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
      return [];
    }

    // Fetch full message details (first 10 to avoid rate limits)
    const emails = [];
    for (const msg of messageList.messages.slice(0, 10)) {
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
        body = Buffer.from(message.payload.parts[0].body.data, 'base64').toString('utf-8');
      }

      emails.push({
        id: msg.id,
        subject: subject,
        body: body.substring(0, 1000)
      });
    }

    return emails;
  } catch (error) {
    console.error('Gmail fetch error:', error);
    return [];
  }
}

// Fetch emails from Outlook
async function fetchOutlookEmails(accessToken) {
  const https = require('https');
  const querystring = require('querystring');

  try {
    const query = querystring.stringify({
      '$top': 10,
      '$filter': "from/emailAddress/address ne 'me'"
    });

    const messages = await new Promise((resolve, reject) => {
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
      return [];
    }

    return messages.value.map(msg => ({
      id: msg.id,
      subject: msg.subject || 'No subject',
      body: (msg.body.content || '').substring(0, 1000)
    }));
  } catch (error) {
    console.error('Outlook fetch error:', error);
    return [];
  }
}

// Extract FAQs using Claude
async function extractFAQsWithClaude(emails, apiKey) {
  const https = require('https');

  const emailText = emails.map((e, i) => 
    `Email ${i + 1}:\nSubject: ${e.subject}\n${e.body}\n---`
  ).join('\n\n');

  const prompt = `You are analyzing customer emails to extract frequently asked questions and their answers.

Here are recent customer emails:

${emailText}

Please identify common questions customers are asking and the answers that were provided. Extract them as Q&A pairs.

For each Q&A pair, provide:
1. The question (in the customer's words or paraphrased)
2. The answer (extracted from the response)
3. A confidence score (0-100) based on how clear and complete the answer is

Return ONLY a JSON array like this:
[
  {
    "question": "How much does installation cost?",
    "answer": "Installation costs vary from $500 to $2000 depending on the size and complexity.",
    "confidence": 85
  }
]

Return ONLY the JSON array, no other text.`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const response = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });

  const aiResponse = response.content[0].text;
  
  try {
    // Extract JSON from response
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const faqs = JSON.parse(jsonMatch[0]);
      return faqs.map((faq, i) => ({
        ...faq,
        emailId: emails[0]?.id || `email-${i}`,
        subject: emails[0]?.subject || 'Customer email'
      }));
    }
  } catch (e) {
    console.error('Failed to parse Claude response:', e);
  }

  return [];
}
