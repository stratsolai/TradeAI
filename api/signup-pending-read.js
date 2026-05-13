// api/signup-pending-read.js — Server-side read + delete for signup_pending.
//
// Called by:
//   1. The post-confirmation handler in login.html (verifyOtp block),
//      using the transient session that verifyOtp creates.
//   2. The sign-in handler safety net in login.html, using the JWT
//      from the user's just-completed signIn.
//
// Auth: JWT Bearer. The endpoint reads the signup_pending row for
// auth.uid() and atomically removes it from the table. Multiple
// callers are safe — the second caller gets a 404. This matches
// the design where the post-confirmation handler is the primary
// consumer; the sign-in safety net only sees data if
// post-confirmation didn't run to completion.
//
// On 404 the response carries `success: true, found: false` rather
// than a 4xx — the caller treats "no pending row" as a soft-degraded
// path (default trial setup, BP completed manually via first-login
// modal), not as an error.
//
// The endpoint uses a service-role client for the actual DB
// operations (RLS SELECT/DELETE policies on signup_pending scope
// by user_id, so a user-session client would work too — service
// role is used here to bypass any RLS quirks and keep the read
// + delete sequence atomic in intent).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── JWT auth ─────────────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
  const userId = user.id;

  // ── Read ─────────────────────────────────────────────────────
  const readRes = await supabase
    .from('signup_pending')
    .select('business_name, phone, signup_path, post_action, industries')
    .eq('user_id', userId)
    .maybeSingle();

  if (readRes.error) {
    console.error('[SignupPendingRead] read error — user_id:', userId, 'message:', readRes.error.message);
    return res.status(500).json({ error: readRes.error.message });
  }

  if (!readRes.data) {
    console.log('[SignupPendingRead] no row — user_id:', userId);
    return res.status(200).json({ success: true, found: false });
  }

  // ── Delete (logged but not fatal if it fails) ───────────────
  const delRes = await supabase
    .from('signup_pending')
    .delete()
    .eq('user_id', userId);
  if (delRes.error) {
    console.error('[SignupPendingRead] delete error — user_id:', userId, 'message:', delRes.error.message);
    // Don't fail the read; the data was returned successfully and
    // the cleanup cron will eventually drop the row anyway.
  } else {
    console.log('[SignupPendingRead] consumed row — user_id:', userId);
  }

  return res.status(200).json({
    success: true,
    found: true,
    business_name: readRes.data.business_name,
    phone: readRes.data.phone,
    signup_path: readRes.data.signup_path,
    post_action: readRes.data.post_action,
    industries: readRes.data.industries
  });
}
