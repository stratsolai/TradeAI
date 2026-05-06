// api/scrape-website.js — Task 10 CL Connections + Task 16 Subpage Crawling
// Endpoint for the Website source. Crawls the provided URL and its
// subpages, running each page through the canonical CL intake pipeline
// shared by every other connector.
//
// Behaviour:
//   POST { userId, url } → fetches robots.txt and sitemap.xml from the
//   root domain. If a valid sitemap exists, uses its page list (up to
//   MAX_PAGES_PER_CRAWL). Otherwise follows internal same-domain links
//   breadth-first up to MAX_CRAWL_DEPTH. Each page is stripped to plain
//   text, run through the extraction prompt, and inserted into
//   content_library with the same shape every other connector uses.
//
// Auth: userId is taken from the request body to preserve compatibility
// with cl-upload.js, which posts to this endpoint without a JWT header
// (matching cl-email-scan.js and cl-outlook-scan.js).
//
// Re-scan semantics: source_ref includes a timestamp so each scan
// produces fresh rows rather than being deduped away by the source_ref
// unique constraint. This matches the source-tile note in cl-upload.js:
// "Rescanning reproduces all content as new Items".
//
// Response: { success: true, count, imported, approved, pending,
// rejected, pages_crawled, pages_skipped, skipped_reasons, ... }.

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHash } from 'crypto';
import { logAnthropicUsage } from '../lib/usage-logger.js';
import { buildSourceUniqueKey, ensureSourceItem } from '../lib/cl-source-items.js';
import {
  ALLOWED_TOOL_IDS,
  ALL_CATEGORIES,
  CATEGORY_LOOKUP,
  DISCARD_CATEGORIES,
  AUTO_ARCHIVE_CATEGORIES,
  VERSION_MATCH_RULES,
  VERSION_MATCH_SYSTEM_PROMPT,
  buildMultiBlockPrompt,
  applyCategoryToolMatrix
} from '../lib/cl-prompts.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const EXTRACTION_SYSTEM_PROMPT = buildMultiBlockPrompt();

// Crawl limits
var MAX_CRAWL_DEPTH = 2;
var MAX_PAGES_PER_CRAWL = 20;
var MAX_TOTAL_CHARS = 500000;
var PAGE_FETCH_TIMEOUT_MS = 15000;
var CRAWL_USER_AGENT = 'StaxAI/1.0 (+https://staxai.com.au)';

// File extensions that are never HTML pages — skip these links
var NON_HTML_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'rar', 'gz', 'tar', '7z',
  'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp',
  'mp3', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'wav',
  'css', 'js', 'json', 'xml', 'csv', 'txt',
];


// Strip an HTML document to plain text suitable for the extraction prompt.
// Removes head, style, script, and noscript blocks, converts block-level
// closing tags to newlines, decodes a small set of common HTML entities,
// and collapses whitespace. Mirrors the stripHtml helper in cl-email-scan.js
// with extra removals appropriate to a full HTML page.
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// ── Crawl helpers ──────────────────────────────────────────────────────

// Normalise a URL for dedup comparison: lowercase hostname, strip
// trailing slash, strip query string and fragment.
function normaliseUrl(rawUrl) {
  try {
    var u = new URL(rawUrl);
    u.hostname = u.hostname.toLowerCase();
    u.search = '';
    u.hash = '';
    var s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch (e) {
    return rawUrl;
  }
}

// Fetch and parse robots.txt from the root domain. Returns an array of
// disallowed path prefixes for the * user-agent (or our specific agent).
// A missing or unparseable robots.txt returns an empty array — it does
// not block the crawl.
async function fetchRobotsTxt(origin) {
  try {
    var robotsRes = await fetch(origin + '/robots.txt', {
      headers: { 'User-Agent': CRAWL_USER_AGENT },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });
    if (!robotsRes.ok) return [];
    var text = await robotsRes.text();
    var lines = text.split('\n');
    var disallowed = [];
    var inRelevantAgent = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.toLowerCase().indexOf('user-agent:') === 0) {
        var agent = line.substring(11).trim().toLowerCase();
        inRelevantAgent = (agent === '*' || agent === 'staxai');
      } else if (inRelevantAgent && line.toLowerCase().indexOf('disallow:') === 0) {
        var path = line.substring(9).trim();
        if (path) disallowed.push(path);
      }
    }
    return disallowed;
  } catch (e) {
    console.log('[scrape-website] robots.txt fetch failed — proceeding:', e.message);
    return [];
  }
}

// Check whether a URL path is disallowed by robots.txt rules.
function isDisallowedByRobots(urlString, disallowedPaths) {
  if (!disallowedPaths || disallowedPaths.length === 0) return false;
  try {
    var pathname = new URL(urlString).pathname;
    for (var i = 0; i < disallowedPaths.length; i++) {
      if (pathname.indexOf(disallowedPaths[i]) === 0) return true;
    }
  } catch (e) {}
  return false;
}

// Fetch and parse sitemap.xml from the root domain. Returns an array
// of page URLs on the same domain, or an empty array if the sitemap is
// missing, unparseable, or contains no same-domain URLs.
async function fetchSitemapUrls(origin, targetHostname) {
  try {
    var smRes = await fetch(origin + '/sitemap.xml', {
      headers: { 'User-Agent': CRAWL_USER_AGENT },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });
    if (!smRes.ok) return [];
    var xml = await smRes.text();
    // Simple regex extraction of <loc> values — sufficient for standard sitemaps
    var locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
    var match;
    var urls = [];
    while ((match = locRegex.exec(xml)) !== null) {
      var locUrl = match[1].trim();
      try {
        var parsed = new URL(locUrl);
        if (parsed.hostname.toLowerCase() === targetHostname) {
          urls.push(locUrl);
        }
      } catch (e) {}
    }
    return urls;
  } catch (e) {
    console.log('[scrape-website] sitemap.xml fetch failed — falling back to link discovery:', e.message);
    return [];
  }
}

// Extract internal same-domain links from an HTML string.
function extractLinks(html, pageUrl, targetHostname) {
  var links = [];
  var hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  var match;
  while ((match = hrefRegex.exec(html)) !== null) {
    var href = match[1].trim();
    // Skip non-page links
    if (!href || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0 || href.indexOf('javascript:') === 0) continue;
    if (href.indexOf('#') === 0) continue;
    // Resolve relative URLs
    var resolved;
    try { resolved = new URL(href, pageUrl).toString(); } catch (e) { continue; }
    // Same-domain check
    try {
      var rp = new URL(resolved);
      if (rp.hostname.toLowerCase() !== targetHostname) continue;
      // Skip non-HTML file extensions
      var ext = rp.pathname.split('.').pop().toLowerCase();
      if (NON_HTML_EXTENSIONS.indexOf(ext) > -1) continue;
    } catch (e) { continue; }
    links.push(resolved);
  }
  return links;
}

// Fetch a single page with timeout and User-Agent. Returns { html, error }.
async function fetchPage(pageUrl) {
  try {
    var pageRes = await fetch(pageUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': CRAWL_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
    });
    if (!pageRes.ok) return { html: null, error: 'HTTP ' + pageRes.status };
    var contentType = pageRes.headers.get('content-type') || '';
    if (contentType.indexOf('text/html') === -1 && contentType.indexOf('application/xhtml') === -1) {
      return { html: null, error: 'Not HTML: ' + contentType };
    }
    var html = await pageRes.text();
    return { html: html, error: null };
  } catch (e) {
    return { html: null, error: e.message || 'Fetch failed' };
  }
}

// Run the fixed-18-category extraction prompt against text content.
// Website pages are content-rich relative to documents and emails —
// the input cap is 40,000 characters (raised from 8,000) so a real
// homepage's services / pricing / team / testimonials / FAQ blocks
// all reach the model, and max_tokens is 8,000 (raised from 4,000)
// so the response can carry the full block-level extraction without
// being truncated mid-array.
async function runExtractionPrompt(content, sourceLabel, userId) {
  const userContent = 'SOURCE CONTENT (' + sourceLabel + '):\n' + (content || '').substring(0, 40000);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  const data = await response.json();
  logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'scrape-extraction' });
  const raw = data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Extraction prompt JSON parse error:', e.message, 'raw:', raw.substring(0, 500));
    return [];
  }
}

// VERSIONING — find an existing approved item the new one should auto-archive.
async function findVersionMatch(supabase, userId, newTitle, newBody, category) {
  if (!VERSION_MATCH_RULES[category]) return null;
  var existing = await supabase
    .from('content_library')
    .select('id, title')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .eq('category', category);
  if (!existing.data || existing.data.length === 0) return null;
  var candidates = existing.data.map(function(e, i) { return (i + 1) + '. ID: ' + e.id + ' — Title: ' + e.title; }).join('\n');
  var systemPrompt = VERSION_MATCH_SYSTEM_PROMPT;
  var userContent = 'CATEGORY: ' + category + '\nMATCH RULE: ' + VERSION_MATCH_RULES[category] + '\n\nNEW ITEM:\nTitle: ' + newTitle + '\nBody: ' + String(newBody || '').substring(0, 1000) + '\n\nEXISTING APPROVED ITEMS:\n' + candidates + '\n\nReturn JSON only: { "matched_id": "<existing item ID or null>" }';
  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    var data = await response.json();
    logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'scrape-versioning' });
    var raw = data.content && data.content[0] ? data.content[0].text : '';
    var jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    var parsed = JSON.parse(jsonMatch[0]);
    return parsed.matched_id && parsed.matched_id !== 'null' ? parsed.matched_id : null;
  } catch (e) {
    console.error('Version match error:', e.message);
    return null;
  }
}

// Process a single page through the full CL intake pipeline: strip HTML,
// save to cl-assets, create cl_source_items, run extraction prompt,
// insert content_library rows with versioning. Returns counts object.
// This is the existing single-page pipeline extracted into a function
// so it can be called once per page during a crawl.
async function processPage(supabase, userId, pageUrl, websiteHtml, hostname, safeHostname, scanTs) {
  var result = { itemsCount: 0, approved: 0, pending: 0, rejected: 0, auto_archived: 0, fin_docs_paired: 0, skipped: false, skipReason: null };

  var pageText = htmlToText(websiteHtml);
  if (!pageText || pageText.length < 50) {
    result.skipped = true;
    result.skipReason = 'no_extractable_content';
    return result;
  }

  // Save source HTML to cl-assets, then find-or-create the cl_source_items row.
  // content_library rows are only written when the source row exists — if
  // either step fails the page is skipped under source_row_failed.
  // Storage path includes a query-string-derived suffix (Section 3.1) so two
  // pages on the same site with different query strings don't collide on
  // upload. The fragment is excluded — it isn't sent to servers — and
  // upsert: true (Section 2.1) makes retries idempotent.
  var sourceItemId = null;
  var pageItemCount = 0;
  var pagePath = '';
  var pageSearch = '';
  try { pagePath = new URL(pageUrl).pathname.replace(/[^a-zA-Z0-9._/-]/g, '_'); } catch (e) {}
  try { pageSearch = new URL(pageUrl).search || ''; } catch (e) {}
  var searchSuffix = createHash('sha256').update(pageSearch).digest('hex').slice(0, 12);
  var storagePath = userId + '/website/' + scanTs + '_' + safeHostname + (pagePath || '') + '_' + searchSuffix + '.html';
  // Ensure no double slashes in storage path
  storagePath = storagePath.replace(/\/\//g, '/');

  var pageSourceKey;
  try {
    pageSourceKey = buildSourceUniqueKey('website', { scanTs: scanTs, fullPageUrl: pageUrl });
  } catch (keyErr) {
    console.error('[scrape-website] Source key build failed — pageUrl:', pageUrl, 'error:', keyErr.message);
    result.skipped = true;
    result.skipReason = 'source_row_failed';
    return result;
  }

  var uploadRes = await supabase.storage
    .from('cl-assets')
    .upload(storagePath, Buffer.from(websiteHtml, 'utf-8'), { contentType: 'text/html', upsert: true });
  if (uploadRes && uploadRes.error) {
    console.error('[scrape-website] Storage upload failed — pageUrl:', pageUrl, 'error:', uploadRes.error.message);
    result.skipped = true;
    result.skipReason = 'source_row_failed';
    return result;
  }

  sourceItemId = await ensureSourceItem(supabase, {
    user_id: userId,
    source_unique_key: pageSourceKey,
    source_type: 'website',
    fields: {
      source_type: 'website',
      filename: safeHostname + (pagePath || '/') + '.html',
      file_url: storagePath,
      source_url: pageUrl,
      source_detail: { url: pageUrl, hostname: hostname },
      item_count: 0,
    },
  });
  if (!sourceItemId) {
    console.error('[scrape-website] Source row failed — pageUrl:', pageUrl);
    result.skipped = true;
    result.skipReason = 'source_row_failed';
    return result;
  }

  var items = await runExtractionPrompt(pageText, hostname, userId);
  if (!items || items.length === 0) {
    result.skipped = true;
    result.skipReason = 'no_extractable_content';
    return result;
  }

  for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
    var item = items[itemIdx];
    var sourceRef = 'web:' + pageUrl + ':' + scanTs + ':' + itemIdx;
    var normCat = item.category ? (CATEGORY_LOOKUP[String(item.category).toLowerCase()] || 'Company Information') : 'Company Information';
    var isDiscard = DISCARD_CATEGORIES.indexOf(normCat) > -1;
    var status = isDiscard ? 'rejected' : (item.confidence === 'confident' ? 'approved' : 'pending');
    var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
    toolTags = applyCategoryToolMatrix(normCat, toolTags);
    var itemSourceDetail = { url: pageUrl, hostname: hostname };
    if (isDiscard) itemSourceDetail.rejection_source = 'auto';

    if (normCat === 'Financial Documents') status = 'pending';

    var versionMatchedId = null;
    if (status === 'approved' && AUTO_ARCHIVE_CATEGORIES.indexOf(normCat) > -1) {
      versionMatchedId = await findVersionMatch(supabase, userId, item.title, item.body, normCat);
    }

    var row = {
      user_id: userId,
      title: String(item.title || hostname).substring(0, 200),
      content_text: String(item.body || ''),
      category: normCat,
      tool_tags: toolTags,
      status: status,
      source: 'website',
      tool_source: 'scrape-website',
      source_ref: sourceRef,
      source_item_id: sourceItemId,
      source_detail: itemSourceDetail,
    };

    var upsertRes = await supabase.from('content_library').upsert(row, { onConflict: 'source_ref', ignoreDuplicates: true }).select('id').maybeSingle();
    if (upsertRes.error) {
      console.error('content_library insert error:', upsertRes.error.message);
      continue;
    }
    result.itemsCount++;
    pageItemCount++;
    if (status === 'approved') result.approved++;
    else if (status === 'rejected') result.rejected++;
    else result.pending++;
    var insertedRow = upsertRes.data;

    if (insertedRow && normCat === 'Financial Documents') {
      var pairMatchId = await findVersionMatch(supabase, userId, item.title, item.body, 'Financial Documents');
      if (pairMatchId) {
        var pairId = randomUUID();
        result.fin_docs_paired++;
        await supabase.from('content_library').update({ status: 'pending', version_pair_id: pairId }).eq('id', pairMatchId);
        await supabase.from('content_library').update({ version_pair_id: pairId }).eq('id', insertedRow.id);
      }
    }

    if (insertedRow && versionMatchedId) {
      var archResult = await supabase
        .from('content_library')
        .update({ status: 'archived', version_archived_by: insertedRow.id })
        .eq('id', versionMatchedId);
      if (archResult.error) console.error('Auto-archive error:', archResult.error.message);
      else result.auto_archived++;
    }
  }

  if (sourceItemId && pageItemCount > 0) {
    await supabase.from('cl_source_items').update({ item_count: pageItemCount }).eq('id', sourceItemId);
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { userId, url } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    var hostname = '';
    try { hostname = new URL(url).hostname.toLowerCase(); } catch (e) { hostname = 'unknown'; }
    var safeHostname = hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
    var origin = '';
    try { origin = new URL(url).origin; } catch (e) {}

    var scanTs = Date.now();
    var visited = new Set();
    var totalChars = 0;
    var totalItemsCount = 0;
    var totalApproved = 0;
    var totalPending = 0;
    var totalRejected = 0;
    var totalAutoArchived = 0;
    var totalFinDocsPaired = 0;
    var pagesCrawled = 0;
    var pagesSkipped = 0;
    var skipped_reasons = {};

    function addSkipReason(reason) {
      skipped_reasons[reason] = (skipped_reasons[reason] || 0) + 1;
      pagesSkipped++;
    }

    // ── Fetch robots.txt ──────────────────────────────────────────────
    var disallowedPaths = [];
    if (origin) {
      disallowedPaths = await fetchRobotsTxt(origin);
      if (disallowedPaths.length > 0) {
        console.log('[scrape-website] robots.txt loaded —', disallowedPaths.length, 'disallow rules');
      }
    }

    // ── Build page queue ──────────────────────────────────────────────
    // Try sitemap first, fall back to link-following from the start URL.
    // The queue is a list of { url, depth } entries. Breadth-first.
    var queue = [];
    var usedSitemap = false;

    if (origin) {
      var sitemapUrls = await fetchSitemapUrls(origin, hostname);
      if (sitemapUrls.length > 0) {
        usedSitemap = true;
        console.log('[scrape-website] sitemap.xml found —', sitemapUrls.length, 'URLs');
        // Add sitemap URLs up to MAX_PAGES_PER_CRAWL, filtering robots
        for (var si = 0; si < sitemapUrls.length && queue.length < MAX_PAGES_PER_CRAWL; si++) {
          var smNorm = normaliseUrl(sitemapUrls[si]);
          if (visited.has(smNorm)) continue;
          if (isDisallowedByRobots(sitemapUrls[si], disallowedPaths)) {
            addSkipReason('robots_txt_disallowed');
            continue;
          }
          visited.add(smNorm);
          queue.push({ url: sitemapUrls[si], depth: 0 });
        }
      }
    }

    // If no sitemap URLs were found, start with the provided URL
    if (queue.length === 0) {
      var startNorm = normaliseUrl(url);
      if (isDisallowedByRobots(url, disallowedPaths)) {
        return res.status(200).json({
          success: true, count: 0, approved: 0, pending: 0, rejected: 0,
          pages_crawled: 0, pages_skipped: 1,
          skipped_reasons: { robots_txt_disallowed: 1 },
          message: 'Start URL blocked by robots.txt'
        });
      }
      visited.add(startNorm);
      queue.push({ url: url, depth: 0 });
    }

    console.log('[scrape-website] Crawl starting — queue:', queue.length, 'usedSitemap:', usedSitemap, 'hostname:', hostname);

    // ── Process pages sequentially ────────────────────────────────────
    var queueIdx = 0;
    while (queueIdx < queue.length) {
      var entry = queue[queueIdx];
      queueIdx++;

      console.log('[scrape-website] Fetching page', pagesCrawled + 1, '/', queue.length, '—', entry.url);

      // Fetch the page
      var fetchResult = await fetchPage(entry.url);
      if (!fetchResult.html) {
        console.log('[scrape-website] Fetch failed:', entry.url, fetchResult.error);
        addSkipReason('fetch_failed');
        continue;
      }

      var websiteHtml = fetchResult.html;
      var pageText = htmlToText(websiteHtml);
      var pageCharCount = pageText ? pageText.length : 0;

      // Character cap check
      if (totalChars + pageCharCount > MAX_TOTAL_CHARS) {
        console.log('[scrape-website] Character cap reached — totalChars:', totalChars, 'pageChars:', pageCharCount);
        addSkipReason('character_cap_reached');
        continue;
      }
      totalChars += pageCharCount;

      // Process this page through the full CL intake pipeline
      var pageResult = await processPage(supabase, userId, entry.url, websiteHtml, hostname, safeHostname, scanTs);
      pagesCrawled++;

      if (pageResult.skipped) {
        addSkipReason(pageResult.skipReason || 'no_extractable_content');
      } else {
        totalItemsCount += pageResult.itemsCount;
        totalApproved += pageResult.approved;
        totalPending += pageResult.pending;
        totalRejected += pageResult.rejected;
        totalAutoArchived += pageResult.auto_archived;
        totalFinDocsPaired += pageResult.fin_docs_paired;
      }

      // Discover links for subpage crawling (only when not using sitemap)
      if (!usedSitemap && entry.depth < MAX_CRAWL_DEPTH) {
        var discoveredLinks = extractLinks(websiteHtml, entry.url, hostname);
        for (var li = 0; li < discoveredLinks.length && queue.length < MAX_PAGES_PER_CRAWL; li++) {
          var linkNorm = normaliseUrl(discoveredLinks[li]);
          if (visited.has(linkNorm)) continue;
          visited.add(linkNorm);
          if (isDisallowedByRobots(discoveredLinks[li], disallowedPaths)) {
            addSkipReason('robots_txt_disallowed');
            continue;
          }
          queue.push({ url: discoveredLinks[li], depth: entry.depth + 1 });
        }
      }
    }

    console.log('[scrape-website] Crawl complete — pages:', pagesCrawled, 'items:', totalItemsCount, 'skipped:', pagesSkipped);

    return res.status(200).json({
      success: true,
      count: totalItemsCount,
      imported: totalItemsCount,
      approved: totalApproved,
      pending: totalPending,
      rejected: totalRejected,
      auto_archived: totalAutoArchived,
      fin_docs_paired: totalFinDocsPaired,
      pages_crawled: pagesCrawled,
      pages_skipped: pagesSkipped,
      skipped_reasons: skipped_reasons,
      message: totalItemsCount + ' item' + (totalItemsCount !== 1 ? 's' : '') + ' extracted from ' + pagesCrawled + ' page' + (pagesCrawled !== 1 ? 's' : '')
    });

  } catch (err) {
    console.error('scrape-website error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, error: (err && err.message) || 'unknown' });
  }
}
