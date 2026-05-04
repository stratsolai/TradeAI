// api/cl-tool-write.js
// Centralised endpoint for browser-side Pattern B writes to the Content
// Library. Replaces the direct supabase.from('content_library').upsert(...)
// pattern that was previously duplicated across chatbot-logic.js,
// design-viz-logic.js, social-logic.js, and social-modules-2.js — each of
// which had its own hardcoded mirror of TOOL_OUTPUT_MATRIX from
// lib/cl-prompts.js.
//
// This endpoint owns those concerns once:
//   - JWT auth (user_id is taken from the verified token, never the body).
//   - Pattern B field enforcement (source: 'tool', status: 'approved' are
//     forced server-side; clients can't override them).
//   - Tool Output Matrix application (tool_tags is derived from the
//     submitted tool_source plus any caller-supplied extras, deduped).
//   - Standard upsert with onConflict: 'source_ref', ignoreDuplicates: true
//     so re-submitting the same source_ref is a no-op rather than an error.
//
// Request body (all optional unless marked):
//   tool_source       (req) — canonical tool ID (e.g. 'chatbot', 'design-viz')
//   source_ref        (req) — unique dedup key for this write
//   category          (req) — content category (writer-specific)
//   content_text            — text body or short description
//   title                   — display title
//   file_url                — link to cl-assets file (image, doc, etc.)
//   content_type            — MIME-style hint, e.g. 'image' or 'text'
//   source_detail           — arbitrary jsonb metadata
//   extra_tool_tags         — additional tool IDs to union with the matrix
//                             output (used by social writers that carry
//                             caller-supplied tags or journey-specific tags)
//   first_used_at           — optional ISO timestamp
//
// Response:
//   { success: true, tool_tags: string[], skipped?: true }
//   skipped: true means the row already existed and the upsert was a no-op.

import { createClient } from '@supabase/supabase-js';
import { applyToolOutputMatrix } from '../lib/cl-prompts.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── JWT auth ────────────────────────────────────────────────────────────
  const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Missing authorisation token' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const userRes = await supabase.auth.getUser(token);
  if (userRes.error || !userRes.data || !userRes.data.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  const userId = userRes.data.user.id;

  // ── Validate body ───────────────────────────────────────────────────────
  const body = req.body || {};
  const toolSource = typeof body.tool_source === 'string' ? body.tool_source.trim() : '';
  const sourceRef = typeof body.source_ref === 'string' ? body.source_ref.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  if (!toolSource) return res.status(400).json({ error: 'tool_source required' });
  if (!sourceRef) return res.status(400).json({ error: 'source_ref required' });
  if (!category) return res.status(400).json({ error: 'category required' });

  // ── Derive tool_tags via the matrix, union with caller extras ───────────
  const matrixTags = applyToolOutputMatrix(toolSource);
  const extraTags = Array.isArray(body.extra_tool_tags)
    ? body.extra_tool_tags.filter(function (t) { return typeof t === 'string' && t.length > 0; })
    : [];
  const toolTags = Array.from(new Set([...matrixTags, ...extraTags]));

  // ── Build row — server controls user_id, source, status; client controls
  // the rest via a strict whitelist. ──────────────────────────────────────
  const row = {
    user_id: userId,
    source: 'tool',
    status: 'approved',
    tool_source: toolSource,
    source_ref: sourceRef,
    category: category,
    tool_tags: toolTags
  };
  if (typeof body.content_text === 'string') row.content_text = body.content_text;
  if (typeof body.title === 'string') row.title = body.title;
  if (typeof body.file_url === 'string') row.file_url = body.file_url;
  if (typeof body.content_type === 'string') row.content_type = body.content_type;
  if (body.source_detail && typeof body.source_detail === 'object') row.source_detail = body.source_detail;
  if (typeof body.first_used_at === 'string') row.first_used_at = body.first_used_at;

  // ── Upsert ──────────────────────────────────────────────────────────────
  const writeRes = await supabase
    .from('content_library')
    .upsert(row, { onConflict: 'source_ref', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();

  if (writeRes.error) {
    console.error('[cl-tool-write] upsert error:', writeRes.error.message, 'tool_source:', toolSource, 'source_ref:', sourceRef);
    return res.status(500).json({ error: 'Could not write to Content Library' });
  }

  // maybeSingle() returns null when ignoreDuplicates skipped the insert.
  const skipped = !writeRes.data;
  return res.status(200).json({
    success: true,
    tool_tags: toolTags,
    skipped: skipped
  });
}
