// lib/shared-research-writes.js — live writes, is_current flip,
// refresh tracking, shared_research audit logging.
//
// One of four sub-modules the Shared Research Layer is split across:
//   - shared-research-plan.js     — matrix, region, plan build
//   - shared-research-cache.js    — cache layer, Serper executor, dedupe
//   - shared-research-curation.js — Sonnet curation + validation
//   - shared-research-writes.js   — this file (storage layer)
// All four are re-exported from lib/shared-research.js so callers
// (currently just api/shared-research-refresh.js) keep working
// unchanged.
//
// Implements:
//   - Addendum §4.1 — shared_research bulk insert (cohort-scoped)
//   - Addendum §4.2 — shared_research_refreshes write with the
//     outcome and audit_warnings columns; cohort_id replaces user_id;
//     triggered_by_tool CHECK constraint narrowed to 'cron'
//   - is_current flip with snapshot-based rollback so the flip is
//     reversible if the new-row insert fails
//   - shared_research_cache_access extension for audit_type
//     'shared_research_write' so the full lifecycle of a refresh can
//     be traced by refresh_id
//
// SRL Cohort Architecture Addendum v1.2 scope: every read and write
// in this file is filtered by cohort_id, not user_id. The
// shared_research_cache_access audit table retains user_id (it
// tracks who triggered the refresh) — cron-triggered refreshes have
// no user, and recordSharedResearchWriteEvent + recordCacheAccessEvent
// both short-circuit when userId is missing, so cron paths produce
// zero rows in that audit table. The shared_research_refreshes row
// (carrying cohort_id and outcome) is the cron-path audit anchor.

// ---------------------------------------------------------------------------
// is_current flip
// ---------------------------------------------------------------------------
//
// Code's chosen approach: flip-first with a snapshot-based rollback
// anchor.
//
//   1. snapshotCurrentRowIds — collect the ids of every row currently
//      is_current=true for this cohort. This is the rollback anchor.
//   2. flipIsCurrentFalse — set is_current=false on every row for
//      this cohort.
//   3. Caller inserts the new rows with is_current=true.
//   4. If the insert fails, caller calls restoreIsCurrent with the
//      snapshot ids to put the previous batch back as is_current=true
//      and the refresh outcome is recorded as 'error'.
//
// Reasoning:
//   - Flip-first means downstream consumers reading by
//     (cohort_id, is_current=true) never see BOTH the old and new
//     batches at once. The worst transient state during the insert
//     window is "no current rows" — wrong but transient and recoverable.
//   - Insert-first would briefly show two current batches, which is
//     materially worse for consumers and harder to detect.
//   - Supabase's JS client doesn't expose multi-statement transactions
//     over the REST surface; the snapshot + explicit rollback path is
//     the cleanest equivalent without introducing an RPC.
//
// All three helpers swallow their errors into a structured
// { ok, error } return so the caller can branch on outcome without
// being forced to try/catch. Failures are logged in the platform
// '[Scope] Action — key: value' format.

export async function snapshotCurrentRowIds(supabase, cohortId) {
  try {
    const res = await supabase
      .from('shared_research')
      .select('id')
      .eq('cohort_id', cohortId)
      .eq('is_current', true);
    if (res.error) {
      console.error('[SharedResearch] is_current snapshot error —', 'cohort_id:', cohortId, 'message:', res.error.message);
      return { ok: false, ids: [], error: res.error.message };
    }
    return { ok: true, ids: (res.data || []).map((r) => r.id), error: null };
  } catch (e) {
    console.error('[SharedResearch] is_current snapshot exception —', 'cohort_id:', cohortId, 'message:', e && e.message);
    return { ok: false, ids: [], error: e && e.message };
  }
}

export async function flipIsCurrentFalse(supabase, cohortId) {
  try {
    const res = await supabase
      .from('shared_research')
      .update({ is_current: false })
      .eq('cohort_id', cohortId)
      .eq('is_current', true);
    if (res.error) {
      console.error('[SharedResearch] is_current flip error —', 'cohort_id:', cohortId, 'message:', res.error.message);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    console.error('[SharedResearch] is_current flip exception —', 'cohort_id:', cohortId, 'message:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

export async function restoreIsCurrent(supabase, cohortId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, error: null };
  try {
    const res = await supabase
      .from('shared_research')
      .update({ is_current: true })
      .eq('cohort_id', cohortId)
      .in('id', ids);
    if (res.error) {
      console.error('[SharedResearch] is_current rollback error —', 'cohort_id:', cohortId, 'count:', ids.length, 'message:', res.error.message);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    console.error('[SharedResearch] is_current rollback exception —', 'cohort_id:', cohortId, 'count:', ids.length, 'message:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

// ---------------------------------------------------------------------------
// shared_research row shape — Addendum §4.1
// ---------------------------------------------------------------------------
//
// Builds the row payload for one curated item. Columns match Addendum
// §4.1 exactly. The curation layer also carries normalised_url and
// the source_queries / source_categories / source_industries
// attribution arrays on each item; those are useful for dry-run
// inspection only and are NOT persisted here, because the schema
// doesn't include them.
//
// id and created_at are intentionally omitted so Postgres applies the
// table defaults (gen_random_uuid / now()). is_current is forced to
// true — every row written in this refresh belongs to the new current
// batch by construction.

export function buildSharedResearchRow(cohortId, refreshId, curatedItem) {
  // Listings Addendum §3 + §4 — item_type is set explicitly on every
  // row. The column has a NOT NULL DEFAULT 'content' at the DB level,
  // but the distinction must be intentional and auditable rather than
  // inherited from a default. The curation validator
  // (REQUIRED_CURATED_FIELDS + VALID_ITEM_TYPE_SET) guarantees
  // curatedItem.item_type is set to 'content' or 'listing' by the time
  // we get here; the || 'content' fallback is belt-and-braces for any
  // direct caller that somehow bypasses validation.
  return {
    cohort_id: cohortId,
    refresh_id: refreshId,
    category: curatedItem.category,
    lens: Array.isArray(curatedItem.lens) ? curatedItem.lens : [curatedItem.lens],
    title: curatedItem.title,
    summary: curatedItem.summary,
    url: curatedItem.url,
    source_name: curatedItem.source_name,
    source_domain: curatedItem.source_domain || null,
    source_type: curatedItem.source_type || 'secondary',
    published_date: curatedItem.published_date || null,
    item_type: curatedItem.item_type || 'content',
    is_current: true
  };
}

// ---------------------------------------------------------------------------
// shared_research bulk insert + rollback delete
// ---------------------------------------------------------------------------
//
// One round-trip for the whole batch — the curated set is capped per
// category by ITEMS_PER_CATEGORY_CAP so a single insert call comfortably
// fits within Postgres / Supabase limits even for 5-category × N-row
// outputs.
//
// deleteRowsByRefreshId is the rollback path used by the caller if
// the is_current flip succeeded but the insert failed. The new
// refresh_id is unique per refresh, so deleting by refresh_id can
// only remove rows from this refresh — never from earlier batches.

export async function insertSharedResearchRows(supabase, rows) {
  if (!rows || rows.length === 0) return { ok: true, count: 0, error: null };
  try {
    const res = await supabase
      .from('shared_research')
      .insert(rows);
    if (res.error) {
      console.error('[SharedResearch] shared_research insert error —', 'count:', rows.length, 'message:', res.error.message);
      return { ok: false, count: 0, error: res.error.message };
    }
    return { ok: true, count: rows.length, error: null };
  } catch (e) {
    console.error('[SharedResearch] shared_research insert exception —', 'count:', rows.length, 'message:', e && e.message);
    return { ok: false, count: 0, error: e && e.message };
  }
}

export async function deleteRowsByRefreshId(supabase, refreshId) {
  try {
    const res = await supabase
      .from('shared_research')
      .delete()
      .eq('refresh_id', refreshId);
    if (res.error) {
      console.error('[SharedResearch] shared_research rollback delete error —', 'refresh_id:', refreshId, 'message:', res.error.message);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    console.error('[SharedResearch] shared_research rollback delete exception —', 'refresh_id:', refreshId, 'message:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

// ---------------------------------------------------------------------------
// shared_research_refreshes write — Addendum §4.2
// ---------------------------------------------------------------------------
//
// Always written if at all possible — the audit trail must not have
// invisible failures, even when curation, validation, or the
// shared_research insert have already gone wrong. The caller passes
// the outcome explicitly:
//
//   'success'           — curation produced items, writes succeeded,
//                         is_current flip done
//   'validation_failed' — Section 9.5 whole-batch failure: every
//                         curated item failed validation. No writes,
//                         no flip. curated_items=0, rejected_items=<count>.
//   'no_results'        — Serper returned zero usable items across all
//                         queries. No curation ran. No writes, no flip.
//   'error'             — anything else (Serper outage, model outage,
//                         Supabase write error, unexpected exception)
//
// Failures here are logged but never break the response — by the time
// we get to this insert the data path has either run or rolled back,
// and surfacing an audit-write failure as the user-facing error would
// obscure what actually happened.
//
// Addendum §4.2 narrows triggered_by_tool to the literal 'cron' via a
// CHECK constraint. The caller passes 'cron' on both the cron path
// and the admin-diagnostic path so the refresh row is always
// constraint-compatible.

export async function writeRefreshRow(supabase, row) {
  try {
    const res = await supabase
      .from('shared_research_refreshes')
      .insert(row);
    if (res.error) {
      console.error('[SharedResearch] Refresh row write failed —', 'cohort_id:', row && row.cohort_id, 'outcome:', row && row.outcome, 'message:', res.error.message);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    console.error('[SharedResearch] Refresh row exception —', 'cohort_id:', row && row.cohort_id, 'outcome:', row && row.outcome, 'message:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

// ---------------------------------------------------------------------------
// shared_research write audit
// ---------------------------------------------------------------------------
//
// shared_research_cache_access has four access_type values:
//   'read_hit'              — cache read returned a row
//   'read_miss'             — cache read returned nothing
//   'write'                 — cache row written after fetch
//   'shared_research_write' — curated batch written to shared_research
//                             after a successful refresh
//
// One audit row per refresh, not per item. The written-row count is
// already captured in shared_research_refreshes.stats.curated_items
// (jsonb), so per-item audit events would duplicate that signal
// without adding traceability.
//
// cache_key on this row holds the refresh_id itself — the natural
// identifier for the audit event. Real cache events use a 64-char
// SHA-256 hex digest from buildCacheKey(); UUIDs are 36 chars with
// hyphens, so the two key shapes don't collide if any consumer
// reads cache_key without filtering on access_type first.
//
// userId is required by the cache_access schema (NOT NULL). Cron
// refreshes have no user; the helper short-circuits when userId is
// missing, so cron-triggered runs produce no row here. The
// shared_research_refreshes row (cohort_id + outcome) is the
// cron-path audit anchor.

export function recordSharedResearchWriteEvent(events, { userId, refreshId }) {
  if (!events || !userId || !refreshId) return;
  events.push({
    cache_key: refreshId,
    user_id: userId,
    refresh_id: refreshId,
    access_type: 'shared_research_write'
  });
}
