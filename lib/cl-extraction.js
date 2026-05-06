// lib/cl-extraction.js — shared Anthropic wrappers for ingestion endpoints
//
// Every ingestion endpoint that runs Claude over a piece of source content
// used to carry its own copy of the same fetch + parse + log + error
// handling boilerplate. This module owns that boilerplate so each endpoint
// only keeps the bits that actually vary — system prompt, userContent
// formatting, content cap, subtype tag, error scope.
//
// Two exports:
//   runExtractionPrompt(opts) — text extraction (haiku by default).
//     Returns the parsed JSON array, or [] on any failure (logged).
//   runImageExtraction(opts)  — vision extraction (sonnet by default).
//     Returns the parsed JSON array, or [] on any failure (logged).
//
// Logging follows the platform format from Section 6 of the spec:
//   [<errorScope>] <Action> — key: value
// errorScope is supplied by the caller so log lines stay attributed to
// the originating endpoint (e.g. 'CL Gmail', 'CL Drive').

import { logAnthropicUsage } from './usage-logger.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TEXT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_IMAGE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4000;

// ----------------------------------------------------------------------
// runExtractionPrompt — text extraction
// ----------------------------------------------------------------------
// opts:
//   apiKey       (required) — Anthropic API key
//   systemPrompt (required) — pre-built system prompt for this source type
//   userContent  (required) — the user message string the caller has
//                             already formatted (incl. any 'SOURCE CONTENT
//                             (...): ' header and length cap)
//   model        (optional) — default DEFAULT_TEXT_MODEL
//   maxTokens    (optional) — default DEFAULT_MAX_TOKENS
//   userId       (optional) — for usage logging
//   toolId       (optional) — default 'content-library'
//   subtype      (optional) — usage-log subtype, e.g. 'gmail-extraction'
//   errorScope   (optional) — log scope, default 'cl-extraction'

export async function runExtractionPrompt(opts) {
  opts = opts || {};
  const errorScope = opts.errorScope || 'cl-extraction';

  if (!opts.apiKey || !opts.systemPrompt || typeof opts.userContent !== 'string') {
    console.error('[' + errorScope + '] runExtractionPrompt failed — error: missing required field');
    return [];
  }

  const model = opts.model || DEFAULT_TEXT_MODEL;
  const maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;

  let data;
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': opts.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: opts.userContent }],
      }),
    });
    data = await response.json();
  } catch (e) {
    console.error('[' + errorScope + '] Claude API fetch failed in extraction prompt — error:', e && e.message ? e.message : String(e));
    return [];
  }

  logAnthropicUsage({
    tool_id: opts.toolId || 'content-library',
    user_id: opts.userId || null,
    model: model,
    usage: data && data.usage,
    subtype: opts.subtype || null,
  });

  if (data && data.error) {
    console.error('[' + errorScope + '] Claude API error in extraction prompt:', JSON.stringify(data.error));
    return [];
  }

  const raw = data && data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    const clean = String(raw).replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[' + errorScope + '] Extraction prompt JSON parse error — error:', e.message, 'raw:', String(raw).substring(0, 500));
    return [];
  }
}

// ----------------------------------------------------------------------
// runImageExtraction — vision extraction
// ----------------------------------------------------------------------
// opts:
//   apiKey       (required) — Anthropic API key
//   systemPrompt (required) — system prompt for this source type
//   base64Data   (required) — image bytes as base64 (no data: prefix)
//   imagePrompt  (required) — user-message text accompanying the image
//                             (typically IMAGE_PROMPT from cl-prompts)
//   mediaType    (optional) — default 'image/jpeg'
//   model        (optional) — default DEFAULT_IMAGE_MODEL
//   maxTokens    (optional) — default DEFAULT_MAX_TOKENS
//   userId       (optional) — for usage logging
//   toolId       (optional) — default 'content-library'
//   subtype      (optional) — usage-log subtype, e.g. 'gmail-image'
//   errorScope   (optional) — log scope, default 'cl-extraction'

export async function runImageExtraction(opts) {
  opts = opts || {};
  const errorScope = opts.errorScope || 'cl-extraction';

  if (!opts.apiKey || !opts.systemPrompt || !opts.base64Data || !opts.imagePrompt) {
    console.error('[' + errorScope + '] runImageExtraction failed — error: missing required field');
    return [];
  }

  const model = opts.model || DEFAULT_IMAGE_MODEL;
  const maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;
  const mediaType = opts.mediaType || 'image/jpeg';

  let data;
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': opts.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: opts.base64Data } },
          { type: 'text', text: opts.imagePrompt },
        ]}],
      }),
    });
    data = await response.json();
  } catch (e) {
    console.error('[' + errorScope + '] Claude API fetch failed in image extraction — error:', e && e.message ? e.message : String(e));
    return [];
  }

  logAnthropicUsage({
    tool_id: opts.toolId || 'content-library',
    user_id: opts.userId || null,
    model: model,
    usage: data && data.usage,
    subtype: opts.subtype || null,
  });

  if (data && data.error) {
    console.error('[' + errorScope + '] Claude API error in image extraction:', JSON.stringify(data.error));
    return [];
  }

  const raw = data && data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    const clean = String(raw).replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[' + errorScope + '] Image extraction JSON parse error — error:', e.message, 'raw:', String(raw).substring(0, 500));
    return [];
  }
}
