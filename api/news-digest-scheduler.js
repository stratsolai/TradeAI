// api/news-digest-scheduler.js — Phase 5.5
//
// Daily cron that enqueues a shared research refresh for every user
// whose Industry News & Updates cadence has fired. Modelled on
// api/scan-scheduler.js — same auth model, same due-check shape,
// same dedupe-against-active-jobs shape, same "scheduler enqueues,
// worker dispatches" division of responsibility.
//
// Auth: CRON_SECRET required in Authorization: Bearer header. Vercel
// Cron sends this automatically; manual invocations need it set.
//
// Does NOT run any refresh itself. It only inserts rows into
// news_digest_scan_jobs with status: 'queued'. api/news-digest-
// worker.js picks them up on the next worker tick and invokes
// /api/shared-research-refresh.js via direct module import using the
// x-cron-secret alt-auth path added in Phase 5.5.
//
// Due-check anchor is shared_research_refreshes.created_at (NOT this
// job table's completed_at), so a browser-triggered Refresh Now from
// the ID page correctly resets the cadence clock. The job table is
// only used to dedupe against currently queued/running work.

export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Frequency intervals in milliseconds — match scan-scheduler.js's INTERVALS
// vocabulary so the platform pattern is consistent.
const INTERVALS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

function isDue(cadence, lastRefreshAt) {
  if (!cadence || cadence === 'manual') return false;
  const interval = INTERVALS[cadence];
  if (!interval) return false;
  if (!lastRefreshAt) return true; // never refreshed — due immediately
  const elapsed = Date.now() - new Date(lastRefreshAt).getTime();
  return elapsed >= interval;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── CRON_SECRET auth ─────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'] || '';
  if (!cronSecret || authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let queued = 0;
  let skippedAlreadyActive = 0;
  let skippedNotDue = 0;
  let skippedNoCadence = 0;
  let errors = 0;

  try {
    // ── Load every user's cadence setting ─────────────────────────────
    // news_digest_settings holds the cadence value Phase 5 wired up.
    // 'manual' is the implicit default for users who haven't picked one;
    // those are skipped here.
    const settingsRes = await supabase
      .from('news_digest_settings')
      .select('user_id, cadence')
      .in('cadence', ['daily', 'weekly']);
    if (settingsRes.error) {
      console.error('[news-digest-scheduler] Settings query error:', settingsRes.error.message);
      return res.status(500).json({ error: 'Failed to load cadence settings' });
    }
    const dueCandidates = settingsRes.data || [];

    if (dueCandidates.length === 0) {
      console.log('[news-digest-scheduler] No users with daily/weekly cadence — nothing to enqueue');
      return res.status(200).json({ success: true, queued: 0, skipped_not_due: 0, skipped_already_active: 0, errors: 0 });
    }

    // ── Last-refresh lookup per user ─────────────────────────────────
    // Authoritative anchor is shared_research_refreshes.created_at —
    // every successful refresh writes a row there regardless of
    // trigger (Refresh Now, cron, BI/Phase 6 future). This means a
    // user who clicked Refresh Now an hour before the cron fires
    // correctly resets the cadence clock and isn't re-refreshed.
    const userIds = dueCandidates.map((r) => r.user_id);
    const refreshesRes = await supabase
      .from('shared_research_refreshes')
      .select('user_id, created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false });
    if (refreshesRes.error) {
      console.error('[news-digest-scheduler] Refreshes query error:', refreshesRes.error.message);
      return res.status(500).json({ error: 'Failed to load refresh history' });
    }
    const lastRefreshByUser = {};
    for (const row of refreshesRes.data || []) {
      if (!lastRefreshByUser[row.user_id]) lastRefreshByUser[row.user_id] = row.created_at;
    }

    // ── Dedupe lookup — users with a queued/running job already ──────
    // Without this a slow worker tick would let the scheduler stack
    // duplicate jobs on the next daily run.
    const activeRes = await supabase
      .from('news_digest_scan_jobs')
      .select('user_id')
      .in('status', ['queued', 'running']);
    if (activeRes.error) {
      console.error('[news-digest-scheduler] Active jobs query error:', activeRes.error.message);
      return res.status(500).json({ error: 'Failed to load active jobs' });
    }
    const activeUserIds = new Set((activeRes.data || []).map((r) => r.user_id));

    // ── Walk each candidate, enqueue if due and not already active ───
    for (const row of dueCandidates) {
      const userId = row.user_id;
      const cadence = row.cadence;
      if (!cadence || cadence === 'manual') { skippedNoCadence++; continue; }
      if (activeUserIds.has(userId)) { skippedAlreadyActive++; continue; }
      const lastRefreshAt = lastRefreshByUser[userId] || null;
      if (!isDue(cadence, lastRefreshAt)) { skippedNotDue++; continue; }

      try {
        const ins = await supabase
          .from('news_digest_scan_jobs')
          .insert({
            user_id: userId,
            status: 'queued',
            priority: 2,
            retry_count: 0
          });
        if (ins.error) {
          console.error('[news-digest-scheduler] Enqueue error — user:', userId, 'message:', ins.error.message);
          errors++;
          continue;
        }
        queued++;
        activeUserIds.add(userId);
      } catch (e) {
        console.error('[news-digest-scheduler] Enqueue exception — user:', userId, 'message:', e && e.message);
        errors++;
      }
    }

    console.log('[news-digest-scheduler] Complete — queued:', queued, 'skipped_not_due:', skippedNotDue, 'skipped_already_active:', skippedAlreadyActive, 'skipped_no_cadence:', skippedNoCadence, 'errors:', errors);
    return res.status(200).json({
      success: true,
      queued: queued,
      skipped_not_due: skippedNotDue,
      skipped_already_active: skippedAlreadyActive,
      skipped_no_cadence: skippedNoCadence,
      errors: errors
    });

  } catch (err) {
    console.error('[news-digest-scheduler] Fatal error:', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
}
