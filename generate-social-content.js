module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    userId, category, formData, image, platforms, tone, outputFormat,
    businessName, industry, marketingDNA,
    // Campaign mode
    mode, campaignName, campaignGoal, campaignStart, campaignEnd,
    campaignOverview, postCount
  } = req.body;

  const claudeApiKey = process.env.CLAUDE_API_KEY;
  if (!claudeApiKey) return res.status(500).json({ error: 'Claude API not configured' });

  try {
    const https = require('https');

    // ─── MARKETING DNA SECTION ────────────────────────────────────────────
    // This is injected into every prompt to keep all content on-brand
    let dnaSection = '';
    if (marketingDNA && Object.keys(marketingDNA).length > 0) {
      dnaSection = `
=== MARKETING DNA (MANDATORY - apply to ALL content) ===
Target Audience: ${marketingDNA.audience || 'Not specified'}
Core Marketing Themes: ${(marketingDNA.themes || []).join(' | ') || 'Not specified'}
Brand Feeling to Create: ${marketingDNA.feeling || 'Not specified'}
ALWAYS include or emphasise: ${marketingDNA.always_say || 'Not specified'}
NEVER say or do: ${marketingDNA.never_say || 'Not specified'}

Every piece of content MUST reflect these themes and speak to this audience.
=============================================================
`;
    }

    // ─── OUTPUT FORMAT GUIDE ─────────────────────────────────────────────
    const outputGuide = {
      'ai-choice': `Choose the best format for this specific post type. Think: would this work better as a narrative story, a punchy list, a headline with explanation, or a question hook? Make that choice and execute it excellently.`,
      'storytelling': `Write as a flowing narrative story. No bullet points. Draw the reader in, describe the situation, the work, and the result. Like a mini case study told conversationally.`,
      'dotpoints': `Use dot points or numbered lists. Start with a short attention-grabbing opener, then use 3-5 clear dot points, then close with a call-to-action. Make each dot point punchy and specific.`,
      'headline': `Bold attention-grabbing HEADLINE on the first line (3-7 words, all caps or heavy emphasis), then 2-3 sentences of explanation, then a clear call-to-action. Like a mini ad.`,
      'question': `Open with a compelling question that speaks directly to the target audience's pain point or curiosity. Then answer it through the content. Drives comments and engagement.`
    }[outputFormat] || 'Use the best format for this post type.';

    // ─── PLATFORM GUIDE ──────────────────────────────────────────────────
    const platformList = (platforms || ['facebook']).join(', ');
    const platformGuide = (platforms || ['facebook']).map(p => ({
      facebook: 'Facebook: Conversational, can be 100-200 words, emojis welcome, end with a question or CTA',
      instagram: 'Instagram: Visual story-driven, 80-150 words, add 8-10 highly relevant hashtags at the end',
      linkedin: 'LinkedIn: Professional insight tone, 100-200 words, thought leadership angle, no fluff'
    }[p] || '')).filter(Boolean).join(' | ');

    // ─── TONE GUIDE ──────────────────────────────────────────────────────
    const toneGuide = {
      professional: 'Professional and polished. Confident but not stiff. Authoritative.',
      casual: 'Warm, friendly and conversational. Speak like a trusted expert mate, not a corporation.',
      promotional: 'Energetic and sales-focused. Create urgency. Highlight value clearly.',
      educational: 'Informative and authoritative. Teach something valuable. Position as the expert.'
    }[tone] || 'Professional tone';

    // ─────────────────────────────────────────────────────────────────────
    // CAMPAIGN MODE - generates a full series of posts
    // ─────────────────────────────────────────────────────────────────────
    if (mode === 'campaign') {
      const numPosts = Math.min(parseInt(postCount) || 5, 10);
      
      const campaignPrompt = `You are a marketing strategist and copywriter for ${businessName}, a ${industry} business.

${dnaSection}

Create a ${numPosts}-post social media campaign with the following details:

Campaign Name: ${campaignName}
Campaign Goal: ${campaignGoal}
Campaign Overview: ${campaignOverview || 'A general marketing campaign for the business'}
${campaignStart ? `Starts: ${campaignStart}` : ''}
${campaignEnd ? `Ends: ${campaignEnd}` : ''}
Platforms: ${platformList}

Platform Guidelines: ${platformGuide}
Tone: ${toneGuide}

Instructions:
- Create exactly ${numPosts} posts that work together as a campaign
- Each post should serve a different purpose within the campaign (e.g., awareness, social proof, offer, FAQ, urgency/close)
- Vary the format across posts: some storytelling, some dot points, some questions, some bold headlines
- Each post should be able to stand alone but also feel like part of a series
- Progress naturally from awareness → interest → desire → action across the campaign
- Include emojis where appropriate
- For Instagram posts: add relevant hashtags
- Each post: 60-180 words
- If start/end dates provided, suggest which day to post each (suggest_date field)

Return ONLY a valid JSON array like this (no extra text, no markdown):
[
  {
    "content": "Full post text here...",
    "purpose": "Awareness",
    "format": "Story",
    "suggested_date": "2025-06-01"
  }
]`;

      const requestBody = JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: campaignPrompt }]
      });

      const response = await makeClaudeRequest(https, claudeApiKey, requestBody);
      if (response.error) throw new Error(response.error.message);

      const aiText = response.content[0].text;
      let posts;
      try {
        const match = aiText.match(/\[[\s\S]*\]/);
        posts = JSON.parse(match ? match[0] : aiText);
      } catch (e) {
        posts = [{ content: aiText, purpose: 'General', format: 'Mixed' }];
      }

      return res.status(200).json({ success: true, posts });
    }

    // ─────────────────────────────────────────────────────────────────────
    // SINGLE POST MODE - generates 3 caption options
    // ─────────────────────────────────────────────────────────────────────

    // Build category-specific context
    let categoryContext = '';
    const fd = formData || {};

    if (category === 'marketing') {
      categoryContext = `POST TYPE: MARKETING & PROMOTIONS
Promotion Type: ${fd.promoType || 'Special Offer'}
Offer Details: ${fd.offerDetails || ''}
${fd.validUntil ? `Valid Until: ${fd.validUntil}` : ''}
Call-to-Action: ${fd.cta || 'Book Now'}
Focus: Create urgency, highlight the offer clearly, show the value to the customer.`;

    } else if (category === 'completed-jobs') {
      categoryContext = `POST TYPE: COMPLETED JOB SHOWCASE
Project Type: ${fd.projectType || 'Installation'}
Location: ${fd.location || ''}
Duration: ${fd.duration || ''}
${fd.challenges ? `Interesting Challenges Overcome: ${fd.challenges}` : ''}
${fd.testimonial ? `Customer Testimonial (use naturally): "${fd.testimonial}"` : ''}
Focus: Showcase quality, craftsmanship and the team's expertise. Make it local and relatable. Build trust.`;

    } else if (category === 'tips') {
      categoryContext = `POST TYPE: TIPS & ADVICE
Tip Category: ${fd.tipCategory || 'Maintenance'}
The Tip: ${fd.mainTip || ''}
Why It Matters: ${fd.whyMatters || ''}
Focus: Provide genuinely useful advice. Establish expertise. Give them a reason to follow and trust the business.`;

    } else if (category === 'industry-trends') {
      categoryContext = `POST TYPE: INDUSTRY TREND
Trend Topic: ${fd.trendTopic || ''}
Expert Perspective: ${fd.expertTake || ''}
Focus: Thought leadership. Show the business is ahead of the curve. Invite discussion.`;

    } else if (category === 'team-culture') {
      categoryContext = `POST TYPE: TEAM & CULTURE
Type: ${fd.teamPostType || 'Team Member Spotlight'}
${fd.teamMemberName ? `Team Member: ${fd.teamMemberName}` : ''}
Highlight: ${fd.teamHighlight || ''}
Focus: Humanise the brand. Show the real people behind the business. Build connection and trust.`;

    } else if (category === 'campaign') {
      categoryContext = `POST TYPE: CAMPAIGN POST
Campaign: ${fd.campaignName || ''}
Goal: ${fd.campaignGoal || 'Generate Leads'}
Key Message: ${fd.campaignMessage || ''}
Focus: Deliver the key message powerfully. Drive the intended action.`;

    } else {
      categoryContext = `POST TYPE: General social media post for ${businessName}.`;
    }

    const singlePostPrompt = `You are a social media expert and copywriter for ${businessName}, a ${industry} business.

${dnaSection}

Create 3 distinctly different social media posts based on:

${categoryContext}

Platform(s): ${platformList}
${platformGuide}

Tone: ${toneGuide}

Output Format Instructions:
${outputGuide}

For Option A: Use the format instruction above.
For Option B: Try a different angle on the same content (different hook, different structure).
For Option C: Make it the most engaging / shareable version — could be more emotional, more surprising, or more direct.

Additional requirements:
- Each post must be unique — different opening, different angle, different structure
- Include emojis where they feel natural (not forced)
- For Instagram posts: add 8-10 relevant hashtags at the end of EACH caption
- Each post should be 60-180 words (vary the lengths across options)
- Every post MUST reflect the Marketing DNA themes above if they were provided
- End with a clear call-to-action appropriate for this post type

Return ONLY a valid JSON array of exactly 3 strings (no markdown, no extra text):
["Full caption option A here...", "Full caption option B here...", "Full caption option C here..."]`;

    // Build message content (with image if provided)
    const messageContent = [];
    if (image) {
      messageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: image }
      });
    }
    messageContent.push({ type: 'text', text: singlePostPrompt });

    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: messageContent }]
    });

    const response = await makeClaudeRequest(https, claudeApiKey, requestBody);
    if (response.error) throw new Error(response.error.message || 'Claude API error');

    const aiResponse = response.content[0].text;
    let captions;
    try {
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      captions = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse);
    } catch (e) {
      captions = aiResponse.split('\n').filter(l => l.trim().length > 10).slice(0, 3);
    }

    return res.status(200).json({ success: true, captions });

  } catch (error) {
    console.error('Content generation error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── HELPER: Make Claude API request ─────────────────────────────────────
function makeClaudeRequest(https, apiKey, requestBody) {
  return new Promise((resolve, reject) => {
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
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}
