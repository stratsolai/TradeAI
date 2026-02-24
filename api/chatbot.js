module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, conversationHistory } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Check API key
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.error('CLAUDE_API_KEY not found in environment variables');
    return res.status(500).json({ 
      success: false, 
      error: 'Server configuration error',
      details: 'API key not configured' 
    });
  }

  try {
    const https = require('https');
    
    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        ...(conversationHistory || []),
        {
          role: 'user',
          content: message
        }
      ],
      system: `You are a helpful AI assistant for a trades business. Your job is to:
1. Greet website visitors warmly
2. Ask qualifying questions: budget, timeline, location, project type
3. Capture their contact details (name, email, phone)
4. Offer to book a consultation
5. Be friendly, professional, and helpful

Keep responses concise (2-3 sentences max). Ask one question at a time.`
    });

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

    const anthropicRequest = https.request(options, (anthropicResponse) => {
      let data = '';

      anthropicResponse.on('data', (chunk) => {
        data += chunk;
      });

      anthropicResponse.on('end', () => {
        try {
          if (anthropicResponse.statusCode !== 200) {
            console.error('Claude API error:', anthropicResponse.statusCode, data);
            return res.status(500).json({
              success: false,
              error: 'AI service error',
              details: `Status ${anthropicResponse.statusCode}`
            });
          }

          const responseData = JSON.parse(data);
          const aiMessage = responseData.content[0].text;

          return res.status(200).json({
            success: true,
            message: aiMessage,
            conversationHistory: [
              ...(conversationHistory || []),
              { role: 'user', content: message },
              { role: 'assistant', content: aiMessage }
            ]
          });
        } catch (parseError) {
          console.error('Parse error:', parseError);
          return res.status(500).json({
            success: false,
            error: 'Parse error',
            details: parseError.message
          });
        }
      });
    });

    anthropicRequest.on('error', (error) => {
      console.error('Request error:', error);
      return res.status(500).json({
        success: false,
        error: 'Request failed',
        details: error.message
      });
    });

    anthropicRequest.write(requestBody);
    anthropicRequest.end();

  } catch (error) {
    console.error('Caught error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
};
