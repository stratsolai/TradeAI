// api/shared-research-refresh.js — Phase 2 endpoint shell
//
// Implements Section 12 of StaxAI-Shared-Research-Layer-Spec-v1_0 in the
// shape required by Phase 2:
//
//   - JWT auth + supabase.auth.getUser() (Section 2.4)
//   - Build the query plan from the Business Profile via lib/shared-research.js
//   - Run every query through the 24-hour Serper cache layer (Section 8)
//   - Dedup raw results by URL (Section 12.1)
//   - Live mode: write a refresh row to shared_research_refreshes with
//     curated_items=0, rejected_items=0 (curation lands in Phase 3)
//   - Live mode does NOT write to shared_research yet — Phase 4 wires those
//   - Dry-run mode (?dry=true): runs everything except writes, returns the
//     full plan + truncated raw results so the owner can inspect
//
// No Haiku curation in this phase. Tool integration (ID/BI swap-outs) is
// Phase 5 and Phase 6.

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  buildQueryPlan,
  resolveRegion,
  normaliseIndustries,
  executeQueryWithCache,
  makeSerperRateGate,
  dedupByLink,
  enrichDedupedWithPlan,
  stateFullName,
  runCuration,
  validateCuratedItems,
  groupCuratedByCategory
} from '../lib/shared-research.js';
import { logSerperUsage, logAnthropicUsage } from '../lib/usage-logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Phase 3.4 throttling, updated in Phase 3.7. Serper's documented limit
// on our tier is 5 req/s. 4 lanes give us latency hiding (one slow
// Serper response doesn't stall the others) and a 250 ms minimum gap
// between Serper dispatches gives ~4 req/s steady-state — 80% of the
// documented limit, with headroom for response variance.
//
// The gap now lives in a per-refresh rate gate (makeSerperRateGate)
// awaited inside executeQueryWithCache only on the cache-miss path,
// so cache-hit dispatches don't queue against the Serper ceiling.
// Retries inside runSerperQuery add jittered backoff (1–2.5s) to
// spread re-fires across lanes — handles the edge case where four
// lanes 429 simultaneously and all wake up to retry at the same
// instant.
//
// At 4 req/s a fully-fresh 55-query refresh dispatches in ~14 seconds;
// with Serper response latency layered on, real refreshes complete
// inside the vercel.json maxDuration of 60 s comfortably.
const SERPER_MAX_PARALLEL = 4;
const SERPER_DISPATCH_GAP_MS = 250;

// Per-result snippet truncation in dry-run output (Phase 2 instruction #6).
const TRUNCATE_CHARS = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const t0 = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Phase 3.4-followup timing instrumentation. Captures wall-clock per
  // phase so the post-Serper portion of the pipeline can be diagnosed
  // — 504s in cache-miss mode and ~40s of unaccounted time in
  // cache-hit mode point at Haiku curation as a suspect but no
  // numbers existed before this. Pure instrumentation; no logic
  // changes. Will be removed once the question is settled.
  const timings = {};
  function recordTiming(phase, tStart) {
    const ms = Date.now() - tStart;
    timings[phase + '_ms'] = ms;
    console.log(`[SharedResearch] Phase timing — phase: ${phase}, ms: ${ms}`);
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  const tAuth = Date.now();
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
  const userId = user.id;
  recordTiming('auth', tAuth);

  // -------------------------------------------------------------------------
  // Request parameters
  // -------------------------------------------------------------------------
  const body = req.body || {};
  const triggeredBy = body.triggered_by_tool || null;
  const forceRefresh = !!body.force_refresh;
  const dryRun = req.query && (req.query.dry === 'true' || req.query.dry === '1');

  // Phase 3.8 investigation switch. Dry-run only. When set, the
  // endpoint runs an isolated 10-read latency probe after the main
  // pipeline and surfaces the results under `debug_cache_latency`
  // in the response. Two probes are run side-by-side:
  //   - supabase-js sequential: 10 reads via the platform client
  //   - raw-fetch sequential:   10 reads via plain fetch to PostgREST,
  //                             split into network / body / parse ms
  // The raw-fetch path is what lets us distinguish network RTT from
  // JSON-deserialise cost, which supabase-js doesn't expose
  // separately. To be removed once the investigation is settled.
  const debugCacheLatency = dryRun && req.query && req.query.debug_cache_latency === 'true';

  // Refresh-scoped UUID. Used to:
  //   1. Tag every shared_research_cache_access row written during this
  //      refresh so audit events can be grouped by refresh
  //   2. Set the id of the shared_research_refreshes row (live mode only)
  //      so the access-event refresh_id correlates with the refresh row
  //   3. Surface to the caller in the response so the owner can join
  //      dry-run output to audit rows
  const refreshId = crypto.randomUUID();
  const accessEvents = [];

  // -------------------------------------------------------------------------
  // Business Profile load + region resolution
  // -------------------------------------------------------------------------
  const tProfile = Date.now();
  const profileRes = await supabase
    .from('profiles')
    .select('business_name, industry, address_state, address_suburb, address_postcode, employee_range')
    .eq('id', userId)
    .single();

  if (profileRes.error || !profileRes.data) {
    return res.status(400).json({ error: 'Could not load business profile' });
  }
  const profile = profileRes.data;

  const industries = normaliseIndustries(profile);
  const region = resolveRegion(profile);
  const stateAbbr = profile.address_state || null;
  const stateFull = stateFullName(stateAbbr);
  recordTiming('profile_and_region', tProfile);

  // -------------------------------------------------------------------------
  // Query plan generation
  // -------------------------------------------------------------------------
  const tPlanBuild = Date.now();
  const plan = buildQueryPlan(profile);
  recordTiming('plan_build', tPlanBuild);

  if (plan.length === 0) {
    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      message: 'No queries to run — Business Profile lacks the data needed (state, industry, region).',
      profile_summary: {
        industries,
        state: stateAbbr,
        state_full: stateFull,
        region: region ? region.region_name : null,
        region_resolved: !!region
      },
      timings
    });
  }

  // -------------------------------------------------------------------------
  // Execute the plan with the cache layer + Serper-only rate gate
  // -------------------------------------------------------------------------
  //
  // Phase 3.7: the rate gate now lives inside executeQueryWithCache —
  // it's only awaited on the cache-miss path, right before the Serper
  // call. Cache-hit dispatches no longer queue against the Serper
  // 5 req/s ceiling. The dispatcher itself is back to a plain
  // concurrency limiter with no rate logic.
  const serperGate = makeSerperRateGate(SERPER_DISPATCH_GAP_MS);
  const tPlanExec = Date.now();
  const planResults = await runWithConcurrency(plan, SERPER_MAX_PARALLEL, async (planRow) => {
    return executeQueryWithCache({
      supabase,
      userId,
      planRow,
      apiKey: SERPER_API_KEY,
      forceRefresh,
      accessEvents,
      refreshId,
      serperGate
    });
  });
  recordTiming('plan_execution_total', tPlanExec);
  const queueWaitSumMs = serperGate.getQueueWaitSumMs();

  // Aggregate per-call sub-timings into handler-level phase numbers.
  // These are SUMS across calls; with 4 parallel lanes the wall-clock
  // contribution to plan_execution_total_ms is roughly sum/lanes, but
  // the raw sums tell us where time is being spent inside each call.
  let sumCacheLookup = 0;
  let sumSerper = 0;
  let sumCacheWrite = 0;
  for (const r of planResults) {
    if (r && r.timings) {
      sumCacheLookup += r.timings.cache_lookup_ms || 0;
      sumSerper += r.timings.serper_ms || 0;
      sumCacheWrite += r.timings.cache_write_ms || 0;
    }
  }
  timings.cache_lookup_sum_ms = sumCacheLookup;
  timings.serper_sum_ms = sumSerper;
  timings.cache_write_sum_ms = sumCacheWrite;
  console.log(`[SharedResearch] Phase timing — phase: cache_lookup_sum, ms: ${sumCacheLookup}`);
  console.log(`[SharedResearch] Phase timing — phase: serper_sum, ms: ${sumSerper}`);
  console.log(`[SharedResearch] Phase timing — phase: cache_write_sum, ms: ${sumCacheWrite}`);

  // Phase 3.6 instrumentation, refined in Phase 3.7: queue_wait now
  // counts ONLY the time spent waiting at the Serper rate gate, since
  // the gate only triggers on cache-miss dispatches. supabase_call_sum
  // is the wall-clock spent in actual Supabase round-trips (reads +
  // writes) and is independent of the rate gate.
  timings.cache_call_queue_wait_sum_ms = queueWaitSumMs;
  timings.cache_call_supabase_sum_ms = sumCacheLookup + sumCacheWrite;
  console.log(`[SharedResearch] Phase timing — phase: cache_call_queue_wait_sum, ms: ${queueWaitSumMs}`);
  console.log(`[SharedResearch] Phase timing — phase: cache_call_supabase_sum, ms: ${timings.cache_call_supabase_sum_ms}`);

  // Bulk-insert all access events for this refresh in one round-trip.
  // Failures here are logged but never break the refresh response —
  // the data has already been served by the time we get to audit.
  const tAccessLog = Date.now();
  if (accessEvents.length > 0) {
    try {
      const ins = await supabase
        .from('shared_research_cache_access')
        .insert(accessEvents);
      if (ins.error) {
        console.error('[SharedResearch] Bulk access log error —', 'count:', accessEvents.length, 'message:', ins.error.message);
      }
    } catch (e) {
      console.error('[SharedResearch] Bulk access log exception —', 'count:', accessEvents.length, 'message:', e && e.message);
    }
  }
  recordTiming('access_log_bulk_insert', tAccessLog);

  const tStatsAgg = Date.now();
  let cacheHits = 0;
  let queriesRun = 0;
  let failedQueries = 0;
  const queryStats = new Array(plan.length);
  const taggedItems = [];

  for (let i = 0; i < plan.length; i++) {
    const row = plan[i];
    const r = planResults[i] || { items: [], cache_hit: false, cache_age_hours: null, status: 'error' };
    const status = r.status || 'ok';
    if (status === 'ok' && r.cache_hit) cacheHits++;
    else if (status === 'ok') queriesRun++;
    else failedQueries++;

    queryStats[i] = {
      category: row.category,
      lens: row.lens,
      industry: row.industry,
      query: row.query,
      query_type: row.query_type,
      recency: row.recency,
      cache_hit: r.cache_hit,
      cache_age_hours: r.cache_age_hours,
      result_count: r.items.length,
      status
    };

    for (const item of r.items) {
      // plan_index is the single back-pointer kept through dedupe; every
      // other attribution field (category, lens, query, industry) is
      // recovered later via enrichDedupedWithPlan(). See Phase 3.1.
      taggedItems.push({
        title: item.title || '',
        snippet: item.snippet || '',
        link: item.link || '',
        source: item.source || '',
        date: item.date || null,
        plan_index: i
      });
    }
  }
  recordTiming('stats_aggregation', tStatsAgg);

  // Log Serper usage once per refresh that actually fired any fresh queries.
  // Cache hits are not Serper calls and are not logged.
  const tLogSerper = Date.now();
  if (queriesRun > 0) {
    await logSerperUsage({ tool_id: 'shared-research', user_id: userId });
  }
  recordTiming('log_serper_usage', tLogSerper);

  const tDedupe = Date.now();
  const dedupedRaw = dedupByLink(taggedItems);
  const deduped = enrichDedupedWithPlan(dedupedRaw, plan);
  recordTiming('dedupe_and_enrich', tDedupe);
  const durationMs = Date.now() - t0;

  // -------------------------------------------------------------------------
  // Dry-run response — no writes; runs the full pipeline including
  // Haiku curation and the Section 9.5 validation layer so the owner
  // can inspect curation quality before Phase 4 enables live writes.
  // -------------------------------------------------------------------------
  if (dryRun) {
    // raw_results no longer carries a singular `category` field — it
    // was misleading because dedupe kept only the first-seen category
    // when a URL was surfaced by queries in multiple categories. The
    // authoritative attribution is now the source_categories array.
    const tTruncate = Date.now();
    const truncatedItems = deduped.map((it) => ({
      title: (it.title || '').slice(0, TRUNCATE_CHARS),
      snippet: (it.snippet || '').slice(0, TRUNCATE_CHARS),
      link: it.link,
      source: it.source,
      date: it.date,
      lenses: it.lenses,
      source_categories: it.source_categories,
      source_queries: it.source_queries,
      source_industries: it.source_industries
    }));
    recordTiming('truncate_raw_results', tTruncate);

    // Curation pass — Section 9.
    // Phase 3.5: runCuration fans out across the five source categories
    // and runs them in parallel as five concurrent Haiku calls. The
    // curation_ms below is the wall-clock of the whole fan-out (≈ max
    // of the five batch durations). per-category durations come back
    // in curation.per_category and are surfaced separately below.
    const tCuration = Date.now();
    const curation = await runCuration({
      profile,
      dedupedItems: deduped,
      anthropicKey: ANTHROPIC_API_KEY
    });
    recordTiming('curation', tCuration);

    if (curation.per_category) {
      const perCategoryMs = {};
      const breakdown = {};
      for (const [cat, info] of Object.entries(curation.per_category)) {
        perCategoryMs[cat] = info.duration_ms;
        breakdown[cat] = {
          ms: info.duration_ms,
          items_in: info.items_in || 0,
          items_out: info.items_out || 0,
          input_tokens: info.input_tokens || 0,
          output_tokens: info.output_tokens || 0
        };
        console.log(`[SharedResearch] Phase timing — phase: curation_${cat}, ms: ${info.duration_ms}, items_in: ${info.items_in}, items_out: ${info.items_out}, input_tokens: ${info.input_tokens}, output_tokens: ${info.output_tokens}`);
      }
      timings.curation_per_category_ms = perCategoryMs;
      timings.curation_per_category_breakdown = breakdown;
    }

    // Log Haiku usage for cost attribution. logAnthropicUsage swallows
    // its own errors so logging failures never break the response.
    const tLogAnthropic = Date.now();
    if (curation.usage) {
      await logAnthropicUsage({
        tool_id: 'shared-research',
        user_id: userId,
        model: 'claude-haiku-4-5-20251001',
        usage: curation.usage
      });
    }
    recordTiming('log_anthropic_usage', tLogAnthropic);

    // Validation pass — Section 9.5
    const tValidate = Date.now();
    const validated = curation.ok
      ? validateCuratedItems(curation.items, deduped)
      : { accepted: [], rejected: [] };
    recordTiming('validation', tValidate);

    // Section 9.5 bottom rule: if Haiku returned items and every one
    // failed validation, that is "the entire curation output fails
    // validation" and the run is treated as a curation failure.
    const totalCurationFailure = curation.ok
      && curation.items.length > 0
      && validated.accepted.length === 0;

    // Join each curated item back to its originating plan rows via URL
    // so source_queries and source_categories can be surfaced on the
    // curated row. Critical for Phase 4 audit — without it, downstream
    // tools can see the curated item's category but not which queries
    // surfaced it.
    const tGroup = Date.now();
    const enrichedByUrl = new Map();
    for (const d of deduped) enrichedByUrl.set(d.link, d);
    const acceptedWithSource = validated.accepted.map((it) => {
      const src = enrichedByUrl.get(it.url);
      return Object.assign({}, it, {
        source_queries: src ? src.source_queries : [],
        source_categories: src ? src.source_categories : [],
        source_industries: src ? src.source_industries : []
      });
    });

    const grouped = groupCuratedByCategory(acceptedWithSource);
    recordTiming('group_and_attribute_curated', tGroup);

    // Phase 3.8: optional cache-latency probe. Runs after the main
    // pipeline so it doesn't perturb the production timings, and only
    // when the owner explicitly opts in. Picks the first cache_key
    // from the plan results so the probe hits a real row.
    let debugInfo = null;
    if (debugCacheLatency) {
      const sampleKey = (planResults[0] && planResults[0].cache_key) || null;
      if (sampleKey) {
        debugInfo = await runCacheLatencyProbe(supabase, sampleKey, SUPABASE_URL, SUPABASE_SERVICE_KEY);
      } else {
        debugInfo = { skipped: 'no sample cache key in plan results' };
      }
    }

    const totalDuration = Date.now() - t0;
    timings.total_ms = totalDuration;
    console.log(`[SharedResearch] Phase timing — phase: total, ms: ${totalDuration}`);

    return res.status(200).json({
      success: true,
      dry_run: true,
      refresh_id: refreshId,
      curation_ok: curation.ok && !totalCurationFailure,
      curation_error: curation.ok
        ? (totalCurationFailure ? 'all curated items failed validation' : null)
        : (curation.error || 'unknown curation error'),
      profile_summary: {
        industries,
        state: stateAbbr,
        state_full: stateFull,
        region: region ? region.region_name : null,
        region_resolved: !!region,
        postcode: profile.address_postcode || null,
        business_size: profile.employee_range || null
      },
      stats: {
        total_queries: plan.length,
        cache_hits: cacheHits,
        fresh_queries: queriesRun,
        failed_queries: failedQueries,
        raw_items: taggedItems.length,
        deduped_items: deduped.length,
        haiku_returned: curation.items.length,
        curated_items: validated.accepted.length,
        rejected_items: validated.rejected.length,
        duration_ms: totalDuration
      },
      timings,
      query_plan: queryStats,
      raw_results: truncatedItems,
      curated_items: grouped,
      rejected_items: validated.rejected,
      debug_cache_latency: debugInfo
    });
  }

  // -------------------------------------------------------------------------
  // Live mode — write a refresh row (Phase 2). Curation + shared_research
  // writes land in Phases 3/4.
  //
  // Phase 3.4: id is the pre-generated refreshId so the cache_access
  // rows already tagged with this UUID correlate with the refreshes
  // row. If the insert fails (e.g. RLS or transient error), we still
  // return the refresh_id to the caller — the access rows for this
  // refresh are already written and queryable by it.
  // -------------------------------------------------------------------------
  const tRefreshRow = Date.now();
  try {
    const refreshRow = {
      id: refreshId,
      user_id: userId,
      triggered_by_tool: triggeredBy,
      queries_run: queriesRun,
      cache_hits: cacheHits,
      raw_items: taggedItems.length,
      curated_items: 0,
      rejected_items: 0,
      duration_ms: durationMs
    };
    const ins = await supabase
      .from('shared_research_refreshes')
      .insert(refreshRow);
    if (ins.error) {
      console.error('[SharedResearch] Refresh row write failed —', 'message:', ins.error.message);
    }
  } catch (e) {
    console.error('[SharedResearch] Refresh row exception —', 'message:', e && e.message);
  }
  recordTiming('refresh_row_insert', tRefreshRow);

  timings.total_ms = Date.now() - t0;
  console.log(`[SharedResearch] Phase timing — phase: total, ms: ${timings.total_ms}`);

  return res.status(200).json({
    success: true,
    dry_run: false,
    refresh_id: refreshId,
    profile_summary: {
      industries,
      state: stateAbbr,
      state_full: stateFull,
      region: region ? region.region_name : null,
      region_resolved: !!region
    },
    stats: {
      total_queries: plan.length,
      cache_hits: cacheHits,
      fresh_queries: queriesRun,
      failed_queries: failedQueries,
      raw_items: taggedItems.length,
      deduped_items: deduped.length,
      duration_ms: durationMs,
      curated_items: 0,
      rejected_items: 0
    },
    timings,
    items: deduped,
    note: 'Curation lands in Phase 3. Items are raw Serper results, deduped by URL.'
  });
}

// ---------------------------------------------------------------------------
// Concurrency limiter (Phase 3.7: plain lane-based, no rate gate)
// ---------------------------------------------------------------------------
//
// Promise.all with a fixed number of lanes that pull from a shared
// cursor. Each lane runs the worker to completion before picking the
// next index. The Serper rate gate used to live here but moved into
// the cache layer in Phase 3.7 — only Serper-bound dispatches (cache
// misses) wait for a slot, so the dispatcher itself is back to being
// a generic parallelism cap.

async function runWithConcurrency(items, maxParallel, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function lane() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i]);
      } catch (e) {
        console.error('[SharedResearch] Worker exception —', 'index:', i, 'message:', e && e.message);
        results[i] = { items: [], cache_hit: false, cache_age_hours: null, status: 'error' };
      }
    }
  }

  const lanes = Math.min(maxParallel, items.length);
  await Promise.all(Array.from({ length: lanes }, () => lane()));
  return results;
}

// ---------------------------------------------------------------------------
// Cache latency probe — Phase 3.8 investigation (temporary)
// ---------------------------------------------------------------------------
//
// Two sequential 10-read loops against shared_research_cache, each
// reading the same cache_key (so all 10 are cache hits if the row
// exists, all return null if it doesn't — the round-trip cost is the
// same shape either way).
//
// Loop 1 uses the supabase-js client we built at the top of the
// handler — the same client the rest of the refresh uses. Captures
// total per-call ms. Lets us see if the per-call cost in sequential
// load matches the ~230 ms we measured in parallel-55 load
// (sequential = no pool contention; if it's still ~230 ms, the
// per-call cost is the floor, not contention).
//
// Loop 2 uses raw fetch to the PostgREST endpoint with the same
// service-role auth. Captures four points per call:
//   network_ms — fetch() resolved (response headers received)
//   body_ms    — response.text() resolved (body fully read)
//   parse_ms   — JSON.parse() returned (local CPU)
//   total_ms   — sum of the three
// This splits network RTT from JSON deserialisation, which
// supabase-js doesn't expose separately. If network_ms dominates,
// the cost is on the wire. If parse_ms dominates, the client/CPU
// is the issue.
//
// Comparing Loop 1's total_ms against Loop 2's total_ms shows
// whether supabase-js adds meaningful overhead over the bare PostgREST
// call.

async function runCacheLatencyProbe(supabase, sampleCacheKey, supabaseUrl, serviceKey) {
  const N = 10;

  // Loop 1: supabase-js sequential
  const supabaseJsMs = [];
  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    try {
      await supabase
        .from('shared_research_cache')
        .select('result_payload, expires_at, created_at')
        .eq('cache_key', sampleCacheKey)
        .maybeSingle();
    } catch (e) {
      supabaseJsMs.push({ error: e && e.message });
      continue;
    }
    supabaseJsMs.push(Date.now() - t0);
  }

  // Loop 2: raw fetch to PostgREST sequential
  const rawFetch = [];
  const url = supabaseUrl
    + '/rest/v1/shared_research_cache'
    + '?cache_key=eq.' + encodeURIComponent(sampleCacheKey)
    + '&select=result_payload,expires_at,created_at'
    + '&limit=1';
  const headers = {
    'apikey': serviceKey,
    'Authorization': 'Bearer ' + serviceKey,
    'Accept': 'application/json'
  };
  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    let resp;
    try {
      resp = await fetch(url, { method: 'GET', headers });
    } catch (e) {
      rawFetch.push({ error: e && e.message });
      continue;
    }
    const t1 = Date.now();
    let text = '';
    try { text = await resp.text(); } catch (e) { /* noop */ }
    const t2 = Date.now();
    try { JSON.parse(text); } catch (e) { /* row may be missing */ }
    const t3 = Date.now();
    rawFetch.push({
      total_ms: t3 - t0,
      network_ms: t1 - t0,
      body_ms: t2 - t1,
      parse_ms: t3 - t2,
      status: resp.status,
      body_bytes: text.length
    });
  }

  return {
    sample_cache_key: sampleCacheKey,
    iterations: N,
    supabase_js: {
      per_call_ms: supabaseJsMs,
      summary: summariseSimpleMs(supabaseJsMs)
    },
    raw_fetch: {
      per_call: rawFetch,
      summary: summariseRawFetch(rawFetch)
    }
  };
}

function summariseSimpleMs(arr) {
  const nums = arr.filter((v) => typeof v === 'number');
  if (!nums.length) return null;
  const rest = nums.slice(1);
  return {
    first: nums[0],
    rest_avg: rest.length ? Math.round(rest.reduce((a, b) => a + b, 0) / rest.length) : null,
    min: Math.min(...nums),
    max: Math.max(...nums)
  };
}

function summariseRawFetch(rows) {
  const valid = rows.filter((r) => !r.error && typeof r.total_ms === 'number');
  if (!valid.length) return null;
  const rest = valid.slice(1);
  const avgField = (field, set) => {
    if (!set.length) return null;
    return Math.round(set.reduce((a, b) => a + b[field], 0) / set.length);
  };
  return {
    first: valid[0],
    rest_avg: {
      total_ms: avgField('total_ms', rest),
      network_ms: avgField('network_ms', rest),
      body_ms: avgField('body_ms', rest),
      parse_ms: avgField('parse_ms', rest)
    },
    min_total_ms: Math.min(...valid.map((r) => r.total_ms)),
    max_total_ms: Math.max(...valid.map((r) => r.total_ms))
  };
}
