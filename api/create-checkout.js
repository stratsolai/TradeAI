const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { priceId, userId, toolId, toolName } = req.body;

  if (!priceId || !userId || !toolId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${req.headers.origin || 'https://trade-ai-seven-blue.vercel.app'}/dashboard.html?success=true&tool=${toolId}`,
      cancel_url: `${req.headers.origin || 'https://trade-ai-seven-blue.vercel.app'}/dashboard.html?canceled=true`,
      metadata: {
        userId: userId,
        toolId: toolId,
        toolName: toolName
      },
      client_reference_id: userId,
    });

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
