// api/signup-pending-write.js — Server-side write for signup_pending.
//
// Called by the signup form in login.html immediately after a
// successful supabase.auth.signUp(). Under email confirmation,
// signUp returns no session (session: null), so there is no JWT
// available. Authentication uses the service-role client plus a
// three-part validation against auth.users:
//   1. user_id exists in auth.users
//   2. user is not yet email-confirmed (email_confirmed_at IS NULL)
//   3. user was created in the last RECENT_SIGNUP_WINDOW_MS
// All three must hold or the request is rejected. This prevents
// arbitrary callers from overwriting the signup_pending row of
// other users (user_id is a UUID, hard to guess, but the validation
// triple is defence in depth).
//
// The RLS INSERT policy on signup_pending stays in place — service
// role bypasses RLS, but the policy remains relevant if a future
// caller authenticates as the user with a JWT (e.g., an admin tool).
//
// Idempotent: ON CONFLICT user_id DO UPDATE. Multiple signup-form
// submissions for the same user_id (e.g. a retry after a transient
// network error on the first call) result in the latest row
// winning, not stacked rows.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const RECENT_SIGNUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Request body must be an object' });
  }

  const userId = body.user_id;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'user_id is required' });
  }

  // ── Validation triple ───────────────────────────────────────
  let user;
  try {
    const lookup = await supabase.auth.admin.getUserById(userId);
    if (lookup.error || !lookup.data || !lookup.data.user) {
      console.error('[SignupPendingWrite] user lookup failed — user_id:', userId, 'message:', lookup.error && lookup.error.message);
      return res.status(404).json({ error: 'User not found' });
    }
    user = lookup.data.user;
  } catch (e) {
    console.error('[SignupPendingWrite] user lookup exception — user_id:', userId, 'message:', e && e.message);
    return res.status(500).json({ error: 'User lookup failed' });
  }

  if (user.email_confirmed_at) {
    console.error('[SignupPendingWrite] user already confirmed — user_id:', userId);
    return res.status(403).json({ error: 'User is already email-confirmed' });
  }

  const createdAtMs = user.created_at ? new Date(user.created_at).getTime() : 0;
  if (!createdAtMs || Number.isNaN(createdAtMs)) {
    console.error('[SignupPendingWrite] user created_at unparseable — user_id:', userId);
    return res.status(403).json({ error: 'User signup window cannot be verified' });
  }
  if (Date.now() - createdAtMs > RECENT_SIGNUP_WINDOW_MS) {
    console.error('[SignupPendingWrite] user signup window expired — user_id:', userId, 'created_at:', user.created_at);
    return res.status(403).json({ error: 'Signup window has expired' });
  }

  // ── Build row ───────────────────────────────────────────────
  const row = {
    user_id: userId,
    business_name: typeof body.business_name === 'string' && body.business_name.trim() ? body.business_name.trim() : null,
    phone: typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null,
    signup_path: typeof body.signup_path === 'string' && body.signup_path.trim() ? body.signup_path.trim() : null,
    post_action: typeof body.post_action === 'string' && body.post_action.trim() ? body.post_action.trim() : null,
    industries: Array.isArray(body.industries) ? body.industries.filter(function(i) { return typeof i === 'string' && i.trim(); }) : null
  };
  // Coerce empty industries array to null so the column reads
  // identically whether industries was missing or empty.
  if (row.industries && row.industries.length === 0) row.industries = null;

  // ── Upsert ──────────────────────────────────────────────────
  const upsertRes = await supabase
    .from('signup_pending')
    .upsert(row, { onConflict: 'user_id' });

  if (upsertRes.error) {
    console.error('[SignupPendingWrite] upsert failed — user_id:', userId, 'message:', upsertRes.error.message);
    return res.status(500).json({ error: upsertRes.error.message });
  }

  console.log('[SignupPendingWrite] wrote row — user_id: ' + userId + ', signup_path: ' + (row.signup_path || '(none)') + ', has_post_action: ' + !!row.post_action);
  return res.status(200).json({ success: true });
}
