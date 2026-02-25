const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Disable body parsing for webhooks
export const config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get raw body
  const buf = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not found');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    // Verify webhook signature using raw body
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Webhook event type:', event.type);

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      console.log('Checkout completed!');
      console.log('Session metadata:', session.metadata);
      console.log('Client reference ID:', session.client_reference_id);
      
      // Extract metadata
      const userId = session.metadata?.userId || session.client_reference_id;
      const toolId = session.metadata?.toolId;
      const toolName = session.metadata?.toolName;
      
      console.log('Extracted userId:', userId);
      console.log('Extracted toolId:', toolId);
      console.log('Extracted toolName:', toolName);
      
      if (userId && toolId) {
        console.log(`Attempting to activate ${toolId} for user ${userId}`);
        await activateTool(userId, toolId);
        console.log(`Successfully activated ${toolId} for user ${userId}`);
      } else {
        console.error('Missing userId or toolId in webhook');
      }
      break;

    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      console.log('Subscription canceled:', subscription.id);
      // TODO: Deactivate tool
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
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
    throw new Error('Supabase not configured');
  }

  console.log('Fetching current activated tools for user:', userId);

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
            console.log('Supabase response:', parsed);
            resolve(parsed[0] || {});
          } catch (e) {
            console.error('Failed to parse Supabase response:', e);
            resolve({});
          }
        });
      });

      supabaseReq.on('error', (err) => {
        console.error('Supabase request error:', err);
        reject(err);
      });
      supabaseReq.end();
    });

    // Add new tool to activated tools
    let activatedTools = userData.activated_tools || [];
    console.log('Current activated tools:', activatedTools);
    
    if (!activatedTools.includes(toolId)) {
      activatedTools.push(toolId);
      console.log('Adding tool to list. New list:', activatedTools);
    } else {
      console.log('Tool already activated');
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
        supabaseRes.on('end', () => {
          console.log('Database update response code:', supabaseRes.statusCode);
          if (supabaseRes.statusCode >= 200 && supabaseRes.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Database update failed with status ${supabaseRes.statusCode}`));
          }
        });
      });

      supabaseReq.on('error', (err) => {
        console.error('Database update error:', err);
        reject(err);
      });
      
      supabaseReq.write(updateData);
      supabaseReq.end();
    });

    console.log('Tool activation complete!');
    
  } catch (error) {
    console.error('Error in activateTool:', error);
    throw error;
  }
}
