/**
 * /api/meta-post.js
 *
 * Unified Meta API — routes on req.body.action:
 *   'post'          → publish a post to Facebook Page and/or Instagram
 *   'get-insights'  → fetch post performance analytics
 *   'get-ads'       → fetch Facebook Ads campaign insights (Marketing API)
 *   'suggest-boost' → AI analyses top posts and suggests which to boost + budget
 *   'get-pages'     → return connected page + Instagram account details
 *
 * ENV: META_APP_ID, META_APP_SECRET, CLAUDE_API_KEY,
 *      SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const GRAPH_VERSION = 'v19.0';

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────

function graphGet(path, params, token) {
  const query = new URLSearchParams({ ...params, access_token: token }).toString();
  return new Promise((resolve, reject) => {
    https.get({ hostname: 'graph.facebook.com', path: `/${GRAPH_VERSION}/${path}?${query}` }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  });
}

function graphPost(path, body, token) {
  const postBody = JSON.stringify({ ...body, access_token: token });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/${GRAPH_VERSION}/${path}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postBody) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.write(postBody);
    req.end();
  });
}

function claudeRequest(apiKey, system, userMsg, maxTokens = 800) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMsg }]
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── GET USER META PROFILE ────────────────────────────────────────────────────

async function getUserMeta(userId, supabase) {
  const { data, error } = await supabase
    .from('profiles')
    .select('meta_page_id, meta_page_name, meta_page_token, instagram_account_id, instagram_username, business_name, industry, meta_connected')
    .eq('id', userId)
    .single();

  if (error || !data) throw new Error('User profile not found');
  if (!data.meta_connected) throw new Error('Meta account not connected. Please connect in Social Settings.');
  if (!data.meta_page_token) throw new Error('Facebook Page token missing. Please reconnect in Social Settings.');

  return data;
}

// ─── ACTION: POST ─────────────────────────────────────────────────────────────

async function handlePost(req, res) {
  const { userId, caption, imageUrl, platforms = ['facebook', 'instagram'], scheduledAt } = req.body;
  if (!userId || !caption) return res.status(400).json({ error: 'userId and caption required' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const profile = await getUserMeta(userId, supabase);

  const results = { facebook: null, instagram: null, errors: [] };

  // ── Facebook Page post ────────────────────────────────────────────────────
  if (platforms.includes('facebook')) {
    try {
      const fbBody = { message: caption };
      if (imageUrl) fbBody.url = imageUrl;

      const endpoint = imageUrl ? `${profile.meta_page_id}/photos` : `${profile.meta_page_id}/feed`;
      const fbResult = await graphPost(endpoint, fbBody, profile.meta_page_token);

      if (fbResult.error) {
        results.errors.push(`Facebook: ${fbResult.error.message}`);
      } else {
        results.facebook = fbResult.id;
        console.log(`[meta-post] Facebook posted: ${fbResult.id}`);
      }
    } catch(e) {
      results.errors.push(`Facebook: ${e.message}`);
    }
  }

  // ── Instagram post ────────────────────────────────────────────────────────
  if (platforms.includes('instagram') && profile.instagram_account_id) {
    try {
      if (!imageUrl) {
        results.errors.push('Instagram: image required for Instagram posts');
      } else {
        // Step 1: Create media container
        const container = await graphPost(
          `${profile.instagram_account_id}/media`,
          { image_url: imageUrl, caption },
          profile.meta_page_token
        );

        if (container.error) {
          results.errors.push(`Instagram: ${container.error.message}`);
        } else {
          // Step 2: Publish the container
          const publish = await graphPost(
            `${profile.instagram_account_id}/media_publish`,
            { creation_id: container.id },
            profile.meta_page_token
          );

          if (publish.error) {
            results.errors.push(`Instagram: ${publish.error.message}`);
          } else {
            results.instagram = publish.id;
            console.log(`[meta-post] Instagram posted: ${publish.id}`);
          }
        }
      }
    } catch(e) {
      results.errors.push(`Instagram: ${e.message}`);
    }
  }

  // ── Save to social_posts table ────────────────────────────────────────────
  const postStatus = results.facebook || results.instagram ? 'published' : 'failed';

  await supabase.from('social_posts').insert({
    user_id:      userId,
    platform:     platforms.join(','),
    caption,
    image_url:    imageUrl || null,
    status:       postStatus,
    published_at: postStatus === 'published' ? new Date().toISOString() : null,
    post_id:      results.facebook || results.instagram || null,
    metadata:     JSON.stringify({ facebook_id: results.facebook, instagram_id: results.instagram })
  });

  return res.status(200).json({
    success: postStatus === 'published',
    results,
    errors: results.errors
  });
}

// ─── ACTION: GET INSIGHTS ─────────────────────────────────────────────────────

async function handleGetInsights(req, res) {
  const { userId, period = 'week' } = req.body;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const profile = await getUserMeta(userId, supabase);

  // Fetch page-level insights
  const metrics = 'page_impressions,page_reach,page_engaged_users,page_post_engagements,page_fan_adds';
  const insights = await graphGet(
    `${profile.meta_page_id}/insights`,
    { metric: metrics, period },
    profile.meta_page_token
  );

  // Fetch recent posts with engagement data
  const posts = await graphGet(
    `${profile.meta_page_id}/posts`,
    { fields: 'id,message,created_time,attachments,insights.metric(post_impressions,post_engaged_users,post_reactions_by_type_total)', limit: 10 },
    profile.meta_page_token
  );

  return res.status(200).json({
    success: true,
    pageInsights: insights.data || [],
    recentPosts: posts.data || [],
    pageName: profile.meta_page_name
  });
}

// ─── ACTION: GET ADS ──────────────────────────────────────────────────────────

async function handleGetAds(req, res) {
  const { userId } = req.body;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const profile = await getUserMeta(userId, supabase);

  // Get Ad Account associated with the page
  const adAccounts = await graphGet(
    'me/adaccounts',
    { fields: 'id,name,account_status,currency,spend_cap,amount_spent' },
    profile.meta_page_token
  );

  if (!adAccounts.data?.length) {
    return res.status(200).json({
      success: true,
      hasAdAccount: false,
      message: 'No Facebook Ad account found. You can create one at facebook.com/ads/manager.'
    });
  }

  const adAccount = adAccounts.data[0];

  // Fetch recent campaigns
  const campaigns = await graphGet(
    `${adAccount.id}/campaigns`,
    { fields: 'id,name,status,objective,daily_budget,lifetime_budget,insights{impressions,clicks,spend,ctr,cpc,reach}', limit: 10 },
    profile.meta_page_token
  );

  return res.status(200).json({
    success: true,
    hasAdAccount: true,
    adAccount,
    campaigns: campaigns.data || []
  });
}

// ─── ACTION: SUGGEST BOOST ────────────────────────────────────────────────────

async function handleSuggestBoost(req, res) {
  const { userId } = req.body;
  const claudeKey = process.env.CLAUDE_API_KEY;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const profile = await getUserMeta(userId, supabase);

  // Fetch recent posts with insights
  const posts = await graphGet(
    `${profile.meta_page_id}/posts`,
    { fields: 'id,message,created_time,insights.metric(post_impressions,post_engaged_users,post_clicks)', limit: 20 },
    profile.meta_page_token
  );

  if (!posts.data?.length) {
    return res.status(200).json({ success: true, suggestions: [], message: 'No posts found to analyse.' });
  }

  // Format posts for Claude
  const postSummary = posts.data.map((p, i) => {
    const insights = p.insights?.data || [];
    const impressions = insights.find(d => d.name === 'post_impressions')?.values?.[0]?.value || 0;
    const engaged = insights.find(d => d.name === 'post_engaged_users')?.values?.[0]?.value || 0;
    const engagementRate = impressions > 0 ? ((engaged / impressions) * 100).toFixed(1) : '0';
    return `Post ${i+1}: "${(p.message || '').substring(0, 100)}..." | Impressions: ${impressions} | Engagement: ${engagementRate}%`;
  }).join('\n');

  const response = await claudeRequest(
    claudeKey,
    `You are a Facebook advertising advisor for ${profile.business_name}, a ${profile.industry} business in Australia.
Analyse these recent Facebook posts and identify the best candidates to boost as paid ads.
Respond ONLY with JSON: {"suggestions": [{"post_index": 0, "reason": "...", "suggested_budget_aud": 50, "suggested_duration_days": 7, "target_audience": "..."}]}`,
    `Recent posts:\n${postSummary}\n\nWhich 2-3 posts would perform best as paid ads and why?`
  );

  try {
    const text = response.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Enrich with actual post data
    const enriched = (parsed.suggestions || []).map(s => ({
      ...s,
      post: posts.data[s.post_index] || null
    }));

    return res.status(200).json({ success: true, suggestions: enriched });
  } catch(e) {
    return res.status(200).json({ success: true, suggestions: [], error: 'Could not parse AI response' });
  }
}

// ─── ACTION: GET PAGES ────────────────────────────────────────────────────────

async function handleGetPages(req, res) {
  const { userId } = req.body;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const profile = await getUserMeta(userId, supabase);

  return res.status(200).json({
    success: true,
    connected: true,
    page: { id: profile.meta_page_id, name: profile.meta_page_name },
    instagram: profile.instagram_account_id
      ? { id: profile.instagram_account_id, username: profile.instagram_username }
      : null
  });
}

// ─── MAIN ROUTER ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    if (action === 'post')           return await handlePost(req, res);
    if (action === 'get-insights')   return await handleGetInsights(req, res);
    if (action === 'get-ads')        return await handleGetAds(req, res);
    if (action === 'suggest-boost')  return await handleSuggestBoost(req, res);
    if (action === 'get-pages')      return await handleGetPages(req, res);
    return res.status(400).json({ error: 'action must be: post, get-insights, get-ads, suggest-boost, or get-pages' });
  } catch(err) {
    console.error('[meta-post]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
