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
// PDF PROCESSOR (Enhanced with categorization)
// ============================================
async function processPDF(userId, fileName, fileData) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;

  const analysisPrompt = `Analyze this business PDF document and extract ALL useful content with detailed categorization.

Extract and categorize each item separately:

1. COMPLETED JOBS/PROJECTS:
   - Project name/title
   - Location (suburb/city)
   - Description
   - Duration/date
   - Results/outcomes
   - Sub-category: type of work (e.g., "Pool Installation", "Deck Building", "Landscaping")

2. SERVICES/CAPABILITIES:
   - Service name
   - Description
   - Key features
   - Benefits
   - Sub-category: service type

3. TESTIMONIALS:
   - Customer quote
   - Customer name (if provided)
   - Context/what it's about
   - Sub-category: aspect praised (e.g., "Quality", "Speed", "Price")

4. MARKETING CONTENT:
   - Promotional text
   - Offers/deals
   - Call-to-actions
   - Sub-category: promotion type

5. TIPS & ADVICE:
   - Educational content
   - How-to information
   - Maintenance tips
   - Sub-category: topic area

6. TEAM & CULTURE:
   - Team member bios
   - Company values
   - Behind-the-scenes info
   - Sub-category: type (e.g., "Team Member", "Company Value")

7. COMPANY INFO:
   - About us
   - History
   - Achievements/awards
   - Statistics

Return as JSON with each item having:
{
  "items": [
    {
      "type": "project|service|testimonial|marketing|tip|team|company",
      "category": "completed-jobs|service|testimonial|marketing|tips|team-culture|company",
      "sub_category": "specific type",
      "title": "short title",
      "content": "full content/description",
      "metadata": {
        "location": "if project",
        "author": "if testimonial",
        "duration": "if project",
        "date": "if applicable"
      },
      "tags": ["auto-generated", "relevant", "tags"]
    }
  ]
}

Extract EVERY piece of useful content as a separate item. A single brochure might have 10-20 items.`;

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

  console.log('Analyzing PDF with enhanced extraction...');

  const claudeResponse = await callClaude(requestBody, claudeApiKey);
  const extractedData = parseClaudeJSON(claudeResponse.content[0].text);

  console.log(`Extracted ${extractedData.items?.length || 0} items from PDF`);

  // Create a parent "source document" record
  const sourceDocId = await insertContent(userId, 'document', 'pdf-source', {
    title: fileName,
    description: `Source PDF document`,
    category: 'document',
    tags: ['pdf', 'source-document'],
    status: 'approved' // Source docs are auto-approved
  });

  let itemsCount = 0;

  // Insert each extracted item as pending
  for (const item of extractedData.items || []) {
    try {
      const contentType = mapTypeToContentType(item.type);
      
      await insertContent(userId, contentType, 'pdf-extract', {
        title: item.title,
        description: item.content,
        content_text: item.content,
        category: item.category || 'general',
        sub_category: item.sub_category,
        tags: [...(item.tags || []), 'pdf-extract', fileName],
        ai_keywords: item.tags || [],
        extracted_from: sourceDocId,
        status: 'pending' // Needs review!
      });
      
      itemsCount++;
    } catch (error) {
      console.error('Error saving item:', error);
    }
  }

  console.log(`Saved ${itemsCount} items for review`);

  return { 
    itemsCount, 
    message: `Extracted ${itemsCount} items from PDF - ready for review` 
  };
}

function mapTypeToContentType(type) {
  const mapping = {
    'project': 'project',
    'service': 'text',
    'testimonial': 'testimonial',
    'marketing': 'text',
    'tip': 'text',
    'team': 'text',
    'company': 'text'
  };
  return mapping[type] || 'text';
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
// IMAGE PROCESSOR (Enhanced with categorization)
// ============================================
async function processImage(userId, fileName, fileData) {
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  
  const analysisPrompt = `Analyze this image and categorize it for a business content library.

Determine:
1. CATEGORY (choose the BEST fit):
   - "completed-jobs" - Project photos, finished work, before/after
   - "team-culture" - Team photos, office, behind-the-scenes
   - "marketing" - Product shots, promotional images
   - "tips" - Instructional images, diagrams, how-to visuals

2. SUB-CATEGORY (be specific):
   - For completed-jobs: type of project (e.g., "Pool Installation", "Deck", "Landscaping")
   - For team-culture: type of photo (e.g., "Team Photo", "Office", "Work in Progress")
   - For marketing: what's being promoted
   - For tips: what the tip is about

3. DESCRIPTION: What's in the image (2-3 sentences)

4. TEXT IN IMAGE: Any visible text (signs, labels, certificates)

5. TAGS: 5-10 relevant keywords

6. LOCATION CLUES: Any visible location info

Return as JSON:
{
  "category": "completed-jobs|team-culture|marketing|tips",
  "sub_category": "specific type",
  "title": "descriptive title",
  "description": "what's shown",
  "text_found": "any text visible",
  "location": "if identifiable",
  "tags": ["tag1", "tag2", ...],
  "suggested_use": "how this could be used in social media"
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
    title: extractedData.title || fileName,
    description: extractedData.description,
    content_text: extractedData.text_found,
    image_url: `data:image/jpeg;base64,${fileData}`,
    category: extractedData.category || 'general',
    sub_category: extractedData.sub_category,
    tags: extractedData.tags || ['image'],
    ai_keywords: extractedData.tags || [],
    status: 'pending' // Needs review
  });

  return { itemsCount: 1, message: 'Image categorised - ready for review' };
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
    statistics: [],
    slides: [],
    customers: [],
    items: [] // NEW: for enhanced extraction
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
