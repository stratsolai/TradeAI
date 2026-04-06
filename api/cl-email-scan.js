export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

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

var EXTRACTION_SYSTEM_PROMPT = "You are a content extraction assistant for a business content library. Extract discrete content items from the source material provided.\n\n" +
  "For each item, return a JSON object with these fields:\n" +
  "- \"title\": string, max 10 words, must reference the source document for context\n" +
  "- \"body\": string, faithful plain text summary — preserve the source content accurately, keep bullet points intact, never add interpretation or context not present in the source\n" +
  "- \"category\": string, must exactly match one category name from the CATEGORIES section\n" +
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
  "1. Group content by logical sections, headings, or themes. Do not split individual bullet points into separate items.\n" +
  "2. Body must faithfully represent the source content. Never add interpretation, reformatting, or context not present in the source.\n" +
  "3. Category must exactly match one name from the categories list.\n" +
  "4. Disposition must match the category's listed disposition.\n" +
  "5. Only tag tools whose description specifically matches the content.\n" +
  "6. Return a valid JSON array only. No preamble, no explanation, no markdown fences.\n" +
  "7. If no content can be extracted, return an empty array [].";

async function refreshGoogleToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  return data.access_token;
}

// Decode base64url encoded Gmail message body
function decodeBase64Url(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
  } catch (e) {
    return atob(base64);
  }
}

// Strip HTML tags and decode common entities to produce clean text
function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Find a part by MIME type, searching recursively through nested parts
function findPart(payload, mimeType) {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body && payload.body.data) {
    return payload;
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findPart(part, mimeType);
      if (found) return found;
    }
  }
  return null;
}

// Extract text body from Gmail message payload — prefers text/plain, falls back to text/html
function extractEmailBody(payload) {
  if (!payload) return '';
  const plainPart = findPart(payload, 'text/plain');
  if (plainPart) return decodeBase64Url(plainPart.body.data);
  const htmlPart = findPart(payload, 'text/html');
  if (htmlPart) return stripHtml(decodeBase64Url(htmlPart.body.data));
  return '';
}

// Run CL extraction prompt against email content
async function runExtractionPrompt(emailBody, subject) {
  var userContent = 'SOURCE CONTENT (Email: ' + subject + '):\n' + emailBody.substring(0, 6000);

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
    return JSON.parse(clean);
  } catch (e) {
    console.error('Extraction prompt JSON parse error:', e.message, 'raw:', raw.substring(0, 500));
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { userId, daysBack, accountEmail } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (!accountEmail) return res.status(400).json({ error: 'accountEmail required' });

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('cl_connected_emails')
      .eq('id', userId)
      .single();

    const connectedEmails = Array.isArray(profile.cl_connected_emails) ? profile.cl_connected_emails : [];
    const gmailEntry = connectedEmails.find(function(e) { return e && (e.provider === 'gmail' || e.provider === 'google') && e.email === accountEmail; });
    if (!gmailEntry || !gmailEntry.access_token) {
      return res.status(400).json({ error: 'Account not connected' });
    }

    let accessToken = gmailEntry.access_token;
    if (gmailEntry.refresh_token) {
      try {
        accessToken = await refreshGoogleToken(gmailEntry.refresh_token);
        gmailEntry.access_token = accessToken;
        await supabase.from('profiles').update({ cl_connected_emails: connectedEmails }).eq('id', userId);
      } catch (e) {
        console.error('Gmail token refresh failed:', e.message);
        return res.status(401).json({ error: 'Gmail token expired. Please reconnect Gmail in Settings.' });
      }
    }

    const days = parseInt(daysBack) || 90;
    let afterTimestamp;
    if (gmailEntry.last_scanned_at) {
      afterTimestamp = Math.floor(new Date(gmailEntry.last_scanned_at).getTime() / 1000);
    } else {
      afterTimestamp = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    }
    const query = 'after:' + afterTimestamp;

    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent(query) + '&maxResults=50',
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    if (!listRes.ok) {
      const errBody = await listRes.json().catch(() => ({}));
      const errMsg = (errBody.error && errBody.error.message) || ('Gmail API returned ' + listRes.status);
      console.error('Gmail list error:', listRes.status, errMsg);
      return res.status(502).json({ error: 'Gmail API error: ' + errMsg });
    }
    const listData = await listRes.json();
    console.log('Gmail list response — status:', listRes.status, 'body:', JSON.stringify(listData));
    const messages = listData.messages || [];

    let imported = 0;
    let skipped = 0;

    for (const msg of messages) {
      const msgRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msg.id + '?format=full',
        { headers: { Authorization: 'Bearer ' + accessToken } }
      );
      if (!msgRes.ok) {
        console.error('Gmail message fetch failed:', msg.id, msgRes.status);
        skipped++;
        continue;
      }
      const msgData = await msgRes.json();
      console.log('MSG FETCH — id:', msg.id, 'status:', msgRes.status, 'has payload:', !!msgData.payload, 'mimeType:', msgData.payload && msgData.payload.mimeType);

      const headers = msgData.payload && msgData.payload.headers ? msgData.payload.headers : [];
      const subject = (headers.find(h => h.name === 'Subject') || {}).value || '(no subject)';
      const sender = (headers.find(h => h.name === 'From') || {}).value || '';
      const emailBody = extractEmailBody(msgData.payload);
      console.log('BODY EXTRACT — subject:', subject, 'bodyLength:', emailBody.length, 'first100:', emailBody.substring(0, 100));

      if (!emailBody || emailBody.trim().length < 50) { console.log('SKIPPED — body too short:', emailBody.length); skipped++; continue; }

      // Save source to cl-assets and create cl_source_items row
      var sourceItemId = null;
      var msgItemCount = 0;
      try {
        var emailStoragePath = userId + '/email/' + msg.id + '.txt';
        await supabase.storage.from('cl-assets').upload(emailStoragePath, Buffer.from(emailBody, 'utf-8'), { contentType: 'text/plain', upsert: false });
        var siResult = await supabase
          .from('cl_source_items')
          .insert({
            user_id: userId,
            source_type: 'email',
            filename: subject,
            file_url: emailStoragePath,
            source_url: null,
            source_detail: { sender: sender, subject: subject, account_email: accountEmail, gmail_message_id: msg.id },
            item_count: 0,
          })
          .select('id')
          .single();
        if (siResult.data) sourceItemId = siResult.data.id;
      } catch (e) {
        console.error('cl-assets/cl_source_items save error:', e.message);
      }

      const items = await runExtractionPrompt(emailBody, subject);
      console.log('CLAUDE RESPONSE — items:', Array.isArray(items) ? items.length : 'not array', 'raw:', JSON.stringify(items).substring(0, 500));
      if (!items || items.length === 0) { console.log('SKIPPED — no items from Claude'); skipped++; continue; }

      for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        const sourceRef = 'email:' + msg.id + ':' + itemIdx;
        var normCat = item.category ? (CATEGORY_LOOKUP[String(item.category).toLowerCase()] || 'Manual Upload') : 'Manual Upload';
        var isDiscard = DISCARD_CATEGORIES.indexOf(normCat) > -1;
        var status = isDiscard ? 'rejected' : (item.confidence === 'confident' ? 'approved' : 'pending');
        var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags.filter(function(t) { return ALLOWED_TOOL_IDS.indexOf(t) > -1; }) : [];
        var itemSourceDetail = { sender: sender, subject: subject, account_email: accountEmail };
        if (isDiscard) itemSourceDetail.rejection_source = 'auto';
        const row = {
          user_id: userId,
          title: String(item.title || subject).substring(0, 200),
          content_text: String(item.body || ''),
          category: normCat,
          tool_tags: toolTags,
          status: status,
          source: 'email',
          tool_source: 'cl-email-scan',
          source_ref: sourceRef,
          source_item_id: sourceItemId,
          source_detail: itemSourceDetail,
        };
        const { error } = await supabase.from('content_library').upsert(row, { onConflict: 'source_ref', ignoreDuplicates: true });
        if (error) { console.error('SUPABASE INSERT ERROR —', error.message, 'code:', error.code, 'details:', error.details); }
        else { console.log('INSERTED — title:', row.title, 'sourceRef:', sourceRef); }
        if (!error) { imported++; msgItemCount++; }
      }

      // Update cl_source_items item_count
      if (sourceItemId && msgItemCount > 0) {
        await supabase.from('cl_source_items').update({ item_count: msgItemCount }).eq('id', sourceItemId);
      }
    }

    if (imported > 0) {
      gmailEntry.last_scanned_at = new Date().toISOString();
      await supabase.from('profiles').update({ cl_connected_emails: connectedEmails }).eq('id', userId);
    }

    return res.status(200).json({ success: true, imported, skipped, total: messages.length });

  } catch (err) {
    console.error('cl-email-scan error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
