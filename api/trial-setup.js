// api/trial-setup.js — Server-side trial initialiser.
//
// Called from the post-confirmation handler in login.html (verifyOtp
// block) after the user clicks their email confirmation link. The
// transient session that verifyOtp creates supplies the JWT; this
// endpoint validates it and writes the user's trial state with the
// service-role client (the trial columns sit in the profile-save
// endpoint's PROTECTED_COLUMNS deny-list, intentionally — only this
// endpoint sets them).
//
// Idempotent: a second call against the same user is a no-op. The
// guard is `trial_used = true` on the profile — once set, the
// endpoint returns success without touching the row. This lets the
// post-confirmation handler retry safely and lets the sign-in
// safety net (login.html sign-in handler) re-fire the endpoint for
// users whose post-confirmation call failed.
//
// Trial fields written:
//   - bundle_tier      = 'stax-all'
//   - is_trial         = true
//   - trial_expires_at = ~midnight AEST on day +15 (computed server-side)
//   - trial_used       = true
//   - activated_tools  = the full STAXALL list (13 tool IDs)
//
// Signup Workflow Spec v2.1 §5.2 mandates these values for every trial
// signup. The activation modal at trial end (activation-modal.js)
// supersedes them when the user picks a paid bundle/tool.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// The canonical STAXALL tool list. Mirrors STAX_ALL_TOOLS in
// dashboard-data.js — both reference Signup Workflow Spec v2.1 §6.1's
// "all 13 tools" inventory. If a tool is added/removed from the
// platform, update both places.
const STAX_ALL_TOOLS = [
  'chatbot', 'social', 'email', 'strategic-plan', 'news-digest', 'bi',
  'tender', 'quote-enhancer', 'swms', 'customer-updates',
  'handover-docs', 'review-booster', 'design-viz'
];

// Compute trial_expires_at as a UTC timestamp that lands at midnight
// AEST on day +15 from now. 14:00 UTC = 00:00 AEST = 01:00 AEDT —
// the small DST swing is immaterial for a 14-day trial. The +15-day
// arithmetic gives 14 full local-time days of trial plus the signup
// day, matching the pre-fix browser code's intent.
function computeTrialExpiresAtIso() {
  const now = new Date();
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 15,
    14, 0, 0
  ));
  return target.toISOString();
}

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

  // ── Idempotency check ────────────────────────────────────────
  const profRes = await supabase
    .from('profiles')
    .select('trial_used')
    .eq('id', userId)
    .single();
  if (profRes.error || !profRes.data) {
    console.error('[TrialSetup] Profile read failed — userId: ' + userId + ', message: ' + (profRes.error && profRes.error.message));
    return res.status(500).json({ error: 'Could not load profile' });
  }
  if (profRes.data.trial_used === true) {
    console.log('[TrialSetup] No-op — trial already initialised, userId: ' + userId);
    return res.status(200).json({ success: true, already_initialised: true });
  }

  // ── Write trial fields ───────────────────────────────────────
  const trialExpiresAt = computeTrialExpiresAtIso();
  const upd = await supabase
    .from('profiles')
    .update({
      bundle_tier: 'stax-all',
      is_trial: true,
      trial_expires_at: trialExpiresAt,
      trial_used: true,
      activated_tools: STAX_ALL_TOOLS
    })
    .eq('id', userId);
  if (upd.error) {
    console.error('[TrialSetup] Update failed — userId: ' + userId + ', message: ' + upd.error.message);
    return res.status(500).json({ error: upd.error.message });
  }

  console.log('[TrialSetup] Trial initialised — userId: ' + userId + ', expires_at: ' + trialExpiresAt);
  return res.status(200).json({
    success: true,
    already_initialised: false,
    trial_expires_at: trialExpiresAt,
    activated_tools: STAX_ALL_TOOLS,
    bundle_tier: 'stax-all'
  });
}
