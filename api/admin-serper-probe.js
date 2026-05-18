// api/admin-serper-probe.js — admin-only ad-hoc Serper probe.
//
// Fires a single arbitrary Serper query and returns the raw
// normalised result set. Built for Task 47 template review and
// future query calibration work where the question is "what does
// Serper actually return for query X" without the overhead of the
// full SRL pipeline (cohort_id, 15+ query plan, curation, dedup,
// enrichment).
//
// Bypasses the shared_research_cache layer entirely — calls
// runSerperQuery directly. The whole point of this endpoint is
// fresh-fetch A/B/C comparison; cache hits would defeat that. Each
// invocation costs one Serper credit.
//
// Cost attribution: logs to api_usage with tool_id =
// 'shared-research-adhoc' so admin calibration burn is visible but
// kept separate from 'shared-research' (the cron-driven SRL spend).
// user_id is the admin user who fired the probe.

import { createClient } from '@supabase/supabase-js';
import { runSerperQuery } from '../lib/shared-research-cache.js';
import { logSerperUsage } from '../lib/usage-logger.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SERPER_API_KEY = process.env.SERPER_API_KEY;

// Mirrors the buildQueryPlan vocabulary so callers can pass the
// same recency keywords used in the SRL templates rather than the
// raw Serper tbs codes.
const RECENCY_MAP = {
  d:    'qdr:d',
  w:    'qdr:w',
  m:    'qdr:m',
  m3:   'qdr:m3',
  y:    'qdr:y'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    if (!SERPER_API_KEY) {
      console.error('[admin-serper-probe] SERPER_API_KEY not configured');
      return res.status(500).json({ error: 'Server misconfigured: SERPER_API_KEY not set' });
    }

    const body = req.body || {};
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return res.status(400).json({ error: 'Missing required field: query (string)' });
    }

    // queryType: 'news' (default, Serper /news endpoint) or 'search'
    // (Serper /search organic). Matches the runSerperQuery contract.
    const queryType = body.queryType === 'search' ? 'search' : 'news';

    // location: optional. Defaults to 'Australia' to match the
    // runSerperQuery default and the buildQueryPlan national-lens
    // default. Pass 'New South Wales' / 'Southern Highlands and
    // Shoalhaven NSW' etc. to bias ranking to a state or SA4.
    const location = typeof body.location === 'string' && body.location.trim()
      ? body.location.trim()
      : 'Australia';

    // recency: optional short code mapped to Serper tbs. Omit for no
    // recency filter (full-history search). Raw tbs strings are also
    // accepted as-is for callers that already know the syntax.
    let tbs = null;
    if (typeof body.recency === 'string' && body.recency.trim()) {
      const raw = body.recency.trim();
      if (RECENCY_MAP[raw]) {
        tbs = RECENCY_MAP[raw];
      } else if (raw.startsWith('qdr:')) {
        tbs = raw;
      } else {
        return res.status(400).json({
          error: 'Unknown recency code: ' + raw + '. Use d|w|m|m3|y or a raw qdr:* string.'
        });
      }
    }

    const tStart = Date.now();
    const result = await runSerperQuery({
      query,
      queryType,
      tbs,
      apiKey: SERPER_API_KEY,
      location
    });
    const elapsedMs = Date.now() - tStart;

    // Cost attribution — fire-and-forget, doesn't block the response.
    // Logs even on non-OK Serper responses (a 429 still consumed a
    // request slot, and we want the admin probe burn visible
    // regardless of outcome).
    try {
      await logSerperUsage({ tool_id: 'shared-research-adhoc', user_id: auth.user.id });
    } catch (e) {
      console.error('[admin-serper-probe] usage log failed —', 'message:', e && e.message);
    }

    console.log('[admin-serper-probe] probe fired —',
      'admin:', auth.user.email || auth.user.id,
      '| queryType:', queryType,
      '| location:', location,
      '| tbs:', tbs || 'none',
      '| items:', (result.items || []).length,
      '| status:', result.status,
      '| ms:', elapsedMs,
      '| query:', query);

    return res.status(200).json({
      ok: result.ok === true,
      status: result.status,
      query,
      queryType,
      location,
      recency: tbs,
      item_count: (result.items || []).length,
      items: result.items || [],
      retries_exhausted: result.retries_exhausted === true,
      elapsed_ms: elapsedMs,
      fetched_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[admin-serper-probe] error:', err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : 'Probe failed' });
  }
}

// ── Auth ─────────────────────────────────────────────────────────
// Identical shape to requireAdmin in the other api/admin-*.js files.
// Inlined per the existing pattern — admin-helper consolidation is a
// platform-wide refactor target, not in scope here.
async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return { ok: false, status: 401, error: 'No token provided' };
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { ok: false, status: 401, error: 'Invalid token' };
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (profErr || !profile || !profile.is_admin) {
    return { ok: false, status: 403, error: 'Admin access required' };
  }
  return { ok: true, user };
}
