// api/scrape-website.js — Task 10 CL Connections
// Endpoint for the Website source. Rewritten to use the canonical CL
// intake pipeline shared by every other connector
// (sharepoint-import, dropbox-import, onedrive-import, drive-import,
// cl-email-scan, cl-outlook-scan).
//
// Behaviour:
//   POST { userId, url } → fetches the page, strips HTML to plain text,
//   runs the fixed-18-category extraction prompt, applies disposition /
//   confidence / Financial Documents / auto-archive logic, and inserts
//   the resulting row into content_library with the same shape every
//   other connector uses. Per the canonical prompt the whole page is
//   treated as one item, so a scan produces at most one content_library
//   row per URL.
//
// Auth: userId is taken from the request body to preserve compatibility
// with cl-upload.js, which posts to this endpoint without a JWT header
// (matching cl-email-scan.js and cl-outlook-scan.js).
//
// Re-scan semantics: source_ref includes a timestamp so each scan
// produces fresh rows rather than being deduped away by the source_ref
// unique constraint. This matches the source-tile note in cl-upload.js:
// "Rescanning reproduces all content as new Pending items".
//
// Response: { success: true, count: <imported>, message: ... }. The
// `count` field is preserved as the primary import counter so the
// existing cl-upload.js caller continues to work unchanged.

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

var DISCARD_CATEGORIES = ['Legal', 'IT', 'Spam', 'Customer Enquiries', 'Complaints'];
var ALLOWED_TOOL_IDS = ['strategic-plan', 'news-digest', 'chatbot', 'social', 'bi', 'tender', 'quote-enhancer'];
var ALL_CATEGORIES = [
  'Products & Services', 'Pricing', 'Company Information', 'Jobs, Portfolio & Photos',
  'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Industry News',
  'Tender & Proposal Documents', 'Financial Documents', 'Compliance & Certificates',
  'Safety & SWMS', 'Supplier Communications', 'Manual Upload',
  'Legal', 'IT', 'Spam', 'Customer Enquiries', 'Complaints'
];
var CATEGORY_LOOKUP = {};
ALL_CATEGORIES.forEach(function(c) { CATEGORY_LOOKUP[c.toLowerCase()] = c; });

var AUTO_ARCHIVE_CATEGORIES = [
  'Products & Services', 'Pricing', 'Company Information', 'Promotions & Offers',
  'Supplier Communications', 'Compliance & Certificates', 'Safety & SWMS'
];

var VERSION_MATCH_RULES = {
  'Products & Services': 'Match on similarity of title and subject matter.',
  'Pricing': 'Match on similarity of title and subject matter.',
  'Company Information': 'Match on subject — person name for bios, policy or subject for announcements. New person or new announcement is additive.',
  'Promotions & Offers': 'Match on promotion name or subject — new promotion is additive.',
  'Supplier Communications': 'Match on supplier name and subject — new communication is additive.',
  'Compliance & Certificates': 'Match on title and subject — same licence or certificate type supersedes previous. Different licence types are additive.',
  'Safety & SWMS': 'Match on title and subject — same work activity supersedes previous. Different activities are additive.',
  'Financial Documents': 'Periodic documents (Profit & Loss Statement, Balance Sheet, Cash Flow Statement, Tax Return, BAS/GST Return, Payroll Summary) — match on document type and period. Transactional documents (Invoice, Receipt, Purchase Order, Bank Statement, Supplier Statement) — always additive, never supersede.'
};

var EXTRACTION_SYSTEM_PROMPT = "You are a content extraction assistant for a business content library. The source material is a webpage. Identify each distinct meaningful content block on the page and produce one summary per block.\n\n" +
  "Return a JSON array with one object per distinct content block found (or an empty array if no meaningful content is present), each object containing these fields:\n" +
  "- \"title\": string, max 10 words, descriptive of the whole document\n" +
  "- \"body\": string, concise plain text summary of the block in your own words — capture the key facts, main points, and important details. Do NOT reproduce the source content verbatim. Do NOT include long passages of original text. Do NOT include bullet point lists copied from the source. Summarise the block.\n" +
  "- \"category\": string, must exactly match one category name from the CATEGORIES section — copy the name exactly including punctuation, capitalisation, and the trailing 's' on plural names\n" +
  "- \"disposition\": string, \"keep\" or \"discard\" — must match the disposition listed for the assigned category\n" +
  "- \"confidence\": string, \"confident\" or \"uncertain\" — confident when the category is clear, uncertain when the content could fit multiple categories\n" +
  "- \"tool_tags\": array of tool ID strings from the TOOLS section — only tag tools whose description matches the content\n\n" +
  "CATEGORIES:\n\nKeep:\n" +
  "- Products & Services: Descriptions of what the business offers, sells, or delivers. Includes service descriptions, product information, and equipment or materials the business supplies to customers. Does not include pricing, promotions, or the business's own owned assets.\n" +
  "- Pricing: What the business charges for its products and services. Includes rate cards, price lists, package pricing, and hourly or project rates. Does not include promotional or limited-time offers.\n" +
  "- Company Information: Information that describes what the business is. Includes About Us content, business history, ownership, locations, team bios, staff profiles, culture, values, and business-owned assets such as equipment and vehicles. Does not include what the business offers or charges.\n" +
  "- Jobs, Portfolio & Photos: Records of work the business has completed or is currently delivering. Includes job photos, project descriptions, before-and-after content, and case studies. Does not include general promotional content or testimonials.\n" +
  "- Promotions & Offers: Time-limited or special pricing and deals created and offered by this business to its own customers. Includes seasonal promotions, discount offers, referral incentives, and limited-time packages the business is running. Does not include promotions or offers received from suppliers or third parties.\n" +
  "- Customer Testimonials: Feedback and reviews provided by customers about their experience with the business. Includes written reviews, star ratings with comments, and case study quotes. Does not include general marketing copy written by the business itself.\n" +
  "- Tips & How-To: Useful information the business shares to educate or help its customers. Includes how-to guides, maintenance tips, advice articles, and explainer content. Does not include promotional content or service descriptions.\n" +
  "- Industry News: News, trends, and developments relevant to the business's industry or market. Includes trade publications, supplier announcements, regulatory changes, and market updates. Does not include content created by the business itself.\n" +
  "- Tender & Proposal Documents: Formal documents prepared by the business to win work. Includes tender submissions, project proposals, scope of works, and quotes prepared for specific jobs. Does not include standard pricing or general service descriptions.\n" +
  "- Financial Documents: Internal financial records and reporting. Includes invoices, statements, tax documents, profit and loss reports, and bank records. Does not include pricing guides or supplier quotes.\n" +
  "- Compliance & Certificates: Licences, registrations, and certifications held by the business or its staff. Includes trade licences, insurance certificates, accreditations, and regulatory compliance documents. Does not include safety plans or method statements.\n" +
  "- Safety & SWMS: Safety documentation for work activities. Includes Safe Work Method Statements, risk assessments, safety plans, and site-specific safety requirements. Does not include compliance certificates or licences.\n" +
  "- Supplier Communications: Correspondence and documents received from suppliers and vendors. Includes supplier price lists, product catalogues, delivery notifications, and trade account correspondence. Does not include supplier statements or invoices (Financial Documents). Does not include industry news or market updates.\n\n" +
  "Discard:\n" +
  "- Legal: Legal correspondence, contracts, agreements, and notices.\n" +
  "- IT: Technology and systems correspondence. Includes software licences, hosting invoices, IT support tickets.\n" +
  "- Spam: Unsolicited or irrelevant content with no business value.\n" +
  "- Customer Enquiries: Inbound messages from prospective or existing customers asking about services, availability, or pricing.\n" +
  "- Complaints: Negative feedback or dispute correspondence from customers.\n\n" +
  "TOOLS (only tag tools whose description matches the content):\n" +
  "- strategic-plan: Helps create a strategic business plan and 90-day action plan. Needs content describing what the business does, charges, its market position, team, finances, and goals.\n" +
  "- news-digest: Summarises industry news and regulatory changes. Needs content reporting on regulatory changes, market conditions, technology, and industry developments.\n" +
  "- chatbot: Answers customer questions on the business website. Needs content about services, pricing, processes, and team.\n" +
  "- social: Creates social posts and marketing content. Needs content about completed jobs, promotions, testimonials, tips, and material to promote.\n" +
  "- bi: Provides AI business insights from business data and market context. Needs broad business content to identify patterns, opportunities, and risks.\n" +
  "- tender: Generates tender and proposal documents. Needs content about capabilities, past work, team, certifications, and pricing.\n" +
  "- quote-enhancer: Enhances quotes into professional branded documents. Needs company information, past jobs, testimonials, licences, and safety information.\n\n" +
  "RULES:\n" +
  "1. Identify each distinct meaningful content block on the page and return ONE object per block. A meaningful block is a discrete piece of business-relevant content — for example, a service description, a pricing entry, a testimonial, a team or culture statement, a promotional offer, a news item, or a tip or how-to. Ignore navigation menus, headers, footers, cookie notices, contact forms, and generic page furniture.\n" +
  "2. Body must be a concise summary in your own words — capture the block's purpose and key facts without reproducing the source content. Never copy long passages or bullet lists from the source.\n" +
  "3. Category must exactly match one name from the categories list — copy it character-for-character.\n" +
  "4. Disposition must match the category's listed disposition.\n" +
  "5. Only tag tools whose description specifically matches the content.\n" +
  "6. Return a valid JSON array only. No preamble, no explanation, no markdown fences.\n" +
  "7. If no meaningful content can be extracted, return an empty array [].";

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

// Run the fixed-18-category extraction prompt against text content.
// Website pages are content-rich relative to documents and emails —
// the input cap is 40,000 characters (raised from 8,000) so a real
// homepage's services / pricing / team / testimonials / FAQ blocks
// all reach the model, and max_tokens is 8,000 (raised from 4,000)
// so the response can carry the full block-level extraction without
// being truncated mid-array.
async function runExtractionPrompt(content, sourceLabel) {
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
  var systemPrompt = 'You are a versioning matcher for a business content library. Given a new item and existing approved items in the same category, determine if the new item is a replacement of an existing item or is additive (should coexist). Return JSON only.';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { userId, url } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    // Resolve hostname for filename and source_detail
    var hostname = '';
    try { hostname = new URL(url).hostname; } catch (e) { hostname = 'unknown'; }
    var safeHostname = hostname.replace(/[^a-zA-Z0-9.-]/g, '_');

    // Fetch the page HTML. fetch() with redirect: follow handles 3xx
    // chains automatically. AbortSignal.timeout caps slow or hung
    // user-supplied sites at 15 seconds so a single bad URL cannot eat
    // the whole 300s function budget. The other connectors talk to
    // known cloud APIs and do not need this guard; arbitrary websites do.
    let websiteHtml = '';
    try {
      const pageRes = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; StaxAI/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!pageRes.ok) {
        return res.status(502).json({ success: false, error: 'Website returned ' + pageRes.status });
      }
      websiteHtml = await pageRes.text();
    } catch (e) {
      console.error('Website fetch failed:', e && e.message ? e.message : e);
      return res.status(502).json({ success: false, error: 'Website fetch failed: ' + ((e && e.message) || 'unknown') });
    }

    // Strip HTML to plain text for the extraction prompt
    var pageText = htmlToText(websiteHtml);
    if (!pageText || pageText.length < 50) {
      return res.status(200).json({ success: true, count: 0, approved: 0, pending: 0, rejected: 0, message: 'No readable content found on the page' });
    }

    // Save source HTML to cl-assets and create cl_source_items row.
    // Each scan creates a fresh source-items row — websites are not
    // de-duplicated across scans because page content changes over time
    // and the spec is "Rescanning reproduces all content as new Pending
    // items" (cl-upload.js source tile note for the website source).
    var sourceItemId = null;
    var pageItemCount = 0;
    try {
      var storagePath = userId + '/website/' + Date.now() + '_' + safeHostname + '.html';
      await supabase.storage.from('cl-assets').upload(storagePath, Buffer.from(websiteHtml, 'utf-8'), { contentType: 'text/html', upsert: false });
      var siResult = await supabase
        .from('cl_source_items')
        .insert({
          user_id: userId,
          source_type: 'website',
          filename: safeHostname + '.html',
          file_url: storagePath,
          source_url: url,
          source_detail: { url: url, hostname: hostname },
          item_count: 0,
        })
        .select('id')
        .single();
      if (siResult.data) sourceItemId = siResult.data.id;
    } catch (e) {
      console.error('cl-assets/cl_source_items save error:', e.message);
    }

    // Run the canonical extraction prompt — returns one object per
    // distinct content block found on the page, per the prompt's
    // RULES section after the block-extraction rewrite.
    const items = await runExtractionPrompt(pageText, hostname);
    if (!items || items.length === 0) {
      return res.status(200).json({ success: true, count: 0, approved: 0, pending: 0, rejected: 0, message: 'No content extracted from the page' });
    }

    const scanTs = Date.now();
    let itemsCount = 0;
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    var auto_archived = 0;
    var fin_docs_paired = 0;

    for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const item = items[itemIdx];
      const sourceRef = 'web:' + url + ':' + scanTs + ':' + itemIdx;
      var normCat = item.category ? (CATEGORY_LOOKUP[String(item.category).toLowerCase()] || 'Company Information') : 'Company Information';
      var isDiscard = DISCARD_CATEGORIES.indexOf(normCat) > -1;
      var status = isDiscard ? 'rejected' : (item.confidence === 'confident' ? 'approved' : 'pending');
      var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
      var itemSourceDetail = { url: url, hostname: hostname };
      if (isDiscard) itemSourceDetail.rejection_source = 'auto';

      // Versioning — Financial Documents always go to pending. Pair check happens after insert.
      if (normCat === 'Financial Documents') status = 'pending';

      // Versioning — auto-archive match check (only approved items in archive categories)
      var versionMatchedId = null;
      if (status === 'approved' && AUTO_ARCHIVE_CATEGORIES.indexOf(normCat) > -1) {
        versionMatchedId = await findVersionMatch(supabase, userId, item.title, item.body, normCat);
      }

      const row = {
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

      const upsertRes = await supabase.from('content_library').upsert(row, { onConflict: 'source_ref', ignoreDuplicates: true }).select('id').maybeSingle();
      if (upsertRes.error) {
        console.error('content_library insert error:', upsertRes.error.message);
        continue;
      }
      itemsCount++;
      pageItemCount++;
      if (status === 'approved') approved++;
      else if (status === 'rejected') rejected++;
      else pending++;
      const insertedRow = upsertRes.data;

      // Versioning — Financial Documents pair check (after insert)
      if (insertedRow && normCat === 'Financial Documents') {
        var pairMatchId = await findVersionMatch(supabase, userId, item.title, item.body, 'Financial Documents');
        if (pairMatchId) {
          var pairId = randomUUID();
          fin_docs_paired++;
          await supabase.from('content_library').update({ status: 'pending', version_pair_id: pairId }).eq('id', pairMatchId);
          await supabase.from('content_library').update({ version_pair_id: pairId }).eq('id', insertedRow.id);
        }
      }

      // Versioning — apply auto-archive on match
      if (insertedRow && versionMatchedId) {
        var archResult = await supabase
          .from('content_library')
          .update({ status: 'archived', version_archived_by: insertedRow.id })
          .eq('id', versionMatchedId);
        if (archResult.error) console.error('Auto-archive error:', archResult.error.message);
        else auto_archived++;
      }
    }

    // Update cl_source_items item_count
    if (sourceItemId && pageItemCount > 0) {
      await supabase.from('cl_source_items').update({ item_count: pageItemCount }).eq('id', sourceItemId);
    }

    return res.status(200).json({
      success: true,
      count: itemsCount,
      approved: approved,
      pending: pending,
      rejected: rejected,
      auto_archived: auto_archived,
      fin_docs_paired: fin_docs_paired,
      message: itemsCount + ' item' + (itemsCount !== 1 ? 's' : '') + ' extracted from website'
    });

  } catch (err) {
    console.error('scrape-website error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, error: (err && err.message) || 'unknown' });
  }
}
