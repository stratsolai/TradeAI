// lib/shared-research-curation.js — Haiku curation + Section 9.5 validation
//
// One of three sub-modules the Shared Research Layer is split across:
//   - shared-research-plan.js     — matrix, region, plan build
//   - shared-research-cache.js    — cache layer, Serper executor, dedupe
//   - shared-research-curation.js — this file (curation + validation)
// All three are re-exported from lib/shared-research.js so callers
// (currently just api/shared-research-refresh.js) keep working
// unchanged.
//
// Implements Section 9 (curation prompt + per-category parallel
// fan-out from Phase 3.5) and Section 9.5 (validation, URL
// normalisation, source-type soft-fail).

import {
  AUSTRALIAN_STATES,
  normaliseIndustries,
  resolveRegion
} from './shared-research-plan.js';

// ---------------------------------------------------------------------------
// Curation vocabulary + caps
// ---------------------------------------------------------------------------

export const CURATED_CATEGORIES = ['regulatory', 'industry-news', 'suppliers', 'economic', 'technology'];
export const CURATED_LENSES = ['national-smes', 'national-industry', 'state-smes', 'state-industry', 'region-smes', 'region-industry'];
export const SOURCE_TYPES = ['primary', 'secondary', 'association'];
const REQUIRED_CURATED_FIELDS = ['title', 'summary', 'url', 'source_name', 'category', 'lens'];

const VALID_CATEGORY_SET = new Set(CURATED_CATEGORIES);
const VALID_LENS_SET = new Set(CURATED_LENSES);
const VALID_SOURCE_TYPE_SET = new Set(SOURCE_TYPES);

// Cap on items per category in the curated output (Section 9.2). Set
// conservatively — the curation is filtering for substance, not feeding a
// firehose. Downstream consumers (ID tabs, BI Sonnet prompt) work better
// with a tight set of high-quality items.
export const ITEMS_PER_CATEGORY_CAP = 10;

// Per-item snippet truncation when feeding raw items to Haiku. Long
// snippets dominate token usage without adding curation signal — the
// title + first ~280 chars of snippet is enough for Haiku to assess
// relevance and substance.
const SNIPPET_INPUT_TRUNCATE = 280;

// Anthropic API config — mirrors api/news-digest-refresh.js so the call
// shape is consistent with how Haiku is already used on the platform.
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const CURATION_MODEL = 'claude-haiku-4-5-20251001';
const CURATION_MAX_TOKENS = 8000;

// ---------------------------------------------------------------------------
// Curation prompt
// ---------------------------------------------------------------------------
//
// System prompt teaches Haiku the matrix vocabulary, the source-typing
// rules (in line with ID's existing typing — extended to call out
// associations as their own type per Section 15), and the curation rules
// from Section 9.4.

export const CURATION_SYSTEM_PROMPT = [
  'You are a research curator for StaxAI, a platform serving Australian SME businesses.',
  '',
  'Your job is to filter, structure, and clean a set of web search results into a curated research evidence set. This is FILTERING and STRUCTURING only — not analysis, not recommendation, not strategic advice.',
  '',
  'CATEGORY KEYS (use exactly these strings):',
  '- regulatory       — federal/state regulation, ATO, Fair Work, industry licensing, safety standards, compliance deadlines',
  '- industry-news    — industry-specific news, trends, market activity, notable events',
  '- suppliers        — supply chain disruption, materials availability, materials pricing, supplier consolidation, key supplier news',
  '- economic         — macroeconomic conditions, interest rates, inflation, regional economic indicators, market sentiment',
  '- technology       — industry technology trends, software adoption, AI, digital tools, productivity-enhancing innovations',
  '',
  'LENS KEYS (use exactly these strings; the lens array on each output item must be a subset of the lens array of the source input items it came from):',
  '- national-smes',
  '- national-industry',
  '- state-smes',
  '- state-industry',
  '- region-smes',
  '- region-industry',
  '',
  'SOURCE TYPES (pick exactly one per item):',
  '- primary     — government body or regulator (ATO, Fair Work Ombudsman, ASIC, AUSTRAC, state revenue offices, Treasury, Small Business Ombudsman, .gov.au domains)',
  '- association — industry, peak, or trade association (HIA, Master Builders, AILA, Landscape Association, Restaurant & Catering Australia, Master Painters, Master Plumbers, Council of Small Business Organisations, etc.)',
  '- secondary   — trade press, general media, banking and economics press (AFR, ABC, SMH, The Australian, Smart Company, Inside Small Business, bank economic teams)',
  '',
  'CURATION RULES:',
  '1. Deduplicate items that cover the same story from different URLs. Keep the higher-quality URL. Combine the lens arrays of merged items.',
  '2. SUBSTANCE TEST — drop items that do not name the specific regulation, policy, event, fact, supplier, organisation, person, or development they are reporting on. Vague titles that gesture at "changes", "what you need to know", "shake-ups", "major reforms", "key updates", or "trends to watch" without naming the underlying thing must be dropped. The summary you write must contain at least one concrete fact, name, date, figure, or named entity drawn from the title or snippet — if you cannot extract a concrete substantive claim from the title and snippet together, the item is clickbait and must be dropped. This rule subsumes listicles, SEO-driven articles, and content marketing — those forms fail the substance test by construction.',
  '3. Drop items obviously irrelevant to the user\'s business based on the Business Profile context.',
  '4. Where high-quality industry association sources appear in the input, give them appropriate prominence in the output. Soft preference — do not force association content in if it is not substantive.',
  '5. NEVER invent URLs. Every url field must be a URL that appears in the raw input items list. If you cannot identify a URL for a curated item, drop the item.',
  '6. Be factual and neutral. Do not editorialise. Do not recommend. Do not frame as risk or opportunity. Just report what the source says.',
  '7. Cap each category at ' + ITEMS_PER_CATEGORY_CAP + ' items in the output. Choose the most substantive and relevant.',
  '8. Australian English throughout (colour, organisation, recognised, etc.).',
  '',
  'OUTPUT FORMAT:',
  'Return ONLY a JSON object in this exact shape, with no preamble, no markdown fences:',
  '{',
  '  "items": [',
  '    {',
  '      "title": "Headline from the source",',
  '      "summary": "Plain-language one-to-two-sentence factual summary of the item",',
  '      "url": "https://...",',
  '      "source_name": "Publishing organisation name",',
  '      "source_domain": "example.com",',
  '      "source_type": "primary",',
  '      "lens": ["national-smes", "state-smes"],',
  '      "category": "regulatory",',
  '      "published_date": "2026-04-15"',
  '    }',
  '  ]',
  '}',
  '',
  'FIELD RULES:',
  '- title: from the source. Do not embellish.',
  '- summary: one to two sentences, factual and specific. Include numbers, dates, agency names where relevant.',
  '- url: must match exactly a url that appears in the raw input items.',
  '- source_name: the publishing organisation. Inferred from the input source field or the URL domain.',
  '- source_domain: the domain (no protocol, no www).',
  '- source_type: one of primary / association / secondary.',
  '- lens: array of one or more lens keys. Must be a subset of the lenses on the source input items.',
  '- category: one of the 5 category keys above.',
  '- published_date: ISO date string from the input item where available; otherwise null.',
  '',
  'Return ONLY the JSON object. No other text.'
].join('\n');

// ---------------------------------------------------------------------------
// Build the user message for the curation pass
// ---------------------------------------------------------------------------

export function buildCurationUserMessage(profile, dedupedItems) {
  const industries = normaliseIndustries(profile);
  const stateAbbr = (profile && profile.address_state) ? String(profile.address_state).toUpperCase() : null;
  const stateFull = stateAbbr ? AUSTRALIAN_STATES[stateAbbr] : null;
  const region = resolveRegion(profile);
  const businessSize = (profile && profile.employee_range) ? String(profile.employee_range) : null;

  // Compact key names in the items array to keep token usage tight.
  // Haiku knows to map back to the full key names on output via the
  // system prompt's OUTPUT FORMAT section. `c` is the array of source
  // categories the URL surfaced from (a URL can appear in queries from
  // multiple categories — see Phase 3.1 attribution model); Haiku is
  // free to pick the single best category for the output item based on
  // content, drawing from this array as guidance.
  const compact = dedupedItems.map((it, i) => ({
    i,
    t: it.title || '',
    s: (it.snippet || '').slice(0, SNIPPET_INPUT_TRUNCATE),
    u: it.link || '',
    src: it.source || '',
    d: it.date || null,
    c: Array.isArray(it.source_categories) ? it.source_categories : [],
    l: Array.isArray(it.lenses) ? it.lenses : []
  }));

  const profileBlock = [
    'BUSINESS PROFILE',
    'Industries: ' + (industries.length ? industries.join(' | ') : 'unspecified'),
    'State: ' + (stateFull || stateAbbr || 'unspecified'),
    'Region: ' + (region ? region.region_name : 'unspecified'),
    'Business size: ' + (businessSize || 'unspecified')
  ].join('\n');

  const itemsBlock = [
    'RAW WEB RESULTS (compact format — keys: i=index, t=title, s=snippet, u=url, src=source, d=date, c=source_categories array, l=lenses array)',
    JSON.stringify(compact)
  ].join('\n');

  return [
    profileBlock,
    '',
    itemsBlock,
    '',
    'Curate the above list per the rules in the system prompt. Return only the JSON object.'
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Run the Haiku curation pass — per-category parallel fan-out
// ---------------------------------------------------------------------------
//
// Phase 3.5: curation runs as five concurrent Haiku calls, one per
// source category, instead of a single large call. Phase 3.4 timing
// showed the single call taking ~36s end-to-end with 265 items — 70%
// of total pipeline time and the cause of the cache-miss 504s.
// Splitting along the natural category boundary cuts curation
// wall-clock to roughly max(per_category) instead of sum.
//
// Each per-category call receives only the items whose primary
// source_category matches its batch. The system prompt, user-message
// builder, and output format are IDENTICAL across batches — only the
// items differ. Validation happens on the merged result (Section 9.5
// is unchanged).
//
// Return shape:
//   { ok, items, error, usage, per_category }
// where per_category is keyed by category and reports each call's
// duration_ms, ok, error, items_in, items_out, input_tokens,
// output_tokens for handler-level timing instrumentation.
//
// usage is the SUM of input_tokens / output_tokens across all batches,
// so the existing single api_usage write at the caller continues to
// reflect the full Haiku cost of the refresh.
//
// Failure handling: if one batch fails, the others still complete and
// their items are merged. ok = true if any batch returned items or
// if all batches had zero items to curate. ok = false only when every
// batch errored AND no items were merged.

export async function runCuration({ profile, dedupedItems, anthropicKey }) {
  if (!anthropicKey) {
    return { ok: false, items: [], error: 'ANTHROPIC_API_KEY missing', usage: null, per_category: {} };
  }
  if (!Array.isArray(dedupedItems) || dedupedItems.length === 0) {
    return { ok: true, items: [], error: null, usage: null, per_category: {} };
  }

  // Group items by their primary (first) source_category. Items can
  // appear in multiple source_categories, but for batching we route
  // each item to exactly one batch — its primary. Haiku's system
  // prompt still teaches all five categories, so an item routed to
  // the regulatory batch can still be recategorised to e.g.
  // technology on output based on content.
  const itemsByCategory = Object.create(null);
  for (const cat of CURATED_CATEGORIES) itemsByCategory[cat] = [];
  for (const item of dedupedItems) {
    const cats = Array.isArray(item.source_categories) ? item.source_categories : [];
    const primary = cats[0] || null;
    if (primary && itemsByCategory[primary]) itemsByCategory[primary].push(item);
  }

  // Fire all five batches in parallel. Each batch resolves to
  // { category, ok, items, error, usage, items_in, duration_ms }.
  // items_in is captured per-batch and threaded through so the
  // handler's curation_per_category_breakdown can correlate timing
  // with input size and token counts (Phase 3.6 question 2).
  const batchPromises = CURATED_CATEGORIES.map(async (category) => {
    const t0 = Date.now();
    const batchItems = itemsByCategory[category];
    if (!batchItems || batchItems.length === 0) {
      return {
        category,
        ok: true,
        items: [],
        error: null,
        usage: null,
        items_in: 0,
        duration_ms: Date.now() - t0
      };
    }
    const result = await runHaikuCurationCall(profile, batchItems, anthropicKey, category);
    return Object.assign({ category, items_in: batchItems.length }, result, { duration_ms: Date.now() - t0 });
  });

  const batchResults = await Promise.all(batchPromises);

  // Merge items and aggregate usage. Track per-category outcomes for
  // the timing instrumentation the handler surfaces in the response.
  const mergedItems = [];
  const perCategory = {};
  let firstError = null;
  let okBatchCount = 0;
  let aggregateInputTokens = 0;
  let aggregateOutputTokens = 0;
  let anyUsageSeen = false;

  for (const r of batchResults) {
    const inputTokens = (r.usage && r.usage.input_tokens) || 0;
    const outputTokens = (r.usage && r.usage.output_tokens) || 0;
    perCategory[r.category] = {
      ok: r.ok,
      error: r.error,
      duration_ms: r.duration_ms,
      items_in: r.items_in || 0,
      items_out: r.items.length,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      // legacy fields preserved for back-compat — items_returned was the
      // pre-3.6 name for items_out; items_curated was a duplicate.
      items_returned: r.items.length,
      items_curated: r.items.length
    };
    if (r.ok) {
      okBatchCount++;
      for (const it of r.items) mergedItems.push(it);
    } else if (!firstError) {
      firstError = `category ${r.category}: ${r.error}`;
    }
    if (r.usage) {
      anyUsageSeen = true;
      aggregateInputTokens += inputTokens;
      aggregateOutputTokens += outputTokens;
    }
  }

  // ok is true if at least one batch succeeded, OR all batches had
  // zero items to curate (both edge cases are legitimate "nothing
  // went wrong"). ok is false only when every populated batch errored
  // and nothing was merged.
  const ok = okBatchCount === CURATED_CATEGORIES.length || mergedItems.length > 0;

  return {
    ok,
    items: mergedItems,
    error: ok ? null : (firstError || 'all curation batches failed'),
    usage: anyUsageSeen
      ? { input_tokens: aggregateInputTokens, output_tokens: aggregateOutputTokens }
      : null,
    per_category: perCategory
  };
}

// Single-batch Haiku call. The exact same prompt, model, and response
// parsing as the pre-Phase-3.5 single-call runCuration — extracted
// here so the per-category fan-out can reuse it without duplicating
// the Anthropic API plumbing.

async function runHaikuCurationCall(profile, items, anthropicKey, categoryLabel) {
  const userMessage = buildCurationUserMessage(profile, items);

  let resp;
  try {
    resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: CURATION_MODEL,
        max_tokens: CURATION_MAX_TOKENS,
        system: CURATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
  } catch (e) {
    console.error('[SharedResearch] Curation fetch exception —', 'category:', categoryLabel, 'message:', e && e.message);
    return { ok: false, items: [], error: 'fetch exception: ' + (e && e.message), usage: null };
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error('[SharedResearch] Curation non-OK —', 'category:', categoryLabel, 'status:', resp.status, 'body:', errText.slice(0, 300));
    return { ok: false, items: [], error: 'non-OK status: ' + resp.status, usage: null };
  }

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    return { ok: false, items: [], error: 'response parse failed: ' + (e && e.message), usage: null };
  }

  if (data && data.error) {
    console.error('[SharedResearch] Curation API error —', 'category:', categoryLabel, JSON.stringify(data.error));
    return { ok: false, items: [], error: 'api error: ' + (data.error.message || 'unknown'), usage: data.usage || null };
  }

  const raw = (data && data.content && data.content[0] && data.content[0].text) || '';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[SharedResearch] Curation JSON parse failed —', 'category:', categoryLabel, 'message:', e && e.message, 'preview:', cleaned.slice(0, 300));
    return { ok: false, items: [], error: 'json parse failed: ' + (e && e.message), usage: data.usage || null };
  }

  const itemsOut = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  return { ok: true, items: itemsOut, error: null, usage: data.usage || null };
}

// ---------------------------------------------------------------------------
// Validation — Section 9.5
// ---------------------------------------------------------------------------
//
// Walks the Haiku output and applies the four rules from Section 9.5:
//   1. URL must exist in the raw Serper results from this run
//   2. Category must be one of the 5 valid keys
//   3. Every lens must be one of the 6 valid keys
//   4. Required fields (title, summary, url, source_name, category, lens)
//      must be present and non-empty
// Source type is also normalised — invalid source_type rejects the item.
// Each rejection is logged in the platform format and returned with the
// reason + the original item so the dry-run response can surface it.

export function validateCuratedItems(haikuItems, dedupedInputs) {
  // Build the allowed-URL set as a Map keyed on the normalised form so
  // trivial cosmetic differences between Haiku's output and the raw
  // Serper URL (trailing slash, http vs https, www. prefix, tracking
  // query params, fragments) don't false-positive as fabrication. The
  // value is the canonical raw URL so we keep an audit trail back to
  // what Serper actually returned.
  const normalisedToOriginal = new Map();
  for (const it of dedupedInputs || []) {
    if (!it || !it.link) continue;
    const norm = normaliseUrlForMatch(it.link);
    if (norm && !normalisedToOriginal.has(norm)) {
      normalisedToOriginal.set(norm, it.link);
    }
  }

  const accepted = [];
  const rejected = [];

  for (const item of haikuItems || []) {
    const result = checkValidation(item, normalisedToOriginal);
    if (result.reason) {
      const title = (item && item.title) || '';
      console.log(`[SharedResearch] Item rejected — reason: ${result.reason}, title: ${String(title).slice(0, 120)}`);
      rejected.push({ reason: result.reason, title, item });
      continue;
    }
    accepted.push(normaliseCuratedItem(item, result.normalisedUrl));
  }

  return { accepted, rejected };
}

function checkValidation(item, normalisedMap) {
  if (!item || typeof item !== 'object') return { reason: 'item is not an object' };

  // Required-field check first so missing-field rejections surface
  // a stable reason rather than a downstream error.
  for (const f of REQUIRED_CURATED_FIELDS) {
    const v = item[f];
    if (v === undefined || v === null) return { reason: `missing required field: ${f}` };
    if (typeof v === 'string' && !v.trim()) return { reason: `empty required field: ${f}` };
    if (Array.isArray(v) && v.length === 0) return { reason: `empty required field: ${f}` };
  }

  if (!VALID_CATEGORY_SET.has(item.category)) {
    return { reason: `invalid category: ${item.category}` };
  }

  const lenses = Array.isArray(item.lens) ? item.lens : [item.lens];
  for (const l of lenses) {
    if (!VALID_LENS_SET.has(l)) return { reason: `invalid lens: ${l}` };
  }

  // Fabricated-URL check uses the normalised form on both sides.
  const norm = normaliseUrlForMatch(item.url);
  if (!norm || !normalisedMap.has(norm)) return { reason: 'fabricated url' };

  // source_type defaults to "secondary" if missing/invalid — soft-fail
  // rather than rejecting the whole item, which would discard otherwise
  // useful curated content over a typing nit. The downstream consumer
  // can still see the original output via the rejection log if Haiku is
  // misbehaving on this consistently.
  return { reason: null, normalisedUrl: norm };
}

// URL normalisation for fabricated-URL matching. Returns null on parse
// failure (treated as fabricated). The function intentionally keeps the
// PATH case-sensitive — many sites have case-sensitive paths — while
// lowercasing the scheme and host. The scheme itself is dropped from
// the canonical form so http and https variants match each other; that
// is the explicit Phase 3.2 requirement.
//
// Tracking query parameters (utm_*, fbclid, gclid, ref, mc_*) are
// stripped before comparison. Non-tracking parameters are preserved
// and sorted for stable matching, so two URLs that differ only in
// parameter order still normalise to the same string.
//
// The function is exported for testing and so audit/debug code can
// independently derive the canonical form of any URL.

export function normaliseUrlForMatch(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch (e) {
    return null;
  }

  // Only http(s) URLs participate in the match — protocol-less,
  // mailto:, javascript:, etc. cannot be fabrication-checked anyway.
  const protocol = u.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return null;

  let host = u.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);

  // Strip default ports; keep non-default ports as part of the host
  // identity.
  const portPart = u.port ? ':' + u.port : '';

  // Path: preserve case (paths can be case-sensitive on the origin);
  // strip a single trailing slash unless the path is the root.
  let path = u.pathname || '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  // Query params: drop tracking-only keys, sort the rest for stability.
  const keptParams = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (isTrackingParam(k)) continue;
    keptParams.push([k, v]);
  }
  keptParams.sort((a, b) => a[0].localeCompare(b[0]));
  const query = keptParams.length
    ? '?' + keptParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';

  // Fragment is always dropped — same page, same content.
  return host + portPart + path + query;
}

function isTrackingParam(rawKey) {
  if (!rawKey) return false;
  const k = String(rawKey).toLowerCase();
  return (
    k.startsWith('utm_') ||
    k.startsWith('mc_') ||
    k === 'fbclid' ||
    k === 'gclid' ||
    k === 'ref'
  );
}

function normaliseCuratedItem(item, normalisedUrl) {
  const lenses = Array.isArray(item.lens) ? item.lens : [item.lens];
  const hasValidSourceType = VALID_SOURCE_TYPE_SET.has(item.source_type);
  const sourceType = hasValidSourceType ? item.source_type : 'secondary';
  if (!hasValidSourceType) {
    // Soft-fail visibility — if Haiku consistently mistypes source_type
    // we want to see it in the dry-run logs. Original value is rendered
    // distinctly for missing/null vs string variants so the log reads
    // the same way in both cases.
    const original = (item.source_type === undefined || item.source_type === null)
      ? '(missing)'
      : JSON.stringify(item.source_type);
    const title = String(item.title || '').slice(0, 120);
    console.log(`[SharedResearch] Source type normalised — original: ${original}, normalised: secondary, title: ${title}`);
  }
  return {
    title: String(item.title || '').trim(),
    summary: String(item.summary || '').trim(),
    // url is the original Haiku output — what we display and audit.
    // normalised_url is what we matched against — what downstream code
    // can use as a stable key. Section 9.5 says items must reference a
    // real Serper URL; preserving both lets us prove that.
    url: String(item.url || '').trim(),
    normalised_url: normalisedUrl || null,
    source_name: String(item.source_name || '').trim(),
    source_domain: String(item.source_domain || '').trim(),
    source_type: sourceType,
    lens: lenses,
    category: item.category,
    published_date: item.published_date || null
  };
}

// Groups the validated items by category so the dry-run response can
// be inspected one category at a time. Categories with zero items after
// curation are dropped from the output — Section 9.5 distinguishes
// "validation failure" (rejected items) from "no relevant items in this
// category" (legitimate empty result).

export function groupCuratedByCategory(items) {
  const out = {};
  for (const cat of CURATED_CATEGORIES) out[cat] = [];
  for (const it of items || []) {
    if (out[it.category]) out[it.category].push(it);
  }
  // Drop empty categories
  for (const cat of CURATED_CATEGORIES) {
    if (out[cat].length === 0) delete out[cat];
  }
  return out;
}
