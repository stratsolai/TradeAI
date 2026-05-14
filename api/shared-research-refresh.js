// api/shared-research-refresh.js — Shared Research Layer endpoint
//
// SRL Cohort Architecture Addendum v1.2:
//   §4.1 — shared_research is cohort-scoped (cohort_id, not user_id)
//   §4.2 — shared_research_refreshes is cohort-scoped; triggered_by_tool
//          CHECK constraint narrowed to 'cron'
//   §7.1 — Endpoint body shape: { cohort_id, force_refresh, dry }
//   §7.2 — Auth: x-cron-secret (production) OR JWT (administrators only)
//   §7.3 — Response shape: profile_summary renamed cohort_summary
//   §8.1 — Curation model: claude-sonnet-4-6 (was haiku-4-5)
//   §8.2 — Cross-category routing. Pass D implemented this as
//          dispatcher-level fan-out; Pass D.7 superseded that with
//          one-batch-per-item dispatch (source_categories[0]) plus
//          a prompt-level RECATEGORISATION DUTY that requires Sonnet
//          to evaluate every content item against all five category
//          definitions before dropping it. The result is one
//          shared_research row per item — fan-out duplicates are
//          gone by construction. See lib/shared-research-curation.js
//          runCuration.
//
// Refresh pipeline (unchanged at the phase boundaries — just cohort-
// scoped instead of user-scoped):
//   1. Auth — x-cron-secret accepts body.cohort_id; JWT requires
//      profiles.is_admin = true.
//   2. Load cohort metadata from cohorts table.
//   3. Load one representative active profile from the cohort to
//      feed buildQueryPlan and the curation prompt with display
//      industry names and a postcode for region resolution. The
//      cohorts.industries column holds normalised slugs, which are
//      operational keys; Serper queries and the curation prompt
//      both need raw display names, which only profiles carry.
//   4. Build query plan, execute with Serper cache, dedupe, enrich.
//   5. Curate (Sonnet, five per-category Sonnet calls running in
//      parallel; each item arrives in one batch via
//      source_categories[0] and the prompt's RECATEGORISATION DUTY
//      handles cross-category fit).
//   6. Validate.
//   7. Dry-run: return cohort_summary + curated payload, no writes.
//   8. Live: snapshot is_current rows, flip to false, insert new
//      rows under the new refresh_id, write the refresh row with
//      outcome, record the shared_research_write audit event
//      (admin-JWT path only — cron has no user_id).
//
// Auth model heads-up:
//   - Cron path: x-cron-secret header + body.cohort_id. No user
//     context. Used by api/srl-scheduler.js, api/srl-worker.js, and
//     api/profile-save.js for the brand-new-cohort enqueue (via the
//     worker — profile-save itself enqueues; the worker calls here).
//   - Admin diagnostic path: JWT Bearer where the user's profile row
//     has is_admin = true. Admin may specify any cohort_id and any
//     combination of force_refresh and dry. Non-admin JWTs are
//     rejected with 401 (Addendum §7.2).

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

// Curation model identifier mirrored from lib/shared-research-curation.js
// for cost-attribution logging. logAnthropicUsage prices the call from
// this constant. Imported as a named export from the curation module
// to keep the two in lockstep.
import { CURATION_MODEL } from '../lib/shared-research-curation.js';

// Serper throttling — Phase 3.7. 4 lanes at a 250 ms minimum gap give
// ~4 req/s steady-state (80% of Serper's documented 5 req/s ceiling).
// The gap now lives in a per-refresh rate gate awaited inside
// executeQueryWithCache only on the cache-miss path, so cache hits
// don't queue against the Serper ceiling.
const SERPER_MAX_PARALLEL = 4;
const SERPER_DISPATCH_GAP_MS = 250;

// Per-result snippet truncation in dry-run output.
const TRUNCATE_CHARS = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fail loudly if CRON_SECRET is unset. Without it the cron-secret
  // path silently falls through to JWT auth — a deployment hazard
  // we'd rather surface as a hard 500 than a quiet auth misroute.
  if (!process.env.CRON_SECRET) {
    console.error('[SharedResearch] CRON_SECRET not configured — refusing request');
    return res.status(500).json({ error: 'Server misconfigured: CRON_SECRET not set' });
  }

  const t0 = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const timings = {};
  function recordTiming(phase, tStart) {
    const ms = Date.now() - tStart;
    timings[phase + '_ms'] = ms;
    console.log(`[SharedResearch] Phase timing — phase: ${phase}, ms: ${ms}`);
  }

  // -------------------------------------------------------------------------
  // Auth — x-cron-secret (cron) OR JWT Bearer (admin diagnostic only)
  // -------------------------------------------------------------------------
  //
  // Addendum §7.2 — the JWT path is retained but admits only users
  // whose profiles row carries is_admin = true. The pattern matches
  // requireAdmin() in api/admin-data.js et al. Non-admin JWTs are
  // rejected with 401, not 403 (Addendum §7.2 is explicit on 401).
  //
  // userId is set on the admin-JWT path and null on the cron path.
  // It flows into cache-access events and usage-logger; the helpers
  // already short-circuit when userId is missing, so cron-triggered
  // refreshes simply produce no shared_research_cache_access rows.
  // The shared_research_refreshes row (cohort_id + outcome) is the
  // cron-path audit anchor.
  const tAuth = Date.now();
  let userId = null;
  const cronSecret = req.headers['x-cron-secret'];
  const usingCron = !!(cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET);

  if (!usingCron) {
    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

    const adminRes = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (adminRes.error || !adminRes.data || adminRes.data.is_admin !== true) {
      console.error('[SharedResearch] Admin check rejected —', 'userId:', user.id);
      return res.status(401).json({ error: 'Administrator access required' });
    }
    userId = user.id;
  }
  recordTiming('auth', tAuth);

  // -------------------------------------------------------------------------
  // Request parameters (Addendum §7.1)
  // -------------------------------------------------------------------------
  const body = req.body || {};
  const cohortId = body.cohort_id || null;
  if (!cohortId) {
    return res.status(400).json({ error: 'cohort_id required' });
  }
  const forceRefresh = !!body.force_refresh;
  // dry is accepted on body per §7.1; the prior implementation read it
  // from the query string. Both are supported so an admin running
  // diagnostics via curl can use ?dry=true on the URL OR { "dry": true }
  // in the body — same semantics either way.
  const dryRun = body.dry === true || body.dry === 'true'
              || (req.query && (req.query.dry === 'true' || req.query.dry === '1'));

  // Refresh-scoped UUID. Used to:
  //   1. Tag every shared_research_cache_access row written during this
  //      refresh so audit events can be grouped by refresh
  //   2. Set the id of the shared_research_refreshes row (live mode only)
  //   3. Surface to the caller in the response so the owner can join
  //      dry-run output to audit rows
  const refreshId = crypto.randomUUID();
  const accessEvents = [];

  // Audit-write failures from either insert path (bulk cache_access
  // insert and shared_research_write insert) accumulate here and
  // surface in response.audit_warnings so silent audit-layer drops
  // are visible to the caller, not just to console.error.
  const auditWarnings = [];

  // -------------------------------------------------------------------------
  // Cohort metadata + representative-profile load
  // -------------------------------------------------------------------------
  //
  // The cohorts table holds operational metadata (industries slugs,
  // state abbreviation, region SA4 name, member_count_at_last_refresh).
  // The representative profile carries the raw display values that
  // Serper queries and the curation prompt actually consume.
  //
  // Picking a representative: any profile with cohort_id = cohortId
  // that has industry populated qualifies — all members of a cohort
  // normalise to the same cohort_id, so the underlying industry/state/
  // postcode values produce identical query plans. employee_range is
  // per-profile rather than per-cohort and is intentionally NOT
  // representative-locked: it is passed to the curation prompt as
  // 'unspecified' for cohort-scoped runs so curation does not bias
  // toward one member's business size (see comment in profile load).
  const tProfile = Date.now();

  const cohortRes = await supabase
    .from('cohorts')
    .select('cohort_id, industries, state, region, is_active, member_count_at_last_refresh, last_refreshed_at')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (cohortRes.error) {
    console.error('[SharedResearch] Cohort load error —', 'cohort_id:', cohortId, 'message:', cohortRes.error.message);
    return res.status(500).json({ error: 'Could not load cohort metadata' });
  }
  if (!cohortRes.data) {
    console.error('[SharedResearch] Unknown cohort —', 'cohort_id:', cohortId);
    return res.status(404).json({ error: 'Unknown cohort_id' });
  }
  const cohort = cohortRes.data;

  // Representative profile — needed for raw industry display names and
  // postcode (region resolution). Limit 1; if none, the cohort has no
  // active members and we can't build queries. Curation context fields
  // (employee_range) are deliberately set to 'unspecified' so the
  // curation prompt's BUSINESS PROFILE block is cohort-neutral — see
  // interpretive call note in the report.
  const repRes = await supabase
    .from('profiles')
    .select('industry, address_state, address_postcode')
    .eq('cohort_id', cohortId)
    .not('industry', 'is', null)
    .limit(1)
    .maybeSingle();
  if (repRes.error) {
    console.error('[SharedResearch] Representative profile load error —', 'cohort_id:', cohortId, 'message:', repRes.error.message);
    return res.status(500).json({ error: 'Could not load representative profile' });
  }
  if (!repRes.data) {
    console.error('[SharedResearch] Cohort has no representative profile —', 'cohort_id:', cohortId);
    return res.status(400).json({ error: 'Cohort has no active member profile' });
  }
  // Synthetic profile passed to buildQueryPlan and the curation
  // prompt. employee_range is omitted so the prompt renders
  // 'Business size: unspecified' — appropriate for cohort-scoped
  // curation where members can vary in size.
  const profile = {
    industry: repRes.data.industry,
    address_state: repRes.data.address_state,
    address_postcode: repRes.data.address_postcode,
    employee_range: null
  };

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

  const cohortSummary = {
    cohort_id: cohortId,
    industries,
    state: stateAbbr,
    state_full: stateFull,
    region: region ? region.region_name : null,
    region_resolved: !!region,
    member_count_at_last_refresh: cohort.member_count_at_last_refresh,
    last_refreshed_at: cohort.last_refreshed_at
  };

  if (plan.length === 0) {
    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      message: 'No queries to run — cohort representative lacks the data needed (state, industry, region).',
      cohort_summary: cohortSummary,
      timings
    });
  }

  // -------------------------------------------------------------------------
  // Execute the plan with the cache layer + Serper-only rate gate
  // -------------------------------------------------------------------------
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

  timings.cache_call_queue_wait_sum_ms = queueWaitSumMs;
  timings.cache_call_supabase_sum_ms = sumCacheLookup + sumCacheWrite;
  console.log(`[SharedResearch] Phase timing — phase: cache_call_queue_wait_sum, ms: ${queueWaitSumMs}`);
  console.log(`[SharedResearch] Phase timing — phase: cache_call_supabase_sum, ms: ${timings.cache_call_supabase_sum_ms}`);

  // Bulk-insert access events for this refresh. Skipped on cron path
  // because recordCacheAccessEvent short-circuits when userId is null,
  // so accessEvents stays empty and this block is a no-op.
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

  // Serper cost attribution. user_id is null for cron-triggered runs;
  // usage-logger accepts null and stores the row without user_id.
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
  // Curation + validation
  // -------------------------------------------------------------------------
  const tCuration = Date.now();
  const curation = await runCuration({
    profile,
    dedupedItems: deduped,
    anthropicKey: ANTHROPIC_API_KEY
  });
  recordTiming('curation', tCuration);

  if (curation.per_category) {
    const breakdown = {};
    for (const [cat, info] of Object.entries(curation.per_category)) {
      breakdown[cat] = {
        ms: info.duration_ms,
        items_in: info.items_in || 0,
        items_out: info.items_out || 0,
        input_tokens: info.input_tokens || 0,
        output_tokens: info.output_tokens || 0,
        // Pass D.10 — per-batch ok/error surfaced so silent batch
        // failures (e.g. JSON parse failure where output_tokens look
        // normal but items_out is 0) are visible in the dry-run
        // response, not only in Vercel function logs.
        ok: info.ok,
        error: info.error || null
      };
      console.log(`[SharedResearch] Phase timing — phase: curation_${cat}, ms: ${info.duration_ms}, items_in: ${info.items_in}, items_out: ${info.items_out}, input_tokens: ${info.input_tokens}, output_tokens: ${info.output_tokens}, ok: ${info.ok}`);
    }
    timings.curation_per_category_breakdown = breakdown;
  }

  // Cost attribution. Model identifier mirrors CURATION_MODEL in
  // lib/shared-research-curation.js — Sonnet for cohort-shared
  // curation per Addendum §8.1.
  const tLogAnthropic = Date.now();
  if (curation.usage) {
    await logAnthropicUsage({
      tool_id: 'shared-research',
      user_id: userId,
      model: CURATION_MODEL,
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

  const totalCurationFailure = curation.ok
    && curation.items.length > 0
    && validated.accepted.length === 0;

  // Join each accepted item back to its originating plan rows via URL
  // so source_queries / source_categories / source_industries can be
  // surfaced on the curated row in the response. These attribution
  // arrays are NOT persisted to shared_research — they're for
  // inspection and downstream tools that want to see which queries
  // surfaced an item.
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
  // Cache access events (read_hit / read_miss / write) ARE still
  // persisted on the admin-JWT path because that path has a user_id;
  // cron path produces zero events here too.
  // -------------------------------------------------------------------------
  if (dryRun) {
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
      cohort_summary: cohortSummary,
      stats: {
        total_queries: plan.length,
        cache_hits: cacheHits,
        fresh_queries: queriesRun,
        failed_queries: failedQueries,
        raw_items: taggedItems.length,
        deduped_items: deduped.length,
        curation_returned: curation.items.length,
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
  // Live mode — writes
  // -------------------------------------------------------------------------
  //
  // Outcome ladder:
  //   raw_items=0                                 -> 'no_results'
  //   curation.ok=false                           -> 'error'
  //   §9.5 whole-batch validation failure         -> 'validation_failed'
  //   accepted.length > 0                         -> 'success'
  //   accepted=0 AND rejected=0 (legitimate zero) -> 'success' with
  //     curated_items=0, no flip, no insert (existing batch left intact)
  //
  // 'success' is the only branch that flips is_current and writes to
  // shared_research. The other three outcomes leave existing
  // is_current=true rows untouched. The refresh row is written in
  // EVERY outcome (best effort).

  let liveOutcome;
  let liveError = null;
  let writtenCount = 0;
  const writeAccessEvents = [];

  if (taggedItems.length === 0) {
    liveOutcome = 'no_results';
    console.log('[SharedResearch] Live outcome — no_results, raw_items: 0, cohort_id:', cohortId);
  } else if (!curation.ok) {
    liveOutcome = 'error';
    liveError = curation.error || 'curation failed';
    console.log(`[SharedResearch] Live outcome — error, cohort_id: ${cohortId}, reason: ${liveError}`);
  } else if (totalCurationFailure) {
    liveOutcome = 'validation_failed';
    liveError = 'all curated items failed validation';
    console.log(`[SharedResearch] Live outcome — validation_failed, cohort_id: ${cohortId}, rejected: ${validated.rejected.length}`);
  } else if (acceptedWithSource.length === 0) {
    // Curation returned zero items legitimately (and zero rejections).
    // Nothing to write; existing batch stays as-is.
    liveOutcome = 'success';
    console.log('[SharedResearch] Live outcome — success (zero curated items, no flip), cohort_id:', cohortId);
  } else {
    // Success path — snapshot, flip, insert. Snapshot-first so the
    // flip is reversible if the insert fails. If the snapshot read
    // fails we abort BEFORE flipping — without a rollback anchor
    // a one-way flip with a failed insert leaves the cohort with
    // no current rows.
    const tSnapshot = Date.now();
    const snap = await snapshotCurrentRowIds(supabase, cohortId);
    recordTiming('is_current_snapshot', tSnapshot);

    if (!snap.ok) {
      liveOutcome = 'error';
      liveError = 'is_current snapshot failed: ' + (snap.error || 'unknown');
      console.error(`[SharedResearch] Live outcome — error (aborted before flip), cohort_id: ${cohortId}, reason: ${liveError}`);
    } else {
      const tFlip = Date.now();
      const flip = await flipIsCurrentFalse(supabase, cohortId);
      recordTiming('is_current_flip', tFlip);

      if (!flip.ok) {
        liveOutcome = 'error';
        liveError = 'is_current flip failed: ' + (flip.error || 'unknown');
        console.error(`[SharedResearch] Live outcome — error, cohort_id: ${cohortId}, reason: ${liveError}`);
      } else {
        const tBuildRows = Date.now();
        const rowsToInsert = acceptedWithSource.map((it) => buildSharedResearchRow(cohortId, refreshId, it));
        recordTiming('shared_research_rows_build', tBuildRows);

        const tInsert = Date.now();
        const ins = await insertSharedResearchRows(supabase, rowsToInsert);
        recordTiming('shared_research_insert', tInsert);

        if (ins.ok) {
          liveOutcome = 'success';
          writtenCount = ins.count;
          // Audit event for the shared_research write. Skipped on
          // cron path because recordSharedResearchWriteEvent
          // short-circuits when userId is null.
          recordSharedResearchWriteEvent(writeAccessEvents, { userId, refreshId });
          console.log(`[SharedResearch] Live outcome — success, cohort_id: ${cohortId}, written: ${writtenCount}`);
        } else {
          const tRollback = Date.now();
          await restoreIsCurrent(supabase, cohortId, snap.ids);
          await deleteRowsByRefreshId(supabase, refreshId);
          recordTiming('shared_research_rollback', tRollback);
          liveOutcome = 'error';
          liveError = 'shared_research insert failed: ' + (ins.error || 'unknown');
          console.error(`[SharedResearch] Live outcome — error (rolled back), cohort_id: ${cohortId}, reason: ${liveError}`);
        }
      }
    }
  }

  const durationMs = Date.now() - t0;

  // shared_research_refreshes — written for EVERY outcome. The
  // triggered_by_tool column's CHECK constraint accepts only 'cron'
  // (Addendum §4.2), so both the cron path and the admin-diagnostic
  // path tag the row 'cron'. Admin-triggered diagnostics remain
  // distinguishable in logs and via the userId on the cache_access
  // rows that the admin path produces.
  //
  // Column shape (Addendum §4.2): the six per-refresh stats values
  // (queries_run, cache_hits, raw_items, curated_items,
  // rejected_items, duration_ms) live inside a single `stats` jsonb
  // column. The schema migration after Pass D dropped the previous
  // individual integer columns. audit_warnings is sent as jsonb when
  // the array is non-empty.
  const tRefreshRow = Date.now();
  const refreshRowRes = await writeRefreshRow(supabase, {
    id: refreshId,
    cohort_id: cohortId,
    triggered_by_tool: 'cron',
    stats: {
      queries_run: queriesRun,
      cache_hits: cacheHits,
      raw_items: taggedItems.length,
      curated_items: writtenCount,
      rejected_items: validated.rejected.length,
      duration_ms: durationMs
    },
    outcome: liveOutcome,
    audit_warnings: auditWarnings.length > 0 ? auditWarnings : null
  });
  recordTiming('refresh_row_insert', tRefreshRow);
  if (!refreshRowRes.ok) {
    auditWarnings.push({ scope: 'refresh_row', message: refreshRowRes.error || 'unknown' });
  }

  // shared_research_write audit event (success path only, admin-JWT
  // path only — see writeAccessEvents.length === 0 fast-exit). One
  // row per refresh, cache_key = refresh_id.
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
  //   success / no_results: 200 with success=true
  //   validation_failed:    422 with success=false + error
  //   error:                500 with success=false + error
  // Refresh row written in all four outcomes above.

  const stats = {
    total_queries: plan.length,
    cache_hits: cacheHits,
    fresh_queries: queriesRun,
    failed_queries: failedQueries,
    raw_items: taggedItems.length,
    deduped_items: deduped.length,
    curation_returned: curation.items.length,
    curated_items: writtenCount,
    rejected_items: validated.rejected.length,
    duration_ms: durationMs
  };

  if (liveOutcome === 'validation_failed') {
    return res.status(422).json({
      success: false,
      dry_run: false,
      refresh_id: refreshId,
      outcome: liveOutcome,
      error: liveError,
      cohort_summary: cohortSummary,
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
      cohort_summary: cohortSummary,
      stats,
      timings,
      audit_warnings: auditWarnings
    });
  }

  return res.status(200).json({
    success: true,
    dry_run: false,
    refresh_id: refreshId,
    outcome: liveOutcome,
    cohort_summary: cohortSummary,
    stats,
    timings,
    items: grouped,
    audit_warnings: auditWarnings
  });
}

// ---------------------------------------------------------------------------
// Concurrency limiter — plain lane-based, no rate gate
// ---------------------------------------------------------------------------
//
// Promise.all with a fixed number of lanes that pull from a shared
// cursor. Each lane runs the worker to completion before picking the
// next index. The Serper rate gate lives inside the cache layer
// (Phase 3.7) so only cache-miss dispatches wait for a slot.

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

