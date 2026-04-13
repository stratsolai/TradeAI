// api/ea-purge.js — Email Assistant purge cron
// Deletes all email_summaries rows where received_at is older than 90 days.
// Authenticated via CRON_SECRET in the Authorization header.
// Intended to run weekly via Vercel cron.

export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
  // ── Auth: CRON_SECRET required ────────────────────────────
  var authHeader = req.headers['authorization'] || '';
  var token = authHeader.replace('Bearer ', '').trim();
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Calculate 90-day cutoff ───────────────────────────────
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  var cutoffIso = cutoff.toISOString();

  // ── Delete old rows ───────────────────────────────────────
  var result = await supabase
    .from('email_summaries')
    .delete()
    .lt('received_at', cutoffIso);

  if (result.error) {
    console.error('[ea-purge] Delete error:', result.error.message);
    return res.status(500).json({ error: 'Purge failed', detail: result.error.message });
  }

  var deletedCount = (result.data && Array.isArray(result.data)) ? result.data.length : 0;
  console.log('[ea-purge] Purged ' + deletedCount + ' rows older than ' + cutoffIso);

  return res.status(200).json({ success: true, deleted: deletedCount, cutoff: cutoffIso });
}
