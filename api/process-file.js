module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, fileName, fileType, fileData } = req.body;

  if (!userId || !fileData || !fileType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  console.log(`Processing ${fileName} as ${fileType}`);

  try {
    let result;

    switch (fileType) {
      case 'pdf':
        result = await processPDF(userId, fileName, fileData);
        break;
      
      case 'word':
      case 'powerpoint':
      case 'excel':
        result = await processOfficeDocument(userId, fileName, fileData, fileType);
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
// PDF PROCESSOR (uses document type)
// ============================================
async function processPDF(userId, fileName, fileData) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;

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
  "company": {"about": "", "team": [], "achievements": []}
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
            media_type: 'application/pdf',
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
    await insertContent(userId, 'project', 'pdf-extract', {
      title: project.title,
      description: project.description,
      content_text: `Location: ${project.location}\n${project.description}\n${project.stats || ''}`,
      category: 'completed-job',
      tags: [project.location, 'project', 'pdf'].filter(Boolean)
    });
    itemsCount++;
  }

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
// OFFICE DOCUMENTS PROCESSOR (Word, PPT, Excel)
// Uses text extraction first, then Claude analysis
// ============================================
async function processOfficeDocument(userId, fileName, fileData, fileType) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;

  // For Office docs, we need to tell Claude what type it is
  const docTypeNames = {
    'word': 'Word document',
    'powerpoint': 'PowerPoint presentation',
    'excel': 'Excel spreadsheet'
  };

  const analysisPrompt = `I have a ${docTypeNames[fileType]} in base64 format. Please analyze its content and extract all useful business information.

Look for:
${fileType === 'powerpoint' ? `
- Slide titles and content
- Project showcases
- Service descriptions
- Company information
` : fileType === 'word' ? `
- Headings and sections
- Project descriptions
- Services offered
- Testimonials
- Company information
` : `
- Table data with projects, services, or customers
- Price lists
- Project lists with locations and dates
- Statistics and metrics
`}

Return JSON:
{
  "items": [
    {
      "type": "project|service|testimonial|text",
      "title": "",
      "content": "",
      "category": "",
      "tags": []
    }
  ]
}`;

  // For Office docs, we'll use a simpler text-based approach
  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `${analysisPrompt}\n\nI'll send this as a follow-up message. For now, please acknowledge that you understand the task.`
    }]
  });

  // First, just create a basic entry since we can't process Office docs directly
  // In production, you'd use a library to extract text from these files first
  await insertContent(userId, 'document', `${fileType}-upload`, {
    title: fileName,
    description: `Uploaded ${docTypeNames[fileType]}`,
    content_text: `File: ${fileName}\nType: ${docTypeNames[fileType]}\n\nNote: File uploaded successfully. To extract detailed content, download and re-upload as PDF.`,
    category: 'document',
    tags: [fileType, 'document']
  });

  return { 
    itemsCount: 1, 
    message: `${fileName} saved. Note: For best results with ${docTypeNames[fileType]}, convert to PDF first.` 
  };
}

// ============================================
// IMAGE PROCESSOR (with Vision)
// ============================================
async function processImage(userId, fileName, fileData) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  
  const analysisPrompt = `Analyze this image and extract all relevant information.

Describe:
1. What is shown (project, team, product, etc.)
2. Any text visible (signs, certificates, labels)
3. Location clues
4. Type of content (completed project, team photo, before/after, product)
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
    items: []
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
