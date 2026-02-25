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
    const analysisPrompt = `You are analyzing a business website. Extract all useful marketing content.

Please extract and categorize:

1. SERVICES:
   - Service names and descriptions
   - Key features and benefits

2. PROJECTS/PORTFOLIO:
   - Project names
   - Descriptions
   - Locations if mentioned

3. TESTIMONIALS/REVIEWS:
   - Customer quotes
   - Names if provided

4. ABOUT/COMPANY INFO:
   - Company description
   - Team information
   - History/achievements

5. CONTACT/LOCATION:
   - Service areas
   - Locations

Return your response as a JSON object:
{
  "services": [{"name": "", "description": "", "benefits": ""}],
  "projects": [{"title": "", "description": "", "location": ""}],
  "testimonials": [{"quote": "", "author": ""}],
  "company": {"about": "", "team": [], "locations": []},
  "images": [{"url": "", "alt": "", "context": ""}]
}

Only include items you actually find. Return empty arrays for categories with no content.

Website HTML:
${websiteHtml.substring(0, 50000)}`; // Limit to 50k chars

    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: analysisPrompt
        }
      ]
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
          'Prefer': 'return=minimal'
        }
      };

      const supabaseReq = https.request(options, (supabaseRes) => {
        supabaseRes.on('data', () => {});
        supabaseRes.on('end', resolve);
      });

      supabaseReq.on('error', reject);
      supabaseReq.write(docData);
      supabaseReq.end();
    });

    // Insert extracted content
    let itemsCount = 0;

    // Insert services
    for (const service of extractedData.services || []) {
      await insertContent(userId, 'text', 'website', {
        title: service.name,
        description: service.description,
        content_text: `${service.description}\n\n${service.benefits || ''}`,
        category: 'service',
        tags: ['service', 'website'],
        ai_keywords: [service.name].filter(Boolean)
      }, supabaseUrl, supabaseKey);
      itemsCount++;
    }

    // Insert projects
    for (const project of extractedData.projects || []) {
      await insertContent(userId, 'project', 'website', {
        title: project.title,
        description: project.description,
        content_text: project.description,
        category: 'completed-job',
        tags: [project.location, 'project', 'website'].filter(Boolean),
        ai_keywords: [project.title, project.location].filter(Boolean)
      }, supabaseUrl, supabaseKey);
      itemsCount++;
    }

    // Insert testimonials
    for (const testimonial of extractedData.testimonials || []) {
      await insertContent(userId, 'testimonial', 'website', {
        title: `Testimonial from ${testimonial.author || 'Customer'}`,
        content_text: testimonial.quote,
        category: 'testimonial',
        tags: ['testimonial', 'website'],
        ai_keywords: [testimonial.author].filter(Boolean)
      }, supabaseUrl, supabaseKey);
      itemsCount++;
    }

    // Insert company info
    if (extractedData.company && extractedData.company.about) {
      await insertContent(userId, 'text', 'website', {
        title: 'About Us',
        content_text: extractedData.company.about,
        category: 'company',
        tags: ['about', 'website'],
        ai_keywords: []
      }, supabaseUrl, supabaseKey);
      itemsCount++;
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
    const url = new URL(`${supabaseUrl}/rest/v1/content_library`);

    const insertData = JSON.stringify({
      user_id: userId,
      content_type: contentType,
      source_type: sourceType,
      ...data
    });

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    };

    const supabaseReq = https.request(options, (supabaseRes) => {
      supabaseRes.on('data', () => {});
      supabaseRes.on('end', resolve);
    });

    supabaseReq.on('error', reject);
    supabaseReq.write(insertData);
    supabaseReq.end();
  });
}
