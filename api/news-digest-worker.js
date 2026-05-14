// api/news-digest-worker.js — dormant pending ID tool-side cadence rework
//
// This file's pre-rebuild role: drain news_digest_scan_jobs and
// invoke /api/shared-research-refresh once per row via x-cron-secret
// alt-auth. SRL Cohort Architecture Addendum v1.2 §6.1 repurposes
// this file for ID's tool-side cadence (driving when ID re-reads
// shared_research and updates its tool view); §12 removes the
// SRL-refresh call entirely. The repurposed behaviour is a future
// ID tool-review workstream and is unspecified at the time of
// writing.
//
// Until that workstream lands, the handler is a no-op. The Vercel
// cron entry for /api/news-digest-worker stays out of vercel.json
// (the news-digest crons are deliberately disabled), so this code
// is not invoked. If a future workstream re-enables the cron
// without first redesigning the body, the handler returns 200 with
// a dormant marker — no destructive action, no crash.
//
// The pre-rebuild logic (queue claim, mock req/res construction,
// shared-research-refresh module-import invocation, retries,
// watchdog) is preserved in git history. Recover from there when
// the tool-cadence spec lands.
//
// Auth retained so re-enabling the cron without auth wiring will
// still 401 cleanly rather than serving the dormant message to
// anonymous requests.

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'] || '';
  if (!cronSecret || authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  console.log('[news-digest-worker] Dormant — SRL Cohort Architecture Addendum v1.2 §12 removed the shared-research-refresh path; ID tool-side cadence rework pending.');
  return res.status(200).json({
    success: true,
    dormant: true,
    message: 'news-digest-worker is dormant pending ID tool-side cadence rework — see SRL Cohort Architecture Addendum v1.2 §6.1, §12'
  });
}
