// api/strategic-plan-approve.js
//
// SP/OT Rebuild Phase 3 (spec §5.1 step 5 / §6) — finalises a plan
// that's currently sitting in pending_approval status. The owner
// reviews the draft on the SP Review screen, edits Goals via AI
// chat, edits Tasks inline, then clicks Approve. This endpoint:
//
//   1. Verifies the plan is owned by the caller and is currently
//      pending_approval.
//   2. Demotes the previous current plan to is_current=false /
//      status='archived'.
//   3. Marks the new plan is_current=true / status='active'.
//   4. Flips every action_tracker row tied to this plan from
//      is_pending=true to is_pending=false so they appear in the
//      Operational Tasks tab.
//   5. Converts each task's relative timeframe (Week 1 / Month 2)
//      into an absolute YYYY-MM-DD date anchored to today, when the
//      sp_generated row was inserted with the relative form. Rows
//      that already have an absolute date pass through.
//
// Word docs and content_library entries were already written by
// strategic-plan-generate.js — they don't need regenerating on
// approve.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import { requireBpComplete } from '../lib/bp-gate.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Convert a "Week N" / "Month N" timeframe to an absolute YYYY-MM-DD.
// Anchored to "today" — the day the user clicks Approve. Returns the
// input unchanged if it's already an absolute date or the format is
// unrecognised, so existing rows with calendar dates pass through.
function relativeToAbsolute(relative, today) {
  if (!relative) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(relative)) return relative;
  var match = String(relative).trim().match(/^(week|month)\s*(\d+)$/i);
  if (!match) return relative;
  var unit = match[1].toLowerCase();
  var n = parseInt(match[2], 10);
  if (isNaN(n) || n < 1) return relative;
  var d = new Date(today);
  if (unit === 'week') {
    // Week 1 = end of week 1 from approval (7 days). Week N = N*7 days.
    d.setDate(d.getDate() + (n * 7));
  } else {
    // Month 1 = 30 days from approval. Month N = N*30 days.
    d.setDate(d.getDate() + (n * 30));
  }
  return d.toISOString().substring(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  var authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  var token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised — missing bearer token' });

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  var userRes = await supabase.auth.getUser(token);
  if (userRes.error || !userRes.data || !userRes.data.user) {
    return res.status(401).json({ error: 'Unauthorised — invalid token' });
  }
  var userId = userRes.data.user.id;
  if (!(await requireBpComplete(supabase, userId, res))) return;

  var { planId } = req.body || {};
  if (!planId) return res.status(400).json({ error: 'planId required' });

  try {
    // Verify the plan belongs to the caller and is awaiting approval.
    var planRes = await supabase
      .from('strategic_plans')
      .select('id, status, plan_name')
      .eq('id', planId)
      .eq('user_id', userId)
      .single();
    if (planRes.error || !planRes.data) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    if (planRes.data.status !== 'pending_approval') {
      return res.status(409).json({ error: 'Plan is not awaiting approval' });
    }

    var nowIso = new Date().toISOString();

    // Demote any other current plan for this user. Status moves to
    // 'archived' so the version history reads cleanly.
    await supabase
      .from('strategic_plans')
      .update({ is_current: false, status: 'archived', updated_at: nowIso })
      .eq('user_id', userId)
      .eq('is_current', true);

    // Promote the pending plan to current.
    var promoteRes = await supabase
      .from('strategic_plans')
      .update({ is_current: true, status: 'active', updated_at: nowIso })
      .eq('id', planId)
      .eq('user_id', userId);
    if (promoteRes.error) {
      console.error('[strategic-plan-approve] promote error:', promoteRes.error.message);
      return res.status(500).json({ error: 'Could not approve plan' });
    }

    // Walk every action_tracker row tied to this plan, convert
    // relative timeframes to absolute calendar dates, and clear the
    // is_pending flag. The Operational Tasks tab filters on
    // is_pending = false so this is the moment the rows become
    // visible to the owner.
    var rowsRes = await supabase
      .from('action_tracker')
      .select('id, items')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .eq('is_pending', true);
    var rows = (rowsRes && rowsRes.data) || [];
    var today = new Date();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var items = row.items || {};
      var existingDue = items.due_date || '';
      var rebased = relativeToAbsolute(existingDue, today);
      var updates = { is_pending: false };
      if (rebased && rebased !== existingDue) {
        items = Object.assign({}, items, { due_date: rebased });
        updates.items = items;
      }
      await supabase.from('action_tracker').update(updates).eq('id', row.id).eq('user_id', userId);
    }

    return res.status(200).json({
      success: true,
      planId: planId,
      tasksActivated: rows.length
    });
  } catch (err) {
    console.error('[strategic-plan-approve] error:', err && err.message);
    return res.status(500).json({ error: 'Could not approve plan. Please try again.' });
  }
}
