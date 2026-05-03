// api/bi-insights.js — BI Dashboard main AI analysis endpoint
// Gathers data from all connected sources, sends to Claude for analysis,
// caches structured insights in bi_insights table with expiry.

export const config = { maxDuration: 120 };

import { createClient } from '@supabase/supabase-js';
import { logAnthropicUsage } from '../lib/usage-logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SITE_URL = 'https://staxai.com.au';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
  const userId = user.id;

  var profileRes = await supabase.from('profiles').select('business_name, industry, address_state, address_suburb, services, products, employee_range, years_in_business').eq('id', userId).single();
  var profile = (profileRes.data) || {};

  async function callInternal(endpoint, body) {
    try {
      var r = await fetch(SITE_URL + '/api/' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify(body || {})
      });
      if (!r.ok) return null;
      var j = await r.json();
      return j.success ? j.data : null;
    } catch (e) { return null; }
  }

  try {
    var results = await Promise.all([
      callInternal('bi-financial', {}),
      callInternal('bi-customers', {}),
      callInternal('bi-operations', {})
    ]);
    var financial = results[0];
    var customers = results[1];
    var operations = results[2];

    var contextParts = [];
    contextParts.push('Business: ' + (profile.business_name || 'Unknown'));
    contextParts.push('Industry: ' + (profile.industry || 'Unknown'));
    contextParts.push('Location: ' + (profile.address_suburb || '') + ' ' + (profile.address_state || ''));
    if (profile.services) contextParts.push('Services: ' + profile.services);
    if (profile.employee_range) contextParts.push('Team size: ' + profile.employee_range);
    if (profile.years_in_business) contextParts.push('Years in business: ' + profile.years_in_business);

    if (financial) {
      var fs = financial.summary || {};
      contextParts.push('\nFINANCIAL DATA:');
      contextParts.push('Revenue: $' + (fs.total_revenue || 0) + ', Expenses: $' + (fs.total_expenses || 0));
      contextParts.push('Profit margin: ' + (fs.profit_margin || 0) + '%');
      contextParts.push('Cash: $' + (fs.cash_balance || 0) + ', Receivable: $' + (fs.accounts_receivable || 0) + ', Payable: $' + (fs.accounts_payable || 0));
      contextParts.push('Overdue receivable: $' + (fs.overdue_receivable || 0));
      if (financial.trend && financial.trend.length > 0) {
        var recent = financial.trend.slice(-3);
        contextParts.push('Recent months: ' + recent.map(function(t) { return t.month + ' rev:$' + t.revenue + ' exp:$' + t.expenses; }).join(', '));
      }
    }

    if (customers) {
      var cs = customers.summary || {};
      contextParts.push('\nCUSTOMER DATA:');
      contextParts.push('Customers: ' + (cs.total_customers || 0) + ', Avg invoice: $' + (cs.avg_invoice_value || 0));
      contextParts.push('Top 3 concentration: ' + (cs.concentration_pct || 0) + '%');
      contextParts.push('Quote conversion: ' + (cs.conversion_rate || 0) + '% (' + (cs.accepted_quotes || 0) + '/' + (cs.quote_count || 0) + ')');
      contextParts.push('Inactive customers (60+ days): ' + (cs.inactive_count || 0));
      if (customers.top_customers) {
        contextParts.push('Top customers: ' + customers.top_customers.slice(0, 5).map(function(c) { return c.name + ' $' + c.revenue + ' (' + c.percentage + '%)'; }).join(', '));
      }
    }

    if (operations) {
      var os = operations.summary || {};
      contextParts.push('\nOPERATIONS DATA:');
      contextParts.push('Jobs: ' + (os.total_jobs || 0) + ', Completed: ' + (os.completed_jobs || 0));
      contextParts.push('Avg duration: ' + (os.avg_duration_days || 0) + ' days, Avg value: $' + (os.avg_job_value || 0));
      contextParts.push('Over quote: ' + (os.over_quote_count || 0) + ', Under quote: ' + (os.under_quote_count || 0));
      contextParts.push('Form completion: ' + (os.form_completion_rate || 0) + '%');
    }

    var systemPrompt = 'You are the AI Board of Directors for an Australian small business. You analyse business data and produce actionable insights.\n\nRules:\n- Be direct and specific. Use real numbers from the data.\n- Australian English (colour, organisation, recognised).\n- No exclamation marks. No generic advice.\n- Each insight must be grounded in the data provided.\n- Severity: red = urgent action needed, amber = monitor closely, green = positive signal.\n- For each alert, include a clear suggested action.\n- Focus on cross-source patterns the owner would not notice themselves.';

    var userPrompt = 'Analyse this business data and generate insights.\n\n' + contextParts.join('\n') + '\n\nReturn a JSON array of insight objects. Each object must have:\n- module: one of "financial", "customers", "operations", "alerts"\n- insight_type: "metric", "advisory", or "alert"\n- insight_data: object with relevant fields\n\nFor alert-type insights (module: "alerts"), insight_data must include: severity ("red", "amber", or "green"), category (one of "financial", "customers", "operations", "market", "strategic"), icon (emoji), headline (short), detail (1-2 sentences), suggestion (actionable next step). Severity red and amber are risks; severity green is an opportunity.\n\nFor advisory-type insights, insight_data must include: icon (emoji), text (1-2 sentences with specific numbers).\n\nGenerate 8-15 insights total. At least 4 should be alerts (module: "alerts") that cross-reference multiple data sources. Prioritise risks and opportunities the owner would not notice.\n\nReturn ONLY the JSON array, no markdown.';

    var claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!claudeResp.ok) { console.error('[bi-insights] Claude HTTP error:', claudeResp.status); return res.status(502).json({ error: 'AI service unavailable. Please try again.' }); }

    var claudeData = await claudeResp.json();
    logAnthropicUsage({ tool_id: 'bi', user_id: userId, model: 'claude-sonnet-4-6', usage: claudeData && claudeData.usage });
    if (claudeData.error) {
      console.error('[bi-insights] Claude API error:', JSON.stringify(claudeData.error));
      return res.status(500).json({ error: 'AI analysis failed. Please try again.' });
    }

    var raw = claudeData.content && claudeData.content[0] ? claudeData.content[0].text : '[]';
    var insights;
    try {
      var clean = raw.replace(/```json|```/g, '').trim();
      insights = JSON.parse(clean);
    } catch (e) {
      console.error('[bi-insights] JSON parse error:', e.message, 'raw:', raw.substring(0, 500));
      return res.status(500).json({ error: 'Could not parse AI response. Please try again.' });
    }

    if (!Array.isArray(insights)) insights = [];

    var now = new Date().toISOString();
    var expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('bi_insights').delete().eq('user_id', userId).eq('is_dismissed', false);

    var rows = insights.map(function(ins) {
      return {
        user_id: userId,
        module: ins.module || 'alerts',
        insight_type: ins.insight_type || 'advisory',
        insight_data: ins.insight_data || {},
        relevance_score: ins.relevance_score || 5,
        generated_at: now,
        expires_at: expires,
        is_dismissed: false,
        created_at: now,
        updated_at: now
      };
    });

    if (rows.length > 0) {
      var insertRes = await supabase.from('bi_insights').insert(rows);
      if (insertRes.error) {
        console.error('[bi-insights] Insert error:', insertRes.error);
      }
    }

    var cached = await supabase.from('bi_insights').select('*').eq('user_id', userId).eq('is_dismissed', false).order('relevance_score', { ascending: false });

    return res.status(200).json({
      success: true,
      data: cached.data || [],
      generated: rows.length
    });
  } catch (err) {
    console.error('[bi-insights] error:', err.message || err);
    return res.status(500).json({ error: 'Could not generate insights. Please try again.' });
  }
}
