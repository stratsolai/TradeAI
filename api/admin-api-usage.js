import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      let rows = [];
      let note = '';
      try {
        const r = await supabase
          .from('api_usage')
          .select('id, provider, period, usage_value, cost_estimate, entered_at, notes')
          .order('period', { ascending: false })
          .order('entered_at', { ascending: false })
          .limit(500);
        if (r.error) {
          // Distinguish "table genuinely missing" from any other error.
          // PostgREST returns SQLSTATE 42P01 / "relation ... does not exist"
          // when the table is not there. Anything else (missing column,
          // bad RLS, network) is a real error worth surfacing.
          console.error('[admin-api-usage] SELECT error:', r.error);
          var msg = r.error.message || '';
          var code = r.error.code || '';
          if (code === '42P01' || /relation .* does not exist/i.test(msg)) {
            note = 'api_usage table not yet created in Supabase.';
          } else {
            note = 'Could not read api_usage: ' + msg + (code ? ' [' + code + ']' : '');
          }
        } else {
          rows = r.data || [];
        }
      } catch (e) {
        console.error('[admin-api-usage] SELECT threw:', e);
        note = 'Could not read api_usage: ' + (e && e.message ? e.message : String(e));
      }

      // Total monthly spend (current period) for per-customer cost calc
      const period = currentPeriod();
      let totalThisMonthCents = 0;
      rows.forEach(function(row) {
        if (row.period === period && typeof row.cost_estimate === 'number') {
          totalThisMonthCents += Math.round(row.cost_estimate * 100);
        }
      });

      // Active customer count for cost-per-customer. Count any profile
      // with at least one activated tool, regardless of trial status,
      // to match what the Customers tab displays. Filtering trial
      // users out gave 0 customers any time the only signups are on a
      // 14-day trial — useless during pre-launch testing.
      const customerRes = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .not('activated_tools', 'is', null);
      const activeCustomers = customerRes.count || 0;
      const totalThisMonth = totalThisMonthCents / 100;
      const costPerCustomer = activeCustomers > 0
        ? +(totalThisMonth / activeCustomers).toFixed(2)
        : 0;

      return res.status(200).json({
        entries: rows,
        period: period,
        total_this_month: totalThisMonth,
        active_customers: activeCustomers,
        cost_per_customer: costPerCustomer,
        note: note
      });
    }

    // POST — add a manual entry
    const body = req.body || {};
    if (!body.provider || !body.period) {
      return res.status(400).json({ error: 'provider and period are required' });
    }
    const payload = {
      provider: String(body.provider).trim(),
      period: String(body.period).trim(),
      usage_value: body.usage_value != null ? String(body.usage_value).trim() : null,
      cost_estimate: typeof body.cost_estimate === 'number'
        ? body.cost_estimate
        : (body.cost_estimate != null ? parseFloat(body.cost_estimate) : null),
      notes: body.notes ? String(body.notes).trim() : null,
      entered_at: new Date().toISOString(),
      entered_by: auth.user.id
    };
    const insertRes = await supabase.from('api_usage').insert(payload).select().single();
    if (insertRes.error) {
      console.error('[admin-api-usage] insert error:', insertRes.error.message);
      return res.status(500).json({ error: insertRes.error.message });
    }
    return res.status(200).json({ entry: insertRes.data });
  } catch (err) {
    console.error('[admin-api-usage] error:', err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : 'Could not handle api_usage request' });
  }
}

function currentPeriod() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return { ok: false, status: 401, error: 'No token provided' };
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { ok: false, status: 401, error: 'Invalid token' };
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (profErr || !profile || !profile.is_admin) {
    return { ok: false, status: 403, error: 'Admin access required' };
  }
  return { ok: true, user: user };
}
