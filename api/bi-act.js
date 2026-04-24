// api/bi-act.js — BI Dashboard "Act on this" handler
// Records decision in bi_decisions, checks for SP contradictions,
// generates sub-tasks via Claude, creates hierarchical initiatives
// in action_tracker. Returns contradiction info for SP rewrite flow.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Decision IDs that can trigger contradictions
var DECISION_KEYS = {
  geo_expansion: { label: 'Geographic Expansion', negative: ['not_interested'] },
  new_services: { label: 'New Service Lines', negative: ['not_interested'] },
  gov_tendering: { label: 'Government Tendering', negative: ['not_interested'] },
  digital_transform: { label: 'Digital Transformation', negative: ['not_interested'] },
  process_improve: { label: 'Process Improvement', negative: ['not_priority'] },
  hiring: { label: 'Hiring Plans', negative: ['no_hiring'] }
};

// Maps insight categories to decision keys for contradiction checking
var INSIGHT_DECISION_MAP = {
  'government_tender': 'gov_tendering',
  'tender': 'gov_tendering',
  'geographic': 'geo_expansion',
  'expansion': 'geo_expansion',
  'digital': 'digital_transform',
  'technology': 'digital_transform',
  'software': 'digital_transform',
  'hiring': 'hiring',
  'staff': 'hiring',
  'employee': 'hiring',
  'service_line': 'new_services',
  'new_service': 'new_services',
  'process': 'process_improve',
  'automation': 'process_improve'
};

function detectContradiction(insightData, spDecisions) {
  if (!spDecisions || !insightData) return null;

  var insightText = ((insightData.headline || '') + ' ' + (insightData.text || '') + ' ' +
    (insightData.detail || '') + ' ' + (insightData.suggestion || '') + ' ' +
    (insightData.insight_type || '')).toLowerCase();

  for (var keyword in INSIGHT_DECISION_MAP) {
    if (insightText.indexOf(keyword) !== -1) {
      var decisionId = INSIGHT_DECISION_MAP[keyword];
      var config = DECISION_KEYS[decisionId];
      var storedValue = spDecisions[decisionId];

      if (config && storedValue && config.negative.indexOf(storedValue) !== -1) {
        return {
          decisionId: decisionId,
          decisionLabel: config.label,
          storedValue: storedValue,
          message: 'This action changes your strategic decision on ' + config.label +
            ' (currently set to "' + storedValue.replace(/_/g, ' ') + '"). Your Strategic Plan will need updating.'
        };
      }
    }
  }
  return null;
}

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

    var planRes = await supabase.from('strategic_plans')
      .select('id, interview_data')
      .eq('user_id', userId).eq('is_current', true).single();
    var planId = (planRes.data) ? planRes.data.id : null;
    var spDecisions = (planRes.data && planRes.data.interview_data) ? planRes.data.interview_data.decisions : null;

    // Step 22-23: Check for contradiction with stored SP decisions
    var contradiction = detectContradiction(insightData, spDecisions);
    var isContradiction = !!contradiction;

    var headline = (insightData && (insightData.headline || insightData.text)) || 'BI Recommendation';
    var detail = (insightData && (insightData.detail || insightData.suggestion)) || '';

    // Determine SP section for the initiative
    var spSection = 'growth_transformation';
    var insightText = ((insightData && insightData.insight_type) || '').toLowerCase();
    if (insightText.indexOf('financial') !== -1 || insightText.indexOf('cash') !== -1) spSection = 'financial_position';
    else if (insightText.indexOf('customer') !== -1 || insightText.indexOf('market') !== -1) spSection = 'market_competition';
    else if (insightText.indexOf('operation') !== -1 || insightText.indexOf('capacity') !== -1) spSection = 'operations_capacity';
    else if (insightText.indexOf('risk') !== -1) spSection = 'risk_resilience';

    // Generate sub-tasks via Claude
    var prompt = 'Generate 2-5 practical action items for this business recommendation.\n\n';
    prompt += 'Business: ' + (profile.business_name || 'Unknown') + ' (' + (profile.industry || 'SME') + ')\n';
    prompt += 'Recommendation: ' + headline + '\n';
    if (detail) prompt += 'Detail: ' + detail + '\n';
    prompt += '\nReturn a JSON array of task objects. Each must have:\n';
    prompt += '- title: short actionable task (under 80 chars)\n';
    prompt += '- priority: "High", "Medium", or "Low"\n';
    prompt += '- due_days: number of days from today (7 to 90)\n';
    prompt += '- notes: one sentence of context (optional)\n';
    prompt += '\nKeep tasks practical for an Australian small business. Return ONLY the JSON array.';

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

    if (!claudeResp.ok) {
      console.error('[bi-act] Claude HTTP error:', claudeResp.status);
      return res.status(502).json({ error: 'AI service unavailable. Please try again.' });
    }

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

    // Create parent initiative
    var initName = headline.length > 60 ? headline.substring(0, 57) + '...' : headline;
    var { data: initRow, error: initErr } = await supabase
      .from('action_tracker')
      .insert({
        user_id: userId,
        plan_id: planId,
        items: { title: initName, status: 'pending' },
        initiative_name: initName,
        sp_section: spSection,
        source: 'bi_action',
        bi_insight_id: insightId,
        parent_task_id: null,
        owner: 'Owner',
        is_carried_forward: false
      })
      .select('id')
      .single();

    var initiativeId = (initRow && !initErr) ? initRow.id : null;

    // Create sub-tasks under the initiative
    if (initiativeId && tasks.length > 0) {
      var now = new Date();
      var subRows = tasks.map(function(t) {
        var dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + (t.due_days || 14));
        return {
          user_id: userId,
          plan_id: planId,
          parent_task_id: initiativeId,
          items: {
            title: t.title || 'Action item',
            status: 'pending',
            priority: t.priority || 'Medium',
            due_date: dueDate.toISOString().split('T')[0],
            notes: t.notes || '',
            owner: 'Owner'
          },
          month_group: 0,
          due_day_offset: t.due_days || 14,
          owner: 'Owner',
          source: 'bi_action',
          bi_insight_id: insightId,
          is_carried_forward: false
        };
      });
      var subRes = await supabase.from('action_tracker').insert(subRows);
      if (subRes.error) console.error('[bi-act] Sub-task insert error:', subRes.error);
    }

    // Record decision in bi_decisions
    var decisionRow = {
      user_id: userId,
      bi_insight_id: insightId,
      decision: 'act',
      decision_date: new Date().toISOString(),
      sp_incorporated: !!planId && !isContradiction,
      sp_rewrite_triggered: isContradiction,
      initiative_id: initiativeId,
      created_at: new Date().toISOString()
    };
    var decRes = await supabase.from('bi_decisions').insert([decisionRow]);
    if (decRes.error) console.error('[bi-act] Decision insert error:', decRes.error);

    return res.status(200).json({
      success: true,
      tasksCreated: tasks.length,
      initiativeId: initiativeId,
      planId: planId,
      contradiction: contradiction,
      spRewriteRequired: isContradiction
    });
  } catch (err) {
    console.error('[bi-act] error:', err.message || err);
    return res.status(500).json({ error: 'Could not process action. Please try again.' });
  }
}
