// api/servicem8-fetch.js — Task 13 Tool Connections
// Shared data access layer for ServiceM8. Any tool can call this endpoint
// with an action parameter. Handles token refresh, API calls, and data
// normalisation. Never exposes tokens to the browser.
//
// Supported actions: jobs, clients, staff, invoices, quotes, forms
//
// Caching, concurrency limit, 429 retry and in-flight dedup come from
// lib/external-api-cache.js — same shape as quickbooks-fetch.js.

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
const SERVICEM8_CLIENT_ID = process.env.SERVICEM8_CLIENT_ID;
const SERVICEM8_CLIENT_SECRET = process.env.SERVICEM8_CLIENT_SECRET;
const SM8_BASE = 'https://api.servicem8.com/api_1.0';

const CACHE_TABLE = 'cl_servicem8_cache';
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CONCURRENT_PER_ACCOUNT = 4;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  const { action, accountEmail, bypassCache } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action parameter' });
  if (!accountEmail) return res.status(400).json({ error: 'Missing accountEmail parameter' });

  const cacheKeyCols = { user_id: user.id, account_email: accountEmail, action: action };

  if (!bypassCache) {
    const cached = await readCache(supabase, CACHE_TABLE, cacheKeyCols);
    if (cached !== null) {
      return res.status(200).json({ success: true, data: cached, cached: true });
    }
  }

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
      .select('cl_servicem8_accounts')
      .eq('id', user.id)
      .maybeSingle();
    if (profileRes.error) {
      const e = new Error('Could not load profile'); e.status = 500; throw e;
    }

    const accounts = Array.isArray(profileRes.data && profileRes.data.cl_servicem8_accounts)
      ? profileRes.data.cl_servicem8_accounts : [];
    const account = accounts.find(function (a) { return a && a.account_email === accountEmail; });
    if (!account) {
      const e = new Error('ServiceM8 account not found'); e.status = 404; throw e;
    }

    // Token refresh helper
    async function refreshToken() {
      if (!account.refresh_token) return false;
      try {
        const tokenRes = await fetch('https://go.servicem8.com/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: SERVICEM8_CLIENT_ID,
            client_secret: SERVICEM8_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: account.refresh_token,
          }).toString(),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error || !tokenData.access_token) return false;
        account.access_token = tokenData.access_token;
        if (tokenData.refresh_token) account.refresh_token = tokenData.refresh_token;
        var idx = accounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
        if (idx > -1) {
          accounts[idx] = account;
          await supabase.from('profiles').update({ cl_servicem8_accounts: accounts }).eq('id', user.id);
        }
        return true;
      } catch (e) {
        console.error('ServiceM8 token refresh failed:', e && e.message);
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
    async function sm8Get(path) {
      var url = SM8_BASE + path;
      await acquireSlot(accountEmail, MAX_CONCURRENT_PER_ACCOUNT);
      try {
        var resp = await fetchWithRetry(async function () {
          var r = await fetch(url, { headers: authHeaders() });
          if (r.status === 401) {
            var refreshed = await refreshToken();
            if (!refreshed) throw new Error('Token expired and refresh failed');
            r = await fetch(url, { headers: authHeaders() });
          }
          return r;
        }, { providerLabel: 'ServiceM8' });
        if (!resp.ok) throw new Error('ServiceM8 API error: ' + resp.status + ' ' + resp.statusText);
        return resp.json();
      } finally {
        releaseSlot(accountEmail);
      }
    }

    var result;

    if (action === 'jobs') {
      var jobs = await sm8Get('/job.json');
      // Build a client lookup map from company contacts
      var companies = await sm8Get('/company.json');
      var companyMap = {};
      if (Array.isArray(companies)) {
        companies.forEach(function (c) { companyMap[c.uuid] = c; });
      }
      result = (Array.isArray(jobs) ? jobs : []).map(function (j) {
        var company = companyMap[j.company_uuid] || {};
        var contactName = '';
        var contactPhone = '';
        if (j.job_contact_first) contactName = j.job_contact_first + (j.job_contact_last ? ' ' + j.job_contact_last : '');
        if (!contactName) contactName = company.name || '';
        contactPhone = j.job_contact_phone || company.phone || '';
        var notes = j.job_description || '';
        if (notes.length > 500) notes = notes.substring(0, 500);
        return {
          job_number: j.generated_job_id || j.uuid || '',
          status: j.status || '',
          client_name: company.name || '',
          contact_name: contactName,
          contact_phone: contactPhone,
          site_address: j.job_address || '',
          description: j.job_description || '',
          notes: notes,
          scheduled_date: j.date || '',
          completion_date: j.completion_date || '',
          line_items: [],
          attachments: [],
          platform: 'servicem8'
        };
      });
    } else if (action === 'clients') {
      var companies2 = await sm8Get('/company.json');
      result = (Array.isArray(companies2) ? companies2 : []).map(function (c) {
        return {
          client_name: c.name || '',
          email: c.email || '',
          phone: c.phone || '',
          site_address: c.address || '',
          billing_address: c.billing_address || c.address || '',
          platform: 'servicem8'
        };
      });
    } else if (action === 'staff') {
      var staff = await sm8Get('/staff.json');
      result = (Array.isArray(staff) ? staff : []).map(function (s) {
        return {
          name: (s.first || '') + (s.last ? ' ' + s.last : ''),
          role: s.job_title || '',
          platform: 'servicem8'
        };
      });
    } else if (action === 'invoices') {
      var invoices = await sm8Get('/invoice.json');
      result = (Array.isArray(invoices) ? invoices : []).map(function (inv) {
        return {
          invoice_number: inv.invoice_id || inv.uuid || '',
          job_number: inv.job_uuid || '',
          date: inv.date || '',
          status: inv.status || '',
          amount_excl_gst: parseFloat(inv.amount_ex_tax) || 0,
          amount_incl_gst: parseFloat(inv.amount_inc_tax) || parseFloat(inv.total) || 0,
          line_items: (Array.isArray(inv.line_items) ? inv.line_items : []).map(function (li) {
            return {
              description: li.description || '',
              quantity: parseFloat(li.quantity) || 0,
              unit_price_excl_gst: parseFloat(li.unit_cost) || 0,
              unit_price_incl_gst: (parseFloat(li.unit_cost) || 0) * 1.1
            };
          }),
          platform: 'servicem8'
        };
      });
    } else if (action === 'quotes') {
      var quotes = await sm8Get('/quote.json');
      result = (Array.isArray(quotes) ? quotes : []).map(function (q) {
        // Resolve client name from company_uuid if available
        var clientName = q.company_name || '';
        return {
          quote_number: q.quote_id || q.uuid || '',
          job_number: q.job_uuid || '',
          client_name: clientName,
          date: q.date || '',
          status: q.status || '',
          amount_excl_gst: parseFloat(q.amount_ex_tax) || 0,
          amount_incl_gst: parseFloat(q.amount_inc_tax) || parseFloat(q.total) || 0,
          line_items: (Array.isArray(q.line_items) ? q.line_items : []).map(function (li) {
            return {
              description: li.description || '',
              quantity: parseFloat(li.quantity) || 0,
              unit_price_excl_gst: parseFloat(li.unit_cost) || 0,
              unit_price_incl_gst: (parseFloat(li.unit_cost) || 0) * 1.1
            };
          }),
          raw_document: q,
          platform: 'servicem8'
        };
      });
    } else if (action === 'forms') {
      var formResponses = await sm8Get('/formresponse.json');
      result = (Array.isArray(formResponses) ? formResponses : []).map(function (f) {
        var responses = [];
        if (Array.isArray(f.field_data)) {
          responses = f.field_data.map(function (fd) {
            var resp = fd.response || '';
            if (resp.length > 300) resp = resp.substring(0, 300);
            return { field_label: fd.label || fd.field_name || '', response: resp };
          });
        }
        return {
          form_name: f.form_name || '',
          job_number: f.job_uuid || '',
          completion_date: f.timestamp || f.date || '',
          responses: responses,
          platform: 'servicem8'
        };
      });
    } else {
      const unknownErr = new Error('Unknown action: ' + action);
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
    console.error('servicem8-fetch error:', action, err && err.message);
    return res.status(err.status || 500).json({ error: (err && err.message) || 'ServiceM8 API request failed' });
  } finally {
    deleteInflight(ikey);
  }
}
