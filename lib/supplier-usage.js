// lib/supplier-usage.js — supplier base-cost + live-usage writers
//
// Some suppliers (Vercel, Supabase) charge a flat monthly subscription
// rather than per-call usage we can attribute via the per-call helpers
// in lib/usage-logger.js. For those, this module ensures a single
// api_usage row exists per period containing the base subscription
// cost so the Admin Profitability supplier cards stop showing $0.
//
// Where a supplier exposes queryable usage data (Supabase database
// size, storage bytes), this module also surfaces it as a payload
// the admin endpoint can return alongside the cost row.

const SUBSCRIPTIONS_AUD = {
  // Vercel Pro: USD $20 per member per month → AUD ~$30. The owner
  // can edit this if the team scales to multiple members. Overage
  // (function execution, bandwidth) requires manual entry — Vercel
  // does not publish a public billing-usage API.
  vercel: { monthly: 30, plan: 'Pro' },
  // Supabase Pro: USD $25 per project per month → AUD ~$38. Database
  // and storage egress overages are billed separately and would
  // require manual entry once they kick in.
  supabase: { monthly: 38, plan: 'Pro' },
};

function currentPeriod() {
  const now = new Date();
  return now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
}

// Ensure a 'subscription' row exists for the given provider in the
// current period. Looks up an existing row tagged with our auto-log
// note before inserting so this can run on every admin page load
// without producing duplicates.
async function ensureSubscriptionRow(supabase, provider) {
  const cfg = SUBSCRIPTIONS_AUD[provider];
  if (!cfg) return null;
  const period = currentPeriod();
  const note = 'auto-subscription | ' + cfg.plan;

  try {
    const found = await supabase
      .from('api_usage')
      .select('id, cost_estimate')
      .eq('provider', provider)
      .eq('period', period)
      .eq('notes', note)
      .maybeSingle();
    if (found.data && found.data.id) return { existed: true, row_id: found.data.id, cost: found.data.cost_estimate };

    const insert = await supabase
      .from('api_usage')
      .insert({
        provider: provider,
        period: period,
        usage_value: '1',
        cost_estimate: cfg.monthly,
        notes: note,
        entered_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insert.error) {
      console.error('[supplier-usage] insert error:', provider, insert.error.message);
      return null;
    }
    return { existed: false, row_id: insert.data.id, cost: cfg.monthly };
  } catch (e) {
    console.error('[supplier-usage] ensureSubscriptionRow error:', provider, e && e.message);
    return null;
  }
}

export async function ensureVercelBaseCost(supabase) {
  return ensureSubscriptionRow(supabase, 'vercel');
}

export async function ensureSupabaseBaseCost(supabase) {
  return ensureSubscriptionRow(supabase, 'supabase');
}

// Read the Supabase project's current database size and storage size.
// Database size comes from pg_database_size; storage is summed across
// all storage.objects rows. Returns bytes (or null on failure).
export async function readSupabaseUsage(supabase) {
  let dbBytes = null;
  let storageBytes = null;

  try {
    // pg_database_size requires an RPC since the supabase JS client
    // doesn't expose raw SQL. We assume an RPC named 'get_db_size'
    // exists; if not, the call returns an error and we fall through.
    const dbRes = await supabase.rpc('get_db_size');
    if (!dbRes.error && typeof dbRes.data === 'number') {
      dbBytes = dbRes.data;
    } else if (!dbRes.error && dbRes.data && typeof dbRes.data.size === 'number') {
      dbBytes = dbRes.data.size;
    }
  } catch (e) {
    // RPC not present — skip DB size silently.
  }

  try {
    // Sum bytes across the storage.objects table. The `metadata` column
    // contains a JSONB object with a `size` field (bytes) for each
    // object — same shape Supabase Studio uses.
    const sumRes = await supabase
      .from('storage.objects')
      .select('metadata')
      .limit(10000);
    if (!sumRes.error && Array.isArray(sumRes.data)) {
      let total = 0;
      sumRes.data.forEach(function (r) {
        const m = r && r.metadata;
        if (m && typeof m.size === 'number') total += m.size;
      });
      storageBytes = total;
    }
  } catch (e) {
    // storage.objects may not be readable via the JS client across all
    // schema configurations. Skip silently — the card still shows the
    // subscription cost and any limits already configured.
  }

  return { db_bytes: dbBytes, storage_bytes: storageBytes };
}
