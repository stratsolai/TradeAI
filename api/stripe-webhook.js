const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      console.log('Checkout completed:', session);
      
      // Extract metadata
      const userId = session.metadata.userId || session.client_reference_id;
      const toolId = session.metadata.toolId;
      const toolName = session.metadata.toolName;
      
      if (userId && toolId) {
        // Activate the tool for this user
        await activateTool(userId, toolId);
        console.log(`Activated ${toolId} for user ${userId}`);
      }
      break;

    case 'customer.subscription.deleted':
      // Handle subscription cancellation
      const subscription = event.data.object;
      console.log('Subscription canceled:', subscription);
      // TODO: Deactivate tool when we implement subscription management
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
};

// Activate tool for user
async function activateTool(userId, toolId) {
  const https = require('https');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing');
    return;
  }

  try {
    // Get current activated tools
    const userData = await new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
      url.searchParams.append('id', `eq.${userId}`);
      url.searchParams.append('select', 'activated_tools');

      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      };

      const supabaseReq = https.request(options, (supabaseRes) => {
        let data = '';
        supabaseRes.on('data', (chunk) => { data += chunk; });
        supabaseRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed[0] || {});
          } catch (e) {
            resolve({});
          }
        });
      });

      supabaseReq.on('error', () => resolve({}));
      supabaseReq.end();
    });

    // Add new tool to activated tools
    let activatedTools = userData.activated_tools || [];
    if (!activatedTools.includes(toolId)) {
      activatedTools.push(toolId);
    }

    // Update database
    await new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
      url.searchParams.append('id', `eq.${userId}`);

      const updateData = JSON.stringify({ activated_tools: activatedTools });

      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      };

      const supabaseReq = https.request(options, (supabaseRes) => {
        let data = '';
        supabaseRes.on('data', (chunk) => { data += chunk; });
        supabaseRes.on('end', () => resolve());
      });

      supabaseReq.on('error', reject);
      supabaseReq.write(updateData);
      supabaseReq.end();
    });

    console.log(`Successfully activated ${toolId} for user ${userId}`);
    
  } catch (error) {
    console.error('Error activating tool:', error);
  }
}
