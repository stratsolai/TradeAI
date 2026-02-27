/**
 * /api/graphic-generate.js
 *
 * AI graphic generation for TradeAI using Ideogram 3.0
 *
 * Flow:
 * 1. Check user's monthly graphic usage against their cap
 * 2. Use Claude to write a creative, specific Ideogram prompt
 *    based on the post content, category, business type & brand colours
 * 3. Call Ideogram API → get image URL
 * 4. Download the image (Ideogram URLs expire) → upload to Supabase Storage
 * 5. Log usage in graphic_usage table
 * 6. Save post + permanent graphic URL to publishing_queue (status: pending_approval)
 * 7. Return queue ID + graphic URL to frontend
 *
 * ENV VARS REQUIRED:
 *   IDEOGRAM_API_KEY      — from ideogram.ai/api
 *   CLAUDE_API_KEY        — already exists
 *   SUPABASE_URL          — already exists
 *   SUPABASE_SERVICE_KEY  — already exists
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) } },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// Download a remote image and return as a Buffer + content-type
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : require('http');
    lib.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || 'image/jpeg'
      }));
    }).on('error', reject);
  });
}

// ─── PROMPT BUILDER ───────────────────────────────────────────────────────────
// Ask Claude to write a tailored Ideogram prompt for the post

async function buildImagePrompt(claudeApiKey, { postContent, category, businessName, industry, platforms, brandColours }) {
  const platformList = (platforms || ['facebook']).join(', ');

  const systemPrompt = `You are an expert AI image prompt writer for social media marketing graphics.
You write prompts for Ideogram 3.0 — an AI image generator that excels at clean text rendering inside images.

Your prompts must:
- Be vivid, specific and creative — never generic
- Describe a real scene or composition suited to the trades/services industry
- Include styling direction: lighting, mood, colour palette, composition
- Be 2-4 sentences, no more
- NOT include any mention of the company name or phone number in the image
- Be appropriate for: ${platformList}

Respond with ONLY the image generation prompt. No preamble, no explanation.`;

  const categoryGuide = {
    'completed-jobs': 'a professional, high-quality photo-realistic scene showing completed trade/construction work — clean, polished, satisfying result',
    'marketing':      'a bold, eye-catching marketing graphic with strong visual impact and professional design',
    'tips':           'a clean, informative graphic with a helpful, educational feel — approachable and trustworthy',
    'industry-trends':'a modern, forward-looking graphic with a tech/innovation feel',
    'team-culture':   'a warm, authentic workplace scene showing team camaraderie and professionalism',
    'campaign':       'a dynamic, campaign-style graphic with energy and visual appeal'
  };

  const userPrompt = `Create an Ideogram image prompt for this social media post:

Business: ${businessName || 'a trades business'}
Industry: ${industry || 'trades/construction'}
Post category: ${categoryGuide[category] || 'a professional marketing graphic'}
${brandColours ? `Brand colours: ${brandColours}` : ''}

Post content (use this for context but DO NOT include the text verbatim in the image):
"${(postContent || '').substring(0, 400)}"

Write a creative, specific image generation prompt that would make a compelling social media graphic to accompany this post.`;

  const response = await httpsPost(
    'api.anthropic.com',
    '/v1/messages',
    {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01'
    },
    {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }
  );

  if (response.status !== 200) {
    throw new Error(`Claude prompt generation failed: ${JSON.stringify(response.body)}`);
  }

  return response.body.content?.[0]?.text?.trim() || '';
}

// ─── ASPECT RATIO SELECTOR ───────────────────────────────────────────────────

function getAspectRatio(platforms) {
  const p = (platforms || []).map(x => x.toLowerCase());
  if (p.includes('instagram') && !p.includes('facebook') && !p.includes('linkedin')) {
    return 'ASPECT_1_1'; // Instagram square
  }
  if (p.includes('linkedin')) {
    return 'ASPECT_16_9'; // LinkedIn landscape
  }
  return 'ASPECT_4_5'; // Facebook portrait (performs best in feed)
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    userId,
    postContent,
    category,
    platforms,
    businessName,
    industry,
    brandColours,
    campaignName
  } = req.body;

  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (!postContent) return res.status(400).json({ error: 'postContent required' });

  const ideogramKey  = process.env.IDEOGRAM_API_KEY;
  const claudeKey    = process.env.CLAUDE_API_KEY;
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_SERVICE_KEY;

  if (!ideogramKey)  return res.status(500).json({ error: 'IDEOGRAM_API_KEY not configured' });
  if (!claudeKey)    return res.status(500).json({ error: 'CLAUDE_API_KEY not configured' });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {

    // ── 1. Check monthly usage cap ────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('graphics_cap, graphics_plan')
      .eq('id', userId)
      .single();

    const cap = profile?.graphics_cap ?? 20;

    // Count graphics generated this calendar month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: usedThisMonth } = await supabase
      .from('graphic_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('generated_at', monthStart.toISOString());

    const used = usedThisMonth || 0;

    if (used >= cap) {
      return res.status(200).json({
        success: false,
        capReached: true,
        used,
        cap,
        message: `You've used all ${cap} graphics for this month. Your allowance resets on the 1st.`
      });
    }

    // ── 2. Build image prompt via Claude ─────────────────────────────────
    console.log('[graphic-generate] Building image prompt...');
    const imagePrompt = await buildImagePrompt(claudeKey, {
      postContent, category, businessName, industry, platforms, brandColours
    });
    console.log('[graphic-generate] Prompt:', imagePrompt);

    // ── 3. Call Ideogram API ──────────────────────────────────────────────
    console.log('[graphic-generate] Calling Ideogram...');
    const ideogramResp = await httpsPost(
      'api.ideogram.ai',
      '/v1/ideogram-v3/generate',
      {
        'Content-Type': 'application/json',
        'Api-Key': ideogramKey
      },
      {
        prompt: imagePrompt,
        aspect_ratio: getAspectRatio(platforms),
        rendering_speed: 'BALANCED',    // TURBO | BALANCED | QUALITY
        magic_prompt_option: 'OFF',     // We write our own prompts
        negative_prompt: 'text, words, letters, watermark, logo, signature, blurry, low quality, distorted, ugly, dark, grainy',
        num_images: 1
      }
    );

    if (ideogramResp.status !== 200) {
      console.error('[graphic-generate] Ideogram error:', ideogramResp.body);
      return res.status(500).json({
        error: 'Ideogram API error',
        details: ideogramResp.body
      });
    }

    const imageUrl = ideogramResp.body?.data?.[0]?.url;
    if (!imageUrl) {
      return res.status(500).json({ error: 'No image URL returned from Ideogram' });
    }

    console.log('[graphic-generate] Ideogram returned URL:', imageUrl);

    // ── 4. Download image (URLs expire) + upload to Supabase Storage ─────
    console.log('[graphic-generate] Downloading image...');
    const { buffer, contentType } = await downloadImage(imageUrl);

    const fileName = `graphics/${userId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('marketing-assets')
      .upload(fileName, buffer, {
        contentType: contentType,
        upsert: false
      });

    if (uploadError) {
      console.error('[graphic-generate] Storage upload error:', uploadError);
      // Non-fatal fallback — use the temporary Ideogram URL
      // It will expire but at least the post gets created
      console.log('[graphic-generate] Falling back to temporary Ideogram URL');
    }

    // Get permanent public URL from Supabase Storage (or fall back to Ideogram URL)
    let permanentUrl = imageUrl;
    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from('marketing-assets')
        .getPublicUrl(fileName);
      permanentUrl = publicUrlData?.publicUrl || imageUrl;
    }

    // ── 5. Log usage ──────────────────────────────────────────────────────
    await supabase.from('graphic_usage').insert({
      user_id: userId,
      post_category: category,
      graphic_url: permanentUrl,
      prompt_used: imagePrompt
    });

    // ── 6. Save to publishing_queue ───────────────────────────────────────
    const platformArray = Array.isArray(platforms) ? platforms : (platforms || 'facebook').split(',');

    const { data: queueItem, error: queueError } = await supabase
      .from('publishing_queue')
      .insert({
        user_id: userId,
        post_content: postContent,
        graphic_url: permanentUrl,
        platform: platformArray,
        category: category || 'marketing',
        campaign_name: campaignName || null,
        status: 'pending_approval'
      })
      .select()
      .single();

    if (queueError) {
      console.error('[graphic-generate] Queue insert error:', queueError);
      // Still return success with the graphic URL even if queue insert fails
      return res.status(200).json({
        success: true,
        graphicUrl: permanentUrl,
        queueId: null,
        used: used + 1,
        cap,
        remaining: cap - used - 1,
        warning: 'Graphic created but could not save to publishing queue'
      });
    }

    return res.status(200).json({
      success: true,
      graphicUrl: permanentUrl,
      queueId: queueItem.id,
      used: used + 1,
      cap,
      remaining: cap - used - 1,
      message: 'Graphic created and added to Publishing Queue'
    });

  } catch (err) {
    console.error('[graphic-generate] Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected error' });
  }
};
