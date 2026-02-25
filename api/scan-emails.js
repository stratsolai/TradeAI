module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const https = require('https');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const claudeApiKey = process.env.CLAUDE_API_KEY;

  try {
    // Get user's email tokens
    const userData = await new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
      url.searchParams.append('id', `eq.${userId}`);
      url.searchParams.append('select', 'gmail_access_token,outlook_access_token,gmail_connected_email,outlook_connected_email');

      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
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

    if (!gmailToken && !outlookToken) {
      return res.status(400).json({ error: 'No email connected' });
    }

    let emails = [];

    // Fetch from Gmail
    if (gmailToken) {
      emails = await fetchGmailEmails(gmailToken);
    }

    // Fetch from Outlook
    if (outlookToken) {
      emails = await fetchOutlookEmails(outlookToken);
    }

    if (emails.length === 0) {
      return res.status(200).json({ success: true, count: 0, message: 'No emails found' });
    }

    // Use Claude to extract Q&A pairs
    const extractedFAQs = await extractFAQsWithClaude(emails, claudeApiKey);

    // Save to database
    let savedCount = 0;
    for (const faq of extractedFAQs) {
      await new Promise((resolve, reject) => {
        const url = new URL(`${supabaseUrl}/rest/v1/learned_faqs`);

        const insertData = JSON.stringify({
          user_id: userId,
          question: faq.question,
          answer: faq.answer,
          source_email_id: faq.emailId,
          source_email_subject: faq.subject,
          confidence_score: faq.confidence || 50
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
          supabaseRes.on('end', () => {
            savedCount++;
            resolve();
          });
        });

        supabaseReq.on('error', reject);
        supabaseReq.write(insertData);
        supabaseReq.end();
      });
    }

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

  // Get list of messages (last 50, from customers only)
  const messageList = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages?maxResults=50&q=from:-me',
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
      body: body.substring(0, 1000) // Limit to 1000 chars
    });
  }

  return emails;
}

// Fetch emails from Outlook
async function fetchOutlookEmails(accessToken) {
  const https = require('https');

  const messages = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.microsoft.com',
      path: '/v1.0/me/messages?$top=10&$filter=from/emailAddress/address ne \'me\'',
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
