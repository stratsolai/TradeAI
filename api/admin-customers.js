import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const q = req.query || {};

    let query = supabase
      .from('profiles')
      .select('id, email, business_name, industry, activated_tools, bundle_tier, is_trial, created_at, stripe_customer_id, trial_expires_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (q.search) {
      const s = String(q.search).trim();
      if (s) {
        query = query.or('email.ilike.%' + s + '%,business_name.ilike.%' + s + '%');
      }
    }
    if (q.bundle) query = query.eq('bundle_tier', q.bundle);
    if (q.trial === 'true') query = query.eq('is_trial', true);
    if (q.trial === 'false') query = query.eq('is_trial', false);
    if (q.signup_after) query = query.gte('created_at', q.signup_after);
    if (q.signup_before) query = query.lte('created_at', q.signup_before);

    const { data, error } = await query;
    if (error) {
      console.error('[admin-customers] supabase error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    let rows = data || [];

    // Industry filter — array column, can't easily filter via PostgREST
    if (q.industry) {
      rows = rows.filter(function(p) {
        const inds = Array.isArray(p.industry) ? p.industry : (p.industry ? [p.industry] : []);
        return inds.indexOf(q.industry) !== -1;
      });
    }

    // Number-of-tools filter
    if (q.min_tools) {
      const min = parseInt(q.min_tools, 10);
      if (!isNaN(min)) {
        rows = rows.filter(function(p) {
          return (Array.isArray(p.activated_tools) ? p.activated_tools.length : 0) >= min;
        });
      }
    }
    if (q.max_tools) {
      const max = parseInt(q.max_tools, 10);
      if (!isNaN(max)) {
        rows = rows.filter(function(p) {
          return (Array.isArray(p.activated_tools) ? p.activated_tools.length : 0) <= max;
        });
      }
    }

    return res.status(200).json({ customers: rows, total: rows.length });
  } catch (err) {
    console.error('[admin-customers] error:', err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : 'Could not load customers' });
  }
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
