// api/email-assistant-settings.js
// Settings read/write API for AI Email Assistant
// GET  → returns user settings (defaults if no row exists)
// POST → upserts user settings

const { createClient } = require('@supabase/supabase-js');

const DEFAULT_CATEGORIES = [
  { id: 'urgent',    label: 'Urgent',       enabled: true },
  { id: 'leads',     label: 'Leads',        enabled: true },
  { id: 'enquiries', label: 'Enquiries',    enabled: true },
  { id: 'jobs',      label: 'Jobs',         enabled: true },
  { id: 'invoices',  label: 'Invoices',     enabled: true },
  { id: 'suppliers', label: 'Suppliers',    enabled: true },
  { id: 'low',       label: 'Low Priority', enabled: true }
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Authenticate via JWT
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorised' });

  // GET — return settings, falling back to defaults if no row exists
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('email_assistant_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    if (!data) {
      return res.status(200).json({
        categories: DEFAULT_CATEGORIES,
        scan_cadence: 'manual',
        show_handled: false
      });
    }

    return res.status(200).json({
      categories: data.categories && data.categories.length > 0
        ? data.categories
        : DEFAULT_CATEGORIES,
      scan_cadence: data.scan_cadence || 'manual',
      show_handled: data.show_handled || false
    });
  }

  // POST — upsert settings
  if (req.method === 'POST') {
    const body = req.body || {};
    const categories  = Array.isArray(body.categories)  ? body.categories  : DEFAULT_CATEGORIES;
    const scanCadence = ['manual', 'daily', 'weekly'].includes(body.scan_cadence)
      ? body.scan_cadence : 'manual';
    const showHandled = typeof body.show_handled === 'boolean' ? body.show_handled : false;

    // Enforce minimum 1 active category
    const activeCount = categories.filter(c => c.enabled).length;
    if (activeCount < 1) return res.status(400).json({ error: 'At least one category must be active' });

    const { error } = await supabase
      .from('email_assistant_settings')
      .upsert({
        user_id:       user.id,
        categories,
        scan_cadence:  scanCadence,
        show_handled:  showHandled,
        updated_at:    new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
