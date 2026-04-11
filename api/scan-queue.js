// api/scan-queue.js — Task 15 Step 1
// Queue endpoint for background scan processing. Accepts a POST with
// scan parameters, inserts a row into cl_scan_jobs with status = queued,
// then fires a non-blocking call to api/scan-worker.js to begin
// processing immediately. Returns the job id to the caller.
//
// Auth: JWT Bearer token required (same pattern as drive-import.js,
// onedrive-import.js, sharepoint-import.js, dropbox-import.js).
//
// Request body:
//   sourceType    — required, one of: gmail, outlook, gdrive, onedrive,
//                   sharepoint, dropbox, website
//   sourceAccount — required, the account email or URL being scanned
//   sourcePath    — optional, folder/library/site id or path
//
// Response: { success: true, jobId: <uuid> }

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

var VALID_SOURCE_TYPES = ['gmail', 'outlook', 'gdrive', 'onedrive', 'sharepoint', 'dropbox', 'website'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── JWT auth (required) ──────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authRes = await supabase.auth.getUser(token);
  if (authRes.error || !authRes.data || !authRes.data.user) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  const userId = authRes.data.user.id;

  const body = req.body || {};
  const sourceType = body.sourceType;
  const sourceAccount = body.sourceAccount;
  const sourcePath = body.sourcePath || null;

  // ── Validate request ────────────────────────────────────────────────
  if (!sourceType) return res.status(400).json({ error: 'sourceType required' });
  if (VALID_SOURCE_TYPES.indexOf(sourceType) === -1) {
    return res.status(400).json({ error: 'Invalid sourceType: ' + sourceType });
  }
  if (!sourceAccount) return res.status(400).json({ error: 'sourceAccount required' });

  try {
    // ── Insert queued job ───────────────────────────────────────────────
    var jobRow = {
      user_id: userId,
      source_type: sourceType,
      source_account: sourceAccount,
      source_path: sourcePath,
      status: 'queued',
      priority: 1,
      retry_count: 0,
    };

    var insertResult = await supabase
      .from('cl_scan_jobs')
      .insert(jobRow)
      .select('id')
      .single();

    if (insertResult.error) {
      console.error('[scan-queue] Insert error:', insertResult.error.message);
      return res.status(500).json({ error: 'Failed to queue scan job: ' + insertResult.error.message });
    }

    var jobId = insertResult.data.id;
    console.log('[scan-queue] Job queued — id:', jobId, 'sourceType:', sourceType, 'sourceAccount:', sourceAccount, 'sourcePath:', sourcePath);

    // ── Trigger scan-worker before returning ─────────────────────────
    // The fetch must be awaited so the HTTP request is fully dispatched
    // before Vercel freezes this function's runtime. Without the await,
    // the runtime is torn down after res.json() and the fetch is
    // silently dropped — jobs then sit in queued state until the next
    // cron tick. We do not wait for the scan itself to finish — just for
    // the worker to accept the request.
    var workerHost = process.env.VERCEL_URL
      ? 'https://' + process.env.VERCEL_URL
      : 'https://' + (req.headers['host'] || 'staxai.com.au');
    var workerUrl = workerHost + '/api/scan-worker';

    try {
      await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (process.env.CRON_SECRET || '') },
        body: JSON.stringify({ triggerSource: 'scan-queue', jobId: jobId }),
      });
    } catch (triggerErr) {
      // Worker trigger failed — job will be picked up by the next cron
      // tick. Log but do not fail the queue response.
      console.error('[scan-queue] Worker trigger failed:', triggerErr.message);
    }

    return res.status(200).json({ success: true, jobId: jobId });

  } catch (err) {
    console.error('[scan-queue] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
