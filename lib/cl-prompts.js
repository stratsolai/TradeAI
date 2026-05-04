// lib/cl-prompts.js — Single source of truth for Content Library extraction
// prompts and the constants that drive classification + tool tagging across
// every CL ingestion endpoint.
//
// Section 2 of 5 of the CL prompt rewrite project. Section 3 will switch the
// nine ingestion files (cl-email-scan, cl-outlook-scan, drive-import,
// onedrive-import, dropbox-import, sharepoint-import, process-file,
// scrape-website, email) over to importing from here instead of carrying
// their own duplicated copies.
//
// Server-side ESM only. Reads tools-data.js as source text at module load
// to derive the canonical set of core tool IDs — adding a new core tool to
// tools-data.js automatically allows the AI to tag it via this module, no
// duplicate maintenance.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ────────────────────────────────────────────────────────────────────────────
// Tool ID derivation
// ────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DATA_PATH = path.join(__dirname, '..', 'tools-data.js');

function deriveCoreToolIds() {
  const src = fs.readFileSync(TOOLS_DATA_PATH, 'utf8');
  // Pull out the TOOLS array body. Top-level `const TOOLS = [ ... ];` — the
  // closing `];` lives at start of its own line so the lazy `[\s\S]*?` is
  // bounded reliably without false matches inside string literals.
  const arrayMatch = src.match(/const TOOLS = \[([\s\S]*?)^\];/m);
  if (!arrayMatch) {
    throw new Error('lib/cl-prompts.js: could not parse the TOOLS array out of tools-data.js — file shape may have changed.');
  }
  // Each tool entry is a flat `{ ... }` object with no nested braces, so
  // [^{}]* matches one entry safely. type: "core" filters out the 38 industry
  // entries — the prompt only describes core tools and the AI shouldn't be
  // tagging industry IDs anyway.
  const entryRegex = /\{[^{}]*\}/g;
  const entries = arrayMatch[1].match(entryRegex) || [];
  const ids = entries
    .filter((e) => /type:\s*"core"/.test(e))
    .map((e) => {
      const m = e.match(/id:\s*"([\w-]+)"/);
      return m ? m[1] : null;
    })
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error('lib/cl-prompts.js: tools-data.js parsed but yielded zero core tool IDs.');
  }
  return ids;
}

export const ALLOWED_TOOL_IDS = deriveCoreToolIds();

// ────────────────────────────────────────────────────────────────────────────
// Categories and discard / archive / versioning rules
// ────────────────────────────────────────────────────────────────────────────

export const ALL_CATEGORIES = [
  // Keep
  'Products & Services', 'Pricing', 'Company Information', 'Jobs, Portfolio & Photos',
  'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Industry News',
  'Tender & Proposal Documents', 'Financial Documents', 'Compliance & Certificates',
  'Safety & SWMS', 'Supplier Communications',
  // Discard
  'Legal', 'IT', 'Spam', 'Customer Enquiries', 'Complaints'
];

export const DISCARD_CATEGORIES = ['Legal', 'IT', 'Spam', 'Customer Enquiries', 'Complaints'];

export const AUTO_ARCHIVE_CATEGORIES = [
  'Products & Services', 'Pricing', 'Company Information', 'Promotions & Offers',
  'Supplier Communications', 'Compliance & Certificates', 'Safety & SWMS'
];

export const VERSION_MATCH_RULES = {
  'Products & Services': 'Match on similarity of title and subject matter.',
  'Pricing': 'Match on similarity of title and subject matter.',
  'Company Information': 'Match on subject — person name for bios, policy or subject for announcements. New person or new announcement is additive.',
  'Promotions & Offers': 'Match on promotion name or subject — new promotion is additive.',
  'Supplier Communications': 'Match on supplier name and subject — new communication is additive.',
  'Compliance & Certificates': 'Match on title and subject — same licence or certificate type supersedes previous. Different licence types are additive.',
  'Safety & SWMS': 'Match on title and subject — same work activity supersedes previous. Different activities are additive.',
  'Financial Documents': 'Periodic documents (Profit & Loss Statement, Balance Sheet, Cash Flow Statement, Tax Return, BAS/GST Return, Payroll Summary) — match on document type and period. Transactional documents (Invoice, Receipt, Purchase Order, Bank Statement, Supplier Statement) — always additive, never supersede.'
};

export const CATEGORY_LOOKUP = ALL_CATEGORIES.reduce((m, c) => {
  m[c.toLowerCase()] = c;
  return m;
}, {});

// ────────────────────────────────────────────────────────────────────────────
// Category-to-Tool Matrix — safety net applied AFTER the AI returns
// tool_tags. For each category the matrix lists the tools that should
// ALWAYS be tagged (so genuinely useful content can't slip through if the
// AI is conservative) and the tools that should NEVER be tagged (so
// security-sensitive content like Financial Documents can't leak to tools
// that have no business with it).
//
// Only the 13 Keep categories are listed. The 5 Discard categories
// (Legal, IT, Spam, Customer Enquiries, Complaints) have no matrix entry
// because items in those categories are auto-rejected and never get
// surfaced to any tool — applyCategoryToolMatrix passes them through
// unchanged.
//
// Financial Documents is currently the only category with a Never list,
// enforcing RULE 9 of the extraction prompt at runtime as well as in the
// AI's instructions.
// ────────────────────────────────────────────────────────────────────────────

export const CATEGORY_TOOL_MATRIX = {
  'Products & Services': {
    always: ['chatbot', 'social', 'tender', 'quote-enhancer', 'strategic-plan', 'bi'],
    never: []
  },
  'Pricing': {
    always: ['chatbot', 'tender', 'quote-enhancer', 'strategic-plan', 'bi'],
    never: []
  },
  'Company Information': {
    always: ['chatbot', 'social', 'tender', 'quote-enhancer', 'strategic-plan', 'bi', 'staff-onboarding'],
    never: []
  },
  'Jobs, Portfolio & Photos': {
    always: ['social', 'tender', 'quote-enhancer', 'design-viz', 'bi', 'customer-updates', 'handover-docs', 'job-debrief'],
    never: []
  },
  'Promotions & Offers': {
    always: ['social', 'chatbot', 'bi'],
    never: []
  },
  'Customer Testimonials': {
    always: ['social', 'chatbot', 'tender', 'quote-enhancer', 'review-booster', 'bi'],
    never: []
  },
  'Tips & How-To': {
    always: ['chatbot', 'social', 'news-digest', 'quote-enhancer', 'customer-updates'],
    never: []
  },
  'Industry News': {
    always: ['news-digest', 'strategic-plan', 'social', 'bi', 'quote-enhancer', 'customer-updates'],
    never: []
  },
  'Tender & Proposal Documents': {
    always: ['tender', 'strategic-plan', 'bi', 'job-debrief'],
    never: []
  },
  'Financial Documents': {
    always: ['bi', 'strategic-plan'],
    never: [
      'chatbot', 'social', 'email', 'news-digest', 'design-viz', 'tender',
      'quote-enhancer', 'swms', 'customer-updates', 'handover-docs',
      'review-booster', 'staff-onboarding', 'job-debrief',
      'subcontractor-mgmt', 'contract-manager', 'compliance-calendar'
    ]
  },
  'Compliance & Certificates': {
    always: ['tender', 'quote-enhancer', 'swms', 'handover-docs', 'compliance-calendar', 'bi', 'strategic-plan', 'staff-onboarding'],
    never: []
  },
  'Safety & SWMS': {
    always: ['swms', 'tender', 'handover-docs', 'bi', 'staff-onboarding'],
    never: []
  },
  'Supplier Communications': {
    always: ['bi', 'strategic-plan', 'subcontractor-mgmt'],
    never: []
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Tool Output Matrix — when a tool writes its OWN content into Content
// Library (Pattern B writes, source: 'tool'), it should be tagged for the
// downstream tools that need to consume that content. Different from the
// Category-to-Tool Matrix, which applies to ingested external content.
//
// For each source tool, the array lists the OTHER tools that should
// receive the output. applyToolOutputMatrix() additionally tags the
// source tool itself, so a tool can always find its own previous outputs.
// ────────────────────────────────────────────────────────────────────────────

export const TOOL_OUTPUT_MATRIX = {
  'chatbot':             ['bi', 'strategic-plan', 'review-booster'],
  'social':              ['bi', 'strategic-plan'],
  'email':               ['bi', 'strategic-plan', 'news-digest', 'chatbot', 'subcontractor-mgmt'],
  'strategic-plan':      ['bi', 'tender', 'quote-enhancer'],
  'news-digest':         ['bi', 'strategic-plan', 'social', 'chatbot'],
  'bi':                  ['strategic-plan'],
  'design-viz':          ['social', 'tender', 'quote-enhancer', 'customer-updates', 'handover-docs'],
  'tender':              ['bi', 'strategic-plan', 'job-debrief'],
  'quote-enhancer':      ['bi', 'strategic-plan', 'customer-updates', 'handover-docs', 'job-debrief'],
  'swms':                ['bi', 'tender', 'handover-docs', 'staff-onboarding'],
  'customer-updates':    ['bi', 'handover-docs', 'job-debrief', 'review-booster'],
  'handover-docs':       ['bi', 'job-debrief', 'review-booster'],
  'review-booster':      ['bi', 'social', 'chatbot'],
  'staff-onboarding':    ['bi', 'strategic-plan'],
  'job-debrief':         ['bi', 'strategic-plan', 'tender'],
  'subcontractor-mgmt':  ['bi', 'strategic-plan', 'tender', 'quote-enhancer'],
  'contract-manager':    ['bi', 'strategic-plan', 'tender', 'quote-enhancer', 'customer-updates', 'handover-docs', 'job-debrief'],
  'compliance-calendar': ['bi', 'strategic-plan', 'swms', 'tender', 'handover-docs', 'staff-onboarding']
};

/**
 * Return the tool_tags array a Pattern B writer should use when saving
 * its output to Content Library. Always includes the source tool itself
 * so the writer can find its own prior outputs. Result is deduped and
 * filtered to ALLOWED_TOOL_IDS so unknown IDs in the matrix can't leak
 * through.
 *
 * @param {string} sourceToolId — the tool generating the output
 * @returns {string[]} tool_tags array
 */
export function applyToolOutputMatrix(sourceToolId) {
  const result = new Set();
  if (sourceToolId) result.add(sourceToolId);
  const recipients = TOOL_OUTPUT_MATRIX[sourceToolId];
  if (Array.isArray(recipients)) {
    for (const id of recipients) result.add(id);
  }
  return Array.from(result).filter((id) => ALLOWED_TOOL_IDS.includes(id));
}

/**
 * Apply the Category-to-Tool Matrix to an AI-tagged tool_tags array.
 * Returns a corrected array with Always-Tag tools added and Never-Tag
 * tools removed for the supplied category, deduped, and filtered to
 * known tool IDs. Pass-through for unknown categories (including the
 * 5 Discard categories).
 *
 * @param {string} category — the normalised category name
 * @param {string[]} toolTags — what the AI returned (already filtered)
 * @returns {string[]} corrected tool_tags array
 */
export function applyCategoryToolMatrix(category, toolTags) {
  const rule = CATEGORY_TOOL_MATRIX[category];
  const input = Array.isArray(toolTags) ? toolTags : [];
  if (!rule) return input.slice();
  const result = new Set(input);
  if (Array.isArray(rule.always)) {
    for (const id of rule.always) result.add(id);
  }
  if (Array.isArray(rule.never)) {
    for (const id of rule.never) result.delete(id);
  }
  // Final filter against ALLOWED_TOOL_IDS so any drift between the matrix
  // and tools-data.js can't leak orphan IDs into content_library.
  return Array.from(result).filter((id) => ALLOWED_TOOL_IDS.includes(id));
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt building blocks
// ────────────────────────────────────────────────────────────────────────────

// Per-tool tagging guidance for the AI. Keys MUST match tool IDs in
// tools-data.js; emitted in the order the IDs appear there. If a core tool
// is added to tools-data.js without a description here, it is silently
// omitted from the prompt — not a fatal error, but `validateModule()` at the
// bottom of this file warns.
const TOOL_TAGGING_DESCRIPTIONS = {
  'strategic-plan': 'Tag content that describes the business, its services, pricing, team, market position, competitors, finances, goals, or strategic direction. Also tag industry context, regulatory changes, and market trends that could inform planning. Financial Documents should be tagged for Strategic Plan.',
  'news-digest': 'Tag content from external sources — industry news, regulatory updates, supplier announcements, market trends, trade publications, and compliance changes. Do not tag internally-created business content.',
  'chatbot': 'Tag content that helps answer customer questions — services offered, pricing, processes, team bios, FAQs, policies, service areas, and how the business works. Never tag Financial Documents.',
  'social': 'Tag content that could inspire or be used in marketing — completed jobs, project photos, customer feedback, promotions, tips, industry news worth commenting on, team updates, and business milestones. Never tag Financial Documents.',
  'bi': 'Tag broadly. BI analyses patterns across all business activity — financials, supplier communications, job data, customer feedback, compliance status, pricing, and market context. When in doubt, tag for BI.',
  'tender': 'Tag content useful for winning work — past projects, capabilities, team qualifications, certifications, compliance documents, safety records, pricing structures, and company credentials. Never tag Financial Documents.',
  'quote-enhancer': 'Tag content that strengthens quotes — company information, past work examples, testimonials, licences, certifications, warranties, and safety documentation. Never tag Financial Documents.',
  'design-viz': 'Tag content with photos, site images, project visuals, or design references. Never tag Financial Documents.',
  'email': 'Never tag Financial Documents.',
  'swms': 'Tag content related to safety documentation, compliance certificates, and work method statements. Never tag Financial Documents.',
  'customer-updates': 'Tag content related to job progress, project photos, and milestones. Never tag Financial Documents.',
  'handover-docs': 'Tag content useful for project handover — job photos, compliance certificates, safety docs, warranties, and maintenance information. Never tag Financial Documents.',
  'review-booster': 'Tag content related to customer testimonials and completed jobs. Never tag Financial Documents.',
  'staff-onboarding': 'Tag content related to company information, compliance certificates, safety documentation, and team/culture information. Never tag Financial Documents.',
  'job-debrief': 'Tag content related to completed jobs, project outcomes, and tender/proposal documents. Never tag Financial Documents.',
  'subcontractor-mgmt': 'Tag content related to supplier communications and subcontractor information. Never tag Financial Documents.',
  'contract-manager': 'Tag content related to quotes, contracts, job scope, project specifications, and customer communications about work requirements. Never tag Financial Documents.',
  'compliance-calendar': 'Tag content related to compliance certificates and regulatory deadlines. Never tag Financial Documents.'
};

function buildToolsBlock() {
  const lines = ['TOOLS:\n'];
  for (const id of ALLOWED_TOOL_IDS) {
    const desc = TOOL_TAGGING_DESCRIPTIONS[id];
    if (!desc) continue;
    lines.push(`- ${id}: ${desc}\n`);
  }
  return lines.join('');
}

const CATEGORIES_BLOCK =
  'CATEGORIES:\n\n' +
  'Keep:\n' +
  '- Products & Services: Descriptions of what the business offers, sells, or delivers. Includes service descriptions, product information, and equipment or materials the business supplies to customers. Does not include pricing, promotions, or the business\'s own owned assets.\n' +
  '- Pricing: What the business charges for its products and services. Includes rate cards, price lists, package pricing, and hourly or project rates. Does not include promotional or limited-time offers.\n' +
  '- Company Information: Information that describes what the business is. Includes About Us content, business history, ownership, locations, team bios, staff profiles, culture, values, and business-owned assets such as equipment and vehicles. Does not include what the business offers or charges.\n' +
  '- Jobs, Portfolio & Photos: Records of work the business has completed or is currently delivering. Includes job photos, project descriptions, before-and-after content, and case studies. Does not include general promotional content or testimonials.\n' +
  '- Promotions & Offers: Time-limited or special pricing and deals created and offered by this business to its own customers. Includes seasonal promotions, discount offers, referral incentives, and limited-time packages the business is running. Does not include promotions or offers received from suppliers or third parties.\n' +
  '- Customer Testimonials: Feedback and reviews provided by customers about their experience with the business. Includes written reviews, star ratings with comments, and case study quotes. Does not include general marketing copy written by the business itself.\n' +
  '- Tips & How-To: Useful information the business shares to educate or help its customers. Includes how-to guides, maintenance tips, advice articles, and explainer content. Does not include promotional content or service descriptions.\n' +
  '- Industry News: News, trends, and developments relevant to the business\'s industry or market. Includes trade publications, supplier announcements, regulatory changes, and market updates. Does not include content created by the business itself.\n' +
  '- Tender & Proposal Documents: Formal documents prepared by the business to win work. Includes tender submissions, project proposals, scope of works, and quotes prepared for specific jobs. Does not include standard pricing or general service descriptions.\n' +
  '- Financial Documents: Internal financial records and reporting. Includes invoices, statements, tax documents, profit and loss reports, and bank records. Does not include pricing guides or supplier quotes.\n' +
  '- Compliance & Certificates: Licences, registrations, and certifications held by the business or its staff. Includes trade licences, insurance certificates, accreditations, and regulatory compliance documents. Does not include safety plans or method statements.\n' +
  '- Safety & SWMS: Safety documentation for work activities. Includes Safe Work Method Statements, risk assessments, safety plans, and site-specific safety requirements. Does not include compliance certificates or licences.\n' +
  '- Supplier Communications: Correspondence and documents received from suppliers and vendors. Includes supplier price lists, product catalogues, delivery notifications, and trade account correspondence. Does not include supplier statements or invoices (Financial Documents). Does not include industry news or market updates.\n\n' +
  'Discard:\n' +
  '- Legal: Legal correspondence, contracts, agreements, and notices.\n' +
  '- IT: Technology and systems correspondence. Includes software licences, hosting invoices, IT support tickets.\n' +
  '- Spam: Unsolicited or irrelevant content with no business value.\n' +
  '- Customer Enquiries: Inbound messages from prospective or existing customers asking about services, availability, or pricing.\n' +
  '- Complaints: Negative feedback or dispute correspondence from customers.';

const COMMON_FIELDS_BLOCK =
  'Return a JSON array containing exactly ONE object (or zero objects if no meaningful content can be extracted) with these fields:\n' +
  '- "title": string, max 10 words, descriptive of the whole document\n' +
  '- "body": string, concise plain text summary of the whole document in your own words — capture the key facts, main points, and important details. Do NOT reproduce the source content verbatim. Do NOT include long passages of original text. Do NOT include bullet point lists copied from the source. Summarise the document as a whole.\n' +
  '- "category": string, must exactly match one category name from the CATEGORIES section — copy the name exactly including punctuation, capitalisation, and the trailing \'s\' on plural names\n' +
  '- "disposition": string, "keep" or "discard" — must match the disposition listed for the assigned category\n' +
  '- "confidence": string, "confident" or "uncertain" — confident when the category is clear, uncertain when the content could fit multiple categories\n' +
  '- "tool_tags": array of tool ID strings from the TOOLS section — see RULE 5 for tagging guidance';

const MULTI_BLOCK_FIELDS_BLOCK =
  'Return a JSON array with one object per distinct content block found (or an empty array if no meaningful content is present), each object containing these fields:\n' +
  '- "title": string, max 10 words, descriptive of the block\n' +
  '- "body": string, concise plain text summary of the block in your own words — capture the key facts, main points, and important details. Do NOT reproduce the source content verbatim. Do NOT include long passages of original text. Do NOT include bullet point lists copied from the source. Summarise the block.\n' +
  '- "category": string, must exactly match one category name from the CATEGORIES section — copy the name exactly including punctuation, capitalisation, and the trailing \'s\' on plural names\n' +
  '- "disposition": string, "keep" or "discard" — must match the disposition listed for the assigned category\n' +
  '- "confidence": string, "confident" or "uncertain" — confident when the category is clear, uncertain when the content could fit multiple categories\n' +
  '- "tool_tags": array of tool ID strings from the TOOLS section — see RULE 5 for tagging guidance';

// Common rules shared by single-item and multi-block prompts. RULE 1, 2 and
// 8 vary across variants and are added by the builders. RULE 5 is the
// rewritten tagging rule. RULE 9 is the new financial-security rule.
const RULES_3_TO_7 =
  '3. Category must exactly match one name from the categories list — copy it character-for-character.\n' +
  '4. Disposition must match the category\'s listed disposition.\n' +
  '5. Tag all tools whose description is relevant to the content. A single item can be tagged for multiple tools. When uncertain, err toward tagging — it is better for a tool to have access to potentially useful content than to miss it.\n' +
  '6. Return a valid JSON array only. No preamble, no explanation, no markdown fences.\n' +
  '7. If no meaningful content can be extracted, return an empty array [].';

const RULE_9_FINANCIAL_SECURITY =
  '9. Financial Documents must only be tagged for bi and strategic-plan. Never tag Financial Documents for any other tool. This is a data security requirement with no exceptions.';

const RULE_8_PROMOTIONS_BASE =
  '8. Promotions & Offers is ONLY for promotions the user\'s own business is offering to its own customers. If the source is an inbound message, supplier email, vendor newsletter, or third-party promotional content advertising someone else\'s offer, do NOT classify it as Promotions & Offers. Inbound supplier promotional content belongs in Supplier Communications. Broader market or trade promotional news belongs in Industry News. Never put a received supplier or third-party promotion in Promotions & Offers, even when it uses promotional language like \'sale\', \'discount\', or \'limited time\'.';

const RULE_8_EMAIL_ADDENDUM =
  ' The email From header is included in the source content for this reason — use it to tell self-sent campaigns from received messages.';

// ────────────────────────────────────────────────────────────────────────────
// Public prompt builders
// ────────────────────────────────────────────────────────────────────────────

/**
 * Single-item extraction prompt — used by the email scanners, file imports,
 * direct uploads, and the Email Assistant CL writeback path. The `source`
 * option only affects RULE 8: 'email' appends the From-header sentence so
 * the AI can tell self-sent campaigns from received supplier promos.
 *
 * @param {Object} [opts]
 * @param {'email'|'file'} [opts.source='file']
 * @returns {string}
 */
export function buildSingleItemPrompt(opts = {}) {
  const isEmail = opts.source === 'email';
  const opening =
    'You are a content extraction assistant for a business content library. Treat the source material as a single item — produce exactly one summary representing the whole document, never multiple summaries by section.';
  const rule1 =
    '1. Treat the entire source as ONE item. Return a JSON array with exactly one element representing the whole source. Do NOT split the source into multiple items by section, heading, theme, or paragraph.';
  const rule2 =
    '2. Body must be a concise summary in your own words — capture the document\'s purpose and key facts without reproducing the source content. Never copy long passages or bullet lists from the source.';
  const rule8 = RULE_8_PROMOTIONS_BASE + (isEmail ? RULE_8_EMAIL_ADDENDUM : '');

  return [
    opening,
    COMMON_FIELDS_BLOCK,
    CATEGORIES_BLOCK,
    buildToolsBlock(),
    'RULES:\n' + rule1 + '\n' + rule2 + '\n' + RULES_3_TO_7 + '\n' + rule8 + '\n' + RULE_9_FINANCIAL_SECURITY
  ].join('\n\n');
}

/**
 * Multi-block extraction prompt — used only by scrape-website. Returns one
 * object per discrete content block on a page rather than one per source.
 * RULE 8 is omitted (no email context); RULE 1 / RULE 2 are reframed for
 * per-block extraction.
 *
 * @returns {string}
 */
export function buildMultiBlockPrompt() {
  const opening =
    'You are a content extraction assistant for a business content library. The source material is a webpage. Identify each distinct meaningful content block on the page and produce one summary per block.';
  const rule1 =
    '1. Identify each distinct meaningful content block on the page and return ONE object per block. A meaningful block is a discrete piece of business-relevant content — for example, a service description, a pricing entry, a testimonial, a team or culture statement, a promotional offer, a news item, or a tip or how-to. Ignore navigation menus, headers, footers, cookie notices, contact forms, and generic page furniture.';
  const rule2 =
    '2. Body must be a concise summary in your own words — capture the block\'s purpose and key facts without reproducing the source content. Never copy long passages or bullet lists from the source.';

  return [
    opening,
    MULTI_BLOCK_FIELDS_BLOCK,
    CATEGORIES_BLOCK,
    buildToolsBlock(),
    'RULES:\n' + rule1 + '\n' + rule2 + '\n' + RULES_3_TO_7 + '\n' + RULE_9_FINANCIAL_SECURITY
  ].join('\n\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Image extraction prompt — used by the file connectors that handle image
// attachments and uploads. Sent to Claude Sonnet vision; the response is the
// same JSON shape as the single-item extraction prompt.
// ────────────────────────────────────────────────────────────────────────────

export const IMAGE_PROMPT =
  'This is an image file. Look at it and decide which type it is, then follow ONLY the matching instructions below.\n\n' +
  'TYPE A — PHOTO (a scene, people, objects, a job site, equipment, finished work, a selfie, a product, or anything that is not primarily text):\n' +
  'Write a plain English visual description of what is shown — what was done, the setting, visible quality or detail. Do not invent detail that cannot be seen. Do not attempt to read or extract text. Use your visual description as the body field. The category will almost always be Jobs, Portfolio & Photos for work photos, or Company Information for team or premises photos.\n\n' +
  'TYPE B — DOCUMENT OR SCREENSHOT (an image whose primary content is readable text — a scanned page, a screenshot of a webpage or app, a photographed invoice, certificate, letter, or form):\n' +
  'Extract all visible text accurately and completely. Use the extracted text as the body field verbatim. This is the one exception to the summary-only rule in the system prompt — for document images the extracted text IS the body because there is no other source to summarise from. Classify the content based on what the text says, not based on it being an image.\n\n' +
  'After following the correct type above, return a JSON array with exactly one object containing title, body, category, disposition, confidence, and tool_tags — the same format as all other file types. Never return an empty array for an image that contains visible content or readable text.';

// ────────────────────────────────────────────────────────────────────────────
// Versioning matcher — used by every ingestion endpoint's findVersionMatch().
// The category-specific rule is appended at call time using
// VERSION_MATCH_RULES[category]; this constant is just the system prompt.
// ────────────────────────────────────────────────────────────────────────────

export const VERSION_MATCH_SYSTEM_PROMPT =
  'You are a versioning matcher for a business content library. Given a new item and existing approved items in the same category, determine if the new item is a replacement of an existing item or is additive (should coexist). Return JSON only.';

// ────────────────────────────────────────────────────────────────────────────
// Module-load sanity check — surfaces tool-id drift between tools-data.js
// and the rewritten descriptions early. Logs a warning rather than throwing
// so a missing description doesn't take ingestion offline; the affected
// tool just won't appear in the TOOLS section of the prompt.
// ────────────────────────────────────────────────────────────────────────────

(function validateModule() {
  const missing = ALLOWED_TOOL_IDS.filter((id) => !TOOL_TAGGING_DESCRIPTIONS[id]);
  if (missing.length > 0) {
    console.warn(
      '[lib/cl-prompts] core tool IDs in tools-data.js without a TOOL_TAGGING_DESCRIPTIONS entry — they will be omitted from the prompt:',
      missing.join(', ')
    );
  }
  const unknown = Object.keys(TOOL_TAGGING_DESCRIPTIONS).filter(
    (id) => !ALLOWED_TOOL_IDS.includes(id)
  );
  if (unknown.length > 0) {
    console.warn(
      '[lib/cl-prompts] TOOL_TAGGING_DESCRIPTIONS entries with no matching core tool in tools-data.js — they will be ignored:',
      unknown.join(', ')
    );
  }
})();
