// api/bi-chat.js — BI Dashboard mini-chat endpoint
// Scoped conversations about specific insights. Each call includes
// the insight context and conversation history. Max 500 tokens response.

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

  var { insightData, question, history, module } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Missing question' });

  var profileRes = await supabase.from('profiles').select('business_name, industry, address_state, employee_range').eq('id', user.id).single();
  var profile = profileRes.data || {};

  var insightContext = '';
  if (insightData) {
    if (insightData.headline) insightContext += 'Alert: ' + insightData.headline + '\n';
    if (insightData.detail) insightContext += 'Detail: ' + insightData.detail + '\n';
    if (insightData.text) insightContext += 'Insight: ' + insightData.text + '\n';
    if (insightData.suggestion) insightContext += 'Suggested action: ' + insightData.suggestion + '\n';
    if (insightData.severity) insightContext += 'Severity: ' + insightData.severity + '\n';
  }

  var systemPrompt = 'You are an AI business advisor for ' + (profile.business_name || 'a business') + ', a ' + (profile.industry || 'small business') + ' in ' + (profile.address_state || 'Australia') + '.\n\n';
  systemPrompt += 'The user is asking about a specific BI insight:\n' + insightContext + '\n';
  systemPrompt += 'Rules:\n';
  systemPrompt += '- Be concise and actionable. Maximum 3-4 sentences per response.\n';
  systemPrompt += '- Use Australian English (colour, organisation, recognised).\n';
  systemPrompt += '- No exclamation marks.\n';
  systemPrompt += '- Stay focused on this specific insight. If the user goes off topic, redirect: "Let\'s stay focused on [topic]. What would you like to know about this specifically?"\n';
  systemPrompt += '- Reference specific numbers from the insight data when relevant.\n';
  systemPrompt += '- Give practical, specific advice — not generic business platitudes.';

  var messages = [];
  if (Array.isArray(history)) {
    for (var i = 0; i < history.length; i++) {
      messages.push({ role: history[i].role, content: history[i].content });
    }
  }
  messages.push({ role: 'user', content: question });

  try {
    var claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: systemPrompt,
        messages: messages
      })
    });

    var claudeData = await claudeResp.json();
    if (claudeData.error) {
      console.error('[bi-chat] Claude error:', JSON.stringify(claudeData.error));
      return res.status(500).json({ error: 'Could not generate response. Please try again.' });
    }

    var reply = claudeData.content && claudeData.content[0] ? claudeData.content[0].text : '';

    return res.status(200).json({ success: true, reply: reply });
  } catch (err) {
    console.error('[bi-chat] error:', err.message || err);
    return res.status(500).json({ error: 'Chat request failed. Please try again.' });
  }
}
