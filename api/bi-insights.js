// api/bi-insights.js — BI Dashboard main AI analysis endpoint
// Generates Risks & Opportunities by combining:
//  - Internal data (Xero/MYOB financial + customer summaries, ServiceM8 ops)
//  - Content Library items tagged for BI (tool_tags contains 'bi')
//  - The current Strategic Plan (interview_data)
//  - External web research via Serper.dev (industry, regulatory, market,
//    geographic, acquisition opportunities)
// Caches results in bi_insights for 24 hours; the expensive Claude+Serper
// pipeline only runs when the cache is stale or forceRefresh is true.

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { logAnthropicUsage, logSerperUsage } from '../lib/usage-logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SITE_URL = 'https://staxai.com.au';

const AUSTRALIAN_STATES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  SA: 'South Australia', WA: 'Western Australia', TAS: 'Tasmania',
  NT: 'Northern Territory', ACT: 'Australian Capital Territory'
};

function extractState(location) {
  if (!location) return null;
  var upper = String(location).toUpperCase();
  for (var abbr in AUSTRALIAN_STATES) {
    if (new RegExp('\\b' + abbr + '\\b').test(upper)) return abbr;
  }
  var lower = String(location).toLowerCase();
  for (var key in AUSTRALIAN_STATES) {
    if (lower.indexOf(AUSTRALIAN_STATES[key].toLowerCase()) !== -1) return key;
  }
  return null;
}

function dedupByLink(items) {
  var seen = new Set();
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var key = items[i].link;
    if (!key) { out.push(items[i]); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(items[i]);
  }
  return out;
}

async function serperSearch(query, type, userId) {
  if (!SERPER_API_KEY) return [];
  try {
    var endpoint = type === 'search' ? 'https://google.serper.dev/search' : 'https://google.serper.dev/news';
    var body = { q: query, gl: 'au', hl: 'en', num: 8 };
    if (type === 'news') body.tbs = 'qdr:m';
    var resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      console.error('[bi-insights] Serper non-OK:', resp.status, 'query:', query);
      return [];
    }
    await logSerperUsage({ tool_id: 'bi', user_id: userId || null });
    var data = await resp.json();
    var raw = type === 'search' ? (data.organic || []) : (data.news || []);
    return raw.slice(0, 8).map(function(r) {
      var src = r.source || '';
      if (!src && r.link) { try { src = new URL(r.link).hostname.replace(/^www\./, ''); } catch (e) {} }
      return {
        title: r.title || '',
        snippet: r.snippet || '',
        link: r.link || '',
        source: src
      };
    });
  } catch (e) {
    console.error('[bi-insights] Serper exception:', e && e.message, 'query:', query);
    return [];
  }
}

async function runResearch(industry, location, userId) {
  if (!industry) industry = 'small business';
  var state = extractState(location);
  var stateFull = state ? AUSTRALIAN_STATES[state] : null;
  var stateForQuery = stateFull || 'Australia';
  var year = new Date().getFullYear();

  var queries = [
    { type: 'news',   topic: 'industry',     q: industry + ' industry trends Australia ' + year },
    { type: 'news',   topic: 'compliance',   q: industry + ' regulatory compliance legislation Australia ' + year },
    { type: 'news',   topic: 'competitor',   q: industry + ' ' + stateForQuery + ' market and competitor activity' },
    { type: 'news',   topic: 'expansion',    q: stateForQuery + ' business growth opportunities ' + industry },
    { type: 'search', topic: 'acquisitions', q: '"businesses for sale" ' + industry + ' ' + stateForQuery + ' (site:seekbusiness.com.au OR site:businessesforsale.com.au)' }
  ];

  var bundles = await Promise.all(queries.map(function(q) {
    return serperSearch(q.q, q.type, userId).then(function(items) {
      return { topic: q.topic, items: items };
    });
  }));

  var combined = [];
  bundles.forEach(function(b) {
    b.items.forEach(function(item) { item._topic = b.topic; combined.push(item); });
  });
  return dedupByLink(combined);
}

async function loadCLContext(supabase, userId) {
  try {
    var resp = await supabase
      .from('content_library')
      .select('id, title, content_text, tool_source, created_at')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .contains('tool_tags', ['bi'])
      .order('created_at', { ascending: false })
      .limit(20);
    if (resp.error || !resp.data) return [];
    return resp.data.map(function(item) {
      return {
        title: item.title || '(untitled)',
        text: (item.content_text || '').substring(0, 400)
      };
    });
  } catch (e) {
    return [];
  }
}

async function loadSPContext(supabase, userId) {
  try {
    var resp = await supabase.from('strategic_plans')
      .select('interview_data, year')
      .eq('user_id', userId)
      .eq('is_current', true)
      .maybeSingle();
    if (resp.error || !resp.data || !resp.data.interview_data) return null;
    return resp.data;
  } catch (e) {
    return null;
  }
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

  const { forceRefresh } = req.body || {};

  // Cost cap: serve cached insights if any are still inside their 24h
  // window, unless the caller explicitly asked for a fresh regeneration.
  if (!forceRefresh) {
    var cachedRes = await supabase
      .from('bi_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('is_dismissed', false)
      .gt('expires_at', new Date().toISOString())
      .order('relevance_score', { ascending: false });
    if (!cachedRes.error && cachedRes.data && cachedRes.data.length > 0) {
      return res.status(200).json({ success: true, data: cachedRes.data, cached: true, generated: 0 });
    }
  }

  var profileRes = await supabase.from('profiles')
    .select('business_name, industry, address_state, address_suburb, services, products, employee_range, years_in_business')
    .eq('id', userId).single();
  var profile = (profileRes.data) || {};
  var industry = profile.industry || 'small business';
  var location = ((profile.address_suburb || '') + ' ' + (profile.address_state || '')).trim();

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
    var parallel = await Promise.all([
      callInternal('bi-financial', {}),
      callInternal('bi-customers', {}),
      callInternal('bi-operations', {}),
      callInternal('bi-projects', {}),
      loadCLContext(supabase, userId),
      loadSPContext(supabase, userId),
      runResearch(industry, location, userId)
    ]);
    var financial = parallel[0];
    var customers = parallel[1];
    var operations = parallel[2];
    var projects = parallel[3];
    var clItems = parallel[4] || [];
    var spContext = parallel[5];
    var research = parallel[6] || [];

    var contextParts = [];

    contextParts.push('BUSINESS PROFILE');
    contextParts.push('- Name: ' + (profile.business_name || 'Unknown'));
    contextParts.push('- Industry: ' + industry);
    contextParts.push('- Location: ' + (location || 'Unknown'));
    if (profile.services) contextParts.push('- Services: ' + profile.services);
    if (profile.products) contextParts.push('- Products: ' + profile.products);
    if (profile.employee_range) contextParts.push('- Team size: ' + profile.employee_range);
    if (profile.years_in_business) contextParts.push('- Years in business: ' + profile.years_in_business);

    if (financial) {
      var fs = (financial.summary) || {};
      contextParts.push('\nFINANCIAL DATA');
      contextParts.push('- Revenue: $' + (fs.total_revenue || 0));
      contextParts.push('- Expenses: $' + (fs.total_expenses || 0));
      contextParts.push('- Profit margin: ' + (fs.profit_margin || 0) + '%');
      contextParts.push('- Cash on hand: $' + (fs.cash_balance || 0));
      contextParts.push('- Receivables: $' + (fs.accounts_receivable || 0) + ' (overdue $' + (fs.overdue_receivable || 0) + ')');
      contextParts.push('- Payables: $' + (fs.accounts_payable || 0));
      if (financial.trend && financial.trend.length > 0) {
        var recent = financial.trend.slice(-3);
        contextParts.push('- Recent months: ' + recent.map(function(t) { return t.month + ' rev:$' + t.revenue + ' exp:$' + t.expenses; }).join(', '));
      }
    }

    if (customers) {
      var cs = (customers.summary) || {};
      contextParts.push('\nCUSTOMER DATA');
      contextParts.push('- Total customers: ' + (cs.total_customers || 0));
      contextParts.push('- Average invoice: $' + (cs.avg_invoice_value || 0));
      contextParts.push('- Top 3 concentration: ' + (cs.concentration_pct || 0) + '%');
      contextParts.push('- Quote conversion: ' + (cs.conversion_rate || 0) + '% (' + (cs.accepted_quotes || 0) + '/' + (cs.quote_count || 0) + ')');
      contextParts.push('- Inactive customers (60+ days): ' + (cs.inactive_count || 0));
      if (customers.top_customers) {
        contextParts.push('- Top customers: ' + customers.top_customers.slice(0, 5).map(function(c) {
          return c.name + ' ($' + c.revenue + ', ' + c.percentage + '%)';
        }).join(', '));
      }
    }

    if (operations) {
      var os = (operations.summary) || {};
      contextParts.push('\nEXPENSE & COST DATA');
      contextParts.push('- Total expenses: $' + (os.total_expenses || 0));
      contextParts.push('- Total cost of business (expenses + COGS): $' + (os.total_cost_of_business || 0));
      contextParts.push('- Largest cost centre: ' + (os.largest_category || 'Unknown') + ' ($' + (os.largest_category_amount || 0) + ', ' + (os.largest_category_pct || 0) + '% of expenses)');
      contextParts.push('- Labour cost: $' + (os.labour_total || 0) + ' (' + (os.labour_pct_revenue || 0) + '% of revenue)');
      contextParts.push('- Supplier concentration: top 3 = ' + (os.supplier_concentration_pct || 0) + '% of bill spend (' + (os.supplier_count || 0) + ' suppliers)');
      var opData = operations || {};
      if (Array.isArray(opData.top_expense_categories) && opData.top_expense_categories.length > 0) {
        contextParts.push('- Top expense categories: ' + opData.top_expense_categories.slice(0, 5).map(function (c) { return c.name + ' $' + c.total + ' (' + c.pct_of_total + '%)'; }).join(', '));
      }
      if (Array.isArray(opData.top_overheads) && opData.top_overheads.length > 0) {
        contextParts.push('- Top overheads: ' + opData.top_overheads.slice(0, 4).map(function (c) { return c.name + ' $' + c.total; }).join(', '));
      }
      if (Array.isArray(opData.top_suppliers) && opData.top_suppliers.length > 0) {
        contextParts.push('- Top suppliers by spend: ' + opData.top_suppliers.slice(0, 5).map(function (s) { return s.name + ' $' + s.spend + ' (' + s.percentage + '%)'; }).join(', '));
      }
    }

    if (projects) {
      var ps = (projects.summary) || {};
      contextParts.push('\nPROJECT / JOB DATA');
      contextParts.push('- Total jobs: ' + (ps.total_jobs || 0) + ' (' + (ps.completed_count || 0) + ' completed, ' + (ps.in_progress_count || 0) + ' in progress, ' + (ps.quoted_count || 0) + ' quoted)');
      contextParts.push('- Completion rate: ' + (ps.completion_rate || 0) + '%');
      contextParts.push('- Average job value: $' + (ps.avg_job_value || 0));
      contextParts.push('- Average margin: ' + (ps.avg_margin_pct || 0) + '% (total profit $' + (ps.total_profit || 0) + ')');
      contextParts.push('- Average duration: ' + (ps.avg_duration_days || 0) + ' days');
      if (ps.quote_variance_jobs > 0) {
        contextParts.push('- Quote vs actual: ' + ps.over_quote_count + ' over, ' + ps.on_quote_count + ' on, ' + ps.under_quote_count + ' under (sample of ' + ps.quote_variance_jobs + ')');
      }
      var pData = projects || {};
      if (Array.isArray(pData.top_by_profit) && pData.top_by_profit.length > 0) {
        contextParts.push('- Top jobs by profit: ' + pData.top_by_profit.slice(0, 5).map(function (j) { return j.job_name + ' $' + j.profit + ' (' + j.margin_pct + '%)'; }).join(', '));
      }
    }

    if (clItems.length > 0) {
      contextParts.push('\nCONTENT LIBRARY (items tagged for BI review)');
      clItems.forEach(function(it, i) {
        contextParts.push('[' + (i + 1) + '] ' + it.title + ' — ' + it.text);
      });
    }

    if (spContext && spContext.interview_data) {
      var spSummary = JSON.stringify(spContext.interview_data).substring(0, 1200);
      contextParts.push('\nCURRENT STRATEGIC PLAN (year ' + (spContext.year || '') + ')');
      contextParts.push(spSummary);
    }

    if (research.length > 0) {
      contextParts.push('\nEXTERNAL RESEARCH (recent web results — industry, regulatory, market, geographic, acquisitions)');
      research.slice(0, 25).forEach(function(r) {
        var line = '- [' + (r._topic || 'general') + '] ' + r.title;
        if (r.source) line += ' (' + r.source + ')';
        if (r.snippet) line += ': ' + r.snippet.substring(0, 220);
        contextParts.push(line);
      });
    }

    var systemPrompt = (
      'You are a trusted business advisor preparing a strategic briefing for the owner of an Australian small business. ' +
      'Speak as a senior advisor — direct, specific, grounded in the data and research provided. ' +
      'Australian English (colour, organisation, recognised). No exclamation marks. No generic advice. ' +
      'Use real numbers and cite specific evidence. Each insight must explain WHY it matters to THIS business.'
    );

    var userPrompt = (
      'You are preparing a Risks & Opportunities briefing for the owner of ' + (profile.business_name || 'this business') +
      ', a ' + industry + ' business based in ' + (location || 'Australia') + '.\n\n' +
      'You have access to:\n' +
      '- Financial data from their accounting software\n' +
      '- Operational data from their job management system (if connected)\n' +
      '- Documents, supplier information, contracts and research the owner has tagged for BI review in their Content Library\n' +
      '- Their current Strategic Plan (if one exists)\n' +
      '- Their business profile\n' +
      '- Current industry news, compliance changes, market activity, geographic expansion signals, and acquisition listings (web research)\n\n' +
      'INPUT:\n\n' +
      contextParts.join('\n') + '\n\n' +
      'TASK:\n' +
      'Identify Risks and Opportunities that matter to THIS business specifically. Do not simply restate the numbers — interpret what they mean for the owner\'s situation and what action they should consider.\n\n' +
      'Quality bar — examples of the calibre of insight expected:\n' +
      '- Noticing that a key supplier mentioned in their documents has been in the news for financial trouble, creating supply chain risk\n' +
      '- Identifying that customer concentration combined with overdue receivables from their largest client creates existential cash flow risk\n' +
      '- Spotting that industry news about new compliance requirements will affect their business within a specific timeframe\n' +
      '- Recognising that their geographic footprint and service mix positions them well to expand into an adjacent market showing growth\n' +
      '- Connecting their strong profit margins with acquisition opportunities in their region\n\n' +
      'These are examples of strategic thinking, not a checklist. Surface any insight at this level that the data supports. Cross-reference multiple sources where possible.\n\n' +
      'SEVERITY ROUTING (strict):\n' +
      '- red: urgent risk — output appears in Risks column\n' +
      '- amber: risk to monitor — output appears in Risks column\n' +
      '- green: opportunity — output appears in Opportunities column\n' +
      'amber is NEVER an opportunity. If something is positive, it must be green. If something needs watching, it is amber and stays in Risks.\n\n' +
      'DUAL-ASPECT RULE:\n' +
      'When a single situation has both a downside and an upside (for example, customer concentration creates cash flow risk AND signals deep relationships you could expand), generate TWO separate insights:\n' +
      '- one framed as the risk (severity red or amber) describing what could go wrong and how to mitigate\n' +
      '- one framed as the opportunity (severity green) describing what could go right and how to capture it\n' +
      'They must complement, not duplicate — different headline, different detail, different suggestion. Do not collapse a dual-aspect situation into a single amber insight.\n\n' +
      'Output must include both Risks AND Opportunities. If the data only shows problems, look harder for opportunities. If only positives, look harder for risks. A balanced view is essential.\n\n' +
      'SOURCE ATTRIBUTION:\n' +
      'For every insight, populate a "sources" array of 1-3 items naming the inputs you actually relied on. Use these labels exactly:\n' +
      '- "Financial data" — the financial summary block above\n' +
      '- "Customer data" — the customer summary block above\n' +
      '- "Operations data" — the operations summary block above\n' +
      '- "Content Library" — an item from the BI-tagged Content Library list\n' +
      '- "Strategic Plan" — the current strategic plan\n' +
      '- "Web research" — a result from the external research list (include the url if available)\n' +
      'Each source must include a brief detail showing the specific evidence (e.g. "cash $12k, overdue receivables $8k" or "ATO GST changes from July 2026"). Web research sources should include the link.\n\n' +
      'OUTPUT FORMAT:\n' +
      'Return ONLY a JSON array (no markdown, no commentary). Generate 8-15 insights. At least 3 should be Risks (severity red or amber) and at least 3 should be Opportunities (severity green).\n\n' +
      'Each insight object:\n' +
      '{\n' +
      '  "module": "alerts",\n' +
      '  "insight_type": "alert",\n' +
      '  "relevance_score": <integer 1-10, 10 = most important>,\n' +
      '  "insight_data": {\n' +
      '    "severity": "red" | "amber" | "green",\n' +
      '    "category": "financial" | "customers" | "operations" | "market" | "strategic",\n' +
      '    "icon": "<single emoji>",\n' +
      '    "headline": "<short headline, 8-12 words>",\n' +
      '    "detail": "<2-3 sentences explaining why this matters to THIS business, citing specific numbers or evidence from the input>",\n' +
      '    "suggestion": "<concrete next step the owner should consider>",\n' +
      '    "sources": [\n' +
      '      { "label": "<one of the source labels above>", "detail": "<specific evidence>", "url": "<optional, web research only>" }\n' +
      '    ]\n' +
      '  }\n' +
      '}'
    );

    var claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!claudeResp.ok) {
      console.error('[bi-insights] Claude HTTP error:', claudeResp.status);
      return res.status(502).json({ error: 'AI service unavailable. Please try again.' });
    }

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
        insight_type: ins.insight_type || 'alert',
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
      if (insertRes.error) console.error('[bi-insights] Insert error:', insertRes.error);
    }

    var fresh = await supabase.from('bi_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('is_dismissed', false)
      .order('relevance_score', { ascending: false });

    return res.status(200).json({
      success: true,
      data: fresh.data || [],
      generated: rows.length,
      cached: false
    });
  } catch (err) {
    console.error('[bi-insights] error:', err && err.message);
    return res.status(500).json({ error: 'Could not generate insights. Please try again.' });
  }
}
