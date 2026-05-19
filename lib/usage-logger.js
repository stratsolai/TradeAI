// lib/usage-logger.js — shared cost attribution helper
//
// Every API endpoint that calls Anthropic must log to the api_usage
// table so the Profitability Dashboard can attribute spend per tool
// and per customer. This helper is the single source of truth for
// that logging — endpoints call logAnthropicUsage() after each
// successful Claude call and the helper writes a single row.
//
// Logging failures must never break the customer-facing call. All
// errors are caught internally and console.error'd so they show up
// in Vercel logs without affecting the response.
//
// Pricing values are AUD per 1M tokens. Anthropic publishes rates in
// USD; we convert at a rounded exchange rate for the cost_estimate
// column. These rates are reviewed when a model is added or pricing
// changes — see CLAUDE.md "Important Platform Facts" for the rotation
// process.

const ANTHROPIC_PRICING_AUD = {
  // sonnet 4.6: $3 / $15 per 1M tokens USD ≈ $4.50 / $22.50 AUD
  'claude-sonnet-4-6':            { in_per_million: 4.50, out_per_million: 22.50 },
  // haiku 4.5: $1 / $5 per 1M tokens USD ≈ $1.50 / $7.50 AUD
  'claude-haiku-4-5':             { in_per_million: 1.50, out_per_million: 7.50 },
  'claude-haiku-4-5-20251001':    { in_per_million: 1.50, out_per_million: 7.50 }
};

function pricingFor(model) {
  if (!model) return null;
  if (ANTHROPIC_PRICING_AUD[model]) return ANTHROPIC_PRICING_AUD[model];
  // Fall back on a prefix match so versioned model IDs that aren't
  // explicitly listed still get priced (e.g. claude-sonnet-4-6-2026xxxx).
  const keys = Object.keys(ANTHROPIC_PRICING_AUD);
  for (let i = 0; i < keys.length; i++) {
    if (model.indexOf(keys[i]) === 0) return ANTHROPIC_PRICING_AUD[keys[i]];
  }
  return null;
}

function currentPeriod() {
  const now = new Date();
  return now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
}

function estimateCost(model, tokens_in, tokens_out) {
  const rate = pricingFor(model);
  if (!rate) return 0;
  const cost = (tokens_in / 1000000) * rate.in_per_million
             + (tokens_out / 1000000) * rate.out_per_million;
  return Math.round(cost * 10000) / 10000; // 4dp — fractions of a cent matter at scale
}

// Write a single api_usage row using the Supabase REST endpoint
// directly — avoids a hard dependency on which supabase client the
// caller already has and matches the proven news-digest-refresh
// pattern. Always returns void; failures only log.
async function writeUsage(row) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('[usage-logger] SUPABASE_URL or SUPABASE_SERVICE_KEY missing — skipping log');
    return;
  }
  try {
    const r = await fetch(url + '/rest/v1/api_usage', {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });
    if (!r.ok) {
      const text = await r.text().catch(function() { return ''; });
      console.error('[usage-logger] insert failed', r.status, text.slice(0, 300));
    }
  } catch (e) {
    console.error('[usage-logger] insert exception:', e && e.message ? e.message : String(e));
  }
}

// Public — log a single Anthropic call. `usage` is the response.usage
// block from either the SDK or the REST API; both expose
// input_tokens / output_tokens.
//
// Optional `subtype` is a short identifier that distinguishes the kind
// of Anthropic call inside a given tool_id bucket — for Content Library
// the convention is `<source>-<usecase>`, e.g. 'gmail-extraction',
// 'gmail-versioning', 'gmail-image', 'drive-extraction', and so on. When
// supplied it is appended to notes as ' | <subtype>' so the Admin
// Profitability page can split CL spend by ingestion source and use
// case without needing a new database column.
export async function logAnthropicUsage(opts) {
  if (!opts) return;
  const tokens_in = (opts.usage && (opts.usage.input_tokens || opts.usage.inputTokens)) || 0;
  const tokens_out = (opts.usage && (opts.usage.output_tokens || opts.usage.outputTokens)) || 0;
  const cost = estimateCost(opts.model, tokens_in, tokens_out);
  let notes = 'auto-logged: ' + (opts.model || 'unknown');
  if (opts.subtype) notes += ' | ' + String(opts.subtype);
  await writeUsage({
    provider: 'anthropic',
    tool_id: opts.tool_id || null,
    user_id: opts.user_id || null,
    period: opts.period || currentPeriod(),
    usage_value: String(tokens_in + tokens_out),
    tokens_in: tokens_in,
    tokens_out: tokens_out,
    cost_estimate: cost,
    notes: notes,
    entered_at: new Date().toISOString()
  });
}

// Public — log a single Serper call (one search = $0.001 USD ≈
// $0.0015 AUD). Kept here so all auto-logging lives in one module.
export async function logSerperUsage(opts) {
  opts = opts || {};
  await writeUsage({
    provider: 'serper',
    tool_id: opts.tool_id || null,
    user_id: opts.user_id || null,
    period: opts.period || currentPeriod(),
    usage_value: '1',
    cost_estimate: 0.0015,
    notes: 'auto-logged',
    entered_at: new Date().toISOString()
  });
}

// Public — log Serper /scrape usage by credits. Scrape pricing is
// per-credit (Serper bills per-credit and returns the consumed credit
// count on every /scrape response). One credit ≈ $0.001 USD ≈ $0.0015
// AUD at the same rate as a standard search. The SRL refresh handler
// aggregates credits across all scrape calls in one refresh and writes
// a single row here so the Profitability Dashboard's per-refresh cost
// signal stays clean.
const SERPER_AUD_PER_CREDIT = 0.0015;
export async function logSerperScrapeUsage(opts) {
  opts = opts || {};
  const credits = typeof opts.credits === 'number' ? opts.credits : 0;
  if (credits <= 0) return;
  const cost = Math.round(credits * SERPER_AUD_PER_CREDIT * 10000) / 10000;
  await writeUsage({
    provider: 'serper',
    tool_id: opts.tool_id || null,
    user_id: opts.user_id || null,
    period: opts.period || currentPeriod(),
    usage_value: String(credits),
    cost_estimate: cost,
    notes: 'auto-logged | scrape',
    entered_at: new Date().toISOString()
  });
}

// Public — log a single Meta Graph API call. Meta Graph itself is
// free; we log calls so the Admin Profitability page can surface
// volume per tool/user (rate-limit risk, not dollar cost). Pass
// `subtype` to distinguish 'publish' (post creation) from
// 'metrics' (insights refresh) so the breakdown is meaningful.
export async function logMetaUsage(opts) {
  opts = opts || {};
  let notes = 'auto-logged';
  if (opts.subtype) notes += ' | ' + String(opts.subtype);
  await writeUsage({
    provider: 'meta',
    tool_id: opts.tool_id || null,
    user_id: opts.user_id || null,
    period: opts.period || currentPeriod(),
    usage_value: '1',
    cost_estimate: 0,
    notes: notes,
    entered_at: new Date().toISOString()
  });
}

// Public — log a single Ideogram image generation. Ideogram pricing
// is plan-based (Pay-as-you-go ~$0.05 USD ≈ $0.075 AUD per standard
// generation; cheaper on the subscription plans). Default to PAYG
// pricing — owner can adjust by editing this constant when they
// switch plan.
const IDEOGRAM_AUD_PER_IMAGE = 0.075;
export async function logIdeogramUsage(opts) {
  opts = opts || {};
  await writeUsage({
    provider: 'ideogram',
    tool_id: opts.tool_id || null,
    user_id: opts.user_id || null,
    period: opts.period || currentPeriod(),
    usage_value: '1',
    cost_estimate: IDEOGRAM_AUD_PER_IMAGE,
    notes: 'auto-logged',
    entered_at: new Date().toISOString()
  });
}

// Public — log a single SMTP2Go transactional email send. Plans are
// monthly-tier subscriptions (cheapest ~AUD 16/month for 1k emails),
// so per-email cost varies with plan. Default below assumes the
// 1k-emails-per-month plan; adjust the constant when the plan changes.
const SMTP2GO_AUD_PER_EMAIL = 0.016;
export async function logSmtp2goUsage(opts) {
  opts = opts || {};
  await writeUsage({
    provider: 'smtp2go',
    tool_id: opts.tool_id || null,
    user_id: opts.user_id || null,
    period: opts.period || currentPeriod(),
    usage_value: '1',
    cost_estimate: SMTP2GO_AUD_PER_EMAIL,
    notes: 'auto-logged',
    entered_at: new Date().toISOString()
  });
}

// Public — log a single Predis.ai generation request. Predis does
// not expose a public credits/usage endpoint, so dollar cost stays
// at $0 here and the owner enters monthly spend via the Manual
// Tracking form. The auto-logged volume gives a sanity check
// against what they enter manually.
export async function logPredisUsage(opts) {
  opts = opts || {};
  let notes = 'auto-logged';
  if (opts.subtype) notes += ' | ' + String(opts.subtype);
  await writeUsage({
    provider: 'predis',
    tool_id: opts.tool_id || null,
    user_id: opts.user_id || null,
    period: opts.period || currentPeriod(),
    usage_value: '1',
    cost_estimate: 0,
    notes: notes,
    entered_at: new Date().toISOString()
  });
}
