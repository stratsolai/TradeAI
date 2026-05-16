// lib/check-bp-complete.js — Business Profile completion check.
//
// Single source of truth for the 26-field BP completion check per Industry
// Taxonomy Spec v2.0 §11.2. Used by:
//   - Every tool-serving Vercel API function (server-side gate, returns
//     403 bp_incomplete when this returns false)
//   - dashboard-data.js (browser-side check that opens the BP modal on
//     dashboard load)
//
// Adding/removing fields: edit this file only. Both server and browser
// consumers will pick up the change automatically.
//
// The industry-field check (per spec §11.2.1 and §12.3) validates that
// every entry in profile.industry is a valid display label from the
// canonical lib/industry-taxonomy.js list. This catches stale labels
// (e.g. an old "Painting & Finishing" left over from the previous
// 9-grouping taxonomy) that would otherwise pass the old "≥1 entry"
// shape check.

import { INDUSTRY_TAXONOMY } from './industry-taxonomy.js';

const VALID_INDUSTRY_LABELS = new Set(
  INDUSTRY_TAXONOMY.map(function(e) { return e.displayLabel; })
);

export function isBpComplete(profile) {
  if (!profile) return false;

  function hasText(k) {
    var v = profile[k];
    if (v === null || v === undefined || v === '') return false;
    if (typeof v === 'number') return true;
    if (typeof v === 'string') return v.trim() !== '';
    return false;
  }
  function hasArr(k) {
    return Array.isArray(profile[k]) && profile[k].length > 0;
  }
  function hasJson(k) {
    var v = profile[k];
    if (Array.isArray(v) && v.length > 0) return true;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v.type && typeof v.type === 'string' && v.type.trim() !== '';
    }
    return false;
  }
  function hasValidIndustry() {
    if (!Array.isArray(profile.industry) || profile.industry.length === 0) return false;
    for (var i = 0; i < profile.industry.length; i++) {
      if (!VALID_INDUSTRY_LABELS.has(profile.industry[i])) return false;
    }
    return true;
  }

  return (
    hasText('business_name') &&
    hasText('abn') &&
    hasText('business_structure') &&
    hasValidIndustry() &&
    hasText('logo_url') &&
    hasText('years_in_business') &&
    hasText('address_name') &&
    hasText('address_street') &&
    hasText('address_suburb') &&
    hasText('address_state') &&
    hasText('address_postcode') &&
    hasArr('additional_phones') &&
    hasArr('service_area') &&
    hasJson('trading_hours') &&
    hasArr('bp_services') &&
    hasArr('bp_products') &&
    hasArr('payment_methods') &&
    hasText('response_time') &&
    hasText('warranty_info') &&
    hasText('complaints_handling') &&
    hasJson('after_hours_support') &&
    hasText('marketing_theme_differentiators') &&
    hasText('marketing_theme_awareness') &&
    hasText('marketing_theme_feeling') &&
    hasText('tone_of_voice') &&
    hasText('primary_brand_colour')
  );
}

// Browser exposure for dashboard-data.js (and any other browser-script
// consumer that wants to mirror the server gate's decision client-side).
if (typeof window !== 'undefined') {
  window.isBpComplete = isBpComplete;
}
