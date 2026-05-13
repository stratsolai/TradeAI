// api/signup-pending-cleanup.js — Daily cron that deletes
// signup_pending rows older than 48 hours.
//
// Most signup_pending rows are consumed at email confirmation by
// /api/signup-pending-read (post-confirmation handler) or by the
// sign-in safety net. Rows survive only when the user signed up
// but never confirmed their email and never signed in. After 48h
// the data is stale either way and should not linger — the user
// can re-attempt signup if needed.
//
// Auth: Authorization: Bearer <CRON_SECRET>. Matches the pattern
// used by api/news-digest-scheduler.js and api/scan-scheduler.js —
// Vercel Cron sends Authorization Bearer with the CRON_SECRET env
// var when invoking the scheduled function.
//
// Failure mode: any error logs and returns 500. The next day's
// cron tick retries; no state to recover.

export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TTL_HOURS = 48;

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── CRON_SECRET auth (Vercel Cron pattern) ──────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'] || '';
  if (!cronSecret || authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const cutoffIso = new Date(Date.now() - TTL_HOURS * 60 * 60 * 1000).toISOString();

  try {
    const delRes = await supabase
      .from('signup_pending')
      .delete()
      .lt('created_at', cutoffIso)
      .select('user_id');
    if (delRes.error) {
      console.error('[SignupPendingCleanup] delete error — cutoff:', cutoffIso, 'message:', delRes.error.message);
      return res.status(500).json({ error: delRes.error.message });
    }
    const deletedCount = Array.isArray(delRes.data) ? delRes.data.length : 0;
    console.log('[SignupPendingCleanup] complete — cutoff: ' + cutoffIso + ', deleted: ' + deletedCount);
    return res.status(200).json({ success: true, deleted: deletedCount, cutoff: cutoffIso });
  } catch (e) {
    console.error('[SignupPendingCleanup] exception — message:', e && e.message);
    return res.status(500).json({ error: e && e.message });
  }
}
