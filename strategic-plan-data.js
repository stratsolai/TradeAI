// strategic-plan-data.js
// Section definitions for the Strategic Plan & 90-Day Ops tool.
// Defines window.SP_SECTIONS — read by strategic-plan-logic.js to render the interview.
// To add, remove, or edit questions: edit this file only.
//
// Each field includes:
//   apiKey    — the property name the API expects in the planData payload
//   valueType — "string" | "array" | "number" (controls how collectSectionData builds the payload)
//   profileKey — column name in profiles table for prefill (single column)
//   profileKeys — array of column names for composite prefill (e.g. location from suburb + state)
//   fromProfile — true if this field is populated from Business Profile and should be read-only

window.SP_SECTIONS = [

  // -------------------------------------------------------------------------
  // SECTION 0 - Business Snapshot
  // -------------------------------------------------------------------------
  {
    id: 0,
    icon: "\u{1F4CB}",
    title: "1. Business Snapshot",
    subtitle: "These details come from your Business Profile. If anything needs updating, edit your Business Profile in the Content Library.",
    fields: [
      { id: "s0-business-name", apiKey: "businessName", valueType: "string", profileKey: "business_name", fromProfile: true, label: "Business Name", type: "text", required: true, placeholder: "e.g. Smith Plumbing Pty Ltd, Apex Legal Group, Chen Advisory" },
      { id: "s0-trading-name", apiKey: "tradingName", valueType: "string", profileKey: "trading_name", fromProfile: true, label: "Trading Name", labelHint: "(if different from legal name)", type: "text", required: false, placeholder: "e.g. Smith's Plumbing" },
      { id: "s0-abn", apiKey: "abn", valueType: "string", profileKey: "abn", fromProfile: true, label: "ABN", type: "text", required: false, placeholder: "e.g. 12 345 678 901" },
      { id: "s0-structure", apiKey: "structure", valueType: "string", profileKey: "business_structure", fromProfile: true, label: "Business Structure", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "Sole Trader", label: "Sole Trader" },{ value: "Partnership", label: "Partnership" },{ value: "Company", label: "Company" },{ value: "Trust", label: "Trust" },{ value: "Other", label: "Other" }] },
      { id: "s0-industry", apiKey: "industry", valueType: "string", profileKey: "industry", fromProfile: true, label: "Industry / Profession", type: "text", required: true, placeholder: "e.g. Plumbing, Commercial Law, Accounting & Advisory, Landscaping" },
      { id: "s0-years", apiKey: "yearsInBusiness", valueType: "number", profileKey: "years_in_business", fromProfile: true, label: "Years in Business", type: "text", required: false, placeholder: "e.g. 8" },
      { id: "s0-location", apiKey: "location", valueType: "string", profileKeys: ["address_suburb", "address_state"], fromProfile: true, label: "Location", type: "text", required: false, placeholder: "e.g. Melbourne, VIC" },
      { id: "s0-team-size", apiKey: "teamSize", valueType: "string", profileKey: "employee_range", fromProfile: true, label: "Team Size", type: "text", required: false, placeholder: "e.g. 4 or 2-5" },
      { id: "s0-licences", apiKey: "licences", valueType: "string", label: "Licences & Certifications", type: "text", required: false, placeholder: "e.g. A-Grade Electrician Licence, QBCC, Legal Practising Certificate" },
      { id: "s0-key-person", apiKey: "keyPersonDependency", valueType: "string", label: "Key Person Dependency", labelHint: "(optional)", type: "chip-single", group: "key-person-chips", required: false, helpText: "If you couldn't work for 2 weeks, what would happen to the business?", options: [{ value: "runs-fine", label: "Business keeps running" },{ value: "slows-down", label: "It would slow down" },{ value: "would-stop", label: "It would stop completely" }] }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 1 - What You Do & Who For
  // -------------------------------------------------------------------------
  {
    id: 1,
    icon: "\u{1F527}",
    title: "2. What You Do & Who For",
    subtitle: "Describe your services and customers. This is the heart of your business case.",
    fields: [
      { id: "s1-services", apiKey: "services", valueType: "string", profileKey: "services", fromProfile: true, label: "Core Services", labelHint: "(from your Business Profile)", type: "textarea", required: false, placeholder: "e.g. Residential plumbing repairs, commercial fit-outs, strategic advisory retainers, tax compliance and planning" },
      { id: "s1-products", apiKey: "products", valueType: "string", profileKey: "products", fromProfile: true, label: "Products Offered", labelHint: "(from your Business Profile, optional)", type: "textarea", required: false, placeholder: "e.g. Branded merchandise, custom fabrication, software licences" },
      { id: "s1-customers", apiKey: "targetCustomers", valueType: "array", label: "Target Customers", type: "chip-multi", group: "customer-chips", required: false, options: [{ value: "homeowners", label: "Homeowners" },{ value: "commercial", label: "Commercial" },{ value: "builders-devs", label: "Builders / Developers" },{ value: "industrial", label: "Industrial" },{ value: "strata", label: "Strata / Property Managers" },{ value: "retail-hosp", label: "Retail / Hospitality" },{ value: "corporate", label: "Corporate / Enterprise" },{ value: "government", label: "Government / Council" },{ value: "professional-svcs", label: "Professional Services" },{ value: "nfp", label: "Not-for-Profit / Community" }] },
      { id: "s1-service-area", apiKey: "serviceArea", valueType: "string", label: "Service Area", type: "text", required: false, placeholder: "e.g. All of Greater Melbourne, within 50km of Brisbane CBD, National" },
      { id: "s1-differentiators", apiKey: "differentiators", valueType: "string", profileKey: "marketing_theme_differentiators", fromProfile: true, label: "What makes you different from your competitors?", labelHint: "(from your Marketing Theme)", type: "textarea", required: false, placeholder: "e.g. 24/7 emergency service, 15+ years experience, fixed-fee engagements" },
      { id: "s1-competitors", apiKey: "competitors", valueType: "string", label: "Your top 3 competitors", labelHint: "(optional)", type: "text", required: false, placeholder: "e.g. Smith & Co, FastFix, MasterPlumb" },
      { id: "s1-best-service", apiKey: "mostProfitableService", valueType: "string", label: "Most profitable service or product", labelHint: "(optional)", type: "text", required: false, placeholder: "e.g. Emergency callouts, strategic advisory retainers" },
      { id: "s1-website", apiKey: "websiteUrl", valueType: "string", profileKey: "website_urls", fromProfile: true, label: "Website", labelHint: "(from your Business Profile)", type: "text", required: false, placeholder: "e.g. https://yoursite.com.au" }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 2 - Financial Health
  // -------------------------------------------------------------------------
  {
    id: 2,
    icon: "\u{1F4B0}",
    title: "3. Where You Are - Financial",
    subtitle: "This section is what banks and lenders focus on most. Approximate figures are fine - you are not being audited.",
    infoBox: "This information is used to build your financial overview section. It is stored securely and never shared. Approximate figures are completely fine.",
    fields: [
      { id: "s2-revenue", apiKey: "revenue", valueType: "string", label: "Approximate Annual Revenue", type: "select", required: false, options: [{ value: "", label: "Select range..." },{ value: "under-100k", label: "Under $100,000" },{ value: "100k-250k", label: "$100,000 to $250,000" },{ value: "250k-500k", label: "$250,000 to $500,000" },{ value: "500k-1m", label: "$500,000 to $1,000,000" },{ value: "1m-2m", label: "$1,000,000 to $2,000,000" },{ value: "over-2m", label: "Over $2,000,000" }] },
      { id: "s2-jobs-per-month", apiKey: "jobsPerMonth", valueType: "string", label: "Average Jobs / Clients Per Month", type: "text", required: false, placeholder: "e.g. 25" },
      { id: "s2-avg-job-value", apiKey: "avgJobValue", valueType: "string", label: "Average Job / Engagement Value", type: "text", required: false, placeholder: "e.g. $450, $2,500 to $5,000, $15,000 retainer" },
      { id: "s2-cost-categories", apiKey: "biggestCosts", valueType: "array", label: "Biggest Cost Categories", type: "chip-multi", group: "cost-chips", required: false, options: [{ value: "labour", label: "Labour / Wages" },{ value: "materials", label: "Materials" },{ value: "vehicles", label: "Vehicles" },{ value: "insurance", label: "Insurance" },{ value: "rent", label: "Rent / Premises" },{ value: "software", label: "Software & Tools" }] },
      { id: "s2-existing-finance", apiKey: "existingFinance", valueType: "string", label: "Current Finance / Loans", labelHint: "(optional)", type: "text", required: false, placeholder: "e.g. $45,000 vehicle loan, $20,000 equipment finance" },
      { id: "s2-payment-terms", apiKey: "avgPaymentTime", valueType: "string", label: "Average time customers take to pay", labelHint: "(optional)", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "same-day", label: "Same day" },{ value: "7-days", label: "Within 7 days" },{ value: "14-30-days", label: "14 to 30 days" },{ value: "30-plus-days", label: "30+ days" }] },
      { id: "s2-margin-awareness", apiKey: "grossMarginAwareness", valueType: "string", label: "Do you know your gross margin?", labelHint: "(optional)", type: "chip-single", group: "margin-chips", required: false, options: [{ value: "yes-clearly", label: "Yes, clearly" },{ value: "roughly", label: "Roughly" },{ value: "no", label: "No" }] },
      { id: "s2-plan-purpose", apiKey: "planPurpose", valueType: "array", label: "What is this plan being used for?", labelHint: "(optional)", type: "chip-multi", group: "plan-purpose", required: false, options: [{ value: "bank-lender", label: "Bank / Lender Application" },{ value: "internal", label: "Internal Business Planning" },{ value: "investor", label: "Investor / Partner" },{ value: "grant", label: "Grant Application" }] }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 3 - Goals & Growth
  // -------------------------------------------------------------------------
  {
    id: 3,
    icon: "\u{1F3AF}",
    title: "4. Where You Are Going - Goals",
    subtitle: "What does success look like for your business? This section shows lenders and partners that you have a clear direction.",
    fields: [
      { id: "s3-goals-1yr", apiKey: "goals1yr", valueType: "string", label: "12-Month Goals", labelHint: "(what do you want to achieve in the next year?)", type: "textarea", required: false, placeholder: "e.g. Grow revenue by 25%, hire a second staff member, launch a new service line" },
      { id: "s3-goals-3yr", apiKey: "goals3yr", valueType: "string", label: "3-Year Vision", labelHint: "(where do you want the business to be?)", type: "textarea", required: false, placeholder: "e.g. Have a team of 6, be the go-to provider in our area, achieve $1.5M revenue" },
      { id: "s3-investments", apiKey: "investments", valueType: "string", label: "Planned Major Purchases or Investments", labelHint: "(next 12 to 24 months)", type: "textarea", required: false, placeholder: "e.g. New work van, office fit-out, technology upgrade" },
      { id: "s3-hiring", apiKey: "hiringPlans", valueType: "array", label: "Hiring Plans", type: "chip-single", group: "hiring-chips", required: false, options: [{ value: "no-hiring", label: "No hiring planned" },{ value: "1-employee", label: "1 new employee" },{ value: "2-3-employees", label: "2 to 3 new employees" },{ value: "apprentice", label: "Taking on an apprentice" },{ value: "subcontractors", label: "Subcontractors only" }] },
      { id: "s3-marketing-budget", apiKey: "marketingBudget", valueType: "string", label: "Approximate monthly marketing budget", labelHint: "(optional)", type: "text", required: false, placeholder: "e.g. $500, Under $1,000, None currently" },
      { id: "s3-marketing-challenge", apiKey: "marketingChallenges", valueType: "array", label: "Biggest marketing challenge", labelHint: "(optional)", type: "chip-multi", group: "mktg-challenge-chips", required: false, options: [{ value: "getting-found", label: "Getting found online" },{ value: "referrals", label: "Getting referrals" },{ value: "standing-out", label: "Standing out from competitors" },{ value: "converting", label: "Converting enquiries" },{ value: "no-time", label: "No time for marketing" },{ value: "dont-know", label: "Don't know what works" }] }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 4 - Operations & Team
  // -------------------------------------------------------------------------
  {
    id: 4,
    icon: "\u2699",
    title: "5. How You Operate & Who Does What",
    subtitle: "How your business runs day-to-day. Shows you have a solid operational foundation.",
    fields: [
      { id: "s4-lead-sources", apiKey: "leadGeneration", valueType: "array", label: "How do you get most of your work?", labelHint: "(select all that apply)", type: "chip-multi", group: "lead-chips", required: false, options: [{ value: "word-of-mouth", label: "Word of mouth / referrals" },{ value: "google", label: "Google / online search" },{ value: "social", label: "Social media" },{ value: "builder-rels", label: "Builder / partner relationships" },{ value: "repeat", label: "Repeat customers" },{ value: "advertising", label: "Advertising / directories" }] },
      { id: "s4-suppliers", apiKey: "suppliers", valueType: "string", label: "Key Suppliers", labelHint: "(main material, service or equipment suppliers)", type: "text", required: false, placeholder: "e.g. Reece Plumbing, Tradelink, AWS, Microsoft" },
      { id: "s4-subcontractors", apiKey: "subcontractors", valueType: "string", label: "Do you use subcontractors?", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "no", label: "No - all work done in-house" },{ value: "occasionally", label: "Occasionally for specialist work" },{ value: "regularly", label: "Regularly for overflow or specialist trades" },{ value: "mostly", label: "Mostly subcontractors with minimal employees" }] },
      { id: "s4-technology", apiKey: "technology", valueType: "array", label: "Technology & Software Used", type: "chip-multi", group: "tech-chips", required: false, options: [{ value: "job-mgmt", label: "Job management app" },{ value: "accounting", label: "Accounting software" },{ value: "quoting", label: "Quoting software" },{ value: "staxai", label: "StaxAI" },{ value: "scheduling", label: "Scheduling software" },{ value: "crm", label: "CRM" },{ value: "none", label: "None currently" }] },
      { id: "s4-marketing", apiKey: "marketing", valueType: "string", label: "Marketing activities", labelHint: "(what you currently do)", type: "textarea", required: false, placeholder: "e.g. Google Business Profile, Facebook page, LinkedIn, email newsletter, networking events" },
      { id: "s4-key-roles", apiKey: "keyRoles", valueType: "array", label: "Key roles in your business", labelHint: "(optional)", type: "chip-multi", group: "roles-chips", required: false, options: [{ value: "just-me", label: "Just me" },{ value: "admin", label: "Admin" },{ value: "office-mgr", label: "Office manager" },{ value: "leading-hand", label: "Leading hand" },{ value: "project-mgr", label: "Project manager" },{ value: "estimator", label: "Estimator" },{ value: "biz-dev", label: "Business development" },{ value: "bookkeeper", label: "Bookkeeper" },{ value: "other", label: "Other" }] },
      { id: "s4-compliance", apiKey: "complianceActions", valueType: "string", label: "Compliance actions due in next 12 months", labelHint: "(optional)", type: "textarea", required: false, placeholder: "e.g. Renew public liability insurance, ASIC annual review, practising certificate renewal" }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 5 - Risk & Contingency
  // -------------------------------------------------------------------------
  {
    id: 5,
    icon: "\u{1F6E1}",
    title: "6. Risk & Contingency",
    subtitle: "Showing you have thought about risks and have a plan makes lenders much more comfortable. Be honest - no business is risk-free.",
    fields: [
      { id: "s5-risks", apiKey: "risks", valueType: "array", label: "Biggest Risks to Your Business", labelHint: "(select all that apply)", type: "chip-multi", group: "risk-chips", required: false, options: [{ value: "seasonal", label: "Seasonal slowdowns" },{ value: "key-person", label: "Key person risk" },{ value: "late-payments", label: "Late payments / bad debts" },{ value: "key-clients", label: "Dependence on a few key clients" },{ value: "material-costs", label: "Material cost increases" },{ value: "staff-shortage", label: "Staff availability / skills shortage" },{ value: "regulatory", label: "Regulatory / compliance changes" },{ value: "equipment", label: "Equipment breakdown" }] },
      { id: "s5-contingency", apiKey: "contingency", valueType: "string", label: "How would you handle a slow 3-month period?", type: "textarea", required: false, placeholder: "e.g. We have 3 months of operating costs in reserve, would reduce discretionary spending, activate referral campaigns" },
      { id: "s5-insurance", apiKey: "insurance", valueType: "array", label: "Insurance Coverage", labelHint: "(what you currently hold)", type: "chip-multi", group: "insurance-chips", required: false, options: [{ value: "public-liability", label: "Public Liability" },{ value: "tools-equipment", label: "Tools & Equipment" },{ value: "vehicle-fleet", label: "Vehicle / Fleet" },{ value: "workers-comp", label: "Workers Compensation" },{ value: "prof-indemnity", label: "Professional Indemnity" },{ value: "biz-interruption", label: "Business Interruption" }] },
      { id: "s5-additional", apiKey: "additionalInfo", valueType: "string", label: "Anything else you'd like the AI to consider about your business?", labelHint: "(optional)", type: "textarea", required: false, placeholder: "e.g. We are targeting a major contract in Q2, planning to open a second location, or facing a specific challenge you want the plan to address..." }
    ]
  }
];
