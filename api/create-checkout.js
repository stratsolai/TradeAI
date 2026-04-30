import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const BUNDLE_PRICE_IDS = {
  stax3:    process.env.STRIPE_PRICE_STAX3    || null,
  stax6:    process.env.STRIPE_PRICE_STAX6    || null,
  'stax-all': process.env.STRIPE_PRICE_STAX_ALL || null,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { toolId, priceId, userId, tier, tools } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    let lineItems;
    let metadata = { userId };

    if (tier && tier !== 'individual') {
      // Bundle checkout — STAX3, STAX6, or STAX All
      const bundlePriceId = BUNDLE_PRICE_IDS[tier];
      if (!bundlePriceId) {
        return res.status(400).json({ error: 'Invalid or unconfigured tier: ' + tier });
      }
      lineItems = [{ price: bundlePriceId, quantity: 1 }];
      metadata.tier = tier;
      if (tools && Array.isArray(tools)) {
        metadata.tools = tools.join(',');
      }
    } else {
      // Individual tool checkout
      if (!priceId) {
        return res.status(400).json({ error: 'priceId is required for individual tool checkout' });
      }
      lineItems = [{ price: priceId, quantity: 1 }];
      metadata.toolId = toolId || null;
      metadata.tier = null;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      allow_promotion_codes: true,
      line_items: lineItems,
      client_reference_id: userId,
      metadata: metadata,
      subscription_data: { metadata: metadata },
      success_url: process.env.NEXT_PUBLIC_BASE_URL + '/dashboard.html',
      cancel_url: process.env.NEXT_PUBLIC_BASE_URL + '/pricing-page.html',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
};
