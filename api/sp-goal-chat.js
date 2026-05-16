// api/sp-goal-chat.js
//
// SP/OT Rebuild Phase 3 (spec §6.8 / §6.9) — conversational AI for
// editing or creating a single strategic Goal. The Review screen's
// slide-in chat panel posts a turn-by-turn conversation here; the
// endpoint asks Claude for a reply plus, when alignment is reached,
// a complete proposedGoal object the owner can Accept.
//
// Two modes:
//   edit   — refining an existing Goal. The request payload carries
//            the current Goal (title + description + tasks) so the
//            model can suggest changes against the live shape.
//   create — adding a new Goal to a specific category. The model
//            asks "what goal would you like..." then shapes the
//            answer into a Goal with tasks.
//
// Response shape:
//   { reply: string, proposedGoal: null | { title, description, tasks: [...] } }
// proposedGoal === null until the owner has communicated enough for
// the model to commit to a shape; the panel renders the reply each
// turn and reveals an Accept button only when proposedGoal is non-null.
//
// ENV: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';
import { logAnthropicUsage } from '../lib/usage-logger.js';
import { requireBpComplete } from '../lib/bp-gate.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

var CATEGORY_LABELS = {
  financial:  'Financial',
  products:   'Products & Services',
  customers:  'Customers & Suppliers',
  operations: 'Operations & Capacity',
  market:     'Market & Competition',
  growth:     'Growth & Transformation',
  risk:       'Continuity & Resilience'
};

function summariseGoal(goal) {
  if (!goal) return '';
  var lines = [];
  lines.push('Title: ' + (goal.title || ''));
  lines.push('Description: ' + (goal.description || ''));
  var tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
  if (tasks.length > 0) {
    lines.push('Tasks:');
    tasks.forEach(function(t, i) {
      var line = '  ' + (i + 1) + '. ' + (t.title || '');
      var bits = [];
      if (t.dueRelative) bits.push(t.dueRelative);
      if (t.priority) bits.push(t.priority);
      if (t.owner) bits.push(t.owner);
      if (bits.length) line += ' [' + bits.join(' · ') + ']';
      if (t.description) line += ' — ' + t.description;
      lines.push(line);
    });
  }
  return lines.join('\n');
}

function listOtherGoals(plan_data, currentIdx) {
  var goals = (plan_data && Array.isArray(plan_data.goals)) ? plan_data.goals : [];
  return goals
    .map(function(g, i) { return i === currentIdx ? null : { idx: i, title: g.title || '', category: g.category || '' }; })
    .filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
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

  var { mode, planId, goalIdx, category, messages } = req.body || {};
  if (!mode || (mode !== 'edit' && mode !== 'create')) {
    return res.status(400).json({ error: 'mode must be "edit" or "create"' });
  }
  if (!planId) return res.status(400).json({ error: 'planId required' });
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  // Fetch the plan so the model has business + Goal context. The
  // strategic_plans row already holds plan_data and interview_data
  // (the wizard answers); both feed the prompt.
  var planRes = await supabase
    .from('strategic_plans')
    .select('id, status, plan_data, interview_data')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();
  if (planRes.error || !planRes.data) {
    return res.status(404).json({ error: 'Plan not found' });
  }
  var plan = planRes.data;
  var planData = plan.plan_data || {};
  var interview = plan.interview_data || {};

  var resolvedCategory = category;
  var existingGoal = null;
  if (mode === 'edit') {
    var goals = Array.isArray(planData.goals) ? planData.goals : [];
    if (goalIdx == null || !goals[goalIdx]) {
      return res.status(400).json({ error: 'goalIdx must point to an existing goal' });
    }
    existingGoal = goals[goalIdx];
    resolvedCategory = existingGoal.category || resolvedCategory;
  }
  var categoryLabel = CATEGORY_LABELS[resolvedCategory] || 'Other';

  // ── System prompt ────────────────────────────────────────────────
  var systemPrompt =
    'You are a strategic planning advisor working with the owner of an Australian small business. ' +
    'You are helping them refine a single strategic Goal in their plan. ' +
    'Australian English (colour, organisation, recognised). Plain language. No exclamation marks. Direct, specific, grounded in the data provided.\n\n' +
    'CONVERSATION RULES:\n' +
    '- Ask clarifying questions when the owner\'s request is vague.\n' +
    '- Speak conversationally first; only commit to a complete Goal once you understand what they want.\n' +
    '- You may suggest moving the goal to a different category, splitting it, merging with another, or deleting it — flag any of these in your reply text.\n' +
    '- When you propose a revised Goal it must include a title (max 60 chars), a 1–2 sentence description, and 2–5 tasks. Each task has title, description (1 sentence), dueRelative ("Week 1" / "Week 2" / "Week 3" / "Month 1" / "Month 2" / "Month 3"), priority (High / Medium / Low), and owner (defaults to "Owner").\n\n' +
    'OUTPUT FORMAT (strict JSON, no prose outside the JSON):\n' +
    '{\n' +
    '  "reply": "<conversational text the owner sees>",\n' +
    '  "proposedGoal": null | {\n' +
    '    "title": "...",\n' +
    '    "description": "...",\n' +
    '    "category": "financial" | "products" | "customers" | "operations" | "market" | "growth" | "risk",\n' +
    '    "tasks": [\n' +
    '      { "title": "...", "description": "...", "dueRelative": "Week 1", "priority": "High", "owner": "Owner" }\n' +
    '    ]\n' +
    '  }\n' +
    '}\n' +
    'proposedGoal stays null on every turn where you are still discussing or asking questions. Only fill it in when the conversation has produced enough alignment for a concrete proposal.';

  // ── User context block ──────────────────────────────────────────
  var contextLines = [];
  contextLines.push('BUSINESS CONTEXT:');
  contextLines.push('- Business: ' + (interview.businessName || 'Unknown'));
  if (interview.industry) contextLines.push('- Industry: ' + (Array.isArray(interview.industry) ? interview.industry.join(', ') : interview.industry));
  if (interview.location) contextLines.push('- Location: ' + interview.location);
  if (interview.teamSize) contextLines.push('- Team size: ' + interview.teamSize);
  if (interview.annualRevenue) contextLines.push('- Annual revenue band: ' + interview.annualRevenue);
  contextLines.push('');
  contextLines.push('CATEGORY: ' + categoryLabel + ' (key: ' + resolvedCategory + ')');
  contextLines.push('');
  if (mode === 'edit' && existingGoal) {
    contextLines.push('CURRENT GOAL (the one we are editing):');
    contextLines.push(summariseGoal(existingGoal));
    contextLines.push('');
  } else {
    contextLines.push('We are creating a new Goal in this category. The owner has not described it yet — start by asking what goal they want to add.');
    contextLines.push('');
  }
  var others = listOtherGoals(planData, mode === 'edit' ? goalIdx : null);
  if (others.length > 0) {
    contextLines.push('OTHER GOALS IN THE PLAN (do not overlap with these):');
    others.forEach(function(g) { contextLines.push('- [' + g.category + '] ' + g.title); });
    contextLines.push('');
  }
  var contextBlock = contextLines.join('\n');

  // Prepend the context as a leading user turn so subsequent messages
  // chain naturally. Claude gets the most recent owner message at the
  // tail.
  var apiMessages = [{ role: 'user', content: contextBlock }];
  messages.forEach(function(m) {
    if (!m || !m.role || !m.content) return;
    apiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) });
  });

  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: apiMessages
      })
    });
    if (!resp.ok) {
      var errText = await resp.text().catch(function() { return ''; });
      console.error('[sp-goal-chat] Claude HTTP', resp.status, errText.substring(0, 200));
      return res.status(502).json({ error: 'AI service unavailable. Please try again.' });
    }
    var data = await resp.json();
    logAnthropicUsage({ tool_id: 'strategic-plan', user_id: userId, model: 'claude-sonnet-4-6', usage: data && data.usage });
    var rawText = data.content && data.content[0] ? data.content[0].text : '';
    var clean = rawText.replace(/```json|```/g, '').trim();
    var parsed = null;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      // Recover gracefully — surface the raw text as the reply with
      // no proposal so the conversation continues.
      return res.status(200).json({ reply: clean || 'Sorry — I had trouble formatting that response. Could you ask again?', proposedGoal: null });
    }
    var reply = (parsed && typeof parsed.reply === 'string') ? parsed.reply : '';
    var proposedGoal = (parsed && parsed.proposedGoal && typeof parsed.proposedGoal === 'object') ? parsed.proposedGoal : null;
    if (proposedGoal && (!proposedGoal.category || !CATEGORY_LABELS[proposedGoal.category])) {
      proposedGoal.category = resolvedCategory;
    }
    return res.status(200).json({ reply: reply, proposedGoal: proposedGoal });
  } catch (err) {
    console.error('[sp-goal-chat] error:', err && err.message);
    return res.status(500).json({ error: 'Could not reach the AI. Please try again.' });
  }
}
