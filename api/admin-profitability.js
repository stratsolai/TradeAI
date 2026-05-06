// api/admin-profitability.js — Profitability Dashboard data source
//
// Reads aggregated cost attribution from api_usage (per-tool, per-user)
// and crosses it with revenue (Stripe / tool_prices), margin targets
// (margin_targets table) and supplier limits (supplier_limits table)
// to produce the Profitability & Costs section on the Dashboard
// Overview tab.
//
// Auth: JWT Bearer + is_admin check (same pattern as the other
// admin-* endpoints). Cached server-side for 5 minutes.

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { ensureVercelBaseCost } from '../lib/supplier-usage.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

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

    // Ensure flat-fee suppliers have a current-period api_usage row
    // before we read usage. No-op when the row already exists for
    // this period — the Vercel Pro plan is a known $30 AUD/month
    // baseline (overages would need manual entry until Vercel ships
    // a public billing-usage API).
    await ensureVercelBaseCost(supabase).catch(function (e) {
      console.error('[admin-profitability] vercel base cost write failed:', e && e.message);
    });

    const period = currentPeriod();
    const previousPeriod = priorPeriod(period);

    // Pull every input in parallel — none of these depend on each other.
    const [usage, prevUsage, marginTargets, supplierLimits, profiles, stripeSubs] = await Promise.all([
      fetchUsageForPeriod(period),
      fetchUsageForPeriod(previousPeriod),
      fetchMarginTargets(),
      fetchSupplierLimits(),
      fetchActiveProfiles(),
      fetchStripeSubscriptions().catch(function(e) {
        console.error('[admin-profitability] stripe error:', e && e.message);
        return [];
      })
    ]);

    // Per-tool revenue map (tool_id → MRR for that tool across all
    // active subscriptions). Built from tool_prices + stripeSubs.
    const toolPrices = await fetchToolPrices();
    const toolRevenue = computeToolRevenue(stripeSubs, toolPrices);
    const customerRevenue = computeCustomerRevenue(stripeSubs, toolPrices, profiles);

    const totalRevenue = round2(Object.values(toolRevenue).reduce(function(a, b) { return a + b; }, 0));
    const totalCosts = round2(usage.totalCost);

    const toolMargins = computeToolMargins(toolRevenue, usage.byTool, marginTargets);
    const customerMargins = computeCustomerMargins(customerRevenue, usage.byUser, profiles);

    // Trend: 6-month rolling margin %, overall + per-tool. Cheap query —
    // single SELECT against api_usage, group client-side.
    const trend = await fetchMarginTrend(period, toolRevenue);

    // Alerts — count tools below their alert_below threshold and
    // customers exceeding 50% of their MRR in usage costs, plus any
    // supplier above its alert_at_percent.
    const alerts = computeAlerts(toolMargins, customerMargins, supplierLimits, usage);

    const payload = {
      period: period,
      summary: {
        total_revenue: totalRevenue,
        total_costs: totalCosts,
        overall_margin_percent: marginPercent(totalRevenue, totalCosts),
        alerts_count: alerts.length
      },
      suppliers: buildSupplierStatus(usage, prevUsage, supplierLimits),
      tools: toolMargins,
      customers: customerMargins,
      trend: trend,
      alerts: alerts,
      cached_at: new Date().toISOString(),
      from_cache: false
    };

    _cache = { data: payload, fetchedAt: Date.now() };
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[admin-profitability] error:', err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : 'Could not load profitability data' });
  }
}

// ── Period helpers ────────────────────────────────────────────────
function currentPeriod() {
  const now = new Date();
  return now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
}

function priorPeriod(period) {
  const parts = period.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const prevDate = new Date(Date.UTC(y, m - 2, 1));
  return prevDate.getUTCFullYear() + '-' + String(prevDate.getUTCMonth() + 1).padStart(2, '0');
}

// ── Data fetchers ─────────────────────────────────────────────────

// Aggregate api_usage rows for a given period into per-tool, per-user
// and per-provider buckets. Fields read: tool_id, user_id, provider,
// cost_estimate, tokens_in, tokens_out, usage_value.
async function fetchUsageForPeriod(period) {
  const r = await supabase
    .from('api_usage')
    .select('provider, tool_id, user_id, cost_estimate, tokens_in, tokens_out, usage_value')
    .eq('period', period);
  if (r.error) {
    console.error('[admin-profitability] api_usage select error:', r.error.message);
    return { rows: [], byTool: {}, byUser: {}, byProvider: {}, totalCost: 0 };
  }
  const rows = r.data || [];
  const byTool = {};
  const byUser = {};
  const byProvider = {};
  let totalCost = 0;
  rows.forEach(function(row) {
    const cost = typeof row.cost_estimate === 'number' ? row.cost_estimate : (row.cost_estimate ? parseFloat(row.cost_estimate) : 0);
    if (!isNaN(cost)) totalCost += cost;
    if (row.tool_id) byTool[row.tool_id] = round2((byTool[row.tool_id] || 0) + cost);
    if (row.user_id) byUser[row.user_id] = round2((byUser[row.user_id] || 0) + cost);
    if (row.provider) {
      const p = byProvider[row.provider] || { cost: 0, tokens_in: 0, tokens_out: 0, usage: 0 };
      p.cost = round2(p.cost + cost);
      p.tokens_in += parseInt(row.tokens_in || 0, 10) || 0;
      p.tokens_out += parseInt(row.tokens_out || 0, 10) || 0;
      const u = parseInt(row.usage_value, 10);
      if (!isNaN(u)) p.usage += u;
      byProvider[row.provider] = p;
    }
  });
  return { rows: rows, byTool: byTool, byUser: byUser, byProvider: byProvider, totalCost: round2(totalCost) };
}

async function fetchMarginTargets() {
  const r = await supabase.from('margin_targets').select('tool_id, target_margin, alert_below');
  if (r.error) {
    console.error('[admin-profitability] margin_targets error:', r.error.message);
    return {};
  }
  const map = {};
  (r.data || []).forEach(function(row) {
    map[row.tool_id] = { target: parseFloat(row.target_margin) || 0, alertBelow: parseFloat(row.alert_below) || 0 };
  });
  return map;
}

async function fetchSupplierLimits() {
  const r = await supabase
    .from('supplier_limits')
    .select('provider, limit_type, limit_value, alert_at_percent, current_usage, updated_at');
  if (r.error) {
    console.error('[admin-profitability] supplier_limits error:', r.error.message);
    return [];
  }
  return r.data || [];
}

// Profiles do not carry email — that lives in auth.users and must be
// merged via supabase.auth.admin.listUsers (same pattern as
// api/admin-customers.js). Without the merge a profiles SELECT that
// names "email" hits "column profiles.email does not exist".
async function fetchActiveProfiles() {
  const r = await supabase
    .from('profiles')
    .select('id, business_name, activated_tools, bundle_tier, is_trial, stripe_customer_id');
  if (r.error) {
    console.error('[admin-profitability] profiles error:', r.error.message);
    return [];
  }
  const rows = r.data || [];
  const emailMap = await fetchEmailMap();
  rows.forEach(function(p) { p.email = emailMap.get(p.id) || ''; });
  return rows;
}

// Build Map<userId, email> from auth.users. Caps at 20k users — same
// safety cap as admin-customers.js.
async function fetchEmailMap() {
  const map = new Map();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const r = await supabase.auth.admin.listUsers({ page: page, perPage: perPage });
    if (r.error) {
      console.error('[admin-profitability] listUsers error:', r.error.message);
      break;
    }
    const users = (r.data && r.data.users) || [];
    users.forEach(function(u) { map.set(u.id, u.email || ''); });
    if (users.length < perPage) break;
    page += 1;
    if (page > 20) break;
  }
  return map;
}

// tool_prices uses `price_id` (matches the Stripe price ID), not
// `stripe_price_id`. Cross-reference get-prices.js, admin-overview.js
// and stripe-webhook.js — all use price_id.
async function fetchToolPrices() {
  const r = await supabase
    .from('tool_prices')
    .select('price_id, tool_id, bundle_tier, display_price');
  if (r.error) {
    console.error('[admin-profitability] tool_prices error:', r.error.message);
    return [];
  }
  return r.data || [];
}

async function fetchStripeSubscriptions() {
  if (!stripe) return [];
  const out = [];
  // Pagination — capped at 200 items, matching the Vercel/Supabase
  // listing pattern used elsewhere on the platform.
  let starting_after = undefined;
  for (let page = 0; page < 5; page++) {
    const params = { status: 'active', limit: 100, expand: ['data.customer'] };
    if (starting_after) params.starting_after = starting_after;
    const list = await stripe.subscriptions.list(params);
    list.data.forEach(function(sub) { out.push(sub); });
    if (!list.has_more) break;
    starting_after = list.data[list.data.length - 1].id;
  }
  return out;
}

// ── Computation ───────────────────────────────────────────────────

function computeToolRevenue(stripeSubs, toolPrices) {
  // Map stripe price_id → tool_id (only entries with tool_id set —
  // bundle rows are intentionally excluded from per-tool revenue).
  const priceMap = {};
  toolPrices.forEach(function(p) {
    if (p.tool_id) priceMap[p.price_id] = { tool_id: p.tool_id, price: parseFloat(p.display_price) || 0 };
  });

  const byTool = {};
  stripeSubs.forEach(function(sub) {
    (sub.items && sub.items.data || []).forEach(function(item) {
      const map = priceMap[item.price && item.price.id];
      if (!map) return;
      // Use the live Stripe unit_amount (cents → dollars) before
      // falling back to display_price, so price changes flow through
      // without requiring tool_prices to be re-synced.
      const live = item.price && typeof item.price.unit_amount === 'number'
        ? item.price.unit_amount / 100
        : map.price;
      byTool[map.tool_id] = round2((byTool[map.tool_id] || 0) + live);
    });
  });
  return byTool;
}

function computeCustomerRevenue(stripeSubs, toolPrices, profiles) {
  // Stripe customer_id → MRR. Each subscription contributes the sum
  // of its items' unit_amount.
  const byCustomer = {};
  stripeSubs.forEach(function(sub) {
    const cid = (sub.customer && sub.customer.id) || sub.customer;
    if (!cid) return;
    let mrr = 0;
    (sub.items && sub.items.data || []).forEach(function(item) {
      if (item.price && typeof item.price.unit_amount === 'number') {
        mrr += item.price.unit_amount / 100;
      }
    });
    byCustomer[cid] = round2((byCustomer[cid] || 0) + mrr);
  });

  // Map back to profile.id so the customer table joins cleanly.
  const out = {};
  profiles.forEach(function(p) {
    if (p.stripe_customer_id && byCustomer[p.stripe_customer_id] != null) {
      out[p.id] = byCustomer[p.stripe_customer_id];
    }
  });
  return out;
}

function computeToolMargins(toolRevenue, byToolCost, marginTargets) {
  const toolIds = Object.keys(Object.assign({}, toolRevenue, byToolCost));
  // Fall back to a 'default' target row if a tool has no specific row.
  const defaultTarget = marginTargets['default'] || { target: 80, alertBelow: 70 };
  return toolIds.map(function(tool_id) {
    const revenue = round2(toolRevenue[tool_id] || 0);
    const cost = round2(byToolCost[tool_id] || 0);
    const target = marginTargets[tool_id] || defaultTarget;
    const margin = marginPercent(revenue, cost);
    let status = 'green';
    if (margin == null) status = 'grey';
    else if (margin < target.alertBelow) status = 'red';
    else if (margin < target.target) status = 'amber';
    return {
      tool_id: tool_id,
      revenue: revenue,
      cost: cost,
      margin_percent: margin,
      target_percent: target.target,
      alert_below_percent: target.alertBelow,
      status: status
    };
  }).sort(function(a, b) {
    // Worst margins first — that's the actionable end of the table.
    const am = a.margin_percent == null ? 1000 : a.margin_percent;
    const bm = b.margin_percent == null ? 1000 : b.margin_percent;
    return am - bm;
  });
}

function computeCustomerMargins(customerRevenue, byUserCost, profiles) {
  const profileMap = {};
  profiles.forEach(function(p) { profileMap[p.id] = p; });

  const userIds = Object.keys(Object.assign({}, customerRevenue, byUserCost));
  return userIds.map(function(uid) {
    const profile = profileMap[uid] || {};
    const revenue = round2(customerRevenue[uid] || 0);
    const cost = round2(byUserCost[uid] || 0);
    const margin = marginPercent(revenue, cost);
    // Spec: flag if cost > 50% of revenue (i.e. margin < 50).
    const threshold = 50;
    let status = 'green';
    if (revenue === 0 && cost === 0) status = 'grey';
    else if (revenue === 0) status = 'red'; // cost with no revenue — trial overuse
    else if (margin < threshold) status = 'red';
    else if (margin < threshold + 15) status = 'amber';
    return {
      user_id: uid,
      email: profile.email || '',
      business_name: profile.business_name || '',
      bundle_tier: profile.bundle_tier || null,
      is_trial: !!profile.is_trial,
      revenue: revenue,
      cost: cost,
      margin_percent: margin,
      threshold_percent: threshold,
      status: status
    };
  }).sort(function(a, b) {
    const am = a.margin_percent == null ? 1000 : a.margin_percent;
    const bm = b.margin_percent == null ? 1000 : b.margin_percent;
    return am - bm;
  });
}

function buildSupplierStatus(usage, prevUsage, supplierLimits) {
  // Group limits by provider for fast lookup.
  const limitsByProvider = {};
  supplierLimits.forEach(function(l) {
    if (!limitsByProvider[l.provider]) limitsByProvider[l.provider] = [];
    limitsByProvider[l.provider].push(l);
  });

  const providers = ['anthropic', 'vercel', 'serper', 'predis', 'supabase', 'reimagine', 'meta', 'ideogram', 'smtp2go'];
  return providers.map(function(name) {
    const cur = usage.byProvider[name] || { cost: 0, tokens_in: 0, tokens_out: 0, usage: 0 };
    const prev = prevUsage.byProvider[name] || { cost: 0, usage: 0 };
    return {
      name: name,
      cost_this_month: round2(cur.cost),
      cost_last_month: round2(prev.cost),
      usage_this_month: cur.usage,
      tokens_in: cur.tokens_in,
      tokens_out: cur.tokens_out,
      limits: (limitsByProvider[name] || []).map(function(l) {
        const used = parseFloat(l.current_usage) || 0;
        const max = parseFloat(l.limit_value) || 0;
        const pct = max > 0 ? Math.round((used / max) * 100) : null;
        const alertAt = parseFloat(l.alert_at_percent) || 0;
        return {
          limit_type: l.limit_type,
          limit_value: max,
          current_usage: used,
          used_percent: pct,
          alert_at_percent: alertAt,
          alert: pct != null && pct >= alertAt,
          updated_at: l.updated_at
        };
      })
    };
  });
}

function computeAlerts(toolMargins, customerMargins, supplierLimits, usage) {
  const alerts = [];
  toolMargins.forEach(function(t) {
    if (t.status === 'red') {
      alerts.push({
        kind: 'tool_margin',
        severity: 'red',
        message: t.tool_id + ' margin ' + (t.margin_percent != null ? t.margin_percent + '%' : 'n/a') +
          ' is below alert threshold ' + t.alert_below_percent + '%'
      });
    }
  });
  customerMargins.forEach(function(c) {
    if (c.status === 'red' && (c.revenue > 0 || c.cost > 0)) {
      alerts.push({
        kind: 'customer_margin',
        severity: 'red',
        message: (c.business_name || c.email || c.user_id) +
          ' costs $' + c.cost + ' against $' + c.revenue + ' revenue'
      });
    }
  });
  supplierLimits.forEach(function(l) {
    const used = parseFloat(l.current_usage) || 0;
    const max = parseFloat(l.limit_value) || 0;
    const pct = max > 0 ? (used / max) * 100 : 0;
    const alertAt = parseFloat(l.alert_at_percent) || 0;
    if (pct >= alertAt && alertAt > 0) {
      alerts.push({
        kind: 'supplier_limit',
        severity: pct >= 95 ? 'red' : 'amber',
        message: l.provider + ' ' + l.limit_type + ' at ' + Math.round(pct) + '% of limit (' + used + '/' + max + ')'
      });
    }
  });
  return alerts;
}

// 6-month margin trend — fetch cost-by-period and revenue stays flat
// at the current MRR (we don't have historical revenue snapshots yet).
async function fetchMarginTrend(currentPeriodLabel, toolRevenue) {
  const periods = lastNPeriods(currentPeriodLabel, 6);
  const r = await supabase
    .from('api_usage')
    .select('period, tool_id, cost_estimate')
    .in('period', periods);
  if (r.error) {
    console.error('[admin-profitability] trend error:', r.error.message);
    return { periods: periods, overall: [], by_tool: {} };
  }
  const overallByPeriod = {};
  const byToolByPeriod = {};
  (r.data || []).forEach(function(row) {
    const cost = typeof row.cost_estimate === 'number' ? row.cost_estimate : (row.cost_estimate ? parseFloat(row.cost_estimate) : 0);
    if (isNaN(cost)) return;
    overallByPeriod[row.period] = round2((overallByPeriod[row.period] || 0) + cost);
    if (row.tool_id) {
      if (!byToolByPeriod[row.tool_id]) byToolByPeriod[row.tool_id] = {};
      byToolByPeriod[row.tool_id][row.period] = round2((byToolByPeriod[row.tool_id][row.period] || 0) + cost);
    }
  });

  const totalRevenue = round2(Object.values(toolRevenue).reduce(function(a, b) { return a + b; }, 0));
  const overall = periods.map(function(p) {
    return { period: p, margin_percent: marginPercent(totalRevenue, overallByPeriod[p] || 0) };
  });
  const byTool = {};
  Object.keys(byToolByPeriod).forEach(function(tid) {
    const rev = toolRevenue[tid] || 0;
    byTool[tid] = periods.map(function(p) {
      return { period: p, margin_percent: marginPercent(rev, byToolByPeriod[tid][p] || 0) };
    });
  });
  return { periods: periods, overall: overall, by_tool: byTool };
}

function lastNPeriods(currentPeriodLabel, n) {
  const out = [];
  let label = currentPeriodLabel;
  for (let i = 0; i < n; i++) {
    out.unshift(label);
    label = priorPeriod(label);
  }
  return out;
}

// ── Math ──────────────────────────────────────────────────────────
function marginPercent(revenue, cost) {
  if (typeof revenue !== 'number' || revenue <= 0) return null;
  return Math.round(((revenue - cost) / revenue) * 1000) / 10;
}

function round2(n) {
  if (typeof n !== 'number' || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

// ── Auth ──────────────────────────────────────────────────────────
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
