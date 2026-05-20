// api/profile-save.js — Server-side Business Profile save endpoint
//
// SRL Cohort Architecture Addendum v1.2 — the single place that
// computes profiles.cohort_id and enqueues a one-off SRL refresh
// for brand-new cohorts. Replaces the browser-direct
// `supabase.from('profiles').update(...).eq('id', userId)` writes
// from cl-profile.js, cl-profile-location.js, and auth.js.
//
// Auth: JWT Bearer token. The authenticated user can only update
// their own profile row — there is no user_id body field; the
// target user is always the caller's auth.uid().
//
// Body: a flat object of allowed profile field names to values.
// Partial updates are accepted (matches the existing autosave
// pattern). Fields outside the allow-list are rejected with 400.
//
// cohort_id is recomputed from the post-write profile state on
// every call, even when the incoming update doesn't touch the
// cohort-determining fields. If the cohort hasn't changed in
// substance, the resulting cohort_id is identical to the prior
// value, written in the same UPDATE, and the enqueue check finds
// existing data and skips.
//
// Enqueue contract (Addendum §5.3):
//   - cohort_id null                                       → no enqueue
//   - cohort_id non-null, cohort already has shared_research
//     rows with is_current = true                          → no enqueue
//   - cohort_id non-null, cohort has no current rows BUT a
//     queued/in_progress srl_cron_jobs row already exists  → no enqueue
//   - cohort_id non-null, cohort has no current rows AND no
//     pending job                                          → enqueue

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import POSTCODE_REGIONS from '../lib/au-postcode-regions.js';
import { getSimpleRegionName, normaliseRegionSlug } from '../lib/au-region-mapping.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ---------------------------------------------------------------------------
// Allow-list — derived from the BP UI source files at module load
// ---------------------------------------------------------------------------
//
// Single source of truth for the field list lives in the BP UI files:
//   cl-profile.js          → window.BP_FIELDS_IDENTITY = [...]
//   cl-profile-location.js → window.BP_FIELDS_LOCATION = [...]
//
// This endpoint reads those files at module load time and extracts
// the arrays. Adding a field in the BP UI automatically makes the
// endpoint accept it on the next deploy. Removing or renaming a
// field in the BP UI automatically tightens the allow-list.
//
// vercel.json's `includeFiles` for this function pulls those source
// files into the function bundle so fs.readFileSync resolves on the
// deployed lambda.
//
// PROTECTED_COLUMNS lists profile columns that must NEVER be writable
// via this endpoint regardless of what the UI declares. A module-load
// assertion fails the deploy if the UI ever names one of these by
// mistake, rather than silently allowing the write.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

// Files containing window.BP_FIELDS_* declarations. Order doesn't
// matter — the resulting allow-list is the union.
const BP_FIELD_SOURCES = [
  path.join(REPO_ROOT, 'cl-profile.js'),
  path.join(REPO_ROOT, 'cl-profile-location.js')
];

// Profile columns that must remain server-controlled regardless of
// what the UI files name. The module-load assertion below fails if
// any of these slip into a BP_FIELDS_* declaration by mistake.
const PROTECTED_COLUMNS = [
  'id', 'cohort_id', 'created_at', 'updated_at',
  'is_admin',
  'is_trial', 'trial_used', 'trial_expires_at', 'activated_tools', 'bundle_tier',
  'stripe_customer_id', 'stripe_subscription_id'
];

// Extract every `window.BP_FIELDS_<NAME> = [ ... ]` array from a
// JS source file. Returns the merged array of field names; logs and
// returns [] on read failure or parser miss so a stale path / moved
// file surfaces in deployment logs rather than silently producing
// an empty allow-list.
function readBpFields(filePath) {
  let src;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error('[BPSave] Could not read BP fields source — path: ' + filePath + ', message: ' + (e && e.message));
    return [];
  }
  // The regex matches `window.BP_FIELDS_X = [` then captures everything
  // up to the next `]`. The `g` flag means we pick up every declaration
  // in the file (today there's one per file, but the parser doesn't
  // assume that).
  const re = /window\.BP_FIELDS_[A-Z_]+\s*=\s*\[([\s\S]*?)\]/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = m[1];
    // Body is a comma-separated list of quoted strings (possibly
    // multi-line, possibly with inline comments). Pull out each
    // quoted token.
    const tokenRe = /['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
    let t;
    while ((t = tokenRe.exec(body)) !== null) {
      out.push(t[1]);
    }
  }
  if (out.length === 0) {
    console.error('[BPSave] BP_FIELDS marker not found or empty — path: ' + filePath);
  }
  return out;
}

const ALLOWED_FIELDS = new Set();
for (const filePath of BP_FIELD_SOURCES) {
  for (const f of readBpFields(filePath)) ALLOWED_FIELDS.add(f);
}

// Module-load deny-list assertion. If any BP UI file declares a
// protected column, fail fast at deploy rather than silently
// allowing the write.
for (const col of PROTECTED_COLUMNS) {
  if (ALLOWED_FIELDS.has(col)) {
    throw new Error('[BPSave] Protected column appears in BP_FIELDS declarations — refusing to start: ' + col);
  }
}

console.log('[BPSave] Allow-list initialised — fields: ' + ALLOWED_FIELDS.size);

// ---------------------------------------------------------------------------
// cohort_id computation
// ---------------------------------------------------------------------------
//
// Format (Addendum §3.2 — composite text, human-readable, queryable):
//   <industries>::<state>::<region-or-no-region>
//
// Industries are normalised, deduplicated, and sorted before joining
// with '|'. State is the normalised abbreviation. Region is the
// normalised simple-region name from the (state, SA4) → simple-region
// mapping in lib/au-region-mapping.js. SA4 is an internal postcode-
// lookup intermediate only — not part of cohort identity. Region
// falls back to the literal "no-region" when the postcode does not
// resolve to an SA4 OR the (state, SA4) pair has no simple-region
// mapping.
//
// Returns null if the BP isn't complete enough to compute a cohort
// (industries is empty OR state is missing).
//
// Examples:
//   industries=["Building & Construction","Landscaping & Outdoor"],
//   state=NSW, postcode=2444 (Mid North Coast SA4 → Mid North Coast
//   simple-region) →
//     "building-and-construction|landscaping-and-outdoor::nsw::mid-north-coast"
//   industries=["Building & Construction"], state=NSW, postcode=2580
//   (Southern Highlands and Shoalhaven SA4 → South Coast simple-region) →
//     "building-and-construction::nsw::south-coast"
//   industries=["Building & Construction"], state=NSW, no postcode →
//     "building-and-construction::nsw::no-region"

function normaliseComponent(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveSa4(rawPostcode) {
  if (!rawPostcode) return null;
  const raw = String(rawPostcode).trim();
  if (!raw) return null;
  const padded = raw.length < 4 ? raw.padStart(4, '0') : raw;
  if (!/^\d{4}$/.test(padded)) return null;
  const entry = POSTCODE_REGIONS[padded];
  if (!entry || !entry.sa4) return null;
  return entry.sa4;
}

// Returns { cohort_id, industries, state, region } when the BP is
// complete enough to compute a cohort, or null otherwise.
//
// The component shape matches what api/srl-scheduler.js writes into
// the cohorts table during its Step A rebuild (Addendum §5.2):
//   - industries: sorted, deduped, normalised slug array (same
//     normalisation as the cohort_id's industries segment)
//   - state:      uppercased state abbreviation (e.g. "NSW")
//   - region:     simple-region NAME (e.g. "Mid North Coast", "South
//                 Coast") or null when the postcode doesn't resolve
//                 to an SA4 OR no simple-region mapping covers the
//                 (state, SA4) pair. The cohort_id encodes the
//                 literal 'no-region' in its region segment when
//                 region is null; the cohorts.region column holds the
//                 simple-region display NAME or NULL — keying
//                 contract is in cohort_id, display contract is in
//                 cohorts. SA4 is an internal postcode-lookup
//                 intermediate only.
//
// Used by computeCohortId (cohort_id string only) and by the cohorts
// upsert step in the handler when ensuring the FK parent for a new-
// cohort srl_cron_jobs enqueue (Addendum §5.3).
function deriveCohortParts(profile) {
  if (!profile) return null;

  let rawList = [];
  if (Array.isArray(profile.industry)) rawList = profile.industry;
  else if (typeof profile.industry === 'string' && profile.industry.trim()) rawList = [profile.industry];

  const seen = new Set();
  const industries = [];
  for (const item of rawList) {
    const norm = normaliseComponent(item);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    industries.push(norm);
  }
  if (industries.length === 0) return null;
  industries.sort();

  const statePart = normaliseComponent(profile.address_state);
  if (!statePart) return null;

  // Postcode → SA4 → simple-region. SA4 is the postcode-lookup
  // intermediate only; the cohort_id and cohorts.region column both
  // carry the simple-region. "no-region" sentinel applies both when
  // the postcode doesn't resolve to an SA4 AND when a resolved SA4
  // has no simple-region mapping for its state (defensive — the
  // mapping in lib/au-region-mapping.js is meant to be complete for
  // every SA4 in lib/au-postcode-regions.js).
  const stateUpper = String(profile.address_state).toUpperCase();
  const sa4Name = resolveSa4(profile.address_postcode);
  const simpleRegionName = sa4Name
    ? getSimpleRegionName(stateUpper, normaliseRegionSlug(sa4Name))
    : null;
  const regionSlug = simpleRegionName ? normaliseRegionSlug(simpleRegionName) : 'no-region';

  return {
    cohort_id: industries.join('|') + '::' + statePart + '::' + regionSlug,
    industries: industries,
    state: stateUpper,
    region: simpleRegionName || null
  };
}

function computeCohortId(profile) {
  const parts = deriveCohortParts(profile);
  return parts ? parts.cohort_id : null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── JWT auth ─────────────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
  const userId = user.id;

  // ── Body validation ──────────────────────────────────────────
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Request body must be an object' });
  }

  const updates = {};
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      console.error('[BPSave] Field rejected — key:', key, 'userId:', userId);
      return res.status(400).json({ error: 'Field not permitted: ' + key });
    }
    updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  // ── Read current cohort-determining fields ───────────────────
  // maybeSingle() returns data: null when the row doesn't exist
  // (no error). This endpoint can be the first writer to profiles
  // in the post-confirmation flow — the handle_new_user trigger
  // was removed, so profile row creation is now the upsert below.
  const profRes = await supabase
    .from('profiles')
    .select('industry, address_state, address_postcode, cohort_id')
    .eq('id', userId)
    .maybeSingle();
  if (profRes.error) {
    console.error('[BPSave] Profile read failed — userId:', userId, 'message:', profRes.error.message);
    return res.status(500).json({ error: 'Could not load profile' });
  }
  const prev = profRes.data || {};
  const prevCohortId = prev.cohort_id || null;

  // ── Compute cohort_id from post-write profile state ──────────
  const postWriteProfile = {
    industry:         'industry' in updates         ? updates.industry         : prev.industry,
    address_state:    'address_state' in updates    ? updates.address_state    : prev.address_state,
    address_postcode: 'address_postcode' in updates ? updates.address_postcode : prev.address_postcode
  };
  const newCohortId = computeCohortId(postWriteProfile);
  const cohortChanged = newCohortId !== prevCohortId;

  // SRL SME-Lens Scope Separation v1.1 §8.1 — persist the resolved
  // region slug to profiles.address_region. The slug is already
  // computed inside deriveCohortParts when it builds the cohort_id;
  // we just surface it here so the SME RLS policy can match on a
  // first-class field rather than parsing the composite cohort_id.
  // For users with no-region postcodes the column is null.
  const cohortParts = deriveCohortParts(postWriteProfile);
  const addressRegion = cohortParts && cohortParts.region
    ? normaliseRegionSlug(cohortParts.region)
    : null;

  // ── Upsert: fields + cohort_id + address_region ──────────────
  // cohort_id and address_region are included on every call so the
  // profile field write, the cohort_id write, and the region-slug
  // write happen as one statement. When nothing changed in substance,
  // the per-column write is a no-op. id is included so the row is
  // created when this endpoint is the first writer in the post-
  // confirmation flow (handle_new_user trigger has been removed —
  // see comment in pre-read above).
  const upsertRow = Object.assign({ id: userId }, updates, {
    cohort_id: newCohortId,
    address_region: addressRegion
  });
  const upd = await supabase
    .from('profiles')
    .upsert(upsertRow, { onConflict: 'id' });
  if (upd.error) {
    console.error('[BPSave] Profile upsert failed — userId:', userId, 'message:', upd.error.message);
    return res.status(500).json({ error: upd.error.message });
  }

  if (cohortChanged) {
    console.log('[BPSave] cohort_id updated — userId: ' + userId + ', cohort_id: ' + newCohortId + ', previous: ' + (prevCohortId || '(none)'));
  }

  // ── Ensure cohorts row exists, then enqueue check ─────────────
  // srl_cron_jobs has an FK to cohorts(cohort_id), so the parent
  // row must be in place before any enqueue. The daily scheduler
  // does this as Step A of its run (Addendum §5.2); this endpoint
  // is the second writer to the cohorts table — it covers the
  // brand-new-cohort lifecycle in Addendum §5.3 where a user's BP
  // save creates a cohort the scheduler has not yet seen.
  //
  // Cohorts row policy:
  //   - missing or is_active = false → upsert with is_active = true.
  //     Re-activation is immediate so worker housekeeping (which
  //     deletes shared_research rows for is_active = false cohorts)
  //     does not race against the new member.
  //   - already exists with is_active = true → no write. An ordinary
  //     BP save (non-cohort-changing edit, or save into a cohort
  //     someone else is already in) doesn't touch the table.
  //
  // Enqueue policy (unchanged from Pass B):
  //   - cohort_id null                                    → no enqueue
  //   - cohort already has shared_research is_current     → no enqueue
  //   - queued/in_progress srl_cron_jobs row exists       → no enqueue
  //   - otherwise                                         → enqueue
  // The enqueue is gated on cohortRowReady so the FK is guaranteed
  // satisfiable. All failure paths log and continue — the daily
  // scheduler eventually picks up the cohort even without the
  // one-off enqueue.
  let enqueued = false;
  let cronJobId = null;
  let cohortRowReady = false;

  if (newCohortId) {
    const existingCohortRes = await supabase
      .from('cohorts')
      .select('is_active')
      .eq('cohort_id', newCohortId)
      .maybeSingle();

    if (existingCohortRes.error) {
      console.error('[BPSave] cohorts read failed — cohort_id: ' + newCohortId + ', message: ' + existingCohortRes.error.message);
    } else if (existingCohortRes.data && existingCohortRes.data.is_active === true) {
      cohortRowReady = true;
    } else {
      const parts = deriveCohortParts(postWriteProfile);
      if (parts) {
        const cohortUpsert = await supabase
          .from('cohorts')
          .upsert({
            cohort_id: newCohortId,
            industries: parts.industries,
            state: parts.state,
            region: parts.region,
            is_active: true
          }, { onConflict: 'cohort_id' });
        if (cohortUpsert.error) {
          console.error('[BPSave] cohorts upsert failed — cohort_id: ' + newCohortId + ', message: ' + cohortUpsert.error.message);
        } else {
          cohortRowReady = true;
          console.log('[BPSave] cohorts row ensured — cohort_id: ' + newCohortId + (existingCohortRes.data ? ' (reactivated)' : ' (new)'));
        }
      }
    }

    if (cohortRowReady) {
      const existingRes = await supabase
        .from('shared_research')
        .select('id')
        .eq('scope_type', 'cohort')
        .eq('cohort_id', newCohortId)
        .eq('is_current', true)
        .limit(1);

      if (existingRes.error) {
        console.error('[BPSave] shared_research existence check failed — cohort_id: ' + newCohortId + ', message: ' + existingRes.error.message);
      } else if (!existingRes.data || existingRes.data.length === 0) {
        const pendingRes = await supabase
          .from('srl_cron_jobs')
          .select('id')
          .eq('scope_type', 'cohort')
          .eq('cohort_id', newCohortId)
          .in('status', ['queued', 'in_progress'])
          .limit(1);

        if (pendingRes.error) {
          console.error('[BPSave] srl_cron_jobs pending check failed — cohort_id: ' + newCohortId + ', message: ' + pendingRes.error.message);
        } else if (!pendingRes.data || pendingRes.data.length === 0) {
          const ins = await supabase
            .from('srl_cron_jobs')
            .insert({
              cohort_id: newCohortId,
              scope_type: 'cohort',
              scope_key: null,
              priority: 2,
              enqueued_by: 'bp_save',
              status: 'queued'
            })
            .select('id')
            .single();
          if (ins.error) {
            console.error('[BPSave] srl_cron_jobs insert failed — cohort_id: ' + newCohortId + ', message: ' + ins.error.message);
          } else {
            enqueued = true;
            cronJobId = ins.data && ins.data.id;
            console.log('[BPSave] srl_cron_jobs enqueued — cohort_id: ' + newCohortId + ', job_id: ' + cronJobId);
          }
        }
      }
    }
  }

  // SRL SME-Lens Scope Separation v1.1 §8.2 — immediate SME refresh
  // for any state/region scope that has no current SME rows. Fires
  // once per new scope, not once per user — once a scope is populated
  // (by the daily cron or by an earlier BP save), no further immediate
  // fire happens. National scope is daily-cron-only and not checked
  // here. Failures are logged and do not break the save (the daily
  // scheduler will pick up the scope on its next run).
  const smeFires = [];
  if (cohortParts && cohortParts.state) {
    const stateScopeKey = cohortParts.state.toLowerCase();
    await maybeEnqueueSmeImmediate(supabase, 'state', stateScopeKey, smeFires);
    if (cohortParts.region) {
      const regionSlug = normaliseRegionSlug(cohortParts.region);
      const regionScopeKey = stateScopeKey + '::' + regionSlug;
      await maybeEnqueueSmeImmediate(supabase, 'region', regionScopeKey, smeFires);
    }
  }

  return res.status(200).json({
    success: true,
    cohort_id: newCohortId,
    cohort_changed: cohortChanged,
    enqueued: enqueued,
    srl_cron_job_id: cronJobId,
    sme_fires: smeFires
  });
}

// SRL SME-Lens Scope Separation v1.1 §8.2 — enqueue an immediate SME
// refresh for the (scope_type, scope_key) tuple, but only if there
// are no current rows for that scope AND no pending job for it. Same
// "no current rows AND no pending job" gate the cohort path uses
// above. Failures are logged and pushed into the response shape so
// the caller can see what happened.
async function maybeEnqueueSmeImmediate(supabase, scopeType, scopeKey, smeFires) {
  try {
    const existingRes = await supabase
      .from('shared_research')
      .select('id')
      .eq('scope_type', scopeType)
      .eq('scope_key', scopeKey)
      .eq('is_current', true)
      .limit(1);
    if (existingRes.error) {
      console.error('[BPSave] SME existence check failed —', scopeType, scopeKey, 'message:', existingRes.error.message);
      smeFires.push({ scope_type: scopeType, scope_key: scopeKey, action: 'error', message: 'existence check failed' });
      return;
    }
    if (existingRes.data && existingRes.data.length > 0) {
      smeFires.push({ scope_type: scopeType, scope_key: scopeKey, action: 'skip_has_current' });
      return;
    }
    const pendingRes = await supabase
      .from('srl_cron_jobs')
      .select('id')
      .eq('scope_type', scopeType)
      .eq('scope_key', scopeKey)
      .in('status', ['queued', 'in_progress'])
      .limit(1);
    if (pendingRes.error) {
      console.error('[BPSave] SME pending check failed —', scopeType, scopeKey, 'message:', pendingRes.error.message);
      smeFires.push({ scope_type: scopeType, scope_key: scopeKey, action: 'error', message: 'pending check failed' });
      return;
    }
    if (pendingRes.data && pendingRes.data.length > 0) {
      smeFires.push({ scope_type: scopeType, scope_key: scopeKey, action: 'skip_has_pending' });
      return;
    }
    const ins = await supabase
      .from('srl_cron_jobs')
      .insert({
        cohort_id: null,
        scope_type: scopeType,
        scope_key: scopeKey,
        priority: 1,
        enqueued_by: 'bp_save',
        status: 'queued'
      })
      .select('id')
      .single();
    if (ins.error) {
      console.error('[BPSave] SME enqueue failed —', scopeType, scopeKey, 'message:', ins.error.message);
      smeFires.push({ scope_type: scopeType, scope_key: scopeKey, action: 'error', message: ins.error.message });
      return;
    }
    smeFires.push({ scope_type: scopeType, scope_key: scopeKey, action: 'enqueued', job_id: ins.data && ins.data.id });
    console.log('[BPSave] SME enqueued —', scopeType, scopeKey, 'job_id:', ins.data && ins.data.id);
  } catch (e) {
    console.error('[BPSave] SME enqueue exception —', scopeType, scopeKey, 'message:', e && e.message);
    smeFires.push({ scope_type: scopeType, scope_key: scopeKey, action: 'error', message: e && e.message });
  }
}
