// api/get-user-subscriptions.js
// Lists the user's active Stripe subscriptions, tagged as bundle (with tier)
// or individual (tier=null). Used by tools-auth.html to know which tools are
// backed by individual subs (offering retain/remove on deselect) vs by an
// existing bundle.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BUNDLE_PRICE_TO_TIER = {};
if (process.env.STRIPE_PRICE_STAX3) BUNDLE_PRICE_TO_TIER[process.env.STRIPE_PRICE_STAX3] = 'stax3';
if (process.env.STRIPE_PRICE_STAX6) BUNDLE_PRICE_TO_TIER[process.env.STRIPE_PRICE_STAX6] = 'stax6';
if (process.env.STRIPE_PRICE_STAX_ALL) BUNDLE_PRICE_TO_TIER[process.env.STRIPE_PRICE_STAX_ALL] = 'stax-all';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // Resolve account owner — billing lives on the owner's profile.
    let ownerId = user.id;
    const { data: team } = await supabase
      .from('team_members')
      .select('account_owner_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (team && team.account_owner_id) ownerId = team.account_owner_id;

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', ownerId)
      .single();
    if (profErr || !profile) {
      console.error('[get-user-subscriptions] profile lookup failed:', profErr && profErr.message);
      return res.status(200).json({ subscriptions: [] });
    }
    if (!profile.stripe_customer_id) {
      // Trial user with no Stripe customer yet → no subs.
      return res.status(200).json({ subscriptions: [] });
    }

    const subsRes = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'active',
      limit: 100
    });

    const subscriptions = subsRes.data.map(function(sub) {
      const items = (sub.items && sub.items.data) ? sub.items.data : [];
      const priceIds = items.map(function(it) { return it.price && it.price.id; }).filter(Boolean);
      let tier = null;
      for (let i = 0; i < priceIds.length; i++) {
        if (BUNDLE_PRICE_TO_TIER[priceIds[i]]) { tier = BUNDLE_PRICE_TO_TIER[priceIds[i]]; break; }
      }
      return {
        subscription_id: sub.id,
        status: sub.status,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        priceIds: priceIds,
        tier: tier  // null for individual; 'stax3' | 'stax6' | 'stax-all' for bundle
      };
    });

    return res.status(200).json({ subscriptions });
  } catch (err) {
    console.error('[get-user-subscriptions] error:', err && err.message);
    return res.status(500).json({ error: 'Could not list subscriptions' });
  }
}
