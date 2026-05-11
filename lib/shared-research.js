// lib/shared-research.js — barrel for the Shared Research Layer
//
// The implementation is split across three sub-modules so each file
// stays comfortably under the 60K platform standard and so the three
// concerns (plan generation, cache + Serper, curation + validation)
// can evolve independently without growing one monolith:
//
//   lib/shared-research-plan.js     — Sections 4–7 (matrix, region,
//                                     industries, query plan, state
//                                     name lookup)
//   lib/shared-research-cache.js    — Section 8 + Phase 3.1 attribution
//                                     (cache key, read/write, Serper
//                                     executor with 429 retry,
//                                     executeQueryWithCache, dedupe,
//                                     enrichDedupedWithPlan)
//   lib/shared-research-curation.js — Section 9 + 9.5 (curation
//                                     prompt, per-category fan-out,
//                                     validation, URL normalisation,
//                                     grouping)
//
// This file re-exports the public surface of each sub-module so
// existing callers (currently api/shared-research-refresh.js)
// continue working without import changes. Sub-modules import
// directly from each other where there's a real dependency — the
// barrel is not on the dependency path.

// Plan: matrix, region, industries, query plan
export {
  AUSTRALIAN_STATES,
  CATEGORIES,
  LENSES,
  QUERY_TEMPLATES,
  resolveRegion,
  normaliseIndustries,
  buildQueryPlan,
  stateFullName
} from './shared-research-plan.js';

// Cache layer + Serper executor + dedupe
export {
  buildCacheKey,
  readCache,
  writeCache,
  runSerperQuery,
  executeQueryWithCache,
  makeSerperRateGate,
  dedupByLink,
  enrichDedupedWithPlan
} from './shared-research-cache.js';

// Curation + validation
export {
  CURATED_CATEGORIES,
  CURATED_LENSES,
  SOURCE_TYPES,
  ITEMS_PER_CATEGORY_CAP,
  CURATION_SYSTEM_PROMPT,
  buildCurationUserMessage,
  runCuration,
  validateCuratedItems,
  normaliseUrlForMatch,
  groupCuratedByCategory
} from './shared-research-curation.js';

// Test-only handle aggregating internals from each sub-module. Kept
// for parity with the pre-split surface; not consumed by production
// callers.
import { AUSTRALIAN_STATES as _AU_STATES, QUERY_TEMPLATES as _QT } from './shared-research-plan.js';
import { CURATION_SYSTEM_PROMPT as _PROMPT } from './shared-research-curation.js';
export const __TEST__ = {
  QUERY_TEMPLATES: _QT,
  AUSTRALIAN_STATES: _AU_STATES,
  CURATION_SYSTEM_PROMPT: _PROMPT
};
