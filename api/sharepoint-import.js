// api/sharepoint-import.js — Task 10 Step 4
// Action-dispatch import endpoint for SharePoint sources. JWT required.
//
// Multi-account / multi-site: tokens and selected sites are read from
// profiles.cl_sharepoint_accounts (jsonb array). Each entry shape:
//   { account_email, access_token, refresh_token, connected_at,
//     sites: [
//       { id, displayName, webUrl, libraries: [{ id, name }, ...] },
//       ...
//     ],
//     last_scanned_at? }
//
// Legacy entries shaped { site: {...}, libraries: [...] } are upgraded
// in-memory by upgradeSharepointEntry on read and persisted on the next
// write (token refresh, last_scanned_at update).
//
// Actions:
//   list-sites     { accountEmail }                          → sites the user can access
//   list-libraries { accountEmail, siteId }                  → document libraries on the named site
//   import-all     { accountEmail, siteId, libraryId }       → scan one library, full pipeline
//
// Mirrors onedrive-import.js for the multi-account, refresh, extraction,
// versioning, and source-item plumbing. The chosen site is identified by
// siteId in the request body and looked up inside entry.sites.

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

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

var EXTRACTION_SYSTEM_PROMPT = "You are a content extraction assistant for a business content library. Treat the source material as a single item — produce exactly one summary representing the whole document, never multiple summaries by section.\n\n" +
  "Return a JSON array containing exactly ONE object (or zero objects if no meaningful content can be extracted) with these fields:\n" +
  "- \"title\": string, max 10 words, descriptive of the whole document\n" +
  "- \"body\": string, concise plain text summary of the whole document in your own words — capture the key facts, main points, and important details. Do NOT reproduce the source content verbatim. Do NOT include long passages of original text. Do NOT include bullet point lists copied from the source. Summarise the document as a whole.\n" +
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
  "- Supplier Communications: Correspondence and documents received from suppliers and vendors. Includes supplier price lists, product catalogues, delivery notifications, and trade account correspondence. Does not include supplier statements or invoices (Financial Documents). Does not include industry news or market updates.\n" +
  "- Manual Upload: Content manually added by the business owner that does not fit other categories.\n\n" +
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
  "1. Treat the entire source as ONE item. Return a JSON array with exactly one element representing the whole source. Do NOT split the source into multiple items by section, heading, theme, or paragraph.\n" +
  "2. Body must be a concise summary in your own words — capture the document's purpose and key facts without reproducing the source content. Never copy long passages or bullet lists from the source.\n" +
  "3. Category must exactly match one name from the categories list — copy it character-for-character.\n" +
  "4. Disposition must match the category's listed disposition.\n" +
  "5. Only tag tools whose description specifically matches the content.\n" +
  "6. Return a valid JSON array only. No preamble, no explanation, no markdown fences.\n" +
  "7. If no meaningful content can be extracted, return an empty array [].";

const SHAREPOINT_BINARY_DOC_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

// Lazy-upgrade a SharePoint account entry from the legacy single-site
// shape ({ site, libraries }) to the multi-site shape ({ sites: [...] }).
// Idempotent — safe to call on already-upgraded entries.
function upgradeSharepointEntry(entry) {
  if (!entry) return;
  if (entry.site && entry.site.id) {
    if (!Array.isArray(entry.sites)) entry.sites = [];
    var siteAlreadyIn = entry.sites.some(function (s) { return s && s.id === entry.site.id; });
    if (!siteAlreadyIn) {
      entry.sites.push({
        id: entry.site.id,
        displayName: entry.site.displayName,
        webUrl: entry.site.webUrl,
        libraries: Array.isArray(entry.libraries) ? entry.libraries : [],
      });
    }
    delete entry.site;
    delete entry.libraries;
  } else if (!Array.isArray(entry.sites)) {
    entry.sites = [];
  }
}

// Refresh a Microsoft OAuth token for SharePoint scopes.
async function refreshMicrosoftToken(refreshToken) {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'Sites.Read.All offline_access User.Read',
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Microsoft token refresh failed: ' + (data.error_description || data.error || 'unknown'));
  return { access_token: data.access_token, refresh_token: data.refresh_token || refreshToken };
}

// Download a SharePoint file as a Buffer (follows redirect to download URL).
async function fetchSharePointFileBuffer(siteId, libraryId, itemId, accessToken) {
  const url = 'https://graph.microsoft.com/v1.0/sites/' + siteId + '/drives/' + libraryId + '/items/' + itemId + '/content';
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + accessToken },
    redirect: 'follow',
  });
  if (!res.ok) {
    console.error('SharePoint file download failed:', itemId, res.status);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

// Extract text from a binary document via Claude document API.
async function extractBinaryFileText(base64Data, mimeType) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64Data } },
        { type: 'text', text: 'Extract all text content from this document. Return only the raw text, preserving structure. No commentary.' }
      ]}],
    }),
  });
  const data = await response.json();
  if (data.content && data.content[0]) return data.content[0].text;
  return null;
}

// Resolve a SharePoint file to plain-text body suitable for the extraction prompt.
async function fetchSharePointFileText(siteId, libraryId, itemId, mimeType, accessToken) {
  const buffer = await fetchSharePointFileBuffer(siteId, libraryId, itemId, accessToken);
  if (!buffer) return null;
  if (SHAREPOINT_BINARY_DOC_MIME.indexOf(mimeType) > -1) {
    return await extractBinaryFileText(buffer.toString('base64'), mimeType);
  }
  if (mimeType && mimeType.indexOf('text/') === 0) {
    return buffer.toString('utf-8').substring(0, 8000);
  }
  return null;
}

// Run the fixed-18-category extraction prompt.
async function runExtractionPrompt(content, fileName) {
  const userContent = 'SOURCE CONTENT (' + fileName + '):\n' + (content || '').substring(0, 8000);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
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

  // ── JWT auth (required) ──────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authRes = await supabase.auth.getUser(token);
  if (authRes.error || !authRes.data || !authRes.data.user) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  const userId = authRes.data.user.id;

  const body = req.body || {};
  const action = body.action;
  const accountEmail = body.accountEmail;
  const libraryId = body.libraryId;
  const siteIdParam = body.siteId;

  if (!action) return res.status(400).json({ error: 'action required' });
  if (!accountEmail) return res.status(400).json({ error: 'accountEmail required' });

  try {
    // ── Read profile and resolve account entry ─────────────────────────
    const profileRes = await supabase
      .from('profiles')
      .select('cl_sharepoint_accounts')
      .eq('id', userId)
      .single();
    if (profileRes.error) {
      console.error('sharepoint-import profile read error:', profileRes.error.message);
      return res.status(500).json({ error: profileRes.error.message });
    }
    const accounts = Array.isArray(profileRes.data && profileRes.data.cl_sharepoint_accounts)
      ? profileRes.data.cl_sharepoint_accounts
      : [];
    accounts.forEach(upgradeSharepointEntry);
    const entryIdx = accounts.findIndex(function(a) { return a && a.account_email === accountEmail; });
    if (entryIdx === -1) {
      return res.status(400).json({ error: 'SharePoint account not connected' });
    }
    const entry = accounts[entryIdx];
    if (!entry.access_token) {
      return res.status(400).json({ error: 'SharePoint account has no access token. Please reconnect.' });
    }

    // ── Refresh access token if a refresh token is available ───────────
    let accessToken = entry.access_token;
    if (entry.refresh_token) {
      try {
        const refreshed = await refreshMicrosoftToken(entry.refresh_token);
        accessToken = refreshed.access_token;
        accounts[entryIdx].access_token = refreshed.access_token;
        accounts[entryIdx].refresh_token = refreshed.refresh_token;
        await supabase.from('profiles').update({ cl_sharepoint_accounts: accounts }).eq('id', userId);
      } catch (e) {
        console.error('SharePoint token refresh failed:', e.message);
        return res.status(401).json({ error: 'SharePoint token expired. Please reconnect this account in Settings.' });
      }
    }

    // ── ACTION: list-sites ─────────────────────────────────────────────
    // Returns all sites the authenticated user can access. The picker UI
    // saves the chosen site into entry.site before any other action runs.
    if (action === 'list-sites') {
      const sitesRes = await fetch(
        'https://graph.microsoft.com/v1.0/sites?search=*&$top=200&$select=id,displayName,name,webUrl',
        { headers: { 'Authorization': 'Bearer ' + accessToken } }
      );
      if (!sitesRes.ok) {
        const errBody = await sitesRes.json().catch(function() { return {}; });
        const errMsg = (errBody.error && errBody.error.message) || ('Microsoft Graph returned ' + sitesRes.status);
        console.error('SharePoint list-sites error:', errMsg);
        return res.status(502).json({ error: 'SharePoint API error: ' + errMsg });
      }
      const sitesData = await sitesRes.json();
      const sites = (sitesData.value || []).map(function(s) {
        return { id: s.id, displayName: s.displayName || s.name, webUrl: s.webUrl };
      });
      return res.status(200).json({ success: true, sites: sites });
    }

    // ── ACTION: list-libraries ─────────────────────────────────────────
    // Picker UI passes siteId for the site whose libraries it wants to list.
    // The site must already be in entry.sites (added via the site picker).
    if (action === 'list-libraries') {
      var sitesArr = Array.isArray(entry.sites) ? entry.sites : [];
      var site = null;
      if (siteIdParam) {
        site = sitesArr.find(function (s) { return s && s.id === siteIdParam; }) || null;
      } else if (sitesArr.length > 0) {
        site = sitesArr[0];
      }
      if (!site || !site.id) {
        return res.status(400).json({ error: 'site_not_set' });
      }
      const libRes = await fetch(
        'https://graph.microsoft.com/v1.0/sites/' + site.id + '/drives?$select=id,name,driveType',
        { headers: { 'Authorization': 'Bearer ' + accessToken } }
      );
      if (!libRes.ok) {
        const errBody = await libRes.json().catch(function() { return {}; });
        const errMsg = (errBody.error && errBody.error.message) || ('Microsoft Graph returned ' + libRes.status);
        console.error('SharePoint list-libraries error:', errMsg);
        return res.status(502).json({ error: 'SharePoint API error: ' + errMsg });
      }
      const libData = await libRes.json();
      const libraries = (libData.value || [])
        .filter(function(d) { return d && d.driveType === 'documentLibrary'; })
        .map(function(d) { return { id: d.id, name: d.name }; });
      return res.status(200).json({ success: true, libraries: libraries });
    }

    // ── ACTION: import-all ─────────────────────────────────────────────
    // The body identifies which site (siteId) and which library (libraryId)
    // to scan. The site must already be in entry.sites.
    if (action === 'import-all') {
      if (!libraryId) return res.status(400).json({ error: 'libraryId required' });
      var sitesArrImp = Array.isArray(entry.sites) ? entry.sites : [];
      var site = null;
      if (siteIdParam) {
        site = sitesArrImp.find(function (s) { return s && s.id === siteIdParam; }) || null;
      } else if (sitesArrImp.length > 0) {
        site = sitesArrImp[0];
      }
      if (!site || !site.id) {
        return res.status(400).json({ error: 'site_not_set' });
      }
      const siteId = site.id;
      const siteName = site.displayName || site.name || siteId;

      // Resolve library name for source_detail
      let libraryName = libraryId;
      try {
        const libNameRes = await fetch(
          'https://graph.microsoft.com/v1.0/sites/' + siteId + '/drives/' + libraryId + '?$select=id,name',
          { headers: { 'Authorization': 'Bearer ' + accessToken } }
        );
        if (libNameRes.ok) {
          const libNameData = await libNameRes.json();
          libraryName = libNameData.name || libraryId;
        }
      } catch (e) {
        console.error('SharePoint library name lookup failed:', e.message);
      }

      // List children of the library root
      const filesRes = await fetch(
        'https://graph.microsoft.com/v1.0/sites/' + siteId + '/drives/' + libraryId + '/root/children?$top=200&$select=id,name,file,folder,size,createdDateTime',
        { headers: { 'Authorization': 'Bearer ' + accessToken } }
      );
      if (!filesRes.ok) {
        const errBody = await filesRes.json().catch(function() { return {}; });
        const errMsg = (errBody.error && errBody.error.message) || ('Microsoft Graph returned ' + filesRes.status);
        console.error('SharePoint list-children error:', errMsg);
        return res.status(502).json({ error: 'SharePoint API error: ' + errMsg });
      }
      const filesData = await filesRes.json();
      const allFiles = (filesData.value || []).filter(function(it) { return it && it.file; });

      // Skip files that already have a cl_source_items row from a prior scan
      const existingSI = await supabase
        .from('cl_source_items')
        .select('source_detail')
        .eq('user_id', userId)
        .eq('source_type', 'sharepoint');
      const scannedItemIds = new Set(
        ((existingSI && existingSI.data) || [])
          .map(function(r) { return r.source_detail && r.source_detail.sharepoint_item_id; })
          .filter(Boolean)
      );
      const files = allFiles.filter(function(f) { return !scannedItemIds.has(f.id); });

      let imported = 0;
      let skipped = 0;

      for (const file of files) {
        const mimeType = (file.file && file.file.mimeType) || '';
        const isImage = mimeType.indexOf('image/') === 0;
        const isText = mimeType.indexOf('text/') === 0;
        const isBinaryDoc = SHAREPOINT_BINARY_DOC_MIME.indexOf(mimeType) > -1;

        if (!isImage && !isText && !isBinaryDoc) { skipped++; continue; }

        let textContent = null;
        let imageBuffer = null;

        if (isImage) {
          imageBuffer = await fetchSharePointFileBuffer(siteId, libraryId, file.id, accessToken);
          if (!imageBuffer) { skipped++; continue; }
        } else {
          textContent = await fetchSharePointFileText(siteId, libraryId, file.id, mimeType, accessToken);
          if (!textContent) { skipped++; continue; }
        }

        // Save source bytes to cl-assets and create cl_source_items row
        var sourceItemId = null;
        var fileItemCount = 0;
        try {
          var safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          var storagePath = userId + '/sharepoint/' + file.id + '_' + safeFileName;
          if (isImage && imageBuffer) {
            await supabase.storage.from('cl-assets').upload(storagePath, imageBuffer, { contentType: mimeType, upsert: false });
          } else if (textContent) {
            await supabase.storage.from('cl-assets').upload(storagePath, Buffer.from(textContent, 'utf-8'), { contentType: 'text/plain', upsert: false });
          }
          var siResult = await supabase
            .from('cl_source_items')
            .insert({
              user_id: userId,
              source_type: 'sharepoint',
              filename: file.name,
              file_url: storagePath,
              source_url: null,
              source_detail: { sharepoint_item_id: file.id, site_id: siteId, site_name: siteName, library_id: libraryId, library_name: libraryName, mime_type: mimeType, account_email: accountEmail },
              item_count: 0,
            })
            .select('id')
            .single();
          if (siResult.data) sourceItemId = siResult.data.id;
        } catch (e) {
          console.error('cl-assets/cl_source_items save error:', e.message);
        }

        // Images: stub row for manual categorisation. Full image vision is Task 12.
        if (isImage) {
          const sourceRef = 'sharepoint:' + file.id + ':0';
          const row = {
            user_id: userId,
            title: String(file.name).substring(0, 200),
            content_text: 'Image asset: ' + file.name,
            category: 'Manual Upload',
            tool_tags: [],
            status: 'pending',
            source: 'sharepoint',
            tool_source: 'sharepoint-import',
            source_ref: sourceRef,
            source_item_id: sourceItemId,
            source_detail: { filename: file.name, site_name: siteName, library_name: libraryName, mime_type: mimeType, account_email: accountEmail },
          };
          const insertRes = await supabase.from('content_library').upsert(row, { onConflict: 'source_ref', ignoreDuplicates: true });
          if (!insertRes.error) { imported++; fileItemCount++; }
          if (sourceItemId && fileItemCount > 0) {
            await supabase.from('cl_source_items').update({ item_count: fileItemCount }).eq('id', sourceItemId);
          }
          continue;
        }

        // Text/document: run extraction prompt and insert one row per returned item
        const items = await runExtractionPrompt(textContent, file.name);
        if (!items || items.length === 0) { skipped++; continue; }

        for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
          const item = items[itemIdx];
          const sourceRef = 'sharepoint:' + file.id + ':' + itemIdx;
          var normCat = item.category ? (CATEGORY_LOOKUP[String(item.category).toLowerCase()] || 'Manual Upload') : 'Manual Upload';
          var isDiscard = DISCARD_CATEGORIES.indexOf(normCat) > -1;
          var status = isDiscard ? 'rejected' : (item.confidence === 'confident' ? 'approved' : 'pending');
          var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
          var itemSourceDetail = { filename: file.name, site_name: siteName, library_name: libraryName, mime_type: mimeType, account_email: accountEmail };
          if (isDiscard) itemSourceDetail.rejection_source = 'auto';

          if (normCat === 'Financial Documents') status = 'pending';

          var versionMatchedId = null;
          if (status === 'approved' && AUTO_ARCHIVE_CATEGORIES.indexOf(normCat) > -1) {
            versionMatchedId = await findVersionMatch(supabase, userId, item.title, item.body, normCat);
          }

          const row = {
            user_id: userId,
            title: String(item.title || file.name).substring(0, 200),
            content_text: String(item.body || ''),
            category: normCat,
            tool_tags: toolTags,
            status: status,
            source: 'sharepoint',
            tool_source: 'sharepoint-import',
            source_ref: sourceRef,
            source_item_id: sourceItemId,
            source_detail: itemSourceDetail,
          };

          const upsertRes = await supabase.from('content_library').upsert(row, { onConflict: 'source_ref', ignoreDuplicates: true }).select('id').maybeSingle();
          if (upsertRes.error) {
            console.error('content_library insert error:', upsertRes.error.message);
            continue;
          }
          imported++;
          fileItemCount++;
          const insertedRow = upsertRes.data;

          // Versioning — Financial Documents pair check (after insert)
          if (insertedRow && normCat === 'Financial Documents') {
            var pairMatchId = await findVersionMatch(supabase, userId, item.title, item.body, 'Financial Documents');
            if (pairMatchId) {
              var pairId = randomUUID();
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
          }
        }

        if (sourceItemId && fileItemCount > 0) {
          await supabase.from('cl_source_items').update({ item_count: fileItemCount }).eq('id', sourceItemId);
        }
      }

      // Stamp last_scanned_at on the account entry
      if (imported > 0) {
        accounts[entryIdx].last_scanned_at = new Date().toISOString();
        await supabase.from('profiles').update({ cl_sharepoint_accounts: accounts }).eq('id', userId);
      }

      return res.status(200).json({ success: true, imported: imported, skipped: skipped, total: files.length });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (err) {
    console.error('sharepoint-import error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: (err && err.message) || 'unknown' });
  }
}
