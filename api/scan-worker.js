// api/scan-worker.js — Task 15 Step 2
// Worker endpoint for background scan processing. Invoked by Vercel Cron
// on a schedule and by api/scan-queue.js immediately after a manual scan
// is queued. Picks up queued jobs from cl_scan_jobs and dispatches each
// to the appropriate existing scan endpoint via internal HTTP call.
//
// Auth: CRON_SECRET required in Authorization: Bearer header (Vercel Cron
// sends this automatically). scan-queue.js fire-and-forget must also pass
// it — needs updating to include the Authorization header.
//
// Processing flow:
//   1. Watchdog — reset stuck jobs (running > 10 min without heartbeat)
//   2. Select up to MAX_CONCURRENT_JOBS queued jobs (priority ASC, created_at ASC)
//   3. Process each job in parallel — call existing scan endpoint, track heartbeat
//   4. Update job row with result counts or error on completion/failure
//
// No scan logic lives in this file — it delegates to the existing endpoints:
//   gmail      → /api/cl-email-scan       (userId in body, no JWT)
//   outlook    → /api/cl-outlook-scan      (userId in body, no JWT)
//   website    → /api/scrape-website       (userId in body, no JWT)
//   gdrive     → /api/drive-import         (JWT required — needs x-cron-secret update)
//   onedrive   → /api/onedrive-import      (JWT required — needs x-cron-secret update)
//   sharepoint → /api/sharepoint-import    (JWT required — needs x-cron-secret update)
//   dropbox    → /api/dropbox-import       (JWT required — needs x-cron-secret update)
//
// The four JWT-auth endpoints (drive, onedrive, sharepoint, dropbox) will
// return 401 until they are updated to accept x-cron-secret as alternative
// auth for worker invocations. The worker handles these as retryable failures.

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Review via admin dashboard once scan queue monitoring is built
var MAX_CONCURRENT_JOBS = 3;
var MAX_RETRIES = 2;
var HEARTBEAT_INTERVAL_MS = 30000;
var WATCHDOG_STALE_MINUTES = 10;
var JOB_TIMEOUT_MS = 240000;

// Build the endpoint URL and request body for a given job's source type.
// The worker passes userId in the body of every call so that JWT-auth
// endpoints can use it once they accept x-cron-secret as alternative auth.
function buildScanRequest(job, baseUrl) {
  var userId = job.user_id;
  var account = job.source_account;
  var path = job.source_path;

  switch (job.source_type) {
    case 'gmail':
      return { url: baseUrl + '/api/cl-email-scan', body: { userId: userId, accountEmail: account } };
    case 'outlook':
      return { url: baseUrl + '/api/cl-outlook-scan', body: { userId: userId, accountEmail: account } };
    case 'website':
      return { url: baseUrl + '/api/scrape-website', body: { userId: userId, url: account } };
    case 'gdrive':
      return { url: baseUrl + '/api/drive-import', body: { action: 'import-all', accountEmail: account, folderId: path, userId: userId } };
    case 'onedrive':
      return { url: baseUrl + '/api/onedrive-import', body: { action: 'import-all', accountEmail: account, folderId: path, userId: userId } };
    case 'sharepoint':
      var spParts = (path || '').split('|');
      return { url: baseUrl + '/api/sharepoint-import', body: { action: 'import-all', accountEmail: account, siteId: spParts[0] || '', libraryId: spParts[1] || '', userId: userId } };
    case 'dropbox':
      return { url: baseUrl + '/api/dropbox-import', body: { action: 'import-all', accountEmail: account, folderPath: path || '', userId: userId } };
    default:
      return null;
  }
}

// Process a single scan job. Called in parallel for up to MAX_CONCURRENT_JOBS
// jobs per worker invocation. Each call updates the job row through its
// lifecycle: queued → running → completed/failed/requeued.
async function processJob(supabase, job, baseUrl, deadline) {
  var now = new Date().toISOString();

  // Transition to running with initial heartbeat
  await supabase.from('cl_scan_jobs').update({
    status: 'running',
    started_at: now,
    last_heartbeat_at: now,
  }).eq('id', job.id);

  // Heartbeat — write last_heartbeat_at every 30 seconds so the
  // watchdog knows this job is still alive
  var heartbeatId = setInterval(function() {
    supabase.from('cl_scan_jobs').update({
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', job.id).then(function() {}).catch(function() {});
  }, HEARTBEAT_INTERVAL_MS);

  try {
    var scanReq = buildScanRequest(job, baseUrl);
    if (!scanReq) {
      throw new Error('Unknown source_type: ' + job.source_type);
    }

    // Check remaining time before the 240s worker deadline
    var remaining = deadline - Date.now();
    if (remaining <= 0) {
      // Reset to queued without incrementing retry — timeout is not a failure
      await supabase.from('cl_scan_jobs').update({
        status: 'queued',
        error_text: 'Worker timeout — job will be retried on next invocation',
      }).eq('id', job.id);
      console.log('[scan-worker] Job', job.id, 'abandoned — worker deadline reached before dispatch');
      return { jobId: job.id, outcome: 'timeout' };
    }

    // Abort the fetch if the worker deadline is reached while waiting
    var controller = new AbortController();
    var abortTimeoutId = setTimeout(function() { controller.abort(); }, remaining);

    console.log('[scan-worker] Dispatching job', job.id, '— source:', job.source_type, 'account:', job.source_account, 'path:', job.source_path);

    var resp = await fetch(scanReq.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify(scanReq.body),
      signal: controller.signal,
    });
    clearTimeout(abortTimeoutId);

    // Parse the response — handle Vercel gateway timeouts that return
    // plain text instead of JSON
    var result;
    try {
      result = await resp.json();
    } catch (parseErr) {
      throw new Error('Endpoint returned non-JSON response (status ' + resp.status + ')');
    }

    if (!resp.ok || result.error) {
      var errorText = result.error || ('Endpoint returned ' + resp.status);
      throw new Error(errorText);
    }

    // Success — write completion data. Response shapes vary by endpoint:
    //   gmail/outlook:                imported, pending, skipped
    //   drive/onedrive/sharepoint/dropbox: imported, pending, skipped
    //   website:                      count (alias for imported), pending
    await supabase.from('cl_scan_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      imported_count: result.imported || result.count || 0,
      pending_count: result.pending || 0,
      skipped_count: result.skipped || 0,
    }).eq('id', job.id);

    console.log('[scan-worker] Job', job.id, 'completed — imported:', result.imported || result.count || 0);
    return { jobId: job.id, outcome: 'completed' };

  } catch (err) {
    // AbortError means the worker deadline was reached while the scan
    // endpoint was still running. Reset to queued without incrementing
    // retry_count — the job did not fail, it was abandoned.
    if (err.name === 'AbortError') {
      await supabase.from('cl_scan_jobs').update({
        status: 'queued',
        error_text: 'Worker timeout — job will be retried on next invocation',
      }).eq('id', job.id);
      console.log('[scan-worker] Job', job.id, 'abandoned — worker deadline reached during scan');
      return { jobId: job.id, outcome: 'timeout' };
    }

    // Check for Claude API 429 (rate limit) in the error text so it
    // is tagged clearly in error_text. Treated as retryable.
    var errorMsg = err.message || '';
    var is429 = errorMsg.indexOf('429') > -1 || errorMsg.toLowerCase().indexOf('rate limit') > -1 || errorMsg.toLowerCase().indexOf('rate_limit') > -1;
    var errorPrefix = is429 ? '[429 rate limit] ' : '';

    if (job.retry_count < MAX_RETRIES) {
      await supabase.from('cl_scan_jobs').update({
        status: 'queued',
        retry_count: job.retry_count + 1,
        error_text: errorPrefix + errorMsg,
      }).eq('id', job.id);
      console.log('[scan-worker] Job', job.id, 'requeued — retry', job.retry_count + 1, '/', MAX_RETRIES, '— error:', errorMsg);
      return { jobId: job.id, outcome: 'retrying' };
    } else {
      await supabase.from('cl_scan_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_text: errorPrefix + errorMsg,
      }).eq('id', job.id);
      console.log('[scan-worker] Job', job.id, 'failed — retries exhausted — error:', errorMsg);
      return { jobId: job.id, outcome: 'failed' };
    }
  } finally {
    clearInterval(heartbeatId);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── CRON_SECRET auth ─────────────────────────────────────────────────
  var cronSecret = process.env.CRON_SECRET;
  var authHeader = req.headers['authorization'] || '';
  if (!cronSecret || authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  var workerStartTime = Date.now();
  var deadline = workerStartTime + JOB_TIMEOUT_MS;

  // ── Resolve base URL for internal endpoint calls ────────────────────
  var baseUrl = process.env.VERCEL_URL
    ? 'https://' + process.env.VERCEL_URL
    : 'https://' + (req.headers['host'] || 'staxai.com.au');

  try {
    // ── Watchdog — reset stuck jobs ────────────────────────────────────
    // Any job with status = running and last_heartbeat_at older than 10
    // minutes is assumed dead (Vercel function died, network failure,
    // etc.) and is reset to queued so the next invocation picks it up.
    var staleThreshold = new Date(Date.now() - WATCHDOG_STALE_MINUTES * 60 * 1000).toISOString();
    var watchdogResult = await supabase
      .from('cl_scan_jobs')
      .update({ status: 'queued' })
      .eq('status', 'running')
      .lt('last_heartbeat_at', staleThreshold);
    if (watchdogResult.error) {
      console.error('[scan-worker] Watchdog error:', watchdogResult.error.message);
    }

    // ── Select queued jobs ─────────────────────────────────────────────
    // Priority 1 = manual (user clicked Scan Now), higher values = scheduled.
    // FIFO within same priority via created_at.
    var jobsResult = await supabase
      .from('cl_scan_jobs')
      .select('*')
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(MAX_CONCURRENT_JOBS);

    if (jobsResult.error) {
      console.error('[scan-worker] Job selection error:', jobsResult.error.message);
      return res.status(500).json({ error: 'Failed to select jobs: ' + jobsResult.error.message });
    }

    var jobs = jobsResult.data || [];
    if (jobs.length === 0) {
      return res.status(200).json({ success: true, message: 'No queued jobs', processed: 0 });
    }

    console.log('[scan-worker] Processing', jobs.length, 'job(s)');

    // ── Process jobs in parallel ───────────────────────────────────────
    var results = await Promise.allSettled(
      jobs.map(function(job) { return processJob(supabase, job, baseUrl, deadline); })
    );

    var summary = results.map(function(r, i) {
      if (r.status === 'fulfilled') return r.value;
      return { jobId: jobs[i].id, outcome: 'error', error: r.reason && r.reason.message };
    });

    console.log('[scan-worker] Complete —', JSON.stringify(summary));
    return res.status(200).json({ success: true, processed: jobs.length, results: summary });

  } catch (err) {
    console.error('[scan-worker] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
