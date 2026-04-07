const https = require('https');
const zlib = require('zlib');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

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

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, fileName, fileType, fileData, websiteUrl, source_item_id } = req.body;

  if (!userId || (!fileData && !websiteUrl) || !fileType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const supabase = getSupabase();
    const claudeApiKey = process.env.CLAUDE_API_KEY;

    // 1. EXTRACT RAW CONTENT FROM SOURCE
    let sourceText = '';
    let sourceLabel = fileName || websiteUrl || 'Unknown source';
    let sourceValue = 'document';

    if (fileType === 'website' && websiteUrl) {
      sourceText = await scrapeWebsite(websiteUrl);
      sourceLabel = websiteUrl;
      sourceValue = 'website';
    } else if (fileType === 'pdf' && fileData) {
      sourceText = await extractPDFText(fileData, claudeApiKey);
      sourceValue = 'document';
    } else if (fileType === 'image' && fileData) {
      var imgExt = (fileName || '').toLowerCase().split('.').pop();
      var imgMediaType = ({ png: 'image/png', gif: 'image/gif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' })[imgExt] || 'image/jpeg';
      sourceText = await describeImage(fileData, claudeApiKey, imgMediaType);
      sourceValue = 'photo';
    } else if (fileType === 'text' && fileData) {
      sourceText = Buffer.from(fileData, 'base64').toString('utf-8');
      sourceValue = 'document';
    } else if (fileType === 'word' && fileData) {
      var docExt = (fileName || '').toLowerCase().split('.').pop();
      var docMediaType = docExt === 'doc'
        ? 'application/msword'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      sourceText = await extractDocText(fileData, docMediaType, claudeApiKey);
      sourceValue = 'document';
    } else if (['powerpoint', 'excel'].includes(fileType) && fileData) {
      sourceText = Buffer.from(fileData, 'base64').toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
      if (sourceText.length < 50) {
        sourceText = 'File: ' + fileName + '. Office document uploaded. Filename suggests this contains business content.';
      }
      sourceValue = 'document';
    } else {
      return res.status(400).json({ error: 'Unsupported file type or missing data' });
    }

    if (!sourceText || sourceText.trim().length < 10) {
      return res.status(400).json({ error: 'Could not extract content from source' });
    }

    // 2b. CREATE CL_SOURCE_ITEMS ROW (file uploaded to cl-assets by browser)
    var sourceItemId = null;
    var clSourceType = fileType === 'image' ? 'photo' : (fileType === 'website' ? 'website' : 'document');
    var storagePath = req.body.storagePath || null;
    try {
      var siResult = await supabase
        .from('cl_source_items')
        .insert({
          user_id: userId,
          source_type: clSourceType,
          filename: fileName || null,
          file_url: storagePath,
          source_url: fileType === 'website' ? websiteUrl : null,
          source_detail: { file_type: fileType, original_filename: fileName || null },
          item_count: 0,
        })
        .select('id')
        .single();
      if (siResult.data) sourceItemId = siResult.data.id;
    } catch (e) {
      console.error('cl_source_items save error:', e.message);
    }

    // 3. BUILD AI PROMPT
    var userPrompt = 'SOURCE CONTENT (' + sourceLabel + '):\n' + sourceText.substring(0, 8000);

    // 4. CALL CLAUDE HAIKU
    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const claudeResponse = await callClaude(requestBody, claudeApiKey);
    const responseText = (claudeResponse.content && claudeResponse.content[0] && claudeResponse.content[0].text) ? claudeResponse.content[0].text : '';

    // 5. PARSE RESPONSE
    let items = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) { items = JSON.parse(jsonMatch[0]); }
    } catch (e) {
      console.error('JSON parse error:', e.message, 'raw:', responseText.substring(0, 500));
      return res.status(400).json({ error: 'AI returned unparseable response', raw: responseText.substring(0, 200) });
    }

    if (!Array.isArray(items) || items.length < 1) {
      return res.status(400).json({ error: 'AI returned no items', raw: responseText.substring(0, 200) });
    }

    // 6. NORMALISE AND INSERT ITEMS
    let insertedCount = 0;
    const insertedItems = [];

    for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
      var item = items[itemIdx];
      if (!item.title || !item.body) continue;

      var normCat = item.category ? (CATEGORY_LOOKUP[String(item.category).toLowerCase()] || 'Manual Upload') : 'Manual Upload';
      console.log('[Versioning] Item category — raw:', JSON.stringify(item.category), 'normalised:', normCat);
      var isDiscard = DISCARD_CATEGORIES.indexOf(normCat) > -1;
      var status = isDiscard ? 'rejected' : (item.confidence === 'confident' ? 'approved' : 'pending');
      var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
      var itemSourceDetail = { filename: fileName || 'Unknown', file_type: fileType };
      if (isDiscard) itemSourceDetail.rejection_source = 'auto';

      // Versioning — Financial Documents always go to pending. Pair check happens after insert.
      if (normCat === 'Financial Documents') {
        status = 'pending';
      }

      // Versioning — auto-archive match check (only approved items in archive categories)
      var versionMatchedId = null;
      if (status === 'approved' && AUTO_ARCHIVE_CATEGORIES.indexOf(normCat) > -1) {
        versionMatchedId = await findVersionMatch(supabase, userId, item.title, item.body, normCat, claudeApiKey);
      }

      const row = {
        user_id: userId,
        title: String(item.title).substring(0, 200),
        content_text: String(item.body),
        category: normCat,
        tool_tags: toolTags,
        status: status,
        source: sourceValue,
        tool_source: 'process-file',
        source_detail: itemSourceDetail,
        source_item_id: sourceItemId,
        created_at: new Date().toISOString(),
        source_ref: 'upload:' + (sourceItemId || Date.now()) + ':' + itemIdx
      };

      const { data, error } = await supabase
        .from('content_library')
        .insert(row)
        .select('id')
        .single();

      if (!error && data) {
        insertedCount++;
        insertedItems.push({ id: data.id, title: row.title, category: row.category });

        // Versioning — Financial Documents pair check (after insert)
        if (normCat === 'Financial Documents') {
          var pairMatchId = await findVersionMatch(supabase, userId, item.title, item.body, 'Financial Documents', claudeApiKey);
          if (pairMatchId) {
            var pairId = randomUUID();
            var existingPairUpdate = await supabase
              .from('content_library')
              .update({ status: 'pending', version_pair_id: pairId })
              .eq('id', pairMatchId);
            var newPairUpdate = await supabase
              .from('content_library')
              .update({ version_pair_id: pairId })
              .eq('id', data.id);
            console.log('[Versioning] Financial Documents paired — pair_id:', pairId, 'existing:', pairMatchId, 'new:', data.id, 'errors:', existingPairUpdate.error && existingPairUpdate.error.message, newPairUpdate.error && newPairUpdate.error.message);
          } else {
            console.log('[Versioning] Financial Documents — no matching approved item found, new item sits alone');
          }
        }

        // Versioning — apply auto-archive on match
        if (versionMatchedId) {
          var archResult = await supabase
            .from('content_library')
            .update({ status: 'archived', version_archived_by: data.id })
            .eq('id', versionMatchedId);
          if (archResult.error) console.error('Auto-archive error:', archResult.error.message);
        }
      } else if (error) {
        console.error('Insert error:', error.message);
      }
    }

    // Update cl_source_items item_count
    if (sourceItemId && insertedCount > 0) {
      await supabase.from('cl_source_items').update({ item_count: insertedCount }).eq('id', sourceItemId);
    }

    return res.status(200).json({
      success: true,
      itemsCount: insertedCount,
      items: insertedItems,
      message: insertedCount + ' item' + (insertedCount !== 1 ? 's' : '') + ' extracted and ready for review'
    });

  } catch (error) {
    console.error('process-file error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// VERSIONING — find existing approved item the new one should archive
async function findVersionMatch(supabase, userId, newTitle, newBody, category, apiKey) {
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
    var body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    });
    var response = await callClaude(body, apiKey);
    var raw = response.content && response.content[0] ? response.content[0].text : '';
    var jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    var parsed = JSON.parse(jsonMatch[0]);
    return parsed.matched_id && parsed.matched_id !== 'null' ? parsed.matched_id : null;
  } catch (e) {
    console.error('Version match error:', e.message);
    return null;
  }
}

// WEBSITE SCRAPER
async function scrapeWebsite(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? require('https') : require('http');
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StaxAI-Scanner/1.0)', 'Accept': 'text/html' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(scrapeWebsite(res.headers.location));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const text = data
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
          .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ').trim();
        resolve(text.substring(0, 10000));
      });
    });
    req.on('error', (e) => { resolve('Could not fetch website: ' + e.message); });
    req.on('timeout', () => { req.destroy(); resolve('Website request timed out'); });
  });
}

// PDF TEXT EXTRACTOR
async function extractPDFText(fileData, apiKey) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } },
      { type: 'text', text: 'Extract all text content from this PDF. Return only the raw text, preserving structure. No commentary.' }
    ]}]
  });
  const response = await callClaude(body, apiKey);
  return (response.content && response.content[0]) ? response.content[0].text : '';
}

// DOCX ZIP EXTRACTION — unpack archive and read word/document.xml
function extractDocxXml(buf) {
  // Find End of Central Directory record (scans backwards from end)
  var eocdOffset = -1;
  for (var i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return null;

  var cdOffset = buf.readUInt32LE(eocdOffset + 16);
  var numEntries = buf.readUInt16LE(eocdOffset + 10);

  // Walk central directory to find word/document.xml
  var pos = cdOffset;
  for (var e = 0; e < numEntries; e++) {
    if (pos + 46 > buf.length) break;
    if (buf[pos] !== 0x50 || buf[pos + 1] !== 0x4B || buf[pos + 2] !== 0x01 || buf[pos + 3] !== 0x02) break;
    var compressionMethod = buf.readUInt16LE(pos + 10);
    var compressedSize = buf.readUInt32LE(pos + 20);
    var fileNameLen = buf.readUInt16LE(pos + 28);
    var extraLen = buf.readUInt16LE(pos + 30);
    var commentLen = buf.readUInt16LE(pos + 32);
    var localHeaderOffset = buf.readUInt32LE(pos + 42);
    var fileName = buf.toString('utf-8', pos + 46, pos + 46 + fileNameLen);

    if (fileName === 'word/document.xml') {
      var lfhFileNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      var lfhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      var dataStart = localHeaderOffset + 30 + lfhFileNameLen + lfhExtraLen;
      var compressedData = buf.slice(dataStart, dataStart + compressedSize);
      var xmlText;
      if (compressionMethod === 0) {
        xmlText = compressedData.toString('utf-8');
      } else if (compressionMethod === 8) {
        xmlText = zlib.inflateRawSync(compressedData).toString('utf-8');
      } else {
        return null;
      }
      return xmlText
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br[^/]*\/>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }
    pos += 46 + fileNameLen + extraLen + commentLen;
  }
  return null;
}

// WORD DOCUMENT TEXT EXTRACTOR — DOCX via ZIP, DOC via binary text extraction
async function extractDocText(fileData, mediaType, apiKey) {
  var buf = Buffer.from(fileData, 'base64');
  var text = null;

  // DOCX — unpack ZIP archive and read document XML
  if (mediaType !== 'application/msword') {
    try { text = extractDocxXml(buf); } catch (e) { console.error('DOCX extraction error:', e.message); }
  }

  // DOC (legacy) or failed DOCX — extract readable text runs from binary
  if (!text || text.length < 50) {
    text = buf.toString('utf-8')
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!text || text.length < 50) return null;
  return text.substring(0, 8000);
}

// IMAGE DESCRIBER
async function describeImage(fileData, apiKey, mediaType) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: fileData } },
      { type: 'text', text: 'Describe this business image in detail for a content library. Include: what is shown, any visible text, the apparent business context, and what marketing use it could serve.' }
    ]}]
  });
  const response = await callClaude(body, apiKey);
  return (response.content && response.content[0]) ? response.content[0].text : '';
}

// CLAUDE API CALLER
function callClaude(requestBody, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { reject(new Error(parsed.error.message)); } else { resolve(parsed); }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

module.exports = handler;
module.exports.config = { maxDuration: 300 };
