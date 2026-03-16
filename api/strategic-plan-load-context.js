// api/strategic-plan-load-context.js
// Loads Content Library context and BI insights for Strategic Plan generation.
// Called by strategic-plan-logic.js immediately before /api/strategic-plan-generate.
// Authenticates via Supabase JWT — never trusts userId from request body alone.

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate via Supabase JWT from Authorization header
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const jwt = authHeader.replace('Bearer ', '');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: 'Bearer ' + jwt } } }
  );

  // Verify session — extract authenticated user from JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  const userId = user.id;

  let clContext = null;
  let biInsights = null;

  // --- Query 1: Content Library items tagged for strategic-plan ---
  try {
    const { data: clItems, error: clError } = await supabase
      .from('content_library')
      .select('id, title, body')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .contains('tool_tags', ['strategic-plan'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (!clError && clItems && clItems.length > 0) {
      // Build summarised context string — max ~800 tokens (~3200 chars)
      const parts = clItems.map(item => {
        const body = (item.body || '').substring(0, 280);
        return (item.title ? item.title + ': ' : '') + body;
      });
      const joined = parts.join('\n\n');
      clContext = joined.substring(0, 3200);
    }
  } catch (e) {
    // Silently skip — CL context is optional
    clContext = null;
  }

  // --- Query 2: BI insights with relevance_score >= 7 ---
  try {
    const { data: biRows, error: biError } = await supabase
      .from('bi_insights')
      .select('insight_type, title, summary, relevance_score')
      .eq('user_id', userId)
      .gte('relevance_score', 7)
      .order('relevance_score', { ascending: false })
      .limit(5);

    if (!biError && biRows && biRows.length > 0) {
      biInsights = biRows.map(r => ({
        insight_type: r.insight_type,
        title: r.title,
        summary: r.summary
      }));
    }
  } catch (e) {
    // Silently skip — BI insights are optional
    biInsights = null;
  }

  return res.status(200).json({ clContext, biInsights });
}
