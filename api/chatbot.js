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

  const { message, conversationHistory, userId } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Check API keys
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!claudeApiKey) {
    console.error('CLAUDE_API_KEY not found');
    return res.status(500).json({ 
      success: false, 
      error: 'Server configuration error' 
    });
  }

  try {
    const https = require('https');

    // Load user settings from Supabase if userId provided
    let userSettings = {};
    
    if (userId && supabaseUrl && supabaseKey) {
      const supabaseData = await new Promise((resolve, reject) => {
        const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
        url.searchParams.append('id', `eq.${userId}`);
        url.searchParams.append('select', 'chatbot_settings,business_name');

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
              resolve({});
            }
          });
        });

        supabaseReq.on('error', () => resolve({}));
        supabaseReq.end();
      });

      userSettings = supabaseData.chatbot_settings || {};
      userSettings.business_name = userSettings.business_name || supabaseData.business_name || 'our business';
    }

    // Build custom system prompt based on user settings
    const systemPrompt = buildSystemPrompt(userSettings);

    // Call Claude API
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
      system: systemPrompt
    });

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

// Build custom system prompt from user settings
function buildSystemPrompt(settings) {
  const businessName = settings.business_name || 'our business';
  const businessDesc = settings.business_description || 'a trades business';
  const serviceAreas = settings.service_areas || 'our service area';
  const timeline = settings.timeline || 'varies by project';
  const priceRanges = settings.price_ranges || 'Contact us for pricing';
  const whatsIncluded = settings.whats_included || 'all standard services';
  
  const askBudget = settings.ask_budget !== 'no';
  const askTimeline = settings.ask_timeline !== 'no';
  const askLocation = settings.ask_location !== 'no';
  const askProject = settings.ask_project !== 'no';

  const bookingLink = settings.booking_link || null;

  // Build FAQs section
  let faqSection = '';
  if (settings.faqs && settings.faqs.length > 0) {
    faqSection = '\n\nFREQUENTLY ASKED QUESTIONS:\n';
    settings.faqs.forEach(faq => {
      faqSection += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
    });
  }

  return `You are a helpful AI assistant for ${businessName}.

BUSINESS INFORMATION:
- Business: ${businessName}
- Services: ${businessDesc}
- Service Areas: ${serviceAreas}
- Typical Timeline: ${timeline}
- What's Included: ${whatsIncluded}

PRICING INFORMATION:
${priceRanges}

YOUR JOB:
1. Greet visitors warmly and professionally
2. Answer questions about our services using the information above
3. Qualify leads by asking relevant questions
4. Capture contact details when appropriate
5. ${bookingLink ? `Offer to book consultations using this link: ${bookingLink}` : 'Offer to have someone contact them'}

QUALIFYING QUESTIONS TO ASK:
${askBudget ? '- Ask about their budget range' : ''}
${askTimeline ? '- Ask when they want to start' : ''}
${askLocation ? '- Ask their location (to confirm we service their area)' : ''}
${askProject ? '- Ask about project details/requirements' : ''}

${faqSection}

IMPORTANT GUIDELINES:
- Keep responses concise (2-3 sentences max)
- Ask ONE question at a time
- Be friendly and professional
- Use Australian spelling and terminology
- If they ask about something not in your knowledge, say you'll have someone from ${businessName} contact them
- Always try to capture their name, email, or phone number before ending the conversation
${bookingLink ? `- When ready to book, provide this link: ${bookingLink}` : ''}

Remember: You represent ${businessName}. Be helpful, professional, and focus on qualifying leads.`;
}
