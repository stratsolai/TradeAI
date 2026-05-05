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
  buildSingleItemPrompt,
  applyCategoryToolMatrix
} from '../lib/cl-prompts.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

const EXTRACTION_SYSTEM_PROMPT = buildSingleItemPrompt({ source: 'email' });

var BINARY_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
];

var MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

function inferMimeFromFilename(fileName) {
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
  if (ext === 'heic') return 'image/heic';
  return '';
}


async function refreshOutlookToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access',
  }).toString();
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(params).toString(),
    },
    body: params,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Outlook token refresh failed: ' + JSON.stringify(data));
  return data.access_token;
}

// Extract plain text body from Outlook message
function extractOutlookBody(message) {
  if (!message || !message.body) return '';
  // Prefer plain text; fall back to stripping HTML
  if (message.body.contentType === 'text') {
    return message.body.content || '';
  }
  // Strip HTML tags for html content type
  return (message.body.content || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

// Run CL extraction prompt against email content. The sender is
// included in the source content header so RULE 8 (Promotions &
// Offers vs supplier promotions) can be applied — without it the
// model has no way to tell a self-sent campaign from a received
// supplier promotional email.
async function runExtractionPrompt(emailBody, subject, sender, userId) {
  var userContent = 'SOURCE CONTENT (Email from ' + (sender || 'unknown sender') + ', subject: ' + subject + '):\n' + emailBody.substring(0, 6000);

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
  logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'outlook-extraction' });
  if (data.error) {
    console.error('[CL Outlook] Claude API error in extraction prompt:', JSON.stringify(data.error));
    return [];
  }
  const raw = data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('Extraction prompt JSON parse error:', e.message, 'raw:', raw.substring(0, 500));
    return [];
  }
}

// VERSIONING — find existing approved item the new one should archive
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
    logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'outlook-versioning' });
    if (data.error) {
      console.error('[CL Outlook] Claude API error in version match:', JSON.stringify(data.error));
      return null;
    }
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

// DOCX ZIP EXTRACTION — unpack archive and read word/document.xml
function extractDocxXml(buf) {
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

// XLSX ZIP EXTRACTION — unpack archive, read shared strings and sheet data
function extractXlsxText(buf) {
  var eocdOffset = -1;
  for (var i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) return null;
  var cdOffset = buf.readUInt32LE(eocdOffset + 16);
  var numEntries = buf.readUInt16LE(eocdOffset + 10);
  var entries = {};
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
    if (fn === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(fn)) {
      var lfhFnLen = buf.readUInt16LE(localHeaderOffset + 26);
      var lfhExLen = buf.readUInt16LE(localHeaderOffset + 28);
      var dataStart = localHeaderOffset + 30 + lfhFnLen + lfhExLen;
      var compressed = buf.slice(dataStart, dataStart + compressedSize);
      var xmlText = null;
      try {
        if (compressionMethod === 0) { xmlText = compressed.toString('utf-8'); }
        else if (compressionMethod === 8) { xmlText = zlib.inflateRawSync(compressed).toString('utf-8'); }
      } catch (zerr) { xmlText = null; }
      if (xmlText) entries[fn] = xmlText;
    }
    pos += 46 + fileNameLen + extraLen + commentLen;
  }
  var sharedStrings = [];
  if (entries['xl/sharedStrings.xml']) {
    var siRegex = /<si[^>]*>([\s\S]*?)<\/si>/g;
    var siMatch;
    while ((siMatch = siRegex.exec(entries['xl/sharedStrings.xml'])) !== null) {
      var tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      var tMatch;
      var parts = [];
      while ((tMatch = tRegex.exec(siMatch[1])) !== null) { parts.push(tMatch[1]); }
      sharedStrings.push(parts.join(''));
    }
  }
  var allRows = [];
  var sheetKeys = Object.keys(entries).filter(function(k) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(k); }).sort();
  sheetKeys.forEach(function(key) {
    var sheetXml = entries[key];
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
  if (mimeType === 'application/pdf') {
    var base64Data = buffer.toString('base64');
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
    const data = await response.json();
    logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'outlook-extraction' });
    if (data.error) {
      console.error('[CL Outlook] Claude API error in PDF extraction:', JSON.stringify(data.error));
      return null;
    }
    if (data.content && data.content[0]) return data.content[0].text;
    return null;
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try { var text = extractDocxXml(buffer); if (text && text.length >= 50) return text.substring(0, 8000); } catch (e) { console.error('DOCX extraction error:', e.message); }
    var fb = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fb.length >= 50) return fb.substring(0, 8000);
    return null;
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    try { var text = extractXlsxText(buffer); if (text && text.length >= 50) return text.substring(0, 8000); } catch (e) { console.error('XLSX extraction error:', e.message); }
    var fb = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fb.length >= 50) return fb.substring(0, 8000);
    return null;
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    try { var text = extractPptxText(buffer); if (text && text.length >= 50) return text.substring(0, 8000); } catch (e) { console.error('PPTX extraction error:', e.message); }
    var fb = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fb.length >= 50) return fb.substring(0, 8000);
    return null;
  }
  var legacyText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  if (legacyText.length >= 50) return legacyText.substring(0, 8000);
  return null;
}

// Run extraction prompt for attachment text content (same as file connectors)
async function runAttachmentExtractionPrompt(content, fileName, userId) {
  var userContent = 'SOURCE CONTENT (' + fileName + '):\n' + (content || '').substring(0, 8000);
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
  logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'outlook-extraction' });
  if (data.error) {
    console.error('[CL Outlook] Claude API error in attachment extraction:', JSON.stringify(data.error));
    return [];
  }
  const raw = data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Attachment extraction JSON parse error:', e.message, 'raw:', raw.substring(0, 500));
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
  logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-sonnet-4-6', usage: data && data.usage, subtype: 'outlook-image' });
  if (data.error) {
    console.error('[CL Outlook] Claude API error in image extraction:', JSON.stringify(data.error));
    return [];
  }
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret || (req.headers['x-internal-secret'] || '') !== internalSecret) {
    return res.status(401).json({ error: 'Unauthorised — missing or invalid internal secret' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { userId, daysBack, accountEmail, jobId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (!accountEmail) return res.status(400).json({ error: 'accountEmail required' });

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('cl_connected_emails')
      .eq('id', userId)
      .single();

    const connectedEmails = Array.isArray(profile.cl_connected_emails) ? profile.cl_connected_emails : [];
    const outlookEntry = connectedEmails.find(function(e) { return e && (e.provider === 'microsoft' || e.provider === 'outlook') && e.email === accountEmail; });
    if (!outlookEntry || !outlookEntry.access_token) {
      return res.status(400).json({ error: 'Account not connected' });
    }

    let accessToken = outlookEntry.access_token;
    if (outlookEntry.refresh_token) {
      try {
        accessToken = await refreshOutlookToken(outlookEntry.refresh_token);
        outlookEntry.access_token = accessToken;
        await supabase.from('profiles').update({ cl_connected_emails: connectedEmails }).eq('id', userId);
      } catch (e) {}
    }

    // Lookback window — always scan from today minus the user's lookback
    // setting. Deduplication is handled by the source_ref UNIQUE constraint.
    var lookbackDays = parseInt(outlookEntry.lookback_days) || 30;
    var afterDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    console.log('[Outlook] Date filter — lookbackDays:', lookbackDays, 'afterDate:', afterDate, 'accountEmail:', accountEmail);

    // Fetch all matching messages, following pagination
    var messages = [];
    var nextLink = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=' + encodeURIComponent('receivedDateTime ge ' + afterDate) + '&$top=50&$select=id,subject,from,receivedDateTime,body&$orderby=receivedDateTime desc';
    while (nextLink) {
      var listRes = await fetch(nextLink, { headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' } });
      if (!listRes.ok) {
        var errBody = await listRes.json().catch(function () { return {}; });
        var errMsg = (errBody.error && errBody.error.message) || ('Graph API returned ' + listRes.status);
        return res.status(502).json({ error: 'Outlook API error: ' + errMsg });
      }
      var listData = await listRes.json();
      if (listData.value) messages = messages.concat(listData.value);
      nextLink = listData['@odata.nextLink'] || null;
      console.log('[Outlook] Page fetched — count:', (listData.value || []).length, 'totalSoFar:', messages.length, 'hasNextPage:', !!nextLink);
    }

    // ── Pre-filter — skip emails already processed in previous scans ──
    if (messages.length > 0) {
      var sourceRefs = messages.map(function(m) { return 'outlook-email:' + m.id + ':0'; });
      var existingRes = await supabase
        .from('content_library')
        .select('source_ref')
        .eq('user_id', userId)
        .in('source_ref', sourceRefs);
      if (existingRes.error) {
        console.error('[Outlook] Pre-filter query error:', existingRes.error.message);
      } else if (existingRes.data && existingRes.data.length > 0) {
        var existingRefs = new Set();
        existingRes.data.forEach(function(row) { existingRefs.add(row.source_ref); });
        var beforeCount = messages.length;
        messages = messages.filter(function(m) { return !existingRefs.has('outlook-email:' + m.id + ':0'); });
        console.log('[Outlook] Pre-filtered — already in content_library:', beforeCount - messages.length, 'remaining:', messages.length);
      }
    }

    // ── Cursor — resume from previous batch if cursor exists ──────────
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

    // Filter out already-processed messages and take the next batch
    var allMessageIds = messages.map(function(m) { return m.id; });
    var remaining = messages.filter(function(m) { return processedIds.indexOf(m.id) === -1; });
    var batch = remaining.slice(0, BATCH_SIZE);
    var moreAfterBatch = remaining.length > BATCH_SIZE;
    console.log('[Outlook] Cursor — total:', messages.length, 'alreadyProcessed:', processedIds.length, 'remaining:', remaining.length, 'batch:', batch.length, 'morePending:', moreAfterBatch);

    let imported = 0;
    let skipped = 0;
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    var skipped_reasons = {};
    var auto_archived = 0;
    var fin_docs_paired = 0;

    for (const msg of batch) {
      const subject = msg.subject || '(no subject)';
      const sender = (msg.from && msg.from.emailAddress) ? (msg.from.emailAddress.name ? msg.from.emailAddress.name + ' <' + msg.from.emailAddress.address + '>' : msg.from.emailAddress.address) : '';
      const emailBody = extractOutlookBody(msg);

      // Body length gate removed — the AI's no_content skip below
      // handles emails it can't extract anything useful from.

      // Save source to cl-assets and create cl_source_items row
      var sourceItemId = null;
      var msgItemCount = 0;
      try {
        var emailStoragePath = userId + '/email/outlook_' + msg.id.substring(0, 40) + '.txt';
        await supabase.storage.from('cl-assets').upload(emailStoragePath, Buffer.from(emailBody, 'utf-8'), { contentType: 'text/plain', upsert: false });
        var siResult = await supabase
          .from('cl_source_items')
          .insert({
            user_id: userId,
            source_type: 'email',
            filename: subject,
            file_url: emailStoragePath,
            source_url: null,
            source_detail: { sender: sender, subject: subject, account_email: accountEmail, outlook_message_id: msg.id },
            item_count: 0,
          })
          .select('id')
          .single();
        if (siResult.data) sourceItemId = siResult.data.id;
      } catch (e) {
        console.error('cl-assets/cl_source_items save error:', e.message);
      }

      const items = await runExtractionPrompt(emailBody, subject, sender, userId);
      if (!items || items.length === 0) { skipped++; skipped_reasons.no_content = (skipped_reasons.no_content || 0) + 1; continue; }

      for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        const sourceRef = 'outlook-email:' + msg.id + ':' + itemIdx;
        var normCat = item.category ? (CATEGORY_LOOKUP[String(item.category).toLowerCase()] || 'Company Information') : 'Company Information';
        console.log('[Versioning] Item category — raw:', JSON.stringify(item.category), 'normalised:', normCat);
        var isDiscard = DISCARD_CATEGORIES.indexOf(normCat) > -1;
        var status = isDiscard ? 'rejected' : (item.confidence === 'confident' ? 'approved' : 'pending');
        var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
        toolTags = applyCategoryToolMatrix(normCat, toolTags);
        var itemSourceDetail = { sender: sender, subject: subject, account_email: accountEmail };
        if (isDiscard) itemSourceDetail.rejection_source = 'auto';

        // Versioning — Financial Documents always go to pending. Pair check happens after insert.
        if (normCat === 'Financial Documents') {
          status = 'pending';
        }

        // Versioning — auto-archive match check (only approved items in archive categories)
        var versionMatchedId = null;
        if (status === 'approved' && AUTO_ARCHIVE_CATEGORIES.indexOf(normCat) > -1) {
          versionMatchedId = await findVersionMatch(supabase, userId, item.title, item.body, normCat);
        }

        const row = {
          user_id: userId,
          title: String(item.title || subject).substring(0, 200),
          content_text: String(item.body || ''),
          category: normCat,
          tool_tags: toolTags,
          status: status,
          source: 'email',
          tool_source: 'cl-outlook-scan',
          source_ref: sourceRef,
          source_item_id: sourceItemId,
          source_detail: itemSourceDetail,
        };

        const { data: insertedRow, error } = await supabase.from('content_library').upsert(row, { onConflict: 'source_ref', ignoreDuplicates: true }).select('id').maybeSingle();
        if (!error) {
          imported++;
          msgItemCount++;
          if (status === 'approved') approved++;
          else if (status === 'rejected') rejected++;
          else pending++;
        }

        // Versioning — Financial Documents pair check (after insert)
        if (!error && insertedRow && normCat === 'Financial Documents') {
          var pairMatchId = await findVersionMatch(supabase, userId, item.title, item.body, 'Financial Documents');
          if (pairMatchId) {
            var pairId = randomUUID();
            fin_docs_paired++;
            var existingPairUpdate = await supabase
              .from('content_library')
              .update({ status: 'pending', version_pair_id: pairId })
              .eq('id', pairMatchId);
            var newPairUpdate = await supabase
              .from('content_library')
              .update({ version_pair_id: pairId })
              .eq('id', insertedRow.id);
            console.log('[Versioning] Financial Documents paired — pair_id:', pairId, 'existing:', pairMatchId, 'new:', insertedRow.id, 'errors:', existingPairUpdate.error && existingPairUpdate.error.message, newPairUpdate.error && newPairUpdate.error.message);
          } else {
            console.log('[Versioning] Financial Documents — no matching approved item found, new item sits alone');
          }
        }

        // Versioning — apply auto-archive on match
        if (!error && insertedRow && versionMatchedId) {
          var archResult = await supabase
            .from('content_library')
            .update({ status: 'archived', version_archived_by: insertedRow.id })
            .eq('id', versionMatchedId);
          if (!archResult.error) auto_archived++;
          else console.error('Auto-archive error:', archResult.error.message);
        }
      }

      // Update cl_source_items item_count
      if (sourceItemId && msgItemCount > 0) {
        await supabase.from('cl_source_items').update({ item_count: msgItemCount }).eq('id', sourceItemId);
      }

      // --- ATTACHMENT PROCESSING ---
      // Fetch attachments list via Graph API
      var attListRes = await fetch(
        'https://graph.microsoft.com/v1.0/me/messages/' + msg.id + '/attachments?$select=id,name,contentType,size,isInline',
        { headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' } }
      );
      var attachmentsList = [];
      if (attListRes.ok) {
        var attListData = await attListRes.json();
        attachmentsList = attListData.value || [];
      } else {
        console.error('[Outlook Attachment] List fetch failed:', msg.id, attListRes.status);
      }

      for (var attIdx = 0; attIdx < attachmentsList.length; attIdx++) {
        var att = attachmentsList[attIdx];
        console.log('[Outlook Attachment]', att.name, 'contentType:', att.contentType, 'size:', att.size, 'isInline:', att.isInline, 'id:', att.id ? att.id.substring(0, 20) + '...' : 'none');

        // Skip inline attachments (embedded images in HTML body)
        if (att.isInline) {
          console.log('[Outlook Attachment] SKIPPED — inline attachment:', att.name);
          continue;
        }

        // Size gate — skip attachments over 20 MB
        if (att.size > MAX_ATTACHMENT_BYTES) {
          console.log('[Outlook Attachment] SKIPPED — oversized:', att.size);
          skipped++;
          skipped_reasons.attachment_oversized = (skipped_reasons.attachment_oversized || 0) + 1;
          continue;
        }

        // Determine MIME type — prefer Graph-reported, fall back to filename inference
        var attMime = att.contentType || inferMimeFromFilename(att.name);
        var isImage = attMime.indexOf('image/') === 0;
        var isText = attMime.indexOf('text/') === 0;
        var isBinaryDoc = BINARY_MIME_TYPES.indexOf(attMime) > -1;
        if (!isImage && !isText && !isBinaryDoc) {
          console.log('[Outlook Attachment] SKIPPED — unsupported format:', attMime, att.name);
          skipped++;
          skipped_reasons.attachment_unsupported_format = (skipped_reasons.attachment_unsupported_format || 0) + 1;
          continue;
        }

        // Download attachment content via Graph API
        var attDataRes = await fetch(
          'https://graph.microsoft.com/v1.0/me/messages/' + msg.id + '/attachments/' + att.id + '/$value',
          { headers: { 'Authorization': 'Bearer ' + accessToken } }
        );
        if (!attDataRes.ok) {
          console.error('[Outlook Attachment] Download failed:', att.name, attDataRes.status);
          skipped++;
          skipped_reasons.attachment_download_failed = (skipped_reasons.attachment_download_failed || 0) + 1;
          continue;
        }
        var attArrayBuffer = await attDataRes.arrayBuffer();
        var attBuffer = Buffer.from(attArrayBuffer);
        if (!attBuffer || attBuffer.length === 0) {
          console.log('[Outlook Attachment] SKIPPED — empty content:', att.name);
          skipped++;
          skipped_reasons.attachment_download_failed = (skipped_reasons.attachment_download_failed || 0) + 1;
          continue;
        }

        // Create cl_source_items row for this attachment
        var attSourceItemId = null;
        var attItemCount = 0;
        var attStorageExt = (att.name || '').split('.').pop().toLowerCase() || 'bin';
        var attStoragePath = userId + '/email-attachment/outlook_' + msg.id.substring(0, 40) + '_' + attIdx + '.' + attStorageExt;
        try {
          await supabase.storage.from('cl-assets').upload(attStoragePath, attBuffer, { contentType: attMime, upsert: false });
          var attSiResult = await supabase
            .from('cl_source_items')
            .insert({
              user_id: userId,
              source_type: 'email-attachment',
              filename: att.name,
              file_url: attStoragePath,
              source_url: null,
              source_detail: { sender: sender, subject: subject, account_email: accountEmail, outlook_message_id: msg.id, attachment_id: att.id, attachment_filename: att.name, attachment_mime: attMime, attachment_size: att.size },
              item_count: 0,
            })
            .select('id')
            .single();
          if (attSiResult.data) attSourceItemId = attSiResult.data.id;
        } catch (attSaveErr) {
          console.error('[Outlook Attachment] cl-assets/cl_source_items save error:', attSaveErr.message);
        }

        // Extract content based on file type
        var attItems = [];
        var attBase64 = attBuffer.toString('base64');
        try {
          if (isImage) {
            attItems = await runImageExtraction(attBase64, attMime, userId);
          } else if (isText) {
            var textContent = attBuffer.toString('utf-8');
            if (textContent && textContent.trim().length >= 50) {
              attItems = await runAttachmentExtractionPrompt(textContent, att.name, userId);
            }
          } else if (isBinaryDoc) {
            var extractedText = await extractBinaryFileText(attBuffer, attMime, userId);
            if (extractedText && extractedText.trim().length >= 50) {
              attItems = await runAttachmentExtractionPrompt(extractedText, att.name, userId);
            }
          }
        } catch (extractErr) {
          console.error('[Outlook Attachment] Extraction error:', att.name, extractErr.message);
        }

        if (!attItems || attItems.length === 0) {
          console.log('[Outlook Attachment] SKIPPED — no extractable content:', att.name);
          skipped++;
          skipped_reasons.attachment_no_content = (skipped_reasons.attachment_no_content || 0) + 1;
          continue;
        }

        // Insert extracted items into content_library
        for (var attItemIdx = 0; attItemIdx < attItems.length; attItemIdx++) {
          var attItem = attItems[attItemIdx];
          var attSourceRef = 'outlook-email-attachment:' + msg.id + ':' + att.id + ':' + attItemIdx;
          var attNormCat = attItem.category ? (CATEGORY_LOOKUP[String(attItem.category).toLowerCase()] || 'Company Information') : 'Company Information';
          var attIsDiscard = DISCARD_CATEGORIES.indexOf(attNormCat) > -1;
          var attStatus = attIsDiscard ? 'rejected' : (attItem.confidence === 'confident' ? 'approved' : 'pending');
          var attToolTags = Array.isArray(attItem.tool_tags) ? attItem.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
          attToolTags = applyCategoryToolMatrix(attNormCat, attToolTags);
          var attItemSourceDetail = { sender: sender, subject: subject, account_email: accountEmail, attachment_filename: att.name, attachment_mime: attMime };
          if (attIsDiscard) attItemSourceDetail.rejection_source = 'auto';

          if (attNormCat === 'Financial Documents') {
            attStatus = 'pending';
          }

          var attVersionMatchedId = null;
          if (attStatus === 'approved' && AUTO_ARCHIVE_CATEGORIES.indexOf(attNormCat) > -1) {
            attVersionMatchedId = await findVersionMatch(supabase, userId, attItem.title, attItem.body, attNormCat);
          }

          var attRow = {
            user_id: userId,
            title: String(attItem.title || att.name).substring(0, 200),
            content_text: String(attItem.body || ''),
            category: attNormCat,
            tool_tags: attToolTags,
            status: attStatus,
            source: 'email-attachment',
            tool_source: 'cl-outlook-scan',
            source_ref: attSourceRef,
            source_item_id: attSourceItemId,
            source_detail: attItemSourceDetail,
          };

          var attInsertResult = await supabase.from('content_library').upsert(attRow, { onConflict: 'source_ref', ignoreDuplicates: true }).select('id').maybeSingle();
          if (attInsertResult.error) {
            console.error('[Outlook Attachment] INSERT ERROR —', attInsertResult.error.message);
          } else {
            console.log('[Outlook Attachment] INSERTED — title:', attRow.title, 'sourceRef:', attSourceRef);
            imported++;
            attItemCount++;
            if (attStatus === 'approved') approved++;
            else if (attStatus === 'rejected') rejected++;
            else pending++;
          }

          // Versioning — Financial Documents pair check
          if (!attInsertResult.error && attInsertResult.data && attNormCat === 'Financial Documents') {
            var attPairMatchId = await findVersionMatch(supabase, userId, attItem.title, attItem.body, 'Financial Documents');
            if (attPairMatchId) {
              var attPairId = randomUUID();
              fin_docs_paired++;
              await supabase.from('content_library').update({ status: 'pending', version_pair_id: attPairId }).eq('id', attPairMatchId);
              await supabase.from('content_library').update({ version_pair_id: attPairId }).eq('id', attInsertResult.data.id);
              console.log('[Outlook Attachment] Financial Documents paired — pair_id:', attPairId);
            }
          }

          // Versioning — apply auto-archive on match
          if (!attInsertResult.error && attInsertResult.data && attVersionMatchedId) {
            var attArchResult = await supabase.from('content_library').update({ status: 'archived', version_archived_by: attInsertResult.data.id }).eq('id', attVersionMatchedId);
            if (!attArchResult.error) auto_archived++;
            else console.error('[Outlook Attachment] Auto-archive error:', attArchResult.error.message);
          }
        }

        // Update attachment cl_source_items item_count
        if (attSourceItemId && attItemCount > 0) {
          await supabase.from('cl_source_items').update({ item_count: attItemCount }).eq('id', attSourceItemId);
        }
      }
    }

    // ── Cursor — save or clean up ──────────────────────────────────────
    var batchProcessedIds = processedIds.concat(batch.map(function(m) { return m.id; }));

    if (moreAfterBatch && jobId) {
      // More messages remain — save cursor and return morePending
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
      console.log('[Outlook] Batch complete — morePending. Processed so far:', batchProcessedIds.length, 'of', messages.length);
      return res.status(200).json({ success: true, imported, approved, pending, rejected, skipped, skipped_reasons: skipped_reasons, auto_archived: auto_archived, fin_docs_paired: fin_docs_paired, total: batch.length, morePending: true });
    }

    // All messages processed — clean up cursor and write last_scanned_at
    if (jobId) {
      await supabase.from('cl_scan_cursors').delete().eq('job_id', jobId);
    }

    // last_scanned_at is no longer used for query filtering — the lookback
    // window is the sole date bound and dedup is handled by source_ref.
    // Stamp is kept for informational purposes only.
    if (imported > 0) {
      outlookEntry.last_scanned_at = new Date().toISOString();
      await supabase.from('profiles').update({ cl_connected_emails: connectedEmails }).eq('id', userId);
    }

    return res.status(200).json({ success: true, imported, approved, pending, rejected, skipped, skipped_reasons: skipped_reasons, auto_archived: auto_archived, fin_docs_paired: fin_docs_paired, total: messages.length, morePending: false });

  } catch (err) {
    console.error('cl-outlook-scan error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
