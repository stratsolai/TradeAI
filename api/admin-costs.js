import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Module-scope cache. Vercel reuses the same lambda instance across
// invocations until it cold-starts; that gives us "5 min" cache for
// most page loads, with a fresh fetch on cold start.
const CACHE_TTL_MS = 5 * 60 * 1000;
let _cache = { data: null, fetchedAt: 0 };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    if (_cache.data && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
      return res.status(200).json(Object.assign({}, _cache.data, { from_cache: true }));
    }

    const periods = monthBoundaries(new Date());

    const [anthropic, vercel, serper] = await Promise.all([
      fetchAnthropicCosts(periods).catch(function(e) {
        console.error('[admin-costs] anthropic error:', e && e.message);
        return { error: e && e.message ? e.message : String(e), current_month: null, previous_month: null, trend_percent: null };
      }),
      fetchVercelCosts(periods).catch(function(e) {
        console.error('[admin-costs] vercel error:', e && e.message);
        return { error: e && e.message ? e.message : String(e), current_month: null, previous_month: null, trend_percent: null };
      }),
      fetchSerperCosts(periods).catch(function(e) {
        console.error('[admin-costs] serper error:', e && e.message);
        return { error: e && e.message ? e.message : String(e), current_month: null, previous_month: null, trend_percent: null };
      })
    ]);

    const totals = computeTotals(anthropic, vercel, serper);

    const payload = {
      anthropic: anthropic,
      vercel: vercel,
      serper: serper,
      totals: totals,
      periods: {
        current_month: periods.currentLabel,
        previous_month: periods.previousLabel
      },
      cached_at: new Date().toISOString(),
      from_cache: false
    };

    _cache = { data: payload, fetchedAt: Date.now() };
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[admin-costs] error:', err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : 'Could not load costs' });
  }
}

// ── Anthropic ────────────────────────────────────────────────────
// Admin API base: https://api.anthropic.com
// Cost report: GET /v1/organizations/cost_report?starting_at=ISO&ending_at=ISO
// Auth: x-api-key + anthropic-version
async function fetchAnthropicCosts(periods) {
  const key = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!key) {
    return {
      error: 'ANTHROPIC_ADMIN_API_KEY env var not configured',
      current_month: null,
      previous_month: null,
      trend_percent: null
    };
  }

  console.log('[admin-costs] Anthropic period inputs:', {
    startCurrentISO: periods.startCurrentISO,
    endCurrentISO: periods.endCurrentISO,
    startPrevISO: periods.startPrevISO,
    endPrevISO: periods.endPrevISO
  });

  // For the current month we omit ending_at — Anthropic defaults it
  // to "now" and that bypasses the date-range validation that has
  // been rejecting May 1 → May 2 with "ending date must be after
  // starting date" (their parser appears to read the explicit ending
  // as an exclusive boundary that collapses the effective range to a
  // single day equal to start). For the previous month we still send
  // both bounds because the range is unambiguously past.
  const [currentTotal, currentBreakdown] = await Promise.all([
    anthropicCostSum(key, periods.startCurrentISO, null),
    anthropicCostByModel(key, periods.startCurrentISO, null)
  ]);
  const previousTotal = await anthropicCostSum(key, periods.startPrevISO, periods.endPrevISO);

  const trend = trendPercent(currentTotal, previousTotal);

  return {
    current_month: {
      cost_usd: round2(currentTotal),
      breakdown_by_model: currentBreakdown
    },
    previous_month: {
      cost_usd: round2(previousTotal)
    },
    trend_percent: trend
  };
}

// Anthropic cost_report's error message ("Invalid date range: ending
// date must be after starting date") uses "date" not "datetime" — the
// parser is treating the values as dates. Full ISO timestamps with
// .000Z fractional seconds get accepted by some Anthropic endpoints
// but were observed to fail validation here. Strip to YYYY-MM-DD.
function isoToDateOnly(iso) {
  return iso ? String(iso).slice(0, 10) : '';
}

async function anthropicCostSum(key, startIso, endIso) {
  // bucket_width=1d pins the per-day bucketing on the wire. Date-only
  // params keep the request unambiguously a date range rather than a
  // timestamp range. ending_at is optional — when null we skip it and
  // let Anthropic default to "now".
  let url = 'https://api.anthropic.com/v1/organizations/cost_report'
    + '?starting_at=' + encodeURIComponent(isoToDateOnly(startIso));
  if (endIso) url += '&ending_at=' + encodeURIComponent(isoToDateOnly(endIso));
  url += '&bucket_width=1d';
  console.log('[admin-costs] Anthropic cost_report (sum) →', url);
  const r = await fetch(url, {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    }
  });
  if (!r.ok) {
    const text = await r.text().catch(function() { return ''; });
    console.error('[admin-costs] Anthropic cost_report (sum) failed:', r.status, text.slice(0, 300));
    throw new Error('Anthropic cost_report ' + r.status + ': ' + text.slice(0, 200));
  }
  const j = await r.json();
  // Schema is paginated buckets — sum every "amount" field we can find
  // across the response, falling back to total fields if present.
  return sumAmountsFromAnthropic(j);
}

async function anthropicCostByModel(key, startIso, endIso) {
  let url = 'https://api.anthropic.com/v1/organizations/cost_report'
    + '?starting_at=' + encodeURIComponent(isoToDateOnly(startIso));
  if (endIso) url += '&ending_at=' + encodeURIComponent(isoToDateOnly(endIso));
  url += '&bucket_width=1d&group_by[]=model';
  console.log('[admin-costs] Anthropic cost_report (by model) →', url);
  const r = await fetch(url, {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
  });
  if (!r.ok) return {};
  const j = await r.json();
  // Walk grouped results — best-effort given API shape variation.
  const byModel = {};
  const buckets = (j && (j.data || j.buckets || [])) || [];
  buckets.forEach(function(b) {
    const results = (b && (b.results || b.data || [])) || [];
    results.forEach(function(row) {
      const model = (row && row.context && row.context.model) || (row && row.model) || 'unknown';
      const amt = parseAmount(row && row.amount);
      if (amt > 0) byModel[model] = round2((byModel[model] || 0) + amt);
    });
  });
  return byModel;
}

function sumAmountsFromAnthropic(j) {
  if (!j) return 0;
  let total = 0;
  // Common Atlassian-ish paginated shape: { data: [{ results: [...] }, ...] }
  const buckets = (j.data || j.buckets || []);
  buckets.forEach(function(b) {
    const results = (b && (b.results || b.data || [])) || [];
    results.forEach(function(row) { total += parseAmount(row && row.amount); });
  });
  // Some APIs put a top-level total
  if (total === 0 && j.total != null) total = parseAmount(j.total);
  return total;
}

function parseAmount(a) {
  if (a == null) return 0;
  if (typeof a === 'number') return a;
  if (typeof a === 'string') return parseFloat(a) || 0;
  if (typeof a === 'object') {
    if (a.amount != null) {
      const v = typeof a.amount === 'string' ? parseFloat(a.amount) : a.amount;
      return typeof v === 'number' && !isNaN(v) ? v : 0;
    }
    if (a.value != null) return parseAmount(a.value);
  }
  return 0;
}

// ── Vercel ───────────────────────────────────────────────────────
// Vercel does not publish a public billing-as-dollars REST endpoint.
// /v1/billing/charges (which the original automation spec named)
// returns 404 "Costs not found" against Pro plans on personal
// accounts. Until Vercel exposes one, surface a "manual" indicator
// linking to the dashboard — same pattern Stripe uses for status.
//
// If Vercel ever publishes the endpoint, replace this body with the
// real fetch (token via VERCEL_API_TOKEN, optional teamId via
// VERCEL_TEAM_ID, parse via the parseVercelBody helper below which
// is preserved for that future).
async function fetchVercelCosts(periods) {
  return {
    manual: true,
    page_url: 'https://vercel.com/dashboard/usage',
    current_month: null,
    previous_month: null,
    trend_percent: null
  };
}

async function vercelChargesSum(token, startIso, endIso, teamQuery) {
  const url = 'https://api.vercel.com/v1/billing/charges'
    + '?from=' + encodeURIComponent(startIso)
    + '&to=' + encodeURIComponent(endIso)
    + teamQuery;
  const r = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const text = await r.text().catch(function() { return ''; });
  if (!r.ok) {
    throw new Error('Vercel billing/charges ' + r.status + ': ' + text.slice(0, 200));
  }
  // Read body as text first so we can log it, then try a sequence of
  // parse strategies. The original .json() call threw "Unexpected
  // non-whitespace character after JSON at position 438", which means
  // the body is not a single JSON object — most likely NDJSON, or one
  // JSON object followed by trailing data.
  console.log('[admin-costs] Vercel raw response (first 500 chars):', text.slice(0, 500));
  const parsed = parseVercelBody(text);
  return sumVercelCharges(parsed);
}

function parseVercelBody(text) {
  if (!text) return {};
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed) return {};

  // Try plain JSON first.
  try {
    return JSON.parse(trimmed);
  } catch (e1) {
    // fall through to NDJSON
  }

  // Try NDJSON — one JSON object per line. Combine into { items: [...] }
  // so sumVercelCharges' existing j.items / j.charges / j.data path
  // picks them up.
  const lines = trimmed.split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (lines.length > 1) {
    const items = [];
    let allOk = true;
    for (let i = 0; i < lines.length; i++) {
      try { items.push(JSON.parse(lines[i])); }
      catch (e2) { allOk = false; break; }
    }
    if (allOk && items.length > 0) {
      console.log('[admin-costs] Vercel response parsed as NDJSON,', items.length, 'lines');
      return { items: items };
    }
  }

  // Last-ditch — extract just the first complete JSON object/array.
  const m = trimmed.match(/^(\{[\s\S]*?\}|\[[\s\S]*?\])/);
  if (m) {
    try {
      const obj = JSON.parse(m[1]);
      console.log('[admin-costs] Vercel response parsed as first JSON object only; ignoring trailing', trimmed.length - m[1].length, 'chars');
      return obj;
    } catch (e3) {
      // give up
    }
  }

  console.error('[admin-costs] Vercel body is not valid JSON or NDJSON. First 500 chars:', trimmed.slice(0, 500));
  throw new Error('Vercel response is not valid JSON: ' + trimmed.slice(0, 200));
}

function sumVercelCharges(j) {
  let total = 0;
  const breakdown = {};
  const items = (j && (j.charges || j.data || j.items || [])) || [];
  items.forEach(function(c) {
    const amt = parseAmount(c && (c.amount || c.cost || c.total));
    total += amt;
    const cat = (c && (c.resource || c.type || c.product)) || 'other';
    breakdown[cat] = round2((breakdown[cat] || 0) + amt);
  });
  // Fallback to top-level total
  if (total === 0 && j && j.total != null) total = parseAmount(j.total);
  return { total: total, breakdown: breakdown };
}

// ── Serper (internal tracking from api_usage) ────────────────────
async function fetchSerperCosts(periods) {
  const [current, previous] = await Promise.all([
    serperPeriodTotals(periods.currentLabel),
    serperPeriodTotals(periods.previousLabel)
  ]);
  return {
    current_month: current,
    previous_month: previous,
    trend_percent: trendPercent(current.cost_usd || 0, previous.cost_usd || 0)
  };
}

async function serperPeriodTotals(periodLabel) {
  const r = await supabase
    .from('api_usage')
    .select('usage_value, cost_estimate')
    .eq('provider', 'serper')
    .eq('period', periodLabel);
  if (r.error) {
    return { searches: 0, cost_usd: 0, error: r.error.message };
  }
  const rows = r.data || [];
  let searches = 0;
  let cost = 0;
  rows.forEach(function(row) {
    const n = parseInt(row.usage_value, 10);
    if (!isNaN(n)) searches += n;
    if (typeof row.cost_estimate === 'number') cost += row.cost_estimate;
    else if (typeof row.cost_estimate === 'string') {
      const v = parseFloat(row.cost_estimate);
      if (!isNaN(v)) cost += v;
    }
  });
  return { searches: searches, cost_usd: round2(cost) };
}

// ── Aggregation ──────────────────────────────────────────────────
function computeTotals(anthropic, vercel, serper) {
  function curr(x) {
    return x && x.current_month && typeof x.current_month.cost_usd === 'number' ? x.current_month.cost_usd : 0;
  }
  function prev(x) {
    return x && x.previous_month && typeof x.previous_month.cost_usd === 'number' ? x.previous_month.cost_usd : 0;
  }
  const totalCurrent = curr(anthropic) + curr(vercel) + curr(serper);
  const totalPrevious = prev(anthropic) + prev(vercel) + prev(serper);
  return {
    current_month_usd: round2(totalCurrent),
    previous_month_usd: round2(totalPrevious),
    trend_percent: trendPercent(totalCurrent, totalPrevious)
  };
}

function trendPercent(current, previous) {
  if (!previous || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return Math.round(pct * 10) / 10;
}

function round2(n) {
  if (typeof n !== 'number' || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

// Calendar month boundaries — current month-to-date and full previous
// month. Returns ISO strings (UTC) plus YYYY-MM labels for matching
// the api_usage period column.
//
// Anthropic's cost_report rejects "same-day" ranges with "ending date
// must be after starting date" — it compares on day boundaries, not
// timestamps. So when today is the 1st of the month, startCurrent
// (1st 00:00 UTC) and endCurrent (1st now) sit on the same day and
// the API errors. Use start-of-tomorrow UTC as the exclusive upper
// bound — guarantees the range is always at least one day wide and
// today's spend is still included. Apply the same exclusive-end
// convention to the previous-month range (start-of-current-month
// rather than last-millisecond-of-previous-month).
function monthBoundaries(now) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const startCurrent = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const endCurrent = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));
  const startPrev = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endPrev = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  function label(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
  return {
    startCurrentISO: startCurrent.toISOString(),
    endCurrentISO: endCurrent.toISOString(),
    startPrevISO: startPrev.toISOString(),
    endPrevISO: endPrev.toISOString(),
    currentLabel: label(startCurrent),
    previousLabel: label(startPrev)
  };
}

// ── Auth ─────────────────────────────────────────────────────────
async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return { ok: false, status: 401, error: 'No token provided' };
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { ok: false, status: 401, error: 'Invalid token' };
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (profErr || !profile || !profile.is_admin) {
    return { ok: false, status: 403, error: 'Admin access required' };
  }
  return { ok: true, user: user };
}
