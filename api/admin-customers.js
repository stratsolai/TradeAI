import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const q = req.query || {};

    // Profiles do not carry email — that lives in auth.users. Fetch the
    // base profile rows with whatever DB-side filters we can apply, then
    // merge emails from auth.users.admin.listUsers and apply the
    // remaining filters (search-by-email and industry array) post-merge.
    let query = supabase
      .from('profiles')
      .select('id, business_name, industry, activated_tools, bundle_tier, is_trial, created_at, stripe_customer_id, trial_expires_at')
      .order('created_at', { ascending: false })
      .limit(500);

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

    // Merge emails from auth.users.
    const emailMap = await fetchEmailMap();
    rows.forEach(function(r) { r.email = emailMap.get(r.id) || null; });

    // Search — email OR business_name (case-insensitive contains).
    if (q.search) {
      const s = String(q.search).toLowerCase().trim();
      if (s) {
        rows = rows.filter(function(p) {
          const e = (p.email || '').toLowerCase();
          const b = (p.business_name || '').toLowerCase();
          return e.indexOf(s) !== -1 || b.indexOf(s) !== -1;
        });
      }
    }

    // Industry — text[] column on profiles, can't filter that via PostgREST eq.
    if (q.industry) {
      rows = rows.filter(function(p) {
        const inds = Array.isArray(p.industry) ? p.industry : (p.industry ? [p.industry] : []);
        return inds.indexOf(q.industry) !== -1;
      });
    }

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

    // Tool prices map (tool_id → display_price as a number) for client-side
    // MRR derivation. Replaces the previous regex-parse against CORE_TOOLS.
    const toolPrices = await fetchToolPricesByToolId();

    return res.status(200).json({
      customers: rows,
      total: rows.length,
      tool_prices_by_tool: toolPrices
    });
  } catch (err) {
    console.error('[admin-customers] error:', err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : 'Could not load customers' });
  }
}

// Returns { tool_id: monthly_price_aud_number }. Bundle rows (tool_id null)
// are skipped — bundle MRR is handled by per-bundle revenue elsewhere.
async function fetchToolPricesByToolId() {
  const map = {};
  const r = await supabase
    .from('tool_prices')
    .select('tool_id, display_price');
  if (r.error) {
    console.error('[admin-customers] tool_prices error:', r.error.message);
    return map;
  }
  (r.data || []).forEach(function(row) {
    if (!row.tool_id) return;
    var raw = row.display_price;
    var n = null;
    if (typeof raw === 'number') n = raw;
    else if (typeof raw === 'string') {
      var match = raw.match(/[\d.]+/);
      if (match) n = parseFloat(match[0]);
    }
    if (n != null && !isNaN(n)) map[row.tool_id] = n;
  });
  return map;
}

// Build a Map<userId, email> by paging through auth.users via the admin
// API. Service key is required (already configured at module init).
async function fetchEmailMap() {
  const map = new Map();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const r = await supabase.auth.admin.listUsers({ page: page, perPage: perPage });
    if (r.error) {
      console.error('[admin-customers] listUsers error:', r.error.message);
      break;
    }
    const users = (r.data && r.data.users) || [];
    users.forEach(function(u) { map.set(u.id, u.email || ''); });
    if (users.length < perPage) break;
    page += 1;
    if (page > 20) break; // hard safety cap — 20k users
  }
  return map;
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
