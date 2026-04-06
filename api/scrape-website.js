module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, url } = req.body;

  if (!userId || !url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const claudeApiKey = process.env.CLAUDE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!claudeApiKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const https = require('https');

    console.log('Scraping website:', url);

    // Fetch user profile for active categories
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('industry, business_name, cl_active_categories, cl_custom_categories')
      .eq('id', userId)
      .single();
    const defaultCategories = ['Services', 'Products & Equipment', 'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Company News', 'Team & Culture', 'Community & Events'];
    const activeFromProfile = profile && profile.cl_active_categories && profile.cl_active_categories.length > 0 ? profile.cl_active_categories : defaultCategories;
    const customFromProfile = profile && profile.cl_custom_categories ? profile.cl_custom_categories : [];
    const activeCategories = activeFromProfile.concat(customFromProfile).join(', ');
    const toolIdList = 'chatbot, social, email, strategic-plan, news-digest, bi, tender, quote-enhancer, swms, customer-updates, handover-docs, review-booster, design-viz';
    const businessName = (profile && profile.business_name) || 'your business';
    const industry = (profile && profile.industry) || 'your industry';

    // Fetch the website HTML with redirect following
    const websiteHtml = await (function fetchWithRedirects(fetchUrl, maxRedirects) {
      return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) { reject(new Error('Too many redirects')); return; }
        const urlObj = new URL(fetchUrl);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; StaxAI/1.0)',
            'Accept': 'text/html'
          }
        };
        const protocol = urlObj.protocol === 'https:' ? https : require('http');
        const webReq = protocol.request(options, (webRes) => {
          if (webRes.statusCode >= 300 && webRes.statusCode < 400 && webRes.headers.location) {
            resolve(fetchWithRedirects(webRes.headers.location, maxRedirects - 1));
            return;
          }
          let data = '';
          webRes.on('data', (chunk) => { data += chunk; });
          webRes.on('end', () => resolve(data));
        });
        webReq.on('error', reject);
        webReq.setTimeout(10000, () => {
          webReq.destroy();
          reject(new Error('Request timeout'));
        });
        webReq.end();
      });
    })(url, 5);

    console.log('Website HTML fetched, analyzing with Claude...');

    // Save source to cl-assets and create cl_source_items row
    var sourceItemId = null;
    try {
      var hostname = '';
      try { hostname = new URL(url).hostname.replace(/[^a-zA-Z0-9.-]/g, '_'); } catch (e) { hostname = 'unknown'; }
      var storagePath = userId + '/website/' + Date.now() + '_' + hostname + '.html';
      await supabaseAdmin.storage.from('cl-assets').upload(storagePath, Buffer.from(websiteHtml, 'utf-8'), { contentType: 'text/html', upsert: false });
      var siResult = await supabaseAdmin
        .from('cl_source_items')
        .insert({
          user_id: userId,
          source_type: 'website',
          filename: hostname + '.html',
          file_url: storagePath,
          source_url: url,
          source_detail: { url: url },
          item_count: 0,
        })
        .select('id')
        .single();
      if (siResult.data) sourceItemId = siResult.data.id;
    } catch (e) {
      console.error('cl-assets/cl_source_items save error:', e.message);
    }

    // Use Claude to analyze the website
    const analysisPrompt = `You are analysing a business website for ${businessName} (${industry}). Extract discrete pieces of marketing-relevant content.

For each piece of content found, return a JSON object with:
- "title": short descriptive title (max 10 words)
- "body": extracted content as clean plain text, preserving factual detail
- "category": the single most relevant category from this list: ${activeCategories}
- "tool_tags": array of tool IDs that could use this content. Use only IDs from this list: ${toolIdList}
- "source_url": "${url}"

Return ONLY a valid JSON array. No preamble, no explanation, no markdown code fences. Empty array if nothing relevant found.

Website HTML:
${websiteHtml.substring(0, 50000)}`;

    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: analysisPrompt }]
    });

    const claudeResponse = await new Promise((resolve, reject) => {
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

    if (claudeResponse.error) {
      throw new Error(claudeResponse.error.message || 'Claude API error');
    }

    const aiResponse = claudeResponse.content[0].text;

    // Parse the JSON response — expect a flat array
    let items = [];
    try {
      const clean = aiResponse.replace(/```json|```/g, '').trim();
      const jsonMatch = clean.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse Claude response:', e);
    }
    if (!Array.isArray(items)) items = [];

    // Normalise categories — case-insensitive match against canonical list
    const allCategories = activeFromProfile.concat(customFromProfile);
    const categoryLookup = {};
    allCategories.forEach(function(c) { categoryLookup[c.toLowerCase()] = c; });
    function normaliseCategory(raw) {
      if (!raw) return allCategories[0] || 'general';
      const match = categoryLookup[String(raw).toLowerCase()];
      return match || allCategories[0] || 'general';
    }

    // Insert extracted content into content_library
    let itemsCount = 0;
    const scanTs = Date.now();

    for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const item = items[itemIdx];
      if (!item.title || !item.body) continue;

      const sourceRef = 'web:' + url + ':' + scanTs + ':' + itemIdx;

      const row = {
        user_id: userId,
        title: String(item.title).substring(0, 200),
        content_text: String(item.body),
        category: normaliseCategory(item.category),
        tool_tags: Array.isArray(item.tool_tags) ? item.tool_tags : [],
        status: 'pending',
        source: 'website',
        tool_source: 'scrape-website',
        source_detail: { url: url },
        source_item_id: sourceItemId,
        source_ref: sourceRef,
        created_at: new Date().toISOString()
      };

      const { error } = await supabaseAdmin.from('content_library').upsert(row, { onConflict: 'source_ref', ignoreDuplicates: true });
      if (!error) itemsCount++;
      else console.error('Insert error:', error.message);
    }

    // Update cl_source_items item_count
    if (sourceItemId && itemsCount > 0) {
      await supabaseAdmin.from('cl_source_items').update({ item_count: itemsCount }).eq('id', sourceItemId);
    }

    return res.status(200).json({
      success: true,
      count: itemsCount,
      message: itemsCount + ' item' + (itemsCount !== 1 ? 's' : '') + ' extracted from website'
    });

  } catch (error) {
    console.error('Website scraping error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

