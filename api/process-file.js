import https from 'https';
import http from 'http';
import zlib from 'zlib';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
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
  buildSingleItemPrompt,
  applyCategoryToolMatrix
} from '../lib/cl-prompts.js';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

const EXTRACTION_SYSTEM_PROMPT = buildSingleItemPrompt({ source: 'file' });

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, fileName, fileType, fileData, websiteUrl, source_item_id, mediaType } = req.body;

  if (!userId || (!fileData && !websiteUrl) || !fileType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Guard against oversized payloads that would hit Vercel's 4.5MB limit
  if (fileData && fileData.length > 3500000) {
    return res.status(400).json({ error: 'Image too large — please use a smaller image', skip_reason: 'oversized' });
  }

  try {
    const supabase = getSupabase();
    const claudeApiKey = process.env.CLAUDE_API_KEY;

    // 1. EXTRACT RAW CONTENT FROM SOURCE
    let sourceText = '';
    let sourceLabel = fileName || websiteUrl || 'Unknown source';
    let sourceValue = 'document';
    var imageExtractionResponse = null;

    if (fileType === 'website' && websiteUrl) {
      sourceText = await scrapeWebsite(websiteUrl);
      sourceLabel = websiteUrl;
      sourceValue = 'website';
    } else if (fileType === 'pdf' && fileData) {
      sourceText = await extractPDFText(fileData, claudeApiKey, userId);
      sourceValue = 'document';
    } else if (fileType === 'image' && fileData) {
      var imgExt = (fileName || '').toLowerCase().split('.').pop();
      // Honour the browser-detected MIME from the caller if provided —
      // this is what unblocks HEIC and other modern image formats that
      // would otherwise fall through to the image/jpeg default below
      // and be sent to Claude vision falsely tagged as JPEG. The
      // extension lookup is the fallback for legacy callers.
      var imgMediaType = mediaType
        || ({ png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', jpg: 'image/jpeg', jpeg: 'image/jpeg' })[imgExt]
        || 'image/jpeg';
      // Images use a single combined call — extraction prompt + vision
      // in one request — so sourceText is set to a placeholder and the
      // real extraction response is captured in imageExtractionResponse.
      imageExtractionResponse = await extractImage(fileData, claudeApiKey, imgMediaType, userId);
      sourceText = '[image processed directly]';
      sourceValue = 'photo';
    } else if ((fileType === 'text' || fileType === 'html') && fileData) {
      // Both 'text' and 'html' are routed through the same UTF-8
      // decode path. HTML markup is left as-is for the LLM rather
      // than stripped — Claude handles tags well and the extraction
      // prompt only sees the first 8000 characters anyway.
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
      var officeBuf = Buffer.from(fileData, 'base64');
      var extractedXlsx = null;
      // XLSX files are ZIP archives starting with PK\x03\x04 — use proper extraction
      if (fileType === 'excel' && officeBuf.length >= 4 && officeBuf[0] === 0x50 && officeBuf[1] === 0x4B && officeBuf[2] === 0x03 && officeBuf[3] === 0x04) {
        try { extractedXlsx = extractXlsxText(officeBuf); } catch (xerr) { console.error('XLSX extraction error:', xerr.message); }
      }
      if (extractedXlsx && extractedXlsx.length >= 50) {
        sourceText = extractedXlsx.substring(0, 8000);
      } else {
        sourceText = officeBuf.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
        if (sourceText.length < 50) {
          sourceText = 'File: ' + fileName + '. Office document uploaded. Filename suggests this contains business content.';
        }
      }
      sourceValue = 'document';
    } else {
      return res.status(400).json({ error: 'Unsupported file type or missing data' });
    }

    if (!sourceText || sourceText.trim().length < 10) {
      return res.status(400).json({ error: 'Could not extract content from source' });
    }

    // 2b. FIND-OR-CREATE CL_SOURCE_ITEMS ROW (file uploaded to cl-assets by browser).
    // content_library rows are only written when the source row exists — we
    // return a 4xx if the key can't be built or the row can't be written.
    var sourceItemId = null;
    var clSourceType = fileType === 'image' ? 'photo' : (fileType === 'website' ? 'website' : 'document');
    var storagePath = req.body.storagePath || null;

    var sourceUniqueKey;
    try {
      if (clSourceType === 'website') {
        if (!websiteUrl) {
          return res.status(400).json({ error: 'websiteUrl required for website source' });
        }
        sourceUniqueKey = buildSourceUniqueKey('website', { scanTs: Date.now(), fullPageUrl: websiteUrl });
      } else if (clSourceType === 'photo') {
        if (!storagePath) {
          return res.status(400).json({ error: 'storagePath required for photo source' });
        }
        sourceUniqueKey = buildSourceUniqueKey('photo', { storagePath: storagePath });
      } else {
        if (!storagePath) {
          return res.status(400).json({ error: 'storagePath required for document source' });
        }
        sourceUniqueKey = buildSourceUniqueKey('upload', { storagePath: storagePath });
      }
    } catch (keyErr) {
      console.error('[process-file] Source key build failed — fileType:', fileType, 'error:', keyErr.message);
      return res.status(400).json({ error: 'Could not build source_unique_key' });
    }

    sourceItemId = await ensureSourceItem(supabase, {
      user_id: userId,
      source_unique_key: sourceUniqueKey,
      source_type: clSourceType,
      fields: {
        source_type: clSourceType,
        filename: fileName || null,
        file_url: storagePath,
        source_url: fileType === 'website' ? websiteUrl : null,
        source_detail: { file_type: fileType, original_filename: fileName || null },
        item_count: 0,
      },
    });
    if (!sourceItemId) {
      console.error('[process-file] Source row failed — fileType:', fileType, 'fileName:', fileName);
      return res.status(500).json({ error: 'Could not create source item', skip_reason: 'source_row_failed' });
    }

    // 3. BUILD AI PROMPT AND CALL CLAUDE
    var responseText = '';
    if (imageExtractionResponse) {
      // Image path — single combined call already completed
      responseText = (imageExtractionResponse.content && imageExtractionResponse.content[0] && imageExtractionResponse.content[0].text) ? imageExtractionResponse.content[0].text : '';
    } else {
      // All other file types — text extraction then haiku classification
      var userPrompt = 'SOURCE CONTENT (' + sourceLabel + '):\n' + sourceText.substring(0, 8000);
      const requestBody = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      });
      var claudeResponse = await callClaude(requestBody, claudeApiKey, { tool_id: 'content-library', user_id: userId, subtype: 'upload-extraction' });
      responseText = (claudeResponse.content && claudeResponse.content[0] && claudeResponse.content[0].text) ? claudeResponse.content[0].text : '';
    }

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

      var normCat = item.category ? (CATEGORY_LOOKUP[String(item.category).toLowerCase()] || 'Company Information') : 'Company Information';
      console.log('[Versioning] Item category — raw:', JSON.stringify(item.category), 'normalised:', normCat);
      var isDiscard = DISCARD_CATEGORIES.indexOf(normCat) > -1;
      var status = isDiscard ? 'rejected' : (item.confidence === 'confident' ? 'approved' : 'pending');
      var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
      toolTags = applyCategoryToolMatrix(normCat, toolTags);
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
        content_type: fileType === 'image' ? 'image' : null,
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
        insertedItems.push({ id: data.id, title: row.title, category: row.category, status: row.status });

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
  var systemPrompt = VERSION_MATCH_SYSTEM_PROMPT;
  var userContent = 'CATEGORY: ' + category + '\nMATCH RULE: ' + VERSION_MATCH_RULES[category] + '\n\nNEW ITEM:\nTitle: ' + newTitle + '\nBody: ' + String(newBody || '').substring(0, 1000) + '\n\nEXISTING APPROVED ITEMS:\n' + candidates + '\n\nReturn JSON only: { "matched_id": "<existing item ID or null>" }';
  try {
    var body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    });
    var response = await callClaude(body, apiKey, { tool_id: 'content-library', user_id: userId, subtype: 'upload-versioning' });
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
    const mod = url.startsWith('https') ? https : http;
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
async function extractPDFText(fileData, apiKey, userId) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } },
      { type: 'text', text: 'Extract all text content from this PDF. Return only the raw text, preserving structure. No commentary.' }
    ]}]
  });
  const response = await callClaude(body, apiKey, { tool_id: 'content-library', user_id: userId, subtype: 'upload-extraction' });
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

// XLSX ZIP EXTRACTION — unpack archive, read shared strings and worksheet cells
function extractXlsxText(buf) {
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

  var sharedStringsXml = null;
  var sheetXmls = [];
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

    var isSharedStrings = (fileName === 'xl/sharedStrings.xml');
    var isSheet = /^xl\/worksheets\/sheet\d+\.xml$/.test(fileName);

    if (isSharedStrings || isSheet) {
      var lfhFileNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      var lfhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      var dataStart = localHeaderOffset + 30 + lfhFileNameLen + lfhExtraLen;
      var compressedData = buf.slice(dataStart, dataStart + compressedSize);
      var xmlText = null;
      try {
        if (compressionMethod === 0) {
          xmlText = compressedData.toString('utf-8');
        } else if (compressionMethod === 8) {
          xmlText = zlib.inflateRawSync(compressedData).toString('utf-8');
        }
      } catch (zerr) {
        xmlText = null;
      }
      if (xmlText) {
        if (isSharedStrings) sharedStringsXml = xmlText;
        else if (isSheet) sheetXmls.push(xmlText);
      }
    }
    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  // Parse shared strings into an array
  var sharedStrings = [];
  if (sharedStringsXml) {
    var siRegex = /<si[^>]*>([\s\S]*?)<\/si>/g;
    var siMatch;
    while ((siMatch = siRegex.exec(sharedStringsXml)) !== null) {
      var combined = '';
      var tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      var tMatch;
      while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
        combined += tMatch[1];
      }
      combined = combined.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      sharedStrings.push(combined);
    }
  }

  if (sheetXmls.length === 0) return null;
  var allRows = [];
  sheetXmls.forEach(function(sheetXml) {
    var rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
    var rowMatch;
    while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
      var cells = [];
      var cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      var cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        var cellAttrs = cellMatch[1];
        var cellContent = cellMatch[2];
        var typeMatch = cellAttrs.match(/\bt="([^"]*)"/);
        var cellType = typeMatch ? typeMatch[1] : null;
        var value = '';
        if (cellType === 'inlineStr') {
          var iMatch = cellContent.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          value = iMatch ? iMatch[1] : '';
        } else {
          var vMatch = cellContent.match(/<v[^>]*>([\s\S]*?)<\/v>/);
          if (vMatch) {
            value = vMatch[1];
            if (cellType === 's') {
              var idx = parseInt(value, 10);
              if (!isNaN(idx) && sharedStrings[idx] !== undefined) value = sharedStrings[idx];
            }
          }
        }
        value = value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        if (value !== '') cells.push(value);
      }
      if (cells.length > 0) allRows.push(cells.join(' | '));
    }
  });

  return allRows.length > 0 ? allRows.join('\n') : null;
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

// IMAGE EXTRACTOR — single combined vision + extraction call
async function extractImage(fileData, apiKey, mediaType, userId) {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: fileData } },
      { type: 'text', text: 'This is an image file. Look at it and decide which type it is, then follow ONLY the matching instructions below.\n\nTYPE A — PHOTO (a scene, people, objects, a job site, equipment, finished work, a selfie, a product, or anything that is not primarily text):\nWrite a plain English visual description of what is shown — what was done, the setting, visible quality or detail. Do not invent detail that cannot be seen. Do not attempt to read or extract text. Use your visual description as the body field. The category will almost always be Jobs, Portfolio & Photos for work photos, or Company Information for team or premises photos.\n\nTYPE B — DOCUMENT OR SCREENSHOT (an image whose primary content is readable text — a scanned page, a screenshot of a webpage or app, a photographed invoice, certificate, letter, or form):\nExtract all visible text accurately and completely. Use the extracted text as the body field verbatim. This is the one exception to the summary-only rule in the system prompt — for document images the extracted text IS the body because there is no other source to summarise from. Classify the content based on what the text says, not based on it being an image.\n\nAfter following the correct type above, return a JSON array with exactly one object containing title, body, category, disposition, confidence, and tool_tags — the same format as all other file types. Never return an empty array for an image that contains visible content or readable text.' }
    ]}]
  });
  return await callClaude(body, apiKey, { tool_id: 'content-library', user_id: userId, subtype: 'upload-image' });
}

// CLAUDE API CALLER
function callClaude(requestBody, apiKey, meta) {
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
          if (parsed.error) { reject(new Error(parsed.error.message)); return; }
          // Log usage. Model is read from the request body so the caller
          // doesn't need to pass it in twice.
          let model = null;
          try { model = JSON.parse(requestBody).model; } catch (e) {}
          logAnthropicUsage({
            tool_id: (meta && meta.tool_id) || 'content-library',
            user_id: meta && meta.user_id,
            model: model,
            usage: parsed.usage,
            subtype: meta && meta.subtype
          });
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

export default handler;
export const config = { maxDuration: 300 };
