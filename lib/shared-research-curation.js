// lib/shared-research-curation.js — Sonnet curation + Section 9.5 validation
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
//
// SRL Cohort Architecture Addendum v1.2:
//   §8.1 — curation model is claude-sonnet-4-6 (was haiku-4-5).
//   §8.2 — cross-category routing. Pass D implemented this as
//          dispatcher-level fan-out (each item to every category in
//          its source_categories array); Pass D.7 superseded that
//          with one-batch-per-item dispatch plus a prompt-level
//          RECATEGORISATION DUTY, which gives Sonnet a fair chance
//          to move an item to a different category before dropping
//          it while keeping shared_research at one row per item.
//          See runCuration comment block below for the rationale
//          and the consequence on the items_in / items_out counters.
//
// Pass D.8 removed the listings feature entirely — the ITEM TYPES /
// LISTING RECOGNITION / LISTING RELEVANCE GUARDRAILS / LISTING
// CATEGORY AND LENS prompt sections, the item_type vocabulary and
// listings-economic validator checks, and the buildSharedResearchRow
// item_type column. The curation now produces a single shape of
// curated item — factual research items only.

import {
  AUSTRALIAN_STATES,
  CATEGORIES,
  normaliseIndustries,
  resolveRegion
} from './shared-research-plan.js';

// ---------------------------------------------------------------------------
// Curation vocabulary + caps
// ---------------------------------------------------------------------------

// Derived from CATEGORIES in lib/shared-research-plan.js — single source
// of truth for category order across the curation pipeline. Adding,
// renaming, or reordering categories in plan.js flows through here, the
// dispatcher's bucket init, the parallel fan-out, the validator's
// VALID_CATEGORY_SET, and groupCuratedByCategory's output ordering.
export const CURATED_CATEGORIES = Object.keys(CATEGORIES);
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
export const ITEMS_PER_CATEGORY_CAP = 20;

// Per-item snippet truncation when feeding raw items to Sonnet. Long
// snippets dominate token usage without adding curation signal — the
// title + first ~280 chars of snippet is enough for Sonnet to assess
// relevance and substance.
const SNIPPET_INPUT_TRUNCATE = 280;

// Anthropic API config. Addendum §8.1 swaps the curation model from
// claude-haiku-4-5 to claude-sonnet-4-6 — cohort-shared curation
// amortises model cost across every member of the cohort, so the
// per-user Haiku price advantage is materially reduced, and Sonnet's
// better-calibrated judgement on borderline substance-test items is
// expected to lift retention without the Phase 6 Pass 1c residual.
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
export const CURATION_MODEL = 'claude-sonnet-4-6';
const CURATION_MAX_TOKENS = 8000;

// ---------------------------------------------------------------------------
// Curation prompt
// ---------------------------------------------------------------------------
//
// System prompt teaches Sonnet the matrix vocabulary, the source-typing
// rules (in line with ID's existing typing — extended to call out
// associations as their own type per Section 15), and the curation rules
// from Section 9.4.
//
// CATEGORY_DEFINITIONS holds the per-slug prose; the CATEGORY KEYS block in
// the prompt is generated from CURATED_CATEGORIES + this map so adding,
// renaming, or reordering categories in lib/shared-research-plan.js updates
// the prompt automatically without hand-editing the prompt array.

const CATEGORY_DEFINITIONS = {
  'regulatory':    'federal/state regulation, ATO, Fair Work, industry licensing, safety standards, compliance deadlines',
  'industry-news': 'industry workforce events (union disputes, major hires, training programmes), association activity (annual reports, conferences, awards), sector consolidation (mergers, acquisitions, restructuring), named industry projects (contracts won/lost, project launches), and industry-specific company news that is NOT primarily a regulatory, supply chain, economic, or technology story',
  'supply-chain':  'supply chain disruption, materials availability, materials pricing, supplier consolidation, key supplier news',
  'economic':      'macroeconomic conditions, interest rates, inflation, regional economic indicators, market sentiment',
  'technology':    'industry technology trends, software adoption, AI, digital tools, productivity-enhancing innovations'
};

const CATEGORY_KEY_PAD = Math.max(...CURATED_CATEGORIES.map(s => s.length)) + 4;

export const CURATION_SYSTEM_PROMPT = [
  'You are a research curator for StaxAI, a platform serving Australian SME businesses.',
  '',
  'Your job is to filter, structure, and clean a set of web search results into a curated research evidence set. This is FILTERING and STRUCTURING only — not analysis, not recommendation, not strategic advice.',
  '',
  'CATEGORY KEYS (use exactly these strings):',
  ...CURATED_CATEGORIES.map(slug => `- ${slug.padEnd(CATEGORY_KEY_PAD, ' ')}— ${CATEGORY_DEFINITIONS[slug]}`),
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
  '3. RELEVANCE TEST — every item must pass BOTH tests below to be retained. Drop any item that fails either.',
  '',
  '3a. GEOGRAPHY TEST — the item\'s primary subject geography must be Australia, an Australian state, or an Australian region. Items whose primary subject is a foreign country, foreign region, or foreign city fail this test, even if they use the word "SME" or "small business" — content about Indonesian, UK, Hong Kong, Welsh, or Malaysian businesses fails geography. A non-Australian source publishing about Australia passes geography if Australia is the primary subject. A foreign source publishing about foreign businesses fails geography even if syndicated locally.',
  '',
  '3b. TOPIC TEST — the item must reasonably affect an Australian small business owner\'s commercial, operational, regulatory, or financial interests. Cross-cutting items pass even when they do not name the user\'s specific industry, state, or region — Federal Budget, Reserve Bank, ATO, Fair Work, AML/CTF, Small Business Ombudsman / Commissioner, SME funding schemes, peak-body activity, federal and state SME policy. Industry-specific items pass when they name a development relevant to the user\'s industry (from the BUSINESS PROFILE block). "Development" here is meant broadly — it includes regulatory changes, legislative reforms, government-industry consultations, sector trends, and named projects, not only physical construction or product launches. Consumer DIY, lifestyle, travel, entertainment, hobbyist, individual-personal-circumstance, civic-or-constitutional-law content not specific to business, and tourism content fails topic — garden design tips, film locations, town tourism guides, kangaroo welfare, one-person legal cases, and general constitutional rulings are not SME content. Vendor product launches, single-product announcements, and content marketing pieces fail topic when their value depends on the specific product being named — the test is whether the article would still be valuable to an SME owner if the named vendor or product did not exist. Pieces about industry-wide trends, market conditions, or sector shifts pass even when published by or featuring a vendor.',
  '',
  'When in doubt at either test, drop rather than retain — but only after the RECATEGORISATION DUTY below is applied.',
  '',
  'RECATEGORISATION DUTY:',
  'Before dropping an item under Rule 2 (SUBSTANCE TEST) or Rule 3 (RELEVANCE TEST), evaluate whether the item fits any of the OTHER four category definitions above. The item arrives in a batch that reflects which query surfaced it first; that routing is a hint, not a binding constraint on the output category. Re-read the five CATEGORY KEYS above and consider whether the item\'s substance fits a different category. If the item satisfies Rule 2 and Rule 3 under another category\'s definition, retain it and set its output category field to that other category. Drop the item only when no category accepts it under Rule 2 and Rule 3 together.',
  '',
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
  'JSON CHARACTER RULES (apply to every string value in your output — title, summary, url, source_name, source_domain, source_type, published_date, and every entry of the lens array):',
  '- The JSON string delimiter is the straight ASCII double quote ("). Every string value opens and closes with ". Any " that appears INSIDE a string value must be escaped as \\" — never write a raw double quote inside a string. If the source text uses an inner quoted phrase, either rewrite the summary without the inner quotes or escape every inner " as \\".',
  '- Do not use smart quotes (" " or ‘ ’) anywhere in the output, neither as delimiters nor inside string values. Smart quotes are not valid JSON delimiters and they will break the parser. Replace " or " with straight " (escaped to \\" if inside a string); replace ‘ or ’ with a straight ASCII apostrophe.',
  '- Apostrophes inside string values may be straight ASCII apostrophes (\') and do not need escaping in JSON. Do not use smart apostrophes.',
  '- No literal newline, tab, or carriage-return characters inside any string value. If a source title or summary contains a line break, replace it with a single space, or write the escape sequence \\n. Literal newlines mid-string break the parser.',
  '- Backslashes must be paired with a valid JSON escape character. The valid pairings are \\\\ (literal backslash), \\" (double quote), \\n (newline), \\t (tab), \\r (carriage return), \\/ (forward slash), and \\uXXXX (unicode codepoint). A standalone \\ before any other character is invalid JSON and will be rejected.',
  '- Before returning, mentally read your output the way a JSON parser would. Each string must open with ", close with ", and contain only characters valid inside a JSON string. Each object must open with { and close with }. Each array must open with [ and close with ]. Commas separate items in an array and key-value pairs in an object; trailing commas are invalid.',
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
  // The model maps back to the full key names on output via the
  // system prompt's OUTPUT FORMAT section. `c` is the array of source
  // categories the URL surfaced from (a URL can appear in queries from
  // multiple categories — see Phase 3.1 attribution model). The prompt's
  // RECATEGORISATION DUTY instructs the model to evaluate every content
  // item against all five category definitions and emit the best fit,
  // so this array is informational rather than restrictive.
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
// Run the Sonnet curation pass — per-category parallel fan-out
// ---------------------------------------------------------------------------
//
// Phase 3.5: curation runs as five concurrent calls to the curation
// model, one per source category, instead of a single large call.
// Phase 3.4 timing showed the single call taking ~36s end-to-end with
// 265 items — 70% of total pipeline time and the cause of the
// cache-miss 504s. Splitting along the natural category boundary cuts
// curation wall-clock to roughly max(per_category) instead of sum.
//
// Addendum §8.1 — model is claude-sonnet-4-6 (was haiku-4-5). Cohort-
// shared curation amortises model cost across every member of the
// cohort, so the per-user Haiku price advantage is materially reduced.
//
// Pass D.7 — one batch per item, recategorisation in the prompt.
//
// Each deduped item is routed to exactly one batch: the first
// category in its source_categories array. The plan-build order
// (lib/shared-research-plan.js — regulatory → technology → supply-chain
// → economic → industry-news) puts the more specific categories
// ahead of the catch-all industry-news, so the initial routing
// already lands items in the category most likely to be the best fit.
//
// The curation prompt then carries a RECATEGORISATION DUTY: before
// dropping an item under the substance or relevance tests, Sonnet
// must evaluate whether the item fits any of the other four
// category definitions and, if it does, retain the item under that
// other category. Sonnet drops only when no category accepts the
// item.
//
// The two pieces together (routing-by-source_categories[0] +
// prompt-level recategorisation) deliver: each item is evaluated
// once, by exactly one Sonnet call, which assigns the best-fit
// category. The write path produces one shared_research row per
// item. Same-URL-different-category duplicates that the Pass D
// fan-out produced are gone by construction.
//
// items_in / items_out summed across batches now equal the deduped
// input size (each item appears in exactly one batch's items_in).
// items_out per batch and data.curated_items[category].length can
// still differ when Sonnet exercises the recategorisation duty —
// an item routed to supply-chain but tagged industry-news on output
// counts in supply-chain's items_out but lands under industry-news in
// the stored grouping.
//
// Return shape:
//   { ok, items, error, usage, per_category }
// where per_category is keyed by category and reports each call's
// duration_ms, ok, error, items_in, items_out, input_tokens,
// output_tokens for handler-level timing instrumentation.
//
// usage is the SUM of input_tokens / output_tokens across all batches,
// so the existing single api_usage write at the caller continues to
// reflect the full curation cost of the refresh.
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

  // Pass D.7 — route each deduped item to exactly ONE batch: the
  // first category in its source_categories array. Plan-build order
  // (regulatory → technology → supply-chain → economic → industry-news,
  // see CATEGORIES in lib/shared-research-plan.js) lands items in
  // the more specific categories first; industry-news as the catch-
  // all sits last. The prompt's RECATEGORISATION DUTY gives Sonnet
  // the second-chance evaluation against the other four categories
  // before any content item is dropped, so initial routing is a
  // hint rather than a binding constraint.
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
    const result = await runCurationCall(profile, batchItems, anthropicKey, category);
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
      output_tokens: outputTokens
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

// Single-batch curation call against the model in CURATION_MODEL
// (Sonnet since Pass D's swap from Haiku). The exact same prompt and
// response parsing as the pre-Phase-3.5 single-call runCuration —
// extracted here so the per-category fan-out can reuse it without
// duplicating the Anthropic API plumbing. Pass D.10 added partial-
// recovery on JSON parse failure (see recoverItemsFromPartialJson).

async function runCurationCall(profile, items, anthropicKey, categoryLabel) {
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
        temperature: 0,
        system: CURATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
  } catch (e) {
    console.error('[SharedResearch] Curation fetch exception —', 'category:', categoryLabel, 'message:', e && e.message);
    return { ok: false, items: [], error: 'fetch exception: ' + (e && e.message), usage: null };
  }

  if (!resp.ok) {
    // Best-effort read of the error body for logging only — empty
    // string is the intentional fallback so the console.error below
    // still fires with the upstream HTTP status even if the body
    // read fails.
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
    // Pass D.10 — partial recovery. The full-payload parse failed,
    // typically because of an unescaped character (raw quote, smart
    // quote, literal newline) inside a single item's string value.
    // The items before that breakage are intact in the text, so we
    // walk balanced-brace objects from the start of the items array
    // and parse each individually. Items emitted before the bad one
    // are retained; the bad item and everything after it are lost.
    const errMsg = (e && e.message) || 'unknown';
    const recovered = recoverItemsFromPartialJson(cleaned);
    if (recovered.length > 0) {
      console.log(`[SharedResearch] Curation JSON parse failed but recovered ${recovered.length} items — category: ${categoryLabel}, message: ${errMsg}`);
      return {
        ok: true,
        items: recovered,
        error: `json parse failed but recovered ${recovered.length} items: ${errMsg}`,
        usage: data.usage || null
      };
    }
    console.error('[SharedResearch] Curation JSON parse failed —', 'category:', categoryLabel, 'message:', errMsg, 'preview:', cleaned.slice(0, 300));
    return { ok: false, items: [], error: 'json parse failed: ' + errMsg, usage: data.usage || null };
  }

  const itemsOut = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  return { ok: true, items: itemsOut, error: null, usage: data.usage || null };
}

// ---------------------------------------------------------------------------
// Partial-recovery JSON walker — Pass D.10
// ---------------------------------------------------------------------------
//
// Used when JSON.parse fails on the curation model's full response.
// Expected response shape is {"items": [<obj>, <obj>, ...]}. When one
// item carries an unescaped quote, smart quote, or literal newline in
// its summary/title, the top-level parse throws — but the items before
// the breakage are still valid JSON.
//
// The walker:
//   1. Locates the items array opening ("items": [) via regex.
//   2. Skips whitespace and commas, expects a '{' for each item.
//   3. Walks the object tracking JSON string state (so '{' or '}' inside
//      a string don't perturb depth) and the standard \\-escape so an
//      escaped quote (\") doesn't toggle string mode. When depth returns
//      to zero, the object is balanced.
//   4. JSON.parse the balanced substring. If it parses to an object,
//      add to the recovered list. If parse throws, stop walking — once
//      a string's quote escaping is wrong the walker's view of depth
//      can't reliably resume.
//   5. Stop on the closing ']', any non-'{' content where '{' was
//      expected, or running off the end without a closing brace.
//
// Returns the recovered array (may be empty).

function recoverItemsFromPartialJson(text) {
  const recovered = [];
  if (!text) return recovered;

  const itemsKeyMatch = text.match(/"items"\s*:\s*\[/);
  if (!itemsKeyMatch) return recovered;

  let i = itemsKeyMatch.index + itemsKeyMatch[0].length;
  const N = text.length;

  while (i < N) {
    // Skip whitespace and separator commas between items.
    while (i < N) {
      const ch = text[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ',') {
        i++;
        continue;
      }
      break;
    }
    if (i >= N) break;
    if (text[i] === ']') break;       // clean end of array
    if (text[i] !== '{') break;       // structural — can't resume

    const start = i;
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;

    for (; i < N; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (inString) {
        if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end === -1) break;            // ran off the end without closing

    const substring = text.slice(start, end);
    try {
      const obj = JSON.parse(substring);
      if (obj && typeof obj === 'object') recovered.push(obj);
    } catch (e) {
      // Item didn't parse — once the walker mis-aligns due to an
      // unescaped quote it can't reliably resume. Stop and return
      // what we have.
      break;
    }
    i = end;
  }

  return recovered;
}

// ---------------------------------------------------------------------------
// Validation — Section 9.5
// ---------------------------------------------------------------------------
//
// Walks the Sonnet output and applies the four rules from Section 9.5:
//   1. URL must exist in the raw Serper results from this run
//   2. Category must be one of the 5 valid keys
//   3. Every lens must be one of the 6 valid keys
//   4. Required fields (title, summary, url, source_name, category, lens)
//      must be present and non-empty
// Source type is also normalised — invalid source_type rejects the item.
// Each rejection is logged in the platform format and returned with the
// reason + the original item so the dry-run response can surface it.

export function validateCuratedItems(sonnetItems, dedupedInputs) {
  // Build the allowed-URL set as a Map keyed on the normalised form so
  // trivial cosmetic differences between Sonnet's output and the raw
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

  for (const item of sonnetItems || []) {
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
  // can still see the original output via the rejection log if Sonnet is
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
    // Soft-fail visibility — if Sonnet consistently mistypes source_type
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
    // url is the original Sonnet output — what we display and audit.
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
