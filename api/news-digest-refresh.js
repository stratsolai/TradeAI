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

function buildSearchQueries(industry, location, categories) {
  const queries = [];
  const loc = location ? location : "Australia";
  const activeCategories = (categories || []).filter(c => c.enabled);

  const categoryTopics = {
    "regulatory": ["regulatory changes", "compliance requirements", "licensing updates", "legal obligations"],
    "industry-body": ["industry association updates", "peak body announcements", "industry standards"],
    "suppliers": ["supplier news", "product updates", "supply chain", "pricing changes"],
    "workplace-safety": ["workplace safety", "WHS OHS updates", "safety standards", "incident reports"],
    "economic-market": ["economic conditions", "interest rates", "labour market", "material costs"],
    "technology": ["new technology", "software tools", "equipment innovations", "digital tools"]
  };

  for (const cat of activeCategories) {
    const topics = categoryTopics[cat.id] || [cat.label + " news", cat.label + " updates"];
    for (const topic of topics.slice(0, 2)) {
      queries.push(industry + " " + topic + " " + loc);
      queries.push(industry + " " + topic + " Australia 2025");
    }
  }

  if (queries.length === 0) {
    queries.push(industry + " news " + loc);
    queries.push(industry + " industry updates Australia");
  }

  return queries;
}

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
async async function getEmailNewsItems(userId, supabase) {
  try {
    const { data, error } = await supabase
      .from("content_library")
      .select("id, title, body, created_at")
      .eq("user_id", userId)
      .eq("status", "approved")
      .contains("tool_tags", ["news-digest"]);

    if (error || !data || data.length === 0) return [];

    return data.map(item => ({
      title: item.title || "Business Update",
      summary: item.body ? item.body.substring(0, 300) : "",
      url: null,
      source_name: "Your Content Library",
      source_domain: "content-library",
      source_type: "email",
      category: null,
      published_at: item.created_at
    }));
  } catch (err) {
    return [];
  }
}

async function enrichWithClaude(items, claudeKey, categories) {
  const activeCategories = (categories || []).filter(c => c.enabled);
  const categoryList = activeCategories.map(c => c.id + ": " + c.label).join(", ");

  const systemPrompt = "You are a news categorisation assistant for an Australian business platform. " +
    "Categorise and summarise news items for business owners. " +
    "Prioritise authoritative sources: government bodies, regulators, peak industry associations, and established trade publications over general blogs or social media. " +
    "Flag each item source_type as: primary (government/regulator/peak body) or secondary (trade media/general press). " +
    "For email items already marked source_type email, keep that value.";

  const userPrompt = "Active categories for this user: " + (categoryList || "general") + "\n\n" +
    "For each news item below, return a JSON array where each object has:\n" +
    "- title: string (cleaned title)\n" +
    "- summary: string (2-3 sentence summary in plain Australian English)\n" +
    "- category: string (one of the active category IDs, or the closest match)\n" +
    "- source_type: string (primary, secondary, or email)\n" +
    "- source_domain: string (domain extracted from url, e.g. worksafe.vic.gov.au, or null if no url)\n\n" +
    "Also return a digest_summary object with one 2-3 sentence summary per active category ID based on the top stories in that category.\n\n" +
    "Return ONLY valid JSON in this shape:\n" +
    "{ \"items\": [...], \"digest_summary\": { \"regulatory\": \"...\", \"technology\": \"...\" } }\n\n" +
    "News items:\n" + JSON.stringify(items.map(i => ({
      title: i.title,
      url: i.url || null,
      snippet: i.snippet || i.summary || "",
      source_type: i.source_type || null
    })));

  const requestBody = JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  try {
    const responseText = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": claudeKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(requestBody)
        }
      };
      const req = https.request(options, res => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.write(requestBody);
      req.end();
    });

    const parsed = JSON.parse(responseText);
    const textContent = parsed.content && parsed.content[0] && parsed.content[0].text;
    if (!textContent) return { items: items, digest_summary: {} };

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { items: items, digest_summary: {} };

    const result = JSON.parse(jsonMatch[0]);
    const enrichedItems = (result.items || []).map((enriched, idx) => {
      const original = items[idx] || {};
      return Object.assign({}, original, {
        title: enriched.title || original.title,
        summary: enriched.summary || original.summary || "",
        category: enriched.category || original.category || null,
        source_type: enriched.source_type || original.source_type || "secondary",
        source_domain: enriched.source_domain || original.source_domain || null
      });
    });

    return { items: enrichedItems, digest_summary: result.digest_summary || {} };
  } catch (err) {
    return { items: items, digest_summary: {} };
  }
}

module.exports = async (req, res) => {
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const serpApiKey = process.env.SERP_API_KEY;

  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, industry: bodyIndustry, location: bodyLocation } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }

  // Fetch user settings (categories, cadence, overrides)
  let categories = null;
  let industryOverride = null;
  let locationOverride = null;
  try {
    const { data: settings } = await supabase
      .from("news_digest_settings")
      .select("categories, industry_override, location_override")
      .eq("user_id", userId)
      .single();
    if (settings) {
      categories = settings.categories;
      industryOverride = settings.industry_override;
      locationOverride = settings.location_override;
    }
  } catch (e) {}

  // Fetch profile for industry and location if not overridden
  let industry = industryOverride || bodyIndustry || "general business";
  let location = locationOverride || bodyLocation || "Australia";
  if (!industryOverride || !locationOverride) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("industry, location")
        .eq("user_id", userId)
        .single();
      if (profile) {
        if (!industryOverride) industry = profile.industry || industry;
        if (!locationOverride) location = profile.location || location;
      }
    } catch (e) {}
  }

  // Use default categories if none saved
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    categories = [
      { id: "regulatory", label: "Regulatory", enabled: true, is_custom: false },
      { id: "industry-body", label: "Industry Body", enabled: true, is_custom: false },
      { id: "suppliers", label: "Suppliers", enabled: true, is_custom: false },
      { id: "workplace-safety", label: "Workplace & Safety", enabled: true, is_custom: false },
      { id: "economic-market", label: "Economic & Market", enabled: true, is_custom: false },
      { id: "technology", label: "Technology", enabled: true, is_custom: false }
    ];
  }

  // Build dynamic queries from industry + location + categories
  const queries = buildSearchQueries(industry, location, categories);

  // Fetch email-sourced CL items tagged news-digest
  const emailItems = await getEmailNewsItems(userId, supabase);

  // Search web via SerpAPI
  let webItems = [];
  try {
    webItems = await searchWeb(queries, serpApiKey);
  } catch (e) {}

  const allItems = [...emailItems, ...webItems];
  if (allItems.length === 0) {
    return res.status(200).json({ message: "No items found", count: 0 });
  }

  // Enrich with Claude - dynamic categories, source_domain, digest_summary
  const { items: enrichedItems, digest_summary } = await enrichWithClaude(allItems, claudeApiKey, categories);

  // Upsert items into news_digest_items
  const upsertRows = enrichedItems.map(item => ({
    user_id: userId,
    title: item.title || "",
    summary: item.summary || "",
    category: item.category || null,
    url: item.url || null,
    source_name: item.source_name || null,
    source_domain: item.source_domain || null,
    source_type: item.source_type || "secondary",
    published_at: item.published_at || new Date().toISOString()
  }));

  const { error: upsertError } = await supabase
    .from("news_digest_items")
    .upsert(upsertRows, { onConflict: "user_id,url" });

  if (upsertError) {
    return res.status(500).json({ error: "Failed to save news items" });
  }

  // Store digest_summary back to settings
  if (digest_summary && Object.keys(digest_summary).length > 0) {
    await supabase
      .from("news_digest_settings")
      .update({
        updated_summary: digest_summary,
        summary_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId);
  }

  return res.status(200).json({
    message: "Digest refreshed",
    count: enrichedItems.length,
    digest_summary: digest_summary
  });
};
