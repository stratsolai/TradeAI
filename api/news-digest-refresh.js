export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUSTRALIAN_STATES = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  SA:  'South Australia',
  WA:  'Western Australia',
  TAS: 'Tasmania',
  NT:  'Northern Territory',
  ACT: 'Australian Capital Territory'
};

function extractState(location) {
  if (!location) return null;
  var upper = String(location).toUpperCase();
  for (var abbr in AUSTRALIAN_STATES) {
    var re = new RegExp('\\b' + abbr + '\\b');
    if (re.test(upper)) return abbr;
  }
  var lower = String(location).toLowerCase();
  for (var key in AUSTRALIAN_STATES) {
    if (lower.indexOf(AUSTRALIAN_STATES[key].toLowerCase()) !== -1) return key;
  }
  return null;
}

function normaliseSources(raw) {
  if (!raw) return [];
  var list = raw;
  if (typeof list === 'string') list = list.split(/[,\n]/);
  if (!Array.isArray(list)) return [];
  return list.map(function(s) { return String(s).trim(); }).filter(Boolean);
}

function deriveDomain(link) {
  if (!link) return '';
  try { return new URL(link).hostname.replace(/^www\./, ''); }
  catch (e) { return ''; }
}

function dedupByLink(items) {
  var seen = new Set();
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var key = items[i].link;
    if (!key) { out.push(items[i]); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(items[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Serper.dev news search
// ---------------------------------------------------------------------------

async function serperNewsSearch(query) {
  if (!SERPER_API_KEY) {
    console.error('[news-digest] SERPER_API_KEY not configured');
    return [];
  }
  try {
    var response = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, gl: 'au', hl: 'en', tbs: 'qdr:w', num: 10 })
    });
    if (!response.ok) {
      var errText = await response.text().catch(function() { return ''; });
      console.error('[news-digest] Serper error:', response.status, 'query:', query, 'body:', errText.substring(0, 200));
      return [];
    }
    var data = await response.json();
    var results = Array.isArray(data.news) ? data.news : [];
    return results.map(function(r) {
      return {
        title: r.title || '',
        snippet: r.snippet || '',
        link: r.link || '',
        source_name: r.source || '',
        published_at: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
        source_origin: 'web'
      };
    });
  } catch (err) {
    console.error('[news-digest] Serper exception:', err.message, 'query:', query);
    return [];
  }
}

async function runSerperSearches(industry, location, preferredSources) {
  var year = new Date().getFullYear();
  var state = extractState(location);
  var queries = [];

  // Regulatory & Compliance — 2
  queries.push(industry + ' regulatory compliance licensing ' + location + ' Australia ' + year);
  queries.push('ATO ASIC Fair Work Commission Australia regulatory ' + year);

  // Industry News — 2
  queries.push(industry + ' industry news trends Australia ' + year);
  queries.push('Business Council of Australia state chambers of commerce SME news ' + year);

  // Supplier & Materials — 2
  queries.push(industry + ' supply chain materials pricing Australia ' + year);
  queries.push('Australia supply chain fuel freight commodities ' + year);

  // Economic & Market — 3 (region, state, national/global)
  queries.push(location + ' economic conditions business ' + year);
  queries.push((state ? state + ' state' : 'Australian state') + ' economic conditions business ' + year);
  queries.push('Australia national global economic conditions interest rates inflation ' + year);

  // Technology & Innovation — 1
  queries.push(industry + ' technology innovation digital tools Australia ' + year);

  // Preferred sources — one site-restricted query per saved source
  var sources = normaliseSources(preferredSources);
  for (var s = 0; s < sources.length; s++) {
    queries.push('site:' + sources[s] + ' ' + industry + ' Australia ' + year);
  }

  console.log('[news-digest] Running', queries.length, 'Serper searches');
  var out = [];
  for (var i = 0; i < queries.length; i++) {
    var items = await serperNewsSearch(queries[i]);
    out.push.apply(out, items);
  }
  return out;
}

// ---------------------------------------------------------------------------
// AusTender ATM search
// ---------------------------------------------------------------------------

async function fetchAusTender(industry) {
  try {
    var url = 'https://api.tenders.gov.au/?keyword=' + encodeURIComponent(industry) + '&status=open&limit=10';
    var response = await fetch(url, {
      headers: {
        'User-Agent': 'StaxAI/1.0 (news digest aggregator)',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      console.error('[news-digest] AusTender non-OK:', response.status);
      return [];
    }
    var data;
    try { data = await response.json(); }
    catch (parseErr) {
      console.error('[news-digest] AusTender JSON parse error:', parseErr.message);
      return [];
    }
    var list = Array.isArray(data && data.results) ? data.results
             : Array.isArray(data && data.approachToMarkets) ? data.approachToMarkets
             : Array.isArray(data) ? data
             : [];
    return list.slice(0, 10).map(function(atm) {
      var atmId = atm.atmId || atm.id || atm.ATMID || null;
      var link = atm.url || atm.link || (atmId ? 'https://www.tenders.gov.au/atm/Show/' + atmId : null);
      return {
        title: atm.title || atm.atmTitle || atm.name || '(Untitled ATM)',
        snippet: String(atm.description || atm.summary || atm.shortDescription || '').substring(0, 500),
        link: link,
        source_name: atm.agency || atm.publisher || 'AusTender',
        published_at: atm.publishDate || atm.publishedAt || atm.issueDate || new Date().toISOString(),
        source_origin: 'tender',
        tender_meta: {
          atm_id: atmId,
          agency: atm.agency || null,
          category: atm.category || atm.atmType || null,
          close_date: atm.closeDate || atm.closeDateTime || null,
          location: atm.location || null,
          source: 'AusTender'
        }
      };
    });
  } catch (err) {
    console.error('[news-digest] AusTender exception:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// NSW eTendering search (public API, rate-limited by IP)
// Endpoint and parameters per https://github.com/NSW-eTendering/NSW-eTendering-API wiki:
//   ?event=public.api.planning.search&type=rftEvent&rftType=published&keyword=...
// ---------------------------------------------------------------------------

async function fetchNswEtendering(industry) {
  try {
    var url = 'https://tenders.nsw.gov.au/?event=public.api.planning.search' +
              '&type=rftEvent' +
              '&rftType=published' +
              '&keyword=' + encodeURIComponent(industry);
    var response = await fetch(url, {
      headers: {
        'User-Agent': 'StaxAI/1.0 (news digest aggregator)',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      if (response.status === 429) {
        console.error('[news-digest] NSW eTendering rate limited (429) — returning empty');
      } else {
        console.error('[news-digest] NSW eTendering non-OK:', response.status);
      }
      return [];
    }
    var bodyText = await response.text();
    if (/too many requests/i.test(bodyText)) {
      console.error('[news-digest] NSW eTendering rate limited (body match) — returning empty');
      return [];
    }
    var data;
    try { data = JSON.parse(bodyText); }
    catch (parseErr) {
      console.error('[news-digest] NSW eTendering JSON parse error:', parseErr.message, 'body:', bodyText.substring(0, 200));
      return [];
    }
    var list = Array.isArray(data && data.results) ? data.results
             : Array.isArray(data && data.tenders) ? data.tenders
             : Array.isArray(data && data.RFTs) ? data.RFTs
             : Array.isArray(data && data.events) ? data.events
             : Array.isArray(data) ? data
             : [];
    return list.slice(0, 10).map(function(t) {
      var rftUuid = t.RFTUUID || t.rftUUID || t.uuid || t.id || null;
      var link = t.url || t.link || (rftUuid ? 'https://tenders.nsw.gov.au/?event=public.RFT.view&RFTUUID=' + rftUuid : null);
      return {
        title: t.title || t.RFTTitle || t.rftTitle || '(Untitled tender)',
        snippet: String(t.description || t.RFTDescription || t.shortDescription || '').substring(0, 500),
        link: link,
        source_name: t.agency || t.agencyName || t.department || 'NSW Government',
        published_at: t.publishDate || t.publishedDate || t.publishFrom || new Date().toISOString(),
        source_origin: 'tender',
        tender_meta: {
          atm_id: rftUuid,
          agency: t.agency || t.agencyName || null,
          category: t.tenderType || t.category || null,
          close_date: t.closeDate || t.closeDateTime || null,
          location: t.location || 'NSW',
          source: 'NSW eTendering'
        }
      };
    });
  } catch (err) {
    console.error('[news-digest] NSW eTendering exception:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Content Library items tagged news-digest (all source types)
// ---------------------------------------------------------------------------

async function getContentLibraryItems(userId, supabase) {
  try {
    var clRes = await supabase
      .from('content_library')
      .select('id, title, content_text, source, source_detail, created_at')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .contains('tool_tags', ['news-digest']);
    if (clRes.error) {
      console.error('[news-digest] CL fetch error:', clRes.error.message);
      return [];
    }
    var rows = Array.isArray(clRes.data) ? clRes.data : [];
    return rows.map(function(item) {
      return {
        title: item.title || 'Content Library item',
        snippet: item.content_text ? String(item.content_text).substring(0, 500) : '',
        link: null,
        source_name: 'Your Content Library',
        published_at: item.created_at || new Date().toISOString(),
        source_origin: 'cl',
        cl_id: item.id,
        cl_source: item.source || null
      };
    });
  } catch (err) {
    console.error('[news-digest] CL fetch exception:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Claude enrichment (industry-agnostic)
// ---------------------------------------------------------------------------

var NEWS_DIGEST_SYSTEM_PROMPT =
  'You are a news categorisation assistant for an Australian SME business platform. ' +
  'For each item, produce a clean title, a concise 2-3 sentence summary in plain Australian English, ' +
  'and assign it to exactly one of the six categories below using the category ID. ' +
  'Prioritise authoritative sources (government, regulators, peak industry bodies, established trade press) when labelling source_type.\n\n' +
  'CATEGORIES:\n' +
  '- regulatory: Regulatory & Compliance — laws, regulations, licensing, compliance obligations, enforcement. Includes industry-specific rules and industry-agnostic bodies (ATO, ASIC, Fair Work Commission, state regulators).\n' +
  '- industry-news: Industry News — industry developments, trends, events, body announcements. Also includes broad SME advocacy bodies (BCA, Business NSW, state chambers).\n' +
  '- suppliers: Supplier & Materials — supply chain news, pricing, shortages, logistics. Also includes broader Australian supply chain factors (fuel, freight, commodities).\n' +
  '- economic: Economic & Market Conditions — business conditions at local/regional, state, and national/global levels. Interest rates, inflation, construction activity, consumer confidence, labour market.\n' +
  '- technology: Technology & Innovation — new tools, technologies, equipment, AI applications, digital transformation for Australian SMEs.\n' +
  '- grants-tenders: Government Grants & Tenders — government grants, funding programs, rebates for Australian SMEs plus active federal and NSW government tenders.\n\n' +
  'SOURCE TYPES (pick exactly one):\n' +
  '- primary: government body, regulator, or peak industry association\n' +
  '- secondary: trade press or general media\n' +
  '- email: item already held in the user\'s Content Library\n' +
  '- tender: active government tender or ATM record\n\n' +
  'Return ONLY valid JSON in this exact shape, with no preamble, no markdown fences:\n' +
  '{\n' +
  '  "items": [\n' +
  '    { "index": number, "title": string, "summary": string, "category": string, "source_type": string, "source_domain": string }\n' +
  '  ],\n' +
  '  "digest_summary": {\n' +
  '    "regulatory": string, "industry-news": string, "suppliers": string, "economic": string, "technology": string, "grants-tenders": string\n' +
  '  }\n' +
  '}\n\n' +
  'RULES:\n' +
  '1. category must be exactly one of: regulatory, industry-news, suppliers, economic, technology, grants-tenders.\n' +
  '2. source_type must be exactly one of: primary, secondary, email, tender.\n' +
  '3. source_domain is the domain of the article URL if available, else an empty string.\n' +
  '4. summary is plain Australian English, 2-3 sentences, no exclamation marks, no hyperbole.\n' +
  '5. digest_summary has one 2-3 sentence paragraph per category covering the top themes from items in that category. If a category has no items, return an empty string for that category.\n' +
  '6. If an item is a government tender or ATM record, use category "grants-tenders" and source_type "tender".\n' +
  '7. If an item originates from the user\'s Content Library, use source_type "email".\n' +
  '8. Return ONLY the JSON object. No other text.';

async function enrichWithClaude(items) {
  if (!items.length) return { items: [], digest_summary: {} };
  if (!ANTHROPIC_API_KEY) {
    console.error('[news-digest] ANTHROPIC_API_KEY not configured — skipping enrichment');
    return { items: items, digest_summary: {} };
  }
  try {
    var compacted = items.map(function(it, i) {
      return {
        index: i,
        title: it.title || '',
        snippet: String(it.snippet || '').substring(0, 500),
        link: it.link || null,
        source_name: it.source_name || null,
        origin: it.source_origin || null
      };
    });
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        system: NEWS_DIGEST_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: 'Items to categorise and summarise:\n' + JSON.stringify(compacted) }]
      })
    });
    if (!response.ok) {
      var errText = await response.text().catch(function() { return ''; });
      console.error('[news-digest] Claude non-OK:', response.status, errText.substring(0, 300));
      return { items: items, digest_summary: {} };
    }
    var data = await response.json();
    if (data.error) {
      console.error('[news-digest] Claude API error:', JSON.stringify(data.error));
      return { items: items, digest_summary: {} };
    }
    var raw = data.content && data.content[0] ? data.content[0].text : '';
    var parsed;
    try {
      var clean = raw.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error('[news-digest] Claude JSON parse error:', parseErr.message, 'raw:', raw.substring(0, 500));
      return { items: items, digest_summary: {} };
    }
    var enrichedItems = items.map(function(original, i) {
      var enriched = (parsed.items || []).find(function(x) { return x.index === i; }) || {};
      var fallbackSourceType = original.source_origin === 'tender' ? 'tender'
                              : original.source_origin === 'cl' ? 'email'
                              : 'secondary';
      return Object.assign({}, original, {
        title: enriched.title || original.title || '',
        summary: enriched.summary || original.snippet || '',
        category: enriched.category || null,
        source_type: enriched.source_type || fallbackSourceType,
        source_domain: enriched.source_domain || deriveDomain(original.link)
      });
    });
    return { items: enrichedItems, digest_summary: parsed.digest_summary || {} };
  } catch (err) {
    console.error('[news-digest] Claude exception:', err.message);
    return { items: items, digest_summary: {} };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify JWT Bearer
  var authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  var token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised — missing bearer token' });

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  var userRes = await supabase.auth.getUser(token);
  if (userRes.error || !userRes.data || !userRes.data.user) {
    console.error('[news-digest] Auth error:', userRes.error && userRes.error.message);
    return res.status(401).json({ error: 'Unauthorised — invalid token' });
  }
  var userId = userRes.data.user.id;

  try {
    console.log('[news-digest] Refresh start — userId:', userId);

    // Industry & location — profiles table only, never body or settings overrides
    var profileRes = await supabase
      .from('profiles')
      .select('industry, location')
      .eq('id', userId)
      .single();
    if (profileRes.error) {
      console.error('[news-digest] Profile error:', profileRes.error.message);
      return res.status(500).json({ error: 'Could not load profile' });
    }
    var industry = (profileRes.data && profileRes.data.industry) || 'general business';
    var location = (profileRes.data && profileRes.data.location) || 'Australia';

    // Preferred sources from settings — only field read from settings
    var preferredSources = [];
    var settingsRes = await supabase
      .from('news_digest_settings')
      .select('preferred_sources')
      .eq('user_id', userId)
      .maybeSingle();
    if (settingsRes.error) {
      console.error('[news-digest] Settings error:', settingsRes.error.message);
    } else if (settingsRes.data) {
      preferredSources = normaliseSources(settingsRes.data.preferred_sources);
    }

    // Fetch all sources — independent failures must not stop the rest
    var results = await Promise.all([
      runSerperSearches(industry, location, preferredSources).catch(function(e) { console.error('[news-digest] Web search exception:', e.message); return []; }),
      fetchAusTender(industry).catch(function(e) { console.error('[news-digest] AusTender exception:', e.message); return []; }),
      fetchNswEtendering(industry).catch(function(e) { console.error('[news-digest] NSW eTendering exception:', e.message); return []; }),
      getContentLibraryItems(userId, supabase).catch(function(e) { console.error('[news-digest] CL fetch exception:', e.message); return []; })
    ]);
    var webItems = results[0];
    var austenderItems = results[1];
    var nswItems = results[2];
    var clItems = results[3];

    console.log('[news-digest] Fetched — web:', webItems.length, 'austender:', austenderItems.length, 'nsw:', nswItems.length, 'cl:', clItems.length);

    // Combine + dedupe by link
    var combined = webItems.concat(austenderItems, nswItems, clItems);
    var deduped = dedupByLink(combined);
    console.log('[news-digest] Deduped items:', deduped.length);

    if (deduped.length === 0) {
      return res.status(200).json({ message: 'No items found', count: 0 });
    }

    // Claude enrichment — falls back to unenriched items on any failure
    var enrichRes = await enrichWithClaude(deduped);
    var enriched = enrichRes.items;
    var digestSummary = enrichRes.digest_summary;

    // news_digest_items — store web + tender items only (CL items already live in content_library)
    var rowsToStore = enriched.filter(function(item) {
      return item.source_origin !== 'cl' && !!item.link;
    }).map(function(item) {
      return {
        user_id: userId,
        title: String(item.title || '').substring(0, 500),
        summary: item.summary || '',
        category: item.category || null,
        link: item.link,
        source_name: item.source_name || null,
        source_domain: item.source_domain || null,
        source_type: item.source_type || 'secondary',
        published_at: item.published_at || new Date().toISOString(),
        tender_meta: item.tender_meta || null
      };
    });

    if (rowsToStore.length > 0) {
      var upsertRes = await supabase
        .from('news_digest_items')
        .upsert(rowsToStore, { onConflict: 'link,user_id' });
      if (upsertRes.error) {
        console.error('[news-digest] Upsert news_digest_items error:', upsertRes.error.message);
      }
    }

    // Write category summaries + last_refreshed to news_digest_settings
    var updateRes = await supabase
      .from('news_digest_settings')
      .update({
        category_summaries: digestSummary || {},
        last_refreshed: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    if (updateRes.error) {
      console.error('[news-digest] Settings update error:', updateRes.error.message);
    }

    // Content Library write-back — Pattern B (tool-generated, always approved)
    // CL write failure must not affect the main scan outcome.
    var clPushed = 0;
    for (var i = 0; i < enriched.length; i++) {
      var item = enriched[i];
      if (item.source_origin === 'cl') continue;     // don't re-push CL-origin items
      if (!item.link) continue;                       // source_ref requires a link
      try {
        var clRow = {
          user_id: userId,
          title: String(item.title || '').substring(0, 200),
          content_text: item.summary || '',
          category: 'Industry News',
          tool_tags: ['news-digest'],
          status: 'approved',
          source: 'tool',
          tool_source: 'news-digest',
          source_ref: 'news-digest:' + item.link,
          source_detail: {
            source_name: item.source_name || null,
            source_domain: item.source_domain || null,
            source_type: item.source_type || null,
            published_at: item.published_at || null,
            url: item.link,
            tender_meta: item.tender_meta || null
          }
        };
        var clRes = await supabase
          .from('content_library')
          .upsert(clRow, { onConflict: 'source_ref', ignoreDuplicates: true });
        if (clRes.error) {
          console.error('[news-digest] CL write-back error:', clRes.error.message, 'link:', item.link);
        } else {
          clPushed++;
        }
      } catch (clErr) {
        console.error('[news-digest] CL write-back exception:', clErr.message, 'link:', item.link);
      }
    }

    console.log('[news-digest] Refresh complete — stored:', rowsToStore.length, 'cl-pushed:', clPushed, 'total-enriched:', enriched.length);
    return res.status(200).json({
      message: 'Digest refreshed',
      count: enriched.length,
      stored: rowsToStore.length,
      cl_pushed: clPushed,
      digest_summary: digestSummary
    });

  } catch (err) {
    console.error('[news-digest] Unhandled exception:', err.message || err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
