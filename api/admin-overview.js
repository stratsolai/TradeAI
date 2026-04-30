import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    // ── Supabase counts ─────────────────────────────────────────
    const totalCustomersRes = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .not('activated_tools', 'is', null);
    const totalCustomers = totalCustomersRes.count || 0;

    const trialUsersRes = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_trial', true);
    const trialUsers = trialUsersRes.count || 0;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const newSignupsRes = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);
    const newSignups7d = newSignupsRes.count || 0;

    // Recent signups — newest 10 with key fields. profiles does not
    // store email, so fetch the auth.users emails for these specific
    // ids in parallel via admin.getUserById and merge.
    const recentSignupsRes = await supabase
      .from('profiles')
      .select('id, business_name, industry, is_trial, bundle_tier, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    const recentSignups = recentSignupsRes.data || [];
    if (recentSignups.length > 0) {
      const emailLookups = await Promise.all(recentSignups.map(function(p) {
        return supabase.auth.admin.getUserById(p.id).then(function(r) {
          return [p.id, (r.data && r.data.user && r.data.user.email) || null];
        }).catch(function() { return [p.id, null]; });
      }));
      const emailMap = new Map(emailLookups);
      recentSignups.forEach(function(p) { p.email = emailMap.get(p.id) || null; });
    }

    // Tool activations + industry breakdown — pull all activated_tools / industry rows
    const allProfilesRes = await supabase
      .from('profiles')
      .select('activated_tools, industry')
      .not('activated_tools', 'is', null);
    const allProfiles = allProfilesRes.data || [];

    const toolCounts = {};
    const industryCounts = {};
    allProfiles.forEach(function(p) {
      (Array.isArray(p.activated_tools) ? p.activated_tools : []).forEach(function(t) {
        toolCounts[t] = (toolCounts[t] || 0) + 1;
      });
      const inds = Array.isArray(p.industry) ? p.industry : (p.industry ? [p.industry] : []);
      inds.forEach(function(i) {
        if (!i) return;
        industryCounts[i] = (industryCounts[i] || 0) + 1;
      });
    });
    const topTools = Object.keys(toolCounts).map(function(id) {
      return { id: id, count: toolCounts[id] };
    }).sort(function(a, b) { return b.count - a.count; });
    const industryBreakdown = Object.keys(industryCounts).map(function(name) {
      return { industry: name, count: industryCounts[name] };
    }).sort(function(a, b) { return b.count - a.count; });

    // ── Stripe metrics ──────────────────────────────────────────
    let activeSubscriptions = 0;
    let mrr = 0;
    let churnCount = 0;
    let recentCancellations = [];
    const revenueByPriceId = {};

    if (stripe) {
      // Active subscriptions — paginate, accumulate MRR and per-price totals
      let starting = undefined;
      while (true) {
        const page = await stripe.subscriptions.list({
          status: 'active',
          limit: 100,
          starting_after: starting
        });
        page.data.forEach(function(sub) {
          activeSubscriptions += 1;
          (sub.items && sub.items.data ? sub.items.data : []).forEach(function(item) {
            const p = item.price;
            if (!p || !p.unit_amount || !p.recurring) return;
            const monthly = p.recurring.interval === 'year'
              ? p.unit_amount / 12
              : p.unit_amount;
            const cents = monthly * (item.quantity || 1);
            mrr += cents;
            revenueByPriceId[p.id] = (revenueByPriceId[p.id] || 0) + cents;
          });
        });
        if (!page.has_more) break;
        starting = page.data[page.data.length - 1].id;
      }
      mrr = Math.round(mrr / 100); // dollars

      // Churn this month — canceled subs with canceled_at in current month
      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);
      const startTs = Math.floor(startOfMonth.getTime() / 1000);

      starting = undefined;
      while (true) {
        const page = await stripe.subscriptions.list({
          status: 'canceled',
          limit: 100,
          starting_after: starting
        });
        page.data.forEach(function(sub) {
          if (sub.canceled_at && sub.canceled_at >= startTs) {
            churnCount += 1;
            if (recentCancellations.length < 10) {
              recentCancellations.push({
                id: sub.id,
                customer: sub.customer,
                canceled_at: sub.canceled_at,
                metadata: sub.metadata || {}
              });
            }
          }
        });
        if (!page.has_more) break;
        starting = page.data[page.data.length - 1].id;
      }
    }

    const arr = mrr * 12;
    const arpc = totalCustomers > 0 ? Math.round(mrr / totalCustomers) : 0;
    const churnRate = activeSubscriptions + churnCount > 0
      ? +(churnCount / (activeSubscriptions + churnCount) * 100).toFixed(2)
      : 0;

    // Revenue by bundle vs individual — match priceId against env vars
    const bundlePriceMap = {
      stax3: process.env.STRIPE_PRICE_STAX3 || null,
      stax6: process.env.STRIPE_PRICE_STAX6 || null,
      'stax-all': process.env.STRIPE_PRICE_STAX_ALL || null
    };
    const revenueByBundle = { stax3: 0, stax6: 0, 'stax-all': 0, individual: 0 };
    Object.keys(revenueByPriceId).forEach(function(priceId) {
      const cents = revenueByPriceId[priceId];
      if (priceId === bundlePriceMap.stax3) revenueByBundle.stax3 += cents;
      else if (priceId === bundlePriceMap.stax6) revenueByBundle.stax6 += cents;
      else if (priceId === bundlePriceMap['stax-all']) revenueByBundle['stax-all'] += cents;
      else revenueByBundle.individual += cents;
    });
    Object.keys(revenueByBundle).forEach(function(k) {
      revenueByBundle[k] = Math.round(revenueByBundle[k] / 100);
    });

    // Revenue by individual tool — translate priceId→toolId by reading
    // tool_prices for tool_id mapping (best-effort).
    let revenueByTool = [];
    try {
      const tpRes = await supabase
        .from('tool_prices')
        .select('price_id, tool_id');
      const priceToTool = {};
      (tpRes.data || []).forEach(function(row) {
        if (row.price_id && row.tool_id) priceToTool[row.price_id] = row.tool_id;
      });
      const byTool = {};
      Object.keys(revenueByPriceId).forEach(function(priceId) {
        const tid = priceToTool[priceId];
        if (!tid) return;
        byTool[tid] = (byTool[tid] || 0) + revenueByPriceId[priceId];
      });
      revenueByTool = Object.keys(byTool).map(function(id) {
        return { tool_id: id, mrr_cents: byTool[id], mrr: Math.round(byTool[id] / 100) };
      }).sort(function(a, b) { return b.mrr - a.mrr; });
    } catch (e) {
      // tool_prices missing — leave empty
    }

    return res.status(200).json({
      metrics: {
        total_customers: totalCustomers,
        active_subscriptions: activeSubscriptions,
        mrr: mrr,
        arr: arr,
        arpc: arpc,
        churn_count: churnCount,
        churn_rate: churnRate,
        new_signups_7d: newSignups7d,
        trial_users: trialUsers
      },
      recent_signups: recentSignups,
      top_tools: topTools,
      industry_breakdown: industryBreakdown,
      revenue_by_bundle: revenueByBundle,
      revenue_by_tool: revenueByTool,
      recent_cancellations: recentCancellations
    });
  } catch (err) {
    console.error('[admin-overview] error:', err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : 'Could not load overview' });
  }
}

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
