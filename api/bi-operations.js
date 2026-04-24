// api/bi-operations.js — BI Dashboard operational performance aggregator
// Fetches job, quote, invoice, and form data from all connected job
// management providers via existing fetch endpoints. Returns operational
// metrics: job status breakdown, profitability, duration, form completion.

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

  var profileRes = await supabase
    .from('profiles')
    .select('cl_servicem8_accounts')
    .eq('id', user.id)
    .maybeSingle();

  if (profileRes.error) return res.status(500).json({ error: 'Could not load profile' });

  var profile = profileRes.data || {};
  var sm8Accounts = Array.isArray(profile.cl_servicem8_accounts) ? profile.cl_servicem8_accounts : [];

  if (sm8Accounts.length === 0) {
    return res.status(200).json({
      success: true,
      connected: false,
      data: null,
      message: 'No job management software connected'
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
      console.error('[bi-operations] ' + endpoint + ' error:', err.message);
      return null;
    }
  }

  try {
    var allJobs = [];
    var allQuotes = [];
    var allInvoices = [];
    var allForms = [];
    var promises = [];

    for (var i = 0; i < sm8Accounts.length; i++) {
      var acct = sm8Accounts[i];
      if (!acct || !acct.account_email) continue;
      var email = acct.account_email;
      promises.push(
        callFetch('servicem8-fetch', { action: 'jobs', accountEmail: email }).then(function(d) { if (d) allJobs = allJobs.concat(d); }),
        callFetch('servicem8-fetch', { action: 'quotes', accountEmail: email }).then(function(d) { if (d) allQuotes = allQuotes.concat(d); }),
        callFetch('servicem8-fetch', { action: 'invoices', accountEmail: email }).then(function(d) { if (d) allInvoices = allInvoices.concat(d); }),
        callFetch('servicem8-fetch', { action: 'forms', accountEmail: email }).then(function(d) { if (d) allForms = allForms.concat(d); })
      );
    }

    await Promise.all(promises);

    // Job status breakdown
    var statusCounts = {};
    allJobs.forEach(function(j) {
      var s = j.status || 'Unknown';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    var completedJobs = allJobs.filter(function(j) {
      var s = (j.status || '').toLowerCase();
      return s === 'completed' || s === 'complete' || s === 'closed';
    });

    // Job duration — scheduled to completion
    var durations = [];
    completedJobs.forEach(function(j) {
      if (j.scheduled_date && j.completion_date) {
        var start = new Date(j.scheduled_date);
        var end = new Date(j.completion_date);
        var days = Math.round((end - start) / 86400000);
        if (days >= 0 && days < 365) durations.push(days);
      }
    });
    var avgDuration = durations.length > 0 ? Math.round(durations.reduce(function(a, b) { return a + b; }, 0) / durations.length * 10) / 10 : 0;

    // Job profitability — match invoices to jobs
    var invoiceByJob = {};
    allInvoices.forEach(function(inv) {
      if (inv.job_number) {
        if (!invoiceByJob[inv.job_number]) invoiceByJob[inv.job_number] = 0;
        invoiceByJob[inv.job_number] += inv.amount_excl_gst || 0;
      }
    });

    var quoteByJob = {};
    allQuotes.forEach(function(q) {
      if (q.job_number) {
        if (!quoteByJob[q.job_number]) quoteByJob[q.job_number] = 0;
        quoteByJob[q.job_number] += q.amount_excl_gst || 0;
      }
    });

    // Jobs completed vs quoted
    var overQuoteCount = 0;
    var underQuoteCount = 0;
    var onQuoteCount = 0;
    completedJobs.forEach(function(j) {
      var jobId = j.job_number;
      var invoiced = invoiceByJob[jobId] || 0;
      var quoted = quoteByJob[jobId] || 0;
      if (quoted <= 0 || invoiced <= 0) return;
      var variance = ((invoiced - quoted) / quoted) * 100;
      if (variance > 5) overQuoteCount++;
      else if (variance < -5) underQuoteCount++;
      else onQuoteCount++;
    });

    // Form completion rate
    var jobsWithForms = new Set();
    allForms.forEach(function(f) {
      if (f.job_number) jobsWithForms.add(f.job_number);
    });
    var formCompletionRate = allJobs.length > 0 ? Math.round((jobsWithForms.size / allJobs.length) * 100) : 0;

    // Jobs by month
    var jobsByMonth = {};
    allJobs.forEach(function(j) {
      var month = (j.scheduled_date || '').substring(0, 7);
      if (month) jobsByMonth[month] = (jobsByMonth[month] || 0) + 1;
    });

    var months = Object.keys(jobsByMonth).sort();
    var monthlyJobs = months.map(function(m) {
      return { month: m, count: jobsByMonth[m] };
    });

    // Average invoice per job
    var totalJobRevenue = 0;
    var jobsWithRevenue = 0;
    Object.keys(invoiceByJob).forEach(function(jid) {
      totalJobRevenue += invoiceByJob[jid];
      jobsWithRevenue++;
    });
    var avgJobValue = jobsWithRevenue > 0 ? Math.round(totalJobRevenue / jobsWithRevenue) : 0;

    return res.status(200).json({
      success: true,
      connected: true,
      data: {
        summary: {
          total_jobs: allJobs.length,
          completed_jobs: completedJobs.length,
          avg_duration_days: avgDuration,
          avg_job_value: avgJobValue,
          over_quote_count: overQuoteCount,
          under_quote_count: underQuoteCount,
          on_quote_count: onQuoteCount,
          form_completion_rate: formCompletionRate,
          total_forms: allForms.length,
          total_quotes: allQuotes.length
        },
        status_breakdown: statusCounts,
        monthly_jobs: monthlyJobs,
        providers: { servicem8: sm8Accounts.length }
      }
    });
  } catch (err) {
    console.error('[bi-operations] error:', err.message || err);
    return res.status(500).json({ error: 'Could not fetch operations data. Please try again.' });
  }
}
