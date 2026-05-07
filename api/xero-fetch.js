// api/xero-fetch.js — Task 13 Tool Connections
// Shared data access layer for Xero. Any tool can call this endpoint
// with an action parameter. Handles token refresh, API calls, and
// data normalisation. Never exposes tokens to the browser.
//
// Supported actions: invoices, bills, contacts, items, quotes, jobs,
// pl_summary, pl_summary_prior_year, pl_breakdown, balances,
// aged_receivables
//
// Caching: responses are cached in cl_xero_cache for 15 minutes per
// (user_id, tenant_id, action). Callers can pass bypassCache: true in
// the request body to skip the cache (e.g. when the user clicks the
// BI dashboard's Refresh Data button).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CONCURRENT_PER_TENANT = 4;
const MAX_429_RETRIES = 2;
const FALLBACK_RETRY_DELAY_MS = 2000;

// Per-tenant concurrency limiter — caps Xero calls at 4 in-flight per
// tenant within this Vercel instance. Vercel runs multiple instances
// in parallel under load, so this is best-effort: it keeps a single
// warm function from blowing past Xero's 5-concurrent-per-tenant
// limit when bi-* endpoints fan out, but does not coordinate across
// instances. The 429 retry below is the real recovery path.
const TENANT_SEMAPHORES = Object.create(null);

// In-flight Promise map — when two parallel requests for the same
// (user, tenant, action) land on this warm Vercel instance, the
// second awaits the first's Promise instead of running its own fetch.
// This is the parallel-burst counterpart to the cl_xero_cache table
// (which dedupes sequential calls). Across instances, the cache is
// the only mechanism — the Map only sees calls on this instance.
const INFLIGHT = new Map();

function acquireSlot(tenantId) {
  var sem = TENANT_SEMAPHORES[tenantId];
  if (!sem) {
    sem = TENANT_SEMAPHORES[tenantId] = { active: 0, queue: [] };
  }
  if (sem.active < MAX_CONCURRENT_PER_TENANT) {
    sem.active++;
    return Promise.resolve();
  }
  return new Promise(function (resolve) {
    sem.queue.push(function () { sem.active++; resolve(); });
  });
}

function releaseSlot(tenantId) {
  var sem = TENANT_SEMAPHORES[tenantId];
  if (!sem) return;
  sem.active = Math.max(0, sem.active - 1);
  if (sem.queue.length > 0) sem.queue.shift()();
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

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

  const { action, tenantId, bypassCache } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action parameter' });
  if (!tenantId) return res.status(400).json({ error: 'Missing tenantId parameter' });

  // ── Cache lookup ───────────────────────────────────────────────────
  // Skip when the caller passed bypassCache (Refresh Data button).
  // Cache hits return immediately without touching Xero.
  if (!bypassCache) {
    try {
      const cacheRes = await supabase
        .from('cl_xero_cache')
        .select('data, expires_at')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .eq('action', action)
        .maybeSingle();
      if (cacheRes.data && cacheRes.data.expires_at && cacheRes.data.expires_at > new Date().toISOString()) {
        return res.status(200).json({ success: true, data: cacheRes.data.data, cached: true });
      }
    } catch (e) {
      // Cache read errors are non-fatal — fall through to live fetch.
      console.error('[xero-fetch] cache read error:', e && e.message);
    }
  }

  // ── In-flight dedup ────────────────────────────────────────────────
  // If another request for the same (user, tenant, action) is already
  // running on this warm instance, await its result instead of starting
  // our own fetch. This is what stops bi-financial and bi-customers
  // both fetching invoices in parallel from each round-tripping to Xero.
  const inflightKey = user.id + ':' + tenantId + ':' + action;
  if (INFLIGHT.has(inflightKey)) {
    try {
      const sharedResult = await INFLIGHT.get(inflightKey);
      return res.status(200).json({ success: true, data: sharedResult, deduped: true });
    } catch (sharedErr) {
      // The shared in-flight call failed. Fall through and try our own.
    }
  }

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

  // Build the standard Xero auth headers. Pulled out so retry attempts
  // pick up a refreshed token without re-stating the header shape.
  function authHeaders() {
    return {
      'Authorization': 'Bearer ' + account.access_token,
      'Xero-tenant-id': tenantId,
      'Accept': 'application/json',
    };
  }

  // Single GET with concurrency-limited dispatch, 401-driven token
  // refresh, and 429 retry honouring Xero's Retry-After header. Used
  // by both the standard Xero API and the Projects API helpers.
  async function xeroFetchWithRetry(url) {
    await acquireSlot(tenantId);
    try {
      for (var attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
        var resp = await fetch(url, { headers: authHeaders() });

        if (resp.status === 401) {
          var refreshed = await refreshToken();
          if (!refreshed) throw new Error('Token expired and refresh failed');
          resp = await fetch(url, { headers: authHeaders() });
        }

        if (resp.status === 429) {
          if (attempt >= MAX_429_RETRIES) {
            throw new Error('Xero API error: 429 Too Many Requests (retries exhausted)');
          }
          var retryAfter = resp.headers.get('Retry-After');
          var waitMs = FALLBACK_RETRY_DELAY_MS;
          if (retryAfter) {
            var n = parseInt(retryAfter, 10);
            if (!isNaN(n) && n > 0) waitMs = n * 1000;
          }
          console.warn('[xero-fetch] 429 received — waiting ' + waitMs + 'ms before retry', { tenantId: tenantId, attempt: attempt + 1 });
          await sleep(waitMs);
          continue;
        }

        return resp;
      }
    } finally {
      releaseSlot(tenantId);
    }
  }

  // API call helper with automatic token refresh on 401 and 429 retry
  async function xeroGet(path) {
    var resp = await xeroFetchWithRetry(XERO_API_BASE + path);
    if (!resp.ok) throw new Error('Xero API error: ' + resp.status + ' ' + resp.statusText);
    return resp.json();
  }

  // Xero Projects API uses a different base URL
  async function xeroProjectsGet(path) {
    var resp = await xeroFetchWithRetry('https://api.xero.com/projects.xro/2.0' + path);
    // 403 means Projects not enabled — return empty
    if (resp.status === 403 || resp.status === 404) return null;
    if (!resp.ok) throw new Error('Xero Projects API error: ' + resp.status);
    return resp.json();
  }

  const workPromise = (async () => {
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
        var isCustomer = !!c.IsCustomer;
        var isSupplier = !!c.IsSupplier;
        var contactType = 'other';
        if (isCustomer && isSupplier) contactType = 'both';
        else if (isCustomer) contactType = 'customer';
        else if (isSupplier) contactType = 'supplier';
        return {
          contact_name: c.Name || '',
          email: c.EmailAddress || '',
          phone: phone,
          is_customer: isCustomer,
          is_supplier: isSupplier,
          contact_type: contactType,
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
    } else if (action === 'pl_summary_prior_year') {
      // Profit & Loss for the prior financial year — same parser as
      // pl_summary, used by BI to compute year-on-year revenue trend.
      var nowPY = new Date();
      var priorFyStart, priorFyEnd;
      if (nowPY.getMonth() >= 6) {
        // Current FY started 1 Jul of this calendar year — prior FY was
        // 1 Jul (year-1) to 30 Jun (year).
        priorFyStart = new Date(nowPY.getFullYear() - 1, 6, 1);
        priorFyEnd = new Date(nowPY.getFullYear(), 5, 30);
      } else {
        // Current FY started 1 Jul of last calendar year — prior FY was
        // 1 Jul (year-2) to 30 Jun (year-1).
        priorFyStart = new Date(nowPY.getFullYear() - 2, 6, 1);
        priorFyEnd = new Date(nowPY.getFullYear() - 1, 5, 30);
      }
      var fromDatePY = priorFyStart.toISOString().split('T')[0];
      var toDatePY = priorFyEnd.toISOString().split('T')[0];
      var dataPY = await xeroGet('/Reports/ProfitAndLoss?fromDate=' + fromDatePY + '&toDate=' + toDatePY);
      var reportPY = dataPY.Reports && dataPY.Reports[0];
      var totalIncomePY = 0;
      var totalExpensesPY = 0;
      if (reportPY && Array.isArray(reportPY.Rows)) {
        reportPY.Rows.forEach(function (section) {
          if (section.RowType === 'Section' && section.Title === 'Income') {
            var summaryRowPY = (section.Rows || []).find(function (r) { return r.RowType === 'SummaryRow'; });
            if (summaryRowPY && summaryRowPY.Cells && summaryRowPY.Cells[1]) totalIncomePY = parseFloat(summaryRowPY.Cells[1].Value) || 0;
          }
          if (section.RowType === 'Section' && section.Title === 'Less Operating Expenses') {
            var summaryRowPY2 = (section.Rows || []).find(function (r) { return r.RowType === 'SummaryRow'; });
            if (summaryRowPY2 && summaryRowPY2.Cells && summaryRowPY2.Cells[1]) totalExpensesPY = parseFloat(summaryRowPY2.Cells[1].Value) || 0;
          }
        });
      }
      result = {
        period_start: fromDatePY,
        period_end: toDatePY,
        total_income: totalIncomePY,
        total_expenses: totalExpensesPY,
        net_profit: totalIncomePY - totalExpensesPY,
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
    } else if (action === 'aged_receivables') {
      // Aged Receivables Report — parses the report's aging buckets and
      // returns a weighted-average days-outstanding figure used by BI to
      // populate the Strategic Plan "Average Time Customers Take to Pay"
      // field. Requires accounting.reports.aged.read scope.
      var dataAR = await xeroGet('/Reports/AgedReceivablesByContact');
      var reportAR = dataAR.Reports && dataAR.Reports[0];

      // Map each aging bucket header to a midpoint (days outstanding).
      // Match by substring so we tolerate Xero's various column-naming
      // conventions ("Current", "1 Month", "1-30 Days", etc.).
      function bucketMidpoint(label) {
        var l = (label || '').toLowerCase();
        if (l.indexOf('current') !== -1 || l.indexOf('not due') !== -1) return 0;
        if (l.indexOf('< 1 month') !== -1 || l.indexOf('1-30') !== -1 || l.indexOf('< 30') !== -1) return 15;
        if (l.indexOf('1 month') !== -1 || l.indexOf('31-60') !== -1) return 45;
        if (l.indexOf('2 month') !== -1 || l.indexOf('61-90') !== -1) return 75;
        if (l.indexOf('3+ month') !== -1 || l.indexOf('3 month') !== -1
            || l.indexOf('91+') !== -1 || l.indexOf('older') !== -1
            || l.indexOf('over 90') !== -1) return 120;
        return null;
      }

      // Pull bucket midpoints from the header row, indexed by column.
      var bucketDays = [];
      var totalCol = -1;
      if (reportAR && Array.isArray(reportAR.Rows)) {
        var headerRowAR = reportAR.Rows.find(function (r) { return r.RowType === 'Header'; });
        if (headerRowAR && Array.isArray(headerRowAR.Cells)) {
          for (var ci = 0; ci < headerRowAR.Cells.length; ci++) {
            var cellLabel = (headerRowAR.Cells[ci] && headerRowAR.Cells[ci].Value) || '';
            var mid = bucketMidpoint(cellLabel);
            bucketDays[ci] = mid;
            if ((cellLabel || '').toLowerCase().indexOf('total') !== -1) totalCol = ci;
          }
        }
      }

      // Sum amount × midpoint across all data rows and bucket columns.
      var weightedDays = 0;
      var totalBalance = 0;
      if (reportAR && Array.isArray(reportAR.Rows)) {
        reportAR.Rows.forEach(function (section) {
          if (section.RowType !== 'Section') return;
          (section.Rows || []).forEach(function (row) {
            if (row.RowType !== 'Row' || !Array.isArray(row.Cells)) return;
            // Skip the per-row total column when summing buckets, otherwise
            // the totalBalance double-counts.
            for (var bi = 0; bi < row.Cells.length; bi++) {
              if (bi === totalCol) continue;
              var midD = bucketDays[bi];
              if (midD == null) continue;
              var amt = parseFloat(row.Cells[bi].Value) || 0;
              if (!amt) continue;
              weightedDays += amt * midD;
              totalBalance += amt;
            }
          });
        });
      }

      result = {
        avg_debtor_days: totalBalance > 0 ? Math.round(weightedDays / totalBalance) : null,
        total_balance: Math.round(totalBalance),
        as_at_date: new Date().toISOString().split('T')[0],
        platform: 'xero'
      };
    } else {
      var unknownActionErr = new Error('Unknown action: ' + action);
      unknownActionErr.status = 400;
      throw unknownActionErr;
    }

    // ── Cache write ──────────────────────────────────────────────────
    // Upsert on the (user_id, tenant_id, action) unique key so a fresh
    // fetch overwrites any prior cached row. Failures here do not
    // affect the response — the data was retrieved successfully.
    try {
      var expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
      await supabase
        .from('cl_xero_cache')
        .upsert({
          user_id: user.id,
          tenant_id: tenantId,
          action: action,
          data: result,
          cached_at: new Date().toISOString(),
          expires_at: expiresAt,
        }, { onConflict: 'user_id,tenant_id,action' });
    } catch (e) {
      console.error('[xero-fetch] cache write error:', e && e.message);
    }

    return result;
  })();

  INFLIGHT.set(inflightKey, workPromise);

  try {
    const result = await workPromise;
    return res.status(200).json({ success: true, data: result, cached: false });
  } catch (err) {
    console.error('xero-fetch error:', action, err && err.message);
    return res.status(err.status || 500).json({ error: (err && err.message) || 'Xero API request failed' });
  } finally {
    INFLIGHT.delete(inflightKey);
  }
}
