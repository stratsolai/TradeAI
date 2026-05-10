// api/shared-research-refresh.js — Phase 2 endpoint shell
//
// Implements Section 12 of StaxAI-Shared-Research-Layer-Spec-v1_0 in the
// shape required by Phase 2:
//
//   - JWT auth + supabase.auth.getUser() (Section 2.4)
//   - Build the query plan from the Business Profile via lib/shared-research.js
//   - Run every query through the 24-hour Serper cache layer (Section 8)
//   - Dedup raw results by URL (Section 12.1)
//   - Live mode: write a refresh row to shared_research_refreshes with
//     curated_items=0, rejected_items=0 (curation lands in Phase 3)
//   - Live mode does NOT write to shared_research yet — Phase 4 wires those
//   - Dry-run mode (?dry=true): runs everything except writes, returns the
//     full plan + truncated raw results so the owner can inspect
//
// No Haiku curation in this phase. Tool integration (ID/BI swap-outs) is
// Phase 5 and Phase 6.

import { createClient } from '@supabase/supabase-js';
import {
  buildQueryPlan,
  resolveRegion,
  normaliseIndustries,
  executeQueryWithCache,
  dedupByLink,
  enrichDedupedWithPlan,
  stateFullName,
  runCuration,
  validateCuratedItems,
  groupCuratedByCategory
} from '../lib/shared-research.js';
import { logSerperUsage, logAnthropicUsage } from '../lib/usage-logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Soft cap on parallel Serper calls. 51 queries at 6 lanes finish in well
// under the 60-second function maxDuration. Set conservatively to keep
// well clear of Serper rate limits during a single refresh.
const SERPER_MAX_PARALLEL = 6;

// Per-result snippet truncation in dry-run output (Phase 2 instruction #6).
const TRUNCATE_CHARS = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const t0 = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
  const userId = user.id;

  // -------------------------------------------------------------------------
  // Request parameters
  // -------------------------------------------------------------------------
  const body = req.body || {};
  const triggeredBy = body.triggered_by_tool || null;
  const forceRefresh = !!body.force_refresh;
  const dryRun = req.query && (req.query.dry === 'true' || req.query.dry === '1');

  // -------------------------------------------------------------------------
  // Business Profile load
  // -------------------------------------------------------------------------
  const profileRes = await supabase
    .from('profiles')
    .select('business_name, industry, address_state, address_suburb, address_postcode, employee_range')
    .eq('id', userId)
    .single();

  if (profileRes.error || !profileRes.data) {
    return res.status(400).json({ error: 'Could not load business profile' });
  }
  const profile = profileRes.data;

  const industries = normaliseIndustries(profile);
  const region = resolveRegion(profile);
  const stateAbbr = profile.address_state || null;
  const stateFull = stateFullName(stateAbbr);

  const plan = buildQueryPlan(profile);

  if (plan.length === 0) {
    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      message: 'No queries to run — Business Profile lacks the data needed (state, industry, region).',
      profile_summary: {
        industries,
        state: stateAbbr,
        state_full: stateFull,
        region: region ? region.region_name : null,
        region_resolved: !!region
      }
    });
  }

  // -------------------------------------------------------------------------
  // Execute the plan with the cache layer
  // -------------------------------------------------------------------------
  const planResults = await runWithConcurrency(plan, SERPER_MAX_PARALLEL, async (planRow) => {
    return executeQueryWithCache({
      supabase,
      userId,
      planRow,
      apiKey: SERPER_API_KEY,
      forceRefresh
    });
  });

  let cacheHits = 0;
  let queriesRun = 0;
  const queryStats = new Array(plan.length);
  const taggedItems = [];

  for (let i = 0; i < plan.length; i++) {
    const row = plan[i];
    const r = planResults[i] || { items: [], cache_hit: false, cache_age_hours: null };
    if (r.cache_hit) cacheHits++; else queriesRun++;

    queryStats[i] = {
      category: row.category,
      lens: row.lens,
      industry: row.industry,
      query: row.query,
      query_type: row.query_type,
      recency: row.recency,
      cache_hit: r.cache_hit,
      cache_age_hours: r.cache_age_hours,
      result_count: r.items.length
    };

    for (const item of r.items) {
      // plan_index is the single back-pointer kept through dedupe; every
      // other attribution field (category, lens, query, industry) is
      // recovered later via enrichDedupedWithPlan(). See Phase 3.1.
      taggedItems.push({
        title: item.title || '',
        snippet: item.snippet || '',
        link: item.link || '',
        source: item.source || '',
        date: item.date || null,
        plan_index: i
      });
    }
  }

  // Log Serper usage once per refresh that actually fired any fresh queries.
  // Cache hits are not Serper calls and are not logged.
  if (queriesRun > 0) {
    await logSerperUsage({ tool_id: 'shared-research', user_id: userId });
  }

  const dedupedRaw = dedupByLink(taggedItems);
  const deduped = enrichDedupedWithPlan(dedupedRaw, plan);
  const durationMs = Date.now() - t0;

  // -------------------------------------------------------------------------
  // Dry-run response — no writes; runs the full pipeline including
  // Haiku curation and the Section 9.5 validation layer so the owner
  // can inspect curation quality before Phase 4 enables live writes.
  // -------------------------------------------------------------------------
  if (dryRun) {
    // raw_results no longer carries a singular `category` field — it
    // was misleading because dedupe kept only the first-seen category
    // when a URL was surfaced by queries in multiple categories. The
    // authoritative attribution is now the source_categories array.
    const truncatedItems = deduped.map((it) => ({
      title: (it.title || '').slice(0, TRUNCATE_CHARS),
      snippet: (it.snippet || '').slice(0, TRUNCATE_CHARS),
      link: it.link,
      source: it.source,
      date: it.date,
      lenses: it.lenses,
      source_categories: it.source_categories,
      source_queries: it.source_queries,
      source_industries: it.source_industries
    }));

    // Curation pass — Section 9
    const curation = await runCuration({
      profile,
      dedupedItems: deduped,
      anthropicKey: ANTHROPIC_API_KEY
    });

    // Log Haiku usage for cost attribution. logAnthropicUsage swallows
    // its own errors so logging failures never break the response.
    if (curation.usage) {
      await logAnthropicUsage({
        tool_id: 'shared-research',
        user_id: userId,
        model: 'claude-haiku-4-5-20251001',
        usage: curation.usage
      });
    }

    // Validation pass — Section 9.5
    const validated = curation.ok
      ? validateCuratedItems(curation.items, deduped)
      : { accepted: [], rejected: [] };

    // Section 9.5 bottom rule: if Haiku returned items and every one
    // failed validation, that is "the entire curation output fails
    // validation" and the run is treated as a curation failure.
    const totalCurationFailure = curation.ok
      && curation.items.length > 0
      && validated.accepted.length === 0;

    // Join each curated item back to its originating plan rows via URL
    // so source_queries and source_categories can be surfaced on the
    // curated row. Critical for Phase 4 audit — without it, downstream
    // tools can see the curated item's category but not which queries
    // surfaced it.
    const enrichedByUrl = new Map();
    for (const d of deduped) enrichedByUrl.set(d.link, d);
    const acceptedWithSource = validated.accepted.map((it) => {
      const src = enrichedByUrl.get(it.url);
      return Object.assign({}, it, {
        source_queries: src ? src.source_queries : [],
        source_categories: src ? src.source_categories : [],
        source_industries: src ? src.source_industries : []
      });
    });

    const grouped = groupCuratedByCategory(acceptedWithSource);
    const totalDuration = Date.now() - t0;

    return res.status(200).json({
      success: true,
      dry_run: true,
      curation_ok: curation.ok && !totalCurationFailure,
      curation_error: curation.ok
        ? (totalCurationFailure ? 'all curated items failed validation' : null)
        : (curation.error || 'unknown curation error'),
      profile_summary: {
        industries,
        state: stateAbbr,
        state_full: stateFull,
        region: region ? region.region_name : null,
        region_resolved: !!region,
        postcode: profile.address_postcode || null,
        business_size: profile.employee_range || null
      },
      stats: {
        total_queries: plan.length,
        cache_hits: cacheHits,
        fresh_queries: queriesRun,
        raw_items: taggedItems.length,
        deduped_items: deduped.length,
        haiku_returned: curation.items.length,
        curated_items: validated.accepted.length,
        rejected_items: validated.rejected.length,
        duration_ms: totalDuration
      },
      query_plan: queryStats,
      raw_results: truncatedItems,
      curated_items: grouped,
      rejected_items: validated.rejected
    });
  }

  // -------------------------------------------------------------------------
  // Live mode — write a refresh row (Phase 2). Curation + shared_research
  // writes land in Phases 3/4.
  // -------------------------------------------------------------------------
  let refreshId = null;
  try {
    const refreshRow = {
      user_id: userId,
      triggered_by_tool: triggeredBy,
      queries_run: queriesRun,
      cache_hits: cacheHits,
      raw_items: taggedItems.length,
      curated_items: 0,
      rejected_items: 0,
      duration_ms: durationMs
    };
    const ins = await supabase
      .from('shared_research_refreshes')
      .insert(refreshRow)
      .select('id')
      .single();
    if (!ins.error && ins.data) {
      refreshId = ins.data.id;
    } else if (ins.error) {
      console.error('[SharedResearch] Refresh row write failed —', 'message:', ins.error.message);
    }
  } catch (e) {
    console.error('[SharedResearch] Refresh row exception —', 'message:', e && e.message);
  }

  return res.status(200).json({
    success: true,
    dry_run: false,
    refresh_id: refreshId,
    profile_summary: {
      industries,
      state: stateAbbr,
      state_full: stateFull,
      region: region ? region.region_name : null,
      region_resolved: !!region
    },
    stats: {
      total_queries: plan.length,
      cache_hits: cacheHits,
      fresh_queries: queriesRun,
      raw_items: taggedItems.length,
      deduped_items: deduped.length,
      duration_ms: durationMs,
      curated_items: 0,
      rejected_items: 0
    },
    items: deduped,
    note: 'Curation lands in Phase 3. Items are raw Serper results, deduped by URL.'
  });
}

// ---------------------------------------------------------------------------
// Concurrency limiter
// ---------------------------------------------------------------------------
//
// Promise.all with a fixed number of lanes. Workers pull the next index off
// the cursor and keep going until the plan is exhausted. Keeps the load on
// Serper bounded so a single refresh never approaches their rate limit.

async function runWithConcurrency(items, maxParallel, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function lane() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i]);
      } catch (e) {
        console.error('[SharedResearch] Worker exception —', 'index:', i, 'message:', e && e.message);
        results[i] = { items: [], cache_hit: false, cache_age_hours: null };
      }
    }
  }

  const lanes = Math.min(maxParallel, items.length);
  await Promise.all(Array.from({ length: lanes }, () => lane()));
  return results;
}
