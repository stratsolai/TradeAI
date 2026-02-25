module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, image, platforms, tone, postType, context, businessName, industry } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'Image required' });
  }

  const claudeApiKey = process.env.CLAUDE_API_KEY;

  if (!claudeApiKey) {
    return res.status(500).json({ error: 'Claude API not configured' });
  }

  try {
    const https = require('https');

    // Build platform-specific guidance
    const platformGuide = platforms.map(p => {
      switch(p) {
        case 'facebook': return 'Facebook: Conversational, can be longer, use emojis';
        case 'instagram': return 'Instagram: Visual focus, hashtags important, trendy language';
        case 'linkedin': return 'LinkedIn: Professional, business-focused, industry insights';
        default: return '';
      }
    }).join('. ');

    const toneGuide = {
      'professional': 'Professional and polished',
      'casual': 'Casual, friendly, and approachable',
      'promotional': 'Promotional and sales-focused',
      'educational': 'Educational and informative'
    }[tone] || 'Professional';

    const postTypeGuide = {
      'project-showcase': 'Showcasing completed work',
      'before-after': 'Before and after transformation',
      'customer-testimonial': 'Customer success story',
      'tip-advice': 'Helpful tip or industry advice',
      'behind-scenes': 'Behind the scenes look at the work'
    }[postType] || 'Project showcase';

    const prompt = `You are a social media expert for ${businessName}, a ${industry} business.

Create 3 different social media post captions for this image.

Context: ${context || 'A recent project'}
Platforms: ${platforms.join(', ')}
Tone: ${toneGuide}
Post Type: ${postTypeGuide}

Platform guidelines: ${platformGuide}

Requirements:
- Each caption should be unique and engaging
- Include relevant emojis
- For Instagram: add 5-10 relevant hashtags at the end
- For LinkedIn: focus on professionalism and industry insights
- For Facebook: make it conversational and shareable
- Keep captions concise but impactful (50-150 words each)
- Include a call-to-action
- ${context ? 'Incorporate the provided context naturally' : ''}

Return ONLY a JSON array of 3 caption strings, nothing else.

Example format:
["Caption 1 text here...", "Caption 2 text here...", "Caption 3 text here..."]`;

    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
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

    if (response.error) {
      throw new Error(response.error.message || 'Claude API error');
    }

    const aiResponse = response.content[0].text;
    
    // Extract JSON array from response
    let captions;
    try {
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        captions = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: split by lines if JSON parsing fails
        captions = aiResponse.split('\n').filter(line => line.trim().length > 10).slice(0, 3);
      }
    } catch (e) {
      console.error('Failed to parse captions:', e);
      captions = [aiResponse];
    }

    return res.status(200).json({
      success: true,
      captions: captions
    });

  } catch (error) {
    console.error('Caption generation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
