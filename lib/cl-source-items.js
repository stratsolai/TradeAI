// lib/cl-source-items.js — shared cl_source_items helper
//
// Single source of truth for the cl_source_items contract used by every
// ingestion endpoint (email, drive, onedrive, sharepoint, dropbox, website,
// upload, photo). See StaxAI-Ingestion-Pipeline-Unification-v1_1 for the
// architecture this enforces.
//
// Two exports:
//   buildSourceUniqueKey(sourceType, parts) — pure function. Returns the
//     deterministic source_unique_key string per Section 3 of the spec.
//   ensureSourceItem(supabase, params)      — finds-or-creates the
//     cl_source_items row keyed on (user_id, source_unique_key) and
//     returns the row id. Returns null on failure (logged).
//
// Logging follows the platform format from Section 6:
//   [cl-source-items] Action — key: value key: value

import crypto from 'node:crypto';

// ----------------------------------------------------------------------
// buildSourceUniqueKey — Section 3 of the spec
// ----------------------------------------------------------------------
// sourceType is one of: 'gmail', 'outlook', 'gmail-attachment',
// 'outlook-attachment', 'google-drive', 'onedrive', 'sharepoint',
// 'dropbox', 'upload', 'photo', 'website'.
// parts is an object whose required fields depend on the source type —
// missing fields throw so callers don't end up with malformed keys like
// 'drive:undefined' silently passing the unique index.

export function buildSourceUniqueKey(sourceType, parts) {
  parts = parts || {};
  switch (sourceType) {
    case 'gmail':
      return 'gmail:' + req(parts.message_id, 'message_id');
    case 'outlook':
      return 'outlook:' + req(parts.message_id, 'message_id');
    case 'gmail-attachment':
      return 'gmail-att:' + req(parts.message_id, 'message_id')
        + ':' + req(parts.attachment_id, 'attachment_id');
    case 'outlook-attachment':
      return 'outlook-att:' + req(parts.message_id, 'message_id')
        + ':' + req(parts.attachment_id, 'attachment_id');
    case 'google-drive':
    case 'drive':
      return 'drive:' + req(parts.drive_file_id, 'drive_file_id');
    case 'onedrive':
      return 'onedrive:' + req(parts.onedrive_item_id, 'onedrive_item_id');
    case 'sharepoint':
      return 'sharepoint:' + req(parts.site_id, 'site_id')
        + ':' + req(parts.sharepoint_item_id, 'sharepoint_item_id');
    case 'dropbox':
      return 'dropbox:' + req(parts.dropbox_file_id, 'dropbox_file_id');
    case 'upload':
      return 'upload:' + req(parts.storagePath, 'storagePath');
    case 'photo':
      return 'photo:' + req(parts.storagePath, 'storagePath');
    case 'website': {
      // website:<scanTs>:<sha256(fullPageUrl)> — fullPageUrl keeps the
      // query string but drops the fragment (fragments aren't sent to
      // servers and would cause same-page collisions).
      const scanTs = req(parts.scanTs, 'scanTs');
      const url = stripFragment(req(parts.fullPageUrl, 'fullPageUrl'));
      const hash = crypto.createHash('sha256').update(url).digest('hex');
      return 'website:' + scanTs + ':' + hash;
    }
    default:
      throw new Error('buildSourceUniqueKey: unknown sourceType "' + sourceType + '"');
  }
}

function req(v, name) {
  if (v === undefined || v === null || v === '') {
    throw new Error('buildSourceUniqueKey: missing required field "' + name + '"');
  }
  return String(v);
}

function stripFragment(u) {
  const i = u.indexOf('#');
  return i === -1 ? u : u.slice(0, i);
}

// ----------------------------------------------------------------------
// ensureSourceItem — find-or-create the cl_source_items row
// ----------------------------------------------------------------------
// supabase: a Supabase client the caller has already initialised (typically
//   the service-role client used inside ingestion endpoints — auth context
//   is the caller's responsibility).
// params:
//   user_id            (required) — owner of the row
//   source_unique_key  (required) — built via buildSourceUniqueKey()
//   source_type        (recommended) — used in failure log lines
//   fields             (optional)  — extra columns to set on insert, e.g.
//                       { source_type, filename, file_url, source_url,
//                         source_detail, item_count }. Ignored when an
//                       existing row is found (we don't overwrite history).
//
// Returns the cl_source_items row id (string) on success, or null on
// failure. All failures are logged — callers should treat null as a
// non-fatal skip and surface it through whatever scan-level metric they
// already track.

export async function ensureSourceItem(supabase, params) {
  if (!supabase) {
    console.error('[cl-source-items] ensureSourceItem failed — error: supabase client missing');
    return null;
  }
  if (!params || !params.user_id || !params.source_unique_key) {
    console.error(
      '[cl-source-items] ensureSourceItem failed — sourceType:',
      params && params.source_type, 'error: user_id and source_unique_key are required'
    );
    return null;
  }

  const sourceType = params.source_type || (params.fields && params.fields.source_type) || null;
  const userId = params.user_id;
  const key = params.source_unique_key;

  try {
    // 1. Look for an existing row keyed on (user_id, source_unique_key).
    const found = await supabase
      .from('cl_source_items')
      .select('id')
      .eq('user_id', userId)
      .eq('source_unique_key', key)
      .maybeSingle();

    if (found.error) {
      console.error(
        '[cl-source-items] ensureSourceItem failed — sourceType:', sourceType,
        'phase: select error:', found.error.message
      );
      return null;
    }
    if (found.data && found.data.id) return found.data.id;

    // 2. No row yet — insert one. The partial unique index on
    //    (user_id, source_unique_key) is what makes this race-safe.
    const row = Object.assign({}, params.fields || {}, {
      user_id: userId,
      source_unique_key: key
    });

    const inserted = await supabase
      .from('cl_source_items')
      .insert(row)
      .select('id')
      .single();

    if (!inserted.error && inserted.data && inserted.data.id) {
      return inserted.data.id;
    }

    // 3. Insert lost a race against another concurrent call (unique-index
    //    violation) — re-select and use the winner's row.
    const retry = await supabase
      .from('cl_source_items')
      .select('id')
      .eq('user_id', userId)
      .eq('source_unique_key', key)
      .maybeSingle();
    if (retry.data && retry.data.id) return retry.data.id;

    console.error(
      '[cl-source-items] ensureSourceItem failed — sourceType:', sourceType,
      'phase: insert error:', inserted.error && inserted.error.message
    );
    return null;
  } catch (e) {
    console.error(
      '[cl-source-items] ensureSourceItem failed — sourceType:', sourceType,
      'error:', e && e.message ? e.message : String(e)
    );
    return null;
  }
}
