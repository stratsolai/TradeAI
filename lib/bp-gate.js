// lib/bp-gate.js — server-side Business Profile completion gate.
//
// Wraps the lib/check-bp-complete.js predicate with the profile fetch and
// the standardised 403 response per Industry Taxonomy Spec v2.0 §11.5.
// Every tool-serving Vercel function calls this immediately after auth
// succeeds and before any business logic runs.
//
// Usage:
//   const profile = await requireBpComplete(supabase, user.id, res);
//   if (!profile) return;
//   // ... profile is the full row; the caller can reuse it for its own
//   // queries instead of re-fetching.

import { isBpComplete } from './check-bp-complete.js';

export async function requireBpComplete(supabase, userId, res) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !profile || !isBpComplete(profile)) {
    res.status(403).json({
      error: 'bp_incomplete',
      message: 'Complete your Business Profile to use this tool.'
    });
    return null;
  }
  return profile;
}
