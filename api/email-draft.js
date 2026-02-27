/**
 * /api/email-draft.js
 * Generates a professional reply draft for a given email using Claude
 */

const https = require('https');

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { emailFrom, emailSubject, emailPreview, emailCategory, businessName, industry } = req.body;
  const claudeKey = process.env.CLAUDE_API_KEY;
  if (!claudeKey) return res.status(500).json({ error: 'CLAUDE_API_KEY not configured' });

  const categoryContext = {
    urgent:    'This is urgent and needs a prompt, professional response addressing the issue directly.',
    leads:     'This is a new sales lead. The reply should be warm, professional, confirm you received their enquiry, and offer to discuss their needs or provide a quote.',
    enquiries: 'This is a customer enquiry. Be helpful, professional and clear.',
    jobs:      'This is job or scheduling related. Be practical, confirm details, and be clear about next steps.',
    invoices:  'This is invoice or payment related. Be professional and clear about figures and timelines.',
    industry:  'This is an industry or supplier email. A brief acknowledgement is usually appropriate.',
    low:       'This is a low-priority email. A brief, polite response is appropriate.'
  };

  const systemPrompt = `You are a professional email assistant for ${businessName}, a ${industry} business.

Write a professional, friendly email reply. Guidelines:
- Sound like a real tradesperson / business owner, not a corporation
- Be concise — tradies are busy, keep it under 150 words unless the situation requires more
- ${categoryContext[emailCategory] || 'Be helpful and professional.'}
- End with an appropriate sign-off using "${businessName}"
- Do NOT include a subject line
- Do NOT include placeholder text like [Your Name] — use "${businessName}" as the sender

Respond with ONLY the email body text, ready to copy and send.`;

  try {
    const response = await httpsPost('api.anthropic.com', '/v1/messages',
      {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01'
      },
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Draft a reply to this email:

From: ${emailFrom}
Subject: ${emailSubject}
Message: ${emailPreview}`
        }]
      }
    );

    const draft = response.body.content?.[0]?.text?.trim() || '';
    return res.status(200).json({ success: true, draft });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
