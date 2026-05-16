// api/bi-projects.js — BI Dashboard project/job performance aggregator
// Pulls job data from every connected project source (ServiceM8, Fergus,
// Xero Projects today; Buildxact and MYOB Jobs when those fetch endpoints
// are added) and computes profitability, completion, duration, and quote-
// vs-actual metrics.
//
// Data-source rules per the BI spec:
//  - Job-management systems (ServiceM8 / Fergus) own status, schedule, and
//    completion dates.
//  - Accounting-side (Xero Projects) owns income, costs, and profit margin
//    figures since the money is authoritative there.
// We aggregate across all sources rather than picking one, and surface
// each job's source so the AI can reason about coverage.

import { createClient } from '@supabase/supabase-js';
import { requireBpComplete } from '../lib/bp-gate.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = 'https://staxai.com.au';

function daysBetween(a, b) {
  if (!a || !b) return null;
  var d1 = new Date(a);
  var d2 = new Date(b);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function isCompletedStatus(status) {
  if (!status) return false;
  var s = String(status).toLowerCase();
  return s === 'completed' || s === 'complete' || s === 'closed' || s === 'finished';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
  if (!(await requireBpComplete(supabase, user.id, res))) return;

  const { fromDate, toDate, forceRefresh } = req.body || {};
  const bypassCache = !!forceRefresh;

  var profileRes = await supabase
    .from('profiles')
    .select('cl_xero_accounts, cl_servicem8_accounts, cl_fergus_accounts')
    .eq('id', user.id)
    .maybeSingle();
  if (profileRes.error) return res.status(500).json({ error: 'Could not load profile' });

  var profile = profileRes.data || {};
  var xeroAccounts = Array.isArray(profile.cl_xero_accounts) ? profile.cl_xero_accounts : [];
  var sm8Accounts = Array.isArray(profile.cl_servicem8_accounts) ? profile.cl_servicem8_accounts : [];
  var fergusAccounts = Array.isArray(profile.cl_fergus_accounts) ? profile.cl_fergus_accounts : [];

  var hasAnyProjectSource = xeroAccounts.length > 0 || sm8Accounts.length > 0 || fergusAccounts.length > 0;
  if (!hasAnyProjectSource) {
    return res.status(200).json({
      success: true,
      connected: false,
      data: null,
      message: 'No project source connected'
    });
  }

  async function callFetch(endpoint, body) {
    try {
      var resp = await fetch(SITE_URL + '/api/' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify(body)
      });
      if (!resp.ok) return null;
      var json = await resp.json();
      return json.success ? json.data : null;
    } catch (err) {
      console.error('[bi-projects] ' + endpoint + ' error:', err && err.message);
      return null;
    }
  }

  try {
    var allJobs = [];
    var allQuotes = [];
    var allInvoices = [];
    var promises = [];
    var sources = { xero: false, servicem8: false, fergus: false };

    // Xero Projects (accounting-authoritative for profit / costs)
    for (var x = 0; x < xeroAccounts.length; x++) {
      var xa = xeroAccounts[x];
      if (!xa || !xa.tenant_id) continue;
      var tid = xa.tenant_id;
      promises.push(callFetch('xero-fetch', { action: 'jobs', tenantId: tid, bypassCache: bypassCache }).then(function (d) {
        if (Array.isArray(d) && d.length > 0) { sources.xero = true; allJobs = allJobs.concat(d); }
      }));
    }

    // ServiceM8 (status, schedule, completion dates)
    for (var s = 0; s < sm8Accounts.length; s++) {
      var sa = sm8Accounts[s];
      if (!sa || !sa.account_email) continue;
      var email = sa.account_email;
      promises.push(
        callFetch('servicem8-fetch', { action: 'jobs', accountEmail: email, bypassCache: bypassCache }).then(function (d) {
          if (Array.isArray(d) && d.length > 0) { sources.servicem8 = true; allJobs = allJobs.concat(d); }
        }),
        callFetch('servicem8-fetch', { action: 'quotes', accountEmail: email, bypassCache: bypassCache }).then(function (d) { if (d) allQuotes = allQuotes.concat(d); }),
        callFetch('servicem8-fetch', { action: 'invoices', accountEmail: email, bypassCache: bypassCache }).then(function (d) { if (d) allInvoices = allInvoices.concat(d); })
      );
    }

    // Fergus (similar to ServiceM8)
    for (var f = 0; f < fergusAccounts.length; f++) {
      var fa = fergusAccounts[f];
      if (!fa) continue;
      promises.push(
        callFetch('fergus-fetch', { action: 'jobs', bypassCache: bypassCache }).then(function (d) {
          if (Array.isArray(d) && d.length > 0) { sources.fergus = true; allJobs = allJobs.concat(d); }
        }),
        callFetch('fergus-fetch', { action: 'quotes', bypassCache: bypassCache }).then(function (d) { if (d) allQuotes = allQuotes.concat(d); }),
        callFetch('fergus-fetch', { action: 'invoices', bypassCache: bypassCache }).then(function (d) { if (d) allInvoices = allInvoices.concat(d); })
      );
    }

    await Promise.all(promises);

    // Optional date filter (matches schedule/completion dates if present)
    if (fromDate || toDate) {
      var fDate = fromDate || '1900-01-01';
      var tDate = toDate || '2999-12-31';
      allJobs = allJobs.filter(function (j) {
        var d = (j.scheduled_date || j.completion_date || '').substring(0, 10);
        if (!d) return true; // keep undated jobs
        return d >= fDate && d <= tDate;
      });
    }

    // Lookup tables for quote/invoice attachment by job_number
    var quotesByJob = {};
    allQuotes.forEach(function (q) {
      var key = q.job_number || '';
      if (!key) return;
      if (!quotesByJob[key]) quotesByJob[key] = 0;
      quotesByJob[key] += q.amount_excl_gst || 0;
    });
    var invoicesByJob = {};
    allInvoices.forEach(function (inv) {
      var key = inv.job_number || '';
      if (!key) return;
      if (!invoicesByJob[key]) invoicesByJob[key] = 0;
      invoicesByJob[key] += inv.amount_excl_gst || 0;
    });

    // Aggregate per-job metrics
    var totalJobs = allJobs.length;
    var completedCount = 0;
    var inProgressCount = 0;
    var quotedCount = 0;
    var statusBreakdown = {};
    var totalIncome = 0;
    var totalCosts = 0;
    var marginSamples = [];
    var durationSamples = [];
    var overQuoteCount = 0;
    var underQuoteCount = 0;
    var onQuoteCount = 0;
    var quoteVarianceSamples = [];

    var enrichedJobs = allJobs.map(function (j) {
      var status = j.status || 'unknown';
      var statusKey = String(status).toLowerCase();
      var prettyStatus = String(status);
      if (!statusBreakdown[prettyStatus]) statusBreakdown[prettyStatus] = 0;
      statusBreakdown[prettyStatus] += 1;

      if (isCompletedStatus(statusKey)) completedCount += 1;
      if (statusKey.indexOf('progress') !== -1 || statusKey === 'active' || statusKey === 'open') inProgressCount += 1;
      if (statusKey.indexOf('quot') !== -1) quotedCount += 1;

      // Profit metrics — Xero Projects is authoritative
      var income = j.income_excl_gst || 0;
      var costs = j.costs_excl_gst || 0;
      if (income > 0 || costs > 0) {
        totalIncome += income;
        totalCosts += costs;
        if (income > 0) marginSamples.push(Math.round(((income - costs) / income) * 100));
      }

      // Duration — schedule → completion (job-mgmt systems)
      var dur = daysBetween(j.scheduled_date, j.completion_date);
      if (dur !== null && dur >= 0) durationSamples.push(dur);

      // Quote vs actual — match by job_number across the same source
      var jobKey = j.job_number || '';
      var quoteAmt = quotesByJob[jobKey] || 0;
      var invAmt = invoicesByJob[jobKey] || 0;
      var variance = null;
      if (quoteAmt > 0 && invAmt > 0) {
        variance = Math.round(((invAmt - quoteAmt) / quoteAmt) * 100);
        quoteVarianceSamples.push(variance);
        if (variance > 5) overQuoteCount += 1;
        else if (variance < -5) underQuoteCount += 1;
        else onQuoteCount += 1;
      }

      return {
        job_number: j.job_number || '',
        job_name: j.job_name || j.description || '',
        status: prettyStatus,
        client_name: j.client_name || j.contact_name || '',
        scheduled_date: j.scheduled_date || '',
        completion_date: j.completion_date || '',
        income: Math.round(income),
        costs: Math.round(costs),
        profit: Math.round(income - costs),
        margin_pct: income > 0 ? Math.round(((income - costs) / income) * 100) : 0,
        duration_days: dur,
        quote_amount: Math.round(quoteAmt),
        invoice_amount: Math.round(invAmt),
        variance_pct: variance,
        platform: j.platform || 'unknown'
      };
    });

    var completionRate = totalJobs > 0 ? Math.round((completedCount / totalJobs) * 100) : 0;
    var avgMargin = marginSamples.length > 0
      ? Math.round(marginSamples.reduce(function (a, b) { return a + b; }, 0) / marginSamples.length)
      : 0;
    var avgDuration = durationSamples.length > 0
      ? Math.round(durationSamples.reduce(function (a, b) { return a + b; }, 0) / durationSamples.length)
      : 0;
    var avgJobValue = totalJobs > 0 && totalIncome > 0
      ? Math.round(totalIncome / Math.max(1, marginSamples.length))
      : 0;

    // Top jobs by profit (only those with real income data — i.e. Xero Projects)
    var topByProfit = enrichedJobs
      .filter(function (j) { return j.income > 0; })
      .sort(function (a, b) { return b.profit - a.profit; })
      .slice(0, 5)
      .map(function (j) {
        return {
          job_number: j.job_number,
          job_name: j.job_name || j.client_name || '(unnamed)',
          income: j.income,
          costs: j.costs,
          profit: j.profit,
          margin_pct: j.margin_pct,
          platform: j.platform
        };
      });

    var monthlyJobs = {};
    enrichedJobs.forEach(function (j) {
      var month = (j.scheduled_date || j.completion_date || '').substring(0, 7);
      if (!month) return;
      if (!monthlyJobs[month]) monthlyJobs[month] = 0;
      monthlyJobs[month] += 1;
    });
    var monthlyJobsList = Object.keys(monthlyJobs).sort().map(function (m) {
      return { month: m, count: monthlyJobs[m] };
    });

    return res.status(200).json({
      success: true,
      connected: true,
      data: {
        summary: {
          total_jobs: totalJobs,
          completed_count: completedCount,
          in_progress_count: inProgressCount,
          quoted_count: quotedCount,
          completion_rate: completionRate,
          avg_job_value: avgJobValue,
          avg_margin_pct: avgMargin,
          avg_duration_days: avgDuration,
          total_income: Math.round(totalIncome),
          total_costs: Math.round(totalCosts),
          total_profit: Math.round(totalIncome - totalCosts),
          quote_variance_jobs: quoteVarianceSamples.length,
          over_quote_count: overQuoteCount,
          under_quote_count: underQuoteCount,
          on_quote_count: onQuoteCount,
          source_count: (sources.xero ? 1 : 0) + (sources.servicem8 ? 1 : 0) + (sources.fergus ? 1 : 0)
        },
        sources: sources,
        status_breakdown: statusBreakdown,
        top_by_profit: topByProfit,
        monthly_jobs: monthlyJobsList
      }
    });
  } catch (err) {
    console.error('[bi-projects] error:', err && (err.message || err));
    return res.status(500).json({ error: 'Could not fetch project data. Please try again.' });
  }
}
