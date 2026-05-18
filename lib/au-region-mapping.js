// lib/au-region-mapping.js — journalism-friendly region naming layer.
//
// ABS SA4 names ("Southern Highlands and Shoalhaven", "Hunter Valley
// exc Newcastle", "Sydney - North Sydney and Hornsby") are too narrow
// and too statistical to read naturally in Serper queries — news media
// uses simpler region labels (South Coast, Newcastle Hunter, Sydney).
// This file maps every SA4 slug present in lib/au-postcode-regions.js
// to its journalism-friendly counterpart. The SRL query plan layer
// reads this mapping via resolveRegion() and uses simple_name in
// templates instead of region_name.
//
// Keyed by state abbreviation then by SA4 slug (the normaliseComponent
// form of the SA4 name) because some SA4s appear under multiple states
// with different journalism mappings — e.g. "gold-coast" maps to
// "Gold Coast" under QLD but "Northern NSW" under NSW (Tweed-region
// postcodes). State must be part of the lookup key.
//
// Reverse lookup (simple-region slug → array of SA4 slugs) is used by
// the cohort_id resolver in api/shared-research-refresh.js so admin
// dry-run requests can target either the existing per-SA4 slugs OR
// the new simpler region slugs — both resolve.

export const SIMPLE_REGION_MAP = {
  NSW: {
    // Sydney (15 SA4 slots — 14 Sydney SA4s + Norfolk Island via Other Territories)
    'sydney-baulkham-hills-and-hawkesbury':    'Sydney',
    'sydney-blacktown':                        'Sydney',
    'sydney-city-and-inner-south':             'Sydney',
    'sydney-eastern-suburbs':                  'Sydney',
    'sydney-inner-south-west':                 'Sydney',
    'sydney-inner-west':                       'Sydney',
    'sydney-north-sydney-and-hornsby':         'Sydney',
    'sydney-northern-beaches':                 'Sydney',
    'sydney-outer-south-west':                 'Sydney',
    'sydney-outer-west-and-blue-mountains':    'Sydney',
    'sydney-parramatta':                       'Sydney',
    'sydney-ryde':                             'Sydney',
    'sydney-south-west':                       'Sydney',
    'sydney-sutherland':                       'Sydney',
    'other-territories':                       'Sydney',           // Norfolk Island (NSW external)
    'central-coast':                           'Central Coast',
    'newcastle-and-lake-macquarie':            'Newcastle Hunter',
    'hunter-valley-exc-newcastle':             'Newcastle Hunter',
    'mid-north-coast':                         'Mid North Coast',
    'coffs-harbour-grafton':                   'Mid North Coast',
    'richmond-tweed':                          'Northern NSW',
    'gold-coast':                              'Northern NSW',     // NSW Tweed-region postcodes
    'illawarra':                               'Illawarra',
    'southern-highlands-and-shoalhaven':       'South Coast',
    'capital-region':                          'South Coast',
    'latrobe-gippsland':                       'South Coast',      // NSW slot — border postcodes
    'australian-capital-territory':            'South Coast',      // NSW slot — Queanbeyan-region
    'central-west':                            'Central West',
    'far-west-and-orana':                      'Far West',
    'north-west':                              'Far West',         // NSW slot
    'murray':                                  'Murray Riverina',
    'riverina':                                'Murray Riverina',
    'hume':                                    'Murray Riverina',  // NSW slot
    'shepparton':                              'Murray Riverina',  // NSW slot
    'new-england-and-north-west':              'New England North West',
    'darling-downs-maranoa':                   'New England North West'  // NSW slot
  },
  VIC: {
    'melbourne-inner':                         'Melbourne',
    'melbourne-inner-east':                    'Melbourne',
    'melbourne-inner-south':                   'Melbourne',
    'melbourne-north-east':                    'Melbourne',
    'melbourne-north-west':                    'Melbourne',
    'melbourne-outer-east':                    'Melbourne',
    'melbourne-south-east':                    'Melbourne',
    'melbourne-west':                          'Melbourne',
    'mornington-peninsula':                    'Melbourne',
    'geelong':                                 'Barwon South West',
    'warrnambool-and-south-west':              'Barwon South West',
    'south-australia-south-east':              'Barwon South West', // VIC slot
    'latrobe-gippsland':                       'Gippsland',         // VIC slot
    'ballarat':                                'Grampians',
    'shepparton':                              'Hume',              // VIC slot
    'hume':                                    'Hume',              // VIC slot
    'bendigo':                                 'Loddon Mallee',
    'north-west':                              'Loddon Mallee'      // VIC slot
  },
  QLD: {
    'brisbane-east':                           'Brisbane',
    'brisbane-north':                          'Brisbane',
    'brisbane-south':                          'Brisbane',
    'brisbane-west':                           'Brisbane',
    'brisbane-inner-city':                     'Brisbane',
    'logan-beaudesert':                        'Brisbane',
    'moreton-bay-south':                       'Brisbane',
    'gold-coast':                              'Gold Coast',        // QLD slot
    'sunshine-coast':                          'Sunshine Coast',
    'moreton-bay-north':                       'Sunshine Coast',
    'ipswich':                                 'Ipswich',
    'toowoomba':                               'Darling Downs',
    'darling-downs-maranoa':                   'Darling Downs',     // QLD slot
    'wide-bay':                                'Wide Bay',
    'mackay':                                  'Mackay',
    'fitzroy':                                 'Central Queensland',
    'townsville':                              'Townsville',
    'cairns':                                  'Far North Queensland',
    'queensland-outback':                      'Western Queensland',
    'northern-territory-outback':              'Western Queensland' // QLD slot
  },
  WA: {
    'perth-inner':                             'Perth',
    'perth-north-east':                        'Perth',
    'perth-north-west':                        'Perth',
    'perth-south-east':                        'Perth',
    'perth-south-west':                        'Perth',
    'other-territories':                       'Perth',             // Cocos / Christmas Island
    'mandurah':                                'Peel',
    'bunbury':                                 'South West',
    'western-australia-wheat-belt':            'Wheatbelt',
    'western-australia-outback':               'Pilbara Kimberley'
  },
  SA: {
    'adelaide-north':                          'Adelaide',
    'adelaide-south':                          'Adelaide',
    'adelaide-west':                           'Adelaide',
    'adelaide-central-and-hills':              'Adelaide',
    'barossa-yorke-mid-north':                 'Barossa Gawler Light Adelaide Plains',
    'south-australia-outback':                 'Far North',
    'south-australia-south-east':              'Limestone Coast'    // SA slot
  },
  TAS: {
    'hobart':                                  'Hobart',
    'south-east':                              'Hobart',
    'launceston-and-north-east':               'Launceston',
    'west-and-north-west':                     'North West Coast'
  },
  ACT: {
    'australian-capital-territory':            'Canberra'           // ACT slot
  },
  NT: {
    'darwin':                                  'Northern Territory',
    'northern-territory-outback':              'Northern Territory' // NT slot
  }
};

// Canonical region slug normaliser — same rules as normaliseComponent
// in api/profile-save.js and the inlined normaliseComponentLocal in
// api/shared-research-refresh.js. Reproduced here so consumers of
// this mapping can derive the slug from a region name without
// importing from a handler file. Three copies of the same shape now
// exist across the codebase; if they ever drift, region-slug round-
// trip breaks. Worth consolidating into a shared util in a future
// refactor — flagged for follow-up, not blocking.
export function normaliseRegionSlug(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Forward: (state, SA4 slug) → simple region name (e.g. "South Coast")
// or null when no mapping exists for the pair. State is uppercased
// before lookup so callers can pass either 'NSW' or 'nsw'.
export function getSimpleRegionName(state, sa4Slug) {
  if (!state || !sa4Slug) return null;
  const stateMap = SIMPLE_REGION_MAP[String(state).toUpperCase()];
  if (!stateMap) return null;
  return stateMap[sa4Slug] || null;
}

// Reverse: (state, simple-region slug) → array of SA4 slugs that map
// to that simple region under this state. Empty array when no mapping
// exists. Used by the cohort_id resolver to find a representative
// postcode under any of the SA4s that compose the simple region —
// first hit wins, every SA4 in the group is equivalent for SRL
// purposes.
export function getSa4SlugsForSimpleRegion(state, simpleRegionSlug) {
  if (!state || !simpleRegionSlug) return [];
  const stateMap = SIMPLE_REGION_MAP[String(state).toUpperCase()];
  if (!stateMap) return [];
  const out = [];
  const entries = Object.entries(stateMap);
  for (let i = 0; i < entries.length; i++) {
    const sa4Slug = entries[i][0];
    const simpleName = entries[i][1];
    if (normaliseRegionSlug(simpleName) === simpleRegionSlug) {
      out.push(sa4Slug);
    }
  }
  return out;
}
