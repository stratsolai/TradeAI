export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { logAnthropicUsage, logSerperUsage } from '../lib/usage-logger.js';
import { applyToolOutputMatrix } from '../lib/cl-prompts.js';

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

async function serperNewsSearch(query, userId) {
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
    // Successful Serper call — log usage for cost tracking.
    await logSerperUsage({ tool_id: 'news-digest', user_id: userId || null });
    var data = await response.json();
    var results = Array.isArray(data.news) ? data.news : [];
    return results.map(function(r) {
      var pubDate = new Date().toISOString();
      if (r.date) {
        var parsed = new Date(r.date);
        if (!isNaN(parsed.getTime())) pubDate = parsed.toISOString();
      }
      return {
        title: r.title || '',
        snippet: r.snippet || '',
        link: r.link || '',
        source_name: r.source || '',
        published_at: pubDate,
        source_origin: 'web'
      };
    });
  } catch (err) {
    console.error('[news-digest] Serper exception:', err.message, 'query:', query);
    return [];
  }
}

async function runSerperSearches(industry, location, preferredSources, userId) {
  var state = extractState(location);
  var stateFull = state ? AUSTRALIAN_STATES[state] : null;
  var queries = [];

  // 1. Regulatory & compliance — broad federal + state
  queries.push('Australia regulatory compliance business updates');

  // 2. Industry news — user's industry
  queries.push(industry + ' industry news Australia');

  // 3. Supply chain & materials costs
  queries.push('Australia supply chain materials costs');

  // 4. Economic conditions
  queries.push('Australia economic conditions business');

  // 5. Technology & innovation — user's industry
  queries.push(industry + ' technology innovation Australia');

  // 6. Grants, funding, and business opportunities
  queries.push('Australia grants funding business opportunities');

  // 7. State-specific economic and regulatory (if state known)
  if (stateFull) {
    queries.push(stateFull + ' business regulatory economic updates');
  }

  // 8. Industry-specific regulatory
  queries.push(industry + ' regulatory compliance Australia');

  // Preferred sources — one query per saved domain
  var sources = normaliseSources(preferredSources);
  for (var s = 0; s < sources.length; s++) {
    queries.push('site:' + sources[s] + ' ' + industry + ' Australia');
  }

  console.log('[news-digest] Running', queries.length, 'Serper searches');
  var out = [];
  for (var i = 0; i < queries.length; i++) {
    var items = await serperNewsSearch(queries[i], userId);
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
// Claude briefing synthesis (industry-agnostic)
// ---------------------------------------------------------------------------

var BRIEFING_SYSTEM_PROMPT =
  'You are a smart research assistant curating a business news briefing for an Australian SME owner. ' +
  'You receive raw news items and the user\'s industry. Your job is to filter for relevance, categorise ' +
  'into five categories, and synthesise the information clearly and factually.\n\n' +
  'YOUR ROLE: Intelligent information filtering and curation. You decide what information matters to ' +
  'a business owner in this industry — but you do NOT provide strategic advice, risk analysis, or ' +
  'recommendations about what to do. Present the facts clearly and let the owner decide what matters to them.\n\n' +
  'RELEVANCE FILTERING:\n' +
  '- INCLUDE information that affects this industry or Australian businesses generally, whether positive, ' +
  'negative, or neutral. Do not filter out challenging news.\n' +
  '- INCLUDE broader developments that have downstream effects (e.g. Middle East conflict affecting shipping ' +
  'costs, interest rate changes, new legislation).\n' +
  '- EXCLUDE information that is not relevant to business operations (e.g. internal tech company partnerships, ' +
  'celebrity news, political commentary without business impact).\n' +
  '- INCLUDE all relevant information comprehensively — err on the side of including rather than excluding.\n\n' +
  'For each category that has relevant items, produce:\n' +
  '- headline: a short, broad headline (under 10 words) that summarises the OVERALL theme across ALL ' +
  'bullets in this category — not one specific item. It must be broad enough to cover everything below it. ' +
  'Examples: "Major compliance deadlines and enforcement changes", "Supply costs shifting across key materials", ' +
  '"Mixed signals in economic indicators". Do NOT name one specific development if there are multiple.\n' +
  '- bullets: 3-5 synthesised information points that draw from MULTIPLE sources each — ' +
  'combine related information across sources into clear, factual summaries. ' +
  'Each bullet should cover a distinct development or theme.\n' +
  '- Each bullet must include a title field: a broad heading (4-8 words) that covers the FULL scope ' +
  'of that bullet, not just the first sentence. The title must make sense as a label for all the ' +
  'points within the bullet. Examples: "Compliance deadlines and payroll changes", ' +
  '"Construction workforce and training pressures", "Freight and fuel cost movements".\n' +
  '- Each bullet has a sources array listing the articles it draws from\n\n' +
  'CATEGORIES:\n' +
  '- regulatory: Regulatory & Compliance — new and changing laws, regulations, licensing requirements, ' +
  'compliance deadlines, enforcement actions. Federal (ATO, ASIC, Fair Work, AUSTRAC), state, ' +
  'and industry-specific. Include dates and deadlines where known.\n' +
  '- industry-news: Industry News — developments, trends, workforce changes, association announcements, ' +
  'market shifts, and significant events specific to this industry. Also general SME news that applies ' +
  'across industries.\n' +
  '- suppliers: Supplier & Materials — supply chain conditions, materials pricing, shortages, logistics ' +
  'disruptions, energy and fuel costs, freight conditions. Both industry-specific and general Australian ' +
  'supply chain factors.\n' +
  '- economic: Economic & Market Conditions — interest rates, inflation, labour market data, business ' +
  'confidence, consumer spending, property market, and conditions at national and state levels. ' +
  'Include specific figures and data points where available.\n' +
  '- technology: Technology & Innovation — new tools, platforms, equipment, AI applications, and digital ' +
  'developments relevant to this industry or to Australian SMEs generally.\n\n' +
  'WRITING STYLE:\n' +
  '- Factual and neutral. Report what is happening, not what the owner should do about it.\n' +
  '- Include specific details: dates, percentages, dollar amounts, agency names.\n' +
  '- Plain Australian English. No exclamation marks, no hyperbole, no strategic advice.\n' +
  '- Good example: "Payday Super commences 1 July 2026, requiring employers to pay super at the same ' +
  'time as wages rather than quarterly. The ATO has published guidance for payroll system updates."\n' +
  '- Bad example: "Payday Super creates compliance requirements but improves employee retention."\n\n' +
  'SOURCE TYPES for each source reference (pick exactly one):\n' +
  '- primary: government body, regulator, or peak industry association\n' +
  '- secondary: trade press or general media\n' +
  '- email: item from the user\'s Content Library\n\n' +
  'Return ONLY valid JSON in this exact shape, with no preamble, no markdown fences:\n' +
  '{\n' +
  '  "categories": [\n' +
  '    {\n' +
  '      "category": "regulatory",\n' +
  '      "headline": "Short punchy headline under 10 words",\n' +
  '      "bullets": [\n' +
  '        {\n' +
  '          "title": "Complete descriptive heading for this item",\n' +
  '          "text": "Clear factual summary synthesised from multiple sources with specific details",\n' +
  '          "sources": [\n' +
  '            { "name": "Source Name", "domain": "example.com", "url": "https://...", "type": "primary" }\n' +
  '          ]\n' +
  '        }\n' +
  '      ]\n' +
  '    }\n' +
  '  ]\n' +
  '}\n\n' +
  'RULES:\n' +
  '1. category must be exactly one of: regulatory, industry-news, suppliers, economic, technology.\n' +
  '2. Produce 3-5 bullets per category. Synthesise across sources — do not summarise one article per bullet.\n' +
  '3. Present information factually. No strategic advice, no risk/opportunity framing, no recommendations.\n' +
  '4. Include specific details — dates, figures, percentages, names — not vague summaries.\n' +
  '5. If a category has no relevant items, omit it from the array entirely.\n' +
  '6. Do not include tender or ATM items — they are handled separately.\n' +
  '7. Filter for relevance to this industry but include general business news that affects all industries.\n' +
  '8. Return ONLY the JSON object. No other text.';

async function buildBriefing(items, industry, userId) {
  if (!items.length) return [];
  if (!ANTHROPIC_API_KEY) {
    console.error('[news-digest] ANTHROPIC_API_KEY not configured — skipping briefing');
    return [];
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
    var userMessage = 'The user\'s industry is: ' + (industry || 'general business') + '\n\n' +
      'Raw news items to filter and synthesise into a briefing:\n' + JSON.stringify(compacted);
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
        system: BRIEFING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    if (!response.ok) {
      var errText = await response.text().catch(function() { return ''; });
      console.error('[news-digest] Claude non-OK:', response.status, errText.substring(0, 300));
      return [];
    }
    var data = await response.json();
    logAnthropicUsage({ tool_id: 'news-digest', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage });
    if (data.error) {
      console.error('[news-digest] Claude API error:', JSON.stringify(data.error));
      return [];
    }
    var raw = data.content && data.content[0] ? data.content[0].text : '';
    try {
      var clean = raw.replace(/```json|```/g, '').trim();
      var parsed = JSON.parse(clean);
      return Array.isArray(parsed.categories) ? parsed.categories : [];
    } catch (parseErr) {
      console.error('[news-digest] Claude JSON parse error:', parseErr.message, 'raw:', raw.substring(0, 500));
      return [];
    }
  } catch (err) {
    console.error('[news-digest] Claude exception:', err.message);
    return [];
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
      .select('industry, address_state, address_suburb')
      .eq('id', userId)
      .single();
    if (profileRes.error) {
      console.error('[news-digest] Profile error:', profileRes.error.message);
      return res.status(500).json({ error: 'Could not load profile' });
    }
    var industry = (profileRes.data && profileRes.data.industry) || 'general business';
    var suburb = (profileRes.data && profileRes.data.address_suburb) || '';
    var state = (profileRes.data && profileRes.data.address_state) || '';
    var location = [suburb, state].filter(Boolean).join(' ') || 'Australia';

    // Preferred sources from settings — only field read from settings
    var preferredSources = [];
    var settingsRes = await supabase
      .from('news_digest_settings')
      .select('preferred_sources, lookback_days')
      .eq('user_id', userId)
      .maybeSingle();
    if (settingsRes.error) {
      console.error('[news-digest] Settings error:', settingsRes.error.message);
    } else if (settingsRes.data) {
      preferredSources = normaliseSources(settingsRes.data.preferred_sources);
    }

    // Retention cleanup — delete rows older than lookback_days
    var lookbackDays = (settingsRes.data && parseInt(settingsRes.data.lookback_days)) || 180;
    var cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    try {
      var delBriefings = await supabase
        .from('news_digest_briefings')
        .delete()
        .eq('user_id', userId)
        .lt('refreshed_at', cutoffDate);
      if (delBriefings.error) console.error('[news-digest] Retention cleanup briefings error:', delBriefings.error.message);

      var delTenders = await supabase
        .from('news_digest_tenders')
        .delete()
        .eq('user_id', userId)
        .lt('refreshed_at', cutoffDate);
      if (delTenders.error) console.error('[news-digest] Retention cleanup tenders error:', delTenders.error.message);

      var delCl = await supabase
        .from('content_library')
        .delete()
        .eq('user_id', userId)
        .eq('tool_source', 'news-digest')
        .lt('created_at', cutoffDate);
      if (delCl.error) console.error('[news-digest] Retention cleanup CL error:', delCl.error.message);

      console.log('[news-digest] Retention cleanup complete — cutoff:', cutoffDate, 'lookback:', lookbackDays, 'days');
    } catch (cleanupErr) {
      console.error('[news-digest] Retention cleanup exception:', cleanupErr.message);
    }

    // Fetch all sources — independent failures must not stop the rest
    var results = await Promise.all([
      runSerperSearches(industry, location, preferredSources, userId).catch(function(e) { console.error('[news-digest] Web search exception:', e.message); return []; }),
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

    // Separate tenders from non-tenders before Claude
    var tenderItems = deduped.filter(function(item) { return item.source_origin === 'tender'; });
    var newsItems = deduped.filter(function(item) { return item.source_origin !== 'tender'; });

    // Build briefing from non-tender items via Claude
    var briefingCategories = await buildBriefing(newsItems, industry, userId);
    console.log('[news-digest] Briefing categories returned:', briefingCategories.length);

    // Upsert each category briefing to news_digest_briefings
    var now = new Date().toISOString();
    for (var b = 0; b < briefingCategories.length; b++) {
      var cat = briefingCategories[b];
      var briefingRow = {
        user_id: userId,
        category: cat.category,
        headline: cat.headline || '',
        bullets: cat.bullets || [],
        refreshed_at: now
      };
      var bRes = await supabase
        .from('news_digest_briefings')
        .upsert(briefingRow, { onConflict: 'user_id,category' });
      if (bRes.error) {
        console.error('[news-digest] Upsert briefing error:', bRes.error.message, 'category:', cat.category);
      }
    }

    // Delete all existing tenders for this user, then insert fresh batch
    var delTendersRes = await supabase
      .from('news_digest_tenders')
      .delete()
      .eq('user_id', userId);
    if (delTendersRes.error) {
      console.error('[news-digest] Delete tenders error:', delTendersRes.error.message);
    }

    if (tenderItems.length > 0) {
      var tenderRows = tenderItems.map(function(t) {
        return {
          user_id: userId,
          title: String(t.title || '').substring(0, 500),
          url: t.link || null,
          agency: (t.tender_meta && t.tender_meta.agency) || t.source_name || null,
          category: (t.tender_meta && t.tender_meta.category) || null,
          close_date: (t.tender_meta && t.tender_meta.close_date) || null,
          location: (t.tender_meta && t.tender_meta.location) || null,
          description: (t.snippet || '').substring(0, 1000),
          source: (t.tender_meta && t.tender_meta.source) || 'AusTender',
          refreshed_at: now
        };
      });
      var tRes = await supabase
        .from('news_digest_tenders')
        .insert(tenderRows);
      if (tRes.error) {
        console.error('[news-digest] Insert tenders error:', tRes.error.message);
      }
    }

    var updateRes = await supabase
      .from('news_digest_settings')
      .update({
        summary_generated_at: now,
        updated_at: now
      })
      .eq('user_id', userId);
    if (updateRes.error) {
      console.error('[news-digest] Settings update error:', updateRes.error.message);
    }

    // CL write-back — Pattern B (tool-generated, always approved)
    // CL write failure must not affect the main refresh outcome.
    var clPushed = 0;

    // One CL row per category briefing
    for (var ci = 0; ci < briefingCategories.length; ci++) {
      var bc = briefingCategories[ci];
      try {
        var bulletTexts = (bc.bullets || []).map(function(bl) { return bl.text || ''; }).join('\n\n');
        var clBriefingRow = {
          user_id: userId,
          title: String(bc.headline || bc.category || '').substring(0, 200),
          content_text: (bc.headline || '') + '\n\n' + bulletTexts,
          category: 'Industry News',
          tool_tags: applyToolOutputMatrix('news-digest'),
          status: 'approved',
          source: 'tool',
          tool_source: 'news-digest',
          source_ref: 'news-digest-briefing:' + bc.category + ':' + userId
        };
        var clBRes = await supabase
          .from('content_library')
          .upsert(clBriefingRow, { onConflict: 'source_ref' });
        if (clBRes.error) {
          console.error('[news-digest] CL briefing write error:', clBRes.error.message, 'category:', bc.category);
        } else {
          clPushed++;
        }
      } catch (clBErr) {
        console.error('[news-digest] CL briefing write exception:', clBErr.message, 'category:', bc.category);
      }
    }

    // One CL row per tender
    for (var ti = 0; ti < tenderItems.length; ti++) {
      var tender = tenderItems[ti];
      if (!tender.link) continue;
      try {
        var tAgency = (tender.tender_meta && tender.tender_meta.agency) || tender.source_name || '';
        var tClose = (tender.tender_meta && tender.tender_meta.close_date) || '';
        var tLocation = (tender.tender_meta && tender.tender_meta.location) || '';
        var tDesc = tender.snippet || '';
        var contentParts = [];
        if (tAgency) contentParts.push('Agency: ' + tAgency);
        if (tClose) contentParts.push('Close date: ' + tClose);
        if (tLocation) contentParts.push('Location: ' + tLocation);
        if (tDesc) contentParts.push(tDesc);
        var clTenderRow = {
          user_id: userId,
          title: String(tender.title || '').substring(0, 200),
          content_text: contentParts.join('\n'),
          category: 'Industry News',
          tool_tags: applyToolOutputMatrix('news-digest'),
          status: 'approved',
          source: 'tool',
          tool_source: 'news-digest',
          source_ref: 'news-digest-tender:' + tender.link
        };
        var clTRes = await supabase
          .from('content_library')
          .upsert(clTenderRow, { onConflict: 'source_ref' });
        if (clTRes.error) {
          console.error('[news-digest] CL tender write error:', clTRes.error.message, 'url:', tender.link);
        } else {
          clPushed++;
        }
      } catch (clTErr) {
        console.error('[news-digest] CL tender write exception:', clTErr.message, 'url:', tender.link);
      }
    }

    console.log('[news-digest] Refresh complete — briefings:', briefingCategories.length, 'tenders:', tenderItems.length, 'cl-pushed:', clPushed);
    return res.status(200).json({
      message: 'Digest refreshed',
      briefings: briefingCategories.length,
      tenders: tenderItems.length,
      cl_pushed: clPushed
    });

  } catch (err) {
    console.error('[news-digest] Unhandled exception:', err.message || err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
