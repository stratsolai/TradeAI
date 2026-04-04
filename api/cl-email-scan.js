import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// djb2 hash for source_ref dedup
function djb2(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h = h >>> 0; }
  return h.toString(36);
}

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

// Extract plain text body from Gmail message payload
function extractEmailBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractEmailBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

// Run unified CL extraction prompt against email content
async function runExtractionPrompt(emailBody, subject, businessName, industry, categoryList, toolIdList) {
  const systemPrompt = 'You are a content extraction assistant for a business content library. Extract discrete pieces of business information from the provided source material. Group content by logical sections — headings, themes, or structural divisions such as quadrants or chapters. Do not split individual bullet points into separate items. Return only a valid JSON array. Each element must have: title (string, max 10 words, must include the document title as context), body (string, clean plain text — summarise prose content in your own words, or preserve bullet points intact if no prose is present — never add context, explanations or detail not present in the source), category (string, must be from the category list), tool_tags (array of tool IDs from the tool ID list). No preamble, no explanation, no markdown fences. Empty array if nothing relevant found.';

  const userContent = 'Business: ' + businessName + ' (' + industry + ').\nActive categories: ' + categoryList + '\nActive tool IDs: ' + toolIdList + '\n\nSOURCE CONTENT (Email: ' + subject + '):\n' + emailBody.substring(0, 6000) + '\n\nExtract all logical sections as separate items. Include the document title in every item title for context. Preserve bullet points intact where no prose exists. Summarise only what is explicitly present — do not infer or fabricate. JSON array only.';

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
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  const data = await response.json();
  const raw = data.content && data.content[0] ? data.content[0].text : '[]';
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { userId, daysBack } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('gmail_access_token, gmail_refresh_token, industry, business_name, cl_active_categories, cl_custom_categories, cl_email_last_scanned_at')
      .eq('id', userId)
      .single();

    if (!profile?.gmail_access_token) {
      return res.status(400).json({ error: 'Gmail not connected' });
    }

    let accessToken = profile.gmail_access_token;
    try {
      accessToken = await refreshGoogleToken(profile.gmail_refresh_token);
      await supabase.from('profiles').update({ gmail_access_token: accessToken }).eq('id', userId);
    } catch (e) {}

    const businessName = profile.business_name || 'this business';
    const industry = profile.industry || 'general';
    const defaultCats = ['Services', 'Products & Equipment', 'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Company News', 'Team & Culture', 'Community & Events'];
    const activeFromProfile = Array.isArray(profile.cl_active_categories) ? profile.cl_active_categories : defaultCats;
    const customFromProfile = Array.isArray(profile.cl_custom_categories) ? profile.cl_custom_categories : [];
    const categoryList = activeFromProfile.concat(customFromProfile).join(', ');
    const toolIdList = 'chatbot, social, email, strategic-plan, news-digest, bi, tender, quote-enhancer, swms, customer-updates, handover-docs, review-booster, design-viz';

    const days = parseInt(daysBack) || 30;
    let afterTimestamp;
    if (profile.cl_email_last_scanned_at) {
      afterTimestamp = Math.floor(new Date(profile.cl_email_last_scanned_at).getTime() / 1000);
    } else {
      afterTimestamp = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    }
    const query = 'after:' + afterTimestamp;

    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent(query) + '&maxResults=50',
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    const listData = await listRes.json();
    const messages = listData.messages || [];

    let imported = 0;
    let skipped = 0;

    for (const msg of messages) {
      const msgRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msg.id + '?format=full',
        { headers: { Authorization: 'Bearer ' + accessToken } }
      );
      const msgData = await msgRes.json();

      const headers = msgData.payload && msgData.payload.headers ? msgData.payload.headers : [];
      const subject = (headers.find(h => h.name === 'Subject') || {}).value || '(no subject)';
      const emailBody = extractEmailBody(msgData.payload);

      if (!emailBody || emailBody.trim().length < 50) { skipped++; continue; }

      const items = await runExtractionPrompt(emailBody, subject, businessName, industry, categoryList, toolIdList);
      if (!items || items.length === 0) { skipped++; continue; }

      for (const item of items) {
        const sourceRef = 'email:' + msg.id + ':' + djb2(String(item.title));
        const row = {
          user_id: userId,
          title: String(item.title || subject).substring(0, 200),
          body: String(item.body || ''),
          category: item.category || activeFromProfile[0] || 'general',
          tool_tags: Array.isArray(item.tool_tags) ? item.tool_tags : [],
          status: 'pending',
          source: 'email',
          tool_source: 'cl-email-scan',
          source_ref: sourceRef,
          metadata: JSON.stringify({
            messageId: msg.id,
            subject: subject,
            scannedAt: new Date().toISOString(),
          }),
        };
        const { error } = await supabase.from('content_library').upsert(row, { onConflict: 'source_ref' });
        if (!error) imported++;
      }
    }

    await supabase.from('profiles').update({ cl_email_last_scanned_at: new Date().toISOString() }).eq('id', userId);

    return res.status(200).json({ success: true, imported, skipped, total: messages.length });

  } catch (err) {
    console.error('cl-email-scan error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
