// api/scan-worker.js — Task 15 Step 2
// Worker endpoint for background scan processing. Invoked by Vercel Cron
// on a schedule and by api/scan-queue.js immediately after a manual scan
// is queued. Picks up queued jobs from cl_scan_jobs and dispatches each
// to the appropriate scan endpoint handler via direct module import.
//
// Auth: CRON_SECRET required in Authorization: Bearer header (Vercel Cron
// sends this automatically; scan-queue.js also passes it).
//
// Processing flow:
//   1. Watchdog — reset stuck jobs (running > 10 min without heartbeat)
//   2. Select up to MAX_CONCURRENT_JOBS queued jobs (priority ASC, created_at ASC)
//   3. Process each job in parallel — call handler directly with mock req/res
//   4. Update job row with result counts or error on completion/failure
//
// Handlers are imported directly as modules and called with constructed
// req/res objects. This bypasses the network layer entirely — no HTTP
// round-trip, no Vercel deployment protection, no edge auth issues.

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import gmailHandler from './cl-email-scan.js';
import outlookHandler from './cl-outlook-scan.js';
import driveHandler from './drive-import.js';
import onedriveHandler from './onedrive-import.js';
import sharepointHandler from './sharepoint-import.js';
import dropboxHandler from './dropbox-import.js';
import websiteHandler from './scrape-website.js';
import eaEmailHandler from './email.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Review via admin dashboard once scan queue monitoring is built
var MAX_CONCURRENT_JOBS = 3;
var MAX_RETRIES = 2;
var HEARTBEAT_INTERVAL_MS = 30000;
var WATCHDOG_STALE_MINUTES = 10;
var JOB_TIMEOUT_MS = 240000;

// Build a mock req object for calling a scan endpoint handler directly.
// The JWT-auth endpoints (drive, onedrive, sharepoint, dropbox) check
// req.headers['x-cron-secret'] as alternative auth, so the mock includes
// it. The body-auth endpoints (gmail, outlook, website) just read userId
// from req.body. x-internal-secret is the shared secret for
// service-to-service auth on cl-email-scan and cl-outlook-scan (Task 23).
function buildMockReq(body) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cron-secret': process.env.CRON_SECRET || '',
      'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
    },
    body: body,
  };
}

// Build a mock res object that captures the handler's JSON response.
// Returns a promise that resolves with { statusCode, data } when the
// handler calls res.status(code).json(data). Only the first call to
// json() resolves the promise — subsequent calls are ignored so that
// cancellation checks and handler completion do not conflict.
function buildMockRes() {
  var statusCode = 200;
  var resolved = false;
  var resolve;
  var promise = new Promise(function(r) { resolve = r; });
  var res = {
    status: function(code) {
      statusCode = code;
      return res;
    },
    json: function(data) {
      if (resolved) return;
      resolved = true;
      resolve({ statusCode: statusCode, data: data });
    },
  };
  return { res: res, promise: promise };
}

// Map a job's source_type to { handler, body } for direct invocation.
function buildDispatch(job) {
  var userId = job.user_id;
  var account = job.source_account;
  var path = job.source_path;

  switch (job.source_type) {
    case 'gmail':
      return { handler: gmailHandler, body: { userId: userId, accountEmail: account, jobId: job.id } };
    case 'outlook':
      return { handler: outlookHandler, body: { userId: userId, accountEmail: account, jobId: job.id } };
    case 'website':
      return { handler: websiteHandler, body: { userId: userId, url: account } };
    case 'gdrive':
      return { handler: driveHandler, body: { action: 'import-all', accountEmail: account, folderId: path, userId: userId } };
    case 'onedrive':
      return { handler: onedriveHandler, body: { action: 'import-all', accountEmail: account, folderId: path, userId: userId } };
    case 'sharepoint':
      var spParts = (path || '').split('|');
      return { handler: sharepointHandler, body: { action: 'import-all', accountEmail: account, siteId: spParts[0] || '', libraryId: spParts[1] || '', userId: userId } };
    case 'dropbox':
      return { handler: dropboxHandler, body: { action: 'import-all', accountEmail: account, folderPath: path || '', userId: userId } };
    case 'ea-gmail':
      return { handler: eaEmailHandler, body: { userId: userId, accountEmail: account, provider: 'gmail', jobId: job.id } };
    case 'ea-outlook':
      return { handler: eaEmailHandler, body: { userId: userId, accountEmail: account, provider: 'outlook', jobId: job.id } };
    default:
      return null;
  }
}

// Process a single scan job. Called in parallel for up to MAX_CONCURRENT_JOBS
// jobs per worker invocation. Each call updates the job row through its
// lifecycle: queued → running → completed/failed/requeued.
async function processJob(supabase, job, deadline) {
  var now = new Date().toISOString();

  // Transition to running with initial heartbeat
  await supabase.from('cl_scan_jobs').update({
    status: 'running',
    started_at: now,
    last_heartbeat_at: now,
  }).eq('id', job.id);

  // Track whether this job has been cancelled by the user
  var jobCancelled = false;

  // Heartbeat — write last_heartbeat_at every 30 seconds so the
  // watchdog knows this job is still alive. On each tick, re-read the
  // job status — if it has been set to cancelled, flag it so the
  // processing loop can abandon the job cleanly.
  var heartbeatId = setInterval(function() {
    supabase.from('cl_scan_jobs').select('status').eq('id', job.id).single()
      .then(function(result) {
        if (result.data && result.data.status === 'cancelled') {
          jobCancelled = true;
          return;
        }
        return supabase.from('cl_scan_jobs').update({
          last_heartbeat_at: new Date().toISOString(),
        }).eq('id', job.id);
      })
      .then(function() {}).catch(function() {});
  }, HEARTBEAT_INTERVAL_MS);

  try {
    var dispatch = buildDispatch(job);
    if (!dispatch) {
      throw new Error('Unknown source_type: ' + job.source_type);
    }

    // Check remaining time before the 240s worker deadline
    var remaining = deadline - Date.now();
    if (remaining <= 0) {
      await supabase.from('cl_scan_jobs').update({
        status: 'queued',
        error_text: 'Worker timeout — job will be retried on next invocation',
      }).eq('id', job.id);
      console.log('[scan-worker] Job', job.id, 'abandoned — worker deadline reached before dispatch');
      return { jobId: job.id, outcome: 'timeout' };
    }

    console.log('[scan-worker] Dispatching job', job.id, '— source:', job.source_type, 'account:', job.source_account, 'path:', job.source_path);

    // Call the handler directly with mock req/res. The handler runs
    // asynchronously and calls mock.res.json() when done, which resolves
    // mock.promise. Race against the worker deadline and cancellation.
    var mockReq = buildMockReq(dispatch.body);
    var mock = buildMockRes();

    // Start the handler — do not await it, let it resolve via mock.res
    dispatch.handler(mockReq, mock.res).catch(function(handlerErr) {
      // If the handler throws before calling res.json(), resolve the
      // mock with an error so the race does not hang forever
      mock.res.status(500).json({ error: handlerErr.message || 'Handler threw an unhandled error' });
    });

    var timeoutPromise = new Promise(function(resolve) {
      setTimeout(function() { resolve({ timedOut: true }); }, remaining);
    });

    // Check cancellation periodically during the handler call
    var cancelCheckId = setInterval(function() {
      if (jobCancelled) {
        mock.res.status(499).json({ _cancelled: true });
      }
    }, 5000);

    var outcome = await Promise.race([mock.promise, timeoutPromise]);
    clearInterval(cancelCheckId);

    // Handle cancellation
    if (jobCancelled || (outcome.data && outcome.data._cancelled)) {
      console.log('[scan-worker] Job', job.id, 'cancelled by user during scan');
      return { jobId: job.id, outcome: 'cancelled' };
    }

    // Handle timeout
    if (outcome.timedOut) {
      await supabase.from('cl_scan_jobs').update({
        status: 'queued',
        error_text: 'Worker timeout — job will be retried on next invocation',
      }).eq('id', job.id);
      console.log('[scan-worker] Job', job.id, 'abandoned — worker deadline reached during scan');
      return { jobId: job.id, outcome: 'timeout' };
    }

    var result = outcome.data;
    var statusCode = outcome.statusCode;

    if (statusCode >= 400 || (result && result.error)) {
      var errorText = (result && result.error) || ('Handler returned ' + statusCode);
      throw new Error(errorText);
    }

    // Batch cursor support — when a handler returns morePending: true,
    // the job is not complete. Accumulate batch counts onto the job row
    // and requeue so the next worker invocation continues from the cursor.
    if (result.morePending) {
      // Read current counts from job row to accumulate
      var currentJob = await supabase.from('cl_scan_jobs').select('imported_count, approved_count, pending_count, rejected_count, skipped_count, auto_archived_count, fin_docs_paired_count, deduped_count').eq('id', job.id).single();
      var cur = currentJob.data || {};
      await supabase.from('cl_scan_jobs').update({
        status: 'queued',
        imported_count: (cur.imported_count || 0) + (result.imported || 0),
        approved_count: (cur.approved_count || 0) + (result.approved || 0),
        pending_count: (cur.pending_count || 0) + (result.pending || 0),
        rejected_count: (cur.rejected_count || 0) + (result.rejected || 0),
        skipped_count: (cur.skipped_count || 0) + (result.skipped || 0),
        auto_archived_count: (cur.auto_archived_count || 0) + (result.auto_archived || 0),
        fin_docs_paired_count: (cur.fin_docs_paired_count || 0) + (result.fin_docs_paired || 0),
        deduped_count: (cur.deduped_count || 0) + (result.deduped || 0),
      }).eq('id', job.id);
      console.log('[scan-worker] Job', job.id, 'batch complete — morePending, requeued. Batch imported:', result.imported || 0);
      return { jobId: job.id, outcome: 'morePending' };
    }

    // Success — write all available counts from the scan result.
    // Each endpoint returns a slightly different set of fields but
    // all share the core shape. Missing fields fall back to 0.
    // For cursor-based scans the final batch counts are added to
    // any previously accumulated counts already on the job row.
    var finalJob = await supabase.from('cl_scan_jobs').select('imported_count, approved_count, pending_count, rejected_count, skipped_count, auto_archived_count, fin_docs_paired_count, deduped_count').eq('id', job.id).single();
    var prev = finalJob.data || {};
    await supabase.from('cl_scan_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      imported_count: (prev.imported_count || 0) + (result.imported || result.count || 0),
      approved_count: (prev.approved_count || 0) + (result.approved || 0),
      pending_count: (prev.pending_count || 0) + (result.pending || 0),
      rejected_count: (prev.rejected_count || 0) + (result.rejected || 0),
      skipped_count: (prev.skipped_count || 0) + (result.skipped || 0),
      auto_archived_count: (prev.auto_archived_count || 0) + (result.auto_archived || 0),
      fin_docs_paired_count: (prev.fin_docs_paired_count || 0) + (result.fin_docs_paired || 0),
      deduped_count: (prev.deduped_count || 0) + (result.deduped || 0),
      pages_crawled: result.pages_crawled || 0,
      pages_skipped: result.pages_skipped || 0,
    }).eq('id', job.id);

    console.log('[scan-worker] Job', job.id, 'completed — imported:', (prev.imported_count || 0) + (result.imported || result.count || 0), 'approved:', (prev.approved_count || 0) + (result.approved || 0));
    return { jobId: job.id, outcome: 'completed' };

  } catch (err) {
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
  // Accept both GET (Vercel Cron) and POST (scan-queue trigger)
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── CRON_SECRET auth ─────────────────────────────────────────────────
  var cronSecret = process.env.CRON_SECRET;
  var authHeader = req.headers['authorization'] || '';
  if (!cronSecret || authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  var workerStartTime = Date.now();
  var deadline = workerStartTime + JOB_TIMEOUT_MS;

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
      jobs.map(function(job) { return processJob(supabase, job, deadline); })
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
