// api/news-digest-worker.js — Phase 5.5
//
// Cron worker that drains the news_digest_scan_jobs queue and
// dispatches each row to /api/shared-research-refresh.js as a direct
// module import. Modelled on api/scan-worker.js but materially
// simpler because:
//
//   - One job = one shared research refresh call for one user
//   - No batches, no morePending cursor, no per-source dispatch
//     switch — the only handler dispatched is the shared research
//     refresh handler
//   - Refreshes are ~17-35s (cache-hit / fresh-fetch) — well inside
//     the 240s job timeout scan-worker uses; no heartbeat protocol
//     is needed inside the handler itself
//
// Auth: CRON_SECRET required in Authorization: Bearer header. Vercel
// Cron sends this automatically.
//
// Concurrency: 2 jobs per worker invocation. The 24-hour shared
// cache means the first concurrent fresh-fetch warms the cache for
// the rest of the day, so subsequent calls in the same worker tick
// hit cache and complete in ~17s. With a 60s maxDuration this gives
// a comfortable margin even for back-to-back fresh-fetch worst-case.
//
// Retries: up to 2 retries per job. After that the job is marked
// 'failed' and the watchdog will requeue any stuck 'running' jobs
// on the next worker invocation.

export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';
import sharedResearchRefreshHandler from './shared-research-refresh.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MAX_CONCURRENT_JOBS = 2;
const MAX_RETRIES = 2;
const WATCHDOG_STALE_MINUTES = 5;
const JOB_TIMEOUT_MS = 50000;

// Build a mock req object that lets the shared-research-refresh
// handler treat this as a worker call (alt-auth path) rather than a
// browser call. The x-cron-secret header is matched by the handler's
// auth block added in commit 4c0eaac; userId in the body identifies
// which user this refresh is for. triggered_by_tool is tagged 'cron'
// so refreshes initiated by the scheduler are distinguishable from
// browser-triggered refreshes in shared_research_refreshes.
function buildMockReq(userId) {
  return {
    method: 'POST',
    query: {},
    headers: {
      'content-type': 'application/json',
      'x-cron-secret': process.env.CRON_SECRET || ''
    },
    body: {
      userId: userId,
      triggered_by_tool: 'cron'
    }
  };
}

// Build a mock res object that captures the handler's JSON response.
// Returns a promise that resolves with { statusCode, data } when the
// handler calls res.status(code).json(data).
function buildMockRes() {
  let statusCode = 200;
  let resolved = false;
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  const res = {
    status: (code) => { statusCode = code; return res; },
    json: (data) => {
      if (resolved) return;
      resolved = true;
      resolve({ statusCode: statusCode, data: data });
    }
  };
  return { res: res, promise: promise };
}

async function processJob(supabase, job) {
  const startedAt = new Date().toISOString();

  // Transition queued → running with heartbeat
  await supabase
    .from('news_digest_scan_jobs')
    .update({
      status: 'running',
      started_at: startedAt,
      last_heartbeat_at: startedAt
    })
    .eq('id', job.id);

  try {
    const mockReq = buildMockReq(job.user_id);
    const mock = buildMockRes();

    // Race the handler against the per-job timeout. The handler
    // resolves the mock via res.status().json(); the timeout
    // resolves with timedOut: true.
    sharedResearchRefreshHandler(mockReq, mock.res).catch((err) => {
      mock.res.status(500).json({ error: (err && err.message) || 'Handler threw' });
    });
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve({ timedOut: true }), JOB_TIMEOUT_MS);
    });

    const outcome = await Promise.race([mock.promise, timeoutPromise]);

    if (outcome.timedOut) {
      throw new Error('Job timeout — handler did not respond within ' + JOB_TIMEOUT_MS + 'ms');
    }

    const result = outcome.data || {};
    const statusCode = outcome.statusCode;
    const refreshId = result.refresh_id || null;
    // shared-research-refresh's response shape:
    //   - 200 with outcome ∈ {success, no_results}
    //   - 422 with outcome=validation_failed (refresh row written)
    //   - 500 with outcome=error (refresh row still written if possible)
    // For job-state purposes, treat success/no_results/validation_failed
    // as "completed" (the refresh layer ran its full pipeline and
    // recorded its outcome) and only treat 500/error as a worker
    // failure that should be retried.
    const handlerOutcome = result.outcome || null;
    const isHandlerError = statusCode === 500 || handlerOutcome === 'error' || (statusCode >= 400 && statusCode !== 422);

    if (isHandlerError) {
      const errText = (result && result.error) || ('Handler returned ' + statusCode);
      throw new Error(errText);
    }

    await supabase
      .from('news_digest_scan_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        refresh_id: refreshId,
        outcome: handlerOutcome
      })
      .eq('id', job.id);

    console.log('[news-digest-worker] Job', job.id, 'completed — user:', job.user_id, 'outcome:', handlerOutcome, 'refresh_id:', refreshId);
    return { jobId: job.id, outcome: 'completed' };

  } catch (err) {
    const errorMsg = (err && err.message) || 'Unknown error';
    if (job.retry_count < MAX_RETRIES) {
      await supabase
        .from('news_digest_scan_jobs')
        .update({
          status: 'queued',
          retry_count: job.retry_count + 1,
          error_text: errorMsg
        })
        .eq('id', job.id);
      console.log('[news-digest-worker] Job', job.id, 'requeued — retry', job.retry_count + 1, '/', MAX_RETRIES, '— error:', errorMsg);
      return { jobId: job.id, outcome: 'retrying' };
    }
    await supabase
      .from('news_digest_scan_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_text: errorMsg
      })
      .eq('id', job.id);
    console.log('[news-digest-worker] Job', job.id, 'failed — retries exhausted — error:', errorMsg);
    return { jobId: job.id, outcome: 'failed' };
  }
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

  try {
    // ── Watchdog — requeue stuck running jobs ─────────────────────────
    // A job stuck in 'running' past WATCHDOG_STALE_MINUTES means the
    // previous worker crashed mid-dispatch (function timeout, OOM,
    // etc.). Requeue so the next tick can re-process it. retry_count
    // is bumped so it doesn't loop indefinitely.
    const staleCutoff = new Date(Date.now() - WATCHDOG_STALE_MINUTES * 60 * 1000).toISOString();
    const staleRes = await supabase
      .from('news_digest_scan_jobs')
      .select('id, retry_count')
      .eq('status', 'running')
      .lt('last_heartbeat_at', staleCutoff);
    if (!staleRes.error) {
      for (const stale of staleRes.data || []) {
        if (stale.retry_count >= MAX_RETRIES) {
          await supabase
            .from('news_digest_scan_jobs')
            .update({ status: 'failed', completed_at: new Date().toISOString(), error_text: 'Worker stalled past watchdog — retries exhausted' })
            .eq('id', stale.id);
        } else {
          await supabase
            .from('news_digest_scan_jobs')
            .update({ status: 'queued', retry_count: stale.retry_count + 1, error_text: 'Worker stalled past watchdog — requeued' })
            .eq('id', stale.id);
        }
      }
    }

    // ── Claim up to MAX_CONCURRENT_JOBS queued jobs ──────────────────
    const queuedRes = await supabase
      .from('news_digest_scan_jobs')
      .select('id, user_id, retry_count')
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(MAX_CONCURRENT_JOBS);
    if (queuedRes.error) {
      console.error('[news-digest-worker] Claim error:', queuedRes.error.message);
      return res.status(500).json({ error: 'Failed to claim jobs' });
    }
    const jobs = queuedRes.data || [];

    if (jobs.length === 0) {
      return res.status(200).json({ success: true, processed: 0 });
    }

    // Process in parallel — refreshes are independent. The shared
    // 24-hour cache means concurrent fresh-fetches against the same
    // query are de-duplicated at the Serper layer naturally (the
    // first to land writes the cache; the others read what the first
    // wrote). For the test user (n=1) this is academic; the model
    // matches scan-worker for n-user scale.
    const results = await Promise.all(jobs.map((j) => processJob(supabase, j)));

    const summary = results.reduce((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] || 0) + 1;
      return acc;
    }, {});

    console.log('[news-digest-worker] Tick complete — processed:', results.length, 'summary:', JSON.stringify(summary));
    return res.status(200).json({ success: true, processed: results.length, summary: summary });

  } catch (err) {
    console.error('[news-digest-worker] Fatal error:', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
}
