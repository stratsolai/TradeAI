module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, fileName, fileType, fileData } = req.body;

  if (!userId || !fileData || !fileType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  console.log(`Processing ${fileName} as ${fileType}`);

  // Route to appropriate processor based on file type
  try {
    let result;

    switch (fileType) {
      case 'pdf':
        result = await processPDF(userId, fileName, fileData);
        break;
      
      case 'word':
        result = await processWord(userId, fileName, fileData);
        break;
      
      case 'powerpoint':
        result = await processPowerPoint(userId, fileName, fileData);
        break;
      
      case 'excel':
        result = await processExcel(userId, fileName, fileData);
        break;
      
      case 'image':
        result = await processImage(userId, fileName, fileData);
        break;
      
      case 'text':
        result = await processText(userId, fileName, fileData);
        break;
      
      default:
        return res.status(400).json({ error: 'Unsupported file type' });
    }

    return res.status(200).json({
      success: true,
      itemsCount: result.itemsCount,
      message: result.message
    });

  } catch (error) {
    console.error('File processing error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// PDF PROCESSOR
// ============================================
async function processPDF(userId, fileName, fileData) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  const https = require('https');

  const analysisPrompt = `Analyze this business PDF document and extract all useful content.

Extract and categorize:
1. PROJECTS/CASE STUDIES: Project names, locations, descriptions, statistics
2. TESTIMONIALS: Customer quotes, names, context
3. SERVICES: Service descriptions, features, benefits
4. COMPANY INFO: About us, team bios, achievements
5. STATISTICS: Years in business, projects completed, metrics

Return JSON:
{
  "projects": [{"title": "", "location": "", "description": "", "stats": ""}],
  "testimonials": [{"quote": "", "author": "", "context": ""}],
  "services": [{"name": "", "description": "", "benefits": ""}],
  "company": {"about": "", "team": [], "achievements": []},
  "statistics": []
}`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: fileData }
        },
        { type: 'text', text: analysisPrompt }
      ]
    }]
  });

  const claudeResponse = await callClaude(requestBody, claudeApiKey);
  const extractedData = parseClaudeJSON(claudeResponse.content[0].text);

  let itemsCount = 0;
  
  // Insert projects
  for (const project of extractedData.projects || []) {
    await insertContent(userId, 'project', 'pdf-extract', {
      title: project.title,
      description: project.description,
      content_text: `Location: ${project.location}\n${project.description}\n${project.stats || ''}`,
      category: 'completed-job',
      tags: [project.location, 'project', 'pdf'].filter(Boolean)
    });
    itemsCount++;
  }

  // Insert testimonials
  for (const testimonial of extractedData.testimonials || []) {
    await insertContent(userId, 'testimonial', 'pdf-extract', {
      title: `Testimonial from ${testimonial.author || 'Customer'}`,
      content_text: testimonial.quote,
      description: testimonial.context,
      category: 'testimonial',
      tags: ['testimonial', 'pdf']
    });
    itemsCount++;
  }

  // Insert services
  for (const service of extractedData.services || []) {
    await insertContent(userId, 'text', 'pdf-extract', {
      title: service.name,
      description: service.description,
      content_text: `${service.description}\n\nBenefits: ${service.benefits || ''}`,
      category: 'service',
      tags: ['service', 'pdf']
    });
    itemsCount++;
  }

  return { itemsCount, message: `Extracted ${itemsCount} items from PDF` };
}

// ============================================
// WORD PROCESSOR
// ============================================
async function processWord(userId, fileName, fileData) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  
  const analysisPrompt = `Analyze this Word document and extract all useful business content.

Extract and categorize:
1. SERVICES: Service descriptions and benefits
2. PROJECTS: Project descriptions and details
3. TESTIMONIALS: Customer quotes
4. COMPANY INFO: About us, team information
5. TEXT SNIPPETS: Any reusable marketing copy

Return JSON with the same structure as PDF extraction.`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { 
            type: 'base64', 
            media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            data: fileData 
          }
        },
        { type: 'text', text: analysisPrompt }
      ]
    }]
  });

  const claudeResponse = await callClaude(requestBody, claudeApiKey);
  const extractedData = parseClaudeJSON(claudeResponse.content[0].text);

  let itemsCount = 0;
  
  // Process similar to PDF
  for (const service of extractedData.services || []) {
    await insertContent(userId, 'text', 'word-extract', {
      title: service.name,
      description: service.description,
      content_text: service.description,
      category: 'service',
      tags: ['service', 'word']
    });
    itemsCount++;
  }

  for (const project of extractedData.projects || []) {
    await insertContent(userId, 'project', 'word-extract', {
      title: project.title,
      description: project.description,
      content_text: project.description,
      category: 'completed-job',
      tags: ['project', 'word']
    });
    itemsCount++;
  }

  return { itemsCount, message: `Extracted ${itemsCount} items from Word document` };
}

// ============================================
// POWERPOINT PROCESSOR
// ============================================
async function processPowerPoint(userId, fileName, fileData) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  
  const analysisPrompt = `Analyze this PowerPoint presentation and extract content from each slide.

For each slide, extract:
1. Slide title/heading
2. Main content/bullet points
3. Any statistics or key facts
4. Category (service, project, about, team, etc.)

Return JSON:
{
  "slides": [
    {
      "title": "",
      "content": "",
      "category": "",
      "type": "service|project|about|team"
    }
  ]
}`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { 
            type: 'base64', 
            media_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            data: fileData 
          }
        },
        { type: 'text', text: analysisPrompt }
      ]
    }]
  });

  const claudeResponse = await callClaude(requestBody, claudeApiKey);
  const extractedData = parseClaudeJSON(claudeResponse.content[0].text);

  let itemsCount = 0;
  
  for (const slide of extractedData.slides || []) {
    await insertContent(userId, 'text', 'ppt-extract', {
      title: slide.title,
      content_text: slide.content,
      description: `Slide from ${fileName}`,
      category: slide.type || 'general',
      tags: ['presentation', 'ppt', slide.category].filter(Boolean)
    });
    itemsCount++;
  }

  return { itemsCount, message: `Extracted ${itemsCount} slides from presentation` };
}

// ============================================
// EXCEL PROCESSOR
// ============================================
async function processExcel(userId, fileName, fileData) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  
  const analysisPrompt = `Analyze this Excel spreadsheet and extract structured data.

Look for:
1. PROJECT LISTS: Rows containing project names, locations, dates, values
2. CUSTOMER DATA: Customer names, testimonials, contact info
3. SERVICE/PRICE LISTS: Services offered with pricing
4. STATISTICS: Any numerical data, metrics, KPIs

Return JSON:
{
  "projects": [{"name": "", "location": "", "value": "", "date": ""}],
  "services": [{"name": "", "price": "", "description": ""}],
  "statistics": [{"metric": "", "value": ""}],
  "customers": [{"name": "", "testimonial": ""}]
}`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { 
            type: 'base64', 
            media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            data: fileData 
          }
        },
        { type: 'text', text: analysisPrompt }
      ]
    }]
  });

  const claudeResponse = await callClaude(requestBody, claudeApiKey);
  const extractedData = parseClaudeJSON(claudeResponse.content[0].text);

  let itemsCount = 0;
  
  for (const project of extractedData.projects || []) {
    await insertContent(userId, 'project', 'excel-extract', {
      title: project.name,
      description: `${project.location || ''} - ${project.value || ''} - ${project.date || ''}`,
      content_text: `Project: ${project.name}\nLocation: ${project.location}\nValue: ${project.value}\nDate: ${project.date}`,
      category: 'completed-job',
      tags: ['project', 'excel', project.location].filter(Boolean)
    });
    itemsCount++;
  }

  for (const customer of extractedData.customers || []) {
    if (customer.testimonial) {
      await insertContent(userId, 'testimonial', 'excel-extract', {
        title: `Testimonial from ${customer.name}`,
        content_text: customer.testimonial,
        category: 'testimonial',
        tags: ['testimonial', 'excel']
      });
      itemsCount++;
    }
  }

  return { itemsCount, message: `Extracted ${itemsCount} items from spreadsheet` };
}

// ============================================
// IMAGE PROCESSOR (Enhanced with Vision)
// ============================================
async function processImage(userId, fileName, fileData) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  
  const analysisPrompt = `Analyze this image and extract all relevant information.

Describe:
1. What is shown in the image (project, team, product, etc.)
2. Any text visible in the image (signs, certificates, labels)
3. Location clues (if visible)
4. Type of content (completed project, team photo, before/after, product, etc.)
5. Suggested tags and keywords

Return JSON:
{
  "description": "",
  "text_found": "",
  "category": "completed-job|team|marketing|product",
  "tags": [],
  "keywords": []
}`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: fileData }
        },
        { type: 'text', text: analysisPrompt }
      ]
    }]
  });

  const claudeResponse = await callClaude(requestBody, claudeApiKey);
  const extractedData = parseClaudeJSON(claudeResponse.content[0].text);

  await insertContent(userId, 'image', 'upload', {
    title: fileName,
    description: extractedData.description,
    content_text: extractedData.text_found,
    image_url: `data:image/jpeg;base64,${fileData}`,
    category: extractedData.category || 'general',
    tags: extractedData.tags || ['image'],
    ai_keywords: extractedData.keywords || []
  });

  return { itemsCount: 1, message: 'Image analyzed and tagged' };
}

// ============================================
// TEXT PROCESSOR
// ============================================
async function processText(userId, fileName, fileData) {
  // Decode base64 text file
  const textContent = Buffer.from(fileData, 'base64').toString('utf-8');
  
  await insertContent(userId, 'text', 'upload', {
    title: fileName,
    content_text: textContent,
    description: `Text file: ${fileName}`,
    category: 'general',
    tags: ['text']
  });

  return { itemsCount: 1, message: 'Text file imported' };
}

// ============================================
// HELPER FUNCTIONS
// ============================================
async function callClaude(requestBody, apiKey) {
  const https = require('https');
  
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
          if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

function parseClaudeJSON(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse JSON:', e);
  }
  
  return {
    projects: [],
    testimonials: [],
    services: [],
    company: {},
    statistics: [],
    slides: [],
    customers: []
  };
}

async function insertContent(userId, contentType, sourceType, data) {
  const https = require('https');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

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
