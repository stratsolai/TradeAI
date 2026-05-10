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

async function serperSearch(query, type, userId, tbs) {
  if (!SERPER_API_KEY) return [];
  try {
    var endpoint = type === 'search' ? 'https://google.serper.dev/search' : 'https://google.serper.dev/news';
    var body = { q: query, gl: 'au', hl: 'en', num: 8 };
    // Recency window per spec §6.4: caller-provided tbs wins; otherwise
    // news defaults to qdr:m (1 month) to drop aggregator/SEO chaff.
    if (tbs) body.tbs = tbs;
    else if (type === 'news') body.tbs = 'qdr:m';
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

  // Recency tightening per spec §6.4:
  //   compliance/regulatory  → 3 months  (qdr:m3)
  //   industry / competitor / expansion (market activity) → 1 month (qdr:m)
  //   acquisitions (listings remain valid until sold)     → no restriction
  var queries = [
    { type: 'news',   topic: 'industry',     tbs: 'qdr:m',  q: industry + ' industry trends Australia ' + year },
    { type: 'news',   topic: 'compliance',   tbs: 'qdr:m3', q: industry + ' regulatory compliance legislation Australia ' + year },
    { type: 'news',   topic: 'competitor',   tbs: 'qdr:m',  q: industry + ' ' + stateForQuery + ' market and competitor activity' },
    { type: 'news',   topic: 'expansion',    tbs: 'qdr:m',  q: stateForQuery + ' business growth opportunities ' + industry },
    { type: 'search', topic: 'acquisitions', tbs: null,     q: '"businesses for sale" ' + industry + ' ' + stateForQuery + ' (site:seekbusiness.com.au OR site:businessesforsale.com.au)' }
  ];

  var bundles = await Promise.all(queries.map(function(q) {
    return serperSearch(q.q, q.type, userId, q.tbs).then(function(items) {
      return { topic: q.topic, items: items };
    });
  }));

  var combined = [];
  bundles.forEach(function(b) {
    b.items.forEach(function(item) { item._topic = b.topic; combined.push(item); });
  });

  // Return both the deduped item list and per-query metadata. The
  // metadata is surfaced by dry-run mode so the owner can see what
  // evidence reached the prompt.
  return {
    items: dedupByLink(combined),
    queries: queries.map(function(q, i) {
      return {
        topic: q.topic,
        type: q.type,
        q: q.q,
        tbs: q.tbs || (q.type === 'news' ? 'qdr:m' : null),
        result_count: bundles[i].items.length
      };
    })
  };
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

// ─────────────────────────────────────────────────────────────────────
// Validation + matrix rating helpers (spec §4, §6.2, §6.3)
// ─────────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = ['financial','products','customers','operations','market','growth','risk'];
const VALID_KINDS = ['risk','opportunity'];
const VALID_LIKELIHOOD = ['Rare','Unlikely','Likely','Almost Certain'];
const VALID_CONSEQUENCE = ['Minor','Moderate','Major','Severe'];
const VALID_EFFORT = ['Quick Win','Modest','Significant','Major'];
const VALID_VALUE_ADD = ['Marginal','Useful','Substantial','Transformational'];
const VALID_SOURCE_LABELS = ['Financial data','Customer data','Operations data','Content Library','Strategic Plan','Web research'];

// Risk matrix per spec §4.1 — Consequence (rows) × Likelihood (columns).
const RISK_MATRIX = {
  'Minor':    { 'Rare': 'Low',    'Unlikely': 'Low',    'Likely': 'Medium', 'Almost Certain': 'Medium' },
  'Moderate': { 'Rare': 'Low',    'Unlikely': 'Medium', 'Likely': 'High',   'Almost Certain': 'High' },
  'Major':    { 'Rare': 'Medium', 'Unlikely': 'High',   'Likely': 'High',   'Almost Certain': 'Extreme' },
  'Severe':   { 'Rare': 'High',   'Unlikely': 'High',   'Likely': 'Extreme','Almost Certain': 'Extreme' }
};

// Opportunity matrix per spec §4.2 — Value (rows) × Effort (columns).
const OPPORTUNITY_MATRIX = {
  'Marginal':         { 'Quick Win': 'Medium',   'Modest': 'Low',      'Significant': 'Low',    'Major': 'Low' },
  'Useful':           { 'Quick Win': 'High',     'Modest': 'Medium',   'Significant': 'Medium', 'Major': 'Low' },
  'Substantial':      { 'Quick Win': 'Priority', 'Modest': 'High',     'Significant': 'High',   'Major': 'Medium' },
  'Transformational': { 'Quick Win': 'Priority', 'Modest': 'Priority', 'Significant': 'High',   'Major': 'High' }
};

function computeRating(finding) {
  if (!finding) return null;
  if (finding.kind === 'risk') {
    var row = RISK_MATRIX[finding.consequence];
    return row ? (row[finding.likelihood] || null) : null;
  }
  if (finding.kind === 'opportunity') {
    var row2 = OPPORTUNITY_MATRIX[finding.value_add];
    return row2 ? (row2[finding.effort] || null) : null;
  }
  return null;
}

// Map the new finding shape down to the legacy severity used by the
// current bi.html / bi-logic.js routing (red/amber → Risks column,
// green → Opportunities column). Phase 3B will remove this once the
// dashboard reads `kind` directly. Until then, severity is computed
// from kind + rating so the live UI keeps working unchanged.
function mapToSeverity(finding) {
  if (finding.kind === 'opportunity') return 'green';
  var rating = computeRating(finding);
  return (rating === 'Extreme' || rating === 'High') ? 'red' : 'amber';
}

function ratingToScore(rating) {
  var map = { 'Extreme': 10, 'Priority': 10, 'High': 8, 'Medium': 5, 'Low': 3 };
  return map[rating] || 5;
}

// Validation layer per spec §6.2. Each finding is checked against the
// rule set; failures are logged in the platform format and collected
// into `rejected` with a reason. The caller decides whether to abort
// (entire batch failed) or proceed with whatever survived.
function validateFindings(findings, allowedUrls) {
  var valid = [];
  var rejected = [];

  function reject(finding, reason) {
    var headline = (finding && typeof finding.headline === 'string') ? finding.headline : '(no headline)';
    console.error('[BI] Finding rejected — reason: ' + reason + ', headline: ' + headline);
    rejected.push({ reason: reason, headline: headline, finding: finding || null });
  }

  for (var i = 0; i < findings.length; i++) {
    var f = findings[i];
    if (!f || typeof f !== 'object') { reject(f, 'Finding is not an object'); continue; }
    if (VALID_KINDS.indexOf(f.kind) === -1) { reject(f, 'Invalid kind: ' + f.kind); continue; }
    if (VALID_CATEGORIES.indexOf(f.category) === -1) { reject(f, 'Invalid category: ' + f.category); continue; }
    if (!f.headline || typeof f.headline !== 'string') { reject(f, 'Missing headline'); continue; }
    if (!f.detail || typeof f.detail !== 'string') { reject(f, 'Missing detail'); continue; }
    if (!f.suggestion || typeof f.suggestion !== 'string') { reject(f, 'Missing suggestion'); continue; }
    if (!Array.isArray(f.sources) || f.sources.length < 1) { reject(f, 'Missing sources (need at least 1)'); continue; }
    if (f.sources.length > 3) { reject(f, 'Too many sources (max 3)'); continue; }

    var sourceFail = null;
    for (var j = 0; j < f.sources.length; j++) {
      var s = f.sources[j];
      if (!s || !s.label) { sourceFail = 'Source missing label'; break; }
      if (VALID_SOURCE_LABELS.indexOf(s.label) === -1) { sourceFail = 'Invalid source label: ' + s.label; break; }
      if (!s.detail || typeof s.detail !== 'string') { sourceFail = 'Source missing detail'; break; }
      if (s.label === 'Web research') {
        if (!s.url) { sourceFail = 'Web research source missing url'; break; }
        if (!allowedUrls.has(s.url)) { sourceFail = 'Fabricated url not in Serper results: ' + s.url; break; }
      }
    }
    if (sourceFail) { reject(f, sourceFail); continue; }

    if (f.kind === 'risk') {
      if (VALID_LIKELIHOOD.indexOf(f.likelihood) === -1) { reject(f, 'Invalid likelihood: ' + f.likelihood); continue; }
      if (VALID_CONSEQUENCE.indexOf(f.consequence) === -1) { reject(f, 'Invalid consequence: ' + f.consequence); continue; }
      if (!f.likelihood_reasoning || typeof f.likelihood_reasoning !== 'string') { reject(f, 'Missing likelihood_reasoning'); continue; }
      if (!f.consequence_reasoning || typeof f.consequence_reasoning !== 'string') { reject(f, 'Missing consequence_reasoning'); continue; }
    } else {
      if (VALID_EFFORT.indexOf(f.effort) === -1) { reject(f, 'Invalid effort: ' + f.effort); continue; }
      if (VALID_VALUE_ADD.indexOf(f.value_add) === -1) { reject(f, 'Invalid value_add: ' + f.value_add); continue; }
      if (!f.effort_reasoning || typeof f.effort_reasoning !== 'string') { reject(f, 'Missing effort_reasoning'); continue; }
      if (!f.value_reasoning || typeof f.value_reasoning !== 'string') { reject(f, 'Missing value_reasoning'); continue; }
    }

    valid.push(f);
  }

  return { valid: valid, rejected: rejected };
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
  // Dry-run mode (spec §3A) — runs Step 1 (generation + validation)
  // and returns the validated + rejected findings plus the Serper
  // metadata, without writing to bi_insights or any other table. Lets
  // the owner inspect the new prompt's output before Phase 3B wires up
  // the live concept-matching path.
  const dryRun = req.query && (req.query.dry === 'true' || req.query.dry === '1');

  // Cost cap: serve cached insights if any are still inside their 24h
  // window, unless the caller explicitly asked for a fresh regeneration.
  // Dry-run always bypasses the cache — the whole point is to inspect
  // a fresh Step 1 run.
  if (!forceRefresh && !dryRun) {
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
    var researchBundle = parallel[6] || { items: [], queries: [] };
    var research = researchBundle.items || [];
    var serperRuns = researchBundle.queries || [];

    // Set of URLs that actually appeared in Serper results — used by
    // the validation layer (spec §6.2) to reject any "Web research"
    // citation whose URL the model invented.
    var allowedSerperUrls = new Set();
    research.forEach(function(r) { if (r && r.link) allowedSerperUrls.add(r.link); });

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

    // Unified 7-category structure shared with SP wizard, SP plan
    // presentation, and OT — see SP/OT Rebuild Spec §4. Older
    // categories ('strategic', 'general') have been retired.
    var categoryGuide = (
      'CATEGORY (pick exactly one per insight):\n' +
      '- "financial" — cash, profit, revenue, costs, pricing\n' +
      '- "products" — what the business sells, service delivery, quality\n' +
      '- "customers" — relationships, concentration, payment terms, supplier dependencies\n' +
      '- "operations" — how the business delivers, systems, staff, processes, compliance\n' +
      '- "market" — external environment, competitors, positioning\n' +
      '- "growth" — expansion, new markets, acquisitions, strategic shifts\n' +
      '- "risk" — threats, mitigation, business continuity\n' +
      'The legacy "strategic" and "general" categories are no longer valid. Anything that previously read as "strategic" should be classified as "growth" (forward-looking opportunity) or "risk" (defensive/continuity) depending on framing.\n\n'
    );

    // Tactical vs strategic classification — drives SP/OT spec §7.2:
    // Add to Plan creates a single Operational Task immediately for
    // tactical items, but queues strategic items as suggestions for
    // the next plan update. Claude makes the call per-insight from
    // scope and effort.
    var classificationGuide = (
      'CLASSIFICATION (per insight):\n' +
      'Mark each insight as either "tactical" or "strategic" via is_tactical:\n' +
      '- is_tactical: true — actionable now, finite scope, fits as a single Operational Task. Examples: "Call overdue customers about $X in receivables", "Renew expiring liability insurance", "Switch from supplier A to supplier B for materials". The owner can complete it in days or weeks without rewriting their plan.\n' +
      '- is_tactical: false — strategic. Requires planning, broader scope, would generate multiple tasks or a new strategic Goal. Examples: "Develop government tendering capability", "Expand into the Hunter region", "Acquire a competitor", "Pivot to subscription pricing model". The owner needs to decide direction first, then build out an execution plan.\n' +
      'Include a classification_reason — one short sentence explaining why this insight is tactical or strategic. Helps the owner understand the routing.\n\n'
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
      'Identify Risks and Opportunities that matter to THIS business specifically. Each finding must articulate a risk or opportunity statement, not a data observation. Do not simply restate the numbers — interpret what they mean for the owner\'s situation and what action they should consider.\n\n' +
      'Bad headline: "Cash balance is $12k". Good headline: "Cash flow continuity risk — reserve covers under one month of operating costs".\n\n' +
      'Quality bar — examples of the calibre of finding expected:\n' +
      '- Noticing that a key supplier mentioned in their documents has been in the news for financial trouble, creating supply chain risk\n' +
      '- Identifying that customer concentration combined with overdue receivables from their largest client creates existential cash flow risk\n' +
      '- Spotting that industry news about new compliance requirements will affect their business within a specific timeframe\n' +
      '- Recognising that their geographic footprint and service mix positions them well to expand into an adjacent market showing growth\n' +
      '- Connecting their strong profit margins with acquisition opportunities in their region\n\n' +
      'These are examples of strategic thinking, not a checklist. Surface any finding at this level that the data supports. Cross-reference multiple sources where possible.\n\n' +
      'CONSOLIDATION (important):\n' +
      'A finding represents a concept, not a data point. Group related evidence into a single conceptual finding rather than emitting one finding per data point. For example, "overdue receivables of $X" + "low cash balance of $Y" + "recent late payment from top customer" combine into a SINGLE Cash Flow Continuity risk citing all three pieces of evidence — not three separate findings.\n\n' +
      'KIND (each finding is exactly one):\n' +
      '- "risk" — a downside concept the owner needs to defend against\n' +
      '- "opportunity" — an upside concept the owner could capture\n' +
      'Watching-brief items are still risks; rate them with lower Likelihood or Consequence so they sit at the bottom of the priority list, but they remain risks. Do not classify a positive item as a risk to be safe.\n\n' +
      'DUAL-ASPECT RULE:\n' +
      'When a single situation has both a downside and an upside (for example, customer concentration creates cash flow risk AND signals deep relationships you could expand), generate TWO separate findings:\n' +
      '- one with kind = "risk" describing what could go wrong and how to mitigate\n' +
      '- one with kind = "opportunity" describing what could be captured\n' +
      'The two findings must have different headlines, different details, and different suggestions. They are not linked or paired — each stands alone as its own concept. Do not collapse a dual-aspect situation into one finding.\n\n' +
      'Output must include both Risks AND Opportunities. If the data only shows problems, look harder for opportunities. If only positives, look harder for risks. A balanced view is essential.\n\n' +
      'MATRIX DIMENSIONS (each finding rates two axes):\n' +
      'For risks (kind = "risk"):\n' +
      '- "likelihood" — how likely is this to happen? Pick exactly one of: "Rare", "Unlikely", "Likely", "Almost Certain".\n' +
      '- "consequence" — if it happened, how serious would the impact be? Pick exactly one of: "Minor", "Moderate", "Major", "Severe".\n' +
      'For opportunities (kind = "opportunity"):\n' +
      '- "effort" — how much effort to capture this? Pick exactly one of: "Quick Win", "Modest", "Significant", "Major".\n' +
      '- "value_add" — how much value would capture deliver? Pick exactly one of: "Marginal", "Useful", "Substantial", "Transformational".\n' +
      'For each dimension, include a one-sentence reasoning string explaining your call:\n' +
      '- risks need both "likelihood_reasoning" and "consequence_reasoning"\n' +
      '- opportunities need both "effort_reasoning" and "value_reasoning"\n' +
      'Reasoning must reference specific evidence from the input where possible. Generic justifications such as "this is moderately likely" are not acceptable.\n\n' +
      'SOURCE ATTRIBUTION:\n' +
      'For every finding, populate a "sources" array of 1-3 items naming the inputs you actually relied on. Use these labels exactly:\n' +
      '- "Financial data" — the financial summary block above\n' +
      '- "Customer data" — the customer summary block above\n' +
      '- "Operations data" — the operations summary block above\n' +
      '- "Content Library" — an item from the BI-tagged Content Library list\n' +
      '- "Strategic Plan" — the current strategic plan\n' +
      '- "Web research" — a result from the external research list (URL is mandatory and must be one of the URLs that appeared in the research list above)\n' +
      'Each source must include a brief "detail" field showing the specific evidence used (e.g. "cash $12k, overdue receivables $8k" or "ATO GST changes from July 2026").\n' +
      'Do not invent or guess URLs. Web research URLs must be copied verbatim from the research list above. Any URL not in that list will be rejected by validation and the entire finding will be dropped.\n\n' +
      'SOURCE QUALITY:\n' +
      'Prefer high-trust sources for evidence:\n' +
      '- Government and regulatory sources (.gov.au, ATO, ASIC, Fair Work, state revenue offices)\n' +
      '- Established Australian news outlets (AFR, ABC News, SMH, The Australian, industry trade publications)\n' +
      '- Industry associations and professional bodies\n' +
      'Lower-trust sources (unknown blogs, content farms, listicles) may be supporting context but should not be the primary evidence for high-stakes claims. For high-stakes claims (compliance changes, regulatory deadlines, financial threats), require either one government source or two established sources. For lower-stakes claims (market trends, opportunities), one source is sufficient.\n\n' +
      categoryGuide +
      classificationGuide +
      'OUTPUT FORMAT — CRITICAL, READ CAREFULLY:\n' +
      'Your entire response must be a single JSON array and NOTHING ELSE.\n' +
      '- The very first character of your response MUST be "[".\n' +
      '- The very last character of your response MUST be "]".\n' +
      '- Do NOT wrap the response in markdown code fences (no ```json, no ```, no triple backticks of any kind).\n' +
      '- Do NOT include any preamble, explanation, header, or commentary before the array.\n' +
      '- Do NOT include any text after the closing bracket.\n' +
      '- Do NOT use single quotes — JSON requires double quotes for all keys and string values.\n\n' +
      'Generate as many findings as the data and research support, applying a quality threshold. There is no maximum. Aim for at least 4 risks and at least 4 opportunities if the data supports a balanced view.\n\n' +
      'Each finding object — RISKS:\n' +
      '{\n' +
      '  "kind": "risk",\n' +
      '  "category": "financial" | "products" | "customers" | "operations" | "market" | "growth" | "risk",\n' +
      '  "icon": "<single emoji>",\n' +
      '  "headline": "<short headline, 8-12 words, articulating the risk — not a data observation>",\n' +
      '  "detail": "<2-3 sentences explaining why this matters to THIS business, citing specific numbers or evidence from the input>",\n' +
      '  "suggestion": "<concrete next step the owner should consider>",\n' +
      '  "is_tactical": <boolean — true if a single Operational Task can resolve it, false if it needs strategic planning>,\n' +
      '  "classification_reason": "<one short sentence — why tactical or strategic>",\n' +
      '  "likelihood": "Rare" | "Unlikely" | "Likely" | "Almost Certain",\n' +
      '  "consequence": "Minor" | "Moderate" | "Major" | "Severe",\n' +
      '  "likelihood_reasoning": "<one sentence — why that Likelihood level, citing evidence>",\n' +
      '  "consequence_reasoning": "<one sentence — why that Consequence level, citing evidence>",\n' +
      '  "sources": [\n' +
      '    { "label": "<one of the source labels above>", "detail": "<specific evidence>", "url": "<required for Web research, omit otherwise>" }\n' +
      '  ]\n' +
      '}\n\n' +
      'Each finding object — OPPORTUNITIES:\n' +
      '{\n' +
      '  "kind": "opportunity",\n' +
      '  "category": "financial" | "products" | "customers" | "operations" | "market" | "growth" | "risk",\n' +
      '  "icon": "<single emoji>",\n' +
      '  "headline": "<short headline, 8-12 words, articulating the opportunity>",\n' +
      '  "detail": "<2-3 sentences>",\n' +
      '  "suggestion": "<concrete next step>",\n' +
      '  "is_tactical": <boolean>,\n' +
      '  "classification_reason": "<short sentence>",\n' +
      '  "effort": "Quick Win" | "Modest" | "Significant" | "Major",\n' +
      '  "value_add": "Marginal" | "Useful" | "Substantial" | "Transformational",\n' +
      '  "effort_reasoning": "<one sentence — why that Effort level, citing evidence>",\n' +
      '  "value_reasoning": "<one sentence — why that Value level, citing evidence>",\n' +
      '  "sources": [\n' +
      '    { "label": "<one of the source labels above>", "detail": "<specific evidence>", "url": "<required for Web research, omit otherwise>" }\n' +
      '  ]\n' +
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
        max_tokens: 12000,
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
    var findings;
    try {
      var clean = raw.trim();
      // Defensive: strip ```json ... ``` (or plain ``` ... ```) wrappers if the
      // model returned them despite the prompt instructions. Handles fences at
      // either end independently so a stray opening fence without a matching
      // closer (e.g. truncated output) is still removed.
      clean = clean.replace(/^```(?:json|JSON)?\s*\n?/, '');
      clean = clean.replace(/\n?\s*```\s*$/, '');
      // Last-resort extraction: if there's still preamble or trailing text,
      // slice from the first '[' to the last ']' so JSON.parse sees just
      // the array.
      if (clean.charAt(0) !== '[') {
        var firstBracket = clean.indexOf('[');
        var lastBracket = clean.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          clean = clean.substring(firstBracket, lastBracket + 1);
        }
      }
      findings = JSON.parse(clean);
    } catch (e) {
      console.error('[bi-insights] JSON parse error:', e.message, 'raw:', raw.substring(0, 500));
      return res.status(500).json({ error: 'Could not parse AI response. Please try again.' });
    }
    if (!Array.isArray(findings)) findings = [];

    // Validation layer (spec §6.2). Each finding is checked against
    // the rule set before it's allowed near the database. Failures
    // are logged in the platform format and collected separately so
    // the dry-run response can show the owner what passed and what
    // didn't.
    var validation = validateFindings(findings, allowedSerperUrls);
    var validFindings = validation.valid;
    var rejectedFindings = validation.rejected;

    // Enrich each valid finding with the computed matrix rating and
    // the legacy severity (red/amber/green) used by the current BI
    // dashboard routing. Phase 3B will write these to the new
    // bi_insights columns; Phase 3A only surfaces them in dry-run
    // output and uses severity to keep the live UI working.
    var enrichedFindings = validFindings.map(function(f) {
      var rating = computeRating(f);
      return Object.assign({}, f, {
        rating: rating,
        severity: mapToSeverity(f)
      });
    });

    // Whole-batch failure (spec §6.5) — if zero findings survived
    // validation, the generation is treated as a failure. Dry-run
    // still returns 200 with the rejected list so the owner can see
    // what went wrong; live mode returns an error and leaves any
    // existing rows untouched.
    if (enrichedFindings.length === 0) {
      console.error('[BI] Generation failed — all ' + findings.length + ' findings rejected by validation');
      if (dryRun) {
        return res.status(200).json({
          success: true,
          dry: true,
          valid_findings: [],
          rejected_findings: rejectedFindings,
          serper_runs: serperRuns,
          message: 'All findings failed validation — see rejected_findings for reasons.'
        });
      }
      return res.status(500).json({ error: 'AI analysis produced no usable findings. Please try Refresh Data again.' });
    }

    // Dry-run short-circuit (spec §3A). No database writes, no state
    // changes — just hand back the validated findings, the rejected
    // findings with reasons, and the Serper run metadata so the
    // owner can audit what evidence reached the prompt.
    if (dryRun) {
      return res.status(200).json({
        success: true,
        dry: true,
        valid_findings: enrichedFindings,
        rejected_findings: rejectedFindings,
        serper_runs: serperRuns,
        generated: enrichedFindings.length,
        rejected_count: rejectedFindings.length
      });
    }

    var now = new Date().toISOString();
    var expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Wipe the user's existing non-dismissed insights before inserting
    // the freshly generated set, BUT preserve any row the owner has
    // already triaged in the SP wizard / Review BI modal. A non-null
    // sp_queue_action means the owner has approved/held/rejected this
    // suggestion and it's queued to influence the next plan. Deleting
    // it here would silently throw away their decision the next time
    // BI runs. (Chunk B will extend this to also preserve archived
    // historical decisions.)
    await supabase.from('bi_insights')
      .delete()
      .eq('user_id', userId)
      .eq('is_dismissed', false)
      .is('sp_queue_action', null);

    // Map each validated finding to the legacy bi_insights row shape.
    // Phase 3A keeps the existing write logic intact — the new
    // dimension fields (kind, likelihood, consequence, effort,
    // value_add, rating, *_reasoning) are NOT written yet; that lands
    // in Phase 3B once the matching pipeline is in place. Severity is
    // derived from kind + rating so the current bi.html / bi-logic.js
    // routing keeps working.
    var rows = enrichedFindings.map(function(f) {
      var insightData = {
        severity: f.severity,
        category: f.category,
        icon: f.icon || '',
        headline: f.headline,
        detail: f.detail,
        suggestion: f.suggestion,
        sources: f.sources,
        classification_reason: f.classification_reason || ''
      };
      return {
        user_id: userId,
        module: 'alerts',
        insight_type: 'alert',
        insight_data: insightData,
        relevance_score: ratingToScore(f.rating),
        is_tactical: !!f.is_tactical,
        added_to_sp: false,
        added_to_sp_at: null,
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
