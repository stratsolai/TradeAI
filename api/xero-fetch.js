// api/xero-fetch.js — Task 13 Tool Connections
// Shared data access layer for Xero. Any tool can call this endpoint
// with an action parameter. Handles token refresh, API calls, and
// data normalisation. Never exposes tokens to the browser.
//
// Supported actions: invoices, bills, contacts, items, quotes, jobs,
// pl_summary, pl_breakdown, balances

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

// Xero JSON API returns dates as "/Date(epochms+0000)/" rather than ISO.
// Downstream BI code does string comparisons against ISO dates, so normalise
// at the source.
function xeroDate(s) {
  if (!s) return '';
  var m = /\/Date\((-?\d+)/.exec(s);
  if (m) return new Date(parseInt(m[1], 10)).toISOString().substring(0, 10);
  return (typeof s === 'string' && s.length >= 10) ? s.substring(0, 10) : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  const { action, tenantId } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action parameter' });
  if (!tenantId) return res.status(400).json({ error: 'Missing tenantId parameter' });

  // Load account entry
  const profileRes = await supabase
    .from('profiles')
    .select('cl_xero_accounts')
    .eq('id', user.id)
    .maybeSingle();
  if (profileRes.error) return res.status(500).json({ error: 'Could not load profile' });

  const accounts = Array.isArray(profileRes.data && profileRes.data.cl_xero_accounts)
    ? profileRes.data.cl_xero_accounts : [];
  const account = accounts.find(function (a) { return a && a.tenant_id === tenantId; });
  if (!account) return res.status(404).json({ error: 'Xero account not found for this tenant' });

  // Token refresh helper
  async function refreshToken() {
    if (!account.refresh_token) return false;
    try {
      const basicAuth = Buffer.from(XERO_CLIENT_ID + ':' + XERO_CLIENT_SECRET).toString('base64');
      const tokenRes = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + basicAuth,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: account.refresh_token,
        }).toString(),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error || !tokenData.access_token) return false;
      account.access_token = tokenData.access_token;
      if (tokenData.refresh_token) account.refresh_token = tokenData.refresh_token;
      // Write updated tokens back to profiles
      var idx = accounts.findIndex(function (a) { return a && a.tenant_id === tenantId; });
      if (idx > -1) {
        accounts[idx] = account;
        await supabase.from('profiles').update({ cl_xero_accounts: accounts }).eq('id', user.id);
      }
      return true;
    } catch (e) {
      console.error('Xero token refresh failed:', e && e.message);
      return false;
    }
  }

  // API call helper with automatic token refresh on 401
  async function xeroGet(path) {
    var url = XERO_API_BASE + path;
    var resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + account.access_token,
        'Xero-tenant-id': tenantId,
        'Accept': 'application/json',
      },
    });
    if (resp.status === 401) {
      var refreshed = await refreshToken();
      if (!refreshed) throw new Error('Token expired and refresh failed');
      resp = await fetch(url, {
        headers: {
          'Authorization': 'Bearer ' + account.access_token,
          'Xero-tenant-id': tenantId,
          'Accept': 'application/json',
        },
      });
    }
    if (!resp.ok) throw new Error('Xero API error: ' + resp.status + ' ' + resp.statusText);
    return resp.json();
  }

  // Xero Projects API uses a different base URL
  async function xeroProjectsGet(path) {
    var url = 'https://api.xero.com/projects.xro/2.0' + path;
    var resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + account.access_token,
        'Xero-tenant-id': tenantId,
        'Accept': 'application/json',
      },
    });
    if (resp.status === 401) {
      var refreshed = await refreshToken();
      if (!refreshed) throw new Error('Token expired and refresh failed');
      resp = await fetch(url, {
        headers: {
          'Authorization': 'Bearer ' + account.access_token,
          'Xero-tenant-id': tenantId,
          'Accept': 'application/json',
        },
      });
    }
    // 403 means Projects not enabled — return empty
    if (resp.status === 403 || resp.status === 404) return null;
    if (!resp.ok) throw new Error('Xero Projects API error: ' + resp.status);
    return resp.json();
  }

  try {
    var result;

    if (action === 'invoices') {
      var data = await xeroGet('/Invoices?where=Type%3D%3D%22ACCREC%22&order=Date%20DESC');
      result = (data.Invoices || []).map(function (inv) {
        return {
          invoice_number: inv.InvoiceNumber || '',
          date: xeroDate(inv.Date),
          due_date: xeroDate(inv.DueDate),
          contact_name: (inv.Contact && inv.Contact.Name) || '',
          status: inv.Status || '',
          amount_excl_gst: inv.SubTotal || 0,
          amount_incl_gst: inv.Total || 0,
          line_items: (inv.LineItems || []).map(function (li) {
            return { description: li.Description || '', amount_excl_gst: li.LineAmount || 0, amount_incl_gst: (li.LineAmount || 0) + (li.TaxAmount || 0) };
          }),
          platform: 'xero'
        };
      });
    } else if (action === 'bills') {
      var data2 = await xeroGet('/Invoices?where=Type%3D%3D%22ACCPAY%22&order=Date%20DESC');
      result = (data2.Invoices || []).map(function (inv) {
        return {
          invoice_number: inv.InvoiceNumber || '',
          date: xeroDate(inv.Date),
          due_date: xeroDate(inv.DueDate),
          contact_name: (inv.Contact && inv.Contact.Name) || '',
          status: inv.Status || '',
          amount_excl_gst: inv.SubTotal || 0,
          amount_incl_gst: inv.Total || 0,
          line_items: (inv.LineItems || []).map(function (li) {
            return { description: li.Description || '', amount_excl_gst: li.LineAmount || 0, amount_incl_gst: (li.LineAmount || 0) + (li.TaxAmount || 0) };
          }),
          platform: 'xero'
        };
      });
    } else if (action === 'contacts') {
      var data3 = await xeroGet('/Contacts?order=Name');
      result = (data3.Contacts || []).map(function (c) {
        var phone = '';
        if (Array.isArray(c.Phones)) {
          var ph = c.Phones.find(function (p) { return p.PhoneNumber; });
          if (ph) phone = (ph.PhoneCountryCode ? '+' + ph.PhoneCountryCode + ' ' : '') + (ph.PhoneAreaCode || '') + ph.PhoneNumber;
        }
        return {
          contact_name: c.Name || '',
          email: c.EmailAddress || '',
          phone: phone,
          contact_type: c.IsCustomer ? 'customer' : c.IsSupplier ? 'supplier' : 'other',
          platform: 'xero'
        };
      });
    } else if (action === 'items') {
      var data4 = await xeroGet('/Items');
      result = (data4.Items || []).map(function (it) {
        return {
          item_code: it.Code || '',
          item_name: it.Name || '',
          description: it.Description || it.PurchaseDescription || '',
          unit_price_excl: (it.SalesDetails && it.SalesDetails.UnitPrice) || 0,
          unit_price_incl: (it.SalesDetails && it.SalesDetails.UnitPrice) ? (it.SalesDetails.UnitPrice * 1.1) : 0,
          is_sold: it.IsSold || false,
          is_purchased: it.IsPurchased || false,
          platform: 'xero'
        };
      });
    } else if (action === 'quotes') {
      var data5 = await xeroGet('/Quotes?order=Date%20DESC');
      result = (data5.Quotes || []).map(function (q) {
        return {
          quote_number: q.QuoteNumber || '',
          date: xeroDate(q.Date),
          contact_name: (q.Contact && q.Contact.Name) || '',
          status: q.Status || '',
          amount_excl_gst: q.SubTotal || 0,
          amount_incl_gst: q.Total || 0,
          line_items: (q.LineItems || []).map(function (li) {
            return { description: li.Description || '', amount_excl_gst: li.LineAmount || 0, amount_incl_gst: (li.LineAmount || 0) + (li.TaxAmount || 0) };
          }),
          raw_document: q,
          platform: 'xero'
        };
      });
    } else if (action === 'jobs') {
      var projectsData = await xeroProjectsGet('/projects');
      if (!projectsData || !projectsData.items) {
        result = [];
      } else {
        result = (projectsData.items || []).map(function (j) {
          // Xero Projects v2 fields: totalInvoiced and totalExpenseAmount
          // (the latter was previously read as j.totalExpense, which does
          // not exist on the response and produced costs = 0 everywhere).
          var income = j.totalInvoiced || {};
          var costs = j.totalExpenseAmount || {};
          var incExcl = (income.value || 0);
          var costExcl = (costs.value || 0);
          return {
            job_name: j.name || '',
            job_number: j.projectId || '',
            status: j.status || '',
            contact_name: (j.contactName) || '',
            income_excl_gst: incExcl,
            income_incl_gst: incExcl * 1.1,
            costs_excl_gst: costExcl,
            costs_incl_gst: costExcl * 1.1,
            profit_margin: incExcl > 0 ? Math.round(((incExcl - costExcl) / incExcl) * 100) : 0,
            platform: 'xero'
          };
        });
      }
    } else if (action === 'pl_summary') {
      // Profit & Loss for current financial year
      var now = new Date();
      var fyStart = now.getMonth() >= 6
        ? new Date(now.getFullYear(), 6, 1)
        : new Date(now.getFullYear() - 1, 6, 1);
      var fromDate = fyStart.toISOString().split('T')[0];
      var toDate = now.toISOString().split('T')[0];
      var data6 = await xeroGet('/Reports/ProfitAndLoss?fromDate=' + fromDate + '&toDate=' + toDate);
      var report = data6.Reports && data6.Reports[0];
      var totalIncome = 0;
      var totalExpenses = 0;
      if (report && Array.isArray(report.Rows)) {
        report.Rows.forEach(function (section) {
          if (section.RowType === 'Section' && section.Title === 'Income') {
            var summaryRow = (section.Rows || []).find(function (r) { return r.RowType === 'SummaryRow'; });
            if (summaryRow && summaryRow.Cells && summaryRow.Cells[1]) totalIncome = parseFloat(summaryRow.Cells[1].Value) || 0;
          }
          if (section.RowType === 'Section' && section.Title === 'Less Operating Expenses') {
            var summaryRow2 = (section.Rows || []).find(function (r) { return r.RowType === 'SummaryRow'; });
            if (summaryRow2 && summaryRow2.Cells && summaryRow2.Cells[1]) totalExpenses = parseFloat(summaryRow2.Cells[1].Value) || 0;
          }
        });
      }
      result = {
        period_start: fromDate,
        period_end: toDate,
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_profit: totalIncome - totalExpenses,
        platform: 'xero'
      };
    } else if (action === 'pl_breakdown') {
      // Profit & Loss with monthly breakdown for the rolling 11 months
      // ending in the current month. Xero's periods parameter is capped
      // at 11, which limits us to 11 monthly columns. Returns income,
      // cost-of-sales, and operating-expense rows broken out by account,
      // each with a monthly total array, plus the column headers from
      // the report.
      var nowB = new Date();
      var fromDateB = new Date(nowB.getFullYear(), nowB.getMonth() - 10, 1).toISOString().split('T')[0];
      var toDateB = new Date(nowB.getFullYear(), nowB.getMonth() + 1, 0).toISOString().split('T')[0];
      var monthsCount = 11;
      var urlB = '/Reports/ProfitAndLoss?fromDate=' + fromDateB + '&toDate=' + toDateB + '&periods=' + monthsCount + '&timeframe=MONTH';
      var dataB = await xeroGet(urlB);
      var reportB = dataB.Reports && dataB.Reports[0];

      var monthLabels = [];
      var income = { categories: [] };
      var cogs = { categories: [] };
      var expenses = { categories: [] };

      if (reportB && Array.isArray(reportB.Rows)) {
        // First pass: header row gives month labels (skip first cell = label, last cell = period total)
        var headerRow = reportB.Rows.find(function (r) { return r.RowType === 'Header'; });
        if (headerRow && Array.isArray(headerRow.Cells)) {
          for (var hi = 1; hi < headerRow.Cells.length; hi++) {
            monthLabels.push((headerRow.Cells[hi] && headerRow.Cells[hi].Value) || '');
          }
          // The final column when periods>1 is the period total — drop it
          if (monthLabels.length > 1) monthLabels.pop();
        }

        reportB.Rows.forEach(function (section) {
          if (section.RowType !== 'Section') return;
          var bucket = null;
          var title = section.Title || '';
          if (title === 'Income') bucket = income;
          else if (title.indexOf('Cost of Sales') !== -1) bucket = cogs;
          else if (title.indexOf('Operating Expenses') !== -1) bucket = expenses;
          else return;

          (section.Rows || []).forEach(function (row) {
            if (row.RowType !== 'Row' || !Array.isArray(row.Cells)) return;
            var name = (row.Cells[0] && row.Cells[0].Value) || 'Unknown';
            var monthly = [];
            // Cells[1..n] are monthly amounts; if more than one month, the last cell is the period total
            var amountCells = row.Cells.slice(1);
            if (amountCells.length > 1) amountCells = amountCells.slice(0, -1);
            for (var mi = 0; mi < amountCells.length; mi++) {
              monthly.push(parseFloat(amountCells[mi].Value) || 0);
            }
            var rowTotal = monthly.reduce(function (s, v) { return s + v; }, 0);
            bucket.categories.push({ name: name, total: rowTotal, monthly: monthly });
          });
        });
      }

      result = {
        period_start: fromDateB,
        period_end: toDateB,
        months: monthLabels,
        income: income,
        cost_of_sales: cogs,
        expenses: expenses,
        platform: 'xero'
      };
    } else if (action === 'balances') {
      var data7 = await xeroGet('/Reports/BalanceSheet');
      var bsReport = data7.Reports && data7.Reports[0];
      var cash = 0;
      var receivable = 0;
      var payable = 0;
      if (bsReport && Array.isArray(bsReport.Rows)) {
        bsReport.Rows.forEach(function (section) {
          if (section.RowType !== 'Section') return;
          (section.Rows || []).forEach(function (row) {
            if (row.RowType !== 'Row' || !row.Cells) return;
            var label = (row.Cells[0] && row.Cells[0].Value) || '';
            var val = (row.Cells[1] && parseFloat(row.Cells[1].Value)) || 0;
            if (label.indexOf('Bank') !== -1 || label.indexOf('Cash') !== -1) cash += val;
            if (label.indexOf('Accounts Receivable') !== -1) receivable += val;
            if (label.indexOf('Accounts Payable') !== -1) payable += val;
          });
        });
      }
      result = {
        cash_balance: cash,
        accounts_receivable: receivable,
        accounts_payable: payable,
        as_at_date: new Date().toISOString().split('T')[0],
        platform: 'xero'
      };
    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('xero-fetch error:', action, err && err.message);
    return res.status(500).json({ error: (err && err.message) || 'Xero API request failed' });
  }
}
