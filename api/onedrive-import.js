// api/onedrive-import.js — Task 10 Step 2
// Action-dispatch import endpoint for OneDrive sources.
// Mirrors api/drive-import.js dispatch shape, api/cl-email-scan.js multi-account
// + token-refresh + extraction + versioning shape, and the JWT auth pattern from
// api/email-assistant-settings.js. JWT required.
//
// Multi-account: tokens are read from profiles.cl_onedrive_accounts (jsonb array).
// Each entry: { account_email, access_token, refresh_token, connected_at, folders, last_scanned_at }
//
// Actions:
//   list-folders { accountEmail }            → top-level OneDrive folders
//   import-all   { accountEmail, folderId }  → scan one folder, full extraction pipeline
//
// All extracted items land in content_library with status pending/approved/rejected
// according to the fixed-18-category extraction prompt (matches process-file.js,
// cl-email-scan.js, cl-outlook-scan.js — Task 8 Step 7).

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import zlib from 'zlib';
import { logAnthropicUsage } from '../lib/usage-logger.js';
import { buildSourceUniqueKey, ensureSourceItem } from '../lib/cl-source-items.js';
import { runExtractionPrompt as sharedRunExtractionPrompt, runImageExtraction as sharedRunImageExtraction } from '../lib/cl-extraction.js';
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

const EXTRACTION_SYSTEM_PROMPT = buildSingleItemPrompt({ source: 'file' });


// MIME types we can extract text from via Claude document API. The
// modern Office Open XML formats (docx/xlsx/pptx) and PDF are the
// reliable cases. Legacy Office (msword/ms-excel/ms-powerpoint) is
// included so .doc/.xls/.ppt files in OneDrive stop being silently
// dropped at the format gate — Claude's document API may not always
// extract them cleanly, but a logged failed extraction is strictly
// better than the previous silent skip with no record at all.
const ONEDRIVE_BINARY_DOC_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
];

// Refresh a Microsoft OAuth token for OneDrive scopes.
// Returns { access_token, refresh_token } where refresh_token may be the
// original (Microsoft does not always rotate it on refresh).
async function refreshMicrosoftToken(refreshToken) {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'Files.Read.All offline_access User.Read',
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Microsoft token refresh failed: ' + (data.error_description || data.error || 'unknown'));
  return { access_token: data.access_token, refresh_token: data.refresh_token || refreshToken };
}

// Download a OneDrive file as a Buffer (follows the redirect to download URL).
async function fetchOneDriveFileBuffer(itemId, accessToken) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/drive/items/' + itemId + '/content', {
    headers: { 'Authorization': 'Bearer ' + accessToken },
    redirect: 'follow',
  });
  if (!res.ok) {
    console.error('OneDrive file download failed:', itemId, res.status);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

// DOCX ZIP EXTRACTION — parse DOCX archive, find word/document.xml, decompress, strip XML
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
    logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'onedrive-extraction' });
    if (data.content && data.content[0]) return data.content[0].text;
    return null;
  }

  // DOCX: local ZIP extraction
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try { var text = extractDocxXml(buffer); if (text && text.length >= 50) return text.substring(0, 8000); } catch (e) { console.error('DOCX extraction error:', e.message); }
    var fb = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fb.length >= 50) return fb.substring(0, 8000);
    return null;
  }

  // XLSX: local ZIP extraction
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    try { var text = extractXlsxText(buffer); if (text && text.length >= 50) return text.substring(0, 8000); } catch (e) { console.error('XLSX extraction error:', e.message); }
    var fb = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fb.length >= 50) return fb.substring(0, 8000);
    return null;
  }

  // PPTX: local ZIP extraction
  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    try { var text = extractPptxText(buffer); if (text && text.length >= 50) return text.substring(0, 8000); } catch (e) { console.error('PPTX extraction error:', e.message); }
    var fb = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fb.length >= 50) return fb.substring(0, 8000);
    return null;
  }

  // Legacy Office (DOC/XLS/PPT): binary text extraction fallback
  var legacyText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  if (legacyText.length >= 50) return legacyText.substring(0, 8000);
  return null;
}

// Recursively list every file under a OneDrive folder by walking
// children depth-first from the selected folder root. Folders
// contribute their children but are not themselves returned — only
// items with a .file facet end up in the result. Mirrors the
// listAllSharePointLibraryFiles helper in sharepoint-import.js,
// adapted to OneDrive's /me/drive/items/{itemId}/children URL.
// $top=200 cap is consistent with the rest of this file (pagination
// of @odata.nextLink is a known limitation tracked in CLAUDE.md).
async function listAllOneDriveFolderFiles(folderId, accessToken) {
  var collected = [];
  var toVisit = [
    'https://graph.microsoft.com/v1.0/me/drive/items/' + folderId + '/children?$top=200&$select=id,name,file,folder,size,lastModifiedDateTime'
  ];
  while (toVisit.length > 0) {
    var url = toVisit.shift();
    var res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken } });
    if (!res.ok) {
      var errBody = await res.json().catch(function () { return {}; });
      var errMsg = (errBody.error && errBody.error.message) || ('Microsoft Graph returned ' + res.status);
      throw new Error(errMsg);
    }
    var data = await res.json();
    var items = (data && data.value) || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      if (it.file) {
        collected.push(it);
      } else if (it.folder && it.id) {
        toVisit.push(
          'https://graph.microsoft.com/v1.0/me/drive/items/' + it.id + '/children?$top=200&$select=id,name,file,folder,size,lastModifiedDateTime'
        );
      }
    }
  }
  return collected;
}

// Resolve a OneDrive file to a plain-text body suitable for the extraction prompt.
// Returns null if the type is unsupported or extraction fails.
async function fetchOneDriveFileText(itemId, mimeType, accessToken, userId) {
  const buffer = await fetchOneDriveFileBuffer(itemId, accessToken);
  if (!buffer) return null;
  if (ONEDRIVE_BINARY_DOC_MIME.indexOf(mimeType) > -1) {
    return await extractBinaryFileText(buffer, mimeType, userId);
  }
  if (mimeType && mimeType.indexOf('text/') === 0) {
    return buffer.toString('utf-8').substring(0, 8000);
  }
  return null;
}

// Run the fixed-18-category extraction prompt against text content.
async function runExtractionPrompt(content, fileName, userId) {
  const userContent = 'SOURCE CONTENT (' + fileName + '):\n' + (content || '').substring(0, 8000);
  return sharedRunExtractionPrompt({
    apiKey: ANTHROPIC_API_KEY,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userContent: userContent,
    userId: userId,
    subtype: 'onedrive-extraction',
    errorScope: 'CL OneDrive',
  });
}

// Run image extraction via Claude Sonnet vision — single combined call.
async function runImageExtraction(base64Data, mediaType, userId) {
  return sharedRunImageExtraction({
    apiKey: ANTHROPIC_API_KEY,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    base64Data: base64Data,
    mediaType: mediaType,
    imagePrompt: IMAGE_PROMPT,
    userId: userId,
    subtype: 'onedrive-image',
    errorScope: 'CL OneDrive',
  });
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
    logAnthropicUsage({ tool_id: 'content-library', user_id: userId || null, model: 'claude-haiku-4-5-20251001', usage: data && data.usage, subtype: 'onedrive-versioning' });
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
  const folderId = body.folderId;
  const jobId = body.jobId;

  if (!action) return res.status(400).json({ error: 'action required' });
  if (!accountEmail) return res.status(400).json({ error: 'accountEmail required' });

  try {
    // ── Read profile and resolve account entry ─────────────────────────
    const profileRes = await supabase
      .from('profiles')
      .select('cl_onedrive_accounts')
      .eq('id', userId)
      .single();
    if (profileRes.error) {
      console.error('onedrive-import profile read error:', profileRes.error.message);
      return res.status(500).json({ error: profileRes.error.message });
    }
    const accounts = Array.isArray(profileRes.data && profileRes.data.cl_onedrive_accounts)
      ? profileRes.data.cl_onedrive_accounts
      : [];
    const entryIdx = accounts.findIndex(function(a) { return a && a.account_email === accountEmail; });
    if (entryIdx === -1) {
      return res.status(400).json({ error: 'OneDrive account not connected' });
    }
    const entry = accounts[entryIdx];
    if (!entry.access_token) {
      return res.status(400).json({ error: 'OneDrive account has no access token. Please reconnect.' });
    }

    // ── Refresh access token if a refresh token is available ───────────
    let accessToken = entry.access_token;
    if (entry.refresh_token) {
      try {
        const refreshed = await refreshMicrosoftToken(entry.refresh_token);
        accessToken = refreshed.access_token;
        accounts[entryIdx].access_token = refreshed.access_token;
        accounts[entryIdx].refresh_token = refreshed.refresh_token;
        await supabase.from('profiles').update({ cl_onedrive_accounts: accounts }).eq('id', userId);
      } catch (e) {
        console.error('OneDrive token refresh failed:', e.message);
        return res.status(401).json({ error: 'OneDrive token expired. Please reconnect this account in Settings.' });
      }
    }

    // ── ACTION: list-folders ───────────────────────────────────────────
    if (action === 'list-folders') {
      const listRes = await fetch(
        'https://graph.microsoft.com/v1.0/me/drive/root/children?$top=200&$select=id,name,folder',
        { headers: { 'Authorization': 'Bearer ' + accessToken } }
      );
      if (!listRes.ok) {
        const errBody = await listRes.json().catch(function() { return {}; });
        const errMsg = (errBody.error && errBody.error.message) || ('Microsoft Graph returned ' + listRes.status);
        console.error('OneDrive list-folders error:', errMsg);
        return res.status(502).json({ error: 'OneDrive API error: ' + errMsg });
      }
      const listData = await listRes.json();
      const items = listData.value || [];
      const folders = items
        .filter(function(it) { return it && it.folder; })
        .map(function(it) { return { id: it.id, name: it.name }; });
      return res.status(200).json({ success: true, folders: folders });
    }

    // ── ACTION: import-all ─────────────────────────────────────────────
    if (action === 'import-all') {
      if (!folderId) return res.status(400).json({ error: 'folderId required' });

      // Resolve folder name for source_detail
      let folderName = folderId;
      try {
        const folderRes = await fetch(
          'https://graph.microsoft.com/v1.0/me/drive/items/' + folderId + '?$select=id,name',
          { headers: { 'Authorization': 'Bearer ' + accessToken } }
        );
        if (folderRes.ok) {
          const folderData = await folderRes.json();
          folderName = folderData.name || folderId;
        }
      } catch (e) {
        console.error('OneDrive folder name lookup failed:', e.message);
      }

      // Recursively list every file in the selected folder by walking
      // its subfolders from root. Files inside subfolders must be
      // scanned, not just the immediate children of the selected
      // folder — same fix that landed in sharepoint-import.js earlier.
      let allFiles = [];
      try {
        allFiles = await listAllOneDriveFolderFiles(folderId, accessToken);
      } catch (e) {
        console.error('OneDrive list-children error:', e.message);
        return res.status(502).json({ error: 'OneDrive API error: ' + e.message });
      }

      // Lookback filter — only process files created within the user's
      // lookback window. Default 1 month. null means all time (no filter).
      var lookbackMonths = entry.lookback_months === undefined ? 1 : entry.lookback_months;
      if (lookbackMonths != null) {
        var cutoffDate = new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
        allFiles = allFiles.filter(function(f) { return f.lastModifiedDateTime && f.lastModifiedDateTime >= cutoffDate; });
        console.log('[OneDrive] Lookback filter — months:', lookbackMonths, 'cutoff:', cutoffDate, 'filesAfterFilter:', allFiles.length);
      }

      // Skip files that already have a cl_source_items row from a prior scan.
      // Dedup runs on cl_source_items.source_unique_key (key format
      // 'onedrive:<onedrive_item_id>'). Legacy rows with NULL
      // source_unique_key won't match — those files will fall through and
      // dedup again at the content_library row level until the Step 8
      // backfill runs.
      var fileKeys = allFiles.map(function(f) { return buildSourceUniqueKey('onedrive', { onedrive_item_id: f.id }); });
      var scannedKeys = new Set();
      if (fileKeys.length > 0) {
        const existingSI = await supabase
          .from('cl_source_items')
          .select('source_unique_key')
          .eq('user_id', userId)
          .in('source_unique_key', fileKeys);
        if (existingSI && existingSI.error) {
          console.error('[OneDrive] Pre-filter query error:', existingSI.error.message);
        } else if (existingSI && existingSI.data) {
          existingSI.data.forEach(function(r) { scannedKeys.add(r.source_unique_key); });
        }
      }
      const files = allFiles.filter(function(f) {
        return !scannedKeys.has(buildSourceUniqueKey('onedrive', { onedrive_item_id: f.id }));
      });
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
      console.log('[OneDrive] Cursor — total:', files.length, 'alreadyProcessed:', processedIds.length, 'remaining:', remaining.length, 'batch:', batch.length, 'morePending:', moreAfterBatch);

      let imported = 0;
      let skipped = 0;
      let approved = 0;
      let pending = 0;
      let rejected = 0;
      var skipped_reasons = {};
      var auto_archived = 0;
      var fin_docs_paired = 0;

      for (const file of batch) {
        const mimeType = (file.file && file.file.mimeType) || '';
        const isImage = mimeType.indexOf('image/') === 0;
        const isText = mimeType.indexOf('text/') === 0;
        const isBinaryDoc = ONEDRIVE_BINARY_DOC_MIME.indexOf(mimeType) > -1;

        if (!isImage && !isText && !isBinaryDoc) { skipped++; skipped_reasons.unsupported_format = (skipped_reasons.unsupported_format || 0) + 1; continue; }

        let textContent = null;
        let imageBuffer = null;

        if (isImage) {
          imageBuffer = await fetchOneDriveFileBuffer(file.id, accessToken);
          if (!imageBuffer) { skipped++; skipped_reasons.extraction_failed = (skipped_reasons.extraction_failed || 0) + 1; continue; }
        } else {
          textContent = await fetchOneDriveFileText(file.id, mimeType, accessToken, userId);
          if (!textContent) { skipped++; skipped_reasons.extraction_failed = (skipped_reasons.extraction_failed || 0) + 1; continue; }
        }

        // Save source bytes to cl-assets, then find-or-create the cl_source_items row.
        // content_library rows are only written when the source row exists — if
        // either step fails we skip this file and the next scan will retry.
        // Storage uses upsert: true (Section 2.1) so retries after a previous
        // crash don't get blocked by the existing object.
        var sourceItemId = null;
        var fileItemCount = 0;
        var safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        var storagePath = userId + '/onedrive/' + file.id + '_' + safeFileName;
        var fileSourceKey = buildSourceUniqueKey('onedrive', { onedrive_item_id: file.id });

        var uploadRes = null;
        if (isImage && imageBuffer) {
          uploadRes = await supabase.storage
            .from('cl-assets')
            .upload(storagePath, imageBuffer, { contentType: mimeType, upsert: true });
        } else if (textContent) {
          uploadRes = await supabase.storage
            .from('cl-assets')
            .upload(storagePath, Buffer.from(textContent, 'utf-8'), { contentType: 'text/plain', upsert: true });
        }
        if (uploadRes && uploadRes.error) {
          console.error('[OneDrive] Storage upload failed — fileId:', file.id, 'error:', uploadRes.error.message);
          skipped++;
          skipped_reasons.source_row_failed = (skipped_reasons.source_row_failed || 0) + 1;
          continue;
        }

        sourceItemId = await ensureSourceItem(supabase, {
          user_id: userId,
          source_unique_key: fileSourceKey,
          source_type: 'onedrive',
          fields: {
            source_type: 'onedrive',
            filename: file.name,
            file_url: storagePath,
            source_url: null,
            source_detail: { onedrive_item_id: file.id, folder_id: folderId, folder_name: folderName, mime_type: mimeType, account_email: accountEmail },
            item_count: 0,
          },
        });
        if (!sourceItemId) {
          console.error('[OneDrive] Source row failed — fileId:', file.id);
          skipped++;
          skipped_reasons.source_row_failed = (skipped_reasons.source_row_failed || 0) + 1;
          continue;
        }

        // Images: run vision extraction via Claude Sonnet
        if (isImage) {
          var base64Data = imageBuffer.toString('base64');
          var imgItems = await runImageExtraction(base64Data, mimeType, userId);
          if (!imgItems || imgItems.length === 0) { skipped++; skipped_reasons.no_content = (skipped_reasons.no_content || 0) + 1; continue; }
          for (var imgIdx = 0; imgIdx < imgItems.length; imgIdx++) {
            var imgItem = imgItems[imgIdx];
            var imgSourceRef = 'onedrive:' + file.id + ':' + imgIdx;
            var imgNormCat = imgItem.category ? (CATEGORY_LOOKUP[String(imgItem.category).toLowerCase()] || 'Jobs, Portfolio & Photos') : 'Jobs, Portfolio & Photos';
            var imgIsDiscard = DISCARD_CATEGORIES.indexOf(imgNormCat) > -1;
            var imgStatus = imgIsDiscard ? 'rejected' : (imgItem.confidence === 'confident' ? 'approved' : 'pending');
            var imgToolTags = Array.isArray(imgItem.tool_tags) ? imgItem.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
            imgToolTags = applyCategoryToolMatrix(imgNormCat, imgToolTags);
            var imgSourceDetail = { filename: file.name, folder_name: folderName, mime_type: mimeType, account_email: accountEmail };
            if (imgIsDiscard) imgSourceDetail.rejection_source = 'auto';
            if (imgNormCat === 'Financial Documents') imgStatus = 'pending';
            var imgVersionMatchedId = null;
            if (imgStatus === 'approved' && AUTO_ARCHIVE_CATEGORIES.indexOf(imgNormCat) > -1) {
              imgVersionMatchedId = await findVersionMatch(supabase, userId, imgItem.title, imgItem.body, imgNormCat);
            }
            var imgRow = {
              user_id: userId,
              title: String(imgItem.title || file.name).substring(0, 200),
              content_text: String(imgItem.body || ''),
              content_type: 'image',
              category: imgNormCat,
              tool_tags: imgToolTags,
              status: imgStatus,
              source: 'onedrive',
              tool_source: 'onedrive-import',
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
        const items = await runExtractionPrompt(textContent, file.name, userId);
        if (!items || items.length === 0) { skipped++; skipped_reasons.no_content = (skipped_reasons.no_content || 0) + 1; continue; }

        for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
          const item = items[itemIdx];
          const sourceRef = 'onedrive:' + file.id + ':' + itemIdx;
          var normCat = item.category ? (CATEGORY_LOOKUP[String(item.category).toLowerCase()] || 'Company Information') : 'Company Information';
          var isDiscard = DISCARD_CATEGORIES.indexOf(normCat) > -1;
          var status = isDiscard ? 'rejected' : (item.confidence === 'confident' ? 'approved' : 'pending');
          var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
          toolTags = applyCategoryToolMatrix(normCat, toolTags);
          var itemSourceDetail = { filename: file.name, folder_name: folderName, mime_type: mimeType, account_email: accountEmail };
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
            title: String(item.title || file.name).substring(0, 200),
            content_text: String(item.body || ''),
            category: normCat,
            tool_tags: toolTags,
            status: status,
            source: 'onedrive',
            tool_source: 'onedrive-import',
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

          // Versioning — Financial Documents pair check (after insert)
          if (insertedRow && normCat === 'Financial Documents') {
            var pairMatchId = await findVersionMatch(supabase, userId, item.title, item.body, 'Financial Documents');
            if (pairMatchId) {
              var pairId = randomUUID();
              await supabase.from('content_library').update({ status: 'pending', version_pair_id: pairId }).eq('id', pairMatchId);
              await supabase.from('content_library').update({ version_pair_id: pairId }).eq('id', insertedRow.id);
              fin_docs_paired++;
            }
          }

          // Versioning — apply auto-archive on match
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
        console.log('[OneDrive] Batch complete — morePending. Processed so far:', batchProcessedIds.length, 'of', files.length);
        return res.status(200).json({ success: true, imported: imported, approved: approved, pending: pending, rejected: rejected, skipped: skipped, auto_archived: auto_archived, fin_docs_paired: fin_docs_paired, deduped: 0, total: batch.length, morePending: true });
      }

      // All files processed — clean up cursor
      if (jobId) {
        await supabase.from('cl_scan_cursors').delete().eq('job_id', jobId);
      }

      // Stamp last_scanned_at on the account entry
      if (imported > 0) {
        accounts[entryIdx].last_scanned_at = new Date().toISOString();
        await supabase.from('profiles').update({ cl_onedrive_accounts: accounts }).eq('id', userId);
      }

      return res.status(200).json({ success: true, imported: imported, approved: approved, pending: pending, rejected: rejected, skipped: skipped, total: batch.length, deduped: deduped, skipped_reasons: skipped_reasons, auto_archived: auto_archived, fin_docs_paired: fin_docs_paired, morePending: false });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (err) {
    console.error('onedrive-import error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: (err && err.message) || 'unknown' });
  }
}
