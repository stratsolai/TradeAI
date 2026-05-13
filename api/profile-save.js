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

import { createClient } from '@supabase/supabase-js';
import POSTCODE_REGIONS from '../lib/au-postcode-regions.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Allowed profile fields. Curated against the fields written by
// cl-profile.js, cl-profile-location.js, and auth.js — the three
// files in Pass B's switchover scope. Other profile writers
// (cl-profile-products.js, cl-profile-marketing.js) continue to
// write profiles directly; their fields are intentionally absent
// from this allow-list and would be rejected if a future caller
// tried to route them through here.
const ALLOWED_FIELDS = new Set([
  // Identity panel + signup
  'business_name', 'trading_name', 'phone', 'abn',
  'business_structure', 'industry', 'years_in_business',
  'employee_range', 'logo_url', 'marketing_theme_extra',
  // Location panel
  'address_name', 'address_unit', 'address_street', 'address_suburb',
  'address_state', 'address_postcode',
  'additional_phones', 'additional_locations',
  'website_urls', 'service_area', 'trading_hours'
]);

// ---------------------------------------------------------------------------
// cohort_id computation
// ---------------------------------------------------------------------------
//
// Format (Addendum §3.2 — composite text, human-readable, queryable):
//   <industries>::<state>::<region-or-no-region>
//
// Industries are normalised, deduplicated, and sorted before joining
// with '|'. State is the normalised abbreviation. Region is the
// normalised SA4 name from postcode lookup, or the literal "no-region"
// when the postcode does not resolve.
//
// Returns null if the BP isn't complete enough to compute a cohort
// (industries is empty OR state is missing).
//
// Examples:
//   industries=["Building & Construction","Landscaping & Outdoor"],
//   state=NSW, postcode=2444 (Mid North Coast SA4) →
//     "building-and-construction|landscaping-and-outdoor::nsw::mid-north-coast"
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

function computeCohortId(profile) {
  if (!profile) return null;

  let rawList = [];
  if (Array.isArray(profile.industry)) rawList = profile.industry;
  else if (typeof profile.industry === 'string' && profile.industry.trim()) rawList = [profile.industry];

  const seen = new Set();
  const normalised = [];
  for (const item of rawList) {
    const norm = normaliseComponent(item);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    normalised.push(norm);
  }
  if (normalised.length === 0) return null;
  normalised.sort();

  const statePart = normaliseComponent(profile.address_state);
  if (!statePart) return null;

  const sa4 = resolveSa4(profile.address_postcode);
  const regionPart = sa4 ? normaliseComponent(sa4) : 'no-region';

  return normalised.join('|') + '::' + statePart + '::' + regionPart;
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
  const profRes = await supabase
    .from('profiles')
    .select('industry, address_state, address_postcode, cohort_id')
    .eq('id', userId)
    .single();
  if (profRes.error || !profRes.data) {
    console.error('[BPSave] Profile read failed — userId:', userId, 'message:', profRes.error && profRes.error.message);
    return res.status(500).json({ error: 'Could not load profile' });
  }
  const prev = profRes.data;
  const prevCohortId = prev.cohort_id || null;

  // ── Compute cohort_id from post-write profile state ──────────
  const postWriteProfile = {
    industry:         'industry' in updates         ? updates.industry         : prev.industry,
    address_state:    'address_state' in updates    ? updates.address_state    : prev.address_state,
    address_postcode: 'address_postcode' in updates ? updates.address_postcode : prev.address_postcode
  };
  const newCohortId = computeCohortId(postWriteProfile);
  const cohortChanged = newCohortId !== prevCohortId;

  // ── Single UPDATE: fields + cohort_id ────────────────────────
  // cohort_id is included on every call so the profile field write
  // and the cohort_id write happen as one statement. When the
  // cohort hasn't changed in substance, newCohortId === prevCohortId
  // and the write is a no-op on that column.
  const updateRow = Object.assign({}, updates, { cohort_id: newCohortId });
  const upd = await supabase
    .from('profiles')
    .update(updateRow)
    .eq('id', userId);
  if (upd.error) {
    console.error('[BPSave] Profile update failed — userId:', userId, 'message:', upd.error.message);
    return res.status(500).json({ error: upd.error.message });
  }

  if (cohortChanged) {
    console.log('[BPSave] cohort_id updated — userId: ' + userId + ', cohort_id: ' + newCohortId + ', previous: ' + (prevCohortId || '(none)'));
  }

  // ── Enqueue check ────────────────────────────────────────────
  // Skip entirely if cohort_id is null (BP not complete enough).
  // Otherwise: cohort already populated → no enqueue. Cohort empty
  // but a job is already pending → no enqueue (the pending job
  // will populate). Cohort empty and no pending job → enqueue.
  // Failures in either check log but do NOT fail the save — the
  // daily SRL cron eventually picks up the cohort even without
  // a one-off enqueue.
  let enqueued = false;
  let cronJobId = null;

  if (newCohortId) {
    const existingRes = await supabase
      .from('shared_research')
      .select('id')
      .eq('cohort_id', newCohortId)
      .eq('is_current', true)
      .limit(1);

    if (existingRes.error) {
      console.error('[BPSave] shared_research existence check failed — cohort_id: ' + newCohortId + ', message: ' + existingRes.error.message);
    } else if (!existingRes.data || existingRes.data.length === 0) {
      const pendingRes = await supabase
        .from('srl_cron_jobs')
        .select('id')
        .eq('cohort_id', newCohortId)
        .in('status', ['queued', 'in_progress'])
        .limit(1);

      if (pendingRes.error) {
        console.error('[BPSave] srl_cron_jobs pending check failed — cohort_id: ' + newCohortId + ', message: ' + pendingRes.error.message);
      } else if (!pendingRes.data || pendingRes.data.length === 0) {
        const ins = await supabase
          .from('srl_cron_jobs')
          .insert({ cohort_id: newCohortId, status: 'queued' })
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

  return res.status(200).json({
    success: true,
    cohort_id: newCohortId,
    cohort_changed: cohortChanged,
    enqueued: enqueued,
    srl_cron_job_id: cronJobId
  });
}
