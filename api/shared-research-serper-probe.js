// api/shared-research-serper-probe.js
//
// ⚠️  TEMPORARY DIAGNOSTIC — DELETE AFTER INVESTIGATION
//
// Purpose: isolate Serper response time from anything our pipeline
// does around it, by firing a small set of direct Serper calls from
// the same Vercel function environment that runs the real refresh.
//
// Usage from the browser DevTools console (test user must be logged in):
//
//   const { data: { session } } = await window.supabase.auth.getSession();
//   const r = await fetch('/api/shared-research-serper-probe?n=8', {
//     method: 'POST',
//     headers: {
//       'Authorization': `Bearer ${session.access_token}`,
//       'Content-Type': 'application/json'
//     }
//   });
//   console.log(await r.json());
//
// Response includes:
//   - per_call: array of { i, query, duration_ms, status, ok }
//   - summary: { count, min_ms, max_ms, median_ms, mean_ms, sum_ms }
//
// The fixed test query set is intentionally generic (not industry-
// or region-specific) so the probe is comparable across days
// regardless of test user state. Cache is bypassed entirely — these
// calls go straight to Serper.
//
// Concurrency mirrors the real pipeline (4 lanes, 250ms minimum gap)
// so the probe's distribution is directly comparable to
// serper_sum_ms / cache_call_queue_wait_sum_ms in a real refresh.
// Delete this file once the investigation is closed out.

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SERPER_NEWS_ENDPOINT = 'https://google.serper.dev/news';
const SERPER_NUM = 8;
const MAX_N = 16;

const PROBE_QUERIES = [
  'small business regulation Australia',
  'ATO update small business',
  'Fair Work changes Australia',
  'Reserve Bank interest rates',
  'Australia inflation small business',
  'Australian materials prices construction',
  'small business technology adoption Australia',
  'industry association Australia',
  'compliance deadlines Australia SME',
  'small business news Australia',
  'building industry Australia',
  'landscape industry Australia',
  'NSW small business',
  'state revenue Australia small business',
  'supply chain Australia',
  'AI adoption small business Australia'
];

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOneSerperCall(query) {
  const t0 = Date.now();
  let status = 0;
  let ok = false;
  try {
    const resp = await fetch(SERPER_NEWS_ENDPOINT, {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'au', hl: 'en', num: SERPER_NUM })
    });
    status = resp.status;
    ok = resp.ok;
    // Read body so the timing reflects the full round-trip the real
    // pipeline pays, not just headers.
    await resp.text();
  } catch (e) {
    status = 0;
    ok = false;
  }
  return { duration_ms: Date.now() - t0, status, ok };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SERPER_API_KEY) return res.status(500).json({ error: 'SERPER_API_KEY missing' });

  // Auth — same JWT shape as the real endpoint so the probe can't be
  // run anonymously even though it's not user-scoped.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  const requestedN = parseInt((req.query && req.query.n) || '8', 10);
  const n = Math.max(1, Math.min(MAX_N, isNaN(requestedN) ? 8 : requestedN));
  const queries = PROBE_QUERIES.slice(0, n);

  // Mirror the real pipeline: 4 parallel lanes, 250ms minimum dispatch
  // gap. Each lane pulls from a shared cursor; the gap applies to the
  // moment the lane starts a new Serper call so concurrent retries
  // can't burst above the documented rate ceiling.
  const SERPER_MAX_PARALLEL = 4;
  const SERPER_DISPATCH_GAP_MS = 250;

  let nextSlot = Date.now();
  let queueWaitSumMs = 0;
  async function gateAcquire() {
    const now = Date.now();
    const waitMs = Math.max(0, nextSlot - now);
    nextSlot = Math.max(nextSlot, now) + SERPER_DISPATCH_GAP_MS;
    if (waitMs > 0) {
      await sleep(waitMs);
      queueWaitSumMs += waitMs;
    }
    return waitMs;
  }

  const perCall = new Array(queries.length);
  let cursor = 0;
  const tWallStart = Date.now();

  async function lane() {
    while (true) {
      const i = cursor++;
      if (i >= queries.length) return;
      const waitMs = await gateAcquire();
      const result = await runOneSerperCall(queries[i]);
      perCall[i] = {
        i,
        query: queries[i],
        queue_wait_ms: waitMs,
        duration_ms: result.duration_ms,
        status: result.status,
        ok: result.ok
      };
    }
  }

  const lanes = Math.min(SERPER_MAX_PARALLEL, queries.length);
  await Promise.all(Array.from({ length: lanes }, () => lane()));
  const wallMs = Date.now() - tWallStart;

  const durations = perCall.map((c) => c.duration_ms).slice().sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);
  const median = durations.length
    ? (durations.length % 2 === 1
        ? durations[(durations.length - 1) / 2]
        : Math.round((durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2))
    : 0;

  return res.status(200).json({
    success: true,
    note: 'TEMPORARY DIAGNOSTIC — delete api/shared-research-serper-probe.js after investigation',
    n: queries.length,
    parallel: lanes,
    gap_ms: SERPER_DISPATCH_GAP_MS,
    per_call: perCall,
    summary: {
      count: durations.length,
      min_ms: durations[0] || 0,
      max_ms: durations[durations.length - 1] || 0,
      median_ms: median,
      mean_ms: durations.length ? Math.round(sum / durations.length) : 0,
      sum_ms: sum,
      queue_wait_sum_ms: queueWaitSumMs,
      wall_ms: wallMs
    }
  });
}
