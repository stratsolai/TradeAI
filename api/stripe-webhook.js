import Stripe from 'stripe';
import https from 'https';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
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
      const tier = session.metadata?.tier;
      const toolName = session.metadata?.toolName;

      console.log('Extracted userId:', userId);
      console.log('Extracted toolId:', toolId);
      console.log('Extracted tier:', tier);
      console.log('Extracted toolName:', toolName);

      if (!userId) {
        console.error('Missing userId in webhook session metadata');
        break;
      }

      // Mark trial → paid and record stripe_customer_id. Runs for both
      // bundle and single-tool purchases.
      await confirmSubscription(session);

      // For single-tool purchases, append the tool to activated_tools.
      // Bundle tools are pre-set in subscribe-confirm.html before checkout.
      if (toolId) {
        try {
          console.log('Adding tool to activated_tools:', toolId);
          await activateTool(userId, toolId);
        } catch (e) {
          console.error('activateTool failed:', e && e.message);
        }
      }
      break;

    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      console.log('Subscription deleted:', subscription.id);
      console.log('Subscription metadata:', subscription.metadata);
      try {
        await deactivateSubscription(subscription);
      } catch (e) {
        console.error('deactivateSubscription failed:', e && e.message);
      }
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
};

// Activate tool for user

async function confirmSubscription(session) {
  try {
    var meta = session.metadata || {};
    var userId = meta.userId || session.client_reference_id;
    var tier = meta.tier || null;
    if (!userId) {
      console.error("confirmSubscription: no userId in session metadata");
      return;
    }
    // Only write bundle_tier when this is a bundle purchase. For an
    // individual tool purchase (tier null/undefined) leave the column
    // alone — otherwise we'd wipe an existing bundle a user already has.
    var updatePayload = {
      is_trial: false,
      trial_expires_at: null,
      stripe_customer_id: session.customer || null
    };
    if (tier) {
      updatePayload.bundle_tier = tier;
    }
    var res = await fetch(
      process.env.SUPABASE_URL + "/rest/v1/profiles?id=eq." + userId,
      {
        method: "PATCH",
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": "Bearer " + process.env.SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(updatePayload)
      }
    );
    if (!res.ok) {
      var errText = await res.text();
      console.error("confirmSubscription PATCH failed:", res.status, errText);
    } else {
      console.log("confirmSubscription: profiles updated for userId", userId, "tier", tier);
    }
  } catch (err) {
    console.error("confirmSubscription error:", err);
  }
}

async function activateTool(userId, toolId) {
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

// Remove tools from a user's activated_tools when their subscription is
// deleted in Stripe. Reads userId/toolId/tier/tools from
// subscription.metadata (which requires create-checkout.js to pass
// subscription_data.metadata when creating the checkout session — see
// note in PR for the companion change).
async function deactivateSubscription(subscription) {
  const meta = subscription.metadata || {};
  let userId = meta.userId;
  const toolId = meta.toolId;
  const tier = meta.tier;
  const toolsCsv = meta.tools;

  console.log('deactivateSubscription metadata:', { userId, toolId, tier, toolsCsv });

  if (!userId) {
    console.log('No userId in subscription metadata; looking up by stripe_customer_id', subscription.customer);
    userId = await lookupUserByCustomerId(subscription.customer);
  }
  if (!userId) {
    console.error('deactivateSubscription: cannot determine userId, skipping', subscription.id);
    return;
  }

  // Fetch current activated_tools
  const profileRes = await fetch(
    process.env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId + '&select=activated_tools',
    {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
      }
    }
  );
  if (!profileRes.ok) {
    console.error('deactivateSubscription: profile fetch failed', profileRes.status, await profileRes.text());
    return;
  }
  const profileData = await profileRes.json();
  const current = (profileData[0] && Array.isArray(profileData[0].activated_tools)) ? profileData[0].activated_tools : [];
  let updated = current.slice();

  if (toolId) {
    // Single tool subscription — remove just that tool
    updated = updated.filter(function(t) { return t !== toolId; });
    console.log('Removing single tool', toolId, 'for user', userId);
  } else if (tier === 'stax-all') {
    updated = [];
    console.log('Removing all tools (stax-all canceled) for user', userId);
  } else if (tier === 'stax3' || tier === 'stax6') {
    if (toolsCsv) {
      const tools = toolsCsv.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
      updated = updated.filter(function(t) { return tools.indexOf(t) === -1; });
      console.log('Removing bundle tools', tools, '(' + tier + ') for user', userId);
    } else {
      console.warn('No tools list in metadata for tier', tier, '— clearing all activated_tools');
      updated = [];
    }
  } else {
    console.error('deactivateSubscription: no toolId or tier in metadata; skipping', subscription.id);
    return;
  }

  const patchPayload = { activated_tools: updated };
  if (updated.length === 0) {
    patchPayload.bundle_tier = null;
  }

  const patchRes = await fetch(
    process.env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId,
    {
      method: 'PATCH',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(patchPayload)
    }
  );
  if (!patchRes.ok) {
    const errText = await patchRes.text();
    console.error('deactivateSubscription PATCH failed:', patchRes.status, errText);
  } else {
    console.log('deactivateSubscription: profiles updated for user', userId, '— now', updated.length, 'tools');
  }
}

async function lookupUserByCustomerId(customerId) {
  if (!customerId) return null;
  try {
    const res = await fetch(
      process.env.SUPABASE_URL + '/rest/v1/profiles?stripe_customer_id=eq.' + encodeURIComponent(customerId) + '&select=id',
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
        }
      }
    );
    if (!res.ok) {
      console.error('lookupUserByCustomerId failed:', res.status);
      return null;
    }
    const rows = await res.json();
    return rows && rows[0] ? rows[0].id : null;
  } catch (err) {
    console.error('lookupUserByCustomerId error:', err);
    return null;
  }
}
