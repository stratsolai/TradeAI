// lib/industry-taxonomy.js — single source of truth for the platform's
// industry taxonomy. Per Industry Taxonomy Spec v2.0 §10.
//
// Every consumer of industry data (BP Identity picker, BP Services tab,
// BP Products tab, BP Credentials tab, lib/check-bp-complete.js
// validation, SRL cohort composition, admin customer filters, post-trial
// Tool Picker) reads from this file. No consumer hardcodes industry
// names or maintains a parallel list.
//
// 39 entries (38 from spec §3.2 + the owner-approved Cleaning &
// Maintenance entry in Group 1). Heavy services/products/licences data
// lives in the sibling lib/industry-taxonomy-data.js purely to keep each
// file under the 60K platform ceiling — the two are logically one
// source. Helpers below attach the sibling's data onto each entry so
// consumers can read entry.services / entry.products / entry.licences
// directly per spec §10.2.
//
// industrySpecificTools is the same array on every entry per the owner's
// no-gating decision (spec §1.4): the four tools that read profiles.
// industry for output tailoring (chatbot, design-visualiser,
// news-digest, strategic-plan). No tool is restricted from any
// industry; the property exists only for the post-trial Tool Picker's
// "industry-relevant first" sort.

import { SERVICES, PRODUCTS, LICENCES } from './industry-taxonomy-data.js';

const STANDARD_CONTEXT_TOOLS = ['chatbot', 'design-visualiser', 'news-digest', 'strategic-plan'];

export const GROUPS = [
  { id: 'construction-and-trades',         label: 'Construction & Trades' },
  { id: 'manufacturing-and-production',    label: 'Manufacturing & Production' },
  { id: 'retail-hospitality-distribution', label: 'Retail, Hospitality & Distribution' },
  { id: 'professional-business-services',  label: 'Professional & Business Services' },
  { id: 'health-community-other',          label: 'Health, Community & Other Services' }
];

const METADATA = [
  // ── Group 1 — Construction & Trades (18 entries) ──────────────────────
  { id: 'building-and-construction',           displayLabel: 'Building & Construction',           srlSubstitution: ['Building Construction'],                       group: 'construction-and-trades', groupOrder: 1  },
  { id: 'plumbing-and-gas',                    displayLabel: 'Plumbing & Gas',                    srlSubstitution: ['commercial plumbing', 'commercial gas services'], group: 'construction-and-trades', groupOrder: 2  },
  { id: 'electrical-and-solar',                displayLabel: 'Electrical & Solar',                srlSubstitution: ['Electrical and Solar Services'],              group: 'construction-and-trades', groupOrder: 3  },
  { id: 'hvac-and-refrigeration',              displayLabel: 'HVAC & Refrigeration',              srlSubstitution: ['HVAC and Refrigeration Services'],            group: 'construction-and-trades', groupOrder: 4  },
  { id: 'concreting',                          displayLabel: 'Concreting',                        srlSubstitution: ['Concreting Services'],                        group: 'construction-and-trades', groupOrder: 5  },
  { id: 'bricklaying',                         displayLabel: 'Bricklaying',                       srlSubstitution: ['Bricklaying Services'],                       group: 'construction-and-trades', groupOrder: 6  },
  { id: 'carpentry',                           displayLabel: 'Carpentry',                         srlSubstitution: ['Carpentry Services'],                         group: 'construction-and-trades', groupOrder: 7  },
  { id: 'painting-and-decorating',             displayLabel: 'Painting & Decorating',             srlSubstitution: ['Painting and Decorating Services'],           group: 'construction-and-trades', groupOrder: 8  },
  { id: 'plastering-and-ceilings',             displayLabel: 'Plastering & Ceilings',             srlSubstitution: ['Plastering and Ceiling Services'],            group: 'construction-and-trades', groupOrder: 9  },
  { id: 'tiling-and-flooring',                 displayLabel: 'Tiling & Flooring',                 srlSubstitution: ['Tiling and Flooring Services'],               group: 'construction-and-trades', groupOrder: 10 },
  { id: 'glazing',                             displayLabel: 'Glazing',                           srlSubstitution: ['Glazing Services'],                           group: 'construction-and-trades', groupOrder: 11 },
  { id: 'landscaping-and-garden-services',     displayLabel: 'Landscaping & Garden Services',     srlSubstitution: ['commercial landscaping industry', 'garden maintenance services'], group: 'construction-and-trades', groupOrder: 12 },
  { id: 'outdoor-construction',                displayLabel: 'Outdoor Construction',              srlSubstitution: ['Outdoor Construction'],                       group: 'construction-and-trades', groupOrder: 13 },
  { id: 'fire-and-security-services',          displayLabel: 'Fire & Security Services',          srlSubstitution: ['Fire and Security Services'],                 group: 'construction-and-trades', groupOrder: 14 },
  { id: 'mechanical-and-appliance-repair',     displayLabel: 'Mechanical & Appliance Repair',     srlSubstitution: ['Mechanical and Appliance Repair Services'],   group: 'construction-and-trades', groupOrder: 15 },
  { id: 'cleaning-and-maintenance',            displayLabel: 'Cleaning & Maintenance',            srlSubstitution: ['Cleaning and Maintenance Services'],          group: 'construction-and-trades', groupOrder: 16 },
  { id: 'real-estate-services',                displayLabel: 'Real Estate Services',              srlSubstitution: ['Real Estate Services'],                       group: 'construction-and-trades', groupOrder: 17 },
  { id: 'equipment-hire',                      displayLabel: 'Equipment Hire',                    srlSubstitution: ['Equipment Hire Services'],                    group: 'construction-and-trades', groupOrder: 18 },

  // ── Group 2 — Manufacturing & Production (8 entries) ─────────────────
  { id: 'food-and-beverage-manufacturing',     displayLabel: 'Food & Beverage Manufacturing',     srlSubstitution: ['Food and Beverage Manufacturing'],            group: 'manufacturing-and-production', groupOrder: 1 },
  { id: 'metal-fabrication-and-welding',       displayLabel: 'Metal Fabrication & Welding',       srlSubstitution: ['Metal Fabrication and Welding'],              group: 'manufacturing-and-production', groupOrder: 2 },
  { id: 'industrial-manufacturing',            displayLabel: 'Industrial Manufacturing',          srlSubstitution: ['Industrial Manufacturing'],                   group: 'manufacturing-and-production', groupOrder: 3 },
  { id: 'joinery-and-wood-products',           displayLabel: 'Joinery & Wood Products',           srlSubstitution: ['Joinery Services'],                           group: 'manufacturing-and-production', groupOrder: 4 },
  { id: 'printing-and-signage',                displayLabel: 'Printing & Signage',                srlSubstitution: ['Printing and Signage Services'],              group: 'manufacturing-and-production', groupOrder: 5 },
  { id: 'farming-and-agriculture',             displayLabel: 'Farming & Agriculture',             srlSubstitution: ['Farming and Agriculture'],                    group: 'manufacturing-and-production', groupOrder: 6 },
  { id: 'forestry-and-logging',                displayLabel: 'Forestry & Logging',                srlSubstitution: ['Forestry and Logging'],                       group: 'manufacturing-and-production', groupOrder: 7 },
  { id: 'fishing-and-aquaculture',             displayLabel: 'Fishing & Aquaculture',             srlSubstitution: ['Fishing and Aquaculture'],                    group: 'manufacturing-and-production', groupOrder: 8 },

  // ── Group 3 — Retail, Hospitality & Distribution (5 entries) ─────────
  { id: 'retail',                              displayLabel: 'Retail',                            srlSubstitution: ['Retail'],                                     group: 'retail-hospitality-distribution', groupOrder: 1 },
  { id: 'hospitality',                         displayLabel: 'Hospitality',                       srlSubstitution: ['Hospitality'],                                group: 'retail-hospitality-distribution', groupOrder: 2 },
  { id: 'wholesale-distribution',              displayLabel: 'Wholesale Distribution',            srlSubstitution: ['Wholesale Distribution'],                     group: 'retail-hospitality-distribution', groupOrder: 3 },
  { id: 'freight-and-logistics',               displayLabel: 'Freight & Logistics',               srlSubstitution: ['Freight and Logistics Services'],             group: 'retail-hospitality-distribution', groupOrder: 4 },
  { id: 'warehousing-and-storage',             displayLabel: 'Warehousing & Storage',             srlSubstitution: ['Warehousing Services'],                       group: 'retail-hospitality-distribution', groupOrder: 5 },

  // ── Group 4 — Professional & Business Services (5 entries) ───────────
  { id: 'professional-scientific-and-technical-services', displayLabel: 'Professional, Scientific & Technical Services', srlSubstitution: ['Professional Services'],                  group: 'professional-business-services', groupOrder: 1 },
  { id: 'recruitment-and-business-support-services',      displayLabel: 'Recruitment & Business Support Services',      srlSubstitution: ['Recruitment and Business Support Services'], group: 'professional-business-services', groupOrder: 2 },
  { id: 'training-and-education',              displayLabel: 'Training & Education',              srlSubstitution: ['Training and Education Services'],            group: 'professional-business-services', groupOrder: 3 },
  { id: 'media-and-publishing',                displayLabel: 'Media & Publishing',                srlSubstitution: ['Media and Publishing'],                       group: 'professional-business-services', groupOrder: 4 },
  { id: 'telecommunications-and-it-services',  displayLabel: 'Telecommunications & IT Services',  srlSubstitution: ['Telecommunications and IT Services'],         group: 'professional-business-services', groupOrder: 5 },

  // ── Group 5 — Health, Community & Other Services (3 entries) ─────────
  { id: 'health-and-community-services',       displayLabel: 'Health & Community Services',       srlSubstitution: ['Health and Community Services'],              group: 'health-community-other', groupOrder: 1 },
  { id: 'arts-and-recreation',                 displayLabel: 'Arts & Recreation',                 srlSubstitution: ['Arts and Recreation Services'],               group: 'health-community-other', groupOrder: 2 },
  { id: 'waste-and-recycling-services',        displayLabel: 'Waste & Recycling Services',        srlSubstitution: ['Waste and Recycling Services'],               group: 'health-community-other', groupOrder: 3 }
];

// Attach services/products/licences/industrySpecificTools to each entry
// so consumers can read entry.services etc. directly per spec §10.2.
// Empty-object fallbacks keep consumers safe if a new entry is added to
// METADATA before its data lands in the sibling file.
export const INDUSTRY_TAXONOMY = METADATA.map(function(e) {
  return {
    id: e.id,
    displayLabel: e.displayLabel,
    srlSubstitution: e.srlSubstitution,
    group: e.group,
    groupOrder: e.groupOrder,
    services: SERVICES[e.id] || {},
    products: PRODUCTS[e.id] || {},
    licences: LICENCES[e.id] || {},
    industrySpecificTools: STANDARD_CONTEXT_TOOLS
  };
});

// Runtime assert — every entry's srlSubstitution must be a non-empty
// array of non-empty trimmed strings. Catches regressions where someone
// reverts an entry to the old single-string format (which would silently
// produce a literal one-character query per character once the SRL plan
// layer's for...of consumed it as a string). Throws at module load on
// the server side so the misconfiguration surfaces in Vercel logs at
// deploy time, not at first query.
(function assertSubstitutions() {
  for (var i = 0; i < INDUSTRY_TAXONOMY.length; i++) {
    var e = INDUSTRY_TAXONOMY[i];
    if (!Array.isArray(e.srlSubstitution)) {
      throw new Error('[industry-taxonomy] srlSubstitution must be an array — got ' + (typeof e.srlSubstitution) + ' for id ' + e.id);
    }
    if (e.srlSubstitution.length === 0) {
      throw new Error('[industry-taxonomy] srlSubstitution array is empty for id ' + e.id);
    }
    for (var j = 0; j < e.srlSubstitution.length; j++) {
      var s = e.srlSubstitution[j];
      if (typeof s !== 'string' || s.trim() === '') {
        throw new Error('[industry-taxonomy] srlSubstitution[' + j + '] must be a non-empty string for id ' + e.id + ' — got ' + JSON.stringify(s));
      }
    }
  }
})();

// ── BP form options (formerly in bp-industry-data.js) ────────────────
// Non-industry-keyed form options consumed by the BP Services, Products,
// and Credentials tabs. Relocated to lib/industry-taxonomy.js so the
// whole BP picker surface reads from one source per spec §9.2.

export const pricingTypes = [
  { value: 'hourly', label: 'Hourly Rate' },
  { value: 'fixed',  label: 'Fixed Price' },
  { value: 'range',  label: 'Price Range' },
  { value: 'quote',  label: 'Quote Required' }
];

export const serviceAreaOptions = [
  'Local (under 25km)', 'Regional (25-100km)', 'State-wide', 'National', 'International'
];

export const paymentMethodOptions = [
  'Cash', 'Bank Transfer / EFT', 'Credit Card', 'Debit Card', 'EFTPOS',
  'PayPal', 'Afterpay / Zip Pay', 'Invoice (payment terms)'
];

export const responseTimeOptions = [
  'Same day', 'Within 24 hours', 'Within 48 hours', 'Within 1 week', 'Varies — contact us'
];

export const afterHoursOptions = ['Not available', 'Emergency only', 'Available'];

// ── Lookup helpers ───────────────────────────────────────────────────

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

// ── Merge helpers ────────────────────────────────────────────────────
// Replaces bp-industry-data.js's _mergeGrouped / getMergedServices /
// getMergedProducts / getMergedLicences. Same contract:
//   input  — an array of industry display labels (e.g.
//            ['Plumbing & Gas', 'Building & Construction'])
//   output — an ordered array of { name, items[A-Z] } sub-groups, with
//            sub-groups sharing a name across industries coalesced and
//            their items deduplicated. The picker uses this output
//            directly via _renderAccordionGroups in cl-profile.js.

function mergeGrouped(industries, dataKey) {
  if (!Array.isArray(industries)) industries = [industries];
  var data = dataKey === 'services' ? SERVICES : dataKey === 'products' ? PRODUCTS : LICENCES;
  var merged = {};
  var order = [];
  var seen = {};
  for (var i = 0; i < industries.length; i++) {
    var entry = getIndustryByDisplayLabel(industries[i]);
    if (!entry) continue;
    var groups = data[entry.id] || {};
    for (var groupName in groups) {
      if (!Object.prototype.hasOwnProperty.call(groups, groupName)) continue;
      if (!merged[groupName]) {
        merged[groupName] = [];
        order.push(groupName);
      }
      var list = groups[groupName];
      for (var j = 0; j < list.length; j++) {
        var key = groupName + '|' + list[j];
        if (!seen[key]) { seen[key] = true; merged[groupName].push(list[j]); }
      }
    }
  }
  return order.map(function(name) {
    return { name: name, items: merged[name].slice().sort(function(a, b) { return a.localeCompare(b); }) };
  });
}

export function getMergedServices(industries) { return mergeGrouped(industries, 'services'); }
export function getMergedProducts(industries) { return mergeGrouped(industries, 'products'); }
export function getMergedLicences(industries) { return mergeGrouped(industries, 'licences'); }

// ── Browser globals ──────────────────────────────────────────────────
// When this module is loaded as <script type="module"> in dashboard.html
// / content-library.html / admin.html, the assignments below expose the
// taxonomy and helpers to legacy browser-script consumers that don't use
// ESM. Node/server contexts ignore this branch.
if (typeof window !== 'undefined') {
  window.INDUSTRY_TAXONOMY = INDUSTRY_TAXONOMY;
  window.INDUSTRY_GROUPS = GROUPS;
  window.getIndustryById = getIndustryById;
  window.getIndustryByDisplayLabel = getIndustryByDisplayLabel;
  window.getIndustriesByGroup = getIndustriesByGroup;
  window.getAllIndustryDisplayLabels = getAllDisplayLabels;
  window.getMergedServices = getMergedServices;
  window.getMergedProducts = getMergedProducts;
  window.getMergedLicences = getMergedLicences;
  window.BP_PRICING_TYPES = pricingTypes;
  window.BP_SERVICE_AREA_OPTIONS = serviceAreaOptions;
  window.BP_PAYMENT_METHOD_OPTIONS = paymentMethodOptions;
  window.BP_RESPONSE_TIME_OPTIONS = responseTimeOptions;
  window.BP_AFTER_HOURS_OPTIONS = afterHoursOptions;
}
