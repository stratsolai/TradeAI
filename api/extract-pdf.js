module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, fileName, fileData } = req.body;

  if (!userId || !fileData) {
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

    console.log('Processing PDF:', fileName);

    // Use Claude to analyze the PDF
    const analysisPrompt = `You are analyzing a business marketing document (PDF). Extract all useful content for a content library.

Please extract and categorize:

1. PROJECTS/CASE STUDIES:
   - Project names
   - Locations
   - Descriptions
   - Any statistics or results

2. TESTIMONIALS:
   - Customer quotes
   - Customer names (if provided)
   - Context

3. SERVICES/CAPABILITIES:
   - Service descriptions
   - Key features
   - Benefits

4. COMPANY INFORMATION:
   - About us text
   - Team member bios
   - Achievements/awards

5. KEY STATISTICS:
   - Years in business
   - Projects completed
   - Customer satisfaction rates
   - Any other metrics

Return your response as a JSON object with this structure:
{
  "projects": [{"title": "", "location": "", "description": "", "stats": ""}],
  "testimonials": [{"quote": "", "author": "", "context": ""}],
  "services": [{"name": "", "description": "", "benefits": ""}],
  "company": {"about": "", "team": [], "achievements": []},
  "statistics": []
}

Only include items you actually find. Return empty arrays for categories with no content.`;

    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: fileData
              }
            },
            {
              type: 'text',
              text: analysisPrompt
            }
          ]
        }
      ]
    });

    console.log('Calling Claude API...');

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
    console.log('Claude response received');

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
        projects: [],
        testimonials: [],
        services: [],
        company: {},
        statistics: []
      };
    }

    console.log('Extracted data:', extractedData);

    // Save source document record
    const sourceDocPromise = new Promise((resolve, reject) => {
      const url = new URL(`${supabaseUrl}/rest/v1/source_documents`);

      const docData = JSON.stringify({
        user_id: userId,
        doc_type: 'pdf',
        doc_name: fileName,
        status: 'complete',
        extracted_items_count: 0 // Will update after inserting items
      });

      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      };

      const supabaseReq = https.request(options, (supabaseRes) => {
        let data = '';
        supabaseRes.on('data', (chunk) => { data += chunk; });
        supabaseRes.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      supabaseReq.on('error', reject);
      supabaseReq.write(docData);
      supabaseReq.end();
    });

    await sourceDocPromise;

    // Insert extracted content into content_library
    let itemsCount = 0;

    // Insert projects
    for (const project of extractedData.projects || []) {
      await insertContent(userId, 'project', 'pdf-extract', {
        title: project.title,
        description: project.description,
        content_text: `Location: ${project.location}\n${project.description}\n${project.stats || ''}`,
        category: 'completed-job',
        tags: [project.location, 'project', 'pdf-extract'].filter(Boolean),
        ai_keywords: [project.title, project.location].filter(Boolean)
      }, supabaseUrl, supabaseKey);
      itemsCount++;
    }

    // Insert testimonials
    for (const testimonial of extractedData.testimonials || []) {
      await insertContent(userId, 'testimonial', 'pdf-extract', {
        title: `Testimonial from ${testimonial.author || 'Customer'}`,
        content_text: testimonial.quote,
        description: testimonial.context,
        category: 'testimonial',
        tags: ['testimonial', 'customer-review', 'pdf-extract'],
        ai_keywords: [testimonial.author].filter(Boolean)
      }, supabaseUrl, supabaseKey);
      itemsCount++;
    }

    // Insert services
    for (const service of extractedData.services || []) {
      await insertContent(userId, 'text', 'pdf-extract', {
        title: service.name,
        description: service.description,
        content_text: `${service.description}\n\nBenefits: ${service.benefits || ''}`,
        category: 'service',
        tags: ['service', 'capability', 'pdf-extract'],
        ai_keywords: [service.name].filter(Boolean)
      }, supabaseUrl, supabaseKey);
      itemsCount++;
    }

    // Insert company info
    if (extractedData.company && extractedData.company.about) {
      await insertContent(userId, 'text', 'pdf-extract', {
        title: 'About Us',
        content_text: extractedData.company.about,
        category: 'company',
        tags: ['about', 'company', 'pdf-extract'],
        ai_keywords: []
      }, supabaseUrl, supabaseKey);
      itemsCount++;
    }

    console.log(`Inserted ${itemsCount} items into content library`);

    return res.status(200).json({
      success: true,
      itemsCount: itemsCount,
      message: `Extracted ${itemsCount} items from ${fileName}`
    });

  } catch (error) {
    console.error('PDF extraction error:', error);
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
