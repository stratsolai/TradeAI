// api/bi-customers.js — BI Dashboard customer analysis aggregator
// Fetches invoice and contact data from all connected accounting providers,
// aggregates into customer revenue analysis, concentration metrics,
// and quote conversion data.

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
      console.error('[bi-customers] ' + endpoint + ' error:', err.message);
      return null;
    }
  }

  try {
    var allInvoices = [];
    var allQuotes = [];
    var allContacts = [];
    var promises = [];

    for (var x = 0; x < xeroAccounts.length; x++) {
      var xa = xeroAccounts[x];
      if (!xa || !xa.tenant_id) continue;
      var tid = xa.tenant_id;
      promises.push(
        callFetch('xero-fetch', { action: 'invoices', tenantId: tid, bypassCache: bypassCache }).then(function(d) { if (d) allInvoices = allInvoices.concat(d); }),
        callFetch('xero-fetch', { action: 'quotes', tenantId: tid, bypassCache: bypassCache }).then(function(d) { if (d) allQuotes = allQuotes.concat(d); }),
        callFetch('xero-fetch', { action: 'contacts', tenantId: tid, bypassCache: bypassCache }).then(function(d) { if (d) allContacts = allContacts.concat(d); })
      );
    }

    for (var q = 0; q < qbAccounts.length; q++) {
      var qa = qbAccounts[q];
      if (!qa || !qa.realm_id) continue;
      var rid = qa.realm_id;
      promises.push(
        callFetch('quickbooks-fetch', { action: 'invoices', realmId: rid }).then(function(d) { if (d) allInvoices = allInvoices.concat(d); }),
        callFetch('quickbooks-fetch', { action: 'quotes', realmId: rid }).then(function(d) { if (d) allQuotes = allQuotes.concat(d); }),
        callFetch('quickbooks-fetch', { action: 'contacts', realmId: rid }).then(function(d) { if (d) allContacts = allContacts.concat(d); })
      );
    }

    await Promise.all(promises);

    if (fromDate || toDate) {
      var fDate = fromDate || '1900-01-01';
      var tDate = toDate || '2999-12-31';
      allInvoices = allInvoices.filter(function(inv) { var d = (inv.date || '').substring(0, 10); return d >= fDate && d <= tDate; });
      allQuotes = allQuotes.filter(function(q) { var d = (q.date || '').substring(0, 10); return d >= fDate && d <= tDate; });
    }

    // Revenue by customer
    var customerRevenue = {};
    allInvoices.forEach(function(inv) {
      var name = inv.contact_name || 'Unknown';
      if (!customerRevenue[name]) customerRevenue[name] = { revenue: 0, count: 0, first_date: inv.date, last_date: inv.date };
      customerRevenue[name].revenue += inv.amount_excl_gst || 0;
      customerRevenue[name].count += 1;
      if (inv.date < customerRevenue[name].first_date) customerRevenue[name].first_date = inv.date;
      if (inv.date > customerRevenue[name].last_date) customerRevenue[name].last_date = inv.date;
    });

    var customerList = Object.keys(customerRevenue).map(function(name) {
      return {
        name: name,
        revenue: Math.round(customerRevenue[name].revenue),
        invoice_count: customerRevenue[name].count,
        first_invoice: customerRevenue[name].first_date,
        last_invoice: customerRevenue[name].last_date
      };
    });
    customerList.sort(function(a, b) { return b.revenue - a.revenue; });

    var totalRevenue = customerList.reduce(function(sum, c) { return sum + c.revenue; }, 0);

    // Top 10 customers
    var top10 = customerList.slice(0, 10).map(function(c) {
      return {
        name: c.name,
        revenue: c.revenue,
        percentage: totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 100) : 0,
        invoice_count: c.invoice_count
      };
    });

    // Concentration — top 3 share
    var top3Revenue = customerList.slice(0, 3).reduce(function(sum, c) { return sum + c.revenue; }, 0);
    var concentrationPct = totalRevenue > 0 ? Math.round((top3Revenue / totalRevenue) * 100) : 0;

    // New vs repeat by month
    var customerFirstMonth = {};
    customerList.forEach(function(c) {
      var month = (c.first_invoice || '').substring(0, 7);
      if (month) {
        if (!customerFirstMonth[month]) customerFirstMonth[month] = 0;
        customerFirstMonth[month] += 1;
      }
    });

    var invoicesByMonth = {};
    allInvoices.forEach(function(inv) {
      var month = (inv.date || '').substring(0, 7);
      var name = inv.contact_name || 'Unknown';
      if (!month) return;
      if (!invoicesByMonth[month]) invoicesByMonth[month] = { newCustomers: 0, repeatCustomers: new Set() };
      var firstMonth = (customerRevenue[name] && customerRevenue[name].first_date || '').substring(0, 7);
      if (firstMonth === month) {
        invoicesByMonth[month].newCustomers = (customerFirstMonth[month] || 0);
      }
      invoicesByMonth[month].repeatCustomers.add(name);
    });

    var months = Object.keys(invoicesByMonth).sort();
    var newVsRepeat = months.map(function(m) {
      var entry = invoicesByMonth[m];
      var newCount = customerFirstMonth[m] || 0;
      var totalCustomers = entry.repeatCustomers.size;
      return {
        month: m,
        new_customers: newCount,
        repeat_customers: Math.max(0, totalCustomers - newCount)
      };
    });

    // Average invoice value
    var avgInvoiceValue = allInvoices.length > 0 ? Math.round(totalRevenue / allInvoices.length) : 0;

    // Quote conversion
    var totalQuotes = allQuotes.length;
    var acceptedQuotes = allQuotes.filter(function(q) {
      var s = (q.status || '').toLowerCase();
      return s === 'accepted' || s === 'invoiced' || s === 'approved';
    }).length;
    var conversionRate = totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0;

    // Inactive customers — last invoice > 60 days ago
    var sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    var cutoff = sixtyDaysAgo.toISOString().split('T')[0];
    var inactiveCustomers = customerList.filter(function(c) {
      return c.last_invoice && c.last_invoice.substring(0, 10) < cutoff && c.revenue > 0;
    });

    return res.status(200).json({
      success: true,
      connected: true,
      data: {
        summary: {
          total_customers: customerList.length,
          total_revenue: totalRevenue,
          avg_invoice_value: avgInvoiceValue,
          concentration_pct: concentrationPct,
          quote_count: totalQuotes,
          accepted_quotes: acceptedQuotes,
          conversion_rate: conversionRate,
          inactive_count: inactiveCustomers.length
        },
        top_customers: top10,
        new_vs_repeat: newVsRepeat,
        inactive_customers: inactiveCustomers.slice(0, 10).map(function(c) {
          return { name: c.name, revenue: c.revenue, last_invoice: c.last_invoice };
        })
      }
    });
  } catch (err) {
    console.error('[bi-customers] error:', err.message || err);
    return res.status(500).json({ error: 'Could not fetch customer data. Please try again.' });
  }
}
