// lib/shared-research-cache.js — cache layer, Serper executor, dedupe
//
// One of three sub-modules the Shared Research Layer is split across:
//   - shared-research-plan.js     — matrix, region, plan build
//   - shared-research-cache.js    — this file (cache, Serper, dedupe)
//   - shared-research-curation.js — Haiku curation + validation
// All three are re-exported from lib/shared-research.js so callers
// (currently just api/shared-research-refresh.js) keep working
// unchanged.
//
// Implements Section 8 (Serper caching) and the dedupe + attribution
// model from Phase 3.1. See lib/shared-research-plan.js for the
// upstream plan rows this module consumes and
// lib/shared-research-curation.js for the downstream curation pass.

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPER_NEWS_ENDPOINT = 'https://google.serper.dev/news';
const SERPER_SEARCH_ENDPOINT = 'https://google.serper.dev/search';
const SERPER_NUM = 8;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Phase 3.4: Serper retries on 429 up to twice with jittered exponential
// backoff (1.0-1.5s, then 2.0-2.5s). Jitter avoids the four-lane herd
// problem where retries all fire at the same instant and re-breach the
// rate limit.
const SERPER_429_BACKOFFS_MS = [1000, 2000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Cache key
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

// ---------------------------------------------------------------------------
// shared_research_cache read/write
// ---------------------------------------------------------------------------
//
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

// ---------------------------------------------------------------------------
// Cache access events
// ---------------------------------------------------------------------------
//
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
// Phase 3.4: retries on 429 up to twice with jittered exponential backoff.
// If both retries also return 429, the function returns
// { ok: false, status: 429, items: [], retries_exhausted: true } so the
// caller can surface 'rate_limited' rather than a silent zero-result.

export async function runSerperQuery({ query, queryType, tbs, apiKey }) {
  if (!apiKey) {
    console.error('[SharedResearch] Serper key missing');
    return { ok: false, status: 0, items: [] };
  }
  const endpoint = queryType === 'search' ? SERPER_SEARCH_ENDPOINT : SERPER_NEWS_ENDPOINT;
  const body = { q: query, gl: 'au', hl: 'en', num: SERPER_NUM };
  if (tbs) body.tbs = tbs;
  const bodyString = JSON.stringify(body);

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
      return { ok: false, status: 0, items: [] };
    }

    lastStatus = resp.status;

    let rawText = '';
    try { rawText = await resp.text(); } catch (e) { rawText = ''; }

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
//   { items, cache_hit, cache_age_hours, cache_key, status, timings }
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
