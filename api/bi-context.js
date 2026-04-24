// api/bi-context.js — Returns summarised BI insights for Strategic Plan injection
// Called by api/strategic-plan-load-context.js to provide real business data
// during the SP interview instead of relying on user estimates.

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
  const userId = user.id;

  async function callInternal(endpoint) {
    try {
      var r = await fetch(SITE_URL + '/api/' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: '{}'
      });
      if (!r.ok) return null;
      var j = await r.json();
      return j.success ? j.data || j : null;
    } catch (e) { return null; }
  }

  try {
    var results = await Promise.all([
      callInternal('bi-financial'),
      callInternal('bi-customers'),
      callInternal('bi-operations')
    ]);
    var financial = results[0];
    var customers = results[1];
    var operations = results[2];

    var insightsRes = await supabase.from('bi_insights').select('module, insight_type, insight_data').eq('user_id', userId).eq('is_dismissed', false).eq('insight_type', 'advisory').order('relevance_score', { ascending: false }).limit(10);
    var advisories = insightsRes.data || [];

    var context = {
      financial: null,
      customers: null,
      operations: null,
      advisories: []
    };

    if (financial && financial.summary) {
      var fs = financial.summary;
      context.financial = {
        revenue: fs.total_revenue || 0,
        expenses: fs.total_expenses || 0,
        profit_margin: fs.profit_margin || 0,
        cash_balance: fs.cash_balance || 0,
        receivable: fs.accounts_receivable || 0,
        overdue_receivable: fs.overdue_receivable || 0
      };
    }

    if (customers && customers.summary) {
      var cs = customers.summary;
      context.customers = {
        total_customers: cs.total_customers || 0,
        avg_invoice_value: cs.avg_invoice_value || 0,
        concentration_pct: cs.concentration_pct || 0,
        conversion_rate: cs.conversion_rate || 0,
        inactive_count: cs.inactive_count || 0
      };
      if (customers.top_customers) {
        context.customers.top_3 = customers.top_customers.slice(0, 3).map(function(c) {
          return { name: c.name, revenue: c.revenue, pct: c.percentage };
        });
      }
    }

    if (operations && operations.summary) {
      var os = operations.summary;
      context.operations = {
        total_jobs: os.total_jobs || 0,
        completed_jobs: os.completed_jobs || 0,
        avg_duration_days: os.avg_duration_days || 0,
        avg_job_value: os.avg_job_value || 0,
        over_quote_pct: (os.over_quote_count + os.under_quote_count + os.on_quote_count) > 0
          ? Math.round(os.over_quote_count / (os.over_quote_count + os.under_quote_count + os.on_quote_count) * 100) : 0,
        form_completion_rate: os.form_completion_rate || 0
      };
    }

    context.advisories = advisories.map(function(a) {
      var d = a.insight_data || {};
      return {
        module: a.module,
        text: d.text || d.headline || ''
      };
    });

    return res.status(200).json({ success: true, data: context });
  } catch (err) {
    console.error('[bi-context] error:', err.message || err);
    return res.status(500).json({ error: 'Could not load BI context.' });
  }
}
