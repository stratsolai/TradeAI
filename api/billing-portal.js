import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // Verify caller is account owner
    var { data: memberCheck } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (memberCheck) {
      return res.status(403).json({ error: 'Only the account owner can access billing.' });
    }

    var { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profErr || !profile || !profile.stripe_customer_id) {
      return res.status(404).json({ error: 'No billing account found. Please activate a tool first.' });
    }

    var session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: process.env.VERCEL_URL
        ? 'https://' + process.env.VERCEL_URL + '/account.html'
        : 'https://staxai.com.au/account.html'
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[billing-portal] Error:', err.message || err);
    return res.status(500).json({ error: 'Could not create billing portal session. Please try again.' });
  }
}
