// api/bi-act.js — BI Dashboard "Add to Plan" handler.
// Per SP/OT Rebuild Spec §7.2 the behaviour now splits on the
// is_tactical flag set during BI generation:
//   - tactical → create a single Operational Task immediately under
//     the most relevant existing Goal (sp_section heuristic match).
//   - strategic → mark the insight added_to_sp so it joins the next
//     plan update's BI suggestions; do not create tasks yet.
// Both paths still record the decision in bi_decisions, check the
// stored Strategic Plan decisions for contradictions, and return
// contradiction info for the SP rewrite flow.

import { createClient } from '@supabase/supabase-js';
import { requireBpComplete } from '../lib/bp-gate.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
  if (!(await requireBpComplete(supabase, user.id, res))) return;
  const userId = user.id;

  var { insightId, insightData, spRewriteTriggered } = req.body || {};
  if (!insightId) return res.status(400).json({ error: 'Missing insightId' });

  try {
    // Re-fetch the insight from bi_insights so the is_tactical flag and
    // classification_reason come from the persisted row, not whatever
    // the browser sent. Falls back to the request's insightData if the
    // row can't be loaded (legacy callers, race with delete, etc).
    var insightRowRes = await supabase.from('bi_insights')
      .select('is_tactical, insight_data, added_to_sp')
      .eq('id', insightId).eq('user_id', userId).single();
    var storedInsight = (insightRowRes && insightRowRes.data) || null;
    var workingData = (storedInsight && storedInsight.insight_data) || insightData || {};
    var isTactical = !!(storedInsight && storedInsight.is_tactical);
    var classificationReason = workingData.classification_reason || '';

    // Idempotent — clicking Add to Plan twice should not double-write.
    if (storedInsight && storedInsight.added_to_sp) {
      return res.status(200).json({
        success: true,
        classification: isTactical ? 'tactical' : 'strategic',
        alreadyAdded: true
      });
    }

    var planRes = await supabase.from('strategic_plans')
      .select('id, interview_data')
      .eq('user_id', userId).eq('is_current', true).single();
    var planId = (planRes.data) ? planRes.data.id : null;
    var spDecisions = (planRes.data && planRes.data.interview_data) ? planRes.data.interview_data.decisions : null;

    // Check for contradiction with stored SP decisions. The keyword-
    // based detection rarely fires for tactical items (their text
    // describes operational actions, not strategic shifts) but we run
    // it on both paths for safety.
    var contradiction = detectContradiction(workingData, spDecisions);
    var isContradiction = !!contradiction;

    var nowIso = new Date().toISOString();

    // ── Strategic branch — queue for the next plan update ────────
    // No tasks created. The owner will see the queued items in the
    // SP Update Plan flow's BI Generated Items tab (Phase 3+) and
    // approve, hold, or reject each one.
    if (!isTactical) {
      var spUpdateRes = await supabase.from('bi_insights')
        .update({ added_to_sp: true, added_to_sp_at: nowIso, updated_at: nowIso })
        .eq('id', insightId).eq('user_id', userId);
      if (spUpdateRes.error) console.error('[bi-act] bi_insights update error:', spUpdateRes.error);

      var stratDecRes = await supabase.from('bi_decisions').insert([{
        user_id: userId,
        bi_insight_id: insightId,
        decision: 'act',
        decision_date: nowIso,
        sp_incorporated: false,
        sp_rewrite_triggered: isContradiction,
        initiative_id: null,
        created_at: nowIso
      }]);
      if (stratDecRes.error) console.error('[bi-act] Strategic decision insert error:', stratDecRes.error);

      return res.status(200).json({
        success: true,
        classification: 'strategic',
        queued: true,
        contradiction: contradiction,
        spRewriteRequired: isContradiction,
        planId: planId
      });
    }

    // ── Tactical branch — find the most relevant Goal, attach 1 task ──
    // Map the unified BI category to its matching SP section. The
    // section keys mirror the unified 7-category structure (spec §4).
    var sectionMap = {
      financial:  'financial_position',
      products:   'products_services',
      customers:  'customers_suppliers',
      operations: 'operations_capacity',
      market:     'market_competition',
      growth:     'growth_transformation',
      risk:       'continuity_resilience'
    };
    var category = (workingData.category || '').toLowerCase();
    var preferredSection = sectionMap[category] || 'growth_transformation';

    var initRes = await supabase.from('action_tracker')
      .select('id, sp_section, initiative_name')
      .eq('user_id', userId)
      .is('parent_task_id', null)
      .order('created_at', { ascending: false });
    var initiatives = (initRes && initRes.data) || [];

    var matchingInit = null;
    var headline = (workingData.headline || workingData.text) || 'BI Recommendation';
    var taskTitle = (workingData.suggestion || headline).toString();
    if (taskTitle.length > 200) taskTitle = taskTitle.substring(0, 197) + '...';

    if (initiatives.length === 0) {
      // No Goals exist yet — create one from the insight so the
      // tactical task has a parent. The owner's first plan generation
      // will overwrite this; until then the standalone Goal keeps the
      // OT tab valid.
      var initName = headline.length > 60 ? headline.substring(0, 57) + '...' : headline;
      var seedRes = await supabase.from('action_tracker').insert({
        user_id: userId,
        plan_id: planId,
        items: { title: initName, status: 'in_progress' },
        initiative_name: initName,
        sp_section: preferredSection,
        source: 'bi_action',
        bi_insight_id: insightId,
        parent_task_id: null,
        owner: 'Owner',
        is_carried_forward: false
      }).select('id, sp_section, initiative_name').single();
      if (seedRes.error) {
        console.error('[bi-act] Seed initiative error:', seedRes.error);
        return res.status(500).json({ error: 'Could not create a Goal to attach this task to.' });
      }
      matchingInit = seedRes.data;
    } else {
      // Prefer a Goal whose sp_section matches the insight category;
      // fall back to the most recent Goal so the task always lands
      // somewhere visible.
      matchingInit = initiatives.find(function(i) { return i.sp_section === preferredSection; }) || initiatives[0];
    }

    var severity = workingData.severity || 'amber';
    var priority = severity === 'red' ? 'High' : severity === 'green' ? 'Low' : 'Medium';
    var dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    var taskInsertRes = await supabase.from('action_tracker').insert({
      user_id: userId,
      plan_id: planId,
      parent_task_id: matchingInit.id,
      items: {
        title: taskTitle,
        status: 'in_progress',
        priority: priority,
        due_date: dueDate.toISOString().split('T')[0],
        notes: workingData.detail || '',
        owner: 'Owner'
      },
      month_group: 0,
      due_day_offset: 14,
      owner: 'Owner',
      source: 'bi_action',
      bi_insight_id: insightId,
      is_tactical: true,
      classification_reason: classificationReason,
      is_carried_forward: false
    }).select('id').single();
    if (taskInsertRes.error) {
      console.error('[bi-act] Task insert error:', taskInsertRes.error);
      return res.status(500).json({ error: 'Could not add the task. Please try again.' });
    }

    var spUpdRes = await supabase.from('bi_insights')
      .update({ added_to_sp: true, added_to_sp_at: nowIso, updated_at: nowIso })
      .eq('id', insightId).eq('user_id', userId);
    if (spUpdRes.error) console.error('[bi-act] bi_insights update error:', spUpdRes.error);

    var tactDecRes = await supabase.from('bi_decisions').insert([{
      user_id: userId,
      bi_insight_id: insightId,
      decision: 'act',
      decision_date: nowIso,
      sp_incorporated: !!planId && !isContradiction,
      sp_rewrite_triggered: isContradiction,
      initiative_id: matchingInit.id,
      created_at: nowIso
    }]);
    if (tactDecRes.error) console.error('[bi-act] Tactical decision insert error:', tactDecRes.error);

    return res.status(200).json({
      success: true,
      classification: 'tactical',
      tasksCreated: 1,
      initiativeId: matchingInit.id,
      taskId: taskInsertRes.data ? taskInsertRes.data.id : null,
      planId: planId,
      contradiction: contradiction,
      spRewriteRequired: isContradiction
    });
  } catch (err) {
    console.error('[bi-act] error:', err.message || err);
    return res.status(500).json({ error: 'Could not process action. Please try again.' });
  }
}
