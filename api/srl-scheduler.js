// api/srl-scheduler.js — SRL Cohort Architecture Addendum v1.2
//
// Daily cron that maintains the cohorts table and enqueues one
// srl_cron_jobs row per is_active cohort for the SRL worker to drain.
// Pass C in the rebuild sequence. The companion worker is
// api/srl-worker.js.
//
// Scope (Addendum §5.2 Steps A and B):
//
//   Step A — Cohorts-table rebuild from active profiles
//     Read distinct cohort_id from profiles whose subscription state
//     is active. Upsert each into cohorts with is_active = true,
//     populating industries / state / region from the underlying
//     profile values. Mark cohorts not present in the active set as
//     is_active = false.
//
//   Step B — Enqueue one srl_cron_jobs row per is_active = true
//     cohort. Dedupe against any queued / in_progress row already
//     present for that cohort so a slow worker tick doesn't stack
//     duplicates on the next scheduler run.
//
// Steps C–F (drain, refresh per cohort, update cohorts.last_refreshed_at,
// housekeeping) are owned by api/srl-worker.js — the scheduler only
// rebuilds and enqueues.
//
// Auth: CRON_SECRET required in Authorization: Bearer header (matches
// every other Vercel-cron-triggered endpoint on the platform —
// scan-scheduler, news-digest-scheduler, signup-pending-cleanup).
//
// "Active" subscription state means any of:
//   - is_trial = true AND trial_expires_at > now()       (live trial)
//   - bundle_tier IS NOT NULL                            (paying bundle)
//   - activated_tools is a non-empty array               (paying tools)
// Users with cohort_id = null never enter the set (BP not complete
// enough to compute a cohort).

export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';
import POSTCODE_REGIONS from '../lib/au-postcode-regions.js';
import { getSimpleRegionName, normaliseRegionSlug } from '../lib/au-region-mapping.js';
import { getIndustryById } from '../lib/industry-taxonomy.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ---------------------------------------------------------------------------
// Cohort metadata derivation
// ---------------------------------------------------------------------------
//
// Two members of the same cohort can carry slightly different raw
// BP values (capitalisation, ordering, postcode strings missing
// leading zeroes). They all normalise to the same cohort_id by
// construction of profile-save.js's computeCohortId. The cohorts
// table needs deterministic operational metadata so consecutive
// scheduler runs don't flip-flop columns between representatives.
//
// industries: sorted, deduped, normalised (lowercase, & → ' and ', non-
//   alphanumeric → '-'). Matches the cohort_id's industries segment.
// state: uppercased state abbreviation.
// region: simple-region NAME from the (state, SA4) → simple-region
//   mapping in lib/au-region-mapping.js, or null when the postcode
//   does not resolve OR no simple-region mapping covers the SA4.
//   Not the literal 'no-region' string — the cohorts.region column
//   holds the human-readable simple-region name (e.g. "Mid North
//   Coast", "South Coast") or NULL. The cohort_id meanwhile carries
//   the normalised 'no-region' literal in the region segment, which
//   is the keying contract; the cohorts table separates display
//   from key. SA4 is an internal postcode-lookup intermediate only —
//   not part of cohort identity. See Addendum §4.5.

function normaliseIndustry(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normaliseIndustryList(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) list = [raw];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const norm = normaliseIndustry(item);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  out.sort();
  return out;
}

// Slug → display-label array, in the same order as the slug input.
// Populates cohorts.industries_display so api/shared-research-refresh.js
// can read display names directly from the cohorts row without needing
// a representative-profile sample. Falls back to the slug itself when a
// slug is not in the taxonomy (defensive — should be impossible because
// profile-save validates against the same taxonomy when assigning
// cohort_id).
function deriveIndustryDisplayLabels(slugs) {
  return (slugs || []).map((slug) => {
    const entry = getIndustryById(slug);
    return entry ? entry.displayLabel : slug;
  });
}

function resolveSimpleRegion(rawPostcode) {
  if (!rawPostcode) return null;
  const raw = String(rawPostcode).trim();
  if (!raw) return null;
  const padded = raw.length < 4 ? raw.padStart(4, '0') : raw;
  if (!/^\d{4}$/.test(padded)) return null;
  const entry = POSTCODE_REGIONS[padded];
  if (!entry || !entry.sa4 || !entry.state) return null;
  return getSimpleRegionName(entry.state, normaliseRegionSlug(entry.sa4));
}

function isActiveProfile(p) {
  const now = Date.now();
  if (p.is_trial === true && p.trial_expires_at) {
    const exp = new Date(p.trial_expires_at).getTime();
    if (Number.isFinite(exp) && exp > now) return true;
  }
  if (p.bundle_tier) return true;
  if (Array.isArray(p.activated_tools) && p.activated_tools.length > 0) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── CRON_SECRET auth ─────────────────────────────────────────────
  // Missing env var is a deployment hazard, not an auth failure —
  // return 500 so a misconfigured environment surfaces visibly.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[srl-scheduler] CRON_SECRET not configured — refusing request');
    return res.status(500).json({ error: 'Server misconfigured: CRON_SECRET not set' });
  }
  const authHeader = req.headers['authorization'] || '';
  if (authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let cohortsInserted = 0;
  let cohortsActivated = 0;
  let cohortsDeactivated = 0;
  let queued = 0;
  let skippedAlreadyActive = 0;
  let errors = 0;

  try {
    // ─────────────────────────────────────────────────────────────
    // Step A — Cohorts-table rebuild
    // ─────────────────────────────────────────────────────────────

    // Load every profile with a cohort_id. The active-state filter
    // is applied in JS because Supabase REST doesn't compose the
    // (is_trial unexpired) OR (bundle_tier set) OR (activated_tools
    // non-empty) predicate cleanly, and the row count is small.
    const profilesRes = await supabase
      .from('profiles')
      .select('id, cohort_id, industry, address_state, address_postcode, is_trial, trial_expires_at, bundle_tier, activated_tools')
      .not('cohort_id', 'is', null);
    if (profilesRes.error) {
      console.error('[srl-scheduler] Profiles query error:', profilesRes.error.message);
      return res.status(500).json({ error: 'Failed to load profiles' });
    }
    const allProfiles = profilesRes.data || [];
    const activeProfiles = allProfiles.filter(isActiveProfile);

    // Group active profiles by cohort_id. Pick the first encountered
    // representative for industries / state / region — all members
    // normalise to the same cohort_id, so column values are stable
    // across runs once normalised. member_count tracks how many
    // active users sit in this cohort; the worker writes it to
    // cohorts.member_count_at_last_refresh on successful refresh.
    const activeMap = new Map();
    for (const p of activeProfiles) {
      let entry = activeMap.get(p.cohort_id);
      if (!entry) {
        entry = {
          cohort_id: p.cohort_id,
          industries: normaliseIndustryList(p.industry),
          state: (p.address_state || '').toUpperCase() || null,
          region: resolveSimpleRegion(p.address_postcode),
          member_count: 0
        };
        activeMap.set(p.cohort_id, entry);
      }
      entry.member_count += 1;
    }

    // Load the existing cohorts table so we can compute the
    // activate / deactivate deltas without blindly upserting every
    // row every run.
    const existingRes = await supabase
      .from('cohorts')
      .select('cohort_id, is_active');
    if (existingRes.error) {
      console.error('[srl-scheduler] Cohorts read error:', existingRes.error.message);
      return res.status(500).json({ error: 'Failed to load cohorts' });
    }
    const existingMap = new Map();
    for (const row of existingRes.data || []) existingMap.set(row.cohort_id, row);

    // Upsert every active cohort. Insert when new; ensure
    // is_active = true when previously deactivated. industries /
    // state / region are refreshed on every run so a BP edit that
    // doesn't change cohort_id (e.g. cosmetic industry casing
    // change that normalises to the same slug) is still reflected.
    for (const cohort of activeMap.values()) {
      try {
        const existing = existingMap.get(cohort.cohort_id);
        const upsertRow = {
          cohort_id: cohort.cohort_id,
          industries: cohort.industries,
          industries_display: deriveIndustryDisplayLabels(cohort.industries),
          state: cohort.state,
          region: cohort.region,
          is_active: true
        };
        const ups = await supabase
          .from('cohorts')
          .upsert(upsertRow, { onConflict: 'cohort_id' });
        if (ups.error) {
          console.error('[srl-scheduler] Cohorts upsert error — cohort_id:', cohort.cohort_id, 'message:', ups.error.message);
          errors++;
          continue;
        }
        if (!existing) cohortsInserted++;
        else if (existing.is_active === false) cohortsActivated++;
      } catch (e) {
        console.error('[srl-scheduler] Cohorts upsert exception — cohort_id:', cohort.cohort_id, 'message:', e && e.message);
        errors++;
      }
    }

    // Deactivate cohorts no longer represented by any active profile.
    // Note: the row is retained (not deleted) so historical refreshes
    // and any in-flight srl_cron_jobs remain referentially valid.
    // Section 5.2 Step F housekeeping in the worker is what eventually
    // removes shared_research rows for is_active = false cohorts.
    const deactivateIds = [];
    for (const [cohortId, row] of existingMap.entries()) {
      if (!activeMap.has(cohortId) && row.is_active === true) {
        deactivateIds.push(cohortId);
      }
    }
    if (deactivateIds.length > 0) {
      const upd = await supabase
        .from('cohorts')
        .update({ is_active: false })
        .in('cohort_id', deactivateIds);
      if (upd.error) {
        console.error('[srl-scheduler] Cohorts deactivate error — count:', deactivateIds.length, 'message:', upd.error.message);
        errors++;
      } else {
        cohortsDeactivated = deactivateIds.length;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Step B — Enqueue one srl_cron_jobs row per is_active cohort
    // ─────────────────────────────────────────────────────────────

    // Dedupe set — any cohort with an already-queued or in_progress
    // job is skipped. A slow worker tick (e.g. waiting on Serper)
    // would otherwise let the next scheduler run stack a second
    // queued row, multiplying refresh attempts unnecessarily.
    const activeJobsRes = await supabase
      .from('srl_cron_jobs')
      .select('cohort_id')
      .in('status', ['queued', 'in_progress']);
    if (activeJobsRes.error) {
      console.error('[srl-scheduler] Active jobs query error:', activeJobsRes.error.message);
      return res.status(500).json({ error: 'Failed to load active jobs' });
    }
    const activeJobCohorts = new Set((activeJobsRes.data || []).map((r) => r.cohort_id));

    for (const cohortId of activeMap.keys()) {
      if (activeJobCohorts.has(cohortId)) { skippedAlreadyActive++; continue; }
      try {
        const ins = await supabase
          .from('srl_cron_jobs')
          .insert({ cohort_id: cohortId, status: 'queued' });
        if (ins.error) {
          console.error('[srl-scheduler] Enqueue error — cohort_id:', cohortId, 'message:', ins.error.message);
          errors++;
          continue;
        }
        queued++;
        activeJobCohorts.add(cohortId);
      } catch (e) {
        console.error('[srl-scheduler] Enqueue exception — cohort_id:', cohortId, 'message:', e && e.message);
        errors++;
      }
    }

    console.log(
      '[srl-scheduler] Complete — active_cohorts:', activeMap.size,
      'cohorts_inserted:', cohortsInserted,
      'cohorts_activated:', cohortsActivated,
      'cohorts_deactivated:', cohortsDeactivated,
      'queued:', queued,
      'skipped_already_active:', skippedAlreadyActive,
      'errors:', errors
    );
    return res.status(200).json({
      success: true,
      active_cohorts: activeMap.size,
      cohorts_inserted: cohortsInserted,
      cohorts_activated: cohortsActivated,
      cohorts_deactivated: cohortsDeactivated,
      queued: queued,
      skipped_already_active: skippedAlreadyActive,
      errors: errors
    });

  } catch (err) {
    console.error('[srl-scheduler] Fatal error:', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
}
