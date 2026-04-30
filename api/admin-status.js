import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CACHE_TTL_MS = 5 * 60 * 1000;
let _cache = { data: null, fetchedAt: 0 };

const PROVIDERS = [
  { name: 'Stripe',    url: 'https://status.stripe.com/api/v2/status.json' },
  { name: 'Supabase',  url: 'https://status.supabase.com/api/v2/status.json' },
  { name: 'Anthropic', url: 'https://status.anthropic.com/api/v2/status.json' },
  { name: 'Vercel',    url: 'https://www.vercel-status.com/api/v2/status.json' }
];

const FETCH_TIMEOUT_MS = 5000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    if (_cache.data && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
      return res.status(200).json(Object.assign({}, _cache.data, { from_cache: true }));
    }

    const services = await Promise.all(PROVIDERS.map(fetchProviderStatus));

    const payload = {
      services: services,
      checked_at: new Date().toISOString(),
      from_cache: false
    };

    _cache = { data: payload, fetchedAt: Date.now() };
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[admin-status] error:', err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : 'Could not load status' });
  }
}

async function fetchProviderStatus(p) {
  const ctrl = new AbortController();
  const t = setTimeout(function() { ctrl.abort(); }, FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(p.url, { signal: ctrl.signal });
    const text = await r.text().catch(function() { return ''; });
    console.log('[admin-status]', p.name, 'HTTP', r.status, 'body first 300 chars:', text.slice(0, 300));
    if (!r.ok) {
      throw new Error('HTTP ' + r.status);
    }
    let j;
    try { j = JSON.parse(text); }
    catch (e) { throw new Error('Non-JSON response: ' + text.slice(0, 100)); }

    const parsed = parseStatusBody(j);
    return {
      name: p.name,
      status: indicatorToStatus(parsed.indicator),
      indicator: parsed.indicator,
      description: parsed.description
    };
  } catch (e) {
    console.error('[admin-status]', p.name, 'fetch failed:', e && e.message);
    return {
      name: p.name,
      status: 'unknown',
      indicator: 'unknown',
      description: '',
      error: e && e.message ? e.message : String(e)
    };
  } finally {
    clearTimeout(t);
  }
}

// Try Atlassian Statuspage format first — { status: { indicator,
// description } } — and fall back to Instatus's format, which is what
// Stripe uses. Instatus exposes activeIncidents/activeMaintenances
// arrays at the top level rather than a single rolled-up indicator.
function parseStatusBody(j) {
  // Atlassian
  if (j && j.status && j.status.indicator) {
    return {
      indicator: j.status.indicator,
      description: j.status.description || ''
    };
  }

  // Instatus — derive indicator from active incidents/maintenances.
  if (j && Array.isArray(j.activeIncidents)) {
    const incidents = j.activeIncidents;
    if (incidents.length === 0) {
      return { indicator: 'none', description: (j.page && j.page.name) ? 'All systems operational' : '' };
    }
    // Map Instatus impact strings (uppercase enums) to the four
    // Atlassian severity tiers we already understand downstream.
    let worst = 'minor';
    incidents.forEach(function(inc) {
      const impact = String(inc.impact || '').toUpperCase();
      if (impact.indexOf('CRITICAL') !== -1) worst = 'critical';
      else if (impact.indexOf('MAJOR') !== -1 && worst !== 'critical') worst = 'major';
      else if (impact.indexOf('PARTIAL') !== -1 && worst === 'minor') worst = 'minor';
    });
    return { indicator: worst, description: incidents[0].name || 'Incident in progress' };
  }

  return { indicator: 'unknown', description: '' };
}

// Atlassian Statuspage uses these indicator values:
//   none      — All systems operational
//   minor     — Minor incident or degraded performance
//   major     — Major outage
//   critical  — Critical outage
function indicatorToStatus(indicator) {
  switch (indicator) {
    case 'none': return 'operational';
    case 'minor': return 'degraded';
    case 'major': return 'major';
    case 'critical': return 'critical';
    default: return 'unknown';
  }
}

// ── Auth ─────────────────────────────────────────────────────────
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
