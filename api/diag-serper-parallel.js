// api/diag-serper-parallel.js — TEMPORARY diagnostic endpoint
//
// Identical to api/diag-serper.js in inputs and response shape, but
// fires the four test queries in PARALLEL through the same 6-lane
// runWithConcurrency helper the platform uses for its 55-query
// refresh plan. If parallel firing reproduces the 0-items-on-tech
// behaviour the platform shows, concurrency is the cause. If it
// still returns the same counts as the sequential diagnostic,
// concurrency is ruled out.
//
// Will be deleted in the follow-up instruction. Do NOT wire into
// anything, do NOT cache, do NOT log the API key.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;

const TECH_QUERY = 'Building & Construction software Australia';
const REG_QUERY = 'Building & Construction regulation Australia';

const TESTS = [
  { label: '1_tech_news_qdr_m3',   endpoint: 'https://google.serper.dev/news',   q: TECH_QUERY, tbs: 'qdr:m3' },
  { label: '2_reg_news_qdr_m3',    endpoint: 'https://google.serper.dev/news',   q: REG_QUERY,  tbs: 'qdr:m3' },
  { label: '3_tech_search_qdr_m3', endpoint: 'https://google.serper.dev/search', q: TECH_QUERY, tbs: 'qdr:m3' },
  { label: '4_tech_news_no_tbs',   endpoint: 'https://google.serper.dev/news',   q: TECH_QUERY, tbs: null    }
];

// Same shape as the runWithConcurrency helper in api/shared-research-refresh.js
// — copied inline so this temporary endpoint has no cross-file dependency
// the cleanup step would have to unwind.
async function runWithConcurrency(items, maxParallel, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { results[i] = await worker(items[i], i); }
      catch (e) {
        console.error('[diag-serper-parallel] Worker exception —', 'index:', i, 'message:', e && e.message);
        results[i] = { _error: (e && e.message) || 'worker exception' };
      }
    }
  }
  const lanes = Math.min(maxParallel, items.length);
  await Promise.all(Array.from({ length: lanes }, () => lane()));
  return results;
}

async function fireOne(t) {
  const payload = { q: t.q, gl: 'au', hl: 'en', num: 8 };
  if (t.tbs) payload.tbs = t.tbs;
  const bodyString = JSON.stringify(payload);

  console.log(`[DIAG-SERPER-CALL-PARALLEL] endpoint: ${t.endpoint} | query: ${t.q} | body: ${bodyString}`);

  let status = 0;
  let body = null;
  let rawText = '';
  let fetchError = null;
  try {
    const resp = await fetch(t.endpoint, {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: bodyString
    });
    status = resp.status;
    try { rawText = await resp.text(); } catch (e) { rawText = ''; }
    console.log(`[DIAG-SERPER-CALL-PARALLEL] status: ${status} | query: ${t.q} | raw_first_500: ${rawText.slice(0, 500)}`);
    try { body = rawText ? JSON.parse(rawText) : null; } catch (e) { body = null; }
  } catch (e) {
    fetchError = (e && e.message) || 'fetch exception';
    console.log(`[DIAG-SERPER-CALL-PARALLEL] fetch_error: ${fetchError} | query: ${t.q}`);
  }

  const isNews = t.endpoint.endsWith('/news');
  const newsArr = (body && Array.isArray(body.news)) ? body.news : [];
  const organicArr = (body && Array.isArray(body.organic)) ? body.organic : [];
  const topStoriesArr = (body && Array.isArray(body.topStories)) ? body.topStories : [];

  const newsTop5 = newsArr.slice(0, 5).map(r => ({
    title: r.title || '',
    link: r.link || '',
    source: r.source || '',
    date: r.date || null
  }));
  const organicTop5 = organicArr.slice(0, 5).map(r => ({
    title: r.title || '',
    link: r.link || '',
    snippet: r.snippet || ''
  }));
  const topStoriesTop3 = topStoriesArr.slice(0, 3).map(r => ({
    title: r.title || '',
    link: r.link || ''
  }));

  return {
    label: t.label,
    request: { endpoint: t.endpoint, payload },
    status,
    fetch_error: fetchError,
    news_count: newsArr.length,
    organic_count: organicArr.length,
    top_stories_count: topStoriesArr.length,
    news_top5: isNews ? newsTop5 : undefined,
    organic_top5: isNews ? undefined : organicTop5,
    top_stories_top3: topStoriesTop3.length > 0 ? topStoriesTop3 : undefined,
    response_keys: body ? Object.keys(body) : []
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing authorisation token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  if (!SERPER_API_KEY) {
    return res.status(500).json({ error: 'SERPER_API_KEY not configured in this environment' });
  }

  // 6 lanes matches the platform's SERPER_MAX_PARALLEL — even though there
  // are only 4 tests, this keeps the concurrency floor identical to what
  // runSerperQuery sees during a real refresh.
  const results = await runWithConcurrency(TESTS, 6, fireOne);

  return res.status(200).json({
    success: true,
    note: 'Temporary parallel diagnostic — delete after use.',
    user_id: user.id,
    fired_at: new Date().toISOString(),
    results
  });
}
