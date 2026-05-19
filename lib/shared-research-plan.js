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
import { getIndustryByDisplayLabel } from './industry-taxonomy.js';
import { getSimpleRegionName, normaliseRegionSlug } from './au-region-mapping.js';

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
  'supply-chain':  { label: 'Supply Chain',            tbs: 'qdr:m'  },
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
// Dual-term emission: state-SMEs and region-SMEs cells in Regulatory,
// Economic, and Technology emit TWO queries each — one with "SME"
// framing and one with "small and medium business" framing. Industry
// News and Supply Chain have no SME-lens cells (removed in Phase 6.5), so
// no dual emission there. The Phase 2 dry-run data showed those two
// terms surface materially different content at state and region level,
// and several region-SMEs cells returned zero results on "SME" alone
// but strong results on the longer phrasing. National-SMEs cells emit a
// single "SME" query — the dry-run showed national queries return full
// result sets on "SME" alone, so dual-term there is duplication without
// gain. Industry-specific cells reference the industry directly and need
// no SME framing.

export const QUERY_TEMPLATES = {
  'regulatory': {
    'national-smes':     ()                            => 'Australian SME regulatory updates',
    'national-industry': ({ industry })                => `${industry} regulation Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME compliance updates`, `${stateFull} small and medium business compliance updates`],
    'state-industry':    ({ industry, stateFull })     => `${industry} compliance ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME compliance updates`, `${region} small and medium business compliance updates`],
    'region-industry':   ({ industry, region })        => `${industry} compliance ${region}`
  },
  'industry-news': {
    // Phase 6.5 Item 1 — SME-lens cells (national-smes, state-smes,
    // region-smes) removed. The cross-cutting SME signal flows via the
    // SME lenses retained in economic, regulatory, and technology.
    // Parent SRL spec Section 5 still describes a 5×6=30-cell matrix;
    // implementation now reflects 24 cells. Reconciliation deferred to
    // v1.1 alongside the Industry Taxonomy Expansion workstream.
    'national-industry': ({ industry })                => `${industry} general news Australia`,
    'state-industry':    ({ industry, stateFull })     => `${industry} general news ${stateFull}`,
    'region-industry':   ({ industry, region })        => `${industry} general news ${region}`
  },
  'supply-chain': {
    // Phase 6.5 Item 1 — SME-lens cells removed; see industry-news above
    // for rationale.
    'national-industry': ({ industry })                => `${industry} supply chain Australia`,
    'state-industry':    ({ industry, stateFull })     => `${industry} supply chain ${stateFull}`,
    'region-industry':   ({ industry, region })        => `${industry} supply chain ${region}`
  },
  'economic': {
    'national-smes':     ()                            => 'Australian SME economic outlook',
    'national-industry': ({ industry })                => `${industry} market conditions Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME economic outlook`, `${stateFull} small and medium business economic conditions`],
    'state-industry':    ({ industry, stateFull })     => `${industry} market conditions ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME economic outlook`, `${region} small and medium business economic conditions`],
    'region-industry':   ({ industry, region })        => `${industry} market conditions ${region}`
  },
  // Technology — Task 47 review (commit 1d3b0f8) reverted the Phase 3.2
  // vertical-specific framing (software, AI, digital tools) back to the
  // abstract operative noun "technology" across all six cells. The Chat
  // review judged the vertical approach was producing a too-narrow result
  // set, and a single operative noun aligns with the other categories'
  // shape (regulation / market conditions / general news / supply chain).
  // Cell-count and dual-emit structure are preserved.
  'technology': {
    'national-smes':     ()                            => 'Australian SME technology news',
    'national-industry': ({ industry })                => `${industry} technology Australia`,
    'state-smes':        ({ stateFull })               => [`${stateFull} SME technology news`, `${stateFull} small and medium business technology news`],
    'state-industry':    ({ industry, stateFull })     => `${industry} technology ${stateFull}`,
    'region-smes':       ({ region })                  => [`${region} SME technology news`, `${region} small and medium business technology news`],
    'region-industry':   ({ industry, region })        => `${industry} technology ${region}`
  }
};

// Normalises a template return value to an array of strings. Lets cells
// emit either a single query (most cells) or two queries (the dual-term
// SME / small and medium business cells in Regulatory, Economic, and
// Technology) without the plan generator caring which is which.
function templateToQueries(result) {
  if (Array.isArray(result)) return result.filter(Boolean);
  if (typeof result === 'string' && result) return [result];
  return [];
}

// ---------------------------------------------------------------------------
// Region resolution — Section 7.2
// ---------------------------------------------------------------------------
//
// Resolves a Business Profile to { region_name, region_state, sa4,
// simple_name } using the SA4 postcode lookup plus the journalism-
// friendly mapping in lib/au-region-mapping.js. Returns null when no
// usable region can be derived, and callers must skip region lenses
// for that user (Section 7.2 step 4) rather than firing garbage
// queries.
//
// region_name keeps the ABS SA4 format ("Mid North Coast NSW") for
// any consumer that still wants the per-SA4 granularity (cache_access
// keys, cohort metadata display, etc.). simple_name is the journalism-
// friendly form ("South Coast NSW") that the SRL query templates now
// inject — wider catchment, less statistical phrasing, materially
// better Serper hit rate. Both formats append the state abbreviation
// in the same shape so downstream consumers can swap one for the
// other without changing their format expectations.

export function resolveRegion(profile) {
  if (!profile) return null;
  const raw = (profile.address_postcode || '').toString().trim();
  if (!raw) return null;
  const padded = raw.length < 4 ? raw.padStart(4, '0') : raw;
  if (!/^\d{4}$/.test(padded)) return null;
  const entry = POSTCODE_REGIONS[padded];
  if (!entry || !entry.sa4 || !entry.state) return null;
  const sa4Slug = normaliseRegionSlug(entry.sa4);
  const simpleRegion = getSimpleRegionName(entry.state, sa4Slug);
  let simple_name;
  if (simpleRegion) {
    simple_name = simpleRegion + ' ' + entry.state;
  } else {
    // Defensive fallback. Shouldn't fire with the current full
    // mapping but logged loud so any future SA4 addition to
    // lib/au-postcode-regions.js without a matching mapping entry
    // surfaces immediately in Vercel logs instead of silently
    // degrading queries to the ABS-statistical form.
    console.warn('[shared-research-plan] No simple-region mapping for state ' + entry.state + ' / SA4 ' + entry.sa4 + '; falling back to ABS region_name');
    simple_name = entry.sa4 + ' ' + entry.state;
  }
  return {
    region_name: entry.sa4 + ' ' + entry.state,
    region_state: entry.state,
    sa4: entry.sa4,
    simple_name
  };
}

// ---------------------------------------------------------------------------
// Industry normalisation
// ---------------------------------------------------------------------------
//
// The Business Profile stores industry as either a single string or an array
// of strings, capped at three by the BP picker (Industry Taxonomy v2.0 §5.1
// raised the cap from 2 to 3 in Phase 7). Section 7.1 is explicit that
// industry arrays must NOT be comma-joined into a literal — each industry is
// its own query. This helper produces the deduped trimmed list, applying the
// cap defensively in case stored data ever exceeds it.

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
  return out.slice(0, 3);
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
      // industry-news and supply-chain categories no longer carry SME-lens
      // cells; the guard is generic so any future removal works without
      // touching the loop.
      if (!template) continue;

      if (INDUSTRY_AGNOSTIC_LENSES.has(lens)) {
        const queries = templateToQueries(template({
          stateFull,
          region: region ? region.simple_name : null
        }));
        for (const q of queries) {
          plan.push({
            category: categoryKey,
            category_label: cat.label,
            lens,
            industry: null,
            industry_substitution: null,
            query: q,
            query_type: 'news',
            recency: cat.tbs,
            location
          });
        }
      } else {
        // Industry-specific lens — fire once per industry per
        // substitution phrase. srlSubstitution is an array of one or
        // more phrases per Industry Taxonomy Spec v2.0 §10.6; a
        // compound-name industry (e.g. Plumbing & Gas) can carry two
        // phrases that get queried separately (commercial plumbing vs
        // commercial gas services) so the per-trade results don't
        // collide. Most industries are one-phrase arrays so query
        // count is unchanged from the pre-array world. The plan row's
        // `industry` field keeps the display label for source
        // attribution (Serper results group back to a single industry
        // regardless of which substitution phrase fired the query);
        // `industry_substitution` carries the actual phrase that went
        // into the query so dry-run inspection can trace any noisy
        // results back to the substitution that produced them.
        for (const industry of industries) {
          const taxEntry = getIndustryByDisplayLabel(industry);
          // Fallback if the profile carries a display label that isn't
          // in the taxonomy any more (stale data, manual SQL edit):
          // use the display label itself as the single substitution,
          // log a warning, and continue. The query plan still gets
          // built — the operator just sees the noisy-result warning
          // and can fix the profile.
          let substitutions;
          if (taxEntry && Array.isArray(taxEntry.srlSubstitution) && taxEntry.srlSubstitution.length > 0) {
            substitutions = taxEntry.srlSubstitution;
          } else {
            console.warn('[shared-research-plan] Industry display label not in taxonomy or missing srlSubstitution, using label verbatim —', 'label:', industry);
            substitutions = [industry];
          }
          for (const subPhrase of substitutions) {
            const queries = templateToQueries(template({
              industry: subPhrase,
              stateFull,
              region: region ? region.simple_name : null
            }));
            for (const q of queries) {
              plan.push({
                category: categoryKey,
                category_label: cat.label,
                lens,
                industry,
                industry_substitution: subPhrase,
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
