import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const INFRA_TABLES = [
  'profiles',
  'content_library',
  'chatbot_conversations',
  'social_posts',
  'strategic_plans',
  'email_threads',
  'news_digest_items',
  'error_log'
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const section = (req.query && req.query.section) || '';

    if (section === 'usage') return res.status(200).json(await loadUsage());
    if (section === 'errors') return res.status(200).json(await loadErrors());
    if (section === 'infrastructure') return res.status(200).json(await loadInfrastructure());

    return res.status(400).json({ error: 'Unknown section. Use ?section=usage|errors|infrastructure' });
  } catch (err) {
    console.error('[admin-data] error:', err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : 'Could not load admin data' });
  }
}

async function loadUsage() {
  // Activations from profiles.activated_tools
  const profilesRes = await supabase
    .from('profiles')
    .select('id, activated_tools')
    .not('activated_tools', 'is', null);
  const activations = {};
  (profilesRes.data || []).forEach(function(p) {
    (Array.isArray(p.activated_tools) ? p.activated_tools : []).forEach(function(t) {
      activations[t] = (activations[t] || 0) + 1;
    });
  });

  // tool_usage table — best-effort. Show note if missing/empty.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let usageRows = [];
  let usageAvailable = true;
  let usageNote = '';
  try {
    const usageRes = await supabase
      .from('tool_usage')
      .select('user_id, tool_id, created_at')
      .gte('created_at', thirtyDaysAgo)
      .limit(50000);
    if (usageRes.error) {
      usageAvailable = false;
      usageNote = 'tool_usage table not yet enabled — showing activation counts only.';
    } else {
      usageRows = usageRes.data || [];
      if (usageRows.length === 0) {
        usageNote = 'No tool usage recorded in the last 30 days. Showing activation counts only.';
      }
    }
  } catch (e) {
    usageAvailable = false;
    usageNote = 'tool_usage table not yet enabled — showing activation counts only.';
  }

  const usageByTool = {};
  if (usageAvailable && usageRows.length > 0) {
    usageRows.forEach(function(r) {
      if (!r.tool_id) return;
      if (!usageByTool[r.tool_id]) usageByTool[r.tool_id] = { uses: 0, users: new Set() };
      usageByTool[r.tool_id].uses += 1;
      if (r.user_id) usageByTool[r.tool_id].users.add(r.user_id);
    });
  }

  const tools = Object.keys(activations).map(function(id) {
    const u = usageByTool[id];
    const uses = u ? u.uses : 0;
    const users = u ? u.users.size : 0;
    return {
      tool_id: id,
      activations: activations[id],
      unique_users_30d: users,
      total_uses_30d: uses,
      avg_uses_per_user: users > 0 ? +(uses / users).toFixed(2) : 0
    };
  }).sort(function(a, b) { return b.activations - a.activations; });

  return { tools: tools, usage_note: usageNote };
}

async function loadErrors() {
  let rows = [];
  let note = '';
  try {
    const r = await supabase
      .from('error_log')
      .select('id, user_id, message, endpoint, details, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (r.error) {
      note = 'error_log table not yet created — no errors to display.';
    } else {
      rows = r.data || [];
    }
  } catch (e) {
    note = 'error_log table not yet created — no errors to display.';
  }
  return { errors: rows, note: note };
}

async function loadInfrastructure() {
  const counts = {};
  for (let i = 0; i < INFRA_TABLES.length; i++) {
    const t = INFRA_TABLES[i];
    try {
      const r = await supabase.from(t).select('*', { count: 'exact', head: true });
      counts[t] = r.error ? null : (r.count || 0);
    } catch (e) {
      counts[t] = null;
    }
  }
  return { row_counts: counts };
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
