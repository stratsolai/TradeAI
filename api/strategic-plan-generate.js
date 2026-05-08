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
import { logAnthropicUsage } from '../lib/usage-logger.js';
import { applyToolOutputMatrix } from '../lib/cl-prompts.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── CLAUDE CONTENT GENERATOR ────────────────────────────────────────────────

function _arr(v) { return Array.isArray(v) ? v.join(', ') : (v || 'Not specified'); }

async function generatePlanContent(planData, clContext, biInsights, userId) {
  // SP/OT Rebuild Phase 3 \u2014 the prompt now produces a structured
  // plan suitable for the Review screen (spec \u00a76): one Executive
  // Summary, a SWOT array (max 10 words per point per spec \u00a76.4),
  // a category summary per category in the unified 7-category
  // structure, and a flat list of Goals tagged with their category.
  // Each Goal carries its own description and its tasks. The
  // legacy narrative sections (businessOverview, financialOverview,
  // etc.) are kept on the response so the Word doc generator \u2014
  // which still ships the same document layout \u2014 has its content,
  // and so existing approve / docx code paths are unchanged.
  var systemPrompt = 'You are an expert business plan writer specialising in Australian small and medium businesses.\n' +
    'Write professional, polished content suitable for banks, lenders, or investors.\n' +
    'Use plain language. Write in third person (e.g. "The business operates..." not "We operate...").\n' +
    'All content must be specific to the business data provided, not generic filler.\n' +
    'Return ONLY a JSON object \u2014 no markdown, no preamble.\n' +
    'If BI Intelligence Insights are provided, incorporate them into relevant sections. Do not fabricate insights.\n' +
    'Australian English (colour, organisation, recognised). No exclamation marks.\n' +
    'After the full content, append a JSON block delimited by ###SWOT_JSON_START### and ###SWOT_JSON_END### containing: {"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]}.';

  var userPrompt = 'Generate comprehensive business plan content for this business:\n\n' +
    'SECTION 1 \u2014 BUSINESS FOUNDATION:\n' +
    '- Business Name: ' + (planData.businessName || 'Not provided') + '\n' +
    '- Trading Name: ' + (planData.tradingName || 'Same as above') + '\n' +
    '- ABN: ' + (planData.abn || 'Not provided') + '\n' +
    '- Structure: ' + (planData.structure || 'Not specified') + '\n' +
    '- Industry: ' + (planData.industry || 'Not specified') + '\n' +
    '- Years operating: ' + (planData.yearsInBusiness || 'Not specified') + '\n' +
    '- Location: ' + (planData.location || 'Not specified') + '\n' +
    '- Team size: ' + (planData.teamSize || 'Not specified') + '\n' +
    '- Licences: ' + _arr(planData.licences) + '\n' +
    '- Mission: ' + (planData.missionStatement || 'Not provided') + '\n' +
    '- Vision: ' + (planData.visionStatement || 'Not provided') + '\n' +
    '- Core Values: ' + _arr(planData.coreValues) + '\n' +
    '- Key Person Dependency: ' + (planData.keyPersonDependency || 'Not provided') + '\n\n' +
    'SECTION 2 \u2014 PRODUCTS, SERVICES & CUSTOMERS:\n' +
    '- Services: ' + (planData.services || 'Not specified') + '\n' +
    '- Products: ' + (planData.products || 'Not specified') + '\n' +
    '- Target customers: ' + _arr(planData.targetCustomers) + '\n' +
    '- Service area: ' + _arr(planData.serviceArea) + '\n' +
    '- Pricing model: ' + _arr(planData.pricingModel) + '\n' +
    '- Avg job value: ' + (planData.avgJobValue || 'Not specified') + '\n' +
    '- Differentiators: ' + (planData.differentiators || 'Not specified') + '\n' +
    '- Most profitable service: ' + (planData.mostProfitableService || 'Not specified') + '\n\n' +
    'SECTION 3 \u2014 FINANCIAL POSITION:\n' +
    '- Annual revenue: ' + (planData.annualRevenue || 'Not specified') + '\n' +
    '- Revenue trend: ' + (planData.revenueTrend || 'Not specified') + '\n' +
    '- Gross margin: ' + (planData.grossMargin || 'Not specified') + '\n' +
    '- Net profit margin: ' + (planData.netProfitMargin || 'Not specified') + '\n' +
    '- Biggest costs: ' + _arr(planData.biggestCosts) + '\n' +
    '- Current finance: ' + (planData.currentFinance || 'None') + '\n' +
    '- Finance purpose: ' + _arr(planData.financePurpose) + '\n' +
    '- Avg payment time: ' + (planData.avgPaymentTime || 'Not specified') + '\n' +
    '- Plan purpose: ' + _arr(planData.planPurpose) + '\n\n' +
    'SECTION 4 \u2014 OPERATIONS & CAPACITY:\n' +
    '- Lead sources: ' + _arr(planData.leadSources) + '\n' +
    '- Lead conversion: ' + (planData.leadConversion || 'Not specified') + '\n' +
    '- Jobs/clients per month: ' + (planData.jobsPerMonth || 'Not specified') + '\n' +
    '- Capacity utilisation: ' + (planData.capacityUtilisation || 'Not specified') + '\n' +
    '- Key suppliers: ' + _arr(planData.keySuppliers) + '\n' +
    '- Supplier dependency: ' + (planData.supplierDependency || 'Not specified') + '\n' +
    '- Subcontractor use: ' + (planData.subcontractorUse || 'Not specified') + '\n' +
    '- Technology: ' + _arr(planData.technology) + '\n' +
    '- Technology maturity: ' + (planData.technologyMaturity || 'Not specified') + '\n' +
    '- Key roles: ' + _arr(planData.keyRoles) + '\n\n' +
    'SECTION 5 \u2014 MARKET & COMPETITION:\n' +
    '- Market position: ' + (planData.marketPosition || 'Not specified') + '\n' +
    '- Competitive advantage: ' + _arr(planData.competitiveAdvantage) + '\n' +
    '- Top competitors: ' + _arr(planData.topCompetitors) + '\n' +
    '- Competitor threat: ' + (planData.competitorThreatLevel || 'Not specified') + '\n' +
    '- Industry outlook: ' + (planData.industryOutlook || 'Not specified') + '\n' +
    '- Market trends: ' + _arr(planData.marketTrends) + '\n' +
    '- Regulatory environment: ' + (planData.regulatoryEnvironment || 'Not specified') + '\n' +
    '- Barriers to entry: ' + _arr(planData.barriersToEntry) + '\n\n' +
    'SECTION 6 \u2014 GROWTH & TRANSFORMATION:\n' +
    '- 12-month revenue target: ' + (planData.revenueTarget || 'Not specified') + '\n' +
    '- 12-month goals: ' + _arr(planData.goals12Month) + '\n' +
    '- 3-year vision: ' + _arr(planData.vision3Year) + '\n' +
    '- Growth strategies: ' + _arr(planData.growthStrategies) + '\n' +
    '- Geographic expansion: ' + (planData.geoExpansion || 'Not specified') + '\n' +
    '- Target expansion areas: ' + _arr(planData.targetExpansionAreas) + '\n' +
    '- New service lines: ' + (planData.newServiceLines || 'Not specified') + '\n' +
    '- Planned new products / services: ' + _arr(planData.plannedNewServices) + '\n' +
    '- Government tendering: ' + (planData.govTendering || 'Not specified') + '\n' +
    '- Digital transformation: ' + (planData.digitalTransformation || 'Not specified') + '\n' +
    '- Digital focus: ' + _arr(planData.digitalFocus) + '\n' +
    '- Process improvement: ' + (planData.processImprovement || 'Not specified') + '\n' +
    '- Hiring plans: ' + (planData.hiringPlans || 'Not specified') + '\n' +
    '- Planned investments: ' + _arr(planData.plannedInvestments) + '\n' +
    '- Investment budget: ' + (planData.investmentBudget || 'Not specified') + '\n' +
    '- Marketing budget: ' + (planData.marketingBudget || 'Not specified') + '\n' +
    '- Marketing challenges: ' + _arr(planData.marketingChallenges) + '\n\n' +
    'SECTION 7 \u2014 RISK & RESILIENCE:\n' +
    '- Compliance status: ' + (planData.complianceStatus || 'Not specified') + '\n' +
    '- Compliance calendar: ' + (planData.complianceCalendar || 'Not specified') + '\n' +
    '- Cash reserve: ' + (planData.cashReserve || 'Not specified') + '\n' +
    '- Revenue reliance on key customers: ' + (planData.revenueReliance || 'Not specified') + '\n' +
    '- Biggest risks: ' + _arr(planData.biggestRisks) + '\n' +
    '- Contingency planning: ' + (planData.contingencyPlanning || 'Not specified') + '\n' +
    '- Insurance: ' + _arr(planData.insuranceCoverage) + '\n' +
    '- Succession planning: ' + (planData.successionPlanning || 'Not specified') + '\n' +
    '- Exit timeline: ' + (planData.exitTimeline || 'Not specified') + '\n' +
    '- Exit strategy: ' + (planData.exitStrategy || 'Not specified') + '\n' +
    '- Additional context: ' + (planData.additionalContext || 'None') + '\n\n' +
    'Return this exact JSON structure:\n' +
    '{\n' +
    '  "executiveSummary": "3-4 paragraph executive summary suitable for a bank manager",\n' +
    '  "businessOverview": "2-3 paragraphs describing the business, its history and structure",\n' +
    '  "productsServices": "2-3 paragraphs describing services offered and target market",\n' +
    '  "marketAnalysis": "2-3 paragraphs on the market, competition and opportunity",\n' +
    '  "competitorAnalysis": "3-5 sentences positioning the business vs competitors",\n' +
    '  "swotAnalysis": "STRENGTHS\\n- point\\n...\\n\\nWEAKNESSES\\n- ...\\n\\nOPPORTUNITIES\\n- ...\\n\\nTHREATS\\n- ...",\n' +
    '  "swotPoints": {\n' +
    '    "strengths":     ["short point — max 10 words", "..."],\n' +
    '    "weaknesses":    ["short point — max 10 words", "..."],\n' +
    '    "opportunities": ["short point — max 10 words", "..."],\n' +
    '    "threats":       ["short point — max 10 words", "..."]\n' +
    '  },\n' +
    '  "marketingStrategy": "2 paragraphs on customer attraction and retention",\n' +
    '  "operationsOverview": "2 paragraphs on day-to-day operations",\n' +
    '  "managementTeam": "1-2 paragraphs on leadership and key personnel",\n' +
    '  "financialOverview": "2-3 paragraphs on revenue, costs and financial position",\n' +
    '  "growthStrategy": "2-3 paragraphs on 12-month and 3-year plans",\n' +
    '  "riskManagement": "2 paragraphs on identified risks and mitigation",\n' +
    '  "conclusion": "1 strong closing paragraph",\n' +
    '  "categorySummaries": {\n' +
    '    "financial":  "2-3 paragraphs of business context for the Financial category",\n' +
    '    "products":   "2-3 paragraphs of business context for the Products & Services category",\n' +
    '    "customers":  "2-3 paragraphs of business context for the Customers & Suppliers category",\n' +
    '    "operations": "2-3 paragraphs of business context for the Operations & Capacity category",\n' +
    '    "market":     "2-3 paragraphs of business context for the Market & Competition category",\n' +
    '    "growth":     "2-3 paragraphs of business context for the Growth & Transformation category",\n' +
    '    "risk":       "2-3 paragraphs of business context for the Risk & Resilience category"\n' +
    '  },\n' +
    '  "goals": [\n' +
    '    {\n' +
    '      "category": "growth",\n' +
    '      "title": "Goal name — short, action-oriented, max 60 chars",\n' +
    '      "description": "1-2 sentences explaining what success looks like for this goal",\n' +
    '      "tasks": [\n' +
    '        {\n' +
    '          "title": "Short action statement",\n' +
    '          "description": "Paragraph explaining what to do and why",\n' +
    '          "dueRelative": "Week 1" | "Week 2" | "Month 1" | "Month 2" | "Month 3",\n' +
    '          "priority": "High" | "Medium" | "Low",\n' +
    '          "owner": "Owner or role from keyRoles"\n' +
    '        }\n' +
    '      ]\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Today is ' + new Date().toISOString().substring(0, 10) + '.\n\n' +
    'INSTRUCTIONS FOR SWOT (spec §6.4):\n' +
    '- swotPoints must contain 3–5 items per quadrant.\n' +
    '- Each point is at most 10 words. Dot points only — no full sentences, no paragraphs, no trailing punctuation.\n' +
    '- swotAnalysis (the narrative version) is kept for the downloaded Word doc.\n\n' +
    'INSTRUCTIONS FOR CATEGORY SUMMARIES (spec §6.5):\n' +
    '- Provide a 2–3 paragraph summary for every one of the seven categories above.\n' +
    '- Each summary is read-only context for the user, drawn from the ingested data — interpret what the data says about that area of the business.\n' +
    '- Do not list the goals here; goals live separately in the goals array.\n\n' +
    'INSTRUCTIONS FOR GOALS (spec §6.5 / §6.6):\n' +
    '- Generate 8–14 Goals total, distributed across the seven categories. Every category must have at least one Goal unless the data genuinely doesn\'t support one.\n' +
    '- category MUST be exactly one of: financial, products, customers, operations, market, growth, risk.\n' +
    '- Each goal needs a title (short, max 60 chars), a 1–2 sentence description, and 2–5 tasks.\n' +
    '- Tasks use a relative timeframe in dueRelative — Week 1, Week 2, Week 3, Month 1, Month 2, Month 3. The actual calendar dates are computed at approval, not now.\n' +
    '- Each task carries its own short title and a paragraph description (the why + the what). Priority is High / Medium / Low. Owner defaults to "Owner" or maps to a role from keyRoles when relevant.\n' +
    '- Always include at least one Risk & Resilience goal that addresses a meaningful risk for this business, even if Risk & Resilience answers were sparse.';

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
      // Pinned at Sonnet 4.6's maximum output cap so the plan response
      // — 13 narrative sections, a SWOT JSON block, and up to 35
      // initiative sub-tasks — is never clipped mid-string. Truncation
      // surfaces below as JSON.parse(clean) throwing "Unterminated
      // string in JSON" and the user seeing a 500 on Generate My Plan.
      max_tokens: 64000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    var errText = await response.text().catch(function() { return ''; });
    throw new Error('Claude API error: ' + response.status + ' ' + errText.substring(0, 300));
  }

  var data = await response.json();
  logAnthropicUsage({ tool_id: 'strategic-plan', user_id: userId || null, model: 'claude-sonnet-4-6', usage: data && data.usage });
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

  var parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (parseErr) {
    // Almost always this means Claude's response hit the max_tokens cap
    // and the JSON ended mid-string. Log enough detail to confirm that
    // (response length + tail of the payload) so the next operator can
    // see at a glance whether to bump max_tokens or chase a different
    // cause, and surface a friendly message to the user.
    console.error('[SP] Failed to parse plan response JSON —',
      'parseError:', parseErr.message,
      'responseLength:', clean.length,
      'tail:', clean.slice(-200));
    throw new Error('Plan response was truncated — try regenerating');
  }
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
        new TableCell({ width: { size: 1500, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, borders: borders, children: [new Paragraph({ children: [new TextRun({ text: action.dueDate || action.dueDay || '', size: 20, font: 'Arial' })] })] }),
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

  var { planData, clContext, biInsights } = req.body;
  if (!planData) return res.status(400).json({ error: 'planData required' });

  var businessSlug = (planData.businessName || 'business').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  var timestamp = Date.now();

  try {
    // 1. Generate content with Claude
    console.log('[strategic-plan] Generating content for userId:', userId);
    var content = await generatePlanContent(planData, clContext, biInsights, userId);

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
      .from('cl-assets')
      .upload(strategyStoragePath, strategyBuffer, { contentType: docxContentType, upsert: true });
    if (e1) throw new Error('Strategy upload failed: ' + e1.message);

    var { error: e2 } = await supabase.storage
      .from('cl-assets')
      .upload(opsStoragePath, opsBuffer, { contentType: docxContentType, upsert: true });
    if (e2) throw new Error('Ops upload failed: ' + e2.message);

    var strategyUrl = supabase.storage.from('cl-assets').getPublicUrl(strategyStoragePath).data.publicUrl;
    var opsUrl = supabase.storage.from('cl-assets').getPublicUrl(opsStoragePath).data.publicUrl;

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
        tool_tags: applyToolOutputMatrix('strategic-plan')
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
        tool_tags: applyToolOutputMatrix('strategic-plan')
      }
    ];

    for (var ci = 0; ci < clRows.length; ci++) {
      var clRes = await supabase.from('content_library').upsert(clRows[ci], { onConflict: 'source_ref' });
      if (clRes.error) console.error('[strategic-plan] CL write error:', clRes.error.message);
    }

    // 5. Write to strategic_plans — include decisions tracking
    var swotData = content.__swotData || null;
    var planId = null;
    var decisions = planData._decisions || {};
    delete planData._decisions;
    var interviewDataWithDecisions = Object.assign({}, planData, { decisions: decisions });

    try {
      // Phase 3 — the new plan lands as pending_approval. The
      // existing current plan stays current until the owner clicks
      // Approve on the Review screen; the demote-old-current step
      // moves to api/strategic-plan-approve.js.
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
          is_current: false,
          status: 'pending_approval',
          plan_name: (planData.businessName || 'Plan') + ' v' + nextVersion,
          interview_data: interviewDataWithDecisions,
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

    // 6. Create hierarchical action_tracker rows (initiatives + sub-tasks)
    if (planId) {
      try {
        var initiatives = content.strategicInitiatives || [];
        // Fallback: if AI returned old operationalActions format, wrap them
        if (initiatives.length === 0 && content.operationalActions) {
          var opActions = content.operationalActions || [];
          for (var mi = 0; mi < opActions.length; mi++) {
            var monthObj = opActions[mi];
            var monthNum = monthObj.month || (mi + 1);
            initiatives.push({
              name: 'Month ' + monthNum + ' Actions',
              sp_section: 'growth_transformation',
              tasks: (monthObj.actions || [])
            });
          }
        }

        for (var ii = 0; ii < initiatives.length; ii++) {
          var init = initiatives[ii];
          // Create parent initiative row
          var { data: initRow, error: initErr } = await supabase
            .from('action_tracker')
            .insert({
              user_id: userId,
              plan_id: planId,
              items: { title: init.name || 'Initiative', status: 'pending' },
              initiative_name: init.name || 'Initiative',
              sp_section: init.sp_section || null,
              source: 'sp_generated',
              parent_task_id: null,
              owner: 'Owner',
              is_carried_forward: false,
              is_pending: true
            })
            .select('id')
            .single();

          if (initErr) { console.error('[strategic-plan] initiative insert error:', initErr.message); continue; }
          var parentId = initRow.id;

          // Create sub-task rows with absolute calendar dates
          var tasks = init.tasks || [];
          var genDate = new Date();
          var subRows = tasks.map(function(task) {
            var dueDate = task.dueDate || task.dueDay || '';
            // Convert relative "Day X" to absolute if AI used old format
            if (dueDate && /^Day\s*\d+$/i.test(dueDate)) {
              var dayNum = parseInt(dueDate.replace(/\D/g, ''), 10);
              var abs = new Date(genDate);
              abs.setDate(abs.getDate() + dayNum);
              dueDate = abs.toISOString().substring(0, 10);
            }
            return {
              user_id: userId,
              plan_id: planId,
              parent_task_id: parentId,
              items: {
                title: task.title || '',
                status: 'pending',
                priority: task.priority || 'Medium',
                due_date: dueDate,
                notes: task.notes || '',
                owner: task.owner || 'Owner'
              },
              owner: task.owner || 'Owner',
              source: 'sp_generated',
              is_carried_forward: false,
              is_pending: true
            };
          });

          if (subRows.length > 0) {
            var subRes = await supabase.from('action_tracker').insert(subRows);
            if (subRes.error) console.error('[strategic-plan] sub-task insert error:', subRes.error.message);
          }
        }
      } catch (e) {
        console.error('[strategic-plan] action_tracker error:', e.message);
      }

      // Carry forward incomplete sub-tasks from prior plan
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
            .select('items, month_group, due_day_offset, owner, parent_task_id, initiative_name, sp_section, source')
            .eq('plan_id', priorPlanId)
            .not('parent_task_id', 'is', null);

          if (incompleteRows && incompleteRows.length > 0) {
            var incomplete = incompleteRows.filter(function(r) { return r.items && r.items.status !== 'done'; });
            if (incomplete.length > 0) {
              // Create a "Carried Forward" initiative
              var { data: cfInit } = await supabase.from('action_tracker')
                .insert({
                  user_id: userId, plan_id: planId,
                  items: { title: 'Carried Forward Tasks', status: 'pending' },
                  initiative_name: 'Carried Forward Tasks',
                  sp_section: null, source: 'sp_generated',
                  parent_task_id: null, owner: 'Owner', is_carried_forward: true,
                  is_pending: true
                }).select('id').single();

              var cfParentId = cfInit ? cfInit.id : null;
              var carried = incomplete.map(function(r) {
                return {
                  user_id: userId, plan_id: planId,
                  parent_task_id: cfParentId,
                  items: {
                    title: r.items.title || '', status: 'pending',
                    priority: r.items.priority || 'Medium',
                    due_date: r.items.due_date || '',
                    notes: r.items.notes || '',
                    owner: r.items.owner || r.owner || ''
                  },
                  month_group: r.month_group, due_day_offset: r.due_day_offset,
                  owner: r.owner || '', source: r.source || 'sp_generated',
                  is_carried_forward: true,
                  is_pending: true
                };
              });
              await supabase.from('action_tracker').insert(carried);
            }
          }
        }
      } catch (e) {
        console.error('[strategic-plan] carry-forward error:', e.message);
      }
    }

    return res.status(200).json({
      success: true,
      planId: planId,
      status: 'pending_approval',
      strategyUrl: strategyUrl,
      opsUrl: opsUrl,
      swotData: swotData,
      planData: content
    });

  } catch (err) {
    console.error('[strategic-plan] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
