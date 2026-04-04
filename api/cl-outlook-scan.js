import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

// djb2 hash for source_ref dedup
function djb2(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h = h >>> 0; }
  return h.toString(36);
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

// Run unified CL extraction prompt against email content
async function runExtractionPrompt(emailBody, subject, businessName, industry, categoryList, toolIdList) {
  const systemPrompt = 'You are a content extraction assistant for a business content library. Extract discrete pieces of business information from the provided source material. Group content by logical sections — headings, themes, or structural divisions such as quadrants or chapters. Do not split individual bullet points into separate items. Return only a valid JSON array. Each element must have: title (string, max 10 words, must include the document title as context), body (string, clean plain text — summarise prose content in your own words, or preserve bullet points intact if no prose is present — never add context, explanations or detail not present in the source), category (string, MANDATORY — must exactly match one value from the category list, every item must have a category), tool_tags (array of tool IDs from the tool ID list). No preamble, no explanation, no markdown fences. Empty array if nothing relevant found.';

  const userContent = 'Business: ' + businessName + ' (' + industry + ').\nActive categories: ' + categoryList + '\nActive tool IDs: ' + toolIdList + '\n\nSOURCE CONTENT (Email: ' + subject + '):\n' + emailBody.substring(0, 6000) + '\n\nExtract all logical sections as separate items. Include the email subject in every item title for context. Preserve bullet points intact where no prose exists. Summarise only what is explicitly present — do not infer or fabricate. JSON array only.';

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
      .select('outlook_access_token, outlook_refresh_token, industry, business_name, cl_active_categories, cl_custom_categories, cl_outlook_last_scanned_at')
      .eq('id', userId)
      .single();

    if (!profile?.outlook_access_token) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    let accessToken = profile.outlook_access_token;
    try {
      accessToken = await refreshOutlookToken(profile.outlook_refresh_token);
      await supabase.from('profiles').update({ outlook_access_token: accessToken }).eq('id', userId);
    } catch (e) {}

    const businessName = profile.business_name || 'this business';
    const industry = profile.industry || 'general';
    const defaultCats = ['Services', 'Products & Equipment', 'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Company News', 'Team & Culture', 'Community & Events'];
    const activeFromProfile = Array.isArray(profile.cl_active_categories) ? profile.cl_active_categories : defaultCats;
    const customFromProfile = Array.isArray(profile.cl_custom_categories) ? profile.cl_custom_categories : [];
    const categoryList = activeFromProfile.concat(customFromProfile).join(', ');
    const toolIdList = 'chatbot, social, email, strategic-plan, news-digest, bi, tender, quote-enhancer, swms, customer-updates, handover-docs, review-booster, design-viz';

    const days = parseInt(daysBack) || 30;
    let afterDate;
    if (profile.cl_outlook_last_scanned_at) {
      afterDate = new Date(profile.cl_outlook_last_scanned_at).toISOString();
    } else {
      afterDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }

    // Fetch messages from Outlook inbox received after the cutoff date
    const filter = encodeURIComponent("receivedDateTime ge " + afterDate);
    const listRes = await fetch(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=' + filter + '&$top=50&$select=id,subject,from,receivedDateTime,body&$orderby=receivedDateTime desc',
      { headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' } }
    );
    const listData = await listRes.json();
    const messages = listData.value || [];

    let imported = 0;
    let skipped = 0;

    for (const msg of messages) {
      const subject = msg.subject || '(no subject)';
      const sender = (msg.from && msg.from.emailAddress) ? (msg.from.emailAddress.name ? msg.from.emailAddress.name + ' <' + msg.from.emailAddress.address + '>' : msg.from.emailAddress.address) : '';
      const emailBody = extractOutlookBody(msg);

      if (!emailBody || emailBody.trim().length < 50) { skipped++; continue; }

      const items = await runExtractionPrompt(emailBody, subject, businessName, industry, categoryList, toolIdList);
      if (!items || items.length === 0) { skipped++; continue; }

      for (const item of items) {
        const sourceRef = 'outlook-email:' + msg.id + ':' + djb2(String(item.title));
        // Normalise category — case-insensitive match against canonical list
        const catLookup = {};
        activeFromProfile.concat(customFromProfile).forEach(function(c) { catLookup[c.toLowerCase()] = c; });
        const normCat = item.category ? (catLookup[String(item.category).toLowerCase()] || activeFromProfile[0] || 'general') : (activeFromProfile[0] || 'general');
        const row = {
          user_id: userId,
          title: String(item.title || subject).substring(0, 200),
          content_text: String(item.body || ''),
          category: normCat,
          tool_tags: Array.isArray(item.tool_tags) ? item.tool_tags : [],
          status: 'pending',
          source: 'email',
          tool_source: 'cl-outlook-scan',
          source_ref: sourceRef,
          source_item_id: msg.id,
          source_detail: { sender: sender, subject: subject },
        };
        const { error } = await supabase.from('content_library').upsert(row, { onConflict: 'source_ref' });
        if (!error) imported++;
      }
    }

    await supabase.from('profiles').update({ cl_outlook_last_scanned_at: new Date().toISOString() }).eq('id', userId);

    return res.status(200).json({ success: true, imported, skipped, total: messages.length });

  } catch (err) {
    console.error('cl-outlook-scan error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
