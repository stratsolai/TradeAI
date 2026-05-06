// lib/external-api-cache.js — shared cache + concurrency + 429 retry
//
// Mirrors the inline pattern from api/xero-fetch.js, packaged as
// reusable primitives so each provider integration (QuickBooks,
// ServiceM8, Fergus, ...) does not re-implement the same plumbing.
// xero-fetch keeps its inline implementation for now — this module
// is for the providers added after it.
//
// Per-provider cache table: cl_<provider>_cache with columns
//   user_id, <scope_key>, action, data jsonb, cached_at, expires_at
// and a unique index on (user_id, <scope_key>, action). RLS allows
// only the user to read their own rows; the service-role client used
// in fetch endpoints bypasses RLS for writes.

const SEMAPHORES = Object.create(null);
const INFLIGHT = new Map();
const FALLBACK_RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// Per-scope semaphore (typically scoped to tenant / realm / account).
// Caps concurrent slots within a single warm Vercel instance — best
// effort across the function cluster.
export function acquireSlot(scope, max) {
  var sem = SEMAPHORES[scope];
  if (!sem) sem = SEMAPHORES[scope] = { active: 0, queue: [] };
  if (sem.active < max) { sem.active++; return Promise.resolve(); }
  return new Promise(function (resolve) {
    sem.queue.push(function () { sem.active++; resolve(); });
  });
}

export function releaseSlot(scope) {
  var sem = SEMAPHORES[scope];
  if (!sem) return;
  sem.active = Math.max(0, sem.active - 1);
  if (sem.queue.length > 0) sem.queue.shift()();
}

// Wraps a fetch-returning function with 429 retry honouring the
// Retry-After header. Caller handles 401/auth refresh and error
// parsing — this only deals with rate-limit backoff.
export async function fetchWithRetry(fetchFn, opts) {
  opts = opts || {};
  var maxRetries = typeof opts.maxRetries === 'number' ? opts.maxRetries : 2;
  var providerLabel = opts.providerLabel || 'API';
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    var resp = await fetchFn();
    if (resp && resp.status === 429) {
      if (attempt >= maxRetries) {
        throw new Error(providerLabel + ' error: 429 Too Many Requests (retries exhausted)');
      }
      var retryAfter = (resp.headers && resp.headers.get && resp.headers.get('Retry-After')) || null;
      var waitMs = FALLBACK_RETRY_DELAY_MS;
      if (retryAfter) {
        var n = parseInt(retryAfter, 10);
        if (!isNaN(n) && n > 0) waitMs = n * 1000;
      }
      console.warn('[external-api] 429 received — waiting ' + waitMs + 'ms', { provider: providerLabel, attempt: attempt + 1 });
      await sleep(waitMs);
      continue;
    }
    return resp;
  }
}

// Look up a cached row. Returns the data payload if a fresh row
// exists, otherwise null. keyColumns is the {col: value} map used
// for both SELECT and (later) UPSERT.
export async function readCache(supabase, tableName, keyColumns) {
  try {
    var query = supabase.from(tableName).select('data, expires_at');
    Object.keys(keyColumns).forEach(function (col) {
      query = query.eq(col, keyColumns[col]);
    });
    var res = await query.maybeSingle();
    if (res.data && res.data.expires_at && res.data.expires_at > new Date().toISOString()) {
      return res.data.data;
    }
  } catch (e) {
    console.error('[external-api] cache read error:', tableName, e && e.message);
  }
  return null;
}

// Upsert a cache row keyed on the given columns. Failures are logged
// only — they never break the response since the caller already has
// the data in hand.
export async function writeCache(supabase, tableName, keyColumns, data, ttlMs) {
  try {
    var row = Object.assign({}, keyColumns, {
      data: data,
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    });
    var conflictCols = Object.keys(keyColumns).join(',');
    await supabase.from(tableName).upsert(row, { onConflict: conflictCols });
  } catch (e) {
    console.error('[external-api] cache write error:', tableName, e && e.message);
  }
}

// Build a stable in-flight Map key from the table + columns. Sorts
// keys so the same logical request from two callers always produces
// the same key regardless of column order.
export function inflightKey(tableName, keyColumns) {
  var parts = Object.keys(keyColumns).sort().map(function (k) {
    return k + '=' + keyColumns[k];
  });
  return tableName + ':' + parts.join(';');
}

export function getInflight(key) { return INFLIGHT.get(key); }
export function setInflight(key, promise) { INFLIGHT.set(key, promise); }
export function deleteInflight(key) { INFLIGHT.delete(key); }
