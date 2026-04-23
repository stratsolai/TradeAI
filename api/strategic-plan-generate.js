// api/strategic-plan-generate.js
// Generates Strategic Plan and Ops Plan content via Claude, creates .docx files,
// uploads to Supabase Storage, writes to content_library (Pattern B) and
// strategic_plans table, creates action_tracker rows with items jsonb.
//
// ENV: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

export const config = { maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  Header } from 'docx';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── CLAUDE CONTENT GENERATOR ────────────────────────────────────────────────

async function generatePlanContent(planData, clContext, biInsights) {
  var revenueLabels = {
    'under-100k': 'Under $100,000', '100k-250k': '$100,000\u2013$250,000',
    '250k-500k': '$250,000\u2013$500,000', '500k-1m': '$500,000\u2013$1,000,000',
    '1m-2m': '$1,000,000\u2013$2,000,000', 'over-2m': 'Over $2,000,000'
  };

  var systemPrompt = 'You are an expert business plan writer specialising in Australian small and medium businesses across trades, construction, professional services, and other industries.\n' +
    'Write professional, polished business plan content suitable for submission to banks, lenders, or investors.\n' +
    'Use plain language \u2014 avoid jargon. Write in third person (e.g. "The business operates..." not "We operate...").\n' +
    'All content must be specific to the business data provided, not generic filler.\n' +
    'Return ONLY a JSON object \u2014 no markdown, no preamble.\n' +
    'If BI Intelligence Insights are provided, incorporate them into the Growth Strategy, Market Analysis, and Products & Services sections of Document 1. Do not fabricate insights \u2014 only reference what is explicitly listed.\n' +
    'Always include a SWOT Analysis section in Document 1 with exactly 3\u20135 dot points each for Strengths, Weaknesses, Opportunities, and Threats.\n' +
    'After the full document content, append a JSON block delimited by ###SWOT_JSON_START### and ###SWOT_JSON_END### containing: {"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]}.';

  var userPrompt = 'Generate comprehensive business plan content for this business:\n\n' +
    'BUSINESS DATA:\n' +
    '- Name: ' + (planData.businessName || 'Not provided') + '\n' +
    '- Trading Name: ' + (planData.tradingName || 'Same as above') + '\n' +
    '- ABN: ' + (planData.abn || 'Not provided') + '\n' +
    '- Structure: ' + (planData.structure || 'Not specified') + '\n' +
    '- Industry/Trade: ' + (planData.industry || 'Not specified') + '\n' +
    '- Years operating: ' + (planData.yearsInBusiness || 'Not specified') + '\n' +
    '- Location: ' + (planData.location || 'Not specified') + '\n' +
    '- Team size: ' + (planData.teamSize || 'Not specified') + '\n' +
    '- Licences: ' + (planData.licences || 'Not specified') + '\n' +
    '- Services: ' + (planData.services || 'Not specified') + '\n' +
    '- Products: ' + (planData.products || 'Not specified') + '\n' +
    '- Website: ' + (planData.websiteUrl || 'Not provided') + '\n' +
    '- Target customers: ' + (Array.isArray(planData.targetCustomers) ? planData.targetCustomers.join(', ') : (planData.targetCustomers || 'Not specified')) + '\n' +
    '- Service area: ' + (planData.serviceArea || 'Not specified') + '\n' +
    '- Differentiators: ' + (planData.differentiators || 'Not specified') + '\n' +
    '- Competitors: ' + (planData.competitors || 'Not specified') + '\n' +
    '- Annual revenue: ' + (revenueLabels[planData.revenue] || planData.revenue || 'Not specified') + '\n' +
    '- Jobs per month: ' + (planData.jobsPerMonth || 'Not specified') + '\n' +
    '- Avg job value: ' + (planData.avgJobValue || 'Not specified') + '\n' +
    '- Biggest costs: ' + (Array.isArray(planData.biggestCosts) ? planData.biggestCosts.join(', ') : (planData.biggestCosts || 'Not specified')) + '\n' +
    '- Existing finance: ' + (planData.existingFinance || 'None noted') + '\n' +
    '- Plan purpose: ' + (Array.isArray(planData.planPurpose) ? planData.planPurpose.join(', ') : (planData.planPurpose || 'Not specified')) + '\n' +
    '- 12-month goals: ' + (planData.goals1yr || 'Not specified') + '\n' +
    '- 3-year vision: ' + (planData.goals3yr || 'Not specified') + '\n' +
    '- Planned investments: ' + (planData.investments || 'Not specified') + '\n' +
    '- Hiring plans: ' + (Array.isArray(planData.hiringPlans) ? planData.hiringPlans.join(', ') : (planData.hiringPlans || 'Not specified')) + '\n' +
    '- Lead generation: ' + (Array.isArray(planData.leadGeneration) ? planData.leadGeneration.join(', ') : (planData.leadGeneration || 'Not specified')) + '\n' +
    '- Key suppliers: ' + (planData.suppliers || 'Not specified') + '\n' +
    '- Subcontractors: ' + (planData.subcontractors || 'Not specified') + '\n' +
    '- Technology: ' + (Array.isArray(planData.technology) ? planData.technology.join(', ') : (planData.technology || 'Not specified')) + '\n' +
    '- Marketing: ' + (planData.marketing || 'Not specified') + '\n' +
    '- Risks: ' + (Array.isArray(planData.risks) ? planData.risks.join(', ') : (planData.risks || 'Not specified')) + '\n' +
    '- Contingency: ' + (planData.contingency || 'Not specified') + '\n' +
    '- Insurance: ' + (Array.isArray(planData.insurance) ? planData.insurance.join(', ') : (planData.insurance || 'Not specified')) + '\n' +
    '- Additional: ' + (planData.additionalInfo || 'None') + '\n' +
    '- Key Person Dependency: ' + (planData.keyPersonDependency || 'Not provided') + '\n' +
    '- Most Profitable Service: ' + (planData.mostProfitableService || 'Not provided') + '\n' +
    '- Average Payment Time: ' + (planData.avgPaymentTime || 'Not provided') + '\n' +
    '- Gross Margin Awareness: ' + (planData.grossMarginAwareness || 'Not provided') + '\n' +
    '- Monthly Marketing Budget: ' + (planData.marketingBudget || 'Not provided') + '\n' +
    '- Biggest Marketing Challenges: ' + (Array.isArray(planData.marketingChallenges) ? planData.marketingChallenges.join(', ') : (planData.marketingChallenges || 'Not provided')) + '\n' +
    '- Key Roles in Business: ' + (Array.isArray(planData.keyRoles) ? planData.keyRoles.join(', ') : (planData.keyRoles || 'Not provided')) + '\n' +
    '- Compliance Actions Due: ' + (planData.complianceActions || 'Not provided') + '\n\n' +
    'Return this exact JSON structure:\n' +
    '{\n' +
    '  "executiveSummary": "3-4 paragraph executive summary suitable for a bank manager",\n' +
    '  "businessOverview": "2-3 paragraphs describing the business, its history and structure",\n' +
    '  "productsServices": "2-3 paragraphs describing services offered and target market",\n' +
    '  "marketAnalysis": "2-3 paragraphs on the market, competition and opportunity",\n' +
    '  "competitorAnalysis": "3-5 sentences positioning the business relative to named competitors or a general market statement if none named",\n' +
    '  "swotAnalysis": "STRENGTHS\\n- point\\n- point\\n- point\\n\\nWEAKNESSES\\n- point\\n- point\\n- point\\n\\nOPPORTUNITIES\\n- point\\n- point\\n- point\\n\\nTHREATS\\n- point\\n- point\\n- point",\n' +
    '  "marketingStrategy": "2 paragraphs on how the business attracts and retains customers",\n' +
    '  "operationsOverview": "2 paragraphs on how the business operates day-to-day",\n' +
    '  "managementTeam": "1-2 paragraphs on leadership and key personnel",\n' +
    '  "financialOverview": "2-3 paragraphs covering revenue, costs and financial position",\n' +
    '  "growthStrategy": "2-3 paragraphs on 12-month and 3-year plans",\n' +
    '  "riskManagement": "2 paragraphs covering identified risks and mitigation strategies",\n' +
    '  "conclusion": "1 strong closing paragraph",\n' +
    '  "operationalActions": [\n' +
    '    { "month": 1, "actions": [{"title":"...", "dueDay":"Day 14", "priority":"High", "owner":"Owner", "notes":"..."}] },\n' +
    '    { "month": 2, "actions": [{"title":"...", "dueDay":"Day 45", "priority":"Medium", "owner":"Owner", "notes":"..."}] },\n' +
    '    { "month": 3, "actions": [{"title":"...", "dueDay":"Day 75", "priority":"Low", "owner":"Owner", "notes":"..."}] }\n' +
    '  ]\n' +
    '}\n\n' +
    'IMPORTANT INSTRUCTIONS FOR TASK GENERATION:\n' +
    '- Generate between 8 and 20 tasks total across all three months.\n' +
    '- Each month object must have a numeric "month" field (1, 2, or 3) and an "actions" array.\n' +
    '- Each action must include title, dueDay (e.g. "Day 14"), priority ("High"/"Medium"/"Low"), owner, and notes.\n' +
    '- Always include a 45-day review checkpoint task in month 2.\n' +
    '- Set owner to the relevant role from keyRoles if provided, otherwise use "Owner".';

  if (clContext) {
    userPrompt += '\n\nADDITIONAL BUSINESS CONTEXT FROM CONTENT LIBRARY:\n' + clContext;
  }
  if (biInsights && biInsights.length > 0) {
    userPrompt += '\n\nBI INTELLIGENCE INSIGHTS (from Business Intelligence Dashboard):\n' +
      biInsights.map(function(i) { return i.insight_type + ': ' + i.title + ' --- ' + i.summary; }).join('\n');
  }

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    var errText = await response.text().catch(function() { return ''; });
    throw new Error('Claude API error: ' + response.status + ' ' + errText.substring(0, 300));
  }

  var data = await response.json();
  var text = data.content && data.content[0] ? data.content[0].text : '{}';
  var clean = text.replace(/```json|```/g, '').trim();

  var swotData = null;
  var swotStartMarker = '###SWOT_JSON_START###';
  var swotEndMarker = '###SWOT_JSON_END###';
  var swotStart = clean.indexOf(swotStartMarker);
  var swotEnd = clean.indexOf(swotEndMarker);
  if (swotStart !== -1 && swotEnd !== -1) {
    try {
      var swotRaw = clean.substring(swotStart + swotStartMarker.length, swotEnd).trim();
      swotData = JSON.parse(swotRaw);
    } catch (e) { swotData = null; }
    clean = clean.substring(0, swotStart).trim();
  }

  var parsed = JSON.parse(clean);
  parsed.__swotData = swotData;
  return parsed;
}

// ── DOCX GENERATORS (docx package in dependencies) ──────────────────────────

async function generateStrategyDoc(planData, content) {
  var today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  var BLUE = '1A5490';
  var ORANGE = 'E8500A';
  var LIGHT_BLUE = 'D6E4F0';

  function heading1(text) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: text, bold: true, size: 28, color: BLUE, font: 'Arial' })],
      spacing: { before: 400, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 4 } }
    });
  }

  function body(text) {
    if (!text) return [new Paragraph({ children: [new TextRun('')] })];
    return text.split(/\n\n+/).map(function(p) {
      return new Paragraph({
        children: [new TextRun({ text: p.trim(), size: 22, font: 'Arial', color: '333333' })],
        spacing: { after: 160 },
        alignment: AlignmentType.JUSTIFIED
      });
    });
  }

  function spacer(n) {
    return new Paragraph({ children: [new TextRun('')], spacing: { after: (n || 1) * 120 } });
  }

  var coverPage = [
    spacer(4),
    new Paragraph({ children: [new TextRun({ text: planData.businessName || 'Business Name', bold: true, size: 52, color: BLUE, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
    new Paragraph({ children: [new TextRun({ text: 'STRATEGIC BUSINESS PLAN', bold: true, size: 36, color: ORANGE, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { after: 160 } }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 1 } }, children: [new TextRun('')], spacing: { after: 200 } }),
    new Paragraph({ children: [new TextRun({ text: planData.industry || '', size: 24, color: '666666', font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
    new Paragraph({ children: [new TextRun({ text: planData.location || '', size: 24, color: '666666', font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
    spacer(3),
    new Paragraph({ children: [new TextRun({ text: today, size: 22, color: '999999', font: 'Arial' })], alignment: AlignmentType.CENTER }),
    spacer(2),
    new Paragraph({ children: [new TextRun({ text: 'CONFIDENTIAL \u2014 Prepared for private use only', size: 18, color: '999999', italics: true, font: 'Arial' })], alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true })
  ];

  var detailRows = [
    ['Business Name', planData.businessName || ''],
    ['ABN', planData.abn || ''],
    ['Business Structure', planData.structure || ''],
    ['Industry / Trade', planData.industry || ''],
    ['Years in Operation', (planData.yearsInBusiness || '') + (planData.yearsInBusiness ? ' years' : '')],
    ['Location', planData.location || ''],
    ['Team Size', (planData.teamSize || '') + (planData.teamSize ? ' people' : '')],
    ['Licences / Certifications', planData.licences || ''],
    ['Document Date', today]
  ];

  var border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  var borders = { top: border, bottom: border, left: border, right: border };

  var detailsTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3000, 6360],
    rows: detailRows.map(function(pair, i) {
      return new TableRow({
        children: [
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? LIGHT_BLUE : 'FFFFFF', type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            borders: borders,
            children: [new Paragraph({ children: [new TextRun({ text: pair[0], bold: true, size: 20, font: 'Arial', color: '333333' })] })]
          }),
          new TableCell({
            width: { size: 6360, type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? 'F0F6FF' : 'FFFFFF', type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            borders: borders,
            children: [new Paragraph({ children: [new TextRun({ text: pair[1] || '\u2014', size: 20, font: 'Arial' })] })]
          })
        ]
      });
    })
  });

  var flatten = function(arr) { return arr.flat(Infinity); };

  var sections = [
    ...coverPage,
    heading1('Business Details'), spacer(1), detailsTable, spacer(2),
    heading1('1. Executive Summary'), ...flatten(body(content.executiveSummary)), spacer(1),
    heading1('2. SWOT Analysis'), ...flatten(body(content.swotAnalysis || '')), spacer(1),
    heading1('3. Business Overview'), ...flatten(body(content.businessOverview)), spacer(1),
    heading1('4. Products & Services'), ...flatten(body(content.productsServices)), spacer(1),
    heading1('5. Market Analysis'), ...flatten(body(content.marketAnalysis)), spacer(1),
    heading1('5b. Competitor Analysis'), ...flatten(body(content.competitorAnalysis || '')), spacer(1),
    heading1('6. Marketing Strategy'), ...flatten(body(content.marketingStrategy)), spacer(1),
    heading1('7. Operations'), ...flatten(body(content.operationsOverview)), spacer(1),
    heading1('8. Management & Team'), ...flatten(body(content.managementTeam)), spacer(1),
    heading1('9. Financial Overview'), ...flatten(body(content.financialOverview)), spacer(1),
    heading1('10. Growth Strategy'), ...flatten(body(content.growthStrategy)), spacer(1),
    heading1('11. Risk Management'), ...flatten(body(content.riskManagement)), spacer(1),
    heading1('Conclusion'), ...flatten(body(content.conclusion))
  ];

  var doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22, color: '333333' } } }
    },
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: (planData.businessName || '') + ' \u2014 Strategic Business Plan', size: 18, color: '999999', font: 'Arial' })],
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC', space: 4 } },
            alignment: AlignmentType.RIGHT
          })]
        })
      },
      children: sections
    }]
  });

  return await Packer.toBuffer(doc);
}

async function generateOpsDoc(planData, content) {
  var today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  var BLUE = '1A5490';
  var ORANGE = 'E8500A';

  var border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  var borders = { top: border, bottom: border, left: border, right: border };
  var priorityColors = { High: 'FDECEA', Medium: 'FFF8E1', Low: 'F0FFF4' };
  var priorityText = { High: 'DC3545', Medium: 'E8500A', Low: '28A745' };

  function heading1(text) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: text, bold: true, size: 28, color: BLUE, font: 'Arial' })],
      spacing: { before: 400, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 4 } }
    });
  }

  function spacer(n) {
    return new Paragraph({ children: [new TextRun('')], spacing: { after: (n || 1) * 120 } });
  }

  function headerRow() {
    var cols = [
      { text: 'Action Item', width: 4200 },
      { text: 'Priority', width: 1500 },
      { text: 'Timeframe', width: 1500 },
      { text: 'Owner', width: 1560 },
      { text: '\u2713', width: 600 }
    ];
    return new TableRow({
      tableHeader: true,
      children: cols.map(function(col) {
        return new TableCell({
          width: { size: col.width, type: WidthType.DXA },
          shading: { fill: BLUE, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          borders: borders,
          children: [new Paragraph({ children: [new TextRun({ text: col.text, bold: true, size: 20, color: 'FFFFFF', font: 'Arial' })] })]
        });
      })
    });
  }

  function actionRow(action) {
    var pFill = priorityColors[action.priority] || 'FFFFFF';
    var pText = priorityText[action.priority] || '333333';
    var children = [
      new Paragraph({ children: [new TextRun({ text: action.title || '', size: 20, font: 'Arial', color: '333333' })] })
    ];
    if (action.notes) {
      children.push(new Paragraph({ children: [new TextRun({ text: action.notes, size: 18, font: 'Arial', color: '888888', italics: true })] }));
    }
    return new TableRow({
      children: [
        new TableCell({ width: { size: 4200, type: WidthType.DXA }, shading: { fill: 'FAFAFA', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, borders: borders, children: children }),
        new TableCell({ width: { size: 1500, type: WidthType.DXA }, shading: { fill: pFill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, borders: borders, children: [new Paragraph({ children: [new TextRun({ text: action.priority || 'Medium', size: 20, bold: true, font: 'Arial', color: pText })] })] }),
        new TableCell({ width: { size: 1500, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, borders: borders, children: [new Paragraph({ children: [new TextRun({ text: action.dueDay || '', size: 20, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 1560, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, borders: borders, children: [new Paragraph({ children: [new TextRun({ text: action.owner || 'Owner', size: 20, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 600, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, borders: borders, children: [new Paragraph({ children: [new TextRun({ text: '\u2610', size: 22, font: 'Arial' })] })] })
      ]
    });
  }

  var monthLabels = { 1: 'Month 1 (Days 1\u201330)', 2: 'Month 2 (Days 31\u201360)', 3: 'Month 3 (Days 61\u201390)' };
  var opActions = content.operationalActions || [];

  var sections = [
    spacer(4),
    new Paragraph({ children: [new TextRun({ text: planData.businessName || '', bold: true, size: 52, color: BLUE, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
    new Paragraph({ children: [new TextRun({ text: 'OPERATIONAL PLAN & ACTION TRACKER', bold: true, size: 32, color: ORANGE, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { after: 160 } }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 1 } }, children: [new TextRun('')], spacing: { after: 200 } }),
    new Paragraph({ children: [new TextRun({ text: 'INTERNAL USE \u2014 Confidential', size: 22, color: '999999', italics: true, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
    new Paragraph({ children: [new TextRun({ text: today, size: 22, color: '999999', font: 'Arial' })], alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true }),
    heading1('About This Document'),
    new Paragraph({ children: [new TextRun({ text: 'This Operational Plan is an internal working document for ' + (planData.businessName || 'the business') + '. It translates the Strategic Business Plan into specific, trackable action items. Use this document to assign tasks, track progress and ensure goals are being actively worked towards.', size: 22, font: 'Arial', color: '333333' })], spacing: { after: 200 }, alignment: AlignmentType.JUSTIFIED }),
    new Paragraph({ children: [new TextRun({ text: 'Update the Status column and tick the checkbox as each item is completed. Review this plan monthly and adjust as needed.', size: 22, font: 'Arial', color: '666666', italics: true })], spacing: { after: 400 } }),
    spacer(2)
  ];

  for (var mi = 0; mi < opActions.length; mi++) {
    var monthObj = opActions[mi];
    var monthNum = monthObj.month || (mi + 1);
    var label = monthLabels[monthNum] || ('Month ' + monthNum);
    var actions = monthObj.actions || [];
    if (actions.length === 0) continue;

    sections.push(heading1(label));
    var rows = [headerRow()];
    for (var ai = 0; ai < actions.length; ai++) {
      rows.push(actionRow(actions[ai]));
    }
    sections.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [4200, 1500, 1500, 1560, 600],
      rows: rows
    }));
    sections.push(spacer(3));
  }

  var doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22, color: '333333' } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: sections }]
  });

  return await Packer.toBuffer(doc);
}

// ── MAIN HANDLER ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify JWT
  var authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  var token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised \u2014 missing bearer token' });

  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  var userRes = await supabase.auth.getUser(token);
  if (userRes.error || !userRes.data || !userRes.data.user) {
    console.error('[strategic-plan] Auth error:', userRes.error && userRes.error.message);
    return res.status(401).json({ error: 'Unauthorised \u2014 invalid token' });
  }
  var userId = userRes.data.user.id;

  var { planData, clContext, biInsights, cycleEndDate } = req.body;
  if (!planData) return res.status(400).json({ error: 'planData required' });

  var businessSlug = (planData.businessName || 'business').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  var timestamp = Date.now();

  try {
    // 1. Generate content with Claude
    console.log('[strategic-plan] Generating content for userId:', userId);
    var content = await generatePlanContent(planData, clContext, biInsights);

    // 2. Generate both Word docs in-process
    console.log('[strategic-plan] Generating Strategy doc...');
    var strategyBuffer = await generateStrategyDoc(planData, content);

    console.log('[strategic-plan] Generating Ops doc...');
    var opsBuffer = await generateOpsDoc(planData, content);

    // 3. Upload to Supabase Storage
    var strategyStoragePath = 'strategic-plans/' + userId + '/strategy-' + timestamp + '.docx';
    var opsStoragePath = 'strategic-plans/' + userId + '/ops-' + timestamp + '.docx';
    var docxContentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    var { error: e1 } = await supabase.storage
      .from('marketing-assets')
      .upload(strategyStoragePath, strategyBuffer, { contentType: docxContentType, upsert: true });
    if (e1) throw new Error('Strategy upload failed: ' + e1.message);

    var { error: e2 } = await supabase.storage
      .from('marketing-assets')
      .upload(opsStoragePath, opsBuffer, { contentType: docxContentType, upsert: true });
    if (e2) throw new Error('Ops upload failed: ' + e2.message);

    var strategyUrl = supabase.storage.from('marketing-assets').getPublicUrl(strategyStoragePath).data.publicUrl;
    var opsUrl = supabase.storage.from('marketing-assets').getPublicUrl(opsStoragePath).data.publicUrl;

    // 4. Write to content_library (Pattern B — tool-generated, always approved)
    var clRows = [
      {
        user_id: userId,
        title: (planData.businessName || 'Business') + ' \u2014 Strategic Business Plan',
        content_text: (content.executiveSummary || '').substring(0, 2000),
        file_url: strategyUrl,
        source: 'tool',
        tool_source: 'strategic-plan',
        source_ref: 'strategic-plan:strategy:' + userId + ':' + timestamp,
        status: 'approved',
        category: 'Strategic Plan',
        tool_tags: ['strategic-plan']
      },
      {
        user_id: userId,
        title: (planData.businessName || 'Business') + ' \u2014 Operational Plan',
        content_text: 'Operational plan with 90-day action tracker. ' + ((content.operationalActions || []).reduce(function(sum, m) { return sum + (m.actions || []).length; }, 0)) + ' action items.',
        file_url: opsUrl,
        source: 'tool',
        tool_source: 'strategic-plan',
        source_ref: 'strategic-plan:ops:' + userId + ':' + timestamp,
        status: 'approved',
        category: 'Strategic Plan',
        tool_tags: ['strategic-plan']
      }
    ];

    for (var ci = 0; ci < clRows.length; ci++) {
      var clRes = await supabase.from('content_library').upsert(clRows[ci], { onConflict: 'source_ref' });
      if (clRes.error) console.error('[strategic-plan] CL write error:', clRes.error.message);
    }

    // 5. Write to strategic_plans
    var swotData = content.__swotData || null;
    var planId = null;

    try {
      await supabase.from('strategic_plans').update({ is_current: false }).eq('user_id', userId);

      var { data: priorPlans } = await supabase
        .from('strategic_plans')
        .select('version')
        .eq('user_id', userId)
        .order('version', { ascending: false })
        .limit(1);
      var nextVersion = (priorPlans && priorPlans.length > 0) ? priorPlans[0].version + 1 : 1;

      var { data: planRow, error: planErr } = await supabase
        .from('strategic_plans')
        .insert({
          user_id: userId,
          version: nextVersion,
          is_current: true,
          plan_name: (planData.businessName || 'Plan') + ' v' + nextVersion,
          interview_data: planData,
          plan_data: content,
          swot_data: swotData,
          document_1_url: strategyUrl,
          document_2_url: opsUrl
        })
        .select('id')
        .single();

      if (!planErr && planRow) planId = planRow.id;
    } catch (e) {
      console.error('[strategic-plan] strategic_plans insert error:', e.message);
    }

    // 6. Create action_tracker rows (items jsonb structure)
    if (planId) {
      try {
        var opActions = content.operationalActions || [];
        var trackerRows = [];

        for (var mi = 0; mi < opActions.length; mi++) {
          var monthObj = opActions[mi];
          var monthNum = monthObj.month || (mi + 1);
          var actions = monthObj.actions || [];

          for (var ai = 0; ai < actions.length; ai++) {
            var action = actions[ai];
            var dayMatch = (action.dueDay || '').match(/\d+/);
            var dueOffset = dayMatch ? parseInt(dayMatch[0], 10) : null;

            trackerRows.push({
              user_id: userId,
              plan_id: planId,
              items: {
                title: action.title || '',
                status: 'pending',
                priority: action.priority || 'Medium',
                due_date: action.dueDay || '',
                notes: action.notes || '',
                owner: action.owner || 'Owner'
              },
              month_group: monthNum,
              due_day_offset: dueOffset,
              owner: action.owner || 'Owner',
              is_carried_forward: false
            });
          }
        }

        if (trackerRows.length > 0) {
          var trRes = await supabase.from('action_tracker').insert(trackerRows);
          if (trRes.error) console.error('[strategic-plan] action_tracker insert error:', trRes.error.message);
        }
      } catch (e) {
        console.error('[strategic-plan] action_tracker error:', e.message);
      }

      // Carry forward incomplete tasks from prior plan
      try {
        var { data: priorPlanRows } = await supabase
          .from('strategic_plans')
          .select('id')
          .eq('user_id', userId)
          .eq('is_current', false)
          .order('version', { ascending: false })
          .limit(1);

        if (priorPlanRows && priorPlanRows.length > 0) {
          var priorPlanId = priorPlanRows[0].id;
          var { data: incompleteRows } = await supabase
            .from('action_tracker')
            .select('items, month_group, due_day_offset, owner')
            .eq('plan_id', priorPlanId);

          if (incompleteRows && incompleteRows.length > 0) {
            var carried = incompleteRows
              .filter(function(r) { return r.items && r.items.status !== 'done'; })
              .map(function(r) {
                return {
                  user_id: userId,
                  plan_id: planId,
                  items: {
                    title: r.items.title || '',
                    status: 'pending',
                    priority: r.items.priority || 'Medium',
                    due_date: r.items.due_date || '',
                    notes: r.items.notes || '',
                    owner: r.items.owner || r.owner || ''
                  },
                  month_group: r.month_group,
                  due_day_offset: r.due_day_offset,
                  owner: r.owner || '',
                  is_carried_forward: true
                };
              });

            if (carried.length > 0) {
              await supabase.from('action_tracker').insert(carried);
            }
          }
        }
      } catch (e) {
        console.error('[strategic-plan] carry-forward error:', e.message);
      }
    }

    return res.status(200).json({ success: true, strategyUrl: strategyUrl, opsUrl: opsUrl, swotData: swotData, planId: planId });

  } catch (err) {
    console.error('[strategic-plan] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
