// api/bi-context.js — Returns summarised BI insights for Strategic Plan injection
// Called by api/strategic-plan-load-context.js to provide real business data
// during the SP interview instead of relying on user estimates.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = 'https://staxai.com.au';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
  const userId = user.id;

  async function callInternal(endpoint, body) {
    try {
      var r = await fetch(SITE_URL + '/api/' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: body ? JSON.stringify(body) : '{}'
      });
      if (!r.ok) return null;
      var j = await r.json();
      return j.success ? j.data || j : null;
    } catch (e) { console.error('[bi-context] fetch error:', e.message); return null; }
  }

  // Pull the Xero connections from the user's profile so we can fetch
  // the SP-specific datasets (pl_breakdown, pl_summary, pl_summary_prior_year,
  // aged_receivables) per tenant. These three calculations live here rather
  // than in bi-financial because they're only needed for the Strategic Plan.
  async function loadXeroExtras() {
    var profileRes = await supabase
      .from('profiles')
      .select('cl_xero_accounts')
      .eq('id', userId)
      .maybeSingle();
    var xeroAccounts = Array.isArray(profileRes.data && profileRes.data.cl_xero_accounts)
      ? profileRes.data.cl_xero_accounts : [];

    var grossNumerator = 0;
    var grossDenominator = 0;
    var hasCogs = false;
    var currentIncome = 0;
    var currentExpenses = 0;
    var currentMonths = 0;
    var priorIncome = 0;
    var debtorWeighted = 0;
    var debtorBalance = 0;

    for (var x = 0; x < xeroAccounts.length; x++) {
      var tid = xeroAccounts[x] && xeroAccounts[x].tenant_id;
      if (!tid) continue;

      var perTenant = await Promise.all([
        callInternal('xero-fetch', { action: 'pl_breakdown', tenantId: tid }),
        callInternal('xero-fetch', { action: 'pl_summary', tenantId: tid }),
        callInternal('xero-fetch', { action: 'pl_summary_prior_year', tenantId: tid }),
        callInternal('xero-fetch', { action: 'aged_receivables', tenantId: tid })
      ]);
      var breakdown = perTenant[0];
      var plCurrent = perTenant[1];
      var plPrior = perTenant[2];
      var agedAR = perTenant[3];

      if (breakdown && breakdown.income && breakdown.cost_of_sales) {
        var incTotal = (breakdown.income.categories || []).reduce(function (s, c) { return s + (c.total || 0); }, 0);
        var cogsTotal = (breakdown.cost_of_sales.categories || []).reduce(function (s, c) { return s + (c.total || 0); }, 0);
        if (incTotal > 0) {
          grossNumerator += (incTotal - cogsTotal);
          grossDenominator += incTotal;
          if (cogsTotal !== 0) hasCogs = true;
        }
      }

      if (plCurrent) {
        currentIncome += plCurrent.total_income || 0;
        currentExpenses += plCurrent.total_expenses || 0;
        // pl_summary covers 1 Jul → today; convert to whole months for
        // the cash-runway calculation. Always at least 1 to avoid
        // dividing by zero on day 1 of the FY.
        if (plCurrent.period_start && plCurrent.period_end) {
          var ps = new Date(plCurrent.period_start);
          var pe = new Date(plCurrent.period_end);
          var months = (pe.getFullYear() - ps.getFullYear()) * 12 + (pe.getMonth() - ps.getMonth()) + 1;
          if (months > currentMonths) currentMonths = months;
        }
      }
      if (plPrior) priorIncome += plPrior.total_income || 0;

      if (agedAR && agedAR.total_balance > 0 && agedAR.avg_debtor_days != null) {
        debtorWeighted += agedAR.avg_debtor_days * agedAR.total_balance;
        debtorBalance += agedAR.total_balance;
      }
    }

    // Gross margin is null when no Cost of Sales accounts exist — common
    // for service businesses. Caller falls back to operating margin.
    var grossMargin = (hasCogs && grossDenominator > 0)
      ? Math.round((grossNumerator / grossDenominator) * 100)
      : null;

    var revenueTrendPct = priorIncome > 0
      ? Math.round(((currentIncome - priorIncome) / priorIncome) * 100)
      : null;

    var avgDebtorDays = debtorBalance > 0
      ? Math.round(debtorWeighted / debtorBalance)
      : null;

    var monthlyExpenses = (currentMonths > 0 && currentExpenses > 0)
      ? Math.round(currentExpenses / currentMonths)
      : null;

    return {
      gross_margin: grossMargin,
      revenue_trend_pct: revenueTrendPct,
      avg_debtor_days: avgDebtorDays,
      monthly_expenses: monthlyExpenses
    };
  }

  try {
    var results = await Promise.all([
      callInternal('bi-financial'),
      callInternal('bi-customers'),
      callInternal('bi-operations'),
      loadXeroExtras()
    ]);
    var financial = results[0];
    var customers = results[1];
    var operations = results[2];
    var xeroExtras = results[3] || { gross_margin: null, revenue_trend_pct: null, avg_debtor_days: null, monthly_expenses: null };

    var insightsRes = await supabase.from('bi_insights').select('module, insight_type, insight_data').eq('user_id', userId).eq('is_dismissed', false).eq('insight_type', 'advisory').order('relevance_score', { ascending: false }).limit(10);
    var advisories = insightsRes.data || [];

    var context = {
      financial: null,
      customers: null,
      operations: null,
      advisories: []
    };

    if (financial && financial.summary) {
      var fs = financial.summary;
      context.financial = {
        revenue: fs.total_revenue || 0,
        expenses: fs.total_expenses || 0,
        profit_margin: fs.profit_margin || 0,
        cash_balance: fs.cash_balance || 0,
        receivable: fs.accounts_receivable || 0,
        overdue_receivable: fs.overdue_receivable || 0,
        gross_margin: xeroExtras.gross_margin,
        revenue_trend_pct: xeroExtras.revenue_trend_pct,
        avg_debtor_days: xeroExtras.avg_debtor_days,
        monthly_expenses: xeroExtras.monthly_expenses
      };
    } else if (xeroExtras.gross_margin != null || xeroExtras.revenue_trend_pct != null || xeroExtras.avg_debtor_days != null) {
      // bi-financial returned nothing (no accounting connection summary
      // available) but the SP extras still produced useful data — surface
      // them so the form prefill has something to work with.
      context.financial = {
        revenue: 0,
        expenses: 0,
        profit_margin: 0,
        cash_balance: 0,
        receivable: 0,
        overdue_receivable: 0,
        gross_margin: xeroExtras.gross_margin,
        revenue_trend_pct: xeroExtras.revenue_trend_pct,
        avg_debtor_days: xeroExtras.avg_debtor_days,
        monthly_expenses: xeroExtras.monthly_expenses
      };
    }

    if (customers && customers.summary) {
      var cs = customers.summary;
      context.customers = {
        total_customers: cs.total_customers || 0,
        avg_invoice_value: cs.avg_invoice_value || 0,
        concentration_pct: cs.concentration_pct || 0,
        conversion_rate: cs.conversion_rate || 0,
        inactive_count: cs.inactive_count || 0
      };
      if (customers.top_customers) {
        context.customers.top_3 = customers.top_customers.slice(0, 3).map(function(c) {
          return { name: c.name, revenue: c.revenue, pct: c.percentage };
        });
      }
    }

    if (operations && operations.summary) {
      var os = operations.summary;
      // Estimated monthly job rate — bi-operations summarises a
      // 12-month window by default, so total_jobs / 12 is a fair
      // average. The SP prefill (spec §8.9) buckets it for the
      // jobsPerMonth field in Operations & Capacity.
      var jobsPerMonth = (os.total_jobs || 0) > 0 ? Math.round((os.total_jobs || 0) / 12) : 0;
      context.operations = {
        total_jobs: os.total_jobs || 0,
        completed_jobs: os.completed_jobs || 0,
        avg_duration_days: os.avg_duration_days || 0,
        avg_job_value: os.avg_job_value || 0,
        jobs_per_month: jobsPerMonth,
        over_quote_pct: (os.over_quote_count + os.under_quote_count + os.on_quote_count) > 0
          ? Math.round(os.over_quote_count / (os.over_quote_count + os.under_quote_count + os.on_quote_count) * 100) : 0,
        form_completion_rate: os.form_completion_rate || 0
      };
    }

    // Market signal — derived from the cached BI insights with
    // category='market'. Used by the SP prefill (spec §8.9) to set
    // the Industry Outlook chip and the Market Trends chip-multi
    // without having to re-run the Serper research. Severity counts
    // drive the outlook bucket; the headlines feed simple keyword
    // matching for the trend chips.
    var marketRes = await supabase.from('bi_insights')
      .select('insight_data')
      .eq('user_id', userId)
      .eq('is_dismissed', false)
      .gt('expires_at', new Date().toISOString());
    var marketItems = (marketRes.data || []).filter(function(i) {
      var cat = i.insight_data && i.insight_data.category;
      return cat === 'market';
    });
    var sevCounts = { red: 0, amber: 0, green: 0 };
    var marketHeadlines = [];
    marketItems.forEach(function(item) {
      var d = item.insight_data || {};
      var sev = d.severity || 'amber';
      if (sevCounts[sev] !== undefined) sevCounts[sev]++;
      if (d.headline) marketHeadlines.push(d.headline);
    });
    if (marketItems.length > 0) {
      context.market_signal = {
        severity_counts: sevCounts,
        headlines: marketHeadlines.slice(0, 12)
      };
    }

    context.advisories = advisories.map(function(a) {
      var d = a.insight_data || {};
      return {
        module: a.module,
        text: d.text || d.headline || ''
      };
    });

    return res.status(200).json({ success: true, data: context });
  } catch (err) {
    console.error('[bi-context] error:', err.message || err);
    return res.status(500).json({ error: 'Could not load BI context.' });
  }
}
