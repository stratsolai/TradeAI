// lib/shared-research-writes.js — Phase 4: live writes, is_current flip,
// refresh tracking, shared_research audit logging.
//
// One of four sub-modules the Shared Research Layer is split across:
//   - shared-research-plan.js     — matrix, region, plan build
//   - shared-research-cache.js    — cache layer, Serper executor, dedupe
//   - shared-research-curation.js — Haiku curation + validation
//   - shared-research-writes.js   — this file (Phase 4 storage layer)
// All four are re-exported from lib/shared-research.js so callers
// (currently just api/shared-research-refresh.js) keep working
// unchanged.
//
// Implements:
//   - Section 11.1 — shared_research bulk insert
//   - Section 11.3 — shared_research_refreshes write, plus the
//     owner-added outcome column
//   - Section 12 process step 7 — is_current flip (with rollback
//     anchor so the flip is reversible if the new-row insert fails)
//   - Phase 4 extension to shared_research_cache_access — new
//     access_type 'shared_research_write' so the full lifecycle of a
//     refresh can be traced by refresh_id, end-to-end

// ---------------------------------------------------------------------------
// is_current flip — Section 12 process step 7
// ---------------------------------------------------------------------------
//
// Phase 4 brief leaves the atomicity pattern open. Code's chosen
// approach: flip-first with a snapshot-based rollback anchor.
//
//   1. snapshotCurrentRowIds — collect the ids of every row currently
//      is_current=true for this user. This is the rollback anchor.
//   2. flipIsCurrentFalse — set is_current=false on every row for
//      this user.
//   3. Caller inserts the new rows with is_current=true.
//   4. If the insert fails, caller calls restoreIsCurrent with the
//      snapshot ids to put the previous batch back as is_current=true
//      and the refresh outcome is recorded as 'error'.
//
// Reasoning:
//   - Flip-first means downstream consumers reading by
//     (user_id, is_current=true) never see BOTH the old and new
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

export async function snapshotCurrentRowIds(supabase, userId) {
  try {
    const res = await supabase
      .from('shared_research')
      .select('id')
      .eq('user_id', userId)
      .eq('is_current', true);
    if (res.error) {
      console.error('[SharedResearch] is_current snapshot error —', 'message:', res.error.message);
      return { ok: false, ids: [], error: res.error.message };
    }
    return { ok: true, ids: (res.data || []).map((r) => r.id), error: null };
  } catch (e) {
    console.error('[SharedResearch] is_current snapshot exception —', 'message:', e && e.message);
    return { ok: false, ids: [], error: e && e.message };
  }
}

export async function flipIsCurrentFalse(supabase, userId) {
  try {
    const res = await supabase
      .from('shared_research')
      .update({ is_current: false })
      .eq('user_id', userId)
      .eq('is_current', true);
    if (res.error) {
      console.error('[SharedResearch] is_current flip error —', 'message:', res.error.message);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    console.error('[SharedResearch] is_current flip exception —', 'message:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

export async function restoreIsCurrent(supabase, userId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, error: null };
  try {
    const res = await supabase
      .from('shared_research')
      .update({ is_current: true })
      .eq('user_id', userId)
      .in('id', ids);
    if (res.error) {
      console.error('[SharedResearch] is_current rollback error —', 'count:', ids.length, 'message:', res.error.message);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    console.error('[SharedResearch] is_current rollback exception —', 'count:', ids.length, 'message:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

// ---------------------------------------------------------------------------
// shared_research row shape — Section 11.1
// ---------------------------------------------------------------------------
//
// Builds the row payload for one curated item. Columns match Section
// 11.1 exactly. The curation layer also carries normalised_url and
// the source_queries / source_categories / source_industries
// attribution arrays on each item; those are useful for dry-run
// inspection only and are NOT persisted here, because the spec
// schema doesn't include them.
//
// id and created_at are intentionally omitted so Postgres applies the
// table defaults (uuid_generate_v4 / now()). is_current is forced to
// true — every row written in this refresh belongs to the new current
// batch by construction.

export function buildSharedResearchRow(userId, refreshId, curatedItem) {
  return {
    user_id: userId,
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
    is_current: true
  };
}

// ---------------------------------------------------------------------------
// shared_research bulk insert + rollback delete
// ---------------------------------------------------------------------------
//
// One round-trip for the whole batch — the curated set is capped at
// 50 rows (5 categories × ITEMS_PER_CATEGORY_CAP of 10) so a single
// insert call comfortably fits within Postgres / Supabase limits.
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
// shared_research_refreshes write — Section 11.3 + owner-added outcome
// ---------------------------------------------------------------------------
//
// Always written if at all possible — the audit trail must not have
// invisible failures, even when curation, validation, or the shared_research
// insert have already gone wrong. The caller passes the outcome explicitly
// per the Phase 4 rules:
//
//   'success'           — curation produced items, writes succeeded,
//                         is_current flip done
//   'validation_failed' — Section 9.5 whole-batch failure: every Haiku
//                         item failed validation. No writes, no flip.
//                         curated_items=0, rejected_items=<count>.
//   'no_results'        — Serper returned zero usable items across all
//                         queries. No curation ran. No writes, no flip.
//   'error'             — anything else (Serper outage, Haiku outage,
//                         Supabase write error, unexpected exception)
//
// Failures here are logged but never break the response — by the time
// we get to this insert the data path has either run or rolled back,
// and surfacing an audit-write failure as the user-facing error would
// obscure what actually happened.

export async function writeRefreshRow(supabase, row) {
  try {
    const res = await supabase
      .from('shared_research_refreshes')
      .insert(row);
    if (res.error) {
      console.error('[SharedResearch] Refresh row write failed —', 'outcome:', row && row.outcome, 'message:', res.error.message);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    console.error('[SharedResearch] Refresh row exception —', 'outcome:', row && row.outcome, 'message:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

// ---------------------------------------------------------------------------
// shared_research write audit — extends Phase 3 cache_access logging
// ---------------------------------------------------------------------------
//
// Phase 3 logs cache reads/writes against shared_research_cache via
// the shared_research_cache_access table with access_type values
// 'read_hit' / 'read_miss' / 'write'. Phase 4 adds writes against
// shared_research itself; they share the same audit table so the
// full lifecycle of a refresh can be traced via the single refresh_id
// correlation, end-to-end.
//
// access_type vocabulary extended with one new value:
//   - 'shared_research_write' : the refresh's curated items were
//                               written to shared_research
//
// One audit row per refresh, not per item. The row count is already
// captured in the shared_research_refreshes row (curated_items
// column), so per-item audit events would duplicate that signal
// without adding traceability.
//
// cache_key on this row is set to a refresh-scoped sentinel
// ('shared_research:<refreshId>') because the cache_key column is
// part of the existing schema and the existing Phase 3 helper treats
// it as required. The sentinel makes the row clearly distinguishable
// from real cache rows and self-correlates back to the refresh.

export function recordSharedResearchWriteEvent(events, { userId, refreshId }) {
  if (!events || !userId || !refreshId) return;
  events.push({
    cache_key: 'shared_research:' + refreshId,
    user_id: userId,
    refresh_id: refreshId,
    access_type: 'shared_research_write'
  });
}
