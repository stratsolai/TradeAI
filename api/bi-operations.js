// api/bi-operations.js — BI Dashboard expense & cost analysis aggregator
// Pulls P&L category breakdown and supplier bills from connected accounting
// providers (Xero today, QuickBooks if/when its fetch endpoint adds
// pl_breakdown). Computes:
//  - Total expenses, total cost of running the business (expenses + COGS)
//  - Top expense categories with % of total
//  - Largest cost centre
//  - Labour as % of revenue (account names matched on payroll keywords)
//  - Overhead categories (rent, utilities, insurance, subscriptions, lease)
//  - Supplier spend concentration (top 3 % of bill spend)
//  - Monthly expense totals for the current FY (seasonal pattern)
//
// ServiceM8 / Fergus / Buildxact job data has moved to api/bi-projects.js.

import { createClient } from '@supabase/supabase-js';
import { requireBpComplete } from '../lib/bp-gate.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = 'https://staxai.com.au';

const LABOUR_KEYWORDS = ['wages', 'salar', 'super', 'payroll', 'staff', 'employ', 'contractor labour'];
const OVERHEAD_KEYWORDS = ['rent', 'utili', 'insur', 'subscript', 'lease', 'electric', 'gas', 'water', 'internet'];

function matchesAny(name, keywords) {
  var lower = (name || '').toLowerCase();
  for (var i = 0; i < keywords.length; i++) {
    if (lower.indexOf(keywords[i]) !== -1) return true;
  }
  return false;
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
      console.error('[bi-operations] ' + endpoint + ' error:', err && err.message);
      return null;
    }
  }

  try {
    var breakdowns = [];
    var allBills = [];
    var promises = [];

    for (var x = 0; x < xeroAccounts.length; x++) {
      var xa = xeroAccounts[x];
      if (!xa || !xa.tenant_id) continue;
      var tid = xa.tenant_id;
      promises.push(
        callFetch('xero-fetch', { action: 'pl_breakdown', tenantId: tid, bypassCache: bypassCache }).then(function (d) { if (d) breakdowns.push(d); }),
        callFetch('xero-fetch', { action: 'bills', tenantId: tid, bypassCache: bypassCache }).then(function (d) { if (d) allBills = allBills.concat(d); })
      );
    }
    // QuickBooks pl_breakdown not yet implemented in quickbooks-fetch.
    // When it is, mirror the xero loop above.

    await Promise.all(promises);

    if (fromDate || toDate) {
      var fDate = fromDate || '1900-01-01';
      var tDate = toDate || '2999-12-31';
      allBills = allBills.filter(function (b) {
        var d = (b.date || '').substring(0, 10);
        return d >= fDate && d <= tDate;
      });
    }

    // Aggregate expense / COGS / income across all connected orgs
    var expenseCategories = {};
    var cogsCategories = {};
    var overheadCategories = {};
    var totalIncome = 0;
    var totalExpenses = 0;
    var totalCogs = 0;
    var labourTotal = 0;
    var months = [];
    var monthlyExpenseTotals = [];

    breakdowns.forEach(function (b) {
      if (Array.isArray(b.months) && b.months.length > months.length) months = b.months;

      ((b.income && b.income.categories) || []).forEach(function (c) {
        totalIncome += c.total || 0;
      });

      ((b.cost_of_sales && b.cost_of_sales.categories) || []).forEach(function (c) {
        if (!cogsCategories[c.name]) cogsCategories[c.name] = { name: c.name, total: 0, monthly: [] };
        cogsCategories[c.name].total += c.total || 0;
        totalCogs += c.total || 0;
        for (var i = 0; i < (c.monthly || []).length; i++) {
          cogsCategories[c.name].monthly[i] = (cogsCategories[c.name].monthly[i] || 0) + (c.monthly[i] || 0);
        }
        if (matchesAny(c.name, LABOUR_KEYWORDS)) labourTotal += c.total || 0;
      });

      ((b.expenses && b.expenses.categories) || []).forEach(function (c) {
        if (!expenseCategories[c.name]) expenseCategories[c.name] = { name: c.name, total: 0, monthly: [] };
        expenseCategories[c.name].total += c.total || 0;
        totalExpenses += c.total || 0;
        for (var j = 0; j < (c.monthly || []).length; j++) {
          expenseCategories[c.name].monthly[j] = (expenseCategories[c.name].monthly[j] || 0) + (c.monthly[j] || 0);
        }
        if (matchesAny(c.name, LABOUR_KEYWORDS)) labourTotal += c.total || 0;
        if (matchesAny(c.name, OVERHEAD_KEYWORDS)) {
          if (!overheadCategories[c.name]) overheadCategories[c.name] = { name: c.name, total: 0, monthly: [] };
          overheadCategories[c.name].total += c.total || 0;
          for (var k = 0; k < (c.monthly || []).length; k++) {
            overheadCategories[c.name].monthly[k] = (overheadCategories[c.name].monthly[k] || 0) + (c.monthly[k] || 0);
          }
        }
      });
    });

    // Monthly expense totals across all categories
    if (months.length > 0) {
      monthlyExpenseTotals = months.map(function (label, idx) {
        var sum = 0;
        Object.keys(expenseCategories).forEach(function (name) {
          var c = expenseCategories[name];
          sum += (c.monthly && c.monthly[idx]) || 0;
        });
        return { month: label, total: Math.round(sum) };
      });
    }

    // Sort and slice top categories
    function toSortedArray(obj) {
      return Object.keys(obj).map(function (k) { return obj[k]; }).sort(function (a, b) { return b.total - a.total; });
    }
    var topExpenses = toSortedArray(expenseCategories);
    var topOverheads = toSortedArray(overheadCategories);
    var topCogs = toSortedArray(cogsCategories);
    var largestCategory = topExpenses[0] || null;

    // Supplier concentration from bills (excl. GST)
    var supplierSpend = {};
    allBills.forEach(function (b) {
      var name = b.contact_name || 'Unknown';
      if (!supplierSpend[name]) supplierSpend[name] = 0;
      supplierSpend[name] += b.amount_excl_gst || 0;
    });
    var totalSupplierSpend = 0;
    Object.keys(supplierSpend).forEach(function (k) { totalSupplierSpend += supplierSpend[k]; });
    var supplierList = Object.keys(supplierSpend).map(function (name) {
      return {
        name: name,
        spend: Math.round(supplierSpend[name]),
        percentage: totalSupplierSpend > 0 ? Math.round((supplierSpend[name] / totalSupplierSpend) * 100) : 0
      };
    }).sort(function (a, b) { return b.spend - a.spend; });
    var top3SupplierSpend = supplierList.slice(0, 3).reduce(function (s, c) { return s + c.spend; }, 0);
    var supplierConcentrationPct = totalSupplierSpend > 0 ? Math.round((top3SupplierSpend / totalSupplierSpend) * 100) : 0;

    var labourPctRevenue = totalIncome > 0 ? Math.round((labourTotal / totalIncome) * 100) : 0;
    var totalCostOfBusiness = totalExpenses + totalCogs;

    return res.status(200).json({
      success: true,
      connected: true,
      data: {
        summary: {
          total_expenses: Math.round(totalExpenses),
          total_cogs: Math.round(totalCogs),
          total_cost_of_business: Math.round(totalCostOfBusiness),
          total_income: Math.round(totalIncome),
          largest_category: largestCategory ? largestCategory.name : 'Unknown',
          largest_category_amount: largestCategory ? Math.round(largestCategory.total) : 0,
          largest_category_pct: (largestCategory && totalExpenses > 0) ? Math.round((largestCategory.total / totalExpenses) * 100) : 0,
          labour_total: Math.round(labourTotal),
          labour_pct_revenue: labourPctRevenue,
          supplier_concentration_pct: supplierConcentrationPct,
          supplier_count: supplierList.length,
          expense_category_count: topExpenses.length
        },
        top_expense_categories: topExpenses.slice(0, 8).map(function (c) {
          return {
            name: c.name,
            total: Math.round(c.total),
            pct_of_total: totalExpenses > 0 ? Math.round((c.total / totalExpenses) * 100) : 0
          };
        }),
        top_overheads: topOverheads.slice(0, 6).map(function (c) {
          return {
            name: c.name,
            total: Math.round(c.total),
            monthly: (c.monthly || []).map(function (v) { return Math.round(v); })
          };
        }),
        top_cogs: topCogs.slice(0, 5).map(function (c) {
          return { name: c.name, total: Math.round(c.total) };
        }),
        top_suppliers: supplierList.slice(0, 10),
        months: months,
        monthly_expenses: monthlyExpenseTotals,
        providers: { xero: xeroAccounts.length, quickbooks: qbAccounts.length }
      }
    });
  } catch (err) {
    console.error('[bi-operations] error:', err && (err.message || err));
    return res.status(500).json({ error: 'Could not fetch operations data. Please try again.' });
  }
}
