import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!stripe) {
      console.error('[get-subscription-prices] STRIPE_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      console.error('[get-subscription-prices] auth failed:', authErr && authErr.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profErr) {
      console.error('[get-subscription-prices] profile lookup failed:', profErr.message);
      return res.status(500).json({ error: 'Could not load profile' });
    }
    if (!profile || !profile.stripe_customer_id) {
      // Trial user with no Stripe customer yet — return empty map, not an error.
      return res.status(200).json({ prices: {} });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'active',
      limit: 100
    });

    const prices = {};
    subscriptions.data.forEach(function(sub) {
      (sub.items && sub.items.data ? sub.items.data : []).forEach(function(item) {
        const price = item.price;
        if (!price || !price.id) return;
        prices[price.id] = formatAud(price.unit_amount);
      });
    });

    return res.status(200).json({ prices: prices });
  } catch (err) {
    console.error('[get-subscription-prices] error:', err && err.message);
    return res.status(500).json({ error: 'Could not fetch subscription prices' });
  }
}

function formatAud(unitAmountCents) {
  if (typeof unitAmountCents !== 'number') return '';
  const dollars = unitAmountCents / 100;
  const formatted = dollars % 1 === 0 ? '$' + dollars : '$' + dollars.toFixed(2);
  return formatted + '/mth';
}
