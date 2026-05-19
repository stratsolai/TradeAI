// lib/shared-research-cache.js — cache layer, Serper executor, dedupe
//
// One of three sub-modules the Shared Research Layer is split across:
//   - shared-research-plan.js     — matrix, region, plan build
//   - shared-research-cache.js    — this file (cache, Serper, dedupe)
//   - shared-research-curation.js — Sonnet curation + validation
// All three are re-exported from lib/shared-research.js so callers
// (currently just api/shared-research-refresh.js) keep working
// unchanged.
//
// Implements Section 8 (Serper caching) and the dedupe + attribution
// model from Phase 3.1. See lib/shared-research-plan.js for the
// upstream plan rows this module consumes and
// lib/shared-research-curation.js for the downstream curation pass.

import crypto from 'node:crypto';
import { normaliseUrlForMatch } from './shared-research-curation.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPER_NEWS_ENDPOINT = 'https://google.serper.dev/news';
const SERPER_SEARCH_ENDPOINT = 'https://google.serper.dev/search';
const SERPER_SCRAPE_ENDPOINT = 'https://scrape.serper.dev';
const SERPER_NUM = 8;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Phase 3.4: Serper retries on 429 up to twice with jittered exponential
// backoff (1.0-1.5s, then 2.0-2.5s). Jitter avoids the four-lane herd
// problem where retries all fire at the same instant and re-breach the
// rate limit.
const SERPER_429_BACKOFFS_MS = [1000, 2000];

// Scrape phase — per-item Serper /scrape with caching. Article bodies
// are stable so a 7-day TTL is comfortable for daily refresh cadence;
// steady-state miss rate is ~14%. Storage cap is 5-6x the prompt budget
// (CONTENT_INPUT_TRUNCATE in lib/shared-research-curation.js) so a
// future budget change doesn't require re-scraping the cache.
const SCRAPE_TIMEOUT_MS = 10000;
const SCRAPE_RETRY_BACKOFF_MS = 1000;
const SCRAPE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRAPE_BODY_STORE_MAX = 16000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Serper rate gate — Phase 3.7
// ---------------------------------------------------------------------------
//
// Per-refresh gate that enforces a minimum spacing between consecutive
// Serper dispatches. Before Phase 3.7 this lived in the dispatcher and
// applied to every dispatch — including cache hits, which never touch
// Serper. The Phase 3.6 timing data showed cache-hit dispatches
// spending ~40s in the gate over a refresh while only ~13s in actual
// Supabase round-trips. Moving the gate here means only cache-miss
// dispatches (the ones that actually call Serper) wait for a slot.
//
// State is closed over per-refresh — the endpoint creates a fresh gate
// at the start of every refresh and passes the same instance to every
// executeQueryWithCache call. The gate's `getQueueWaitSumMs()` returns
// the total time spent waiting for slots across the refresh, which the
// endpoint surfaces in the timings response as
// cache_call_queue_wait_sum_ms.
//
// `acquire()` returns the number of ms the caller waited so per-call
// instrumentation can attribute the wait if needed. A gap of 0 (or no
// gap supplied) makes acquire() a fast no-op so tests and unthrottled
// callers don't need to special-case it.

export function makeSerperRateGate(minGapMs) {
  const gap = minGapMs || 0;
  let nextSlot = Date.now();
  let queueWaitSumMs = 0;
  return {
    async acquire() {
      if (gap <= 0) return 0;
      const now = Date.now();
      const waitMs = Math.max(0, nextSlot - now);
      nextSlot = Math.max(nextSlot, now) + gap;
      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
        queueWaitSumMs += waitMs;
      }
      return waitMs;
    },
    getQueueWaitSumMs() {
      return queueWaitSumMs;
    }
  };
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

export async function runSerperQuery({ query, queryType, tbs, apiKey, location }) {
  if (!apiKey) {
    console.error('[SharedResearch] Serper key missing');
    return { ok: false, status: 0, items: [] };
  }
  const endpoint = queryType === 'search' ? SERPER_SEARCH_ENDPOINT : SERPER_NEWS_ENDPOINT;
  // Phase 6.5 Item 2 — location is added alongside the existing gl/hl
  // ranking bias. Falls back to 'Australia' when the caller doesn't
  // supply one, matching the buildQueryPlan default.
  const body = { q: query, gl: 'au', hl: 'en', num: SERPER_NUM, location: location || 'Australia' };
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
    // Best-effort read of the response body — empty string is the
    // intentional fallback. The body is only used in the error/parse
    // paths below; an empty rawText means JSON.parse drops to null
    // and the function returns the existing { ok:false } shape with
    // the upstream HTTP status preserved.
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
        // Best-effort hostname extraction — if the URL is malformed,
        // leave src as the empty string (curation can still display
        // and audit the item without a source label).
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
// Australian-relevance filter — Phase 6.5 Item 2
// ---------------------------------------------------------------------------
//
// Applied at the executeQueryWithCache return boundary on BOTH paths
// (cache hit and cache miss), so items that fail the filter never reach
// the deduper, the curation prompt, or the validator. The cache itself
// stores RAW Serper responses — the filter is a read-time concern, not
// a write-time one. Pristine cache means:
//   - shared cache rows serve users in different geographies without
//     each user needing to re-fetch
//   - the filter can be retuned later without invalidating cache rows
//   - foreign items remain inspectable in raw form if a future audit
//     needs to look at them
//
// Test: a result passes if EITHER its link is on a .au domain OR its
// title + snippet (concatenated) contains an Australian geography
// keyword. Both tests are case-insensitive.

const AU_TLD = /:\/\/[^\/]+\.au(?:[\/:?#]|$)/i;
const AU_SIGNAL = /\b(?:australia|australian|nsw|vic|qld|wa|sa|tas|nt|act|new south wales|victoria|queensland|western australia|south australia|tasmania|northern territory|australian capital territory)\b/i;

function passesAustralianFilter(item) {
  if (!item) return false;
  if (item.link && AU_TLD.test(item.link)) return true;
  const blob = `${item.title || ''} ${item.snippet || ''}`;
  return AU_SIGNAL.test(blob);
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
  accessEvents, refreshId, serperGate
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
      // Phase 6.5 Item 2 — AU filter applied on read. Cache stays pristine;
      // foreign items live in the cache row but are dropped from the
      // returned set.
      const rawItems = hit.payload && Array.isArray(hit.payload.items) ? hit.payload.items : [];
      return {
        items: rawItems.filter(passesAustralianFilter),
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

  // Rate gate for Serper. Only awaited on the cache-miss path — cache
  // hits never get here, so they don't queue against the Serper 5 req/s
  // ceiling (Phase 3.7 fix). Wait time is captured separately via
  // serperGate.getQueueWaitSumMs() and excluded from serperMs so the
  // timing instrumentation stays clean.
  if (serperGate) await serperGate.acquire();

  const tSerper = Date.now();
  const fresh = await runSerperQuery({
    query: planRow.query,
    queryType: planRow.query_type,
    tbs: planRow.recency,
    apiKey,
    // Phase 6.5 Item 2 — per-plan-row location set by buildQueryPlan;
    // runSerperQuery falls back to 'Australia' if unset.
    location: planRow.location
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
    // Phase 6.5 Item 2 — AU filter applied on read. The writeCache call
    // above (when fresh.ok) stored the RAW items; filtering here mirrors
    // the cache-hit path so both return branches drop foreign content
    // uniformly.
    items: (fresh.items || []).filter(passesAustralianFilter),
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

// ---------------------------------------------------------------------------
// Cross-domain syndication dedup
// ---------------------------------------------------------------------------
//
// dedupByLink handles same-URL duplicates. It does NOT catch the same
// article syndicated across multiple mastheads — Nine Entertainment
// publishes identical articles under both theage.com.au and smh.com.au
// with the same /property/news/<slug>-<id>.html path; News Corp does
// the same across its mastheads. dedupByLink sees two distinct URLs
// and keeps both; the curation pass then produces two near-identical
// rows.
//
// This pass collapses items by URL path. Two items whose paths match
// (after stripping trailing slash, query string, and fragment) are
// treated as duplicates; the first-seen item is kept and the rest are
// dropped. The kept item's plan_indices are unioned with the dropped
// items' plan_indices so attribution downstream covers every query
// that surfaced the article across any masthead.
//
// URLs that fail to parse, or that have no meaningful path (just '/'),
// are kept unconditionally. The cost of preserving a possible
// duplicate is lower than the cost of dropping a non-duplicate over
// a parse error.
//
// Runs AFTER dedupByLink (operates on its output shape — items with
// a plan_indices array) and BEFORE enrichDedupedWithPlan so that the
// downstream attribution arrays are built from the merged plan_indices.
//
// Returns { items, droppedCount } so the caller can surface the new
// pass's effect in the response stats.

export function dedupBySyndicationPath(dedupedItems) {
  const byPath = new Map();
  const orderedKeys = [];
  let droppedCount = 0;
  let unparseableCounter = 0;

  for (const item of dedupedItems || []) {
    const link = (item && item.link) || '';
    let path = null;
    if (link) {
      try {
        const u = new URL(link);
        path = u.pathname || null;
        if (path && path.length > 1 && path.endsWith('/')) {
          path = path.slice(0, -1);
        }
        if (path === '/' || path === '') path = null;
      } catch (e) {
        path = null;
      }
    }

    if (!path) {
      // No usable path — keep the item with a unique key so it never
      // collides with another unparseable entry.
      const uniqueKey = '__keep_' + (unparseableCounter++);
      byPath.set(uniqueKey, Object.assign({}, item, {
        plan_indices: [...(item.plan_indices || [])]
      }));
      orderedKeys.push(uniqueKey);
      continue;
    }

    if (!byPath.has(path)) {
      // Clone so the kept item's plan_indices array is owned by this
      // pass and safe to mutate as duplicates merge in.
      byPath.set(path, Object.assign({}, item, {
        plan_indices: [...(item.plan_indices || [])]
      }));
      orderedKeys.push(path);
    } else {
      // Same path, different domain — merge plan_indices into the
      // first-seen item and drop this one.
      const kept = byPath.get(path);
      const mergedSet = new Set(kept.plan_indices);
      for (const idx of item.plan_indices || []) mergedSet.add(idx);
      kept.plan_indices = [...mergedSet].sort((a, b) => a - b);
      droppedCount++;
    }
  }

  return {
    items: orderedKeys.map((k) => byPath.get(k)),
    droppedCount
  };
}

// ---------------------------------------------------------------------------
// Serper /scrape — per-item article-body fetch
// ---------------------------------------------------------------------------
//
// Hits the dedicated scrape endpoint (separate subdomain, separate rate
// budget from /news and /search) to retrieve the full article body for
// a single URL. The body replaces Sonnet's ~150-char Serper snippet at
// curation time, giving the Substance and Topic tests substantially
// more content to evaluate against.
//
// Retry: one retry on timeout, 429, or 5xx — Serper's scrape is a
// heavier call than search, so transient failures are worth a single
// retry but not the multi-attempt backoff that /news uses for rate
// limits. Other 4xx (paywall, 401, 404) are permanent failures — no
// retry; the caller falls back to the original Serper snippet.
//
// Return shape:
//   { ok, status, body, credits, error, attempts }
// where credits is whatever Serper reports on the response (used for
// cost attribution via logSerperScrapeUsage at the caller).

export async function runSerperScrape({ url, apiKey, timeoutMs }) {
  if (!apiKey) {
    return { ok: false, status: 0, body: null, credits: 0, error: 'missing api key', attempts: 0 };
  }
  if (!url || typeof url !== 'string') {
    return { ok: false, status: 0, body: null, credits: 0, error: 'missing url', attempts: 0 };
  }

  const bodyString = JSON.stringify({ url });
  const maxAttempts = 2; // initial + 1 retry
  let lastStatus = 0;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const tHandle = setTimeout(() => controller.abort(), timeoutMs || SCRAPE_TIMEOUT_MS);

    let resp;
    try {
      resp = await fetch(SERPER_SCRAPE_ENDPOINT, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: bodyString,
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(tHandle);
      const isAbort = e && e.name === 'AbortError';
      const reason = isAbort ? 'timeout' : ('exception: ' + (e && e.message));
      lastError = reason;
      // Timeout is retryable; other network exceptions are not (they
      // signal a real connectivity failure, not a transient ceiling).
      if (isAbort && attempt < maxAttempts) {
        await sleep(SCRAPE_RETRY_BACKOFF_MS);
        continue;
      }
      return { ok: false, status: 0, body: null, credits: 0, error: reason, attempts: attempt };
    }
    clearTimeout(tHandle);

    lastStatus = resp.status;

    // 429 (rate limit) and 5xx (server error) — transient; retry once.
    if ((resp.status === 429 || resp.status >= 500) && attempt < maxAttempts) {
      lastError = 'status ' + resp.status;
      await sleep(SCRAPE_RETRY_BACKOFF_MS);
      continue;
    }

    if (!resp.ok) {
      // Permanent failure (4xx other than 429, or 5xx after retry).
      // Best-effort read of the body so the log captures Serper's error
      // text alongside the status code.
      const errText = await resp.text().catch(() => '');
      return {
        ok: false,
        status: resp.status,
        body: null,
        credits: 0,
        error: 'status ' + resp.status + (errText ? ' — ' + errText.slice(0, 200) : ''),
        attempts: attempt
      };
    }

    let data;
    try {
      data = await resp.json();
    } catch (e) {
      return {
        ok: false,
        status: resp.status,
        body: null,
        credits: 0,
        error: 'response parse failed: ' + (e && e.message),
        attempts: attempt
      };
    }

    const text = (data && typeof data.text === 'string') ? data.text : '';
    const credits = (data && typeof data.credits === 'number') ? data.credits : 0;

    if (!text || text.trim().length === 0) {
      // Serper returned no body — treat as failure so the caller falls
      // back to the snippet. Empty bodies happen on JS-only pages
      // (Serper couldn't render) and on some anti-bot redirects.
      return {
        ok: false,
        status: resp.status,
        body: null,
        credits,
        error: 'empty body',
        attempts: attempt
      };
    }

    return {
      ok: true,
      status: resp.status,
      body: text.slice(0, SCRAPE_BODY_STORE_MAX),
      credits,
      error: null,
      attempts: attempt
    };
  }

  // Loop exited via continue chain only — retries exhausted.
  return {
    ok: false,
    status: lastStatus,
    body: null,
    credits: 0,
    error: lastError || 'retries exhausted',
    attempts: maxAttempts
  };
}

// ---------------------------------------------------------------------------
// shared_research_scrape_cache read/write
// ---------------------------------------------------------------------------
//
// Per-URL article-body cache keyed by the canonical normalised form
// (so http/https, www-prefix, tracking-param, and trailing-slash
// variants all collapse to the same cache row). Same RLS pattern as
// cohorts: RLS enabled, no policies — only the service-role client
// (used by the SRL refresh handler) can read or write.

export async function readScrapeCache(supabase, normalisedUrl) {
  if (!normalisedUrl) return null;
  try {
    const res = await supabase
      .from('shared_research_scrape_cache')
      .select('body_text, original_url, credits, scraped_at, expires_at')
      .eq('url', normalisedUrl)
      .maybeSingle();
    if (res.error) {
      console.error('[SharedResearch] Scrape cache read error —', 'url:', normalisedUrl, 'message:', res.error.message);
      return null;
    }
    if (!res.data) return null;
    if (res.data.expires_at && new Date(res.data.expires_at).getTime() <= Date.now()) return null;
    return {
      body: res.data.body_text,
      original_url: res.data.original_url,
      credits: res.data.credits,
      scraped_at: res.data.scraped_at
    };
  } catch (e) {
    console.error('[SharedResearch] Scrape cache read exception —', 'url:', normalisedUrl, 'message:', e && e.message);
    return null;
  }
}

export async function writeScrapeCache(supabase, { normalisedUrl, originalUrl, body, credits }) {
  if (!normalisedUrl || !body) return;
  try {
    const now = Date.now();
    const upsertRow = {
      url: normalisedUrl,
      original_url: originalUrl || normalisedUrl,
      body_text: body,
      credits: typeof credits === 'number' ? credits : null,
      scraped_at: new Date(now).toISOString(),
      expires_at: new Date(now + SCRAPE_CACHE_TTL_MS).toISOString()
    };
    const res = await supabase
      .from('shared_research_scrape_cache')
      .upsert(upsertRow, { onConflict: 'url' });
    if (res.error) {
      console.error('[SharedResearch] Scrape cache write error —', 'url:', normalisedUrl, 'message:', res.error.message);
    }
  } catch (e) {
    console.error('[SharedResearch] Scrape cache write exception —', 'url:', normalisedUrl, 'message:', e && e.message);
  }
}

// ---------------------------------------------------------------------------
// Cache-aware scrape execution
// ---------------------------------------------------------------------------
//
// Wraps a single deduped item with the scrape cache layer. Returns:
//   { ok, body, fromCache, credits, status, error }
// where body is the scraped article text (truncated to SCRAPE_BODY_STORE_MAX)
// on success and null on failure. The caller assigns body to the deduped
// item; buildCurationUserMessage in lib/shared-research-curation.js prefers
// item.body over item.snippet at compact-keys assembly time.
//
// Items without a normalised URL or without an original URL return ok:false
// without burning a Serper credit. forceRefresh bypasses the cache read
// and re-scrapes; cache writes still happen on success.

export async function executeScrapeWithCache({ supabase, item, apiKey, forceRefresh }) {
  const normalisedUrl = item && item.normalised_url;
  const originalUrl = item && item.link;
  if (!normalisedUrl || !originalUrl) {
    return { ok: false, body: null, fromCache: false, credits: 0, status: 0, error: 'no url' };
  }

  if (!forceRefresh) {
    const hit = await readScrapeCache(supabase, normalisedUrl);
    if (hit && hit.body) {
      return { ok: true, body: hit.body, fromCache: true, credits: 0, status: 200, error: null };
    }
  }

  const result = await runSerperScrape({ url: originalUrl, apiKey });
  if (result.ok && result.body) {
    await writeScrapeCache(supabase, {
      normalisedUrl,
      originalUrl,
      body: result.body,
      credits: result.credits
    });
    return { ok: true, body: result.body, fromCache: false, credits: result.credits, status: result.status, error: null };
  }

  console.warn('[SharedResearch] Scrape failed — url: ' + originalUrl + ', reason: ' + (result.error || 'unknown') + ', attempts: ' + (result.attempts || 0));
  return { ok: false, body: null, fromCache: false, credits: result.credits || 0, status: result.status, error: result.error };
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
    // Pre-compute normalised_url once per item using the same canonical
    // normaliser the curation validator uses for the fabricated-URL
    // check. Downstream consumers (the dry-run rejection diff in
    // api/shared-research-refresh.js) read this directly so both sides
    // of the diff use the same normalised form without re-running the
    // function on hot paths.
    return Object.assign({}, it, {
      lenses: [...lenses],
      source_categories: [...categories],
      source_queries: [...queries],
      source_industries: [...industries],
      normalised_url: normaliseUrlForMatch(it.link)
    });
  });
}
