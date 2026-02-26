module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, category, formData, image, platforms, tone, businessName, industry } = req.body;

  // Check if this is a legacy simple caption request (from old code)
  const isLegacyRequest = !category && req.body.postType;

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

    // Build tone guidance
    const toneGuide = {
      'professional': 'Professional and polished tone - "We\'re pleased to announce the completion of this pool installation in Mosman."',
      'casual': 'Casual, friendly, and approachable tone - "Check out this beauty we just finished in Mosman! 🏊‍♂️"',
      'promotional': 'Promotional and sales-focused tone - "AMAZING pool installation completed! Want one like this? Call now for 20% off!"',
      'educational': 'Educational and informative tone - "Here\'s what goes into a professional pool installation..."'
    }[tone] || 'Professional tone';

    let categoryContext = '';

    // Handle legacy simple requests
    if (isLegacyRequest) {
      const postTypeGuide = {
        'project-showcase': 'Showcasing completed work',
        'before-after': 'Before and after transformation',
        'customer-testimonial': 'Customer success story',
        'tip-advice': 'Helpful tip or industry advice',
        'behind-scenes': 'Behind the scenes look at the work'
      }[req.body.postType] || 'Project showcase';

      categoryContext = `This is a social media post.
Post Type: ${postTypeGuide}
${req.body.context ? `Context: ${req.body.context}` : ''}

Focus on: Creating engaging content for social media.`;
    } 
    // Handle category-specific requests
    else if (category === 'marketing') {
      categoryContext = `This is a MARKETING & PROMOTIONS post.
Promotion Type: ${formData.promoType}
Offer Details: ${formData.offerDetails}
${formData.validUntil ? `Valid Until: ${formData.validUntil}` : ''}
Call-to-Action: ${formData.cta}

Focus on: Creating urgency, highlighting the offer, clear call-to-action, benefits to customer.`;
    
    } else if (category === 'completed-jobs') {
      categoryContext = `This is a COMPLETED JOB SHOWCASE post.
Project Type: ${formData.projectType}
Location: ${formData.location}
Duration: ${formData.duration}
${formData.challenges ? `Special Challenges: ${formData.challenges}` : ''}
${formData.testimonial ? `Customer Testimonial: "${formData.testimonial}"` : ''}

Focus on: Showcasing quality work, location-specific details, project complexity, customer satisfaction.`;
    
    } else if (category === 'tips') {
      categoryContext = `This is a TIPS & ADVICE post.
Tip Category: ${formData.tipCategory}
Main Tip: ${formData.mainTip}
Why It Matters: ${formData.whyMatters}

Focus on: Providing valuable advice, educating followers, establishing expertise, actionable insights.`;
    
    } else if (category === 'industry-trends') {
      categoryContext = `This is an INDUSTRY TRENDS post.
Trend Topic: ${formData.trendTopic}
Expert Take: ${formData.expertTake}

Focus on: Demonstrating industry knowledge, sharing professional perspective, thought leadership.`;
    
    } else if (category === 'team-culture') {
      categoryContext = `This is a TEAM & CULTURE post.
Post Type: ${formData.teamPostType}
${formData.teamMemberName ? `Team Member: ${formData.teamMemberName}` : ''}
Highlight: ${formData.teamHighlight}

Focus on: Humanizing the brand, showcasing team expertise, building trust, company personality.`;
    }

    const prompt = `You are a social media expert for ${businessName}, a ${industry} business.

Create 3 different social media post captions based on the following:

${categoryContext}

Platform Guidelines: ${platformGuide}
Tone: ${toneGuide}

Requirements:
- Each caption should be unique and engaging
- Include relevant emojis
- For Instagram: add 5-10 relevant hashtags at the end
- For LinkedIn: focus on professionalism and industry insights
- For Facebook: make it conversational and shareable
- Keep captions concise but impactful (50-150 words each)
- Match the specified tone exactly
- Include appropriate call-to-action based on category
${formData?.testimonial ? '- Incorporate the customer testimonial naturally' : ''}

Return ONLY a JSON array of 3 caption strings, nothing else.

Example format:
["Caption 1 text here...", "Caption 2 text here...", "Caption 3 text here..."]`;

    // Build request body - include image if provided
    const messageContent = [];
    
    if (image) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: image
        }
      });
    }
    
    messageContent.push({
      type: 'text',
      text: prompt
    });

    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: messageContent
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
    console.error('Content generation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
