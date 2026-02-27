/**
 * /api/strategic-plan-generate.js
 *
 * Uses Claude to write plan content, then generates two .docx files:
 *   1. Strategic Plan (bank/lender ready)
 *   2. Operational Plan (internal, with action tracker)
 *
 * ENV: CLAUDE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// ─── HTTP HELPER ──────────────────────────────────────────────────────────────
function httpsPost(hostname, apiPath, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname, path: apiPath, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ─── CLAUDE CONTENT GENERATOR ─────────────────────────────────────────────────
async function generatePlanContent(claudeKey, planData) {
  const revenueLabels = {
    'under-100k': 'Under $100,000', '100k-250k': '$100,000–$250,000',
    '250k-500k': '$250,000–$500,000', '500k-1m': '$500,000–$1,000,000',
    '1m-2m': '$1,000,000–$2,000,000', 'over-2m': 'Over $2,000,000'
  };

  const systemPrompt = `You are an expert business plan writer specialising in Australian trades and construction businesses.
Write professional, polished business plan content suitable for submission to banks, lenders, or investors.
Use plain language — avoid jargon. Write in third person (e.g. "The business operates..." not "We operate...").
All content must be specific to the business data provided, not generic filler.
Return ONLY a JSON object — no markdown, no preamble.`;

  const userPrompt = `Generate comprehensive business plan content for this trades business:

BUSINESS DATA:
- Name: ${planData.businessName}
- ABN: ${planData.abn || 'Not provided'}
- Structure: ${planData.structure || 'Not specified'}
- Industry/Trade: ${planData.industry}
- Years operating: ${planData.yearsInBusiness || 'Not specified'}
- Location: ${planData.location}
- Team size: ${planData.teamSize}
- Licences: ${planData.licences || 'Not specified'}
- Services: ${planData.services}
- Target customers: ${(planData.targetCustomers || []).join(', ')}
- Service area: ${planData.serviceArea}
- Differentiators: ${planData.differentiators}
- Competitors: ${planData.competitors || 'Not specified'}
- Annual revenue: ${revenueLabels[planData.revenue] || planData.revenue || 'Not specified'}
- Jobs per month: ${planData.jobsPerMonth || 'Not specified'}
- Avg job value: ${planData.avgJobValue || 'Not specified'}
- Biggest costs: ${(planData.biggestCosts || []).join(', ')}
- Existing finance: ${planData.existingFinance || 'None noted'}
- Plan purpose: ${(planData.planPurpose || []).join(', ')}
- 12-month goals: ${planData.goals1yr}
- 3-year vision: ${planData.goals3yr}
- Planned investments: ${planData.investments || 'Not specified'}
- Hiring plans: ${(planData.hiringPlans || []).join(', ')}
- Lead generation: ${(planData.leadGeneration || []).join(', ')}
- Key suppliers: ${planData.suppliers || 'Not specified'}
- Subcontractors: ${planData.subcontractors || 'Not specified'}
- Technology: ${(planData.technology || []).join(', ')}
- Marketing: ${planData.marketing || 'Not specified'}
- Risks: ${(planData.risks || []).join(', ')}
- Contingency: ${planData.contingency || 'Not specified'}
- Insurance: ${(planData.insurance || []).join(', ')}
- Additional: ${planData.additionalInfo || 'None'}

Return this exact JSON structure:
{
  "executiveSummary": "3-4 paragraph executive summary suitable for a bank manager",
  "businessOverview": "2-3 paragraphs describing the business, its history and structure",
  "productsServices": "2-3 paragraphs describing services offered and target market",
  "marketAnalysis": "2-3 paragraphs on the market, competition and opportunity",
  "marketingStrategy": "2 paragraphs on how the business attracts and retains customers",
  "operationsOverview": "2 paragraphs on how the business operates day-to-day",
  "managementTeam": "1-2 paragraphs on leadership and key personnel",
  "financialOverview": "2-3 paragraphs covering revenue, costs and financial position — use the ranges provided",
  "growthStrategy": "2-3 paragraphs on 12-month and 3-year plans",
  "riskManagement": "2 paragraphs covering identified risks and mitigation strategies",
  "conclusion": "1 strong closing paragraph",
  "operationalActions": [
    {
      "category": "Financial",
      "actions": [
        {"action": "Specific action item", "priority": "High", "timeframe": "30 days", "notes": "Brief context"},
        ...
      ]
    },
    {
      "category": "Marketing",
      "actions": [...]
    },
    {
      "category": "Operations",
      "actions": [...]
    },
    {
      "category": "Compliance & Safety",
      "actions": [...]
    },
    {
      "category": "Growth",
      "actions": [...]
    }
  ]
}

Each category should have 3-6 specific, actionable items relevant to this business. Total actions: 20-30.
Priority must be exactly: "High", "Medium", or "Low".
Timeframe options: "30 days", "60 days", "90 days", "6 months", "12 months".`;

  const response = await httpsPost('api.anthropic.com', '/v1/messages',
    {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01'
    },
    {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }
  );

  if (response.status !== 200) throw new Error('Claude API error: ' + JSON.stringify(response.body));

  const text = response.body.content?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ─── DOCX GENERATORS ──────────────────────────────────────────────────────────

async function generateStrategyDoc(planData, content, outputPath) {
  // Install docx if needed
  try { execSync('npm list -g docx --depth=0', { stdio: 'ignore' }); }
  catch { execSync('npm install -g docx', { stdio: 'ignore' }); }

  const today = new Date().toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' });
  const version = new Date().getFullYear();

  const script = `
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
        PageNumber, Header, Footer, TabStopType, LevelFormat } = require('docx');
const fs = require('fs');

const BLUE       = '1A5490';
const ORANGE     = 'E8500A';
const LIGHT_BLUE = 'D6E4F0';
const LIGHT_GREY = 'F5F7FA';

const content = ${JSON.stringify(content)};
const planData = ${JSON.stringify(planData)};
const today = '${today}';

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, size: 28, color: BLUE, font: 'Arial' })],
    spacing: { before: 400, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 4 } }
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, size: 24, color: '333333', font: 'Arial' })],
    spacing: { before: 300, after: 120 }
  });
}

function body(text) {
  if (!text) return new Paragraph({ children: [new TextRun('')] });
  // Split into paragraphs on double newline
  const paras = text.split(/\\n\\n+/);
  return paras.map(p => new Paragraph({
    children: [new TextRun({ text: p.trim(), size: 22, font: 'Arial', color: '333333' })],
    spacing: { after: 160 },
    alignment: AlignmentType.JUSTIFIED
  }));
}

function spacer(size = 1) {
  return new Paragraph({ children: [new TextRun('')], spacing: { after: size * 120 } });
}

// Cover page
const coverPage = [
  spacer(4),
  new Paragraph({
    children: [new TextRun({ text: planData.businessName || 'Business Name', bold: true, size: 52, color: BLUE, font: 'Arial' })],
    alignment: AlignmentType.CENTER, spacing: { after: 200 }
  }),
  new Paragraph({
    children: [new TextRun({ text: 'STRATEGIC BUSINESS PLAN', bold: true, size: 36, color: ORANGE, font: 'Arial' })],
    alignment: AlignmentType.CENTER, spacing: { after: 160 }
  }),
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 1 } },
    children: [new TextRun('')], spacing: { after: 200 }
  }),
  new Paragraph({
    children: [new TextRun({ text: planData.industry || '', size: 24, color: '666666', font: 'Arial' })],
    alignment: AlignmentType.CENTER, spacing: { after: 120 }
  }),
  new Paragraph({
    children: [new TextRun({ text: planData.location || '', size: 24, color: '666666', font: 'Arial' })],
    alignment: AlignmentType.CENTER, spacing: { after: 120 }
  }),
  spacer(3),
  new Paragraph({
    children: [new TextRun({ text: today, size: 22, color: '999999', font: 'Arial' })],
    alignment: AlignmentType.CENTER
  }),
  spacer(2),
  new Paragraph({
    children: [new TextRun({
      text: 'CONFIDENTIAL — Prepared for private use only',
      size: 18, color: '999999', italics: true, font: 'Arial'
    })],
    alignment: AlignmentType.CENTER
  }),
  new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true })
];

// Business details table
const detailsTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [3000, 6360],
  rows: [
    ['Business Name', planData.businessName || ''],
    ['ABN', planData.abn || ''],
    ['Business Structure', planData.structure || ''],
    ['Industry / Trade', planData.industry || ''],
    ['Years in Operation', (planData.yearsInBusiness || '') + (planData.yearsInBusiness ? ' years' : '')],
    ['Location', planData.location || ''],
    ['Team Size', (planData.teamSize || '') + (planData.teamSize ? ' people' : '')],
    ['Licences / Certifications', planData.licences || ''],
    ['Document Date', today]
  ].map(([label, value], i) => new TableRow({
    children: [
      new TableCell({
        width: { size: 3000, type: WidthType.DXA },
        shading: { fill: i % 2 === 0 ? LIGHT_BLUE : 'FFFFFF', type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
        },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: 'Arial', color: '333333' })] })]
      }),
      new TableCell({
        width: { size: 6360, type: WidthType.DXA },
        shading: { fill: i % 2 === 0 ? 'F0F6FF' : 'FFFFFF', type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
        },
        children: [new Paragraph({ children: [new TextRun({ text: value || '—', size: 20, font: 'Arial' })] })]
      })
    ]
  }))
});

const flatten = arr => arr.flat(Infinity);

const sections = [
  ...coverPage,
  heading1('Business Details'),
  spacer(1),
  detailsTable,
  spacer(2),
  heading1('1. Executive Summary'),
  ...flatten(body(content.executiveSummary)),
  spacer(1),
  heading1('2. Business Overview'),
  ...flatten(body(content.businessOverview)),
  spacer(1),
  heading1('3. Products & Services'),
  ...flatten(body(content.productsServices)),
  spacer(1),
  heading1('4. Market Analysis'),
  ...flatten(body(content.marketAnalysis)),
  spacer(1),
  heading1('5. Marketing Strategy'),
  ...flatten(body(content.marketingStrategy)),
  spacer(1),
  heading1('6. Operations'),
  ...flatten(body(content.operationsOverview)),
  spacer(1),
  heading1('7. Management & Team'),
  ...flatten(body(content.managementTeam)),
  spacer(1),
  heading1('8. Financial Overview'),
  ...flatten(body(content.financialOverview)),
  spacer(1),
  heading1('9. Growth Strategy'),
  ...flatten(body(content.growthStrategy)),
  spacer(1),
  heading1('10. Risk Management'),
  ...flatten(body(content.riskManagement)),
  spacer(1),
  heading1('Conclusion'),
  ...flatten(body(content.conclusion))
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: '333333' } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: BLUE },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '333333' },
        paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1 } }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: planData.businessName + ' — Strategic Business Plan', size: 18, color: '999999', font: 'Arial' }),
            new TextRun({ children: [new PageNumber()], size: 18, color: '999999' })
          ],
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC', space: 4 } },
          alignment: AlignmentType.RIGHT
        })]
      })
    },
    children: sections
  }]
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync('${outputPath}', buf); console.log('DONE'); });
`;

  const tmpScript = path.join(os.tmpdir(), `strategy_${Date.now()}.js`);
  fs.writeFileSync(tmpScript, script);
  execSync(`node ${tmpScript}`, { timeout: 60000 });
  fs.unlinkSync(tmpScript);
}

async function generateOpsDoc(planData, content, outputPath) {
  try { execSync('npm list -g docx --depth=0', { stdio: 'ignore' }); }
  catch { execSync('npm install -g docx', { stdio: 'ignore' }); }

  const today = new Date().toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' });

  const script = `
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType } = require('docx');
const fs = require('fs');

const BLUE       = '1A5490';
const ORANGE     = 'E8500A';
const GREEN      = '28A745';
const LIGHT_BLUE = 'D6E4F0';

const content  = ${JSON.stringify(content)};
const planData = ${JSON.stringify(planData)};
const today    = '${today}';

const priorityColors = { High: 'FDECEA', Medium: 'FFF8E1', Low: 'F0FFF4' };
const priorityText   = { High: 'DC3545', Medium: 'E8500A', Low: '28A745' };

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, size: 28, color: BLUE, font: 'Arial' })],
    spacing: { before: 400, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 4 } }
  });
}

function spacer(n=1) {
  return new Paragraph({ children: [new TextRun('')], spacing: { after: n * 120 } });
}

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: opts.fill || 'FFFFFF', type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders,
    children: [new Paragraph({
      children: [new TextRun({
        text: text || '', size: opts.size || 20, bold: opts.bold || false,
        color: opts.color || '333333', font: 'Arial'
      })],
      alignment: opts.align || AlignmentType.LEFT
    })]
  });
}

// Header row for action table
function headerRow() {
  return new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 4200, type: WidthType.DXA },
        shading: { fill: BLUE, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: 'Action Item', bold: true, size: 20, color: 'FFFFFF', font: 'Arial' })] })]
      }),
      new TableCell({
        width: { size: 1500, type: WidthType.DXA },
        shading: { fill: BLUE, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: 'Priority', bold: true, size: 20, color: 'FFFFFF', font: 'Arial' })] })]
      }),
      new TableCell({
        width: { size: 1500, type: WidthType.DXA },
        shading: { fill: BLUE, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: 'Timeframe', bold: true, size: 20, color: 'FFFFFF', font: 'Arial' })] })]
      }),
      new TableCell({
        width: { size: 1560, type: WidthType.DXA },
        shading: { fill: BLUE, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: 'Status', bold: true, size: 20, color: 'FFFFFF', font: 'Arial' })] })]
      }),
      new TableCell({
        width: { size: 600, type: WidthType.DXA },
        shading: { fill: BLUE, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: '✓', bold: true, size: 20, color: 'FFFFFF', font: 'Arial' })] })]
      })
    ]
  });
}

function actionRow(item) {
  const pColor = priorityColors[item.priority] || 'FFFFFF';
  const pText  = priorityText[item.priority] || '333333';
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 4200, type: WidthType.DXA },
        shading: { fill: 'FAFAFA', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        borders,
        children: [
          new Paragraph({ children: [new TextRun({ text: item.action, size: 20, font: 'Arial', color: '333333' })] }),
          item.notes ? new Paragraph({ children: [new TextRun({ text: item.notes, size: 18, font: 'Arial', color: '888888', italics: true })] }) : null
        ].filter(Boolean)
      }),
      new TableCell({
        width: { size: 1500, type: WidthType.DXA },
        shading: { fill: pColor, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: item.priority, size: 20, bold: true, font: 'Arial', color: pText })] })]
      }),
      new TableCell({
        width: { size: 1500, type: WidthType.DXA },
        shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: item.timeframe, size: 20, font: 'Arial' })] })]
      }),
      new TableCell({
        width: { size: 1560, type: WidthType.DXA },
        shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: 'Not Started', size: 18, font: 'Arial', color: '999999' })] })]
      }),
      new TableCell({
        width: { size: 600, type: WidthType.DXA },
        shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: '☐', size: 22, font: 'Arial' })] })]
      })
    ]
  });
}

const sections = [
  // Cover
  new Paragraph({ children: [new TextRun('')], spacing: { after: 2000 } }),
  new Paragraph({
    children: [new TextRun({ text: planData.businessName || '', bold: true, size: 52, color: BLUE, font: 'Arial' })],
    alignment: AlignmentType.CENTER, spacing: { after: 200 }
  }),
  new Paragraph({
    children: [new TextRun({ text: 'OPERATIONAL PLAN & ACTION TRACKER', bold: true, size: 32, color: ORANGE, font: 'Arial' })],
    alignment: AlignmentType.CENTER, spacing: { after: 160 }
  }),
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 1 } },
    children: [new TextRun('')], spacing: { after: 200 }
  }),
  new Paragraph({
    children: [new TextRun({ text: 'INTERNAL USE — Confidential', size: 22, color: '999999', italics: true, font: 'Arial' })],
    alignment: AlignmentType.CENTER, spacing: { after: 120 }
  }),
  new Paragraph({
    children: [new TextRun({ text: today, size: 22, color: '999999', font: 'Arial' })],
    alignment: AlignmentType.CENTER
  }),
  new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true }),

  // Intro
  heading1('About This Document'),
  new Paragraph({
    children: [new TextRun({
      text: 'This Operational Plan is an internal working document for ' + (planData.businessName || 'the business') + '. It translates the Strategic Business Plan into specific, trackable action items. Use this document to assign tasks, track progress and ensure goals are being actively worked towards.',
      size: 22, font: 'Arial', color: '333333'
    })],
    spacing: { after: 200 },
    alignment: AlignmentType.JUSTIFIED
  }),
  new Paragraph({
    children: [new TextRun({
      text: 'Update the Status column and tick the checkbox as each item is completed. Review this plan monthly and adjust as needed.',
      size: 22, font: 'Arial', color: '666666', italics: true
    })],
    spacing: { after: 400 }
  }),

  // Legend
  new Paragraph({
    children: [new TextRun({ text: 'Priority Key:', bold: true, size: 20, font: 'Arial' })],
    spacing: { after: 80 }
  }),
  new Table({
    width: { size: 5000, type: WidthType.DXA },
    columnWidths: [1200, 1200, 1200],
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 1200, type: WidthType.DXA }, shading: { fill: 'FDECEA', type: ShadingType.CLEAR }, borders, margins: { top:80, bottom:80, left:120, right:120 },
        children: [new Paragraph({ children: [new TextRun({ text: '🔴 High — Act immediately', size: 18, font: 'Arial', color: 'DC3545' })] })] }),
      new TableCell({ width: { size: 1200, type: WidthType.DXA }, shading: { fill: 'FFF8E1', type: ShadingType.CLEAR }, borders, margins: { top:80, bottom:80, left:120, right:120 },
        children: [new Paragraph({ children: [new TextRun({ text: '🟡 Medium — Plan & schedule', size: 18, font: 'Arial', color: 'E8500A' })] })] }),
      new TableCell({ width: { size: 1200, type: WidthType.DXA }, shading: { fill: 'F0FFF4', type: ShadingType.CLEAR }, borders, margins: { top:80, bottom:80, left:120, right:120 },
        children: [new Paragraph({ children: [new TextRun({ text: '🟢 Low — When capacity allows', size: 18, font: 'Arial', color: '28A745' })] })] })
    ]})]
  }),
  spacer(3)
];

// Add each category as a section
for (const cat of (content.operationalActions || [])) {
  sections.push(heading1(cat.category + ' Actions'));
  const rows = [headerRow(), ...cat.actions.map(actionRow)];
  sections.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4200, 1500, 1500, 1560, 600],
    rows
  }));
  sections.push(spacer(3));
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: '333333' } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: BLUE },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } }
    ]
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: sections
  }]
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync('${outputPath}', buf); console.log('DONE'); });
`;

  const tmpScript = path.join(os.tmpdir(), `ops_${Date.now()}.js`);
  fs.writeFileSync(tmpScript, script);
  execSync(`node ${tmpScript}`, { timeout: 60000 });
  fs.unlinkSync(tmpScript);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, planData } = req.body;
  if (!userId || !planData) return res.status(400).json({ error: 'userId and planData required' });

  const claudeKey   = process.env.CLAUDE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!claudeKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const tmpDir   = os.tmpdir();
  const businessSlug = (planData.businessName || 'business').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const timestamp    = Date.now();
  const strategyPath = path.join(tmpDir, `${businessSlug}-strategy-${timestamp}.docx`);
  const opsPath      = path.join(tmpDir, `${businessSlug}-ops-${timestamp}.docx`);

  try {
    // 1. Generate content with Claude
    console.log('[strategic-plan] Generating content...');
    const content = await generatePlanContent(claudeKey, planData);

    // 2. Generate both Word docs
    console.log('[strategic-plan] Generating Strategy doc...');
    await generateStrategyDoc(planData, content, strategyPath);

    console.log('[strategic-plan] Generating Ops doc...');
    await generateOpsDoc(planData, content, opsPath);

    // 3. Upload both to Supabase Storage
    const strategyBuffer = fs.readFileSync(strategyPath);
    const opsBuffer      = fs.readFileSync(opsPath);

    const strategyStoragePath = `strategic-plans/${userId}/strategy-${timestamp}.docx`;
    const opsStoragePath      = `strategic-plans/${userId}/ops-${timestamp}.docx`;

    const { error: e1 } = await supabase.storage
      .from('marketing-assets')
      .upload(strategyStoragePath, strategyBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true
      });
    if (e1) throw new Error('Strategy upload failed: ' + e1.message);

    const { error: e2 } = await supabase.storage
      .from('marketing-assets')
      .upload(opsStoragePath, opsBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true
      });
    if (e2) throw new Error('Ops upload failed: ' + e2.message);

    const { data: { publicUrl: strategyUrl } } = supabase.storage
      .from('marketing-assets').getPublicUrl(strategyStoragePath);

    const { data: { publicUrl: opsUrl } } = supabase.storage
      .from('marketing-assets').getPublicUrl(opsStoragePath);

    // 4. Also save to content_library
    for (const [title, url, type] of [
      [`${planData.businessName} — Strategic Business Plan`, strategyUrl, 'strategic-plan'],
      [`${planData.businessName} — Operational Plan`, opsUrl, 'operational-plan']
    ]) {
      await supabase.from('content_library').insert({
        user_id: userId,
        title,
        content_type: type,
        file_url: url,
        tool_source: 'strategic-plan-generator',
        status: 'approved'
      });
    }

    // Cleanup temp files
    try { fs.unlinkSync(strategyPath); fs.unlinkSync(opsPath); } catch(e) {}

    return res.status(200).json({ success: true, strategyUrl, opsUrl });

  } catch(err) {
    console.error('[strategic-plan] Error:', err);
    try { fs.unlinkSync(strategyPath); } catch(e) {}
    try { fs.unlinkSync(opsPath); } catch(e) {}
    return res.status(500).json({ error: err.message });
  }
};
