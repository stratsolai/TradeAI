// api/news-digest-scheduler.js — dormant pending ID tool-side cadence rework
//
// This file's pre-rebuild role: walk news_digest_settings.cadence,
// compare each user's last shared_research_refreshes.created_at
// against a daily/weekly interval, and enqueue news_digest_scan_jobs
// rows for users whose cadence has fired. The worker (api/news-digest-
// worker.js) drained the queue by invoking /api/shared-research-
// refresh once per row.
//
// SRL Cohort Architecture Addendum v1.2:
//   §6.1 — this file is repurposed for ID's tool-side cadence
//          (driving when ID re-reads shared_research and updates
//          its tool view) instead of driving SRL refreshes.
//   §12  — the SRL-refresh call is removed end-to-end.
// The repurposed behaviour is a future ID tool-review workstream
// and is unspecified at the time of writing.
//
// Two parts of the pre-rebuild body are no longer salvageable:
//   - The user_id-based read of shared_research_refreshes
//     (shared_research_refreshes.user_id was dropped by Addendum
//     §4.2's migration; the column no longer exists). Whatever due-
//     anchor the tool-side cadence ends up using is a redesign,
//     not a column-name swap — the per-user-refresh anchor doesn't
//     map cleanly onto cohort-shared refresh.
//   - The news_digest_scan_jobs enqueue itself was a producer for
//     the now-dormant worker. With the worker dormant there is
//     nothing to drain the queue, so producing rows just leaks
//     state until the tool review wires the new flow.
//
// Until that workstream lands, the handler is a no-op. The Vercel
// cron entry for /api/news-digest-scheduler stays out of vercel.json
// (the news-digest crons are deliberately disabled), so this code
// is not invoked. If a future workstream re-enables the cron
// without first redesigning the body, the handler returns 200 with
// a dormant marker — no destructive action, no crash.
//
// The pre-rebuild logic is preserved in git history. Recover from
// there when the tool-cadence spec lands.

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

  console.log('[news-digest-scheduler] Dormant — SRL Cohort Architecture Addendum v1.2 §12 removed the per-user shared-research-refresh path; ID tool-side cadence rework pending.');
  return res.status(200).json({
    success: true,
    dormant: true,
    message: 'news-digest-scheduler is dormant pending ID tool-side cadence rework — see SRL Cohort Architecture Addendum v1.2 §6.1, §12'
  });
}
