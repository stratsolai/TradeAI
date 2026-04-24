// api/bi-act.js — BI Dashboard "Act on this" handler
// Records decision in bi_decisions, generates sub-tasks via Claude,
// adds them to the action_tracker as a new initiative or under an
// existing one. Returns the created tasks.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
  const userId = user.id;

  var { insightId, insightData, spRewriteTriggered } = req.body || {};
  if (!insightId) return res.status(400).json({ error: 'Missing insightId' });

  try {
    var profileRes = await supabase.from('profiles').select('business_name, industry').eq('id', userId).single();
    var profile = profileRes.data || {};

    var planRes = await supabase.from('strategic_plans').select('id').eq('user_id', userId).eq('is_current', true).limit(1);
    var planId = (planRes.data && planRes.data.length > 0) ? planRes.data[0].id : null;

    var headline = (insightData && (insightData.headline || insightData.text)) || 'BI Recommendation';
    var detail = (insightData && (insightData.detail || insightData.suggestion)) || '';

    var prompt = 'Generate 2-5 practical action items for this business recommendation.\n\n';
    prompt += 'Business: ' + (profile.business_name || 'Unknown') + ' (' + (profile.industry || 'SME') + ')\n';
    prompt += 'Recommendation: ' + headline + '\n';
    if (detail) prompt += 'Detail: ' + detail + '\n';
    prompt += '\nReturn a JSON array of task objects. Each must have:\n';
    prompt += '- title: short actionable task (under 80 chars)\n';
    prompt += '- priority: "High", "Medium", or "Low"\n';
    prompt += '- due_days: number of days from today the task should be due (7 to 90)\n';
    prompt += '- notes: one sentence of context (optional)\n';
    prompt += '\nKeep tasks practical and specific to an Australian small business. Return ONLY the JSON array.';

    var claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    var claudeData = await claudeResp.json();
    if (claudeData.error) {
      console.error('[bi-act] Claude error:', JSON.stringify(claudeData.error));
      return res.status(500).json({ error: 'Could not generate tasks.' });
    }

    var raw = claudeData.content && claudeData.content[0] ? claudeData.content[0].text : '[]';
    var tasks;
    try {
      tasks = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error('[bi-act] Parse error:', e.message);
      return res.status(500).json({ error: 'Could not parse generated tasks.' });
    }
    if (!Array.isArray(tasks)) tasks = [];

    var now = new Date();
    var trackerRows = tasks.map(function(t, idx) {
      var dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + (t.due_days || 14));
      return {
        user_id: userId,
        plan_id: planId,
        items: {
          title: (t.title || 'Action item') + ' [BI Recommendation]',
          status: 'pending',
          priority: t.priority || 'Medium',
          due_date: dueDate.toISOString().split('T')[0],
          notes: t.notes || '',
          owner: 'Owner'
        },
        month_group: 0,
        due_day_offset: t.due_days || 14,
        owner: 'Owner',
        is_carried_forward: false
      };
    });

    var initiativeId = null;
    if (trackerRows.length > 0) {
      var insertRes = await supabase.from('action_tracker').insert(trackerRows).select('id');
      if (insertRes.error) {
        console.error('[bi-act] Insert error:', insertRes.error);
      } else if (insertRes.data && insertRes.data.length > 0) {
        initiativeId = insertRes.data[0].id;
      }
    }

    var decisionRow = {
      user_id: userId,
      bi_insight_id: insightId,
      decision: 'act',
      decision_date: now.toISOString(),
      sp_incorporated: !!planId,
      sp_rewrite_triggered: !!spRewriteTriggered,
      initiative_id: initiativeId,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    var decRes = await supabase.from('bi_decisions').insert([decisionRow]);
    if (decRes.error) console.error('[bi-act] Decision insert error:', decRes.error);

    return res.status(200).json({
      success: true,
      tasksCreated: trackerRows.length,
      initiativeId: initiativeId,
      planId: planId
    });
  } catch (err) {
    console.error('[bi-act] error:', err.message || err);
    return res.status(500).json({ error: 'Could not process action. Please try again.' });
  }
}
