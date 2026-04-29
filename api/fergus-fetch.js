// api/fergus-fetch.js — Task 13 Tool Connections
// Shared data access layer for Fergus. Any tool can call this endpoint
// with an action parameter. Handles token refresh, API calls, and data
// normalisation. Never exposes tokens to the browser.
//
// Supported actions: jobs, clients, invoices, quotes
//
// Note: Fergus API endpoints are based on their partner API documentation.
// If endpoints return errors, the API base URL or paths may need updating
// once Fergus confirms the exact API structure for this integration.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FERGUS_CLIENT_ID = process.env.FERGUS_CLIENT_ID;
const FERGUS_CLIENT_SECRET = process.env.FERGUS_CLIENT_SECRET;
const FERGUS_BASE = 'https://app.fergus.com/api/v2';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  const { action, accountName } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action parameter' });
  if (!accountName) return res.status(400).json({ error: 'Missing accountName parameter' });

  const profileRes = await supabase
    .from('profiles')
    .select('cl_fergus_accounts')
    .eq('id', user.id)
    .maybeSingle();
  if (profileRes.error) return res.status(500).json({ error: 'Could not load profile' });

  const accounts = Array.isArray(profileRes.data && profileRes.data.cl_fergus_accounts)
    ? profileRes.data.cl_fergus_accounts : [];
  const account = accounts.find(function (a) { return a && a.account_name === accountName; });
  if (!account) return res.status(404).json({ error: 'Fergus account not found' });

  async function refreshToken() {
    if (!account.refresh_token) return false;
    try {
      const tokenRes = await fetch('https://app.fergus.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: FERGUS_CLIENT_ID,
          client_secret: FERGUS_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: account.refresh_token,
        }).toString(),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error || !tokenData.access_token) return false;
      account.access_token = tokenData.access_token;
      if (tokenData.refresh_token) account.refresh_token = tokenData.refresh_token;
      var idx = accounts.findIndex(function (a) { return a && a.account_name === accountName; });
      if (idx > -1) {
        accounts[idx] = account;
        await supabase.from('profiles').update({ cl_fergus_accounts: accounts }).eq('id', user.id);
      }
      return true;
    } catch (e) {
      console.error('Fergus token refresh failed:', e && e.message);
      return false;
    }
  }

  async function fergusGet(path) {
    var url = FERGUS_BASE + path;
    var resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + account.access_token,
        'Accept': 'application/json',
      },
    });
    if (resp.status === 401) {
      var refreshed = await refreshToken();
      if (!refreshed) throw new Error('Token expired and refresh failed');
      resp = await fetch(url, {
        headers: {
          'Authorization': 'Bearer ' + account.access_token,
          'Accept': 'application/json',
        },
      });
    }
    if (!resp.ok) throw new Error('Fergus API error: ' + resp.status + ' ' + resp.statusText);
    return resp.json();
  }

  try {
    var result;

    if (action === 'jobs') {
      var jobsData = await fergusGet('/jobs');
      var jobs = Array.isArray(jobsData.data) ? jobsData.data : (Array.isArray(jobsData) ? jobsData : []);
      result = jobs.map(function (j) {
        var notes = j.description || j.internal_note || '';
        if (notes.length > 500) notes = notes.substring(0, 500);
        return {
          job_number: j.job_number || j.id || '',
          status: j.status || '',
          client_name: (j.customer && j.customer.name) || j.customer_name || '',
          contact_name: (j.site_contact && j.site_contact.name) || '',
          contact_phone: (j.site_contact && j.site_contact.phone) || '',
          site_address: j.site_address || '',
          description: j.description || '',
          notes: notes,
          scheduled_date: j.start_date || j.scheduled_date || '',
          completion_date: j.end_date || j.completion_date || '',
          line_items: [],
          attachments: [],
          platform: 'fergus'
        };
      });
    } else if (action === 'clients') {
      var clientsData = await fergusGet('/customers');
      var clients = Array.isArray(clientsData.data) ? clientsData.data : (Array.isArray(clientsData) ? clientsData : []);
      result = clients.map(function (c) {
        return {
          client_name: c.name || c.company_name || '',
          email: c.email || '',
          phone: c.phone || c.mobile || '',
          site_address: c.address || '',
          billing_address: c.billing_address || c.address || '',
          platform: 'fergus'
        };
      });
    } else if (action === 'invoices') {
      var invoicesData = await fergusGet('/invoices');
      var invoices = Array.isArray(invoicesData.data) ? invoicesData.data : (Array.isArray(invoicesData) ? invoicesData : []);
      result = invoices.map(function (inv) {
        return {
          invoice_number: inv.invoice_number || inv.id || '',
          job_number: inv.job_id || inv.job_number || '',
          date: inv.date || inv.created_at || '',
          status: inv.status || '',
          amount_excl_gst: parseFloat(inv.subtotal) || parseFloat(inv.amount_ex_tax) || 0,
          amount_incl_gst: parseFloat(inv.total) || parseFloat(inv.amount_inc_tax) || 0,
          line_items: (Array.isArray(inv.line_items) ? inv.line_items : []).map(function (li) {
            return {
              description: li.description || '',
              quantity: parseFloat(li.quantity) || 0,
              unit_price_excl_gst: parseFloat(li.unit_price) || parseFloat(li.unit_cost) || 0,
              unit_price_incl_gst: (parseFloat(li.unit_price) || parseFloat(li.unit_cost) || 0) * 1.1
            };
          }),
          platform: 'fergus'
        };
      });
    } else if (action === 'quotes') {
      var quotesData = await fergusGet('/quotes');
      var quotes = Array.isArray(quotesData.data) ? quotesData.data : (Array.isArray(quotesData) ? quotesData : []);
      result = quotes.map(function (q) {
        return {
          quote_number: q.quote_number || q.id || '',
          job_number: q.job_id || q.job_number || '',
          client_name: (q.customer && q.customer.name) || q.customer_name || '',
          date: q.date || q.created_at || '',
          status: q.status || '',
          amount_excl_gst: parseFloat(q.subtotal) || parseFloat(q.amount_ex_tax) || 0,
          amount_incl_gst: parseFloat(q.total) || parseFloat(q.amount_inc_tax) || 0,
          line_items: (Array.isArray(q.line_items) ? q.line_items : []).map(function (li) {
            return {
              description: li.description || '',
              quantity: parseFloat(li.quantity) || 0,
              unit_price_excl_gst: parseFloat(li.unit_price) || parseFloat(li.unit_cost) || 0,
              unit_price_incl_gst: (parseFloat(li.unit_price) || parseFloat(li.unit_cost) || 0) * 1.1
            };
          }),
          raw_document: q,
          platform: 'fergus'
        };
      });
    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('fergus-fetch error:', action, err && err.message);
    return res.status(500).json({ error: (err && err.message) || 'Fergus API request failed' });
  }
}
