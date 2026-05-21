#!/usr/bin/env node
// scripts/srl-calibration-sweep.mjs
//
// Task 46 SRL substitution calibration sweep harness.
//
// Runs each cohort in an input list through the dry-run path on
// /api/shared-research-refresh with the supplied substitution_overrides,
// then writes a per-cohort review block to a single JSON output file.
// Authenticates with the platform's server-side CRON_SECRET — no
// browser session, no user JWT, no admin password required.
//
// The same input format is used for an initial run or a re-test batch:
// you review the output, decide which cohorts want different phrases,
// edit the list, and re-invoke the harness with the new list.
//
// ----------------------------------------------------------------------
// Invocation
// ----------------------------------------------------------------------
//
//   node --env-file=.env.local scripts/srl-calibration-sweep.mjs \
//     --input ./sweep-list.json \
//     --output ./sweep-output.json
//
// --input is required. --output is optional and defaults to
// ./srl-calibration-output-<timestamp>.json in the current directory.
// --base-url is optional and defaults to the PLATFORM_BASE_URL env var
// or https://staxai.com.au.
//
// ----------------------------------------------------------------------
// Required env (typically in .env.local for local invocation)
// ----------------------------------------------------------------------
//
//   CRON_SECRET            — platform server-side credential. Same value
//                            api/srl-scheduler.js / api/srl-worker.js use.
//   PLATFORM_BASE_URL      — optional, default https://staxai.com.au
//
// ----------------------------------------------------------------------
// Input format
// ----------------------------------------------------------------------
//
// A JSON array, one entry per cohort to test:
//
//   [
//     {
//       "cohort_id": "wholesale-distribution::wa::perth",
//       "substitution_overrides": {
//         "wholesale-distribution": ["wholesalers", "distribution"]
//       },
//       "note": "optional free-text — echoed in the output for context"
//     },
//     {
//       "cohort_id": "cleaning-and-maintenance::nsw::sydney",
//       "substitution_overrides": {
//         "cleaning-and-maintenance": ["commercial cleaning"]
//       }
//     }
//   ]
//
// substitution_overrides is keyed by industry slug and matches the body
// field /api/shared-research-refresh accepts. Multi-industry compound
// cohorts can carry multiple slug keys. If omitted, the cohort runs
// against whatever srlSubstitution lib/industry-taxonomy.js currently
// holds for the cohort's industries — useful for capturing baseline
// behaviour pre-tuning.
//
// ----------------------------------------------------------------------
// Output format
// ----------------------------------------------------------------------
//
// A single JSON object:
//
//   {
//     "generated_at":   ISO timestamp,
//     "input_file":     "<path>",
//     "base_url":       "<url>",
//     "cohort_count":   N,
//     "summary":        { total, succeeded, failed },
//     "results":        [<per-cohort review block>, ...]
//   }
//
// Each per-cohort block carries the validity surface (scope_type,
// lenses_present, substitution_applied, run duration, diagnostic block),
// totals (raw/deduped/curated/rejected), per-query-cell breakdown with
// accepted_count + rejected_count counted by matching against ANY of an
// item's source_queries (not just the first), the full accepted item
// list, and the full rejected item list with each rejected item's
// diagnostic_reason attached.
//
// The output file is written incrementally (after each cohort) via a
// tmp-then-rename atomic swap, so a crash mid-sweep leaves the file in
// a consistent partial state — you keep whatever cohorts completed
// before the failure.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { parseArgs } from 'node:util';

// Per-cohort fetch timeout. The handler maxDuration is 600s on Vercel
// (vercel.json functions block); a 5-minute cap here gives heavy
// metro cohorts plenty of room while preventing one hung cohort from
// stalling the whole sweep.
const FETCH_TIMEOUT_MS = 5 * 60 * 1000;

function log(msg) {
  console.error('[sweep] ' + msg);
}

function fatal(msg) {
  log(msg);
  process.exit(1);
}

async function loadInput(path) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e) {
    fatal('cannot read input file ' + path + ' — ' + e.message);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fatal('input file is not valid JSON — ' + e.message);
  }
  if (!Array.isArray(parsed)) {
    fatal('input file must be a JSON array of cohort entries');
  }
  return parsed;
}

// Single cohort dry-run against /api/shared-research-refresh. Returns a
// uniform shape regardless of success/failure so the reshape step
// downstream doesn't need branching for transport vs. response errors.
async function runOneCohort({ baseUrl, cronSecret, entry }) {
  const body = {
    cohort_id: entry.cohort_id,
    dry: true,
    force_refresh: true,
    triggered_by_tool: 'admin-sweep'
  };
  if (entry.substitution_overrides && typeof entry.substitution_overrides === 'object') {
    body.substitution_overrides = entry.substitution_overrides;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const t0 = Date.now();
  let resp;
  try {
    resp = await fetch(baseUrl + '/api/shared-research-refresh', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': cronSecret
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    return {
      http_status: 0,
      duration_ms_wall: Date.now() - t0,
      payload: null,
      raw_text: null,
      transport_error: e.name === 'AbortError'
        ? 'timed out after ' + FETCH_TIMEOUT_MS + 'ms'
        : (e.message || String(e))
    };
  }
  clearTimeout(timer);

  const raw_text = await resp.text();
  let payload = null;
  try {
    payload = JSON.parse(raw_text);
  } catch (e) {
    // non-JSON body (e.g. Vercel HTML error page). Surface raw text so
    // the operator can see what landed.
  }

  return {
    http_status: resp.status,
    duration_ms_wall: Date.now() - t0,
    payload,
    raw_text: payload ? null : raw_text.slice(0, 4000),
    transport_error: null
  };
}

// Reshape the dry-run response into the per-cohort review block.
function reshapeResult(entry, run) {
  const base = {
    cohort_id: entry.cohort_id,
    substitution_overrides_requested: entry.substitution_overrides || null,
    note: entry.note || null,
    http_status: run.http_status,
    duration_ms_wall: run.duration_ms_wall
  };

  if (run.transport_error) {
    return { ...base, success: false, error: 'transport: ' + run.transport_error };
  }

  if (!run.payload) {
    return {
      ...base,
      success: false,
      error: 'non-JSON response (status ' + run.http_status + ')',
      raw_response_excerpt: run.raw_text
    };
  }

  const p = run.payload;

  if (!p.success) {
    return {
      ...base,
      success: false,
      error: p.error || ('handler returned success: false at status ' + run.http_status),
      cohort_summary: p.cohort_summary || null,
      missing_fields: p.missing_fields || null,
      raw_response: p
    };
  }

  const stats = p.stats || {};
  const queryPlan = Array.isArray(p.query_plan) ? p.query_plan : [];
  const rejectedItems = Array.isArray(p.rejected_items) ? p.rejected_items : [];
  const curatedGrouped = p.curated_items || {};

  // Flatten curated items (response groups them by category) into a single
  // list. Each item retains its existing fields and we tag it with the
  // category bucket it appeared under, for downstream review.
  const acceptedItems = [];
  for (const cat of Object.keys(curatedGrouped)) {
    const arr = curatedGrouped[cat];
    if (!Array.isArray(arr)) continue;
    for (const it of arr) {
      acceptedItems.push({ ...it, category: it.category || cat });
    }
  }

  // Distinct lenses appearing in the query plan.
  const lensSet = new Set();
  for (const row of queryPlan) {
    if (row && row.lens) lensSet.add(row.lens);
  }
  const lensesPresent = Array.from(lensSet).sort();

  // Distinct substitutions actually applied per industry, derived from
  // the query plan rows (not just echoed from the request). This is
  // what the handler actually used after validating substitution_overrides.
  const subsByIndustry = {};
  for (const row of queryPlan) {
    if (row && row.industry && row.industry_substitution) {
      if (!subsByIndustry[row.industry]) subsByIndustry[row.industry] = new Set();
      subsByIndustry[row.industry].add(row.industry_substitution);
    }
  }
  const substitutionApplied = {};
  for (const ind of Object.keys(subsByIndustry)) {
    substitutionApplied[ind] = Array.from(subsByIndustry[ind]).sort();
  }

  // Per-query-cell breakdown. accepted_count and rejected_count match
  // by item.source_queries.includes(row.query) — ALL items whose
  // source_queries array contains the cell's query string contribute
  // to the count, not just items whose FIRST source_query matches.
  // A single item surfaced by N queries contributes to N cells.
  const queryCells = queryPlan.map((row) => {
    if (!row) return null;
    let acc = 0;
    let rej = 0;
    for (const it of acceptedItems) {
      const sq = Array.isArray(it.source_queries) ? it.source_queries : [];
      if (sq.includes(row.query)) acc++;
    }
    for (const it of rejectedItems) {
      const sq = Array.isArray(it.source_queries) ? it.source_queries : [];
      if (sq.includes(row.query)) rej++;
    }
    return {
      category: row.category,
      lens: row.lens,
      industry: row.industry,
      phrase: row.industry_substitution,
      query: row.query,
      query_type: row.query_type,
      recency: row.recency,
      cache_hit: row.cache_hit,
      result_count: row.result_count,
      accepted_count: acc,
      rejected_count: rej,
      status: row.status
    };
  }).filter(Boolean);

  return {
    ...base,
    success: true,
    refresh_id: p.refresh_id,
    curation_ok: p.curation_ok,
    curation_error: p.curation_error,
    validity: {
      scope_type: p.cohort_summary && p.cohort_summary.scope_type,
      lenses_present: lensesPresent,
      substitution_applied: substitutionApplied,
      duration_ms: stats.duration_ms,
      duration_ms_wall: run.duration_ms_wall,
      diagnostic: p.diagnostic || null
    },
    totals: {
      raw: stats.raw_items,
      deduped: stats.deduped_items,
      curated: stats.curated_items,
      rejected: stats.rejected_items,
      rejected_by_sonnet: stats.rejected_by_sonnet,
      rejected_by_validator: stats.rejected_by_validator
    },
    query_cells: queryCells,
    accepted_items: acceptedItems,
    rejected_items: rejectedItems,
    audit_warnings: p.audit_warnings || []
  };
}

async function writeOutputAtomic(path, envelope) {
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(envelope, null, 2));
  await rename(tmp, path);
}

async function main() {
  const parsed = parseArgs({
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      'base-url': { type: 'string' }
    },
    allowPositionals: false
  });
  const values = parsed.values;

  if (!values.input) {
    fatal('--input <path> is required\n\nUsage:\n  node --env-file=.env.local scripts/srl-calibration-sweep.mjs --input <list.json> [--output <out.json>] [--base-url <url>]');
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    fatal('CRON_SECRET env var not set — pass via --env-file=.env.local or shell export');
  }

  const baseUrl = (values['base-url'] || process.env.PLATFORM_BASE_URL || 'https://staxai.com.au').replace(/\/$/, '');

  const cohorts = await loadInput(values.input);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = values.output || ('./srl-calibration-output-' + ts + '.json');

  log('Starting sweep — cohorts: ' + cohorts.length + ', base_url: ' + baseUrl);
  log('Output: ' + outputPath);

  const envelope = {
    generated_at: new Date().toISOString(),
    input_file: values.input,
    base_url: baseUrl,
    cohort_count: cohorts.length,
    summary: { total: cohorts.length, succeeded: 0, failed: 0 },
    results: []
  };

  // Write the initial envelope so the output file exists from the start
  // (helps the operator confirm the path is writable before any cohort
  // runs).
  await writeOutputAtomic(outputPath, envelope);

  for (let i = 0; i < cohorts.length; i++) {
    const entry = cohorts[i];
    const tag = '[' + (i + 1) + '/' + cohorts.length + ']';

    if (!entry || typeof entry !== 'object' || !entry.cohort_id) {
      log(tag + ' skip — entry missing cohort_id');
      envelope.results.push({
        cohort_id: null,
        success: false,
        error: 'invalid input entry — missing cohort_id',
        input_entry: entry
      });
      envelope.summary.failed++;
      await writeOutputAtomic(outputPath, envelope);
      continue;
    }

    log(tag + ' ' + entry.cohort_id + ' — running');
    const run = await runOneCohort({ baseUrl, cronSecret, entry });
    const block = reshapeResult(entry, run);
    envelope.results.push(block);

    if (block.success) {
      envelope.summary.succeeded++;
      const t = block.totals || {};
      const d = (block.validity && block.validity.diagnostic) || {};
      log(tag + ' ' + entry.cohort_id + ' — ok '
        + '(curated: ' + (t.curated || 0)
        + ', rejected: ' + (t.rejected || 0)
        + ', diagnostic_reasons: ' + (d.items_with_reason || 0)
        + '/' + (d.items_diagnosed || 0)
        + ', wall: ' + block.duration_ms_wall + 'ms)');
    } else {
      envelope.summary.failed++;
      log(tag + ' ' + entry.cohort_id + ' — FAILED: ' + block.error);
    }

    await writeOutputAtomic(outputPath, envelope);
  }

  log('Done — succeeded: ' + envelope.summary.succeeded
    + ', failed: ' + envelope.summary.failed);
  log('Output: ' + outputPath);
}

main().catch((e) => fatal('fatal: ' + (e && (e.stack || e.message) || e)));
