// api/bi-insights.js — BI Dashboard main AI analysis endpoint
//
// Generates Risks & Opportunities by combining:
//  - Internal data (Xero/MYOB financial + customer summaries, ServiceM8 ops)
//  - Content Library items tagged for BI (tool_tags contains 'bi')
//  - The current Strategic Plan (interview_data)
//  - Curated external research from the Shared Research Layer
//    (shared_research rows tagged is_current = true)
//
// Phase 6 of the Shared Research Layer build (StaxAI-Shared-Research-
// Layer-Spec-v1_0 §13.2 + §18.6) replaces the legacy in-handler
// Serper research path with a call to api/shared-research-refresh
// followed by a read from the shared_research table. The Sonnet
// analysis prompt now consumes lens-tagged, category-grouped curated
// evidence with rendered URLs and source_type metadata.
//
// The bi_insights cache continues to live in the bi_insights table.
// The cache-decision rule moved from "is the cache younger than 24h?"
// to "is the cached analysis at least as new as the latest shared
// research?" — per the Phase 6 brief, the bi_insights cache is now an
// inputs-unchanged optimisation, not a 24-hour gate.

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { logAnthropicUsage } from '../lib/usage-logger.js';
import { normaliseUrlForMatch } from '../lib/shared-research.js';
import sharedResearchRefreshHandler from './shared-research-refresh.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ─────────────────────────────────────────────────────────────────────
// Shared Research Layer evidence rendering
// ─────────────────────────────────────────────────────────────────────

// Lens key → human-readable label for the Sonnet prompt. The stored
// lens values are tokens (national-smes, region-industry, etc.) — the
// prompt needs them in natural language so the AI weighs geographic +
// industry scope correctly.
const LENS_LABELS = {
  'national-smes': 'national (all SMEs)',
  'national-industry': 'national (industry-specific)',
  'state-smes': 'state (all SMEs)',
  'state-industry': 'state (industry-specific)',
  'region-smes': 'region (all SMEs)',
  'region-industry': 'region (industry-specific)'
};

// One block per Shared Research Layer source category. The `label`
// values are the source-attribution labels Sonnet must use in the
// `sources` array on each finding — they extend the previous single
// "Web research" label into five category-specific buckets.
const SRL_CATEGORY_SECTIONS = [
  { key: 'regulatory',    heading: 'REGULATORY & COMPLIANCE', label: 'Web research — Regulatory' },
  { key: 'industry-news', heading: 'INDUSTRY NEWS',           label: 'Web research — Industry News' },
  { key: 'suppliers',     heading: 'SUPPLIER & MATERIALS',    label: 'Web research — Suppliers' },
  { key: 'economic',      heading: 'ECONOMIC & MARKET',       label: 'Web research — Economic' },
  { key: 'technology',    heading: 'TECHNOLOGY & INNOVATION', label: 'Web research — Technology' }
];

// Set of the five category-specific Web research labels. Used by the
// validator to recognise web-evidence sources for the URL fab-check —
// any source whose label is in this set must include a URL that appears
// in the allow-set built from shared_research items.
const WEB_RESEARCH_LABELS = new Set(SRL_CATEGORY_SECTIONS.map(function(s) { return s.label; }));

function renderLens(lensArr) {
  if (!Array.isArray(lensArr) || lensArr.length === 0) return '(no lens)';
  return lensArr.map(function(l) { return LENS_LABELS[l] || l; }).join(', ');
}

// Build the EXTERNAL RESEARCH block for the Sonnet prompt. Items are
// grouped by SRL category in the fixed §4 order, then rendered as
// per-item blocks carrying title, source name + source_type, published
// date if present, the lens(es) the item surfaced from, the curated
// summary, and the URL verbatim. The URL is in the block specifically
// so Sonnet can copy it verbatim into the `sources` array — the legacy
// prompt told Sonnet to copy URLs that weren't actually rendered into
// the input (Pass 1 finding 8).
function renderEvidenceBlock(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'EXTERNAL RESEARCH\n(No curated research items available for this user. Findings should rely on internal data, Content Library, and Strategic Plan context.)';
  }
  var byCategory = Object.create(null);
  for (var i = 0; i < SRL_CATEGORY_SECTIONS.length; i++) {
    byCategory[SRL_CATEGORY_SECTIONS[i].key] = [];
  }
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    if (it && it.category && byCategory[it.category]) byCategory[it.category].push(it);
  }
  var lines = ['EXTERNAL RESEARCH (Shared Research Layer — curated, lens-tagged)'];
  lines.push('Each item is tagged with lens(es) describing the geographic + industry scope it surfaced from, and a source_type: primary (government/regulator), association (industry body), or secondary (trade press, general media, bank economics teams).');
  for (var k = 0; k < SRL_CATEGORY_SECTIONS.length; k++) {
    var section = SRL_CATEGORY_SECTIONS[k];
    var sectionItems = byCategory[section.key];
    if (!sectionItems || sectionItems.length === 0) continue;
    lines.push('');
    lines.push(section.heading);
    for (var n = 0; n < sectionItems.length; n++) {
      var item = sectionItems[n];
      lines.push('[' + section.key + '-' + (n + 1) + ']');
      lines.push('  Title: ' + (item.title || ''));
      var srcLine = '  Source: ' + (item.source_name || '(unknown)');
      if (item.source_type) srcLine += ' [' + item.source_type + ']';
      lines.push(srcLine);
      if (item.published_date) lines.push('  Published: ' + item.published_date);
      lines.push('  Lens: ' + renderLens(item.lens));
      lines.push('  Summary: ' + (item.summary || ''));
      lines.push('  URL: ' + (item.url || ''));
    }
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Shared Research Layer trigger + read
// ─────────────────────────────────────────────────────────────────────

// Trigger a shared research refresh via module-import alt-auth.
// Mirrors api/news-digest-worker.js — builds a mock req/res pair that
// puts the SRL handler on its x-cron-secret path with the BI user's
// id in the body and triggered_by_tool = 'bi' for the audit trail.
// SRL handles its own 24-hour cache internally; we just need to make
// sure SRL has had a chance to update shared_research before we read
// it for this analysis.
async function callSharedResearch(userId) {
  if (!process.env.CRON_SECRET) {
    console.error('[bi-insights] SRL trigger skipped — CRON_SECRET not configured');
    return { statusCode: 0, data: { error: 'CRON_SECRET not configured' } };
  }
  const mockReq = {
    method: 'POST',
    query: {},
    headers: {
      'content-type': 'application/json',
      'x-cron-secret': process.env.CRON_SECRET
    },
    body: { userId: userId, triggered_by_tool: 'bi' }
  };
  var statusCode = 200;
  var resolved = false;
  var resolveFn;
  const promise = new Promise(function(r) { resolveFn = r; });
  const mockRes = {
    status: function(c) { statusCode = c; return mockRes; },
    json: function(data) {
      if (resolved) return;
      resolved = true;
      resolveFn({ statusCode: statusCode, data: data });
    }
  };
  try {
    sharedResearchRefreshHandler(mockReq, mockRes).catch(function(err) {
      if (!resolved) {
        resolved = true;
        resolveFn({ statusCode: 500, data: { error: (err && err.message) || 'SRL handler threw' } });
      }
    });
  } catch (e) {
    if (!resolved) {
      resolved = true;
      resolveFn({ statusCode: 500, data: { error: (e && e.message) || 'SRL invocation failed' } });
    }
  }
  return promise;
}

// Read the user's current curated research from shared_research.
// Returns the rows (already filtered to is_current = true) and the
// latest created_at across them — the latter is the comparator the
// bi_insights cache decision uses to detect "research is newer than
// the cached analysis".
async function fetchCurrentSharedResearch(supabase, userId) {
  try {
    var resp = await supabase
      .from('shared_research')
      .select('title, summary, url, source_name, source_domain, source_type, lens, category, published_date, created_at')
      .eq('user_id', userId)
      .eq('is_current', true)
      .order('created_at', { ascending: false });
    if (resp.error) {
      console.error('[bi-insights] shared_research read error:', resp.error.message);
      return { items: [], latest_created_at: null };
    }
    var rows = resp.data || [];
    var latest = rows.length > 0 ? rows[0].created_at : null;
    return { items: rows, latest_created_at: latest };
  } catch (e) {
    console.error('[bi-insights] shared_research read exception:', e && e.message);
    return { items: [], latest_created_at: null };
  }
}

// Build the URL allow-set the validator uses to reject fabricated web
// citations. URLs are normalised via the SRL helper so trivial cosmetic
// differences (trailing slash, http vs https, www, tracking params,
// fragments) between Sonnet's output and the stored shared_research
// URL don't false-positive as fabrication — Pass 1 finding 4.
function buildAllowedUrlSet(items) {
  var set = new Set();
  for (var i = 0; i < items.length; i++) {
    var u = items[i] && items[i].url;
    if (!u) continue;
    var norm = normaliseUrlForMatch(u);
    if (norm) set.add(norm);
  }
  return set;
}

// Count items per category — used in the dry-run response to show the
// owner what evidence reached Sonnet, broken down the same way the
// prompt's evidence block is.
function itemsByCategoryCounts(items) {
  var counts = {};
  for (var i = 0; i < SRL_CATEGORY_SECTIONS.length; i++) {
    counts[SRL_CATEGORY_SECTIONS[i].key] = 0;
  }
  for (var j = 0; j < items.length; j++) {
    var c = items[j] && items[j].category;
    if (c && counts.hasOwnProperty(c)) counts[c]++;
  }
  return counts;
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

// Phase 6: the single 'Web research' label is replaced by five
// category-specific labels matching the SRL source categories. Any
// label in WEB_RESEARCH_LABELS triggers the URL fab-check.
const VALID_SOURCE_LABELS = [
  'Financial data',
  'Customer data',
  'Operations data',
  'Content Library',
  'Strategic Plan',
  'Web research — Regulatory',
  'Web research — Industry News',
  'Web research — Suppliers',
  'Web research — Economic',
  'Web research — Technology'
];

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
//
// Phase 6 changes:
//   - Source labels: the single 'Web research' is replaced by the
//     five category-specific labels in WEB_RESEARCH_LABELS.
//   - URL check: the allow-set is keyed on normalised URLs (via
//     normaliseUrlForMatch) so cosmetic differences between Sonnet's
//     output and shared_research.url don't false-positive.
function validateFindings(findings, allowedNormalisedUrls) {
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
      if (WEB_RESEARCH_LABELS.has(s.label)) {
        if (!s.url) { sourceFail = 'Web research source missing url'; break; }
        var norm = normaliseUrlForMatch(s.url);
        if (!norm || !allowedNormalisedUrls.has(norm)) {
          sourceFail = 'Fabricated url not in shared_research items: ' + s.url;
          break;
        }
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
  // and returns the validated + rejected findings plus SRL audit
  // metadata, without writing to bi_insights or any other BI table.
  // SRL still runs (so the owner can see what evidence reached the
  // prompt) and SRL still writes shared_research per its own rules —
  // that's the Shared Research Layer's own behaviour, not BI's.
  const dryRun = req.query && (req.query.dry === 'true' || req.query.dry === '1');

  // Phase 6 flow — SRL first, then cache check.
  //   1. Trigger SRL (so the user's shared research has the most
  //      recent refresh attempt before we make any cache decision).
  //   2. Read shared_research is_current = true for this user. This
  //      is the canonical view of what's available; we use the
  //      timestamp on the freshest row as the inputs-unchanged
  //      comparator below.
  //   3. If not forceRefresh and not dryRun: compare against the
  //      cached bi_insights.generated_at. Cached analysis at least
  //      as new as the latest research → serve cached.
  //   4. Otherwise: build the evidence block, fetch the rest of
  //      the BI inputs, run Sonnet, validate, write.
  var srlResult = await callSharedResearch(userId);
  if (srlResult && srlResult.data && srlResult.data.error) {
    console.error('[bi-insights] SRL trigger reported error:', srlResult.data.error);
  }
  var sharedResearch = await fetchCurrentSharedResearch(supabase, userId);
  var researchItems = sharedResearch.items;
  var researchLatestAt = sharedResearch.latest_created_at;

  if (!forceRefresh && !dryRun) {
    var cachedRes = await supabase
      .from('bi_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('is_dismissed', false)
      .order('generated_at', { ascending: false });
    if (!cachedRes.error && cachedRes.data && cachedRes.data.length > 0) {
      var cachedRows = cachedRes.data;
      var cacheGeneratedAt = cachedRows[0].generated_at;
      // The cache is valid when either there is no shared research
      // yet for this user (nothing to compare against) or the cached
      // analysis is at least as new as the latest research row. The
      // 24-hour expires_at column is no longer part of the cache
      // decision — Phase 6 brief is explicit on that.
      var cacheIsValid = !researchLatestAt
        || (cacheGeneratedAt && cacheGeneratedAt >= researchLatestAt);
      if (cacheIsValid) {
        // Order by relevance_score for the response, matching the
        // pre-Phase-6 behaviour the dashboard already expects.
        cachedRows.sort(function(a, b) {
          return (b.relevance_score || 0) - (a.relevance_score || 0);
        });
        return res.status(200).json({ success: true, data: cachedRows, cached: true, generated: 0 });
      }
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
      var r = await fetch('https://staxai.com.au/api/' + endpoint, {
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
      loadSPContext(supabase, userId)
    ]);
    var financial = parallel[0];
    var customers = parallel[1];
    var operations = parallel[2];
    var projects = parallel[3];
    var clItems = parallel[4] || [];
    var spContext = parallel[5];

    // Allow-set for the validator's fabricated-URL check. Built from
    // every shared_research item's url, normalised via the SRL helper
    // so http/https, www/no-www, trailing slashes, tracking params,
    // and fragments don't false-positive as fabrication.
    var allowedNormalisedUrls = buildAllowedUrlSet(researchItems);

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

    var evidenceBlock = renderEvidenceBlock(researchItems);
    contextParts.push('\n' + evidenceBlock);

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
      '- is_tactical: false — strategic. Requires planning, broader scope, would generate multiple tasks or a new strategic Goal. Examples: "Develop government tendering capability", "Expand into the Hunter region", "Pivot to subscription pricing model". The owner needs to decide direction first, then build out an execution plan.\n' +
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
      '- Curated external research from the Shared Research Layer, grouped by source category (Regulatory & Compliance, Industry News, Supplier & Materials, Economic & Market, Technology & Innovation) and tagged with lens metadata + source_type\n\n' +
      'INPUT:\n\n' +
      contextParts.join('\n') + '\n\n' +
      'TASK:\n' +
      'Identify Risks and Opportunities that matter to THIS business specifically. Each finding must articulate a risk or opportunity statement, not a data observation. Do not simply restate the numbers — interpret what they mean for the owner\'s situation and what action they should consider.\n\n' +
      'Bad headline: "Cash balance is $12k". Good headline: "Cash flow continuity risk — reserve covers under one month of operating costs".\n\n' +
      'Quality bar — examples of the calibre of finding expected:\n' +
      '- Noticing that a key supplier mentioned in their documents has been in the news for financial trouble, creating supply chain risk\n' +
      '- Identifying that customer concentration combined with overdue receivables from their largest client creates existential cash flow risk\n' +
      '- Spotting that industry news about new compliance requirements will affect their business within a specific timeframe\n' +
      '- Recognising that their geographic footprint and service mix positions them well to expand into an adjacent market showing growth\n\n' +
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
      'USING THE EXTERNAL RESEARCH:\n' +
      'Each item in the EXTERNAL RESEARCH block carries lens metadata describing the geographic + industry scope it surfaced from — for example, "state (industry-specific)" means the item is about this business\'s industry within their state. Weigh lens scope when assessing relevance: an item from "region (industry-specific)" is directly local; one from "national (all SMEs)" applies broadly. Cite items by URL exactly as rendered.\n\n' +
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
      '- "Web research — Regulatory" — an item from the REGULATORY & COMPLIANCE section\n' +
      '- "Web research — Industry News" — an item from the INDUSTRY NEWS section\n' +
      '- "Web research — Suppliers" — an item from the SUPPLIER & MATERIALS section\n' +
      '- "Web research — Economic" — an item from the ECONOMIC & MARKET section\n' +
      '- "Web research — Technology" — an item from the TECHNOLOGY & INNOVATION section\n' +
      'Each source must include a brief "detail" field showing the specific evidence used (e.g. "cash $12k, overdue receivables $8k" or "ATO GST changes from July 2026").\n' +
      'For any Web research source, the "url" field is mandatory and must be copied verbatim from the URL line of an item in the EXTERNAL RESEARCH block. Do not invent or paraphrase URLs. Any URL not present in that block will be rejected by validation and the entire finding will be dropped.\n\n' +
      'SOURCE QUALITY:\n' +
      'Every item in the EXTERNAL RESEARCH block carries a source_type tag in square brackets next to the Source line. Weigh items by source_type:\n' +
      '- primary — government bodies, regulators, and official agencies. Highest weight. Required as at least one source for high-stakes regulatory or compliance claims.\n' +
      '- association — industry, peak, or trade associations. Medium weight. Treat as authoritative on industry practice; less authoritative on policy or macroeconomics.\n' +
      '- secondary — trade press, general media, and bank or economics commentary. Useful supporting context. For high-stakes claims, prefer pairing a secondary source with either a primary source or a second corroborating secondary source.\n' +
      'Where the input contains both higher- and lower-weight sources on the same topic, cite the higher-weight item.\n\n' +
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
      '    { "label": "<one of the source labels above>", "detail": "<specific evidence>", "url": "<required for any Web research label, omit otherwise>" }\n' +
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
      '    { "label": "<one of the source labels above>", "detail": "<specific evidence>", "url": "<required for any Web research label, omit otherwise>" }\n' +
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
    // the rule set before it's allowed near the database. The URL
    // allow-set uses normalised matching against shared_research
    // items; the Web research labels are now five category-specific
    // entries (see VALID_SOURCE_LABELS).
    var validation = validateFindings(findings, allowedNormalisedUrls);
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

    var srlSummary = {
      refresh_id: (srlResult && srlResult.data && srlResult.data.refresh_id) || null,
      outcome: (srlResult && srlResult.data && srlResult.data.outcome) || null,
      status_code: srlResult ? srlResult.statusCode : null,
      items_total: researchItems.length,
      items_by_category: itemsByCategoryCounts(researchItems),
      latest_created_at: researchLatestAt
    };

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
          srl: srlSummary,
          evidence_block: evidenceBlock,
          message: 'All findings failed validation — see rejected_findings for reasons.'
        });
      }
      return res.status(500).json({ error: 'AI analysis produced no usable findings. Please try Refresh Data again.' });
    }

    // Dry-run short-circuit (spec §3A). No database writes, no state
    // changes — just hand back the validated findings, the rejected
    // findings with reasons, and the SRL evidence summary so the
    // owner can audit what reached the prompt.
    if (dryRun) {
      return res.status(200).json({
        success: true,
        dry: true,
        valid_findings: enrichedFindings,
        rejected_findings: rejectedFindings,
        srl: srlSummary,
        evidence_block: evidenceBlock,
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
