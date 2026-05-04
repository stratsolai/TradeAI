// api/dropbox-import.js — Task 10 Step 6
// Action-dispatch import endpoint for Dropbox sources. JWT required.
//
// Multi-account: tokens are read from profiles.cl_dropbox_accounts (jsonb array).
// Each entry: { account_email, access_token, refresh_token, connected_at,
//               folders: [{ id: "/path", name }, ...], last_scanned_at? }
// Folder identifiers are Dropbox paths — id is the path string (e.g. "/My Folder").
//
// Actions:
//   list-folders { accountEmail }              → top-level folders, including
//                                                mounted shared folders
//   import-all   { accountEmail, folderPath }  → scan one folder, full pipeline
//
// Dropbox API specifics (different from Microsoft and Google):
// - Token refresh: POST https://api.dropboxapi.com/oauth2/token
//                  (form-urlencoded; does NOT rotate refresh_token)
// - List folder:   POST https://api.dropboxapi.com/2/files/list_folder
//                  (JSON body, Content-Type: application/json)
// - Download file: POST https://content.dropboxapi.com/2/files/download
//                  Dropbox-API-Arg header carries JSON-stringified params,
//                  request body is empty, response body is the file bytes.
//                  NO Content-Type header on download requests.
// - File metadata does NOT include MIME types — type is inferred from the
//   filename extension via inferMimeFromExtension().
//
// Mirrors onedrive-import.js for the multi-account, refresh write-back,
// extraction, versioning, and source-item plumbing.

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import zlib from 'zlib';
import { logAnthropicUsage } from '../lib/usage-logger.js';
import {
  ALLOWED_TOOL_IDS,
  ALL_CATEGORIES,
  CATEGORY_LOOKUP,
  DISCARD_CATEGORIES,
  AUTO_ARCHIVE_CATEGORIES,
  VERSION_MATCH_RULES,
  IMAGE_PROMPT,
  VERSION_MATCH_SYSTEM_PROMPT,
  buildSingleItemPrompt
} from '../lib/cl-prompts.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DROPBOX_CLIENT_ID = process.env.DROPBOX_CLIENT_ID;
const DROPBOX_CLIENT_SECRET = process.env.DROPBOX_CLIENT_SECRET;

const EXTRACTION_SYSTEM_PROMPT = buildSingleItemPrompt({ source: 'file' });


// MIME types we can extract text from via Claude document API. The
// modern Office Open XML formats (docx/xlsx/pptx) and PDF are the
// reliable cases. Legacy Office (msword/ms-excel/ms-powerpoint) is
// included so .doc/.xls/.ppt files in Dropbox stop being silently
// dropped at the format gate — Claude's document API may not always
// extract them cleanly, but a logged failed extraction is strictly
// better than the previous silent skip with no record at all.
const DROPBOX_BINARY_DOC_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
];

// Infer a MIME type from a filename extension. Returns '' for unknown types
// (caller skips the file). Dropbox metadata does not include MIME types so
// extension inference is the only signal available before download.
function inferMimeFromExtension(fileName) {
  if (!fileName) return '';
  var ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'ppt') return 'application/vnd.ms-powerpoint';
  if (ext === 'txt' || ext === 'md' || ext === 'csv') return 'text/plain';
  if (ext === 'html' || ext === 'htm') return 'text/html';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return '';
}

// Refresh a Dropbox OAuth token. Dropbox returns a new access_token but does
// not rotate the refresh_token, so the original is preserved.
async function refreshDropboxToken(refreshToken) {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: DROPBOX_CLIENT_ID,
      client_secret: DROPBOX_CLIENT_SECRET,
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Dropbox token refresh failed: ' + (data.error_description || data.error_summary || data.error || 'unknown'));
  return { access_token: data.access_token, refresh_token: refreshToken };
}

// Download a Dropbox file as a Buffer.
// Dropbox download endpoint convention: parameters go in the Dropbox-API-Arg
// header as a JSON string, request body is empty, no Content-Type header.
async function fetchDropboxFileBuffer(filePath, accessToken) {
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Dropbox-API-Arg': JSON.stringify({ path: filePath }),
    },
  });
  if (!res.ok) {
    console.error('Dropbox file download failed:', filePath, res.status);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

// DOCX ZIP EXTRACTION — unpack archive, find word/document.xml, decompress, strip XML
function extractDocxXml(buf) {
  var eocdOffset = -1;
  for (var i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) return null;
  var cdOffset = buf.readUInt32LE(eocdOffset + 16);
  var numEntries = buf.readUInt16LE(eocdOffset + 10);
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
    var fn = buf.toString('utf-8', pos + 46, pos + 46 + fileNameLen);
    if (fn === 'word/document.xml') {
      var lfhFnLen = buf.readUInt16LE(localHeaderOffset + 26);
      var lfhExLen = buf.readUInt16LE(localHeaderOffset + 28);
      var dataStart = localHeaderOffset + 30 + lfhFnLen + lfhExLen;
      var compressed = buf.slice(dataStart, dataStart + compressedSize);
      var xmlText;
      if (compressionMethod === 0) { xmlText = compressed.toString('utf-8'); }
      else if (compressionMethod === 8) { xmlText = zlib.inflateRawSync(compressed).toString('utf-8'); }
      else { return null; }
      return xmlText
        .replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<w:br[^/]*\/>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
    }
    pos += 46 + fileNameLen + extraLen + commentLen;
  }
  return null;
}

// XLSX ZIP EXTRACTION — unpack archive, read shared strings and worksheet cells
// Ported from process-file.js extractXlsxText.
function extractXlsxText(buf) {
  var eocdOffset = -1;
  for (var i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocdOffset = i; break; }
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
    var fn = buf.toString('utf-8', pos + 46, pos + 46 + fileNameLen);
    var isSharedStrings = (fn === 'xl/sharedStrings.xml');
    var isSheet = /^xl\/worksheets\/sheet\d+\.xml$/.test(fn);
    if (isSharedStrings || isSheet) {
      var lfhFnLen = buf.readUInt16LE(localHeaderOffset + 26);
      var lfhExLen = buf.readUInt16LE(localHeaderOffset + 28);
      var dataStart = localHeaderOffset + 30 + lfhFnLen + lfhExLen;
      var compressed = buf.slice(dataStart, dataStart + compressedSize);
      var xmlText = null;
      try {
        if (compressionMethod === 0) { xmlText = compressed.toString('utf-8'); }
        else if (compressionMethod === 8) { xmlText = zlib.inflateRawSync(compressed).toString('utf-8'); }
      } catch (zerr) { xmlText = null; }
      if (xmlText) {
        if (isSharedStrings) sharedStringsXml = xmlText;
        else if (isSheet) sheetXmls.push(xmlText);
      }
    }
    pos += 46 + fileNameLen + extraLen + commentLen;
  }
  var sharedStrings = [];
  if (sharedStringsXml) {
    var siRegex = /<si[^>]*>([\s\S]*?)<\/si>/g;
    var siMatch;
    while ((siMatch = siRegex.exec(sharedStringsXml)) !== null) {
      var combined = '';
      var tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      var tMatch;
      while ((tMatch = tRegex.exec(siMatch[1])) !== null) { combined += tMatch[1]; }
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

// PPTX ZIP EXTRACTION — unpack archive, read text from slide XML files
function extractPptxText(buf) {
  var eocdOffset = -1;
  for (var i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) return null;
  var cdOffset = buf.readUInt32LE(eocdOffset + 16);
  var numEntries = buf.readUInt16LE(eocdOffset + 10);
  var slideXmls = [];
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
    var fn = buf.toString('utf-8', pos + 46, pos + 46 + fileNameLen);
    if (/^ppt\/slides\/slide\d+\.xml$/.test(fn)) {
      var lfhFnLen = buf.readUInt16LE(localHeaderOffset + 26);
      var lfhExLen = buf.readUInt16LE(localHeaderOffset + 28);
      var dataStart = localHeaderOffset + 30 + lfhFnLen + lfhExLen;
      var compressed = buf.slice(dataStart, dataStart + compressedSize);
      var xmlText = null;
      try {
        if (compressionMethod === 0) { xmlText = compressed.toString('utf-8'); }
        else if (compressionMethod === 8) { xmlText = zlib.inflateRawSync(compressed).toString('utf-8'); }
      } catch (zerr) { xmlText = null; }
      if (xmlText) slideXmls.push(xmlText);
    }
    pos += 46 + fileNameLen + extraLen + commentLen;
  }
  if (slideXmls.length === 0) return null;
  var allText = [];
  slideXmls.forEach(function(slideXml) {
    var tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
    var tMatch;
    var slideTexts = [];
    while ((tMatch = tRegex.exec(slideXml)) !== null) {
      var val = tMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      if (val.trim()) slideTexts.push(val);
    }
    if (slideTexts.length > 0) allText.push(slideTexts.join(' '));
  });
  return allText.length > 0 ? allText.join('\n') : null;
}

// Extract text from a binary document. PDF goes to Claude document API.
// DOCX, XLSX, PPTX are extracted locally from their ZIP archives.
// Legacy Office formats use binary text extraction as a fallback.
async function extractBinaryFileText(buffer, mimeType, userId) {
  // PDF: Claude document API (the only binary format it reliably accepts)
  if (mimeType === 'application/pdf') {
    var base64Data = buffer.toString('base64');
    console.log('[extractBinaryFileText] PDF — base64Length:', base64Data.length);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
          { type: 'text', text: 'Extract all text content from this document. Return only the raw text, preserving structure. No commentary.' }
        ]}],
      }),
    });
    console.log('[extractBinaryFileText] Claude API status:', response.status);
    const data = await response.json();
    logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'dropbox-extraction' });
    if (data.content && data.content[0]) return data.content[0].text;
    console.error('[extractBinaryFileText] PDF FAILED — error:', JSON.stringify(data.error || null));
    return null;
  }

  // DOCX: local ZIP extraction
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    console.log('[extractBinaryFileText] DOCX local extraction');
    try { var text = extractDocxXml(buffer); if (text && text.length >= 50) return text.substring(0, 8000); } catch (e) { console.error('DOCX extraction error:', e.message); }
    var fb = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fb.length >= 50) return fb.substring(0, 8000);
    return null;
  }

  // XLSX: local ZIP extraction
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    console.log('[extractBinaryFileText] XLSX local extraction');
    try { var text = extractXlsxText(buffer); if (text && text.length >= 50) return text.substring(0, 8000); } catch (e) { console.error('XLSX extraction error:', e.message); }
    var fb = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fb.length >= 50) return fb.substring(0, 8000);
    return null;
  }

  // PPTX: local ZIP extraction
  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    console.log('[extractBinaryFileText] PPTX local extraction');
    try { var text = extractPptxText(buffer); if (text && text.length >= 50) return text.substring(0, 8000); } catch (e) { console.error('PPTX extraction error:', e.message); }
    var fb = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fb.length >= 50) return fb.substring(0, 8000);
    return null;
  }

  // Legacy Office (DOC/XLS/PPT): binary text extraction fallback
  console.log('[extractBinaryFileText] Legacy format — mimeType:', mimeType);
  var legacyText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  if (legacyText.length >= 50) return legacyText.substring(0, 8000);
  return null;
}

// Resolve a Dropbox file to plain-text body suitable for the extraction prompt.
async function fetchDropboxFileText(filePath, mimeType, accessToken, userId) {
  const buffer = await fetchDropboxFileBuffer(filePath, accessToken);
  if (!buffer) return null;
  if (DROPBOX_BINARY_DOC_MIME.indexOf(mimeType) > -1) {
    return await extractBinaryFileText(buffer, mimeType, userId);
  }
  if (mimeType && mimeType.indexOf('text/') === 0) {
    return buffer.toString('utf-8').substring(0, 8000);
  }
  return null;
}

// Run the fixed-18-category extraction prompt.
async function runExtractionPrompt(content, fileName, userId) {
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
  logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'dropbox-extraction' });
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

// Run image extraction via Claude Sonnet vision — single combined call.
async function runImageExtraction(base64Data, mediaType, userId) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64Data } },
        { type: 'text', text: IMAGE_PROMPT }
      ]}],
    }),
  });
  const data = await response.json();
  logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-sonnet-4-6', usage: data && data.usage, subtype: 'dropbox-image' });
  const raw = data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Image extraction JSON parse error:', e.message, 'raw:', raw.substring(0, 500));
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
    logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'dropbox-versioning' });
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

// List immediate children of a Dropbox folder via /2/files/list_folder.
// path "" means the user's Dropbox root. Returns full entries — caller filters
// to .tag === 'folder' or .tag === 'file' as needed.
async function dropboxListFolder(folderPath, accessToken) {
  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: folderPath,
      recursive: false,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false,
      include_mounted_folders: true,
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(function() { return {}; });
    const errMsg = errBody.error_summary || errBody.error || ('Dropbox returned ' + res.status);
    throw new Error(errMsg);
  }
  return await res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth — x-cron-secret (worker) or JWT Bearer (browser) ──────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  var userId;
  var cronSecret = req.headers['x-cron-secret'];
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) {
    userId = (req.body || {}).userId;
    if (!userId) return res.status(400).json({ error: 'userId required for worker calls' });
  } else {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Unauthorised' });
    const authRes = await supabase.auth.getUser(token);
    if (authRes.error || !authRes.data || !authRes.data.user) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    userId = authRes.data.user.id;
  }

  const body = req.body || {};
  const action = body.action;
  const accountEmail = body.accountEmail;
  const folderPath = body.folderPath;
  const jobId = body.jobId;

  if (!action) return res.status(400).json({ error: 'action required' });
  if (!accountEmail) return res.status(400).json({ error: 'accountEmail required' });

  try {
    // ── Read profile and resolve account entry ─────────────────────────
    const profileRes = await supabase
      .from('profiles')
      .select('cl_dropbox_accounts')
      .eq('id', userId)
      .single();
    if (profileRes.error) {
      console.error('dropbox-import profile read error:', profileRes.error.message);
      return res.status(500).json({ error: profileRes.error.message });
    }
    const accounts = Array.isArray(profileRes.data && profileRes.data.cl_dropbox_accounts)
      ? profileRes.data.cl_dropbox_accounts
      : [];
    const entryIdx = accounts.findIndex(function(a) { return a && a.account_email === accountEmail; });
    if (entryIdx === -1) {
      return res.status(400).json({ error: 'Dropbox account not connected' });
    }
    const entry = accounts[entryIdx];
    if (!entry.access_token) {
      return res.status(400).json({ error: 'Dropbox account has no access token. Please reconnect.' });
    }

    // ── Refresh access token if a refresh token is available ───────────
    let accessToken = entry.access_token;
    if (entry.refresh_token) {
      try {
        const refreshed = await refreshDropboxToken(entry.refresh_token);
        accessToken = refreshed.access_token;
        accounts[entryIdx].access_token = refreshed.access_token;
        // refresh_token preserved as-is — Dropbox does not rotate it
        await supabase.from('profiles').update({ cl_dropbox_accounts: accounts }).eq('id', userId);
      } catch (e) {
        console.error('Dropbox token refresh failed:', e.message);
        return res.status(401).json({ error: 'Dropbox token expired. Please reconnect this account in Settings.' });
      }
    }

    // ── ACTION: list-folders ───────────────────────────────────────────
    // Lists top-level folders in the user's Dropbox. include_mounted_folders
    // is true so mounted shared folders appear alongside the user's own
    // folders. Folders the user was invited to but has not yet mounted are
    // NOT included — those would need a separate /2/sharing/list_folders call
    // and are an edge case the user can resolve by mounting them in Dropbox.
    if (action === 'list-folders') {
      let listData;
      try {
        listData = await dropboxListFolder('', accessToken);
      } catch (e) {
        console.error('Dropbox list-folders error:', e.message);
        return res.status(502).json({ error: 'Dropbox API error: ' + e.message });
      }
      const entries = listData.entries || [];
      const folders = entries
        .filter(function(it) { return it && it['.tag'] === 'folder'; })
        .map(function(it) {
          // path_display is the user-facing path with original casing.
          // Use it as the id (Dropbox folder identifiers are paths, not IDs).
          var folderPath = it.path_display || it.path_lower || '';
          return { id: folderPath, name: it.name };
        });
      return res.status(200).json({ success: true, folders: folders });
    }

    // ── ACTION: import-all ─────────────────────────────────────────────
    if (action === 'import-all') {
      if (!folderPath && folderPath !== '') return res.status(400).json({ error: 'folderPath required' });

      // List children of the folder
      let filesListData;
      try {
        filesListData = await dropboxListFolder(folderPath, accessToken);
      } catch (e) {
        console.error('Dropbox list-children error:', e.message);
        return res.status(502).json({ error: 'Dropbox API error: ' + e.message });
      }
      const folderName = folderPath === '' ? 'Dropbox' : folderPath.split('/').filter(Boolean).pop() || folderPath;
      const folderFiles = (filesListData.entries || []).filter(function(it) { return it && it['.tag'] === 'file'; });
      // Tag each file with the folder context it came from so root-level
      // files mixed in below carry their own folder attribution rather
      // than inheriting the selected subfolder's name.
      folderFiles.forEach(function (f) { f._folderPath = folderPath; f._folderName = folderName; });

      // Always include root-level files in every import scan, regardless
      // of which folder the user selected. The user does not need to
      // explicitly pick "root" for these to be picked up. Skipped when
      // the target folder is already root, to avoid listing it twice.
      // Dedupe via dropbox_file_id in cl_source_items prevents repeated
      // imports of the same root files across multiple subfolder scans.
      let rootFiles = [];
      if (folderPath !== '') {
        try {
          const rootListData = await dropboxListFolder('', accessToken);
          rootFiles = (rootListData.entries || []).filter(function(it) { return it && it['.tag'] === 'file'; });
          rootFiles.forEach(function (f) { f._folderPath = ''; f._folderName = 'Dropbox'; });
        } catch (e) {
          // Non-fatal — proceed with the selected folder's files only.
          console.error('Dropbox root-files list error:', e.message);
        }
      }
      var allFiles = folderFiles.concat(rootFiles);

      // Lookback filter — only process files modified within the user's
      // lookback window. Default 1 month. null means all time (no filter).
      var lookbackMonths = entry.lookback_months === undefined ? 1 : entry.lookback_months;
      if (lookbackMonths != null) {
        var cutoffDate = new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
        allFiles = allFiles.filter(function(f) { return f.client_modified && f.client_modified >= cutoffDate; });
        console.log('[Dropbox] Lookback filter — months:', lookbackMonths, 'cutoff:', cutoffDate, 'filesAfterFilter:', allFiles.length);
      }

      // Skip files already recorded for this user from a prior scan.
      // Idempotency key: source_detail.dropbox_file_id (Dropbox stable id like
      // "id:Aa1bBcDe2fG", which survives renames and moves — more reliable
      // than path).
      const existingSI = await supabase
        .from('cl_source_items')
        .select('source_detail')
        .eq('user_id', userId)
        .eq('source_type', 'dropbox');
      const scannedFileIds = new Set(
        ((existingSI && existingSI.data) || [])
          .map(function(r) { return r.source_detail && r.source_detail.dropbox_file_id; })
          .filter(Boolean)
      );
      const files = allFiles.filter(function(f) { return !scannedFileIds.has(f.id); });
      var deduped = allFiles.length - files.length;

      // ── Cursor batch processing ────────────────────────────────────
      var BATCH_SIZE = 50;
      var cursorData = null;
      var processedIds = [];
      if (jobId) {
        var cursorRes = await supabase.from('cl_scan_cursors').select('*').eq('job_id', jobId).maybeSingle();
        if (cursorRes.data) {
          cursorData = cursorRes.data;
          processedIds = Array.isArray(cursorData.processed_ids) ? cursorData.processed_ids : [];
        }
      }
      var remaining = files.filter(function(f) { return processedIds.indexOf(f.id) === -1; });
      var batch = jobId ? remaining.slice(0, BATCH_SIZE) : remaining;
      var moreAfterBatch = jobId ? remaining.length > BATCH_SIZE : false;
      console.log('[Dropbox] Cursor — total:', files.length, 'alreadyProcessed:', processedIds.length, 'remaining:', remaining.length, 'batch:', batch.length, 'morePending:', moreAfterBatch);

      let imported = 0;
      let skipped = 0;
      let approved = 0;
      let pending = 0;
      let rejected = 0;
      var skipped_reasons = {};
      var auto_archived = 0;
      var fin_docs_paired = 0;

      for (const file of batch) {
        const fileName = file.name || '';
        const filePath = file.path_display || file.path_lower || '';
        // Folder context attached when allFiles was assembled — falls back
        // to the request-level values for safety, though in practice every
        // file is tagged before this loop runs.
        const fileFolderPath = file._folderPath != null ? file._folderPath : folderPath;
        const fileFolderName = file._folderName != null ? file._folderName : folderName;
        const mimeType = inferMimeFromExtension(fileName);
        const isImage = mimeType.indexOf('image/') === 0;
        const isText = mimeType.indexOf('text/') === 0;
        const isBinaryDoc = DROPBOX_BINARY_DOC_MIME.indexOf(mimeType) > -1;

        if (!isImage && !isText && !isBinaryDoc) { skipped++; skipped_reasons.unsupported_format = (skipped_reasons.unsupported_format || 0) + 1; continue; }
        if (!filePath) { skipped++; skipped_reasons.extraction_failed = (skipped_reasons.extraction_failed || 0) + 1; continue; }

        let textContent = null;
        let imageBuffer = null;

        if (isImage) {
          imageBuffer = await fetchDropboxFileBuffer(filePath, accessToken);
          if (!imageBuffer) { skipped++; skipped_reasons.extraction_failed = (skipped_reasons.extraction_failed || 0) + 1; continue; }
        } else {
          textContent = await fetchDropboxFileText(filePath, mimeType, accessToken, userId);
          if (!textContent) { skipped++; skipped_reasons.extraction_failed = (skipped_reasons.extraction_failed || 0) + 1; continue; }
        }

        // Save source bytes to cl-assets and create cl_source_items row.
        // Storage path strips Dropbox file id colons since cl-assets paths
        // do not allow them.
        var sourceItemId = null;
        var fileItemCount = 0;
        try {
          var safeFileId = (file.id || randomUUID()).replace(/[^a-zA-Z0-9]/g, '_');
          var safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
          var storagePath = userId + '/dropbox/' + safeFileId + '_' + safeFileName;
          if (isImage && imageBuffer) {
            await supabase.storage.from('cl-assets').upload(storagePath, imageBuffer, { contentType: mimeType, upsert: false });
          } else if (textContent) {
            await supabase.storage.from('cl-assets').upload(storagePath, Buffer.from(textContent, 'utf-8'), { contentType: 'text/plain', upsert: false });
          }
          var siResult = await supabase
            .from('cl_source_items')
            .insert({
              user_id: userId,
              source_type: 'dropbox',
              filename: fileName,
              file_url: storagePath,
              source_url: null,
              source_detail: { dropbox_file_id: file.id, dropbox_path: filePath, folder_path: fileFolderPath, folder_name: fileFolderName, mime_type: mimeType, account_email: accountEmail },
              item_count: 0,
            })
            .select('id')
            .single();
          if (siResult.data) sourceItemId = siResult.data.id;
        } catch (e) {
          console.error('cl-assets/cl_source_items save error:', e.message);
        }

        // Images: run vision extraction via Claude Sonnet
        if (isImage) {
          var base64Data = imageBuffer.toString('base64');
          var imgItems = await runImageExtraction(base64Data, mimeType, userId);
          if (!imgItems || imgItems.length === 0) { skipped++; skipped_reasons.no_content = (skipped_reasons.no_content || 0) + 1; continue; }
          for (var imgIdx = 0; imgIdx < imgItems.length; imgIdx++) {
            var imgItem = imgItems[imgIdx];
            var imgSourceRef = 'dropbox:' + (file.id || filePath) + ':' + imgIdx;
            var imgNormCat = imgItem.category ? (CATEGORY_LOOKUP[String(imgItem.category).toLowerCase()] || 'Jobs, Portfolio & Photos') : 'Jobs, Portfolio & Photos';
            var imgIsDiscard = DISCARD_CATEGORIES.indexOf(imgNormCat) > -1;
            var imgStatus = imgIsDiscard ? 'rejected' : (imgItem.confidence === 'confident' ? 'approved' : 'pending');
            var imgToolTags = Array.isArray(imgItem.tool_tags) ? imgItem.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
            var imgSourceDetail = { filename: fileName, folder_name: fileFolderName, mime_type: mimeType, account_email: accountEmail };
            if (imgIsDiscard) imgSourceDetail.rejection_source = 'auto';
            if (imgNormCat === 'Financial Documents') imgStatus = 'pending';
            var imgVersionMatchedId = null;
            if (imgStatus === 'approved' && AUTO_ARCHIVE_CATEGORIES.indexOf(imgNormCat) > -1) {
              imgVersionMatchedId = await findVersionMatch(supabase, userId, imgItem.title, imgItem.body, imgNormCat);
            }
            var imgRow = {
              user_id: userId,
              title: String(imgItem.title || fileName).substring(0, 200),
              content_text: String(imgItem.body || ''),
              content_type: 'image',
              category: imgNormCat,
              tool_tags: imgToolTags,
              status: imgStatus,
              source: 'dropbox',
              tool_source: 'dropbox-import',
              source_ref: imgSourceRef,
              source_item_id: sourceItemId,
              source_detail: imgSourceDetail,
            };
            var imgUpsertRes = await supabase.from('content_library').upsert(imgRow, { onConflict: 'source_ref', ignoreDuplicates: true }).select('id').maybeSingle();
            if (imgUpsertRes.error) { console.error('content_library insert error:', imgUpsertRes.error.message); continue; }
            imported++; fileItemCount++;
            if (imgStatus === 'approved') approved++;
            else if (imgStatus === 'rejected') rejected++;
            else pending++;
            var imgInsertedRow = imgUpsertRes.data;
            if (imgInsertedRow && imgNormCat === 'Financial Documents') {
              var imgPairMatchId = await findVersionMatch(supabase, userId, imgItem.title, imgItem.body, 'Financial Documents');
              if (imgPairMatchId) {
                var imgPairId = randomUUID();
                fin_docs_paired++;
                await supabase.from('content_library').update({ status: 'pending', version_pair_id: imgPairId }).eq('id', imgPairMatchId);
                await supabase.from('content_library').update({ version_pair_id: imgPairId }).eq('id', imgInsertedRow.id);
              }
            }
            if (imgInsertedRow && imgVersionMatchedId) {
              var imgArchResult = await supabase.from('content_library').update({ status: 'archived', version_archived_by: imgInsertedRow.id }).eq('id', imgVersionMatchedId);
              if (!imgArchResult.error) auto_archived++;
            }
          }
          if (sourceItemId && fileItemCount > 0) {
            await supabase.from('cl_source_items').update({ item_count: fileItemCount }).eq('id', sourceItemId);
          }
          continue;
        }

        // Text/document: run extraction prompt and insert one row per returned item
        const items = await runExtractionPrompt(textContent, fileName, userId);
        if (!items || items.length === 0) { skipped++; skipped_reasons.no_content = (skipped_reasons.no_content || 0) + 1; continue; }

        for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
          const item = items[itemIdx];
          const sourceRef = 'dropbox:' + (file.id || filePath) + ':' + itemIdx;
          var normCat = item.category ? (CATEGORY_LOOKUP[String(item.category).toLowerCase()] || 'Company Information') : 'Company Information';
          var isDiscard = DISCARD_CATEGORIES.indexOf(normCat) > -1;
          var status = isDiscard ? 'rejected' : (item.confidence === 'confident' ? 'approved' : 'pending');
          var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
          var itemSourceDetail = { filename: fileName, folder_name: fileFolderName, mime_type: mimeType, account_email: accountEmail };
          if (isDiscard) itemSourceDetail.rejection_source = 'auto';

          if (normCat === 'Financial Documents') status = 'pending';

          var versionMatchedId = null;
          if (status === 'approved' && AUTO_ARCHIVE_CATEGORIES.indexOf(normCat) > -1) {
            versionMatchedId = await findVersionMatch(supabase, userId, item.title, item.body, normCat);
          }

          const row = {
            user_id: userId,
            title: String(item.title || fileName).substring(0, 200),
            content_text: String(item.body || ''),
            category: normCat,
            tool_tags: toolTags,
            status: status,
            source: 'dropbox',
            tool_source: 'dropbox-import',
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
          if (status === 'approved') approved++;
          else if (status === 'rejected') rejected++;
          else pending++;
          const insertedRow = upsertRes.data;

          if (insertedRow && normCat === 'Financial Documents') {
            var pairMatchId = await findVersionMatch(supabase, userId, item.title, item.body, 'Financial Documents');
            if (pairMatchId) {
              var pairId = randomUUID();
              fin_docs_paired++;
              await supabase.from('content_library').update({ status: 'pending', version_pair_id: pairId }).eq('id', pairMatchId);
              await supabase.from('content_library').update({ version_pair_id: pairId }).eq('id', insertedRow.id);
            }
          }

          if (insertedRow && versionMatchedId) {
            var archResult = await supabase
              .from('content_library')
              .update({ status: 'archived', version_archived_by: insertedRow.id })
              .eq('id', versionMatchedId);
            if (!archResult.error) auto_archived++;
            if (archResult.error) console.error('Auto-archive error:', archResult.error.message);
          }
        }

        if (sourceItemId && fileItemCount > 0) {
          await supabase.from('cl_source_items').update({ item_count: fileItemCount }).eq('id', sourceItemId);
        }
      }

      // ── Cursor: save or cleanup ─────────────────────────────────────
      var batchProcessedIds = processedIds.concat(batch.map(function(f) { return f.id; }));
      if (moreAfterBatch && jobId) {
        var cursorRow = {
          job_id: jobId,
          user_id: userId,
          processed_ids: batchProcessedIds,
          imported: imported,
          approved: approved,
          pending: pending,
          rejected: rejected,
          skipped: skipped,
          auto_archived: auto_archived,
          fin_docs_paired: fin_docs_paired,
          deduped: 0,
          updated_at: new Date().toISOString()
        };
        if (cursorData) {
          await supabase.from('cl_scan_cursors').update(cursorRow).eq('id', cursorData.id);
        } else {
          cursorRow.created_at = new Date().toISOString();
          await supabase.from('cl_scan_cursors').insert(cursorRow);
        }
        console.log('[Dropbox] Batch complete — morePending. Processed so far:', batchProcessedIds.length, 'of', files.length);
        return res.status(200).json({ success: true, imported: imported, approved: approved, pending: pending, rejected: rejected, skipped: skipped, auto_archived: auto_archived, fin_docs_paired: fin_docs_paired, deduped: 0, total: batch.length, morePending: true });
      }

      // All files processed — clean up cursor
      if (jobId) {
        await supabase.from('cl_scan_cursors').delete().eq('job_id', jobId);
      }

      // Stamp last_scanned_at on the account entry
      if (imported > 0) {
        accounts[entryIdx].last_scanned_at = new Date().toISOString();
        await supabase.from('profiles').update({ cl_dropbox_accounts: accounts }).eq('id', userId);
      }

      return res.status(200).json({ success: true, imported: imported, approved: approved, pending: pending, rejected: rejected, skipped: skipped, total: batch.length, deduped: deduped, skipped_reasons: skipped_reasons, auto_archived: auto_archived, fin_docs_paired: fin_docs_paired, morePending: false });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (err) {
    console.error('dropbox-import error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: (err && err.message) || 'unknown' });
  }
}
