// lib/industry-taxonomy.js — single source of truth for the platform's
// industry taxonomy. Per Industry Taxonomy Spec v2.0 §10.
//
// Every consumer of industry data (BP Identity picker, BP Services tab,
// lib/check-bp-complete.js validation, SRL cohort composition, post-trial
// Tool Picker) reads from this file. No consumer hardcodes industry names
// or maintains a parallel list.
//
// Adding/renaming/removing entries: edit this file only. See §10.5 for
// the change-management procedure. Substitution-string-only tweaks are
// always backwards compatible (§10.6).
//
// 39 entries total (38 from spec §3.2 + the owner-approved Cleaning &
// Maintenance entry that fills the gap between the old taxonomy's
// Cleaning bucket and the v2.0 list). Cleaning & Maintenance sits in
// Group 1 between Mechanical & Appliance Repair and Real Estate Services
// — the closest semantic adjacency in that group.
//
// Each entry's `services` and `industrySpecificTools` arrays start empty.
// They are populated during Phase 8 once the owner has supplied the
// per-industry service redistribution and the tool tagging decisions.

export const GROUPS = [
  { id: 'construction-and-trades',      label: 'Construction & Trades' },
  { id: 'manufacturing-and-production', label: 'Manufacturing & Production' },
  { id: 'retail-hospitality-distribution', label: 'Retail, Hospitality & Distribution' },
  { id: 'professional-business-services', label: 'Professional & Business Services' },
  { id: 'health-community-other',       label: 'Health, Community & Other Services' }
];

export const INDUSTRY_TAXONOMY = [
  // ── Group 1 — Construction & Trades (18 entries) ──────────────────────
  { id: 'building-and-construction',           displayLabel: 'Building & Construction',           srlSubstitution: 'Building Construction',                       group: 'construction-and-trades', groupOrder: 1,  services: [], industrySpecificTools: [] },
  { id: 'plumbing-and-gas',                    displayLabel: 'Plumbing & Gas',                    srlSubstitution: 'Plumbing and Gas Services',                  group: 'construction-and-trades', groupOrder: 2,  services: [], industrySpecificTools: [] },
  { id: 'electrical-and-solar',                displayLabel: 'Electrical & Solar',                srlSubstitution: 'Electrical and Solar Services',              group: 'construction-and-trades', groupOrder: 3,  services: [], industrySpecificTools: [] },
  { id: 'hvac-and-refrigeration',              displayLabel: 'HVAC & Refrigeration',              srlSubstitution: 'HVAC and Refrigeration Services',            group: 'construction-and-trades', groupOrder: 4,  services: [], industrySpecificTools: [] },
  { id: 'concreting',                          displayLabel: 'Concreting',                        srlSubstitution: 'Concreting Services',                        group: 'construction-and-trades', groupOrder: 5,  services: [], industrySpecificTools: [] },
  { id: 'bricklaying',                         displayLabel: 'Bricklaying',                       srlSubstitution: 'Bricklaying Services',                       group: 'construction-and-trades', groupOrder: 6,  services: [], industrySpecificTools: [] },
  { id: 'carpentry',                           displayLabel: 'Carpentry',                         srlSubstitution: 'Carpentry Services',                         group: 'construction-and-trades', groupOrder: 7,  services: [], industrySpecificTools: [] },
  { id: 'painting-and-decorating',             displayLabel: 'Painting & Decorating',             srlSubstitution: 'Painting and Decorating Services',           group: 'construction-and-trades', groupOrder: 8,  services: [], industrySpecificTools: [] },
  { id: 'plastering-and-ceilings',             displayLabel: 'Plastering & Ceilings',             srlSubstitution: 'Plastering and Ceiling Services',            group: 'construction-and-trades', groupOrder: 9,  services: [], industrySpecificTools: [] },
  { id: 'tiling-and-flooring',                 displayLabel: 'Tiling & Flooring',                 srlSubstitution: 'Tiling and Flooring Services',               group: 'construction-and-trades', groupOrder: 10, services: [], industrySpecificTools: [] },
  { id: 'glazing',                             displayLabel: 'Glazing',                           srlSubstitution: 'Glazing Services',                           group: 'construction-and-trades', groupOrder: 11, services: [], industrySpecificTools: [] },
  { id: 'landscaping-and-garden-services',     displayLabel: 'Landscaping & Garden Services',     srlSubstitution: 'Landscaping and Garden Services',            group: 'construction-and-trades', groupOrder: 12, services: [], industrySpecificTools: [] },
  { id: 'outdoor-construction',                displayLabel: 'Outdoor Construction',              srlSubstitution: 'Outdoor Construction',                       group: 'construction-and-trades', groupOrder: 13, services: [], industrySpecificTools: [] },
  { id: 'fire-and-security-services',          displayLabel: 'Fire & Security Services',          srlSubstitution: 'Fire and Security Services',                 group: 'construction-and-trades', groupOrder: 14, services: [], industrySpecificTools: [] },
  { id: 'mechanical-and-appliance-repair',     displayLabel: 'Mechanical & Appliance Repair',     srlSubstitution: 'Mechanical and Appliance Repair Services',   group: 'construction-and-trades', groupOrder: 15, services: [], industrySpecificTools: [] },
  { id: 'cleaning-and-maintenance',            displayLabel: 'Cleaning & Maintenance',            srlSubstitution: 'Cleaning and Maintenance Services',          group: 'construction-and-trades', groupOrder: 16, services: [], industrySpecificTools: [] },
  { id: 'real-estate-services',                displayLabel: 'Real Estate Services',              srlSubstitution: 'Real Estate Services',                       group: 'construction-and-trades', groupOrder: 17, services: [], industrySpecificTools: [] },
  { id: 'equipment-hire',                      displayLabel: 'Equipment Hire',                    srlSubstitution: 'Equipment Hire Services',                    group: 'construction-and-trades', groupOrder: 18, services: [], industrySpecificTools: [] },

  // ── Group 2 — Manufacturing & Production (8 entries) ─────────────────
  { id: 'food-and-beverage-manufacturing',     displayLabel: 'Food & Beverage Manufacturing',     srlSubstitution: 'Food and Beverage Manufacturing',            group: 'manufacturing-and-production', groupOrder: 1, services: [], industrySpecificTools: [] },
  { id: 'metal-fabrication-and-welding',       displayLabel: 'Metal Fabrication & Welding',       srlSubstitution: 'Metal Fabrication and Welding',              group: 'manufacturing-and-production', groupOrder: 2, services: [], industrySpecificTools: [] },
  { id: 'industrial-manufacturing',            displayLabel: 'Industrial Manufacturing',          srlSubstitution: 'Industrial Manufacturing',                   group: 'manufacturing-and-production', groupOrder: 3, services: [], industrySpecificTools: [] },
  { id: 'joinery-and-wood-products',           displayLabel: 'Joinery & Wood Products',           srlSubstitution: 'Joinery Services',                           group: 'manufacturing-and-production', groupOrder: 4, services: [], industrySpecificTools: [] },
  { id: 'printing-and-signage',                displayLabel: 'Printing & Signage',                srlSubstitution: 'Printing and Signage Services',              group: 'manufacturing-and-production', groupOrder: 5, services: [], industrySpecificTools: [] },
  { id: 'farming-and-agriculture',             displayLabel: 'Farming & Agriculture',             srlSubstitution: 'Farming and Agriculture',                    group: 'manufacturing-and-production', groupOrder: 6, services: [], industrySpecificTools: [] },
  { id: 'forestry-and-logging',                displayLabel: 'Forestry & Logging',                srlSubstitution: 'Forestry and Logging',                       group: 'manufacturing-and-production', groupOrder: 7, services: [], industrySpecificTools: [] },
  { id: 'fishing-and-aquaculture',             displayLabel: 'Fishing & Aquaculture',             srlSubstitution: 'Fishing and Aquaculture',                    group: 'manufacturing-and-production', groupOrder: 8, services: [], industrySpecificTools: [] },

  // ── Group 3 — Retail, Hospitality & Distribution (5 entries) ─────────
  { id: 'retail',                              displayLabel: 'Retail',                            srlSubstitution: 'Retail',                                     group: 'retail-hospitality-distribution', groupOrder: 1, services: [], industrySpecificTools: [] },
  { id: 'hospitality',                         displayLabel: 'Hospitality',                       srlSubstitution: 'Hospitality',                                group: 'retail-hospitality-distribution', groupOrder: 2, services: [], industrySpecificTools: [] },
  { id: 'wholesale-distribution',              displayLabel: 'Wholesale Distribution',            srlSubstitution: 'Wholesale Distribution',                     group: 'retail-hospitality-distribution', groupOrder: 3, services: [], industrySpecificTools: [] },
  { id: 'freight-and-logistics',               displayLabel: 'Freight & Logistics',               srlSubstitution: 'Freight and Logistics Services',             group: 'retail-hospitality-distribution', groupOrder: 4, services: [], industrySpecificTools: [] },
  { id: 'warehousing-and-storage',             displayLabel: 'Warehousing & Storage',             srlSubstitution: 'Warehousing Services',                       group: 'retail-hospitality-distribution', groupOrder: 5, services: [], industrySpecificTools: [] },

  // ── Group 4 — Professional & Business Services (5 entries) ───────────
  { id: 'professional-scientific-and-technical-services', displayLabel: 'Professional, Scientific & Technical Services', srlSubstitution: 'Professional Services',                  group: 'professional-business-services', groupOrder: 1, services: [], industrySpecificTools: [] },
  { id: 'recruitment-and-business-support-services',      displayLabel: 'Recruitment & Business Support Services',      srlSubstitution: 'Recruitment and Business Support Services', group: 'professional-business-services', groupOrder: 2, services: [], industrySpecificTools: [] },
  { id: 'training-and-education',              displayLabel: 'Training & Education',              srlSubstitution: 'Training and Education Services',            group: 'professional-business-services', groupOrder: 3, services: [], industrySpecificTools: [] },
  { id: 'media-and-publishing',                displayLabel: 'Media & Publishing',                srlSubstitution: 'Media and Publishing',                       group: 'professional-business-services', groupOrder: 4, services: [], industrySpecificTools: [] },
  { id: 'telecommunications-and-it-services',  displayLabel: 'Telecommunications & IT Services',  srlSubstitution: 'Telecommunications and IT Services',         group: 'professional-business-services', groupOrder: 5, services: [], industrySpecificTools: [] },

  // ── Group 5 — Health, Community & Other Services (3 entries) ─────────
  { id: 'health-and-community-services',       displayLabel: 'Health & Community Services',       srlSubstitution: 'Health and Community Services',              group: 'health-community-other', groupOrder: 1, services: [], industrySpecificTools: [] },
  { id: 'arts-and-recreation',                 displayLabel: 'Arts & Recreation',                 srlSubstitution: 'Arts and Recreation Services',               group: 'health-community-other', groupOrder: 2, services: [], industrySpecificTools: [] },
  { id: 'waste-and-recycling-services',        displayLabel: 'Waste & Recycling Services',        srlSubstitution: 'Waste and Recycling Services',               group: 'health-community-other', groupOrder: 3, services: [], industrySpecificTools: [] }
];

// Convenience lookups derived from the canonical array. Consumers can use
// these or filter INDUSTRY_TAXONOMY directly — both are valid views.

export function getIndustryById(id) {
  for (var i = 0; i < INDUSTRY_TAXONOMY.length; i++) {
    if (INDUSTRY_TAXONOMY[i].id === id) return INDUSTRY_TAXONOMY[i];
  }
  return null;
}

export function getIndustryByDisplayLabel(label) {
  for (var i = 0; i < INDUSTRY_TAXONOMY.length; i++) {
    if (INDUSTRY_TAXONOMY[i].displayLabel === label) return INDUSTRY_TAXONOMY[i];
  }
  return null;
}

export function getIndustriesByGroup(groupId) {
  return INDUSTRY_TAXONOMY
    .filter(function(e) { return e.group === groupId; })
    .sort(function(a, b) { return a.groupOrder - b.groupOrder; });
}

export function getAllDisplayLabels() {
  return INDUSTRY_TAXONOMY.map(function(e) { return e.displayLabel; });
}

// Browser exposure: when this module is loaded as <script type="module">
// in dashboard.html / cl-profile.js pages, the assignments below make the
// taxonomy available as window.INDUSTRY_TAXONOMY for legacy browser-script
// consumers that don't use ESM. Node/server contexts ignore this branch.
if (typeof window !== 'undefined') {
  window.INDUSTRY_TAXONOMY = INDUSTRY_TAXONOMY;
  window.INDUSTRY_GROUPS = GROUPS;
  window.getIndustryById = getIndustryById;
  window.getIndustryByDisplayLabel = getIndustryByDisplayLabel;
  window.getIndustriesByGroup = getIndustriesByGroup;
  window.getAllIndustryDisplayLabels = getAllDisplayLabels;
}
