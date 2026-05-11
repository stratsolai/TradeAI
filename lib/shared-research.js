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
// Dual-term emission: every state-SMEs and region-SMEs cell across all
// five categories emits TWO queries — one with "SME" framing and one with
// "small business" framing. The Phase 2 dry-run data showed those two
// terms surface materially different content at state and region level,
// and several region-SMEs cells returned zero results on "SME" alone but
// strong results on "small business". National-SMEs cells emit a single
// "SME" query — the dry-run showed national queries return full result
// sets on "SME" alone, so dual-term there is duplication without gain.
// Industry-specific cells reference the industry directly and need no
// SME / small business framing.

const QUERY_TEMPLATES = {
  'regulatory': {
    'national-smes':     ()                            => 'Australian SME regulatory updates',
    'national-industry': ({ industry })                => `${industry} regulation Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME compliance updates`, `${stateFull} small business compliance updates`],
    'state-industry':    ({ industry, stateFull })     => `${industry} regulation ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME regulation`, `${region} small business regulation`],
    'region-industry':   ({ industry, region })        => `${industry} regulation ${region}`
  },
  'industry-news': {
    'national-smes':     ()                            => 'Australian SME news',
    'national-industry': ({ industry })                => `${industry} industry news Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME news`, `${stateFull} small business news`],
    'state-industry':    ({ industry, stateFull })     => `${industry} news ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME news`, `${region} small business news`],
    'region-industry':   ({ industry, region })        => `${industry} news ${region}`
  },
  'suppliers': {
    'national-smes':     ()                            => 'Australian SME supply chain conditions',
    'national-industry': ({ industry })                => `${industry} materials supply Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME supply chain`, `${stateFull} small business supply chain`],
    'state-industry':    ({ industry, stateFull })     => `${industry} suppliers ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME supply chain`, `${region} small business supply chain`],
    'region-industry':   ({ industry, region })        => `${industry} suppliers ${region}`
  },
  'economic': {
    'national-smes':     ()                            => 'Australian SME economic outlook',
    'national-industry': ({ industry })                => `${industry} market conditions Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME economic conditions`, `${stateFull} small business economic conditions`],
    'state-industry':    ({ industry, stateFull })     => `${industry} market ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME economic outlook`, `${region} small business economic outlook`],
    'region-industry':   ({ industry, region })        => `${industry} market ${region}`
  },
  // Technology — Phase 3.2 overhaul. The Phase 3.1 dry-run showed the
  // previous abstract-"technology" templates returned nothing the
  // curation layer valued — the two surviving technology items came
  // from non-technology queries that Haiku recategorised on content.
  // News media treats tech as events ("X launches", "Y adopts AI")
  // rather than a topic, so the new templates target specific
  // verticals (software, AI, digital tools) which read naturally to
  // Google News and surface real product / rollout / adoption stories.
  // Cell-count and dual-emit structure are preserved.
  'technology': {
    'national-smes':     ()                            => 'Australian small business AI and software adoption',
    'national-industry': ({ industry })                => `${industry} software Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME software adoption`, `${stateFull} small business AI tools`],
    'state-industry':    ({ industry, stateFull })     => `${industry} digital tools ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME software`, `${region} small business digital tools`],
    'region-industry':   ({ industry, region })        => `${industry} software ${region}`
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

// Phase 3.3: cache restructured from per-user to shared-per-query. One
// row per unique (query_type, recency, query_string) is fetched once and
// reused across all users. Per-user audit lives in
// shared_research_cache_access, not on the cache row itself.
//
// shared_research_cache RLS allows SELECT to any authenticated user and
// restricts INSERT/UPDATE/DELETE to the service role. The endpoint
// already builds a service-role Supabase client (createClient with
// SUPABASE_SERVICE_KEY) and threads it through to these helpers, so
// writes go through the service role by construction. Reads also use
// that client; service-role bypasses RLS but the RLS SELECT policy is
// in place so a user-session client would work too.

export async function readCache(supabase, cacheKey) {
  try {
    const res = await supabase
      .from('shared_research_cache')
      .select('result_payload, expires_at, created_at')
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
      .upsert(upsertRow, { onConflict: 'cache_key' });
    if (res.error) console.error('[SharedResearch] Cache write error —', res.error.message);
  } catch (e) {
    console.error('[SharedResearch] Cache write exception —', e && e.message);
  }
}

// Collects one access event per cache interaction into the events array
// the endpoint passes in. The endpoint bulk-inserts the whole array via
// a single Supabase round-trip at the end of the refresh, so a 55-query
// refresh produces one access-table insert rather than up to 55. Each
// event carries the shared refresh_id so audit rows can be grouped by
// refresh.
//
// access_type vocabulary matches the schema:
//   - 'read_hit'  : user's refresh found and used an existing cache row
//   - 'read_miss' : user's refresh found no cache row (a write usually
//                   follows immediately — the read_miss isolates the
//                   read event from the subsequent fetch+write)
//   - 'write'     : user's refresh triggered a fresh fetch and wrote a
//                   new cache row
//
// Sync function — pushes only. No DB writes happen here.

function recordCacheAccessEvent(events, { cacheKey, userId, refreshId, accessType }) {
  if (!events || !userId || !cacheKey) return;
  events.push({
    cache_key: cacheKey,
    user_id: userId,
    refresh_id: refreshId || null,
    access_type: accessType
  });
}

// ---------------------------------------------------------------------------
// Serper executor — mirrors api/bi-insights.js shape
// ---------------------------------------------------------------------------
//
// Returns a structured result object so callers can distinguish a successful
// empty response from an upstream failure. Items are normalised to the same
// { title, snippet, link, source, date } shape used elsewhere on the
// platform.
//
// Phase 3.4: retries on 429 up to twice with jittered exponential backoff
// (1.0-1.5s, then 2.0-2.5s). Jitter avoids the four-lane herd problem
// where retries all fire at the same instant and re-breach the rate limit.
// If both retries also return 429, the function returns
// { ok: false, status: 429, items: [], retries_exhausted: true } so the
// caller can surface 'rate_limited' rather than a silent zero-result.

const SERPER_429_BACKOFFS_MS = [1000, 2000]; // base values; jitter added per attempt

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSerperQuery({ query, queryType, tbs, apiKey }) {
  if (!apiKey) {
    console.error('[SharedResearch] Serper key missing');
    return { ok: false, status: 0, items: [] };
  }
  const endpoint = queryType === 'search' ? SERPER_SEARCH_ENDPOINT : SERPER_NEWS_ENDPOINT;
  const body = { q: query, gl: 'au', hl: 'en', num: SERPER_NUM };
  if (tbs) body.tbs = tbs;
  const bodyString = JSON.stringify(body);

  // Wire-level diagnostic log (temporary). Captures the exact byte sequence
  // sent on the wire so it can be compared verbatim with the
  // [DIAG-SERPER-CALL] log emitted by the standalone diagnostic endpoint
  // for the same query. Will be deleted in a follow-up instruction.
  console.log(`[PLATFORM-SERPER-CALL] endpoint: ${endpoint} | query: ${query} | body: ${bodyString}`);

  const maxAttempts = SERPER_429_BACKOFFS_MS.length + 1; // initial + 2 retries
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let resp;
    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: bodyString
      });
    } catch (e) {
      // Network-level exceptions are not retried — they're not rate-limit
      // signals, they're real failures.
      console.error('[SharedResearch] Serper exception —', 'message:', e && e.message, 'query:', query);
      console.log(`[PLATFORM-SERPER-CALL] fetch_error: ${e && e.message} | query: ${query}`);
      return { ok: false, status: 0, items: [] };
    }

    lastStatus = resp.status;

    // Read the raw text BEFORE parsing so the diagnostic log can show the
    // exact response Serper sent, byte for byte.
    let rawText = '';
    try { rawText = await resp.text(); } catch (e) { rawText = ''; }
    console.log(`[PLATFORM-SERPER-CALL] status: ${resp.status} | query: ${query} | raw_first_500: ${rawText.slice(0, 500)}`);

    // 429: retry with jittered backoff. The dispatcher already gates new
    // dispatches to ~4/s, but four concurrent lanes that all 429 at once
    // could re-burst above 5/s when their retries fire simultaneously —
    // jitter spreads the retries to avoid that.
    if (resp.status === 429 && attempt < maxAttempts) {
      const base = SERPER_429_BACKOFFS_MS[attempt - 1];
      const backoffMs = base + Math.floor(Math.random() * 500);
      console.log(`[SharedResearch] Serper 429 retry — attempt: ${attempt}, query: ${query}`);
      await sleep(backoffMs);
      continue;
    }

    if (!resp.ok) {
      console.error('[SharedResearch] Serper non-OK —', 'status:', resp.status, 'query:', query);
      const retriesExhausted = resp.status === 429;
      return { ok: false, status: resp.status, items: [], retries_exhausted: retriesExhausted };
    }

    let data;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      console.error('[SharedResearch] Serper JSON parse failed —', 'message:', e && e.message, 'query:', query);
      return { ok: false, status: resp.status, items: [] };
    }

    const raw = queryType === 'search' ? ((data && data.organic) || []) : ((data && data.news) || []);
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
    console.log(`[PLATFORM-SERPER-CALL] parsed_count: ${items.length} | query: ${query}`);
    return { ok: true, status: resp.status, items };
  }

  // Loop exited only via continue chain — all retries returned 429.
  console.error('[SharedResearch] Serper 429 retries exhausted —', 'query:', query);
  return { ok: false, status: lastStatus || 429, items: [], retries_exhausted: true };
}

// ---------------------------------------------------------------------------
// Cache-aware Serper execution
// ---------------------------------------------------------------------------
//
// Wraps a single query plan row with the cache layer. Returns:
//   { items, cache_hit, cache_age_hours, cache_key, status }
// where status is one of:
//   - 'ok'           : cache hit OR successful Serper fetch
//   - 'rate_limited' : Serper returned 429 after exhausting retries
//   - 'error'        : Serper returned another error or threw
// Cache hits and misses are logged in the platform format
//   [SharedResearch] Cache hit — query: <q>, age: <hours>
//   [SharedResearch] Cache miss — query: <q>
//
// Access events (read_hit / read_miss / write) are pushed into the
// caller-supplied `accessEvents` array. The caller bulk-inserts the
// array into shared_research_cache_access in one round-trip at the
// end of the refresh.
//
// `refreshId` tags every access event so audit rows can be grouped
// per-refresh.

export async function executeQueryWithCache({
  supabase, userId, planRow, apiKey, forceRefresh,
  accessEvents, refreshId
}) {
  const cacheKey = buildCacheKey(planRow.query, planRow.query_type, planRow.recency);
  // Per-call sub-timings — caller aggregates across the plan so the
  // handler-level timing breakdown can report cache_lookup / serper /
  // cache_write totals without sub-classing the cache layer.
  let cacheLookupMs = 0;
  let serperMs = 0;
  let cacheWriteMs = 0;

  if (!forceRefresh) {
    const tLookup = Date.now();
    const hit = await readCache(supabase, cacheKey);
    cacheLookupMs = Date.now() - tLookup;
    if (hit) {
      const ageMs = Date.now() - new Date(hit.created_at).getTime();
      const ageHours = Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10;
      console.log(`[SharedResearch] Cache hit — query: ${planRow.query}, age: ${ageHours}`);
      recordCacheAccessEvent(accessEvents, { cacheKey, userId, refreshId, accessType: 'read_hit' });
      return {
        items: hit.payload && Array.isArray(hit.payload.items) ? hit.payload.items : [],
        cache_hit: true,
        cache_age_hours: ageHours,
        cache_key: cacheKey,
        status: 'ok',
        timings: { cache_lookup_ms: cacheLookupMs, serper_ms: 0, cache_write_ms: 0 }
      };
    }
    // The read happened and found nothing — record the miss in the
    // access events before moving on to fetch. Only fires on a genuine
    // miss, not on force_refresh (force_refresh bypasses the read, so
    // there is no read event to log).
    recordCacheAccessEvent(accessEvents, { cacheKey, userId, refreshId, accessType: 'read_miss' });
  }
  console.log(`[SharedResearch] Cache miss — query: ${planRow.query}`);
  const tSerper = Date.now();
  const fresh = await runSerperQuery({
    query: planRow.query,
    queryType: planRow.query_type,
    tbs: planRow.recency,
    apiKey
  });
  serperMs = Date.now() - tSerper;

  let status;
  if (fresh.ok) status = 'ok';
  else if (fresh.retries_exhausted) status = 'rate_limited';
  else status = 'error';

  if (fresh.ok) {
    const tWrite = Date.now();
    await writeCache(supabase, {
      cache_key: cacheKey,
      query_string: planRow.query,
      query_type: planRow.query_type,
      recency: planRow.recency || null,
      lens: planRow.lens,
      category: planRow.category,
      result_payload: { items: fresh.items, fetched_at: new Date().toISOString() }
    });
    cacheWriteMs = Date.now() - tWrite;
    recordCacheAccessEvent(accessEvents, { cacheKey, userId, refreshId, accessType: 'write' });
  }
  return {
    items: fresh.items,
    cache_hit: false,
    cache_age_hours: null,
    cache_key: cacheKey,
    status,
    timings: { cache_lookup_ms: cacheLookupMs, serper_ms: serperMs, cache_write_ms: cacheWriteMs }
  };
}

// ---------------------------------------------------------------------------
// Dedup + plan-index attribution
// ---------------------------------------------------------------------------
//
// Section 12.1: aggregated raw results are deduped by URL before curation.
//
// Phase 3.1 attribution model: every tagged input item carries a
// plan_index pointing back to the originating query plan row. Dedupe
// preserves the FULL SET of plan indices per URL — so a URL that
// surfaces from queries in multiple categories, lenses, or industries
// retains every originating plan row. From the index set every other
// attribution field (category, lens, query string, industry) can be
// recovered by joining against the plan via enrichDedupedWithPlan().
//
// Previous behaviour kept only the first-seen category, which silently
// dropped attribution whenever the same URL was returned by queries in
// multiple categories — see the Phase 3 diagnostic report.

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
        plan_indices: new Set([it.plan_index])
      });
    } else {
      byLink.get(link).plan_indices.add(it.plan_index);
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
      plan_indices: [...v.plan_indices].sort((a, b) => a - b)
    });
  }
  return out;
}

// Joins each deduped item back to its originating plan rows and
// derives the attribution arrays. Output items are the input items
// plus { lenses, source_categories, source_queries, source_industries }.
// The plural lenses array is the same union the dedupe used to compute
// directly — it now lives here so all attribution arrays come from one
// authoritative join. Empty industries (industry-agnostic plan rows)
// are excluded from source_industries so the array only contains real
// industry names.

export function enrichDedupedWithPlan(dedupedItems, plan) {
  return dedupedItems.map((it) => {
    const lenses = new Set();
    const categories = new Set();
    const queries = new Set();
    const industries = new Set();
    for (const idx of it.plan_indices || []) {
      const row = plan[idx];
      if (!row) continue;
      if (row.lens) lenses.add(row.lens);
      if (row.category) categories.add(row.category);
      if (row.query) queries.add(row.query);
      if (row.industry) industries.add(row.industry);
    }
    return Object.assign({}, it, {
      lenses: [...lenses],
      source_categories: [...categories],
      source_queries: [...queries],
      source_industries: [...industries]
    });
  });
}

// ---------------------------------------------------------------------------
// Curation — Section 9
// ---------------------------------------------------------------------------
//
// Takes the deduped Serper results (from dedupByLink) and runs a Haiku
// pass that filters, structures, and lens-tags them into a clean research
// evidence set grouped by source category. This is FILTERING + STRUCTURING
// only — no analysis, no recommendations, no risk/opportunity framing
// (Section 9 of the spec is explicit that curation does not editorialise).
//
// The validation pass that runs on Haiku's output is Section 9.5: any
// fabricated URL, invalid category, invalid lens, or missing required
// field rejects the item, with the rejection reason logged in the
// platform format and surfaced back through the dry-run response so the
// owner can inspect before live writes are enabled in Phase 4.

export const CURATED_CATEGORIES = ['regulatory', 'industry-news', 'suppliers', 'economic', 'technology'];
export const CURATED_LENSES = ['national-smes', 'national-industry', 'state-smes', 'state-industry', 'region-smes', 'region-industry'];
export const SOURCE_TYPES = ['primary', 'secondary', 'association'];
const REQUIRED_CURATED_FIELDS = ['title', 'summary', 'url', 'source_name', 'category', 'lens'];

const VALID_CATEGORY_SET = new Set(CURATED_CATEGORIES);
const VALID_LENS_SET = new Set(CURATED_LENSES);
const VALID_SOURCE_TYPE_SET = new Set(SOURCE_TYPES);

// Cap on items per category in the curated output (Section 9.2). Set
// conservatively — the curation is filtering for substance, not feeding a
// firehose. Downstream consumers (ID tabs, BI Sonnet prompt) work better
// with a tight set of high-quality items.
export const ITEMS_PER_CATEGORY_CAP = 10;

// Per-item snippet truncation when feeding raw items to Haiku. Long
// snippets dominate token usage without adding curation signal — the
// title + first ~280 chars of snippet is enough for Haiku to assess
// relevance and substance.
const SNIPPET_INPUT_TRUNCATE = 280;

// Anthropic API config — mirrors api/news-digest-refresh.js so the call
// shape is consistent with how Haiku is already used on the platform.
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const CURATION_MODEL = 'claude-haiku-4-5-20251001';
const CURATION_MAX_TOKENS = 8000;

// ---------------------------------------------------------------------------
// Curation prompt
// ---------------------------------------------------------------------------
//
// System prompt teaches Haiku the matrix vocabulary, the source-typing
// rules (in line with ID's existing typing — extended to call out
// associations as their own type per Section 15), and the curation rules
// from Section 9.4.

const CURATION_SYSTEM_PROMPT = [
  'You are a research curator for StaxAI, a platform serving Australian SME businesses.',
  '',
  'Your job is to filter, structure, and clean a set of web search results into a curated research evidence set. This is FILTERING and STRUCTURING only — not analysis, not recommendation, not strategic advice.',
  '',
  'CATEGORY KEYS (use exactly these strings):',
  '- regulatory       — federal/state regulation, ATO, Fair Work, industry licensing, safety standards, compliance deadlines',
  '- industry-news    — industry-specific news, trends, market activity, notable events',
  '- suppliers        — supply chain disruption, materials availability, materials pricing, supplier consolidation, key supplier news',
  '- economic         — macroeconomic conditions, interest rates, inflation, regional economic indicators, market sentiment',
  '- technology       — industry technology trends, software adoption, AI, digital tools, productivity-enhancing innovations',
  '',
  'LENS KEYS (use exactly these strings; the lens array on each output item must be a subset of the lens array of the source input items it came from):',
  '- national-smes',
  '- national-industry',
  '- state-smes',
  '- state-industry',
  '- region-smes',
  '- region-industry',
  '',
  'SOURCE TYPES (pick exactly one per item):',
  '- primary     — government body or regulator (ATO, Fair Work Ombudsman, ASIC, AUSTRAC, state revenue offices, Treasury, Small Business Ombudsman, .gov.au domains)',
  '- association — industry, peak, or trade association (HIA, Master Builders, AILA, Landscape Association, Restaurant & Catering Australia, Master Painters, Master Plumbers, Council of Small Business Organisations, etc.)',
  '- secondary   — trade press, general media, banking and economics press (AFR, ABC, SMH, The Australian, Smart Company, Inside Small Business, bank economic teams)',
  '',
  'CURATION RULES:',
  '1. Deduplicate items that cover the same story from different URLs. Keep the higher-quality URL. Combine the lens arrays of merged items.',
  '2. SUBSTANCE TEST — drop items that do not name the specific regulation, policy, event, fact, supplier, organisation, person, or development they are reporting on. Vague titles that gesture at "changes", "what you need to know", "shake-ups", "major reforms", "key updates", or "trends to watch" without naming the underlying thing must be dropped. The summary you write must contain at least one concrete fact, name, date, figure, or named entity drawn from the title or snippet — if you cannot extract a concrete substantive claim from the title and snippet together, the item is clickbait and must be dropped. This rule subsumes listicles, SEO-driven articles, and content marketing — those forms fail the substance test by construction.',
  '3. Drop items obviously irrelevant to the user\'s business based on the Business Profile context.',
  '4. Where high-quality industry association sources appear in the input, give them appropriate prominence in the output. Soft preference — do not force association content in if it is not substantive.',
  '5. NEVER invent URLs. Every url field must be a URL that appears in the raw input items list. If you cannot identify a URL for a curated item, drop the item.',
  '6. Be factual and neutral. Do not editorialise. Do not recommend. Do not frame as risk or opportunity. Just report what the source says.',
  '7. Cap each category at ' + ITEMS_PER_CATEGORY_CAP + ' items in the output. Choose the most substantive and relevant.',
  '8. Australian English throughout (colour, organisation, recognised, etc.).',
  '',
  'OUTPUT FORMAT:',
  'Return ONLY a JSON object in this exact shape, with no preamble, no markdown fences:',
  '{',
  '  "items": [',
  '    {',
  '      "title": "Headline from the source",',
  '      "summary": "Plain-language one-to-two-sentence factual summary of the item",',
  '      "url": "https://...",',
  '      "source_name": "Publishing organisation name",',
  '      "source_domain": "example.com",',
  '      "source_type": "primary",',
  '      "lens": ["national-smes", "state-smes"],',
  '      "category": "regulatory",',
  '      "published_date": "2026-04-15"',
  '    }',
  '  ]',
  '}',
  '',
  'FIELD RULES:',
  '- title: from the source. Do not embellish.',
  '- summary: one to two sentences, factual and specific. Include numbers, dates, agency names where relevant.',
  '- url: must match exactly a url that appears in the raw input items.',
  '- source_name: the publishing organisation. Inferred from the input source field or the URL domain.',
  '- source_domain: the domain (no protocol, no www).',
  '- source_type: one of primary / association / secondary.',
  '- lens: array of one or more lens keys. Must be a subset of the lenses on the source input items.',
  '- category: one of the 5 category keys above.',
  '- published_date: ISO date string from the input item where available; otherwise null.',
  '',
  'Return ONLY the JSON object. No other text.'
].join('\n');

// ---------------------------------------------------------------------------
// Build the user message for the curation pass
// ---------------------------------------------------------------------------

export function buildCurationUserMessage(profile, dedupedItems) {
  const industries = normaliseIndustries(profile);
  const stateAbbr = (profile && profile.address_state) ? String(profile.address_state).toUpperCase() : null;
  const stateFull = stateAbbr ? AUSTRALIAN_STATES[stateAbbr] : null;
  const region = resolveRegion(profile);
  const businessSize = (profile && profile.employee_range) ? String(profile.employee_range) : null;

  // Compact key names in the items array to keep token usage tight.
  // Haiku knows to map back to the full key names on output via the
  // system prompt's OUTPUT FORMAT section. `c` is the array of source
  // categories the URL surfaced from (a URL can appear in queries from
  // multiple categories — see Phase 3.1 attribution model); Haiku is
  // free to pick the single best category for the output item based on
  // content, drawing from this array as guidance.
  const compact = dedupedItems.map((it, i) => ({
    i,
    t: it.title || '',
    s: (it.snippet || '').slice(0, SNIPPET_INPUT_TRUNCATE),
    u: it.link || '',
    src: it.source || '',
    d: it.date || null,
    c: Array.isArray(it.source_categories) ? it.source_categories : [],
    l: Array.isArray(it.lenses) ? it.lenses : []
  }));

  const profileBlock = [
    'BUSINESS PROFILE',
    'Industries: ' + (industries.length ? industries.join(' | ') : 'unspecified'),
    'State: ' + (stateFull || stateAbbr || 'unspecified'),
    'Region: ' + (region ? region.region_name : 'unspecified'),
    'Business size: ' + (businessSize || 'unspecified')
  ].join('\n');

  const itemsBlock = [
    'RAW WEB RESULTS (compact format — keys: i=index, t=title, s=snippet, u=url, src=source, d=date, c=source_categories array, l=lenses array)',
    JSON.stringify(compact)
  ].join('\n');

  return [
    profileBlock,
    '',
    itemsBlock,
    '',
    'Curate the above list per the rules in the system prompt. Return only the JSON object.'
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Run the Haiku curation pass
// ---------------------------------------------------------------------------
//
// Returns { ok, items, error, usage } where items is the parsed Haiku
// output array (NOT yet validated — validation happens separately via
// validateCuratedItems). Caller is responsible for logging usage to
// api_usage via logAnthropicUsage(). Failures (network, non-200, parse)
// produce ok=false with a populated error string and an empty items
// array. The dry-run path surfaces these errors back in the response.

export async function runCuration({ profile, dedupedItems, anthropicKey }) {
  if (!anthropicKey) {
    return { ok: false, items: [], error: 'ANTHROPIC_API_KEY missing', usage: null };
  }
  if (!Array.isArray(dedupedItems) || dedupedItems.length === 0) {
    return { ok: true, items: [], error: null, usage: null };
  }

  const userMessage = buildCurationUserMessage(profile, dedupedItems);

  let resp;
  try {
    resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: CURATION_MODEL,
        max_tokens: CURATION_MAX_TOKENS,
        system: CURATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
  } catch (e) {
    console.error('[SharedResearch] Curation fetch exception —', 'message:', e && e.message);
    return { ok: false, items: [], error: 'fetch exception: ' + (e && e.message), usage: null };
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error('[SharedResearch] Curation non-OK —', 'status:', resp.status, 'body:', errText.slice(0, 300));
    return { ok: false, items: [], error: 'non-OK status: ' + resp.status, usage: null };
  }

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    return { ok: false, items: [], error: 'response parse failed: ' + (e && e.message), usage: null };
  }

  if (data && data.error) {
    console.error('[SharedResearch] Curation API error —', JSON.stringify(data.error));
    return { ok: false, items: [], error: 'api error: ' + (data.error.message || 'unknown'), usage: data.usage || null };
  }

  const raw = (data && data.content && data.content[0] && data.content[0].text) || '';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[SharedResearch] Curation JSON parse failed —', 'message:', e && e.message, 'preview:', cleaned.slice(0, 300));
    return { ok: false, items: [], error: 'json parse failed: ' + (e && e.message), usage: data.usage || null };
  }

  const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  return { ok: true, items, error: null, usage: data.usage || null };
}

// ---------------------------------------------------------------------------
// Validation — Section 9.5
// ---------------------------------------------------------------------------
//
// Walks the Haiku output and applies the four rules from Section 9.5:
//   1. URL must exist in the raw Serper results from this run
//   2. Category must be one of the 5 valid keys
//   3. Every lens must be one of the 6 valid keys
//   4. Required fields (title, summary, url, source_name, category, lens)
//      must be present and non-empty
// Source type is also normalised — invalid source_type rejects the item.
// Each rejection is logged in the platform format and returned with the
// reason + the original item so the dry-run response can surface it.

export function validateCuratedItems(haikuItems, dedupedInputs) {
  // Build the allowed-URL set as a Map keyed on the normalised form so
  // trivial cosmetic differences between Haiku's output and the raw
  // Serper URL (trailing slash, http vs https, www. prefix, tracking
  // query params, fragments) don't false-positive as fabrication. The
  // value is the canonical raw URL so we keep an audit trail back to
  // what Serper actually returned.
  const normalisedToOriginal = new Map();
  for (const it of dedupedInputs || []) {
    if (!it || !it.link) continue;
    const norm = normaliseUrlForMatch(it.link);
    if (norm && !normalisedToOriginal.has(norm)) {
      normalisedToOriginal.set(norm, it.link);
    }
  }

  const accepted = [];
  const rejected = [];

  for (const item of haikuItems || []) {
    const result = checkValidation(item, normalisedToOriginal);
    if (result.reason) {
      const title = (item && item.title) || '';
      console.log(`[SharedResearch] Item rejected — reason: ${result.reason}, title: ${String(title).slice(0, 120)}`);
      rejected.push({ reason: result.reason, title, item });
      continue;
    }
    accepted.push(normaliseCuratedItem(item, result.normalisedUrl));
  }

  return { accepted, rejected };
}

function checkValidation(item, normalisedMap) {
  if (!item || typeof item !== 'object') return { reason: 'item is not an object' };

  // Required-field check first so missing-field rejections surface
  // a stable reason rather than a downstream error.
  for (const f of REQUIRED_CURATED_FIELDS) {
    const v = item[f];
    if (v === undefined || v === null) return { reason: `missing required field: ${f}` };
    if (typeof v === 'string' && !v.trim()) return { reason: `empty required field: ${f}` };
    if (Array.isArray(v) && v.length === 0) return { reason: `empty required field: ${f}` };
  }

  if (!VALID_CATEGORY_SET.has(item.category)) {
    return { reason: `invalid category: ${item.category}` };
  }

  const lenses = Array.isArray(item.lens) ? item.lens : [item.lens];
  for (const l of lenses) {
    if (!VALID_LENS_SET.has(l)) return { reason: `invalid lens: ${l}` };
  }

  // Fabricated-URL check uses the normalised form on both sides.
  const norm = normaliseUrlForMatch(item.url);
  if (!norm || !normalisedMap.has(norm)) return { reason: 'fabricated url' };

  // source_type defaults to "secondary" if missing/invalid — soft-fail
  // rather than rejecting the whole item, which would discard otherwise
  // useful curated content over a typing nit. The downstream consumer
  // can still see the original output via the rejection log if Haiku is
  // misbehaving on this consistently.
  return { reason: null, normalisedUrl: norm };
}

// URL normalisation for fabricated-URL matching. Returns null on parse
// failure (treated as fabricated). The function intentionally keeps the
// PATH case-sensitive — many sites have case-sensitive paths — while
// lowercasing the scheme and host. The scheme itself is dropped from
// the canonical form so http and https variants match each other; that
// is the explicit Phase 3.2 requirement.
//
// Tracking query parameters (utm_*, fbclid, gclid, ref, mc_*) are
// stripped before comparison. Non-tracking parameters are preserved
// and sorted for stable matching, so two URLs that differ only in
// parameter order still normalise to the same string.
//
// The function is exported for testing and so audit/debug code can
// independently derive the canonical form of any URL.

export function normaliseUrlForMatch(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch (e) {
    return null;
  }

  // Only http(s) URLs participate in the match — protocol-less,
  // mailto:, javascript:, etc. cannot be fabrication-checked anyway.
  const protocol = u.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return null;

  let host = u.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);

  // Strip default ports; keep non-default ports as part of the host
  // identity.
  const portPart = u.port ? ':' + u.port : '';

  // Path: preserve case (paths can be case-sensitive on the origin);
  // strip a single trailing slash unless the path is the root.
  let path = u.pathname || '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  // Query params: drop tracking-only keys, sort the rest for stability.
  const keptParams = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (isTrackingParam(k)) continue;
    keptParams.push([k, v]);
  }
  keptParams.sort((a, b) => a[0].localeCompare(b[0]));
  const query = keptParams.length
    ? '?' + keptParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';

  // Fragment is always dropped — same page, same content.
  return host + portPart + path + query;
}

function isTrackingParam(rawKey) {
  if (!rawKey) return false;
  const k = String(rawKey).toLowerCase();
  return (
    k.startsWith('utm_') ||
    k.startsWith('mc_') ||
    k === 'fbclid' ||
    k === 'gclid' ||
    k === 'ref'
  );
}

function normaliseCuratedItem(item, normalisedUrl) {
  const lenses = Array.isArray(item.lens) ? item.lens : [item.lens];
  const hasValidSourceType = VALID_SOURCE_TYPE_SET.has(item.source_type);
  const sourceType = hasValidSourceType ? item.source_type : 'secondary';
  if (!hasValidSourceType) {
    // Soft-fail visibility — if Haiku consistently mistypes source_type
    // we want to see it in the dry-run logs. Original value is rendered
    // distinctly for missing/null vs string variants so the log reads
    // the same way in both cases.
    const original = (item.source_type === undefined || item.source_type === null)
      ? '(missing)'
      : JSON.stringify(item.source_type);
    const title = String(item.title || '').slice(0, 120);
    console.log(`[SharedResearch] Source type normalised — original: ${original}, normalised: secondary, title: ${title}`);
  }
  return {
    title: String(item.title || '').trim(),
    summary: String(item.summary || '').trim(),
    // url is the original Haiku output — what we display and audit.
    // normalised_url is what we matched against — what downstream code
    // can use as a stable key. Section 9.5 says items must reference a
    // real Serper URL; preserving both lets us prove that.
    url: String(item.url || '').trim(),
    normalised_url: normalisedUrl || null,
    source_name: String(item.source_name || '').trim(),
    source_domain: String(item.source_domain || '').trim(),
    source_type: sourceType,
    lens: lenses,
    category: item.category,
    published_date: item.published_date || null
  };
}

// Groups the validated items by category so the dry-run response can
// be inspected one category at a time. Categories with zero items after
// curation are dropped from the output — Section 9.5 distinguishes
// "validation failure" (rejected items) from "no relevant items in this
// category" (legitimate empty result).

export function groupCuratedByCategory(items) {
  const out = {};
  for (const cat of CURATED_CATEGORIES) out[cat] = [];
  for (const it of items || []) {
    if (out[it.category]) out[it.category].push(it);
  }
  // Drop empty categories
  for (const cat of CURATED_CATEGORIES) {
    if (out[cat].length === 0) delete out[cat];
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

export const __TEST__ = { QUERY_TEMPLATES, AUSTRALIAN_STATES, CURATION_SYSTEM_PROMPT };
