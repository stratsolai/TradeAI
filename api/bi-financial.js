// api/bi-financial.js — BI Dashboard financial data aggregator
// Fetches accounting data from all connected providers (Xero, QuickBooks)
// via the existing fetch endpoints, aggregates into a unified shape.
// Supports date range filtering for trend analysis.

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

  const { fromDate, toDate } = req.body || {};

  var profileRes = await supabase
    .from('profiles')
    .select('cl_xero_accounts, cl_quickbooks_accounts')
    .eq('id', user.id)
    .maybeSingle();

  if (profileRes.error) return res.status(500).json({ error: 'Could not load profile' });

  var profile = profileRes.data || {};
  var xeroAccounts = Array.isArray(profile.cl_xero_accounts) ? profile.cl_xero_accounts : [];
  var qbAccounts = Array.isArray(profile.cl_quickbooks_accounts) ? profile.cl_quickbooks_accounts : [];

  if (xeroAccounts.length === 0 && qbAccounts.length === 0) {
    return res.status(200).json({
      success: true,
      connected: false,
      data: null,
      message: 'No accounting software connected'
    });
  }

  async function callFetchEndpoint(endpoint, body) {
    try {
      var resp = await fetch(SITE_URL + '/api/' + endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + jwt
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        console.error('[bi-financial] ' + endpoint + ' returned ' + resp.status);
        return null;
      }
      var json = await resp.json();
      return json.success ? json.data : null;
    } catch (err) {
      console.error('[bi-financial] ' + endpoint + ' error:', err.message);
      return null;
    }
  }

  try {
    var allInvoices = [];
    var allBills = [];
    var plSummaries = [];
    var balances = [];
    var allQuotes = [];

    var fetchPromises = [];

    for (var x = 0; x < xeroAccounts.length; x++) {
      var xa = xeroAccounts[x];
      if (!xa || !xa.tenant_id) continue;
      var tid = xa.tenant_id;
      fetchPromises.push(
        callFetchEndpoint('xero-fetch', { action: 'invoices', tenantId: tid }).then(function(d) { if (d) allInvoices = allInvoices.concat(d); }),
        callFetchEndpoint('xero-fetch', { action: 'bills', tenantId: tid }).then(function(d) { if (d) allBills = allBills.concat(d); }),
        callFetchEndpoint('xero-fetch', { action: 'pl_summary', tenantId: tid }).then(function(d) { if (d) plSummaries.push(d); }),
        callFetchEndpoint('xero-fetch', { action: 'balances', tenantId: tid }).then(function(d) { if (d) balances.push(d); }),
        callFetchEndpoint('xero-fetch', { action: 'quotes', tenantId: tid }).then(function(d) { if (d) allQuotes = allQuotes.concat(d); })
      );
    }

    for (var q = 0; q < qbAccounts.length; q++) {
      var qa = qbAccounts[q];
      if (!qa || !qa.realm_id) continue;
      var rid = qa.realm_id;
      fetchPromises.push(
        callFetchEndpoint('quickbooks-fetch', { action: 'invoices', realmId: rid }).then(function(d) { if (d) allInvoices = allInvoices.concat(d); }),
        callFetchEndpoint('quickbooks-fetch', { action: 'bills', realmId: rid }).then(function(d) { if (d) allBills = allBills.concat(d); }),
        callFetchEndpoint('quickbooks-fetch', { action: 'pl_summary', realmId: rid }).then(function(d) { if (d) plSummaries.push(d); }),
        callFetchEndpoint('quickbooks-fetch', { action: 'balances', realmId: rid }).then(function(d) { if (d) balances.push(d); }),
        callFetchEndpoint('quickbooks-fetch', { action: 'quotes', realmId: rid }).then(function(d) { if (d) allQuotes = allQuotes.concat(d); })
      );
    }

    await Promise.all(fetchPromises);

    if (fromDate || toDate) {
      var fDate = fromDate || '1900-01-01';
      var tDate = toDate || '2999-12-31';
      allInvoices = allInvoices.filter(function(inv) {
        var d = (inv.date || '').substring(0, 10);
        return d >= fDate && d <= tDate;
      });
      allBills = allBills.filter(function(bill) {
        var d = (bill.date || '').substring(0, 10);
        return d >= fDate && d <= tDate;
      });
      allQuotes = allQuotes.filter(function(qt) {
        var d = (qt.date || '').substring(0, 10);
        return d >= fDate && d <= tDate;
      });
    }

    var totalRevenue = 0;
    var totalExpenses = 0;
    var overdueReceivable = 0;
    var overduePayable = 0;
    var today = new Date().toISOString().split('T')[0];

    allInvoices.forEach(function(inv) {
      totalRevenue += inv.amount_excl_gst || 0;
      if (inv.status !== 'Paid' && inv.status !== 'PAID' && inv.due_date) {
        var due = (inv.due_date || '').substring(0, 10);
        if (due < today) overdueReceivable += inv.amount_incl_gst || 0;
      }
    });

    allBills.forEach(function(bill) {
      totalExpenses += bill.amount_excl_gst || 0;
      if (bill.status !== 'Paid' && bill.status !== 'PAID' && bill.due_date) {
        var due = (bill.due_date || '').substring(0, 10);
        if (due < today) overduePayable += bill.amount_incl_gst || 0;
      }
    });

    var totalCash = 0;
    var totalReceivable = 0;
    var totalPayable = 0;
    balances.forEach(function(b) {
      totalCash += b.cash_balance || 0;
      totalReceivable += b.accounts_receivable || 0;
      totalPayable += b.accounts_payable || 0;
    });

    var plIncome = 0;
    var plExpenses = 0;
    plSummaries.forEach(function(pl) {
      plIncome += pl.total_income || 0;
      plExpenses += pl.total_expenses || 0;
    });

    var monthlyRevenue = {};
    var monthlyExpenses = {};
    allInvoices.forEach(function(inv) {
      var month = (inv.date || '').substring(0, 7);
      if (month) monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (inv.amount_excl_gst || 0);
    });
    allBills.forEach(function(bill) {
      var month = (bill.date || '').substring(0, 7);
      if (month) monthlyExpenses[month] = (monthlyExpenses[month] || 0) + (bill.amount_excl_gst || 0);
    });

    var allMonths = Object.keys(Object.assign({}, monthlyRevenue, monthlyExpenses)).sort();
    var trendData = allMonths.map(function(m) {
      var rev = monthlyRevenue[m] || 0;
      var exp = monthlyExpenses[m] || 0;
      return {
        month: m,
        revenue: Math.round(rev),
        expenses: Math.round(exp),
        profit: Math.round(rev - exp),
        margin: rev > 0 ? Math.round(((rev - exp) / rev) * 100) : 0
      };
    });

    var receivableAging = { current: 0, days30: 0, days60: 0, days90plus: 0 };
    allInvoices.forEach(function(inv) {
      if (inv.status === 'Paid' || inv.status === 'PAID') return;
      var amt = inv.amount_incl_gst || 0;
      var due = (inv.due_date || '').substring(0, 10);
      if (!due) return;
      var daysOverdue = Math.floor((new Date(today) - new Date(due)) / 86400000);
      if (daysOverdue <= 0) receivableAging.current += amt;
      else if (daysOverdue <= 30) receivableAging.days30 += amt;
      else if (daysOverdue <= 60) receivableAging.days60 += amt;
      else receivableAging.days90plus += amt;
    });

    var payableAging = { current: 0, days30: 0, days60: 0, days90plus: 0 };
    allBills.forEach(function(bill) {
      if (bill.status === 'Paid' || bill.status === 'PAID') return;
      var amt = bill.amount_incl_gst || 0;
      var due = (bill.due_date || '').substring(0, 10);
      if (!due) return;
      var daysOverdue = Math.floor((new Date(today) - new Date(due)) / 86400000);
      if (daysOverdue <= 0) payableAging.current += amt;
      else if (daysOverdue <= 30) payableAging.days30 += amt;
      else if (daysOverdue <= 60) payableAging.days60 += amt;
      else payableAging.days90plus += amt;
    });

    return res.status(200).json({
      success: true,
      connected: true,
      data: {
        summary: {
          total_revenue: Math.round(totalRevenue),
          total_expenses: Math.round(totalExpenses),
          net_profit: Math.round(totalRevenue - totalExpenses),
          profit_margin: totalRevenue > 0 ? Math.round(((totalRevenue - totalExpenses) / totalRevenue) * 100) : 0,
          cash_balance: Math.round(totalCash),
          accounts_receivable: Math.round(totalReceivable),
          accounts_payable: Math.round(totalPayable),
          overdue_receivable: Math.round(overdueReceivable),
          overdue_payable: Math.round(overduePayable),
          invoice_count: allInvoices.length,
          bill_count: allBills.length,
          quote_count: allQuotes.length
        },
        pl_summary: {
          income: Math.round(plIncome),
          expenses: Math.round(plExpenses),
          net_profit: Math.round(plIncome - plExpenses)
        },
        trend: trendData,
        receivable_aging: {
          current: Math.round(receivableAging.current),
          days_30: Math.round(receivableAging.days30),
          days_60: Math.round(receivableAging.days60),
          days_90_plus: Math.round(receivableAging.days90plus)
        },
        payable_aging: {
          current: Math.round(payableAging.current),
          days_30: Math.round(payableAging.days30),
          days_60: Math.round(payableAging.days60),
          days_90_plus: Math.round(payableAging.days90plus)
        },
        providers: {
          xero: xeroAccounts.length,
          quickbooks: qbAccounts.length
        }
      }
    });
  } catch (err) {
    console.error('[bi-financial] error:', err.message || err);
    return res.status(500).json({ error: 'Could not fetch financial data. Please try again.' });
  }
}
