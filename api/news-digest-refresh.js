/**
 * /api/news-digest-refresh.js
 *
 * Scans industry-specific news sources and the user's email (if connected),
 * summarises items with Claude, stores in news_digest_items table.
 *
 * ENV: CLAUDE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *      SERP_API_KEY (or BING_SEARCH_API_KEY for web search)
 */

const https  = require('https');
const { createClient } = require('@supabase/supabase-js');

// ─── HTTP HELPER ─────────────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'TradeAI/1.0 (industry news aggregator)' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject);
  });
}

function httpsPost(hostname, apiPath, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname, path: apiPath, method: 'POST',
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

// ─── TRADE-SPECIFIC SOURCE MAP ────────────────────────────────────────────────
// Maps trade types to relevant industry bodies and news sources
const TRADE_SOURCES = {
  plumbing: {
    queries: [
      'Master Plumbers Australia news', 'plumbing regulations Australia',
      'Australian plumbing industry news', 'plumbing licensing changes Australia'
    ],
    bodies: ['Master Plumbers Australia', 'MPAQ', 'Plumbing Products Industry Group']
  },
  electrical: {
    queries: [
      'Master Electricians Australia news', 'electrical licensing regulations',
      'AS/NZS electrical standards update', 'NECA electrical industry news'
    ],
    bodies: ['Master Electricians Australia', 'NECA', 'Clean Energy Council']
  },
  building: {
    queries: [
      'HIA housing industry news', 'Master Builders Australia news',
      'NCC building code update Australia', 'QBCC building industry news'
    ],
    bodies: ['HIA', 'Master Builders Australia', 'QBCC', 'ABCB']
  },
  hvac: {
    queries: [
      'AIRAH HVAC news Australia', 'refrigeration air conditioning regulations',
      'ARC tick licence update', 'HVAC industry news Australia'
    ],
    bodies: ['AIRAH', 'ARC', 'AREMA']
  },
  landscaping: {
    queries: [
      'Landscape Australia news', 'TALA landscaping industry',
      'irrigation regulations Australia', 'horticulture industry news'
    ],
    bodies: ['Landscape Australia', 'TALA', 'Nursery & Garden Industry Australia']
  },
  painting: {
    queries: [
      'Master Painters Australia news', 'painting industry regulations Australia',
      'Lead paint compliance update', 'coating industry news'
    ],
    bodies: ['Master Painters Australia', 'MPAWA', 'Dulux trade news']
  },
  carpentry: {
    queries: [
      'HIA carpentry news', 'timber building industry Australia',
      'WHS carpentry regulations', 'joinery industry news Australia'
    ],
    bodies: ['HIA', 'Master Builders', 'Australian Timber Building Association']
  },
  default: {
    queries: [
      'Australian trades industry news', 'small business news Australia',
      'WHS workplace safety update Australia', 'Fair Work construction update'
    ],
    bodies: ['Fair Work Commission', 'Safe Work Australia', 'AISC']
  }
};

function getTradeQueries(industry) {
  if (!industry) return TRADE_SOURCES.default.queries;
  const lower = industry.toLowerCase();
  for (const [key, val] of Object.entries(TRADE_SOURCES)) {
    if (lower.includes(key)) return val.queries;
  }
  // Build custom queries from industry name
  return [
    `${industry} industry news Australia`,
    `${industry} regulations update Australia`,
    `${industry} industry body news`,
    `${industry} licensing changes`
  ];
}

// ─── WEB SEARCH ──────────────────────────────────────────────────────────────
async function searchWeb(queries) {
  const serpKey = process.env.SERP_API_KEY;
  const bingKey = process.env.BING_SEARCH_API_KEY;

  const results = [];

  for (const query of queries.slice(0, 4)) {  // Limit API calls
    try {
      let items = [];

      if (serpKey) {
        // SerpAPI (Google results)
        const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&tbm=nws&num=5&tbs=qdr:w&api_key=${serpKey}`;
        const resp = await httpsGet(url);
        items = (resp.body?.news_results || []).map(r => ({
          title: r.title,
          summary: r.snippet || '',
          url: r.link,
          source: r.source,
          publishedAt: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
          sourceType: 'web'
        }));

      } else if (bingKey) {
        // Bing News Search
        const url = `https://api.bing.microsoft.com/v7.0/news/search?q=${encodeURIComponent(query)}&count=5&freshness=Week&mkt=en-AU`;
        const resp = await new Promise((resolve, reject) => {
          const parsed = new URL(url);
          https.get({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            headers: { 'Ocp-Apim-Subscription-Key': bingKey }
          }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
          }).on('error', reject);
        });
        items = (resp.body?.value || []).map(r => ({
          title: r.name,
          summary: r.description || '',
          url: r.url,
          source: r.provider?.[0]?.name || 'Bing News',
          publishedAt: r.datePublished || new Date().toISOString(),
          sourceType: 'web'
        }));
      }

      results.push(...items);
    } catch(e) {
      console.log('[news-digest] Search error for query:', query, e.message);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

// ─── EMAIL NEWS ITEMS ────────────────────────────────────────────────────────
async function getEmailNewsItems(userId, supabase) {
  try {
    // Pull industry-category emails from email_summaries that were scanned recently
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('email_summaries')
      .select('*')
      .eq('user_id', userId)
      .eq('category', 'industry')
      .gte('scanned_at', since)
      .order('received_at', { ascending: false })
      .limit(20);

    return (data || []).map(row => ({
      title: row.subject,
      summary: row.preview || '',
      url: null,
      source: row.sender,
      publishedAt: row.received_at || new Date().toISOString(),
      sourceType: 'email'
    }));
  } catch(e) {
    return [];
  }
}

// ─── CLAUDE ENRICHER ─────────────────────────────────────────────────────────
async function enrichWithClaude(items, claudeKey, industry, location) {
  if (!items.length) return [];

  const itemList = items.slice(0, 30).map((item, i) =>
    `${i}: TITLE: ${item.title} | SOURCE: ${item.source} | SUMMARY: ${(item.summary || '').substring(0, 200)}`
  ).join('\n');

  const systemPrompt = `You are an expert trade industry analyst for Australian businesses.
Analyse news items and:
1. Categorise each into: regulatory, industry-body, supplier, business, technology, or general
2. Write a clear 2-3 sentence summary in plain English relevant to a ${industry} business in ${location}
3. Score relevance 1-10 (10 = extremely relevant to a ${industry} tradesperson)
4. Filter out anything irrelevant or too generic (score under 3)

Return ONLY a JSON array, no other text:
[{"index": 0, "category": "regulatory", "summary": "Plain English summary...", "relevanceScore": 8}, ...]
Only include items with relevanceScore >= 4.`;

  try {
    const response = await httpsPost('api.anthropic.com', '/v1/messages',
      { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Analyse these news items for a ${industry} business:\n\n${itemList}` }]
      }
    );

    const text = response.body.content?.[0]?.text || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    const enriched = JSON.parse(clean);

    return enriched
      .filter(e => e.relevanceScore >= 4)
      .map(e => {
        const original = items[e.index];
        if (!original) return null;
        return { ...original, category: e.category, summary: e.summary, relevanceScore: e.relevanceScore };
      })
      .filter(Boolean);

  } catch(err) {
    console.error('[news-digest] Claude enrichment error:', err.message);
    // Fall back: return items with default categorisation
    return items.map(i => ({ ...i, category: 'general', relevanceScore: 5 }));
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, industry, location, businessName } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const claudeKey   = process.env.CLAUDE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!claudeKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log(`[news-digest] Refreshing for ${industry} in ${location}...`);

    // 1. Get web search results
    const queries = getTradeQueries(industry);
    const webItems = await searchWeb(queries);
    console.log(`[news-digest] Web search found ${webItems.length} items`);

    // 2. Get email industry items
    const emailItems = await getEmailNewsItems(userId, supabase);
    console.log(`[news-digest] Email found ${emailItems.length} industry items`);

    const allRaw = [...emailItems, ...webItems];

    if (!allRaw.length) {
      return res.status(200).json({ success: true, items: [], message: 'No news found' });
    }

    // 3. Enrich and filter with Claude
    console.log(`[news-digest] Enriching ${allRaw.length} items with Claude...`);
    const enriched = await enrichWithClaude(allRaw, claudeKey, industry, location);
    console.log(`[news-digest] ${enriched.length} items after filtering`);

    // 4. Save to database
    const toInsert = enriched.map(item => ({
      user_id: userId,
      title: item.title,
      summary: item.summary,
      category: item.category,
      source: item.source,
      source_type: item.sourceType,
      url: item.url || null,
      relevance_score: item.relevanceScore,
      published_at: item.publishedAt,
      industry
    }));

    // Delete items older than 30 days before inserting
    await supabase
      .from('news_digest_items')
      .delete()
      .eq('user_id', userId)
      .lt('published_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Insert new items (ignore duplicates by title+user)
    const { data: inserted, error: insertErr } = await supabase
      .from('news_digest_items')
      .upsert(toInsert, { onConflict: 'user_id,title', ignoreDuplicates: true })
      .select('id, title, summary, category, source, source_type, url, published_at, relevance_score');

    if (insertErr) console.error('[news-digest] Insert error:', insertErr);

    // 5. Also save high-relevance items to Content Library for use in Marketing tool
    const highRelevance = enriched.filter(i => i.relevanceScore >= 7);
    for (const item of highRelevance) {
      await supabase.from('content_library').upsert({
        user_id: userId,
        title: item.title,
        content_type: 'industry-news',
        tool_source: 'news-digest',
        status: 'approved',
        metadata: JSON.stringify({
          summary: item.summary,
          source: item.source,
          url: item.url,
          category: item.category,
          publishedAt: item.publishedAt
        })
      }, { onConflict: 'user_id,title' });
    }

    // Return inserted items with IDs
    const { data: allItems } = await supabase
      .from('news_digest_items')
      .select('*')
      .eq('user_id', userId)
      .order('published_at', { ascending: false })
      .limit(100);

    const formatted = (allItems || []).map(row => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      category: row.category,
      source: row.source,
      sourceType: row.source_type,
      url: row.url,
      publishedAt: row.published_at,
      relevanceScore: row.relevance_score
    }));

    return res.status(200).json({ success: true, items: formatted });

  } catch(err) {
    console.error('[news-digest] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
