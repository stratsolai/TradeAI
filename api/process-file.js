const https = require('https');
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

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

    // 1. LOAD USER PROFILE
    const { data: profile } = await supabase
      .from('profiles')
      .select('industry, business_name, services, products, marketing_theme, suburb, state, cl_active_categories, cl_custom_categories')
      .eq('id', userId)
      .single();

    const defaultCategories = ['service', 'about', 'portfolio', 'testimonial', 'offer', 'team', 'tip', 'faq', 'news', 'compliance'];
    const activeCategories = (profile && profile.cl_active_categories && profile.cl_active_categories.length > 0)
      ? profile.cl_active_categories : defaultCategories;
    const customCategories = (profile && profile.cl_custom_categories) ? profile.cl_custom_categories : [];
    const allCategories = [...new Set([...activeCategories, ...customCategories])];

    const businessContext = profile ? [
      profile.industry ? 'Industry: ' + profile.industry : null,
      profile.business_name ? 'Business: ' + profile.business_name : null,
      profile.services ? 'Services: ' + profile.services : null,
      profile.products ? 'Products: ' + profile.products : null,
      profile.marketing_theme ? 'Marketing theme: ' + profile.marketing_theme : null,
      (profile.suburb || profile.state) ? 'Location: ' + [profile.suburb, profile.state].filter(Boolean).join(', ') : null
    ].filter(Boolean).join('\n') : '';

    // 2. EXTRACT RAW CONTENT FROM SOURCE
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
      sourceText = await describeImage(fileData, businessContext, claudeApiKey);
      sourceValue = 'photo';
    } else if (fileType === 'text' && fileData) {
      sourceText = Buffer.from(fileData, 'base64').toString('utf-8');
      sourceValue = 'document';
    } else if (['word', 'powerpoint', 'excel'].includes(fileType) && fileData) {
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

    // 3. BUILD AI PROMPT
    const systemPrompt = 'You are a content extraction assistant for a business content library. Extract discrete pieces of business information from the provided source material. Group content by logical sections — headings, themes, or structural divisions such as quadrants or chapters. Do not split individual bullet points into separate items. Return only a valid JSON array. Each element must have: title (string, max 10 words, must include the document title as context), body (string, clean plain text — summarise prose content in your own words, or preserve bullet points intact if no prose is present — never add context, explanations or detail not present in the source), category (string, must be from the category list), tool_tags (array of tool IDs from the tool ID list). No preamble, no explanation, no markdown fences. Empty array if nothing relevant found.';

    const categoryList = allCategories.join(', ');
    const toolIdList = 'chatbot, social, email, strategic-plan, news-digest, bi, tender, quote-enhancer, swms, customer-updates, handover-docs, review-booster, design-viz';

    const userPrompt = (businessContext ? 'BUSINESS PROFILE:\n' + businessContext + '\n\n' : '') +
      'Active categories: ' + categoryList + '\n' +
      'Active tool IDs: ' + toolIdList + '\n\n' +
      'SOURCE CONTENT (' + sourceLabel + '):\n' + sourceText.substring(0, 8000) +
      '\n\nExtract all logical sections as separate items. Include the document title in every item title for context. Preserve bullet points intact where no prose exists. Summarise only what is explicitly present — do not infer or fabricate. JSON array only.';

    // 4. CALL CLAUDE HAIKU
    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: systemPrompt,
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
      console.error('JSON parse error:', e.message);
      return res.status(400).json({ error: 'AI returned unparseable response', raw: responseText.substring(0, 200) });
    }

    if (!Array.isArray(items) || items.length < 1) {
      return res.status(400).json({ error: 'AI returned no items', raw: responseText.substring(0, 200) });
    }

    // 6. INSERT EACH ITEM AS PENDING
    let insertedCount = 0;
    const insertedItems = [];

    for (const item of items) {
      if (!item.title || !item.body) continue;

      const row = {
        user_id: userId,
        title: String(item.title).substring(0, 200),
        content_text: String(item.body),
        category: item.category || allCategories[0] || 'general',
        tool_tags: Array.isArray(item.tool_tags) ? item.tool_tags : [],
        status: 'pending',
        source: sourceValue,
        created_at: new Date().toISOString(),
        source_ref: 'manual:' + (function(s){var h=5381;for(var i=0;i<s.length;i++){h=((h<<5)+h)^s.charCodeAt(i);h=h>>>0;}return h.toString(36);})(String(item.title)+String(item.body).substring(0,500))
      };

      const { data, error } = await supabase
        .from('content_library')
        .insert(row)
        .select('id')
        .single();

      if (!error && data) {
        insertedCount++;
        insertedItems.push({ id: data.id, title: row.title, category: row.category });
      } else if (error) {
        console.error('Insert error:', error.message);
      }
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

// IMAGE DESCRIBER
async function describeImage(fileData, businessContext, apiKey) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fileData } },
      { type: 'text', text: 'Describe this business image in detail for a content library. Include: what is shown, any visible text, the apparent business context, and what marketing use it could serve.' + (businessContext ? '\n\nBusiness context:\n' + businessContext : '') }
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
