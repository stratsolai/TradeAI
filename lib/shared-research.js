// lib/shared-research.js — server-side helpers for the Shared Research Layer
//
// Implements Phase 2 of StaxAI-Shared-Research-Layer-Spec-v1_0:
//   - Query plan generation from the 5×6 (category × lens) matrix
//   - Multi-industry handling (industry-specific lenses fire once per industry)
//   - Region resolution via lib/au-postcode-regions.js
//   - 24-hour Serper cache backed by shared_research_cache
//   - Serper executor mirroring api/bi-insights.js so Phase 5/6 swap-outs
//     stay consistent with how Serper is already called on the platform
//
// No Haiku curation in this module — that lands in Phase 3.

import crypto from 'node:crypto';
import POSTCODE_REGIONS from './au-postcode-regions.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPER_NEWS_ENDPOINT = 'https://google.serper.dev/news';
const SERPER_SEARCH_ENDPOINT = 'https://google.serper.dev/search';
const SERPER_NUM = 8;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

// Section 4 — five source categories with the per-category recency tightening
// from Section 7.3. tbs is the Serper recency parameter used on every query
// in that category.
export const CATEGORIES = {
  'regulatory':    { label: 'Regulatory & Compliance', tbs: 'qdr:m3' },
  'industry-news': { label: 'Industry News',           tbs: 'qdr:m'  },
  'suppliers':     { label: 'Supplier & Materials',    tbs: 'qdr:m'  },
  'economic':      { label: 'Economic & Market',       tbs: 'qdr:m'  },
  'technology':    { label: 'Technology & Innovation', tbs: 'qdr:m3' }
};

// Section 5 — six business-relevance lenses. Order is the canonical order
// used in spec tables and in the dry-run plan output.
export const LENSES = [
  'national-smes',
  'national-industry',
  'state-smes',
  'state-industry',
  'region-smes',
  'region-industry'
];

// ---------------------------------------------------------------------------
// Query templates — Section 7
// ---------------------------------------------------------------------------
//
// One template per matrix cell (5 categories × 6 lenses = 30). Each template
// is a function over { industry, stateFull, region } and returns either a
// query string OR an array of query strings (some cells dual-emit two
// queries — see below).
//
// Industry-specific lenses are evaluated once per industry by
// buildQueryPlan() — no comma-joined industry strings (the bug Section 7.1
// is fixing). Region lenses are skipped entirely if region resolution fails
// for the user (Section 7.2 step 4). Style follows Section 7.4: short,
// natural language, no site: operators, no quoted phrases unless necessary.
//
// Dual-term emission: in Regulatory & Compliance and Economic & Market the
// three all-SMEs lenses each emit TWO queries — one with "SME" framing and
// one with "small business" framing. The two terms surface different content
// in these categories ("small business" pulls regulator + government press;
// "SME" pulls banking + economic press) and we want both. Every other cell
// emits exactly one query.

const QUERY_TEMPLATES = {
  'regulatory': {
    'national-smes':     ()                            => ['Australian SME regulatory updates', 'Australian small business regulatory updates'],
    'national-industry': ({ industry })                => `${industry} regulation Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME compliance updates`, `${stateFull} small business compliance updates`],
    'state-industry':    ({ industry, stateFull })     => `${industry} regulation ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME regulation`, `${region} small business regulation`],
    'region-industry':   ({ industry, region })        => `${industry} regulation ${region}`
  },
  'industry-news': {
    'national-smes':     ()                            => 'Australian SME news',
    'national-industry': ({ industry })                => `${industry} industry news Australia`,
    'state-smes':        ({ stateFull })               => `${stateFull} SME news`,
    'state-industry':    ({ industry, stateFull })     => `${industry} news ${stateFull}`,
    'region-smes':       ({ region })                  => `${region} SME news`,
    'region-industry':   ({ industry, region })        => `${industry} news ${region}`
  },
  'suppliers': {
    'national-smes':     ()                            => 'Australian SME supply chain conditions',
    'national-industry': ({ industry })                => `${industry} materials supply Australia`,
    'state-smes':        ({ stateFull })               => `${stateFull} SME supply chain`,
    'state-industry':    ({ industry, stateFull })     => `${industry} suppliers ${stateFull}`,
    'region-smes':       ({ region })                  => `${region} SME supply chain`,
    'region-industry':   ({ industry, region })        => `${industry} suppliers ${region}`
  },
  'economic': {
    'national-smes':     ()                            => ['Australian SME economic outlook', 'Australian small business economic outlook'],
    'national-industry': ({ industry })                => `${industry} market conditions Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME economic conditions`, `${stateFull} small business economic conditions`],
    'state-industry':    ({ industry, stateFull })     => `${industry} market ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME economic outlook`, `${region} small business economic outlook`],
    'region-industry':   ({ industry, region })        => `${industry} market ${region}`
  },
  'technology': {
    'national-smes':     ()                            => 'Australian SME technology trends',
    'national-industry': ({ industry })                => `${industry} technology innovation Australia`,
    'state-smes':        ({ stateFull })               => `${stateFull} SME technology`,
    'state-industry':    ({ industry, stateFull })     => `${industry} technology ${stateFull}`,
    'region-smes':       ({ region })                  => `${region} SME technology`,
    'region-industry':   ({ industry, region })        => `${industry} technology ${region}`
  }
};

// Normalises a template return value to an array of strings. Lets cells
// emit either a single query (most cells) or two queries (the dual-term
// SME/small business cells in Regulatory & Compliance and Economic &
// Market) without the plan generator caring which is which.
function templateToQueries(result) {
  if (Array.isArray(result)) return result.filter(Boolean);
  if (typeof result === 'string' && result) return [result];
  return [];
}

// ---------------------------------------------------------------------------
// Region resolution — Section 7.2
// ---------------------------------------------------------------------------
//
// Resolves a Business Profile to { region_name, region_state } using the SA4
// postcode lookup. Returns null when no usable region can be derived, and
// callers must skip region lenses for that user (Section 7.2 step 4) rather
// than firing garbage queries.

export function resolveRegion(profile) {
  if (!profile) return null;
  const raw = (profile.address_postcode || '').toString().trim();
  if (!raw) return null;
  const padded = raw.length < 4 ? raw.padStart(4, '0') : raw;
  if (!/^\d{4}$/.test(padded)) return null;
  const entry = POSTCODE_REGIONS[padded];
  if (!entry || !entry.sa4 || !entry.state) return null;
  return {
    region_name: entry.sa4 + ' ' + entry.state,
    region_state: entry.state,
    sa4: entry.sa4
  };
}

// ---------------------------------------------------------------------------
// Industry normalisation
// ---------------------------------------------------------------------------
//
// The Business Profile stores industry as either a single string or an array
// of strings, capped at two by signup. Section 7.1 is explicit that industry
// arrays must NOT be comma-joined into a literal — each industry is its own
// query. This helper produces the deduped trimmed list.

export function normaliseIndustries(profile) {
  if (!profile) return [];
  const raw = profile.industry;
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') list = [raw];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const trimmed = (item || '').toString().trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Query plan — Sections 6, 7
// ---------------------------------------------------------------------------
//
// buildQueryPlan(profile) walks the 5×6 matrix and emits one row per Serper
// query. Industry-specific lenses iterate over each industry separately
// (Section 7.1). Region lenses are dropped if region resolution returned
// null (Section 7.2 step 4). Returned rows carry every metadata field the
// downstream curation pass and the dry-run inspector need.

const INDUSTRY_AGNOSTIC_LENSES = new Set(['national-smes', 'state-smes', 'region-smes']);
const REGION_LENSES = new Set(['region-smes', 'region-industry']);

export function buildQueryPlan(profile) {
  const industries = normaliseIndustries(profile);
  const stateAbbr = (profile && profile.address_state) ? String(profile.address_state).toUpperCase() : null;
  const stateFull = stateAbbr ? AUSTRALIAN_STATES[stateAbbr] : null;
  const region = resolveRegion(profile);

  const plan = [];
  for (const categoryKey of Object.keys(CATEGORIES)) {
    const cat = CATEGORIES[categoryKey];
    for (const lens of LENSES) {
      // Skip state lenses if state is unknown
      if ((lens === 'state-smes' || lens === 'state-industry') && !stateFull) continue;
      // Skip region lenses if region cannot be resolved
      if (REGION_LENSES.has(lens) && !region) continue;

      const template = QUERY_TEMPLATES[categoryKey][lens];

      if (INDUSTRY_AGNOSTIC_LENSES.has(lens)) {
        const queries = templateToQueries(template({
          stateFull,
          region: region ? region.region_name : null
        }));
        for (const q of queries) {
          plan.push({
            category: categoryKey,
            category_label: cat.label,
            lens,
            industry: null,
            query: q,
            query_type: 'news',
            recency: cat.tbs
          });
        }
      } else {
        // Industry-specific lens — fire once per industry
        for (const industry of industries) {
          const queries = templateToQueries(template({
            industry,
            stateFull,
            region: region ? region.region_name : null
          }));
          for (const q of queries) {
            plan.push({
              category: categoryKey,
              category_label: cat.label,
              lens,
              industry,
              query: q,
              query_type: 'news',
              recency: cat.tbs
            });
          }
        }
      }
    }
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Cache layer — Section 8
// ---------------------------------------------------------------------------
//
// Cache key is a deterministic SHA-256 of (query, queryType, recency). The
// row stores the lens and category that triggered the lookup so the cache
// table is independently inspectable, but those fields are NOT part of the
// key (the same Serper response should be served to every cell that fires
// the same query — and matrix cells with different lens/category are by
// construction different queries anyway).

export function buildCacheKey(query, queryType, recency) {
  const hash = crypto.createHash('sha256');
  hash.update(String(queryType || ''));
  hash.update('|');
  hash.update(String(recency || ''));
  hash.update('|');
  hash.update(String(query || ''));
  return hash.digest('hex');
}

export async function readCache(supabase, userId, cacheKey) {
  try {
    const res = await supabase
      .from('shared_research_cache')
      .select('result_payload, expires_at, created_at')
      .eq('user_id', userId)
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (res.error) {
      console.error('[SharedResearch] Cache read error —', res.error.message);
      return null;
    }
    if (!res.data) return null;
    if (res.data.expires_at && new Date(res.data.expires_at).getTime() <= Date.now()) return null;
    return {
      payload: res.data.result_payload,
      created_at: res.data.created_at,
      expires_at: res.data.expires_at
    };
  } catch (e) {
    console.error('[SharedResearch] Cache read exception —', e && e.message);
    return null;
  }
}

export async function writeCache(supabase, row) {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    const upsertRow = {
      user_id: row.user_id,
      cache_key: row.cache_key,
      query_string: row.query_string,
      query_type: row.query_type,
      recency: row.recency || null,
      lens: row.lens,
      category: row.category,
      result_payload: row.result_payload,
      expires_at: expiresAt
    };
    const res = await supabase
      .from('shared_research_cache')
      .upsert(upsertRow, { onConflict: 'user_id,cache_key' });
    if (res.error) console.error('[SharedResearch] Cache write error —', res.error.message);
  } catch (e) {
    console.error('[SharedResearch] Cache write exception —', e && e.message);
  }
}

// ---------------------------------------------------------------------------
// Serper executor — mirrors api/bi-insights.js shape
// ---------------------------------------------------------------------------
//
// Returns a structured result object so callers can distinguish a successful
// empty response from an upstream failure. Items are normalised to the same
// { title, snippet, link, source, date } shape used elsewhere on the
// platform.

export async function runSerperQuery({ query, queryType, tbs, apiKey }) {
  if (!apiKey) {
    console.error('[SharedResearch] Serper key missing');
    return { ok: false, status: 0, items: [] };
  }
  const endpoint = queryType === 'search' ? SERPER_SEARCH_ENDPOINT : SERPER_NEWS_ENDPOINT;
  const body = { q: query, gl: 'au', hl: 'en', num: SERPER_NUM };
  if (tbs) body.tbs = tbs;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      console.error('[SharedResearch] Serper non-OK —', 'status:', resp.status, 'query:', query);
      return { ok: false, status: resp.status, items: [] };
    }
    const data = await resp.json();
    const raw = queryType === 'search' ? (data.organic || []) : (data.news || []);
    const items = raw.slice(0, SERPER_NUM).map((r) => {
      let src = r.source || '';
      if (!src && r.link) {
        try { src = new URL(r.link).hostname.replace(/^www\./, ''); } catch (e) { /* noop */ }
      }
      return {
        title: r.title || '',
        snippet: r.snippet || '',
        link: r.link || '',
        source: src,
        date: r.date || null
      };
    });
    return { ok: true, status: resp.status, items };
  } catch (e) {
    console.error('[SharedResearch] Serper exception —', 'message:', e && e.message, 'query:', query);
    return { ok: false, status: 0, items: [] };
  }
}

// ---------------------------------------------------------------------------
// Cache-aware Serper execution
// ---------------------------------------------------------------------------
//
// Wraps a single query plan row with the cache layer. Returns:
//   { items, cache_hit, cache_age_hours, cache_key }
// Cache hits and misses are logged in the platform format
//   [SharedResearch] Cache hit — query: <q>, age: <hours>
//   [SharedResearch] Cache miss — query: <q>
// Misses fire a fresh Serper call and write the result to cache before
// returning. force_refresh skips the cache read but still writes the fresh
// response back into cache so subsequent callers get the new payload.

export async function executeQueryWithCache({ supabase, userId, planRow, apiKey, forceRefresh }) {
  const cacheKey = buildCacheKey(planRow.query, planRow.query_type, planRow.recency);
  if (!forceRefresh) {
    const hit = await readCache(supabase, userId, cacheKey);
    if (hit) {
      const ageMs = Date.now() - new Date(hit.created_at).getTime();
      const ageHours = Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10;
      console.log(`[SharedResearch] Cache hit — query: ${planRow.query}, age: ${ageHours}`);
      return {
        items: hit.payload && Array.isArray(hit.payload.items) ? hit.payload.items : [],
        cache_hit: true,
        cache_age_hours: ageHours,
        cache_key: cacheKey
      };
    }
  }
  console.log(`[SharedResearch] Cache miss — query: ${planRow.query}`);
  const fresh = await runSerperQuery({
    query: planRow.query,
    queryType: planRow.query_type,
    tbs: planRow.recency,
    apiKey
  });
  if (fresh.ok) {
    await writeCache(supabase, {
      user_id: userId,
      cache_key: cacheKey,
      query_string: planRow.query,
      query_type: planRow.query_type,
      recency: planRow.recency || null,
      lens: planRow.lens,
      category: planRow.category,
      result_payload: { items: fresh.items, fetched_at: new Date().toISOString() }
    });
  }
  return {
    items: fresh.items,
    cache_hit: false,
    cache_age_hours: null,
    cache_key: cacheKey
  };
}

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------
//
// Section 12.1: aggregated raw results are deduped by URL before curation.
// This helper produces { items, lensesByLink } so the curation pass (Phase 3)
// can emit lens-tag arrays per item without re-walking the full plan.

export function dedupByLink(taggedItems) {
  const byLink = new Map();
  for (const it of taggedItems) {
    const link = (it.link || '').trim();
    if (!link) continue;
    if (!byLink.has(link)) {
      byLink.set(link, {
        title: it.title,
        snippet: it.snippet,
        link,
        source: it.source,
        date: it.date,
        category: it.category,
        lenses: new Set([it.lens])
      });
    } else {
      byLink.get(link).lenses.add(it.lens);
    }
  }
  const out = [];
  for (const v of byLink.values()) {
    out.push({
      title: v.title,
      snippet: v.snippet,
      link: v.link,
      source: v.source,
      date: v.date,
      category: v.category,
      lenses: [...v.lenses]
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Misc helpers exposed for the endpoint and for tests
// ---------------------------------------------------------------------------

export function stateFullName(stateAbbr) {
  if (!stateAbbr) return null;
  return AUSTRALIAN_STATES[String(stateAbbr).toUpperCase()] || null;
}

export const __TEST__ = { QUERY_TEMPLATES, AUSTRALIAN_STATES };
