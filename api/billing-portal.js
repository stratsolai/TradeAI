import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[billing-portal] Request received');

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[billing-portal] STRIPE_SECRET_KEY env var is not set');
      return res.status(500).json({ error: 'Stripe is not configured on the server. Contact support.' });
    }
    if (!stripe) {
      console.error('[billing-portal] Stripe client failed to initialise');
      return res.status(500).json({ error: 'Stripe client failed to initialise.' });
    }

    var token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) {
      console.error('[billing-portal] No token provided in Authorization header');
      return res.status(401).json({ error: 'No token provided' });
    }

    var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      console.error('[billing-portal] Auth failed:', authErr && authErr.message);
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.log('[billing-portal] Authenticated user:', user.id, user.email);

    // Verify caller is account owner (not a team member)
    var { data: memberCheck, error: memberErr } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (memberErr) {
      console.error('[billing-portal] team_members lookup error:', memberErr.message);
    }
    if (memberCheck) {
      console.log('[billing-portal] Caller is a team member, blocking');
      return res.status(403).json({ error: 'Only the account owner can access billing.' });
    }

    var { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profErr) {
      console.error('[billing-portal] profiles lookup error:', profErr.message);
      return res.status(500).json({ error: 'Could not load profile: ' + profErr.message });
    }
    if (!profile) {
      console.error('[billing-portal] No profile row found for user', user.id);
      return res.status(404).json({ error: 'No profile found for this account.' });
    }
    if (!profile.stripe_customer_id) {
      console.error('[billing-portal] profile.stripe_customer_id is null/empty for user', user.id);
      return res.status(404).json({ error: 'No billing account found. Please activate a tool first.' });
    }
    console.log('[billing-portal] stripe_customer_id:', profile.stripe_customer_id);

    var returnUrl = 'https://staxai.com.au/account.html';
    console.log('[billing-portal] Creating portal session, return_url:', returnUrl);

    var session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl
    });

    console.log('[billing-portal] Portal session created:', session.id);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    var errMsg = (err && (err.message || err.raw && err.raw.message)) || String(err);
    var errType = err && err.type;
    var errCode = err && err.code;
    console.error('[billing-portal] Stripe/handler error:', errType, errCode, errMsg);
    if (err && err.stack) console.error('[billing-portal] Stack:', err.stack);
    return res.status(500).json({
      error: 'Could not create billing portal session: ' + errMsg
    });
  }
}
