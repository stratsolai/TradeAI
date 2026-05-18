// api/shared-research-refresh.js — Shared Research Layer endpoint
//
// SRL Cohort Architecture Addendum v1.2:
//   §4.1 — shared_research is cohort-scoped (cohort_id, not user_id)
//   §4.2 — shared_research_refreshes is cohort-scoped; triggered_by_tool
//          CHECK constraint admits 'cron' (cron pipeline + BP-save
//          enqueue) and 'admin' (JWT diagnostic path)
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
  AUSTRALIAN_STATES,
  buildQueryPlan,
  resolveRegion,
  normaliseIndustries,
  executeQueryWithCache,
  makeSerperRateGate,
  dedupByLink,
  dedupBySyndicationPath,
  enrichDedupedWithPlan,
  stateFullName,
  runCuration,
  validateCuratedItems,
  normaliseUrlForMatch,
  groupCuratedByCategory,
  snapshotCurrentRowIds,
  flipIsCurrentFalse,
  restoreIsCurrent,
  buildSharedResearchRow,
  insertSharedResearchRows,
  deleteRowsByRefreshId,
  writeRefreshRow,
  updateRefreshRowToError,
  recordSharedResearchWriteEvent
} from '../lib/shared-research.js';
import { logSerperUsage, logAnthropicUsage } from '../lib/usage-logger.js';
import { getIndustryById } from '../lib/industry-taxonomy.js';
import POSTCODE_REGIONS from '../lib/au-postcode-regions.js';
import { getSa4SlugsForSimpleRegion } from '../lib/au-region-mapping.js';

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

// ---------------------------------------------------------------------------
// Admin-dry-run cohort synthesis helpers
// ---------------------------------------------------------------------------
// Used when an admin fires a dry-run against a cohort_id that hasn't been
// registered by any user yet (calibration sweep mode). The cohort_id is
// parsed and validated against the same components a real BP would
// produce — taxonomy industry slugs, valid Australian state, an SA4 slug
// that resolves via lib/au-postcode-regions.js — and turned into a
// synthetic representative profile so buildQueryPlan downstream produces
// the same query plan it would for a real cohort member.
//
// Production paths (cron OR dry: false) skip this entirely. Only admin
// + dry: true gets here, and the synthesis writes nothing to cohorts,
// profiles, or shared_research_refreshes.

// Mirrors normaliseComponent in api/profile-save.js. Inlined here rather
// than imported to avoid a cross-handler dependency. If the two ever
// drift, the cohort_id round-trip breaks; the function is small and
// well-defined so divergence is unlikely.
function normaliseComponentLocal(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCohortId(cohortId) {
  if (typeof cohortId !== 'string' || cohortId.indexOf('::') === -1) {
    return { ok: false, error: 'Malformed cohort_id (expected industries::state::region)' };
  }
  const parts = cohortId.split('::');
  if (parts.length !== 3) {
    return { ok: false, error: 'Malformed cohort_id (expected three :: -separated parts, got ' + parts.length + ')' };
  }
  const industrySlugs = parts[0] ? parts[0].split('|').filter(Boolean) : [];
  if (industrySlugs.length === 0) {
    return { ok: false, error: 'Malformed cohort_id (no industry slugs)' };
  }
  const stateUpper = (parts[1] || '').toUpperCase();
  if (!stateUpper) {
    return { ok: false, error: 'Malformed cohort_id (empty state segment)' };
  }
  const regionSlug = parts[2] || '';
  if (!regionSlug) {
    return { ok: false, error: 'Malformed cohort_id (empty region segment)' };
  }
  return { ok: true, industrySlugs, stateUpper, regionSlug };
}

function synthesiseProfile(industrySlugs, stateUpper, regionSlug) {
  // Industry slug → display label via the taxonomy.
  const displayLabels = [];
  for (const slug of industrySlugs) {
    const entry = getIndustryById(slug);
    if (!entry) return { ok: false, error: 'Unknown industry slug in cohort_id: ' + slug };
    displayLabels.push(entry.displayLabel);
  }

  // State must be one of the eight Australian states/territories the
  // SRL plan layer recognises.
  if (!AUSTRALIAN_STATES[stateUpper]) {
    return { ok: false, error: 'Unknown state in cohort_id: ' + stateUpper };
  }

  // Region slug. Three legitimate forms accepted, in this order:
  //   1. 'no-region' sentinel — postcode didn't resolve to any SA4
  //      for the real cohort; region lenses are skipped downstream.
  //   2. SA4 slug match (the original behaviour) — find a
  //      representative postcode where state matches and
  //      normaliseComponent(entry.sa4) equals the slug. Preserves
  //      backward compat with cohort_ids targeting specific SA4s.
  //   3. Simple-region slug match — look up the array of SA4 slugs
  //      that map to this simple-region under the state, then find a
  //      representative postcode under any of them. Lets Task 46
  //      calibration cohorts target the journalism-friendly regions
  //      ('south-coast', 'pilbara-kimberley', etc.) without needing
  //      to know the underlying SA4 decomposition.
  // First hit wins in both (2) and (3) — every postcode in the SA4
  // (or in any SA4 of a simple-region group) is equivalent for SRL
  // purposes.
  let postcode = null;
  if (regionSlug !== 'no-region') {
    let matched = null;
    const keys = Object.keys(POSTCODE_REGIONS);
    // (2) Try SA4-slug match first
    for (let i = 0; i < keys.length; i++) {
      const pc = keys[i];
      const entry = POSTCODE_REGIONS[pc];
      if (!entry || entry.state !== stateUpper) continue;
      if (normaliseComponentLocal(entry.sa4) === regionSlug) { matched = pc; break; }
    }
    // (3) Fall back to simple-region match
    if (!matched) {
      const groupSa4Slugs = getSa4SlugsForSimpleRegion(stateUpper, regionSlug);
      if (groupSa4Slugs.length > 0) {
        const sa4Set = new Set(groupSa4Slugs);
        for (let i = 0; i < keys.length; i++) {
          const pc = keys[i];
          const entry = POSTCODE_REGIONS[pc];
          if (!entry || entry.state !== stateUpper) continue;
          if (sa4Set.has(normaliseComponentLocal(entry.sa4))) { matched = pc; break; }
        }
      }
    }
    if (!matched) {
      return { ok: false, error: 'Unresolvable region slug for state ' + stateUpper + ': ' + regionSlug };
    }
    postcode = matched;
  }

  return {
    ok: true,
    profile: {
      industry: displayLabels,
      address_state: stateUpper,
      address_postcode: postcode,
      employee_range: null
    }
  };
}

// Used when a real cohort row exists in the cohorts table but has zero
// current member profiles (rare — e.g. the only member's last BP save
// moved them to a new cohort). Re-derives the synthesis inputs from the
// cohort's stored shape: industries is already a slug array, state is
// already uppercase, region is the SA4 display name (normalise to slug)
// or null (treat as 'no-region').
function synthesiseProfileFromCohortMeta(cohort) {
  const industrySlugs = Array.isArray(cohort.industries) ? cohort.industries : [];
  const stateUpper = (cohort.state || '').toUpperCase();
  const regionSlug = cohort.region ? normaliseComponentLocal(cohort.region) : 'no-region';
  return synthesiseProfile(industrySlugs, stateUpper, regionSlug);
}

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
  //
  // Admin-dry-run synthesis: when an admin fires dry: true against a
  // well-formed cohort_id that hasn't been registered yet (no row in
  // cohorts, no member in profiles), the gates below fall through to
  // synthesiseProfile() / synthesiseProfileFromCohortMeta() instead of
  // returning 404/400. Production paths (cron, or any dry: false
  // request) keep the original 404/400 — the gates only loosen when
  // both flags hold. See helpers near the top of the file.
  const tProfile = Date.now();

  // Admin-dry-run path: dry: true + JWT-auth admin user. Allows
  // calibration sweeps against well-formed cohort_ids that haven't been
  // registered yet (no user has saved a profile that decomposes to
  // this cohort). Production behaviour (cron path OR dry: false) is
  // unchanged — both gates below still return their 404/400.
  const adminDryRun = !usingCron && !!userId && dryRun;

  const cohortRes = await supabase
    .from('cohorts')
    .select('cohort_id, industries, state, region, is_active, member_count_at_last_refresh, last_refreshed_at')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (cohortRes.error) {
    console.error('[SharedResearch] Cohort load error —', 'cohort_id:', cohortId, 'message:', cohortRes.error.message);
    return res.status(500).json({ error: 'Could not load cohort metadata' });
  }

  let cohort;
  let profile;

  if (cohortRes.data) {
    cohort = cohortRes.data;
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
    if (repRes.data) {
      profile = {
        industry: repRes.data.industry,
        address_state: repRes.data.address_state,
        address_postcode: repRes.data.address_postcode,
        employee_range: null
      };
    } else if (adminDryRun) {
      // Cohort exists in cohorts table but no member profile currently
      // (e.g. the only member changed BP and moved to a new cohort).
      // Synthesise from cohort metadata so admin calibration still runs.
      const synth = synthesiseProfileFromCohortMeta(cohort);
      if (!synth.ok) return res.status(400).json({ error: synth.error });
      profile = synth.profile;
      console.log('[SharedResearch] Admin dry-run synthesised profile (cohort exists, no current members) —', 'cohort_id:', cohortId);
    } else {
      console.error('[SharedResearch] Cohort has no representative profile —', 'cohort_id:', cohortId);
      return res.status(400).json({ error: 'Cohort has no active member profile' });
    }
  } else if (adminDryRun) {
    // Unregistered cohort + admin dry-run = calibration mode. Parse the
    // cohort_id, validate each component against the taxonomy and the
    // postcode lookup, and synthesise both a cohort metadata stub and
    // a representative profile so the rest of the pipeline runs
    // unchanged. Doesn't write anything to cohorts or shared_research_
    // refreshes — dry-run never has, that's preserved here. Cache_access
    // events for Serper queries are still written under the admin
    // user_id; they have no FK to cohorts, so a synthesised cohort_id
    // doesn't break the audit chain.
    const parsed = parseCohortId(cohortId);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const synth = synthesiseProfile(parsed.industrySlugs, parsed.stateUpper, parsed.regionSlug);
    if (!synth.ok) return res.status(400).json({ error: synth.error });
    profile = synth.profile;
    cohort = {
      cohort_id: cohortId,
      industries: parsed.industrySlugs,
      state: parsed.stateUpper,
      region: null,
      is_active: false,
      member_count_at_last_refresh: 0,
      last_refreshed_at: null
    };
    console.log('[SharedResearch] Admin dry-run synthesised cohort (unregistered) —', 'cohort_id:', cohortId);
  } else {
    console.error('[SharedResearch] Unknown cohort —', 'cohort_id:', cohortId);
    return res.status(404).json({ error: 'Unknown cohort_id' });
  }

  const industries = normaliseIndustries(profile);
  const region = resolveRegion(profile);
  const stateAbbr = profile.address_state || null;
  const stateFull = stateFullName(stateAbbr);
  recordTiming('profile_and_region', tProfile);

  // cohort_summary is built early so it can be included in both the
  // incomplete-profile (422) and zero-queries (200) response bodies
  // below, in addition to the live response further down.
  const cohortSummary = {
    cohort_id: cohortId,
    industries,
    state: stateAbbr,
    state_full: stateFull,
    region: region ? region.region_name : null,
    region_simple: region ? region.simple_name : null,
    region_resolved: !!region,
    member_count_at_last_refresh: cohort.member_count_at_last_refresh,
    last_refreshed_at: cohort.last_refreshed_at
  };

  // -------------------------------------------------------------------------
  // Cohort representative profile completeness check
  // -------------------------------------------------------------------------
  //
  // Two genuinely different failure modes used to collapse into a single
  // 200 + message response. They're now split so Task 46 calibration
  // sweeps (and any future caller) can triage them by status code:
  //
  //   1. Incomplete profile (422) — the cohort exists (cron / dry: false)
  //      or was synthesised (admin dry-run), but the representative
  //      profile lacks one of the components the planner needs:
  //        - industries empty after normaliseIndustries
  //        - state missing on the representative
  //        - region missing when the cohort_id specified one
  //          (regionSlug != 'no-region')
  //      Bad-data finding — the caller can't fix this by re-firing;
  //      the underlying cohort needs attention.
  //
  //   2. Complete profile, planner returned [] (200 + queries_run: 0) —
  //      every component the cohort_id specified is present and
  //      resolved, but buildQueryPlan still produced no queries.
  //      Practically unreachable today because three national-smes
  //      cells (regulatory, economic, technology) always fire without
  //      needing state/region/industry. Kept as a defensive surface so
  //      a future template change that legitimately produces zero
  //      queries reads as a real finding rather than a bad-input echo.
  //
  // Why 422 and not 400 for the incomplete-profile case: 400 elsewhere
  // in this file is reserved for caller-fixable input errors (malformed
  // cohort_id, unknown industry slug in synthesis, unresolvable region
  // slug, missing required body field). The 422 case is different — the
  // request is well-formed and the cohort_id parsed cleanly; the fail
  // is a semantic incompleteness of the underlying cohort entity. The
  // calibration caller can split 400 ("my call is wrong") from 422
  // ("the cohort is broken") on status code alone.
  const idParts = String(cohortId).split('::');
  const cohortRegionSlug = idParts.length === 3 ? idParts[2] : '';
  const regionExpected = !!cohortRegionSlug && cohortRegionSlug !== 'no-region';

  const missingFields = [];
  if (industries.length === 0) missingFields.push('industry');
  if (!stateAbbr) missingFields.push('state');
  if (regionExpected && !region) missingFields.push('region');

  if (missingFields.length > 0) {
    return res.status(422).json({
      success: false,
      dry_run: dryRun,
      error: 'Cohort representative profile is incomplete',
      missing_fields: missingFields,
      cohort_summary: cohortSummary
    });
  }

  // -------------------------------------------------------------------------
  // Query plan generation
  // -------------------------------------------------------------------------
  const tPlanBuild = Date.now();
  const plan = buildQueryPlan(profile);
  recordTiming('plan_build', tPlanBuild);

  if (plan.length === 0) {
    // Complete profile (passed the completeness check above) but the
    // planner still produced zero queries. See the comment block above
    // for why this is its own response shape.
    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      queries_run: 0,
      message: 'Planner produced no queries despite a complete cohort representative profile. Investigate template coverage.',
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
  // Cross-domain syndication dedup — collapses items that share a
  // URL path across different domains (e.g. Nine Entertainment's
  // The Age / SMH twin publishing). Merges plan_indices into the
  // surviving item so attribution downstream covers every query
  // that surfaced the article across any masthead. The drop count
  // is surfaced in the response stats as cross_domain_dropped.
  const crossDomainResult = dedupBySyndicationPath(dedupedRaw);
  const crossDomainDropped = crossDomainResult.droppedCount;
  const deduped = enrichDedupedWithPlan(crossDomainResult.items, plan);
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
  // Single normalised-URL → deduped lookup used by both the curated-
  // item enrichment below AND the count reconciliation in the dry-run
  // block further down. Built once, shared across both paths so the
  // source-of-truth for matching is the same everywhere — what the
  // validator used for the fabricated-URL check, what the rejected-
  // items diff uses, and what the source_name + attribution overrides
  // here use. Survives any cosmetic URL mutation by Sonnet (trailing
  // slash, fragment, query param order, case, www. prefix) that the
  // validator's normalised check accepts.
  const dedupedByNorm = new Map();
  for (const d of deduped) {
    const norm = d && d.normalised_url;
    if (norm && !dedupedByNorm.has(norm)) dedupedByNorm.set(norm, d);
  }
  const acceptedWithSource = validated.accepted.map((it) => {
    const norm = normaliseUrlForMatch(it && it.url);
    const src = norm ? dedupedByNorm.get(norm) : null;
    const overrides = {
      source_queries: src ? src.source_queries : [],
      source_categories: src ? src.source_categories : [],
      source_industries: src ? src.source_industries : []
    };
    // Symmetry with rejected_items.source_name (which uses Serper's raw
    // source field): override Sonnet's emitted source_name with the
    // matching deduped item's Serper source when available. Sonnet's
    // prompt instructs it to derive source_name from Serper's input
    // anyway, so this is the more authoritative form of the same value
    // — downstream tooling reading either curated_items or
    // rejected_items gets the same source-of-truth for source_name.
    // Lookup is normalised-URL so cosmetic URL mutation by Sonnet
    // (trailing slash, fragment, query param order) doesn't silently
    // fall back to Sonnet's emission. Fallback only fires when src is
    // genuinely missing — should be never for validated items since
    // the validator's own normalised check would have rejected them.
    //
    // Override applies to both dry-run response AND persisted
    // shared_research rows: buildSharedResearchRow downstream is
    // called with acceptedWithSource (not validated.accepted), so the
    // persisted row carries the Serper-source-of-truth value too.
    if (src && src.source) overrides.source_name = src.source;
    return Object.assign({}, it, overrides);
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

    // Build the full rejected_items list. validateCuratedItems only
    // reports items Sonnet RETURNED but the validator dropped
    // (fabricated URL, missing fields, invalid category/lens). The much
    // larger set — items Sonnet was given but chose not to return —
    // wasn't surfaced anywhere, leaving the dry-run rejected_items
    // array misleadingly empty even when Sonnet had dropped scores of
    // items. We compute the implicit-rejection set here by diffing the
    // deduped input against the URLs Sonnet returned (normalised to
    // match the fabricated-URL check) and merge it with the validator
    // rejections into a single shape.
    //
    // URL normalisation: deduped items carry normalised_url pre-computed
    // by enrichDedupedWithPlan using the same normaliseUrlForMatch the
    // validator uses for fabrication checking. Sonnet's returned items
    // don't go through that pipeline, so they get normalised on the fly
    // here via the same shared function — single canonical normaliser
    // on both sides, survives any future URL mutation by Sonnet
    // (trailing slashes, fragments, query param order, etc.) without
    // silently over-reporting rejections.
    //
    // The persisted cohort cache is unaffected — this output is
    // dry-run-only.
    const tRejected = Date.now();
    // source_domain on rejected items matches the shape Sonnet emits on
    // curated_items — the bare host with no protocol and no www prefix
    // (lib/shared-research-curation.js prompt §source_domain). Derived
    // from the URL on both rejection paths so debuggers and aggregators
    // can join across curated_items and rejected_items by the same key.
    // Serper's human-readable source name (e.g. "Australian Broker
    // News") goes on a separate source_name field where available.
    function urlToDomain(rawUrl) {
      if (!rawUrl || typeof rawUrl !== 'string') return '';
      try {
        var u = new URL(rawUrl.trim());
        var host = (u.hostname || '').toLowerCase();
        if (host.indexOf('www.') === 0) host = host.slice(4);
        return host;
      } catch (e) { return ''; }
    }

    const sonnetReturnedNormUrls = new Set();
    for (const it of curation.items || []) {
      const norm = normaliseUrlForMatch(it && it.url);
      if (norm) sonnetReturnedNormUrls.add(norm);
    }
    const sonnetRejected = [];
    for (const it of deduped) {
      const norm = it && it.normalised_url;
      if (!norm || sonnetReturnedNormUrls.has(norm)) continue;
      sonnetRejected.push({
        reason: 'not_returned_by_sonnet',
        rejected_by: 'sonnet',
        title: (it.title || '').slice(0, TRUNCATE_CHARS),
        url: it.link,
        source_domain: urlToDomain(it.link),
        source_name: it.source || '',
        categories_considered: it.source_categories || [],
        lenses: it.lenses || [],
        snippet: (it.snippet || '').slice(0, TRUNCATE_CHARS)
      });
    }
    // Map validator rejections into the same shape. URL → domain on the
    // validator side too — Sonnet's source_domain on rejected items
    // shouldn't be trusted because the very reason it's being rejected
    // may include a malformed source_domain; deriving from the URL
    // matches what the validator and persistence layer would have done
    // had the item been accepted. dedupedByNorm is the shared lookup
    // built above for the curated-item enrichment; reused here so both
    // paths agree on what URL maps back to which deduped row.
    const validatorRejected = (validated.rejected || []).map((r) => {
      const item = (r && r.item) || {};
      const normUrl = normaliseUrlForMatch(item.url);
      const src = normUrl ? dedupedByNorm.get(normUrl) : null;
      const itemLens = item.lens;
      const itemCat = item.category;
      const itemUrl = item.url || '';
      return {
        reason: r.reason,
        rejected_by: 'validator',
        title: ((item.title || r.title) || '').toString().slice(0, TRUNCATE_CHARS),
        url: itemUrl,
        source_domain: urlToDomain(itemUrl) || (src ? urlToDomain(src.link) : ''),
        source_name: src ? (src.source || '') : '',
        categories_considered: Array.isArray(itemCat) ? itemCat : (itemCat ? [itemCat] : (src ? (src.source_categories || []) : [])),
        lenses: Array.isArray(itemLens) ? itemLens : (itemLens ? [itemLens] : (src ? (src.lenses || []) : [])),
        snippet: src ? (src.snippet || '').slice(0, TRUNCATE_CHARS) : ''
      };
    });
    const rejectedItems = sonnetRejected.concat(validatorRejected);
    recordTiming('build_rejected_items', tRejected);

    // Count reconciliation — every deduped item must end up in exactly
    // one bucket: accepted, rejected_by_sonnet, or rejected_by_validator
    // (the last only when the validator-rejected URL maps back to a
    // deduped entry, i.e. excluding fabricated URLs that don't
    // correspond to any input item). A mismatch usually means either a
    // normalisation drift between curation's pipeline and the diff
    // (silent over-reporting) or the original-bug shape — Sonnet
    // returned far fewer items than the diff is seeing (silent under-
    // reporting). The warning fires loud in Vercel logs without
    // throwing — the dry-run still returns whatever counts it has so
    // the human investigating can see the discrepancy directly.
    const validatorRejectedInDeduped = validatorRejected.filter(function(r) {
      var norm = normaliseUrlForMatch(r.url);
      return norm && dedupedByNorm.has(norm);
    }).length;
    const reconcileSum = validated.accepted.length + sonnetRejected.length + validatorRejectedInDeduped;
    if (reconcileSum !== deduped.length) {
      console.warn(
        '[SharedResearch] Rejection reconciliation mismatch — deduped: ' + deduped.length +
        ', accepted: ' + validated.accepted.length +
        ', rejected_by_sonnet: ' + sonnetRejected.length +
        ', rejected_by_validator: ' + validatorRejected.length +
        ', rejected_by_validator_in_deduped: ' + validatorRejectedInDeduped +
        ', sum: ' + reconcileSum
      );
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
      cohort_summary: cohortSummary,
      stats: {
        total_queries: plan.length,
        cache_hits: cacheHits,
        fresh_queries: queriesRun,
        failed_queries: failedQueries,
        raw_items: taggedItems.length,
        deduped_items: deduped.length,
        cross_domain_dropped: crossDomainDropped,
        curation_returned: curation.items.length,
        curated_items: validated.accepted.length,
        rejected_items: rejectedItems.length,
        rejected_by_sonnet: sonnetRejected.length,
        rejected_by_validator: validatorRejected.length,
        duration_ms: totalDuration
      },
      timings,
      query_plan: queryStats,
      raw_results: truncatedItems,
      curated_items: grouped,
      rejected_items: rejectedItems,
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
  //   accepted.length > 0                         -> 'success' (with writes)
  //   accepted=0 AND rejected=0 (legitimate zero) -> 'success' (no writes)
  //
  // Write ordering (Phase 7 integrity fix):
  // The shared_research_refreshes row is INSERTed BEFORE the items
  // it parents. If the refresh row write fails, the handler aborts
  // with a 500 and no items are written — items cannot orphan
  // because they never land. If items subsequently fail, the
  // refresh row is UPDATEd to outcome='error' with stats showing
  // zero items, and is_current is restored from the snapshot.
  //
  // The previous order (items first, refresh row last) could leave
  // shared_research rows pointing at a non-existent refresh_id when
  // the refresh row write failed — and the handler still returned
  // success because the items had landed. That is the bug this
  // reordering closes.

  let liveOutcome;
  let liveError = null;
  let writtenCount = 0;
  const writeAccessEvents = [];

  // Snapshot is taken here (before the refresh row write) only for
  // the with-writes branch, so rollback is possible if anything
  // downstream fails. Other outcome branches don't touch is_current
  // and don't need a snapshot.
  let snap = null;
  let willWriteItems = false;
  let intendedCuratedCount = 0;

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
    // With-writes path — snapshot is_current rows for rollback safety.
    // If the snapshot fails we cannot safely flip, so we error out
    // before touching anything downstream.
    const tSnapshot = Date.now();
    snap = await snapshotCurrentRowIds(supabase, cohortId);
    recordTiming('is_current_snapshot', tSnapshot);

    if (!snap.ok) {
      liveOutcome = 'error';
      liveError = 'is_current snapshot failed: ' + (snap.error || 'unknown');
      console.error(`[SharedResearch] Live outcome — error (aborted before flip), cohort_id: ${cohortId}, reason: ${liveError}`);
    } else {
      // Optimistic — refresh row writes with outcome='success' and
      // intended item count; flipped to 'error' downstream if writes
      // fail.
      liveOutcome = 'success';
      willWriteItems = true;
      intendedCuratedCount = acceptedWithSource.length;
    }
  }

  const durationMs = Date.now() - t0;

  // Stats builder so both the initial INSERT and the rollback UPDATE
  // produce the same shape with only curated_items differing.
  const buildStats = (curatedCount) => ({
    queries_run: queriesRun,
    cache_hits: cacheHits,
    raw_items: taggedItems.length,
    curated_items: curatedCount,
    rejected_items: validated.rejected.length,
    duration_ms: durationMs
  });

  // shared_research_refreshes — written FIRST as the integrity anchor.
  // triggered_by_tool admits 'cron' (scheduler, worker, BP-save
  // enqueue) and 'admin' (JWT diagnostic path) per Phase 7 schema
  // change. started_at reuses t0 (handler start). completed_at is set
  // inside writeRefreshRow at INSERT moment; updateRefreshRowToError
  // bumps it again on rollback. stats.curated_items records the
  // INTENDED count (acceptedWithSource.length on the with-writes
  // path, 0 elsewhere); if writes fail downstream the row is updated
  // to curated_items: 0 alongside outcome='error'.
  const tRefreshRow = Date.now();
  const refreshRowRes = await writeRefreshRow(supabase, {
    id: refreshId,
    cohort_id: cohortId,
    triggered_by_tool: usingCron ? 'cron' : 'admin',
    started_at: new Date(t0).toISOString(),
    stats: buildStats(willWriteItems ? intendedCuratedCount : 0),
    outcome: liveOutcome,
    audit_warnings: auditWarnings
  });
  recordTiming('refresh_row_insert', tRefreshRow);

  if (!refreshRowRes.ok) {
    // Refresh row write failed — abort the entire refresh. No flip
    // performed, no items inserted. The response reports the failure
    // accurately rather than masking it with a 'success' that has no
    // audit anchor.
    const errText = 'refresh row write failed: ' + (refreshRowRes.error || 'unknown');
    auditWarnings.push({ scope: 'refresh_row', message: refreshRowRes.error || 'unknown' });
    console.error(`[SharedResearch] Aborting refresh — refresh row write failed, cohort_id: ${cohortId}, message: ${refreshRowRes.error || 'unknown'}`);
    timings.total_ms = Date.now() - t0;
    // Response stats matches the full 10-field response shape used
    // elsewhere in this handler — curated_items: 0 because no writes
    // happened, the rest are populated from the pipeline state we
    // had before the abort.
    return res.status(500).json({
      success: false,
      dry_run: false,
      refresh_id: refreshId,
      outcome: 'error',
      error: errText,
      cohort_summary: cohortSummary,
      stats: {
        total_queries: plan.length,
        cache_hits: cacheHits,
        fresh_queries: queriesRun,
        failed_queries: failedQueries,
        raw_items: taggedItems.length,
        deduped_items: deduped.length,
        cross_domain_dropped: crossDomainDropped,
        curation_returned: curation.items.length,
        curated_items: 0,
        rejected_items: validated.rejected.length,
        duration_ms: durationMs
      },
      timings,
      audit_warnings: auditWarnings
    });
  }

  // Refresh row is in place. If we don't need to write items, we're done
  // with the write phase. Otherwise: flip is_current, insert items, with
  // rollback to error on failure.
  if (willWriteItems) {
    const tFlip = Date.now();
    const flip = await flipIsCurrentFalse(supabase, cohortId);
    recordTiming('is_current_flip', tFlip);

    if (!flip.ok) {
      // Flip failed. Best-effort restore (typically a no-op if zero
      // rows actually flipped), then mark the refresh row as error.
      await restoreIsCurrent(supabase, cohortId, snap.ids);
      await updateRefreshRowToError(supabase, refreshId, buildStats(0));
      liveOutcome = 'error';
      liveError = 'is_current flip failed: ' + (flip.error || 'unknown');
      console.error(`[SharedResearch] Live outcome — error (flip failed, refresh row updated), cohort_id: ${cohortId}, reason: ${liveError}`);
    } else {
      const tBuildRows = Date.now();
      const rowsToInsert = acceptedWithSource.map((it) => buildSharedResearchRow(cohortId, refreshId, it));
      recordTiming('shared_research_rows_build', tBuildRows);

      const tInsert = Date.now();
      const ins = await insertSharedResearchRows(supabase, rowsToInsert);
      recordTiming('shared_research_insert', tInsert);

      if (ins.ok) {
        writtenCount = ins.count;
        // Audit event for the shared_research write. Skipped on
        // cron path because recordSharedResearchWriteEvent
        // short-circuits when userId is null.
        recordSharedResearchWriteEvent(writeAccessEvents, { userId, refreshId });
        console.log(`[SharedResearch] Live outcome — success, cohort_id: ${cohortId}, written: ${writtenCount}`);
      } else {
        // Item insert failed. Rollback flip and mark refresh row as
        // error. deleteRowsByRefreshId is defensive — Postgres INSERT
        // is atomic so rows should not have landed, but the cleanup
        // protects against any partial state.
        const tRollback = Date.now();
        await restoreIsCurrent(supabase, cohortId, snap.ids);
        await deleteRowsByRefreshId(supabase, refreshId);
        await updateRefreshRowToError(supabase, refreshId, buildStats(0));
        recordTiming('shared_research_rollback', tRollback);
        liveOutcome = 'error';
        liveError = 'shared_research insert failed: ' + (ins.error || 'unknown');
        console.error(`[SharedResearch] Live outcome — error (rolled back, refresh row updated), cohort_id: ${cohortId}, reason: ${liveError}`);
      }
    }
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
    cross_domain_dropped: crossDomainDropped,
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

