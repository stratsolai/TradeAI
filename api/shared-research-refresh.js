// api/shared-research-refresh.js — Shared Research Layer endpoint
//
// Implements Section 12 of StaxAI-Shared-Research-Layer-Spec-v1_0
// across Phases 2–4 of the build:
//
//   Phase 2 — JWT auth, Business Profile load, query plan, 24-hour
//             Serper cache layer, dedupe, dry-run preview.
//   Phase 3 — Haiku curation (per-category parallel fan-out),
//             Section 9.5 validation, dry-run curated preview,
//             timings instrumentation, access audit table writes
//             (read_hit / read_miss / write).
//   Phase 4 — Live writes to shared_research, is_current flip with
//             snapshot-based rollback, shared_research_refreshes row
//             with outcome column (success / validation_failed /
//             no_results / error), and the shared_research_write
//             access audit event so each refresh's full lifecycle
//             can be traced by refresh_id.
//
// Tool integration (ID/BI swap-outs) is Phase 5 and Phase 6.

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
  groupCuratedByCategory,
  // Phase 4 — live writes + is_current flip + audit
  snapshotCurrentRowIds,
  flipIsCurrentFalse,
  restoreIsCurrent,
  buildSharedResearchRow,
  insertSharedResearchRows,
  deleteRowsByRefreshId,
  writeRefreshRow,
  recordSharedResearchWriteEvent
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
  // Auth — JWT Bearer (browser) OR x-cron-secret + body.userId (cron worker)
  // -------------------------------------------------------------------------
  //
  // The platform's established alt-auth pattern for cron-triggered
  // calls (see api/drive-import.js, dropbox-import.js, onedrive-import.js,
  // sharepoint-import.js) — when a service-to-service caller presents a
  // valid x-cron-secret header, the userId is read from the body instead
  // of being decoded from a user JWT. The cron worker can't hold a user
  // session, so this is how api/news-digest-worker.js (Phase 5.5)
  // dispatches scheduled refreshes per user without modifying the
  // downstream pipeline.
  //
  // The JWT path is the primary path and is unchanged for browser
  // callers — Refresh Now from the ID page, dry-run inspection, and any
  // future user-driven trigger all go down this branch byte-for-byte
  // identically to Phase 5. CRON_SECRET must match exactly; an empty
  // x-cron-secret falls through to the JWT path (so browsers that don't
  // send the header aren't accidentally bounced).
  const tAuth = Date.now();
  let userId;
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) {
    userId = (req.body || {}).userId;
    if (!userId) return res.status(400).json({ error: 'userId required for worker calls' });
  } else {
    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
    userId = user.id;
  }
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

  // Audit-write failures from either insert path (Phase 3 bulk
  // cache-access insert and Phase 4 shared_research_write insert)
  // accumulate here and surface in response.audit_warnings so silent
  // audit-layer drops are visible to the caller, not just to the
  // [SharedResearch] console.error lines.
  const auditWarnings = [];

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
  // Failures here are logged AND surfaced in response.audit_warnings
  // so silent audit-layer drops can't recur (see Issue 1 follow-up
  // note above).
  const tAccessLog = Date.now();
  if (accessEvents.length > 0) {
    try {
      const ins = await supabase
        .from('shared_research_cache_access')
        .insert(accessEvents);
      if (ins.error) {
        console.error('[SharedResearch] Bulk access log error —', 'count:', accessEvents.length, 'message:', ins.error.message);
        auditWarnings.push({ scope: 'cache_access_bulk', count: accessEvents.length, message: ins.error.message });
      }
    } catch (e) {
      const msg = e && e.message;
      console.error('[SharedResearch] Bulk access log exception —', 'count:', accessEvents.length, 'message:', msg);
      auditWarnings.push({ scope: 'cache_access_bulk', count: accessEvents.length, message: msg || 'exception' });
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

  // -------------------------------------------------------------------------
  // Curation + validation — Section 9 + 9.5
  // -------------------------------------------------------------------------
  //
  // Phase 4 moves curation + validation out of the dry-run-only path
  // and runs them in both modes. Live mode needs the validated set to
  // write to shared_research; dry-run mode keeps the same response
  // shape Phase 3 returned so the inspection path doesn't change.
  //
  // Phase 3.5: runCuration fans out across the five source categories
  // and runs them as five concurrent Haiku calls. The curation_ms
  // below is the wall-clock of the whole fan-out (≈ max of the five
  // batch durations). Per-category durations come back in
  // curation.per_category and are surfaced separately below.
  //
  // raw_items=0 (Section: 'no_results') still calls runCuration, but
  // runCuration short-circuits to ok=true with zero items on an empty
  // input list, so no Haiku call is made and the timing is effectively
  // a no-op. That keeps the timing instrumentation present in every
  // mode without forking the code path.
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
  // validation" and the run is treated as a whole-batch failure.
  // Live mode maps this to outcome='validation_failed' below.
  const totalCurationFailure = curation.ok
    && curation.items.length > 0
    && validated.accepted.length === 0;

  // Join each accepted item back to its originating plan rows via URL
  // so source_queries / source_categories / source_industries can be
  // surfaced on the curated row in the response. These attribution
  // arrays are NOT persisted to shared_research (Section 11.1 doesn't
  // include them) — they're for the inspection path and downstream
  // tools that want to see which queries surfaced an item.
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

  // -------------------------------------------------------------------------
  // Dry-run response — non-destructive across all three tables.
  //   - No writes to shared_research
  //   - No is_current flip
  //   - No write to shared_research_refreshes
  //   - No shared_research_write audit event
  // Phase 3 cache access events (read_hit / read_miss / write) ARE
  // still persisted in dry-run — that behaviour is Phase 3 structural
  // instrumentation and must not regress.
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
      audit_warnings: auditWarnings
    });
  }

  // -------------------------------------------------------------------------
  // Live mode — Phase 4 writes
  // -------------------------------------------------------------------------
  //
  // Outcome ladder (per spec brief):
  //   raw_items=0                                 -> 'no_results'
  //   curation.ok=false                           -> 'error'
  //   Section 9.5 whole-batch validation failure  -> 'validation_failed'
  //   accepted.length > 0                         -> 'success'
  //   accepted=0 AND rejected=0 (legitimate zero) -> 'success' with
  //     curated_items=0, no flip, no insert (existing batch left intact)
  //
  // 'success' is the only branch that flips is_current and writes to
  // shared_research. The other three outcomes leave existing
  // is_current=true rows untouched. The refresh row is written in
  // EVERY outcome (best effort) — the audit trail must not have
  // invisible failures.

  let liveOutcome;
  let liveError = null;
  let writtenCount = 0;
  const writeAccessEvents = [];

  if (taggedItems.length === 0) {
    liveOutcome = 'no_results';
    console.log('[SharedResearch] Live outcome — no_results, raw_items: 0');
  } else if (!curation.ok) {
    liveOutcome = 'error';
    liveError = curation.error || 'curation failed';
    console.log(`[SharedResearch] Live outcome — error, reason: ${liveError}`);
  } else if (totalCurationFailure) {
    liveOutcome = 'validation_failed';
    liveError = 'all curated items failed validation';
    console.log(`[SharedResearch] Live outcome — validation_failed, rejected: ${validated.rejected.length}`);
  } else if (acceptedWithSource.length === 0) {
    // Haiku returned zero items legitimately (and zero rejections).
    // Nothing to write; existing batch stays as-is.
    liveOutcome = 'success';
    console.log('[SharedResearch] Live outcome — success (zero curated items, no flip)');
  } else {
    // Success path — flip is_current, then insert. Snapshot-first so
    // the flip is reversible if the insert fails (see header on
    // lib/shared-research-writes.js for the rationale). If the
    // snapshot read fails we abort BEFORE flipping — without a
    // snapshot we have no rollback anchor, and a one-way flip with no
    // anchor could leave the user with no current rows if the
    // subsequent insert also fails.
    const tSnapshot = Date.now();
    const snap = await snapshotCurrentRowIds(supabase, userId);
    recordTiming('is_current_snapshot', tSnapshot);

    if (!snap.ok) {
      liveOutcome = 'error';
      liveError = 'is_current snapshot failed: ' + (snap.error || 'unknown');
      console.error(`[SharedResearch] Live outcome — error (aborted before flip), reason: ${liveError}`);
      // Fall through to refresh-row write below — no flip happened.
    } else {

    const tFlip = Date.now();
    const flip = await flipIsCurrentFalse(supabase, userId);
    recordTiming('is_current_flip', tFlip);

    if (!flip.ok) {
      liveOutcome = 'error';
      liveError = 'is_current flip failed: ' + (flip.error || 'unknown');
      console.error(`[SharedResearch] Live outcome — error, reason: ${liveError}`);
    } else {
      const tBuildRows = Date.now();
      const rowsToInsert = acceptedWithSource.map((it) => buildSharedResearchRow(userId, refreshId, it));
      recordTiming('shared_research_rows_build', tBuildRows);

      const tInsert = Date.now();
      const ins = await insertSharedResearchRows(supabase, rowsToInsert);
      recordTiming('shared_research_insert', tInsert);

      if (ins.ok) {
        liveOutcome = 'success';
        writtenCount = ins.count;
        // Audit event for the shared_research write. Recorded into a
        // separate array (NOT accessEvents) so we can write it after
        // the bulk cache-events insert without re-touching that path.
        recordSharedResearchWriteEvent(writeAccessEvents, { userId, refreshId });
        console.log(`[SharedResearch] Live outcome — success, written: ${writtenCount}`);
      } else {
        // Insert failed — roll back. Two clean-up steps:
        //   1. Restore is_current=true on the previously-current rows
        //      so consumers see the old batch again.
        //   2. Delete any partial inserts under the new refresh_id
        //      (Postgres bulk inserts are all-or-nothing per call, but
        //      the delete is cheap insurance against driver-level
        //      partial state).
        const tRollback = Date.now();
        await restoreIsCurrent(supabase, userId, snap.ids);
        await deleteRowsByRefreshId(supabase, refreshId);
        recordTiming('shared_research_rollback', tRollback);
        liveOutcome = 'error';
        liveError = 'shared_research insert failed: ' + (ins.error || 'unknown');
        console.error(`[SharedResearch] Live outcome — error (rolled back), reason: ${liveError}`);
      }
    }
    } // end of snap.ok else-block
  }

  // Compute duration_ms BEFORE writing the refresh row so the audit
  // table reflects the actual work time, not the audit-write overhead
  // on top of it. The brief is explicit on this for validation_failed
  // ("duration_ms reflecting how long the refresh ran before failing");
  // applying the same rule uniformly across outcomes keeps the column
  // semantics consistent.
  const durationMs = Date.now() - t0;

  // shared_research_refreshes — written for EVERY outcome.
  const tRefreshRow = Date.now();
  await writeRefreshRow(supabase, {
    id: refreshId,
    user_id: userId,
    triggered_by_tool: triggeredBy,
    queries_run: queriesRun,
    cache_hits: cacheHits,
    raw_items: taggedItems.length,
    curated_items: writtenCount,
    rejected_items: validated.rejected.length,
    duration_ms: durationMs,
    outcome: liveOutcome
  });
  recordTiming('refresh_row_insert', tRefreshRow);

  // shared_research_write audit event (success path only). One row
  // per refresh — access_type='shared_research_write' with cache_key
  // set to the refresh_id (see lib/shared-research-writes.js —
  // recordSharedResearchWriteEvent). Separate insert from the Phase
  // 3 cache_access bulk load further up so that bulk-insert path
  // stays untouched. Any insert failure surfaces in
  // response.audit_warnings via auditWarnings below.
  if (writeAccessEvents.length > 0) {
    const tWriteAudit = Date.now();
    try {
      const insAudit = await supabase
        .from('shared_research_cache_access')
        .insert(writeAccessEvents);
      if (insAudit.error) {
        console.error('[SharedResearch] shared_research_write audit error —', 'message:', insAudit.error.message);
        auditWarnings.push({ scope: 'shared_research_write', count: writeAccessEvents.length, message: insAudit.error.message });
      }
    } catch (e) {
      const msg = e && e.message;
      console.error('[SharedResearch] shared_research_write audit exception —', 'message:', msg);
      auditWarnings.push({ scope: 'shared_research_write', count: writeAccessEvents.length, message: msg || 'exception' });
    }
    recordTiming('shared_research_write_audit', tWriteAudit);
  }

  timings.total_ms = Date.now() - t0;
  console.log(`[SharedResearch] Phase timing — phase: total, ms: ${timings.total_ms}`);

  // -------------------------------------------------------------------------
  // Live response shape
  // -------------------------------------------------------------------------
  //
  // Success: 200 with items grouped by category, per Section 12.1.
  // validation_failed: 422 with success=false + error, per Section 9.5
  // ("the refresh returns an error"). Refresh row IS still written
  // above with outcome='validation_failed', curated_items=0.
  // error: 500 with success=false + error. Refresh row IS still
  // written with outcome='error'.
  // no_results: 200 with success=true, empty items, raw_items=0.

  const stats = {
    total_queries: plan.length,
    cache_hits: cacheHits,
    fresh_queries: queriesRun,
    failed_queries: failedQueries,
    raw_items: taggedItems.length,
    deduped_items: deduped.length,
    haiku_returned: curation.items.length,
    curated_items: writtenCount,
    rejected_items: validated.rejected.length,
    duration_ms: durationMs
  };
  const profileSummary = {
    industries,
    state: stateAbbr,
    state_full: stateFull,
    region: region ? region.region_name : null,
    region_resolved: !!region
  };

  if (liveOutcome === 'validation_failed') {
    return res.status(422).json({
      success: false,
      dry_run: false,
      refresh_id: refreshId,
      outcome: liveOutcome,
      error: liveError,
      profile_summary: profileSummary,
      stats,
      timings,
      rejected_items: validated.rejected,
      audit_warnings: auditWarnings
    });
  }

  if (liveOutcome === 'error') {
    return res.status(500).json({
      success: false,
      dry_run: false,
      refresh_id: refreshId,
      outcome: liveOutcome,
      error: liveError,
      profile_summary: profileSummary,
      stats,
      timings,
      audit_warnings: auditWarnings
    });
  }

  // 'success' or 'no_results' — both return 200 success=true. For
  // 'no_results' the items object is just {} (no categories present)
  // and curated_items is 0; consumers can detect via stats.raw_items
  // or by the outcome field.
  return res.status(200).json({
    success: true,
    dry_run: false,
    refresh_id: refreshId,
    outcome: liveOutcome,
    profile_summary: profileSummary,
    stats,
    timings,
    items: grouped,
    audit_warnings: auditWarnings
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
