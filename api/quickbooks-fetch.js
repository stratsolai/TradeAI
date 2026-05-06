// api/quickbooks-fetch.js — Task 13 Tool Connections
// Shared data access layer for QuickBooks Online. Any tool can call this
// endpoint with an action parameter. Handles token refresh, API calls,
// and data normalisation. Never exposes tokens to the browser.
//
// Supported actions: invoices, bills, contacts, items, quotes, jobs,
// pl_summary, balances
//
// Caching, concurrency limit, 429 retry and in-flight dedup are
// provided by lib/external-api-cache.js — same shape as the inline
// implementation in api/xero-fetch.js.

import { createClient } from '@supabase/supabase-js';
import {
  acquireSlot,
  releaseSlot,
  fetchWithRetry,
  readCache,
  writeCache,
  inflightKey,
  getInflight,
  setInflight,
  deleteInflight
} from '../lib/external-api-cache.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const QUICKBOOKS_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID;
const QUICKBOOKS_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;

const CACHE_TABLE = 'cl_quickbooks_cache';
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CONCURRENT_PER_REALM = 4;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  const { action, realmId, bypassCache } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action parameter' });
  if (!realmId) return res.status(400).json({ error: 'Missing realmId parameter' });

  const cacheKeyCols = { user_id: user.id, realm_id: realmId, action: action };

  // ── Cache lookup ───────────────────────────────────────────────────
  if (!bypassCache) {
    const cached = await readCache(supabase, CACHE_TABLE, cacheKeyCols);
    if (cached !== null) {
      return res.status(200).json({ success: true, data: cached, cached: true });
    }
  }

  // ── In-flight dedup ────────────────────────────────────────────────
  const ikey = inflightKey(CACHE_TABLE, cacheKeyCols);
  if (getInflight(ikey)) {
    try {
      const sharedResult = await getInflight(ikey);
      return res.status(200).json({ success: true, data: sharedResult, deduped: true });
    } catch (sharedErr) {
      // The shared in-flight call failed. Fall through and try our own.
    }
  }

  const workPromise = (async () => {
    // Load account entry
    const profileRes = await supabase
      .from('profiles')
      .select('cl_quickbooks_accounts')
      .eq('id', user.id)
      .maybeSingle();
    if (profileRes.error) {
      const e = new Error('Could not load profile'); e.status = 500; throw e;
    }

    const accounts = Array.isArray(profileRes.data && profileRes.data.cl_quickbooks_accounts)
      ? profileRes.data.cl_quickbooks_accounts : [];
    const account = accounts.find(function (a) { return a && a.realm_id === realmId; });
    if (!account) {
      const e = new Error('QuickBooks account not found for this realm'); e.status = 404; throw e;
    }

    const QB_BASE = 'https://quickbooks.api.intuit.com/v3/company/' + realmId;

    // Token refresh helper
    async function refreshToken() {
      if (!account.refresh_token) return false;
      try {
        const basicAuth = Buffer.from(QUICKBOOKS_CLIENT_ID + ':' + QUICKBOOKS_CLIENT_SECRET).toString('base64');
        const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
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
        var idx = accounts.findIndex(function (a) { return a && a.realm_id === realmId; });
        if (idx > -1) {
          accounts[idx] = account;
          await supabase.from('profiles').update({ cl_quickbooks_accounts: accounts }).eq('id', user.id);
        }
        return true;
      } catch (e) {
        console.error('QuickBooks token refresh failed:', e && e.message);
        return false;
      }
    }

    function authHeaders() {
      return {
        'Authorization': 'Bearer ' + account.access_token,
        'Accept': 'application/json',
      };
    }

    // Concurrency-limited GET with 401-driven token refresh and 429 retry.
    async function qbGet(path) {
      var url = QB_BASE + path;
      await acquireSlot(realmId, MAX_CONCURRENT_PER_REALM);
      try {
        var resp = await fetchWithRetry(async function () {
          var r = await fetch(url, { headers: authHeaders() });
          if (r.status === 401) {
            var refreshed = await refreshToken();
            if (!refreshed) throw new Error('Token expired and refresh failed');
            r = await fetch(url, { headers: authHeaders() });
          }
          return r;
        }, { providerLabel: 'QuickBooks' });
        if (!resp.ok) throw new Error('QuickBooks API error: ' + resp.status + ' ' + resp.statusText);
        return resp.json();
      } finally {
        releaseSlot(realmId);
      }
    }

    function qbQuery(query) {
      return qbGet('/query?query=' + encodeURIComponent(query));
    }

    var result;

    if (action === 'invoices') {
      var data = await qbQuery('SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 200');
      result = ((data.QueryResponse && data.QueryResponse.Invoice) || []).map(function (inv) {
        return {
          invoice_number: inv.DocNumber || '',
          date: inv.TxnDate || '',
          due_date: inv.DueDate || '',
          contact_name: (inv.CustomerRef && inv.CustomerRef.name) || '',
          status: inv.Balance === 0 ? 'Paid' : 'Open',
          amount_excl_gst: (inv.TotalAmt || 0) - (inv.TxnTaxDetail && inv.TxnTaxDetail.TotalTax || 0),
          amount_incl_gst: inv.TotalAmt || 0,
          line_items: (inv.Line || []).filter(function (li) { return li.DetailType === 'SalesItemLineDetail'; }).map(function (li) {
            var detail = li.SalesItemLineDetail || {};
            return {
              description: li.Description || '',
              amount_excl_gst: li.Amount || 0,
              amount_incl_gst: li.Amount ? li.Amount * (1 + ((detail.TaxCodeRef && detail.TaxCodeRef.value === 'TAX') ? 0.1 : 0)) : 0
            };
          }),
          platform: 'quickbooks'
        };
      });
    } else if (action === 'bills') {
      var data2 = await qbQuery('SELECT * FROM Bill ORDER BY TxnDate DESC MAXRESULTS 200');
      result = ((data2.QueryResponse && data2.QueryResponse.Bill) || []).map(function (bill) {
        return {
          invoice_number: bill.DocNumber || '',
          date: bill.TxnDate || '',
          due_date: bill.DueDate || '',
          contact_name: (bill.VendorRef && bill.VendorRef.name) || '',
          status: bill.Balance === 0 ? 'Paid' : 'Open',
          amount_excl_gst: (bill.TotalAmt || 0) - (bill.TxnTaxDetail && bill.TxnTaxDetail.TotalTax || 0),
          amount_incl_gst: bill.TotalAmt || 0,
          line_items: (bill.Line || []).filter(function (li) { return li.DetailType === 'ItemBasedExpenseLineDetail' || li.DetailType === 'AccountBasedExpenseLineDetail'; }).map(function (li) {
            return {
              description: li.Description || '',
              amount_excl_gst: li.Amount || 0,
              amount_incl_gst: li.Amount ? li.Amount * 1.1 : 0
            };
          }),
          platform: 'quickbooks'
        };
      });
    } else if (action === 'contacts') {
      // Fetch customers and vendors separately then merge
      var custData = await qbQuery('SELECT * FROM Customer ORDER BY DisplayName MAXRESULTS 500');
      var vendData = await qbQuery('SELECT * FROM Vendor ORDER BY DisplayName MAXRESULTS 500');
      var customers = ((custData.QueryResponse && custData.QueryResponse.Customer) || []).map(function (c) {
        return {
          contact_name: c.DisplayName || '',
          email: (c.PrimaryEmailAddr && c.PrimaryEmailAddr.Address) || '',
          phone: (c.PrimaryPhone && c.PrimaryPhone.FreeFormNumber) || '',
          contact_type: 'customer',
          platform: 'quickbooks'
        };
      });
      var vendors = ((vendData.QueryResponse && vendData.QueryResponse.Vendor) || []).map(function (v) {
        return {
          contact_name: v.DisplayName || '',
          email: (v.PrimaryEmailAddr && v.PrimaryEmailAddr.Address) || '',
          phone: (v.PrimaryPhone && v.PrimaryPhone.FreeFormNumber) || '',
          contact_type: 'supplier',
          platform: 'quickbooks'
        };
      });
      result = customers.concat(vendors);
    } else if (action === 'items') {
      var data4 = await qbQuery('SELECT * FROM Item MAXRESULTS 500');
      result = ((data4.QueryResponse && data4.QueryResponse.Item) || []).map(function (it) {
        return {
          item_code: it.Sku || '',
          item_name: it.Name || '',
          description: it.Description || '',
          unit_price_excl: it.UnitPrice || 0,
          unit_price_incl: (it.UnitPrice || 0) * 1.1,
          is_sold: it.Type === 'Service' || it.Type === 'Inventory' || it.IncomeAccountRef != null,
          is_purchased: it.ExpenseAccountRef != null || it.PurchaseCost > 0,
          platform: 'quickbooks'
        };
      });
    } else if (action === 'quotes') {
      var data5 = await qbQuery('SELECT * FROM Estimate ORDER BY TxnDate DESC MAXRESULTS 200');
      result = ((data5.QueryResponse && data5.QueryResponse.Estimate) || []).map(function (q) {
        return {
          quote_number: q.DocNumber || '',
          date: q.TxnDate || '',
          contact_name: (q.CustomerRef && q.CustomerRef.name) || '',
          status: q.TxnStatus || '',
          amount_excl_gst: (q.TotalAmt || 0) - (q.TxnTaxDetail && q.TxnTaxDetail.TotalTax || 0),
          amount_incl_gst: q.TotalAmt || 0,
          line_items: (q.Line || []).filter(function (li) { return li.DetailType === 'SalesItemLineDetail'; }).map(function (li) {
            return {
              description: li.Description || '',
              amount_excl_gst: li.Amount || 0,
              amount_incl_gst: li.Amount ? li.Amount * 1.1 : 0
            };
          }),
          raw_document: q,
          platform: 'quickbooks'
        };
      });
    } else if (action === 'jobs') {
      // QuickBooks uses sub-customers as projects/jobs
      var data6 = await qbQuery('SELECT * FROM Customer WHERE Job = true MAXRESULTS 200');
      result = ((data6.QueryResponse && data6.QueryResponse.Customer) || []).map(function (j) {
        return {
          job_name: j.DisplayName || '',
          job_number: j.Id || '',
          status: j.Active ? 'Active' : 'Inactive',
          contact_name: (j.ParentRef && j.ParentRef.name) || j.DisplayName || '',
          income_excl_gst: 0,
          income_incl_gst: 0,
          costs_excl_gst: 0,
          costs_incl_gst: 0,
          profit_margin: 0,
          platform: 'quickbooks'
        };
      });
    } else if (action === 'pl_summary') {
      // Use QuickBooks ProfitAndLoss report
      var now = new Date();
      // Australian FY starts 1 July
      var fyStart = now.getMonth() >= 6
        ? new Date(now.getFullYear(), 6, 1)
        : new Date(now.getFullYear() - 1, 6, 1);
      var fromDate = fyStart.toISOString().split('T')[0];
      var toDate = now.toISOString().split('T')[0];
      var data7 = await qbGet('/reports/ProfitAndLoss?start_date=' + fromDate + '&end_date=' + toDate);
      var totalIncome = 0;
      var totalExpenses = 0;
      if (data7 && data7.Rows && Array.isArray(data7.Rows.Row)) {
        data7.Rows.Row.forEach(function (section) {
          if (section.group === 'Income' && section.Summary && section.Summary.ColData) {
            totalIncome = parseFloat(section.Summary.ColData[1] && section.Summary.ColData[1].value) || 0;
          }
          if (section.group === 'Expenses' && section.Summary && section.Summary.ColData) {
            totalExpenses = parseFloat(section.Summary.ColData[1] && section.Summary.ColData[1].value) || 0;
          }
        });
      }
      result = {
        period_start: fromDate,
        period_end: toDate,
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_profit: totalIncome - totalExpenses,
        platform: 'quickbooks'
      };
    } else if (action === 'balances') {
      var data8 = await qbGet('/reports/BalanceSheet');
      var cash = 0;
      var receivable = 0;
      var payable = 0;
      function walkRows(rows) {
        if (!Array.isArray(rows)) return;
        rows.forEach(function (row) {
          if (row.ColData && row.ColData[0]) {
            var label = row.ColData[0].value || '';
            var val = parseFloat(row.ColData[1] && row.ColData[1].value) || 0;
            if (label.indexOf('Bank') !== -1 || label.indexOf('Cash') !== -1 || label.indexOf('Checking') !== -1) cash += val;
            if (label.indexOf('Accounts Receivable') !== -1) receivable += val;
            if (label.indexOf('Accounts Payable') !== -1) payable += val;
          }
          if (row.Rows && row.Rows.Row) walkRows(row.Rows.Row);
        });
      }
      if (data8 && data8.Rows && data8.Rows.Row) walkRows(data8.Rows.Row);
      result = {
        cash_balance: cash,
        accounts_receivable: receivable,
        accounts_payable: payable,
        as_at_date: new Date().toISOString().split('T')[0],
        platform: 'quickbooks'
      };
    } else {
      var unknownErr = new Error('Unknown action: ' + action);
      unknownErr.status = 400;
      throw unknownErr;
    }

    await writeCache(supabase, CACHE_TABLE, cacheKeyCols, result, CACHE_TTL_MS);
    return result;
  })();

  setInflight(ikey, workPromise);

  try {
    const result = await workPromise;
    return res.status(200).json({ success: true, data: result, cached: false });
  } catch (err) {
    console.error('quickbooks-fetch error:', action, err && err.message);
    return res.status(err.status || 500).json({ error: (err && err.message) || 'QuickBooks API request failed' });
  } finally {
    deleteInflight(ikey);
  }
}
