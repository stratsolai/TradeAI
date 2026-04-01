module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, url } = req.body;

  if (!userId || !url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const claudeApiKey = process.env.CLAUDE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!claudeApiKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const https = require('https');

    console.log('Scraping website:', url);

    // Fetch user profile for active categories
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('industry, business_name, cl_active_categories, cl_custom_categories')
      .eq('id', userId)
      .single();
    const defaultCategories = ['Services & Pricing','Projects & Portfolio','Team & Culture','Products & Equipment','Promotions & Offers','Customer Testimonials','Tips & How-To','Industry News','Company Updates','Seasonal Content'];
    const activeFromProfile = profile && profile.cl_active_categories && profile.cl_active_categories.length > 0 ? profile.cl_active_categories : defaultCategories;
    const customFromProfile = profile && profile.cl_custom_categories ? profile.cl_custom_categories : [];
    const activeCategories = activeFromProfile.concat(customFromProfile).join(', ');
    const toolIdList = 'social, chatbot, email, strategic-plan, tender, quote-enhancer, swms, customer-updates, handover-docs, review-booster, design-viz';
    const businessName = (profile && profile.business_name) || 'your business';
    const industry = (profile && profile.industry) || 'your industry';

    // Fetch the website HTML
    const websiteHtml = await new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradeAI/1.0)'
        }
      };

      const protocol = urlObj.protocol === 'https:' ? https : require('http');

      const webReq = protocol.request(options, (webRes) => {
        let data = '';
        webRes.on('data', (chunk) => { data += chunk; });
        webRes.on('end', () => resolve(data));
      });

      webReq.on('error', reject);
      webReq.setTimeout(10000, () => {
        webReq.destroy();
        reject(new Error('Request timeout'));
      });
      webReq.end();
    });

    console.log('Website HTML fetched, analyzing with Claude...');

    // Use Claude to analyze the website
    const analysisPrompt = `You are analysing a business website for ${businessName} (${industry}). Extract discrete pieces of marketing-relevant content.

For each piece of content found, return a JSON object with:
- "title": short descriptive title (max 10 words)
- "body": extracted content as clean plain text, preserving factual detail
- "category": the single most relevant category from this list: ${activeCategories}
- "tool_tags": array of tool IDs that could use this content. Use only IDs from this list: ${toolIdList}
- "source_url": "${url}"

Return ONLY a valid JSON array. No preamble, no explanation, no markdown code fences. Empty array if nothing relevant found.

Website HTML:
${websiteHtml.substring(0, 50000)}`;

    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: analysisPrompt }]
    });

    const claudeResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    if (claudeResponse.error) {
      throw new Error(claudeResponse.error.message || 'Claude API error');
    }

    const aiResponse = claudeResponse.content[0].text;

    // Parse the JSON response
    let extractedData;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error('Failed to parse Claude response:', e);
      extractedData = {
        services: [],
        projects: [],
        testimonials: [],
        company: {},
        images: []
      };
    }

    console.log('Extracted data:', extractedData);

    // Save source document record
    await new Promise((resolve, reject) => {
      const dbUrl = new URL(`${supabaseUrl}/rest/v1/source_documents`);

      const docData = JSON.stringify({
        user_id: userId,
        doc_type: 'website',
        url: url,
        status: 'complete'
      });

      const options = {
        hostname: dbUrl.hostname,
        path: dbUrl.pathname,
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        }
      };

      const supabaseReq = https.request(options, (supabaseRes) => {
        let sdBody = '';
      supabaseRes.on('data', (chunk) => { sdBody += chunk; });
        supabaseRes.on('end', () => { if (supabaseRes.statusCode === 201) { resolve(); } else { console.error('source_documents insert failed:', supabaseRes.statusCode, sdBody); resolve(); } });
      });

      supabaseReq.on('error', reject);
      supabaseReq.write(docData);
      supabaseReq.end();
    });

    // Insert extracted content
    let itemsCount = 0;

    // Insert services
    for (const service of extractedData.services || []) {
      if (await insertContent(userId, 'text', 'website', {
        title: service.name,
        description: service.description,
        content_text: `${service.description}\n\n${service.benefits || ''}`,
        status: 'pending',
        source: 'website'
      }, supabaseUrl, supabaseKey)) itemsCount++;
    }

    // Insert projects
    for (const project of extractedData.projects || []) {
      if (await insertContent(userId, 'project', 'website', {
        title: project.title,
        description: project.description,
        content_text: project.description,
        status: 'pending',
        source: 'website'
      }, supabaseUrl, supabaseKey)) itemsCount++;
    }

    // Insert testimonials
    for (const testimonial of extractedData.testimonials || []) {
      if (await insertContent(userId, 'testimonial', 'website', {
        title: `Testimonial from ${testimonial.author || 'Customer'}`,
        content_text: testimonial.quote,
        status: 'pending',
        source: 'website'
      }, supabaseUrl, supabaseKey)) itemsCount++;
    }

    // Insert company info
    if (extractedData.company && extractedData.company.about) {
      if (await insertContent(userId, 'text', 'website', {
        title: 'About Us',
        content_text: extractedData.company.about,
        status: 'pending',
        source: 'website'
      }, supabaseUrl, supabaseKey)) itemsCount++;
    }

    console.log(`Inserted ${itemsCount} items into content library`);

    return res.status(200).json({
      success: true,
      itemsCount: itemsCount,
      message: `Extracted ${itemsCount} items from website`
    });

  } catch (error) {
    console.error('Website scraping error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Helper function to insert content
async function insertContent(userId, contentType, sourceType, data, supabaseUrl, supabaseKey) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const insertData = JSON.stringify({
      user_id: userId,
      content_type: contentType,
      source_type: sourceType,
      ...data,
        source_ref: 'web:' + (data.source_url || '') + ':' + (function(s){var h=5381;for(var i=0;i<s.length;i++){h=((h<<5)+h)^s.charCodeAt(i);h=h>>>0;}return h.toString(36);})(String(data.title||'')+String(data.source_url||''))
    });
    const urlObj = new URL(`${supabaseUrl}/rest/v1/content_library`);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode === 201) {
          resolve(true);
        } else {
          console.error("Supabase insert failed:", res.statusCode, body);
          resolve(false);
        }
      });
    });
    req.on("error", (err) => {
      console.error("Insert request error:", err.message);
      resolve(false);
    });
    req.write(insertData);
    req.end();
  });
}
