// api/srl-worker.js — SRL Cohort Architecture Addendum v1.2
//
// Cron worker that drains the srl_cron_jobs queue. For each row it
// invokes api/shared-research-refresh.js directly via module import,
// using the x-cron-secret alt-auth path with cohort_id in the body.
//
// Pass C in the rebuild sequence. The companion scheduler is
// api/srl-scheduler.js; api/shared-research-refresh.js itself is
// rewritten in Pass D to consume cohort_id rather than userId.
// Until Pass D lands the refresh endpoint will not understand the
// cohort_id payload — that is expected and is why the cron entries
// in vercel.json stay inactive until Pass F sign-off.
//
// Scope (Addendum §5.2 Steps C, D, E, F):
//
//   Step C — Drain the queue, claiming the oldest queued rows up to
//            MAX_CONCURRENT_JOBS per tick.
//   Step D — Each refresh proceeds per the existing pipeline (plan,
//            cache, Serper, curate, validate, write). Pass D rewrites
//            the endpoint to be cohort-scoped; this worker is the
//            caller of that endpoint.
//   Step E — On successful refresh, update cohorts.last_refreshed_at
//            and cohorts.member_count_at_last_refresh for the cohort.
//   Step F — Housekeeping after the queue is fully drained:
//              - delete shared_research rows older than 7 days
//              - delete shared_research rows for is_active = false cohorts
//
// Auth: CRON_SECRET required in Authorization: Bearer header. The
// alt-auth handed to the refresh endpoint uses the same secret in
// the x-cron-secret header — matches the platform's other
// service-to-service paths (drive-import, dropbox-import, onedrive-
// import, sharepoint-import).
//
// Concurrency: MAX_CONCURRENT_JOBS bounds how many cohorts refresh
// in parallel per tick. Cohort-shared Sonnet curation is heavier
// than per-user Haiku (Addendum §10), so the worker stays
// conservative — one cohort at a time per tick, queue drains over
// successive 5-minute ticks. Adjust upward only after dry-run
// observations confirm headroom.
//
// Retries: up to MAX_RETRIES re-queues on handler error (500 or
// outcome=error). Validation failures and no-results outcomes are
// treated as completed — the refresh pipeline ran end-to-end and
// the refresh row is written; retrying would only hit the same
// upstream condition again.
//
// Watchdog: any in_progress job whose started_at is older than
// WATCHDOG_STALE_MINUTES is requeued. Covers the case where the
// previous worker invocation crashed mid-flight (function timeout,
// OOM) leaving an orphan row in in_progress that would otherwise
// block dedupe in the scheduler indefinitely.

export const config = { maxDuration: 120 };

import { createClient } from '@supabase/supabase-js';
import sharedResearchRefreshHandler from './shared-research-refresh.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MAX_CONCURRENT_JOBS = 1;
const MAX_RETRIES = 2;
const WATCHDOG_STALE_MINUTES = 10;
const JOB_TIMEOUT_MS = 100000;
const HOUSEKEEPING_RETENTION_DAYS = 7;

// ---------------------------------------------------------------------------
// Mock req/res for direct handler invocation
// ---------------------------------------------------------------------------
//
// Pattern mirrors api/news-digest-worker.js. The refresh handler is
// imported as a module rather than HTTP-called so we avoid an extra
// Vercel invocation per refresh. The mock req carries the cron
// secret and cohort_id; the mock res captures whatever the handler
// resolves via res.status().json().
//
// Pass D will rewrite shared-research-refresh.js to read cohort_id
// from the body on the alt-auth path (today it reads userId).
// Naming the field cohort_id now means the worker doesn't need a
// follow-up edit when Pass D lands.

function buildMockReq(cohortId) {
  return {
    method: 'POST',
    query: {},
    headers: {
      'content-type': 'application/json',
      'x-cron-secret': process.env.CRON_SECRET || ''
    },
    body: {
      cohort_id: cohortId,
      triggered_by_tool: 'cron'
    }
  };
}

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
  const nextAttempts = (job.attempts || 0) + 1;

  // queued → in_progress with attempts incremented. Single
  // statement covers the watchdog: stale rows still in_progress
  // past the cutoff get re-queued by the watchdog block, with
  // attempts incremented again.
  //
  // If this UPDATE fails the worker cannot reliably track the
  // job — abort processing before firing the refresh handler so
  // we don't run a refresh whose completion state we can't
  // record. The row stays in its current state (typically still
  // queued) and the next worker tick re-attempts the claim.
  const claimRes = await supabase
    .from('srl_cron_jobs')
    .update({
      status: 'in_progress',
      started_at: startedAt,
      attempts: nextAttempts
    })
    .eq('id', job.id);
  if (claimRes.error) {
    console.error('[srl-worker] Claim UPDATE failed — job:', job.id, 'cohort_id:', job.cohort_id, 'message:', claimRes.error.message);
    return { jobId: job.id, outcome: 'claim_failed' };
  }

  try {
    const mockReq = buildMockReq(job.cohort_id);
    const mock = buildMockRes();

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
    const handlerOutcome = result.outcome || null;

    // shared-research-refresh response shape (Addendum §7.3):
    //   - 200 with outcome ∈ {success, no_results}
    //   - 422 with outcome=validation_failed (refresh row written)
    //   - 500 with outcome=error
    // For job-state purposes, success/no_results/validation_failed
    // are all "the refresh ran its pipeline and recorded an outcome"
    // — that is completion, not retryable failure.
    const isHandlerError = statusCode === 500 || handlerOutcome === 'error' || (statusCode >= 400 && statusCode !== 422);
    if (isHandlerError) {
      const errText = (result && result.error) || ('Handler returned ' + statusCode);
      throw new Error(errText);
    }

    const completeRes = await supabase
      .from('srl_cron_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        outcome: handlerOutcome
      })
      .eq('id', job.id);
    if (completeRes.error) {
      // Refresh already succeeded; the row stays in_progress.
      // The watchdog requeues stale in_progress rows after
      // WATCHDOG_STALE_MINUTES — that would trigger a double
      // refresh, not data loss. Log and continue.
      console.error('[srl-worker] Completion UPDATE failed — job:', job.id, 'cohort_id:', job.cohort_id, 'message:', completeRes.error.message);
    }

    // Step E — update cohorts metadata on successful refresh.
    // member_count is the current count of profiles in this cohort,
    // queried fresh so the column reflects state at refresh time.
    // Errors here don't fail the job — the refresh itself succeeded;
    // operational metadata staleness is preferable to losing the
    // refresh result. Logged for visibility.
    try {
      const countRes = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('cohort_id', job.cohort_id);
      const memberCount = countRes.count != null ? countRes.count : null;
      const cohortUpd = await supabase
        .from('cohorts')
        .update({
          last_refreshed_at: new Date().toISOString(),
          member_count_at_last_refresh: memberCount
        })
        .eq('cohort_id', job.cohort_id);
      if (cohortUpd.error) {
        console.error('[srl-worker] Cohorts update error — cohort_id:', job.cohort_id, 'message:', cohortUpd.error.message);
      }
    } catch (e) {
      console.error('[srl-worker] Cohorts update exception — cohort_id:', job.cohort_id, 'message:', e && e.message);
    }

    console.log('[srl-worker] Job', job.id, 'completed — cohort_id:', job.cohort_id, 'outcome:', handlerOutcome);
    return { jobId: job.id, outcome: 'completed' };

  } catch (err) {
    const errorMsg = (err && err.message) || 'Unknown error';
    if (nextAttempts <= MAX_RETRIES) {
      const requeueRes = await supabase
        .from('srl_cron_jobs')
        .update({ status: 'queued' })
        .eq('id', job.id);
      if (requeueRes.error) {
        // Row stays in_progress; watchdog will eventually requeue.
        console.error('[srl-worker] Requeue UPDATE failed — job:', job.id, 'cohort_id:', job.cohort_id, 'message:', requeueRes.error.message);
      }
      console.log('[srl-worker] Job', job.id, 'requeued — attempt:', nextAttempts, '/', MAX_RETRIES + 1, '— error:', errorMsg);
      return { jobId: job.id, outcome: 'retrying' };
    }
    const failRes = await supabase
      .from('srl_cron_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        outcome: 'error'
      })
      .eq('id', job.id);
    if (failRes.error) {
      // Row stays in_progress; watchdog will eventually flip to
      // failed via its own attempts-exhausted path.
      console.error('[srl-worker] Failed UPDATE error — job:', job.id, 'cohort_id:', job.cohort_id, 'message:', failRes.error.message);
    }
    console.log('[srl-worker] Job', job.id, 'failed — attempts exhausted — error:', errorMsg);
    return { jobId: job.id, outcome: 'failed' };
  }
}

async function runHousekeeping(supabase) {
  // Section 5.2 Step F. Two deletes:
  //   1. shared_research rows older than 7 days (rollback safety
  //      window; older history is not retained).
  //   2. shared_research rows belonging to is_active = false cohorts.
  // Both queries are idempotent — running them on every idle tick
  // is correct behaviour, not a problem.
  let oldDeleted = 0;
  let inactiveDeleted = 0;

  try {
    const cutoff = new Date(Date.now() - HOUSEKEEPING_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const oldRes = await supabase
      .from('shared_research')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);
    if (oldRes.error) {
      console.error('[srl-worker] Housekeeping (>7 days) error:', oldRes.error.message);
    } else {
      oldDeleted = oldRes.count || 0;
    }

    const inactiveRes = await supabase
      .from('cohorts')
      .select('cohort_id')
      .eq('is_active', false);
    if (inactiveRes.error) {
      console.error('[srl-worker] Housekeeping inactive-cohorts read error:', inactiveRes.error.message);
    } else {
      const ids = (inactiveRes.data || []).map((r) => r.cohort_id);
      if (ids.length > 0) {
        const delRes = await supabase
          .from('shared_research')
          .delete({ count: 'exact' })
          .in('cohort_id', ids);
        if (delRes.error) {
          console.error('[srl-worker] Housekeeping inactive-cohorts delete error:', delRes.error.message);
        } else {
          inactiveDeleted = delRes.count || 0;
        }
      }
    }
  } catch (e) {
    console.error('[srl-worker] Housekeeping exception:', e && e.message);
  }

  return { old_deleted: oldDeleted, inactive_deleted: inactiveDeleted };
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── CRON_SECRET auth ─────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'] || '';
  if (!cronSecret || authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // ── Watchdog — requeue stuck in_progress jobs ─────────────────
    // A row stuck in_progress past WATCHDOG_STALE_MINUTES means the
    // worker that claimed it crashed before completion. Requeue so
    // the next tick can re-process; bump attempts so a permanently
    // failing job eventually flips to 'failed' instead of looping.
    const staleCutoff = new Date(Date.now() - WATCHDOG_STALE_MINUTES * 60 * 1000).toISOString();
    const staleRes = await supabase
      .from('srl_cron_jobs')
      .select('id, attempts')
      .eq('status', 'in_progress')
      .lt('started_at', staleCutoff);
    if (!staleRes.error) {
      for (const stale of staleRes.data || []) {
        const nextAttempts = (stale.attempts || 0) + 1;
        if (nextAttempts > MAX_RETRIES + 1) {
          const failRes = await supabase
            .from('srl_cron_jobs')
            .update({ status: 'failed', completed_at: new Date().toISOString(), outcome: 'error' })
            .eq('id', stale.id);
          if (failRes.error) {
            // Best-effort cleanup; row stays in_progress and the next
            // watchdog tick catches it again. Log and continue the loop.
            console.error('[srl-worker] Watchdog fail UPDATE error — job:', stale.id, 'message:', failRes.error.message);
          }
        } else {
          const requeueRes = await supabase
            .from('srl_cron_jobs')
            .update({ status: 'queued', attempts: nextAttempts })
            .eq('id', stale.id);
          if (requeueRes.error) {
            // Same shape — next watchdog tick retries.
            console.error('[srl-worker] Watchdog requeue UPDATE error — job:', stale.id, 'message:', requeueRes.error.message);
          }
        }
      }
    }

    // ── Claim up to MAX_CONCURRENT_JOBS queued jobs ──────────────
    // FIFO by enqueued_at so brand-new-cohort enqueues from the BP
    // save endpoint don't starve behind the scheduler's daily wave.
    const queuedRes = await supabase
      .from('srl_cron_jobs')
      .select('id, cohort_id, attempts')
      .eq('status', 'queued')
      .order('enqueued_at', { ascending: true })
      .limit(MAX_CONCURRENT_JOBS);
    if (queuedRes.error) {
      console.error('[srl-worker] Claim error:', queuedRes.error.message);
      return res.status(500).json({ error: 'Failed to claim jobs' });
    }
    const jobs = queuedRes.data || [];

    // No work — run housekeeping if the queue is fully drained.
    // The "fully drained" check covers the case where another
    // worker tick is currently processing the last queued row;
    // we don't want to delete data while a refresh is mid-write.
    if (jobs.length === 0) {
      const remainingRes = await supabase
        .from('srl_cron_jobs')
        .select('id')
        .in('status', ['queued', 'in_progress'])
        .limit(1);
      const queueEmpty = !remainingRes.error && (remainingRes.data || []).length === 0;
      let housekeeping = null;
      if (queueEmpty) housekeeping = await runHousekeeping(supabase);
      return res.status(200).json({
        success: true,
        processed: 0,
        housekeeping: housekeeping
      });
    }

    // Process claimed jobs. With MAX_CONCURRENT_JOBS = 1 the
    // Promise.all is academic, but the shape is in place for when
    // dry-run observations support raising the cap.
    const results = await Promise.all(jobs.map((j) => processJob(supabase, j)));

    const summary = results.reduce((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] || 0) + 1;
      return acc;
    }, {});

    console.log('[srl-worker] Tick complete — processed:', results.length, 'summary:', JSON.stringify(summary));
    return res.status(200).json({
      success: true,
      processed: results.length,
      summary: summary
    });

  } catch (err) {
    console.error('[srl-worker] Fatal error:', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
}
