// api/switch-bundle.js
// Stages a STAX3 / STAX6 bundle Stripe Checkout session with metadata
// listing existing subscriptions to cancel-at-period-end after the bundle
// is paid. The webhook handles the actual cancellation post-payment so the
// bundle activation and individual-sub teardown are atomic-ish: if the user
// abandons checkout, no cancellations happen.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BUNDLE_PRICE_IDS = {
  stax3: process.env.STRIPE_PRICE_STAX3 || null,
  stax6: process.env.STRIPE_PRICE_STAX6 || null
};
const BUNDLE_LIMITS = { stax3: 3, stax6: 6 };
const ALL_BUNDLE_PRICES = [
  process.env.STRIPE_PRICE_STAX3,
  process.env.STRIPE_PRICE_STAX6,
  process.env.STRIPE_PRICE_STAX_ALL
].filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // Block team members — only the account owner can change billing.
    const { data: memberCheck } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (memberCheck) {
      return res.status(403).json({ error: 'Only the account owner can change subscriptions.' });
    }

    const { tier, selected, retained, removed } = req.body || {};
    if (!tier || !BUNDLE_PRICE_IDS[tier]) {
      return res.status(400).json({ error: 'Invalid or missing tier (stax3 or stax6 expected)' });
    }
    if (!Array.isArray(selected) || selected.length !== BUNDLE_LIMITS[tier]) {
      return res.status(400).json({ error: 'Selected tools must equal bundle limit (' + BUNDLE_LIMITS[tier] + ')' });
    }

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();
    if (profErr) {
      console.error('[switch-bundle] profile lookup error:', profErr.message);
      return res.status(500).json({ error: 'Could not load profile' });
    }

    // Build the cancellation list. Subscriptions to mark cancel_at_period_end:
    //   - Existing bundle subscriptions (replaced by the new bundle)
    //   - Individual subs whose tool is in `selected` (now covered by bundle)
    //   - Individual subs whose tool is in `removed` (user explicit cancel)
    // Subs in `retained` are left alone — they keep running separately.
    let cancelSubIds = [];
    if (profile && profile.stripe_customer_id) {
      const subsRes = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: 'active',
        limit: 100
      });

      // priceId → toolId map for individual-sub identification
      const priceToTool = {};
      const toolPricesRes = await supabase.from('tool_prices').select('price_id, tool_id');
      (toolPricesRes.data || []).forEach(function(tp) {
        if (tp && tp.price_id && tp.tool_id) priceToTool[tp.price_id] = tp.tool_id;
      });

      const toolsToCancel = new Set([].concat(selected || [], removed || []));

      subsRes.data.forEach(function(sub) {
        const priceIds = (sub.items.data || []).map(function(it) { return it.price && it.price.id; }).filter(Boolean);
        const isBundle = priceIds.some(function(pid) { return ALL_BUNDLE_PRICES.indexOf(pid) !== -1; });
        if (isBundle) {
          // Existing bundle is being replaced
          cancelSubIds.push(sub.id);
          return;
        }
        // Individual sub — cancel only if its tool is in selected or removed
        const subTools = priceIds.map(function(pid) { return priceToTool[pid]; }).filter(Boolean);
        const shouldCancel = subTools.some(function(tid) { return toolsToCancel.has(tid); });
        if (shouldCancel) cancelSubIds.push(sub.id);
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://staxai.com.au';
    const sharedMeta = {
      userId: user.id,
      tier: tier,
      tools: selected.join(','),
      cancelSubsAfterPayment: cancelSubIds.join(',')
    };

    const sessionParams = {
      payment_method_types: ['card'],
      mode: 'subscription',
      allow_promotion_codes: true,
      client_reference_id: user.id,
      line_items: [{ price: BUNDLE_PRICE_IDS[tier], quantity: 1 }],
      metadata: sharedMeta,
      // Mirror metadata onto the resulting subscription so the
      // customer.subscription.deleted handler can read it later.
      subscription_data: {
        metadata: {
          userId: user.id,
          tier: tier,
          tools: selected.join(',')
        }
      },
      success_url: baseUrl + '/dashboard.html',
      cancel_url: baseUrl + '/dashboard.html'
    };
    if (profile && profile.stripe_customer_id) {
      sessionParams.customer = profile.stripe_customer_id;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[switch-bundle] error:', err && err.message);
    return res.status(500).json({ error: err.message || 'Could not start checkout' });
  }
}
