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

// Phase 3.4 throttling. Serper's documented limit on our tier is 5 req/s.
// The dispatcher uses 4 lanes (latency hiding) with a 250 ms minimum gap
// between dispatches (~4 req/s steady-state — 80% of the documented limit,
// leaves headroom for response variance). Retries inside runSerperQuery
// add jittered backoff to spread re-fires across lanes; that handles the
// edge case where four lanes 429 simultaneously and all wake up to retry
// at the same instant.
//
// At 4 req/s a 55-query refresh dispatches in ~14 seconds; with Serper
// response latency layered on, real refreshes complete inside the
// vercel.json maxDuration of 60 s comfortably.
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
  // Execute the plan with the cache layer + throttled dispatcher
  // -------------------------------------------------------------------------
  const tPlanExec = Date.now();
  const planResults = await runWithConcurrency(plan, SERPER_MAX_PARALLEL, async (planRow) => {
    return executeQueryWithCache({
      supabase,
      userId,
      planRow,
      apiKey: SERPER_API_KEY,
      forceRefresh,
      accessEvents,
      refreshId
    });
  }, SERPER_DISPATCH_GAP_MS);
  recordTiming('plan_execution_total', tPlanExec);

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
    // runCuration makes a SINGLE Haiku call with all deduped items in one
    // request — no per-category batching. If we ever introduce batching
    // this timing call needs to capture each batch separately.
    const tCuration = Date.now();
    const curation = await runCuration({
      profile,
      dedupedItems: deduped,
      anthropicKey: ANTHROPIC_API_KEY
    });
    recordTiming('curation', tCuration);

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
      rejected_items: validated.rejected
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
// Throttled concurrency limiter
// ---------------------------------------------------------------------------
//
// Promise.all with a fixed number of lanes that pull from a shared cursor,
// plus a shared "next-dispatch-slot" timestamp that gates how often a lane
// can start a new worker call. Together they enforce both a parallelism
// cap (latency hiding) and a global rate cap (Serper rate-limit safety).
//
// minDispatchGapMs sets the minimum spacing between any two dispatch
// starts across all lanes. With gap=250ms and lanes=4, steady-state
// throughput is 1000/250 = 4 calls/s regardless of how fast individual
// calls complete.
//
// The slot reservation happens AFTER the cursor check so a lane that's
// exiting (because the cursor is exhausted) doesn't burn a slot it never
// uses.

async function runWithConcurrency(items, maxParallel, worker, minDispatchGapMs) {
  const results = new Array(items.length);
  let cursor = 0;
  let nextSlot = Date.now();
  const gap = minDispatchGapMs || 0;

  async function lane() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;

      if (gap > 0) {
        const now = Date.now();
        const waitMs = Math.max(0, nextSlot - now);
        nextSlot = Math.max(nextSlot, now) + gap;
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      }

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
