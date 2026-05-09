// api/strategic-plan-load-context.js
// Loads Content Library context and BI insights for Strategic Plan generation.
// Called by strategic-plan-logic.js immediately before /api/strategic-plan-generate.
// Authenticates via Supabase JWT — never trusts userId from request body alone.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  var token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const userRes = await supabase.auth.getUser(token);
  if (userRes.error || !userRes.data || !userRes.data.user) {
    console.error('[strategic-plan] Auth error:', userRes.error && userRes.error.message);
    return res.status(401).json({ error: 'Invalid session' });
  }
  const userId = userRes.data.user.id;

  let clContext = null;
  let biInsights = null;

  // --- Query 1: Content Library items tagged for strategic-plan ---
  try {
    const { data: clItems, error: clError } = await supabase
      .from('content_library')
      .select('id, title, content_text')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .contains('tool_tags', ['strategic-plan'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (!clError && clItems && clItems.length > 0) {
      const parts = clItems.map(item => {
        const text = (item.content_text || '').substring(0, 280);
        return (item.title ? item.title + ': ' : '') + text;
      });
      const joined = parts.join('\n\n');
      clContext = joined.substring(0, 3200);
    }
  } catch (e) {
    clContext = null;
  }

  // --- Query 2: BI insights the owner approved on the SP wizard's
  // Tab 9 (BI Generated Items). Held / rejected / undecided items
  // do NOT reach the generator — the spec routes the strategic ones
  // through Approve so they ride along with the next plan. Tactical
  // BI items have already become Operational Tasks via /api/bi-act
  // and are not re-prompted here.
  // Schema: bi_insights stores the headline / detail in insight_data
  // (jsonb). Earlier code referenced flat title/summary columns that
  // do not exist — those reads silently returned nothing.
  try {
    const { data: biRows, error: biError } = await supabase
      .from('bi_insights')
      .select('id, insight_data, relevance_score, sp_queue_action')
      .eq('user_id', userId)
      .eq('added_to_sp', true)
      .eq('sp_queue_action', 'approved')
      .eq('is_dismissed', false)
      .order('relevance_score', { ascending: false })
      .limit(15);

    if (!biError && biRows && biRows.length > 0) {
      biInsights = biRows.map(r => {
        var d = r.insight_data || {};
        return {
          insight_type: 'alert',
          title: d.headline || 'Strategic suggestion',
          summary: d.detail || d.suggestion || ''
        };
      });
    }
  } catch (e) {
    biInsights = null;
  }

  return res.status(200).json({ clContext, biInsights });
}
