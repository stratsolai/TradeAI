// lib/shared-research-plan.js — query plan + region + industries
//
// One of three sub-modules the Shared Research Layer is split across:
//   - shared-research-plan.js     — this file (matrix, region, plan build)
//   - shared-research-cache.js    — cache layer, Serper executor, dedupe
//   - shared-research-curation.js — Sonnet curation + validation
// All three are re-exported from lib/shared-research.js so callers
// (currently just api/shared-research-refresh.js) keep working
// unchanged.
//
// Implements Section 6 (matrix) and Section 7 (query construction,
// region resolution) of the spec. See lib/shared-research-cache.js
// for Section 8 and lib/shared-research-curation.js for Section 9.

import POSTCODE_REGIONS from './au-postcode-regions.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUSTRALIAN_STATES = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  SA:  'South Australia',
  WA:  'Western Australia',
  TAS: 'Tasmania',
  NT:  'Northern Territory',
  ACT: 'Australian Capital Territory'
};

// Section 4 — five source categories with the per-category recency tightening
// from Section 7.3. tbs is the Serper recency parameter used on every query
// in that category.
//
// Key-insertion order matters: buildQueryPlan iterates Object.keys(CATEGORIES)
// in order, the plan rows are written in that order, dedupByLink preserves
// plan_indices ascending, and enrichDedupedWithPlan builds source_categories
// in plan-index order. So source_categories[0] for any deduped item is the
// first category here that surfaced the item via any of its queries.
//
// Pass D.7 — the curation dispatcher routes each item to exactly one batch
// (source_categories[0]). The order below puts regulatory and technology
// ahead of industry-news so items most likely to be best-fit for the
// specific categories land there first; industry-news comes last as the
// most catch-all category. The curation prompt's RECATEGORISATION DUTY
// gives Sonnet a second chance to move an item to a different category
// when the initial routing isn't the best fit.
export const CATEGORIES = {
  'regulatory':    { label: 'Regulatory & Compliance', tbs: 'qdr:m3' },
  'technology':    { label: 'Technology & Innovation', tbs: 'qdr:m3' },
  'suppliers':     { label: 'Supplier & Materials',    tbs: 'qdr:m'  },
  'economic':      { label: 'Economic & Market',       tbs: 'qdr:m'  },
  'industry-news': { label: 'Industry News',           tbs: 'qdr:m'  }
};

// Section 5 — six business-relevance lenses. Order is the canonical order
// used in spec tables and in the dry-run plan output.
export const LENSES = [
  'national-smes',
  'national-industry',
  'state-smes',
  'state-industry',
  'region-smes',
  'region-industry'
];

// ---------------------------------------------------------------------------
// Query templates — Section 7
// ---------------------------------------------------------------------------
//
// One template per matrix cell (5 categories × 6 lenses = 30). Each template
// is a function over { industry, stateFull, region } and returns either a
// query string OR an array of query strings (some cells dual-emit two
// queries — see below).
//
// Industry-specific lenses are evaluated once per industry by
// buildQueryPlan() — no comma-joined industry strings (the bug Section 7.1
// is fixing). Region lenses are skipped entirely if region resolution fails
// for the user (Section 7.2 step 4). Style follows Section 7.4: short,
// natural language, no site: operators, no quoted phrases unless necessary.
//
// Dual-term emission: every state-SMEs and region-SMEs cell across all
// five categories emits TWO queries — one with "SME" framing and one with
// "small business" framing. The Phase 2 dry-run data showed those two
// terms surface materially different content at state and region level,
// and several region-SMEs cells returned zero results on "SME" alone but
// strong results on "small business". National-SMEs cells emit a single
// "SME" query — the dry-run showed national queries return full result
// sets on "SME" alone, so dual-term there is duplication without gain.
// Industry-specific cells reference the industry directly and need no
// SME / small business framing.

export const QUERY_TEMPLATES = {
  'regulatory': {
    'national-smes':     ()                            => 'Australian SME regulatory updates',
    'national-industry': ({ industry })                => `${industry} regulation Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME compliance updates`, `${stateFull} small business compliance updates`],
    'state-industry':    ({ industry, stateFull })     => `${industry} regulation ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME regulation`, `${region} small business regulation`],
    'region-industry':   ({ industry, region })        => `${industry} regulation ${region}`
  },
  'industry-news': {
    // Phase 6.5 Item 1 — SME-lens cells (national-smes, state-smes,
    // region-smes) removed. The cross-cutting SME signal flows via the
    // SME lenses retained in economic, regulatory, and technology.
    // Parent SRL spec Section 5 still describes a 5×6=30-cell matrix;
    // implementation now reflects 24 cells. Reconciliation deferred to
    // v1.1 alongside the Industry Taxonomy Expansion workstream.
    'national-industry': ({ industry })                => `${industry} industry news Australia`,
    'state-industry':    ({ industry, stateFull })     => `${industry} news ${stateFull}`,
    'region-industry':   ({ industry, region })        => `${industry} news ${region}`
  },
  'suppliers': {
    // Phase 6.5 Item 1 — SME-lens cells removed; see industry-news above
    // for rationale.
    'national-industry': ({ industry })                => `${industry} materials supply Australia`,
    'state-industry':    ({ industry, stateFull })     => `${industry} suppliers ${stateFull}`,
    'region-industry':   ({ industry, region })        => `${industry} suppliers ${region}`
  },
  'economic': {
    'national-smes':     ()                            => 'Australian SME economic outlook',
    'national-industry': ({ industry })                => `${industry} market conditions Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME economic conditions`, `${stateFull} small business economic conditions`],
    'state-industry':    ({ industry, stateFull })     => `${industry} market ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME economic outlook`, `${region} small business economic outlook`],
    'region-industry':   ({ industry, region })        => `${industry} market ${region}`
  },
  // Technology — Phase 3.2 overhaul. The Phase 3.1 dry-run showed the
  // previous abstract-"technology" templates returned nothing the
  // curation layer valued — the two surviving technology items came
  // from non-technology queries that Haiku recategorised on content.
  // News media treats tech as events ("X launches", "Y adopts AI")
  // rather than a topic, so the new templates target specific
  // verticals (software, AI, digital tools) which read naturally to
  // Google News and surface real product / rollout / adoption stories.
  // Cell-count and dual-emit structure are preserved.
  'technology': {
    'national-smes':     ()                            => 'Australian small business AI and software adoption',
    'national-industry': ({ industry })                => `${industry} software Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME software adoption`, `${stateFull} small business AI tools`],
    'state-industry':    ({ industry, stateFull })     => `${industry} digital tools ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME software`, `${region} small business digital tools`],
    'region-industry':   ({ industry, region })        => `${industry} software ${region}`
  }
};

// Normalises a template return value to an array of strings. Lets cells
// emit either a single query (most cells) or two queries (the dual-term
// SME/small business cells in Regulatory & Compliance and Economic &
// Market) without the plan generator caring which is which.
function templateToQueries(result) {
  if (Array.isArray(result)) return result.filter(Boolean);
  if (typeof result === 'string' && result) return [result];
  return [];
}

// ---------------------------------------------------------------------------
// Region resolution — Section 7.2
// ---------------------------------------------------------------------------
//
// Resolves a Business Profile to { region_name, region_state } using the SA4
// postcode lookup. Returns null when no usable region can be derived, and
// callers must skip region lenses for that user (Section 7.2 step 4) rather
// than firing garbage queries.

export function resolveRegion(profile) {
  if (!profile) return null;
  const raw = (profile.address_postcode || '').toString().trim();
  if (!raw) return null;
  const padded = raw.length < 4 ? raw.padStart(4, '0') : raw;
  if (!/^\d{4}$/.test(padded)) return null;
  const entry = POSTCODE_REGIONS[padded];
  if (!entry || !entry.sa4 || !entry.state) return null;
  return {
    region_name: entry.sa4 + ' ' + entry.state,
    region_state: entry.state,
    sa4: entry.sa4
  };
}

// ---------------------------------------------------------------------------
// Industry normalisation
// ---------------------------------------------------------------------------
//
// The Business Profile stores industry as either a single string or an array
// of strings, capped at two by signup. Section 7.1 is explicit that industry
// arrays must NOT be comma-joined into a literal — each industry is its own
// query. This helper produces the deduped trimmed list.

export function normaliseIndustries(profile) {
  if (!profile) return [];
  const raw = profile.industry;
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') list = [raw];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const trimmed = (item || '').toString().trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Query plan — Sections 6, 7
// ---------------------------------------------------------------------------
//
// buildQueryPlan(profile) walks the 5×6 matrix and emits one row per Serper
// query. Industry-specific lenses iterate over each industry separately
// (Section 7.1). Region lenses are dropped if region resolution returned
// null (Section 7.2 step 4). Returned rows carry every metadata field the
// downstream curation pass and the dry-run inspector need.

const INDUSTRY_AGNOSTIC_LENSES = new Set(['national-smes', 'state-smes', 'region-smes']);
const REGION_LENSES = new Set(['region-smes', 'region-industry']);

export function buildQueryPlan(profile) {
  const industries = normaliseIndustries(profile);
  const stateAbbr = (profile && profile.address_state) ? String(profile.address_state).toUpperCase() : null;
  const stateFull = stateAbbr ? AUSTRALIAN_STATES[stateAbbr] : null;
  const region = resolveRegion(profile);

  const plan = [];
  for (const categoryKey of Object.keys(CATEGORIES)) {
    const cat = CATEGORIES[categoryKey];
    for (const lens of LENSES) {
      // Skip state lenses if state is unknown
      if ((lens === 'state-smes' || lens === 'state-industry') && !stateFull) continue;
      // Skip region lenses if region cannot be resolved
      if (REGION_LENSES.has(lens) && !region) continue;

      // Phase 6.5 Item 2 — per-plan-row Serper `location` value. The skip
      // checks above already guarantee stateFull/region are present when
      // the lens needs them; the fallback to 'Australia' is belt-and-
      // braces for any path that bypasses the skips.
      let location;
      if (lens.startsWith('national-')) location = 'Australia';
      else if (lens.startsWith('state-')) location = stateFull || 'Australia';
      else if (lens.startsWith('region-')) location = (region && region.region_name) || 'Australia';
      else location = 'Australia';

      const template = QUERY_TEMPLATES[categoryKey][lens];
      // Phase 6.5 Item 1 — (category, lens) cells removed from
      // QUERY_TEMPLATES return undefined here; skip them entirely. The
      // industry-news and suppliers categories no longer carry SME-lens
      // cells; the guard is generic so any future removal works without
      // touching the loop.
      if (!template) continue;

      if (INDUSTRY_AGNOSTIC_LENSES.has(lens)) {
        const queries = templateToQueries(template({
          stateFull,
          region: region ? region.region_name : null
        }));
        for (const q of queries) {
          plan.push({
            category: categoryKey,
            category_label: cat.label,
            lens,
            industry: null,
            query: q,
            query_type: 'news',
            recency: cat.tbs,
            location
          });
        }
      } else {
        // Industry-specific lens — fire once per industry
        for (const industry of industries) {
          const queries = templateToQueries(template({
            industry,
            stateFull,
            region: region ? region.region_name : null
          }));
          for (const q of queries) {
            plan.push({
              category: categoryKey,
              category_label: cat.label,
              lens,
              industry,
              query: q,
              query_type: 'news',
              recency: cat.tbs,
              location
            });
          }
        }
      }
    }
  }
  return plan;
}

// ---------------------------------------------------------------------------
// State-name helper
// ---------------------------------------------------------------------------

export function stateFullName(stateAbbr) {
  if (!stateAbbr) return null;
  return AUSTRALIAN_STATES[String(stateAbbr).toUpperCase()] || null;
}
