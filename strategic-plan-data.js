// strategic-plan-data.js
// Section definitions for the Strategic Plan tool (Redesign v1.0).
// Defines window.SP_SECTIONS — read by strategic-plan-logic.js to render the interview form.
// 7 sections aligned with strategic planning best practice.
//
// Each field includes:
//   apiKey    — the property name the API expects in the planData payload
//   valueType — "string" | "array" | "number" (controls how collectSectionData builds the payload)
//   profileKey — column name in profiles table for prefill (single column)
//   profileKeys — array of column names for composite prefill
//   fromProfile — true if populated from Business Profile (read-only)
//   fromBI — true if can be prefilled from BI context
//   isDecision — true if this field is a strategic decision tracked for BI contradiction detection
//   decisionId — key used in interview_data.decisions for tracking
//
// Field types:
//   text, textarea, select, chip-single, chip-multi
//   select-or-text — dropdown with an "Other" option that reveals a text input
//   chip-multi-text — chip-multi with allowOther for custom entries

window.SP_SECTIONS = [

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 1: Business Foundation
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 0,
    icon: "\u{1F3E2}",
    title: "1. Business Foundation",
    chipLabel: "Foundation",
    subtitle: "Legal details, structure, history, and team. Most of this is prefilled from your Business Profile.",
    fields: [
      { id: "s1-business-name", apiKey: "businessName", valueType: "string", profileKey: "business_name", fromProfile: true, label: "Business Name", type: "text", required: true, placeholder: "e.g. Smith Plumbing Pty Ltd" },
      { id: "s1-trading-name", apiKey: "tradingName", valueType: "string", profileKey: "trading_name", fromProfile: true, label: "Trading Name", labelHint: "(if different from legal name)", type: "text", required: false, placeholder: "e.g. Smith\u2019s Plumbing" },
      { id: "s1-abn", apiKey: "abn", valueType: "string", profileKey: "abn", fromProfile: true, label: "ABN", type: "text", required: false, placeholder: "e.g. 12 345 678 901" },
      { id: "s1-structure", apiKey: "structure", valueType: "string", profileKey: "business_structure", fromProfile: true, label: "Business Structure", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "Sole Trader", label: "Sole Trader" },{ value: "Partnership", label: "Partnership" },{ value: "Company", label: "Company" },{ value: "Trust", label: "Trust" },{ value: "Other", label: "Other" }] },
      { id: "s1-industry", apiKey: "industry", valueType: "array", profileKey: "industry", fromProfile: true, label: "Industry", type: "text", required: true, placeholder: "e.g. Plumbing, Commercial Law, Accounting" },
      { id: "s1-years", apiKey: "yearsInBusiness", valueType: "number", profileKey: "years_in_business", fromProfile: true, label: "Years in Business", type: "text", required: false, placeholder: "e.g. 8" },
      { id: "s1-location", apiKey: "location", valueType: "string", profileKeys: ["address_suburb", "address_state"], fromProfile: true, label: "Location", type: "text", required: false, placeholder: "e.g. Melbourne, VIC" },
      { id: "s1-team-size", apiKey: "teamSize", valueType: "string", profileKey: "employee_range", fromProfile: true, label: "Team Size", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "1", label: "1" },{ value: "2-5", label: "2-5" },{ value: "6-10", label: "6-10" },{ value: "11-20", label: "11-20" },{ value: "21-50", label: "21-50" },{ value: "50+", label: "50+" }] },
      { id: "s1-licences", apiKey: "licences", valueType: "array", profileKey: "licences", fromProfile: true, label: "Licences and Certifications", labelHint: "(from your Business Profile)", type: "readonly-pills", required: false, emptyHint: "No licences in your Business Profile yet." },
      { id: "s1-mission", apiKey: "missionStatement", valueType: "string", label: "Mission Statement", labelHint: "(optional)", type: "textarea", required: false, placeholder: "What is your business\u2019s core purpose?" },
      { id: "s1-vision", apiKey: "visionStatement", valueType: "string", label: "Vision Statement", labelHint: "(optional)", type: "textarea", required: false, placeholder: "Where do you want to be in 5-10 years?" },
      { id: "s1-values", apiKey: "coreValues", valueType: "array", label: "Core Values", type: "chip-multi", group: "values-chips", required: false, allowOther: true, options: [{ value: "quality", label: "Quality" },{ value: "integrity", label: "Integrity" },{ value: "customer-focus", label: "Customer Focus" },{ value: "innovation", label: "Innovation" },{ value: "safety", label: "Safety" },{ value: "reliability", label: "Reliability" },{ value: "sustainability", label: "Sustainability" }] },
      { id: "s1-key-person", apiKey: "keyPersonDependency", valueType: "string", label: "Key Person Dependency", type: "chip-single", group: "key-person-chips", required: false, helpText: "If you couldn\u2019t work for 2 weeks, what would happen to the business?", options: [{ value: "runs-fine", label: "Business Keeps Running" },{ value: "slows-down", label: "Would Slow Down" },{ value: "would-stop", label: "Would Stop Completely" }] }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 2: Products, Services & Customers
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 1,
    icon: "\u{1F527}",
    title: "2. Products, Services & Customers",
    chipLabel: "Products & Services",
    subtitle: "What you sell, who buys it, and how you price your work.",
    fields: [
      { id: "s2-services", apiKey: "services", valueType: "string", profileKey: "bp_services", fromProfile: true, profileTransform: "svc_list", label: "Core Services", labelHint: "(from your Business Profile)", type: "readonly-pills", required: false, emptyHint: "No services in your Business Profile yet." },
      { id: "s2-products", apiKey: "products", valueType: "string", profileKey: "bp_products", fromProfile: true, profileTransform: "svc_list", label: "Products Offered", labelHint: "(from your Business Profile)", type: "readonly-pills", required: false, emptyHint: "No products in your Business Profile yet." },
      { id: "s2-customers", apiKey: "targetCustomers", valueType: "array", label: "Target Customer Types", type: "chip-multi", group: "customer-chips", required: true, options: [{ value: "residential", label: "Residential" },{ value: "commercial", label: "Commercial" },{ value: "industrial", label: "Industrial" },{ value: "retail", label: "Retail" },{ value: "hospitality", label: "Hospitality" },{ value: "consumers", label: "Consumers" },{ value: "government", label: "Government" },{ value: "nfp", label: "Not-for-Profit" },{ value: "other-businesses", label: "Other Businesses" }], allowOther: true },
      { id: "s2-concentration", apiKey: "customerConcentration", valueType: "string", label: "Customer Concentration", fromBI: true, type: "select", required: false, helpText: "What percentage of your revenue comes from your single largest client?", options: [{ value: "", label: "Select..." },{ value: "diverse", label: "Diverse (Under 10%)" },{ value: "moderate", label: "Moderate (10-25%)" },{ value: "concentrated", label: "Concentrated (Over 25%)" },{ value: "highly-concentrated", label: "Highly Concentrated (Over 50%)" }] },
      { id: "s2-service-area", apiKey: "serviceArea", valueType: "array", profileKey: "service_area", fromProfile: true, label: "Service Area", type: "chip-multi", group: "area-chips", required: false, allowOther: true, options: [{ value: "local", label: "Local (Under 25km)" },{ value: "regional", label: "Regional (25-100km)" },{ value: "state-wide", label: "State-Wide" },{ value: "national", label: "National" },{ value: "international", label: "International" }] },
      { id: "s2-pricing", apiKey: "pricingModel", valueType: "array", label: "Pricing Model", type: "chip-multi", group: "pricing-chips", required: false, options: [{ value: "fixed-price", label: "Fixed Price" },{ value: "hourly", label: "Hourly" },{ value: "day-rate", label: "Day Rate" },{ value: "cost-plus", label: "Cost Plus" },{ value: "retainer", label: "Retainer" },{ value: "subscription", label: "Subscription" },{ value: "project-based", label: "Project-Based" }] },
      { id: "s2-avg-job", apiKey: "avgJobValue", valueType: "string", label: "Average Job/Engagement Value", fromBI: true, type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "under-500", label: "Under $500" },{ value: "500-1k", label: "$500-$1,000" },{ value: "1k-2.5k", label: "$1,000-$2,500" },{ value: "2.5k-5k", label: "$2,500-$5,000" },{ value: "5k-10k", label: "$5,000-$10,000" },{ value: "10k-25k", label: "$10,000-$25,000" },{ value: "25k-50k", label: "$25,000-$50,000" },{ value: "50k+", label: "$50,000+" }] },
      { id: "s2-differentiators", apiKey: "differentiators", valueType: "string", profileKey: "marketing_theme_differentiators", fromProfile: true, label: "What Makes You Different?", labelHint: "(from your Business Profile)", type: "textarea", required: false, placeholder: "e.g. 24/7 emergency service, 15+ years experience" },
      { id: "s2-most-profitable", apiKey: "mostProfitableService", valueType: "string", label: "Most Profitable Service", labelHint: "(optional)", type: "text", required: false, placeholder: "e.g. Emergency callouts, advisory retainers" }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 3: Financial Position
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 2,
    icon: "\u{1F4B0}",
    title: "3. Financial Position",
    chipLabel: "Financial Position",
    subtitle: "Revenue, costs, margins, and cash flow. Approximate figures are fine.",
    infoBox: "This information builds your financial overview section. It is stored securely and never shared. If your accounting system is connected, some fields may be prefilled but can still be amended.",
    fields: [
      { id: "s3-revenue", apiKey: "annualRevenue", valueType: "string", label: "Annual Revenue", fromBI: true, type: "select", required: true, options: [{ value: "", label: "Select range..." },{ value: "under-100k", label: "Under $100K" },{ value: "100k-250k", label: "$100K-$250K" },{ value: "250k-500k", label: "$250K-$500K" },{ value: "500k-1m", label: "$500K-$1M" },{ value: "1m-2m", label: "$1M-$2M" },{ value: "2m-5m", label: "$2M-$5M" },{ value: "5m+", label: "$5M+" }] },
      { id: "s3-revenue-trend", apiKey: "revenueTrend", valueType: "string", label: "Revenue Trend", fromBI: true, type: "chip-single", group: "rev-trend-chips", required: false, options: [{ value: "growing-strongly", label: "Growing Strongly (Over 20%)" },{ value: "growing", label: "Growing (5-20%)" },{ value: "stable", label: "Stable" },{ value: "declining", label: "Declining" }] },
      { id: "s3-gross-margin", apiKey: "grossMargin", valueType: "string", label: "Gross Margin", fromBI: true, type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "under-10", label: "Under 10%" },{ value: "10-20", label: "10-20%" },{ value: "20-30", label: "20-30%" },{ value: "30-40", label: "30-40%" },{ value: "40-50", label: "40-50%" },{ value: "50+", label: "50%+" },{ value: "dont-know", label: "Don\u2019t Know" }] },
      { id: "s3-net-margin", apiKey: "netProfitMargin", valueType: "string", label: "Net Profit Margin", fromBI: true, type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "loss", label: "Loss-Making" },{ value: "break-even", label: "Break-Even" },{ value: "1-5", label: "1-5%" },{ value: "5-10", label: "5-10%" },{ value: "10-15", label: "10-15%" },{ value: "15-20", label: "15-20%" },{ value: "20+", label: "20%+" },{ value: "dont-know", label: "Don\u2019t Know" }] },
      { id: "s3-cash", apiKey: "cashPosition", valueType: "string", label: "Cash Position", fromBI: true, type: "chip-single", group: "cash-chips", required: false, options: [{ value: "tight", label: "Tight (Under 1 Month)" },{ value: "adequate", label: "Adequate (1-3 Months)" },{ value: "comfortable", label: "Comfortable (3-6 Months)" },{ value: "strong", label: "Strong (6+ Months)" }] },
      { id: "s3-costs", apiKey: "biggestCosts", valueType: "array", label: "Biggest Cost Categories", type: "chip-multi", group: "cost-chips", required: false, allowOther: true, options: [{ value: "labour", label: "Labour" },{ value: "materials", label: "Materials" },{ value: "subcontractors", label: "Subcontractors" },{ value: "occupancy", label: "Occupancy" },{ value: "utilities", label: "Utilities" },{ value: "equipment", label: "Equipment" },{ value: "vehicles", label: "Vehicles" },{ value: "insurance", label: "Insurance" },{ value: "prof-services", label: "Professional Services" },{ value: "software", label: "Software" },{ value: "marketing", label: "Marketing" },{ value: "inventory", label: "Inventory" }] },
      { id: "s3-finance", apiKey: "currentFinance", valueType: "string", label: "Current Finance/Loans", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "none", label: "None" },{ value: "under-25k", label: "Under $25K" },{ value: "25k-50k", label: "$25K-$50K" },{ value: "50k-100k", label: "$50K-$100K" },{ value: "100k-250k", label: "$100K-$250K" },{ value: "250k-500k", label: "$250K-$500K" },{ value: "500k+", label: "$500K+" }] },
      { id: "s3-finance-purpose", apiKey: "financePurpose", valueType: "array", label: "Finance Purpose", type: "chip-multi", group: "fin-purpose-chips", required: false, options: [{ value: "vehicles", label: "Vehicles" },{ value: "equipment", label: "Equipment" },{ value: "property", label: "Property" },{ value: "working-capital", label: "Working Capital" },{ value: "expansion", label: "Expansion" }], allowOther: true },
      { id: "s3-payment-time", apiKey: "avgPaymentTime", valueType: "string", label: "Average Time Customers Take to Pay", fromBI: true, type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "same-day", label: "Same Day" },{ value: "7-days", label: "Within 7 Days" },{ value: "14-30-days", label: "14-30 Days" },{ value: "30-60-days", label: "30-60 Days" },{ value: "60+-days", label: "60+ Days" }] },
      { id: "s3-plan-purpose", apiKey: "planPurpose", valueType: "array", label: "Plan Purpose", labelHint: "(what is this plan being used for?)", type: "chip-multi", group: "plan-purpose-chips", required: false, options: [{ value: "internal", label: "Internal Planning" },{ value: "bank-lender", label: "Bank/Lender" },{ value: "investor", label: "Investor/Partner" },{ value: "grant", label: "Grant Application" },{ value: "sale", label: "Business Sale" }], allowOther: true }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 4: Operations & Capacity
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 3,
    icon: "\u2699",
    title: "4. Operations & Capacity",
    chipLabel: "Operations & Capacity",
    subtitle: "How work gets done, your team, technology, suppliers, and constraints.",
    fields: [
      { id: "s4-lead-sources", apiKey: "leadSources", valueType: "array", label: "How Do You Get Most Work?", type: "chip-multi", group: "lead-chips", required: false, allowOther: true, options: [{ value: "word-of-mouth", label: "Word of Mouth" },{ value: "industry-referrals", label: "Industry Referrals" },{ value: "repeat", label: "Repeat Customers" },{ value: "google", label: "Google/Search" },{ value: "social-media", label: "Social Media" },{ value: "website", label: "Website" },{ value: "advertising", label: "Advertising" },{ value: "tenders", label: "Tenders" },{ value: "commercial-contracts", label: "Commercial Contracts" }] },
      { id: "s4-conversion", apiKey: "leadConversion", valueType: "string", label: "Lead Conversion", fromBI: true, type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "excellent", label: "Excellent (Over 60%)" },{ value: "good", label: "Good (40-60%)" },{ value: "average", label: "Average (25-40%)" },{ value: "below-average", label: "Below Average (Under 25%)" },{ value: "dont-track", label: "Don\u2019t Track" }] },
      { id: "s4-jobs-month", apiKey: "jobsPerMonth", valueType: "string", label: "Jobs/Clients per Month", fromBI: true, type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "1-5", label: "1-5" },{ value: "6-10", label: "6-10" },{ value: "11-20", label: "11-20" },{ value: "21-50", label: "21-50" },{ value: "51-100", label: "51-100" },{ value: "100+", label: "100+" }] },
      { id: "s4-capacity", apiKey: "capacityUtilisation", valueType: "string", label: "Capacity Utilisation", type: "chip-single", group: "capacity-chips", required: false, options: [{ value: "underutilised", label: "Underutilised (Under 50%)" },{ value: "moderate", label: "Moderate (50-75%)" },{ value: "good", label: "Good (75-90%)" },{ value: "at-capacity", label: "At Capacity (Over 90%)" },{ value: "overloaded", label: "Overloaded" }] },
      { id: "s4-suppliers", apiKey: "keySuppliers", valueType: "array", label: "Key Suppliers", type: "chip-multi", group: "suppliers-chips", required: false, allowOther: true, options: [] },
      { id: "s4-supplier-dep", apiKey: "supplierDependency", valueType: "string", label: "Supplier Dependency", type: "chip-single", group: "supplier-dep-chips", required: false, options: [{ value: "diverse", label: "Diverse (Many Options)" },{ value: "moderate", label: "Moderate (Few Key)" },{ value: "concentrated", label: "Concentrated (1-2 Critical)" }] },
      { id: "s4-subcontractors", apiKey: "subcontractorUse", valueType: "string", label: "Subcontractor Use", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "none", label: "No Subcontractors" },{ value: "occasionally", label: "Occasionally" },{ value: "regularly", label: "Regularly for Overflow" },{ value: "primarily", label: "Primarily Subcontractor Model" }] },
      { id: "s4-technology", apiKey: "technology", valueType: "array", label: "Technology and Software", type: "chip-multi", group: "tech-chips", required: false, allowOther: true, options: [{ value: "accounting", label: "Accounting" },{ value: "job-mgmt", label: "Job Management" },{ value: "quoting", label: "Quoting" },{ value: "crm", label: "CRM" },{ value: "scheduling", label: "Scheduling" },{ value: "project-mgmt", label: "Project Management" },{ value: "time-tracking", label: "Time Tracking" },{ value: "inventory-mgmt", label: "Inventory Management" },{ value: "fleet-tracking", label: "Fleet/Vehicle Tracking" },{ value: "design-cad", label: "Design/CAD" },{ value: "staxai", label: "StaxAI" },{ value: "none", label: "None" }] },
      { id: "s4-tech-maturity", apiKey: "technologyMaturity", valueType: "string", label: "Technology Maturity", type: "chip-single", group: "tech-maturity-chips", required: false, options: [{ value: "paper-based", label: "Paper-Based" },{ value: "basic-digital", label: "Basic Digital" },{ value: "integrated", label: "Integrated Systems" },{ value: "advanced", label: "Advanced/Automated" }] },
      { id: "s4-key-roles", apiKey: "keyRoles", valueType: "array", label: "Key Roles", type: "chip-multi", group: "roles-chips", required: false, allowOther: true, options: [{ value: "just-me", label: "Just Me" },{ value: "admin", label: "Admin" },{ value: "office-mgr", label: "Office Manager" },{ value: "accountant", label: "Accountant" },{ value: "biz-dev", label: "Business Development" },{ value: "marketing", label: "Marketing" },{ value: "ops-mgr", label: "Operations Manager" },{ value: "project-mgr", label: "Project Manager" },{ value: "team-leader", label: "Team Leader" },{ value: "technician", label: "Technician/Specialist" },{ value: "customer-service", label: "Customer Service" },{ value: "apprentice", label: "Apprentice/Trainee" }] },
      { id: "s4-compliance", apiKey: "complianceActions", valueType: "array", label: "Compliance Actions Due", type: "chip-multi", group: "compliance-chips", required: false, allowOther: true, options: [{ value: "licence-renewal", label: "Licence Renewal" },{ value: "insurance-renewal", label: "Insurance Renewal" },{ value: "asic-review", label: "ASIC Review" },{ value: "bas-tax", label: "BAS/Tax" },{ value: "cert-renewal", label: "Certification Renewal" },{ value: "safety-audit", label: "Safety Audit" }] }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 5: Market & Competition
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 4,
    icon: "\u{1F4CA}",
    title: "5. Market & Competition",
    chipLabel: "Market & Competition",
    subtitle: "Your competitors, market position, industry trends, and regulatory environment.",
    fields: [
      { id: "s5-market-position", apiKey: "marketPosition", valueType: "string", label: "Market Position", type: "chip-single", group: "market-pos-chips", required: false, options: [{ value: "leader", label: "Market Leader" },{ value: "strong", label: "Strong Competitor" },{ value: "established", label: "Established Player" },{ value: "challenger", label: "Growing Challenger" },{ value: "new-entrant", label: "New Entrant" }] },
      { id: "s5-competitive-adv", apiKey: "competitiveAdvantage", valueType: "array", label: "Competitive Advantage", type: "chip-multi", group: "comp-adv-chips", required: false, allowOther: true, options: [{ value: "price", label: "Price/Value" },{ value: "quality", label: "Quality" },{ value: "speed", label: "Speed" },{ value: "service", label: "Customer Service" },{ value: "expertise", label: "Expertise" },{ value: "reputation", label: "Reputation" },{ value: "range", label: "Range" },{ value: "location", label: "Location" },{ value: "technology", label: "Technology" }] },
      { id: "s5-competitors", apiKey: "topCompetitors", valueType: "string", label: "Top Competitors", labelHint: "(list 3-5 main competitors)", type: "textarea", required: false, placeholder: "e.g. Smith & Co, FastFix, MasterPlumb" },
      { id: "s5-threat-level", apiKey: "competitorThreatLevel", valueType: "string", label: "Competitor Threat Level", type: "chip-single", group: "threat-chips", required: false, options: [{ value: "low", label: "Low (Little Competition)" },{ value: "moderate", label: "Moderate" },{ value: "high", label: "High (Aggressive)" },{ value: "intense", label: "Intense (Price Wars)" }] },
      { id: "s5-industry-outlook", apiKey: "industryOutlook", valueType: "string", label: "Industry Outlook", fromBI: true, type: "chip-single", group: "outlook-chips", required: false, options: [{ value: "strong-growth", label: "Strong Growth" },{ value: "moderate-growth", label: "Moderate Growth" },{ value: "stable", label: "Stable" },{ value: "declining", label: "Declining" },{ value: "uncertain", label: "Uncertain" }] },
      { id: "s5-market-trends", apiKey: "marketTrends", valueType: "array", label: "Market Trends", fromBI: true, type: "chip-multi", group: "trends-chips", required: false, allowOther: true, options: [{ value: "digital-transform", label: "Digital Transformation" },{ value: "sustainability", label: "Sustainability" },{ value: "consolidation", label: "Consolidation" },{ value: "skills-shortage", label: "Skills Shortage" },{ value: "regulation", label: "Regulation Changes" },{ value: "material-costs", label: "Material Costs" },{ value: "customer-expect", label: "Customer Expectations" },{ value: "new-tech", label: "New Technology" }] },
      { id: "s5-regulatory", apiKey: "regulatoryEnvironment", valueType: "string", label: "Regulatory Environment", type: "chip-single", group: "regulatory-chips", required: false, options: [{ value: "light", label: "Light Regulation" },{ value: "moderate", label: "Moderate" },{ value: "heavy", label: "Heavy" },{ value: "increasing", label: "Increasing" }] },
      { id: "s5-barriers", apiKey: "barriersToEntry", valueType: "array", label: "Barriers to Entry", type: "chip-multi", group: "barriers-chips", required: false, allowOther: true, options: [{ value: "licencing", label: "Licencing" },{ value: "capital", label: "Capital" },{ value: "expertise", label: "Expertise" },{ value: "relationships", label: "Relationships" },{ value: "reputation", label: "Reputation" },{ value: "location", label: "Location" },{ value: "none", label: "None Significant" }] }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 6: Growth & Transformation
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 5,
    icon: "\u{1F680}",
    title: "6. Growth & Transformation",
    chipLabel: "Growth & Transformation",
    subtitle: "Goals, expansion plans, digital transformation, and process improvement. Your answers here drive your Operational Plan initiatives.",
    fields: [
      { id: "s6-revenue-target", apiKey: "revenueTarget", valueType: "string", label: "12-Month Revenue Target", type: "select", required: false, isDecision: true, decisionId: "revenue_target", options: [{ value: "", label: "Select..." },{ value: "maintain", label: "Maintain Current" },{ value: "grow-1-10", label: "Grow 1-10%" },{ value: "grow-10-25", label: "Grow 10-25%" },{ value: "grow-25-50", label: "Grow 25-50%" },{ value: "grow-50+", label: "Grow 50%+" },{ value: "reduce", label: "Reduce/Consolidate" }] },
      { id: "s6-goals-12m", apiKey: "goals12Month", valueType: "string", label: "12-Month Goals", type: "textarea", required: false, placeholder: "Key objectives for the next year" },
      { id: "s6-vision-3yr", apiKey: "vision3Year", valueType: "string", label: "3-Year Vision", type: "textarea", required: false, placeholder: "Where do you want the business to be?" },
      { id: "s6-growth-strategies", apiKey: "growthStrategies", valueType: "array", label: "Growth Strategies", type: "chip-multi", group: "growth-chips", required: false, allowOther: true, isDecision: true, decisionId: "growth_strategies", options: [{ value: "geo-expansion", label: "Geographic Expansion" },{ value: "new-services", label: "New Service Lines" },{ value: "digital-transform", label: "Digital Transformation" },{ value: "gov-tendering", label: "Government/Council Tendering" },{ value: "partnerships", label: "Strategic Partnerships" },{ value: "acquisition", label: "Acquisition of Competitors" },{ value: "ecommerce", label: "Online/E-Commerce Channel" },{ value: "franchising", label: "Franchising or Licensing" },{ value: "vertical-integration", label: "Vertical Integration" },{ value: "maintenance-contracts", label: "Maintenance Contracts" },{ value: "commercial-expansion", label: "Commercial Work Expansion" },{ value: "strata-contracts", label: "Strata/Body Corporate" },{ value: "builder-partnerships", label: "Builder Partnerships" },{ value: "emergency-services", label: "Emergency Services" },{ value: "productised", label: "Productised Services" },{ value: "retainer-model", label: "Retainer Model" },{ value: "niche-specialisation", label: "Niche Specialisation" }] },
      { id: "s6-geo-expansion", apiKey: "geoExpansion", valueType: "string", label: "Geographic Expansion", type: "chip-single", group: "geo-chips", required: false, isDecision: true, decisionId: "geo_expansion", options: [{ value: "not_interested", label: "Not Interested" },{ value: "considering", label: "Considering" },{ value: "pursuing", label: "Actively Pursuing" },{ value: "expanding", label: "Currently Expanding" }] },
      { id: "s6-geo-areas", apiKey: "targetExpansionAreas", valueType: "string", label: "Target Expansion Areas", labelHint: "(if expanding)", type: "text", required: false, placeholder: "e.g. Western suburbs, Gold Coast" },
      { id: "s6-new-services", apiKey: "newServiceLines", valueType: "string", label: "New Service Lines", type: "chip-single", group: "new-svc-chips", required: false, isDecision: true, decisionId: "new_services", options: [{ value: "not_interested", label: "Not Interested" },{ value: "considering", label: "Considering" },{ value: "pursuing", label: "Actively Pursuing" },{ value: "launched", label: "Recently Launched" }] },
      { id: "s6-planned-services", apiKey: "plannedNewServices", valueType: "string", label: "Planned New Services", labelHint: "(if pursuing)", type: "text", required: false, placeholder: "e.g. Solar installation, business advisory" },
      { id: "s6-gov-tendering", apiKey: "govTendering", valueType: "string", label: "Government/Council Tendering", type: "chip-single", group: "gov-chips", required: false, isDecision: true, decisionId: "gov_tendering", options: [{ value: "not_interested", label: "Not Interested" },{ value: "considering", label: "Considering" },{ value: "occasional", label: "Occasionally Tender" },{ value: "regular", label: "Regular Tender Activity" }] },
      { id: "s6-digital", apiKey: "digitalTransformation", valueType: "string", label: "Digital Transformation", type: "chip-single", group: "digital-chips", required: false, isDecision: true, decisionId: "digital_transform", options: [{ value: "not_interested", label: "Not Interested" },{ value: "considering", label: "Considering" },{ value: "in_progress", label: "In Progress" },{ value: "advanced", label: "Advanced" }] },
      { id: "s6-digital-focus", apiKey: "digitalFocus", valueType: "array", label: "Digital Transformation Focus", type: "chip-multi", group: "digital-focus-chips", required: false, allowOther: true, options: [{ value: "job-mgmt", label: "Job Management" },{ value: "quoting-invoicing", label: "Quoting/Invoicing" },{ value: "customer-comms", label: "Customer Communication" },{ value: "marketing", label: "Marketing" },{ value: "reporting", label: "Reporting" },{ value: "process-auto", label: "Process Automation" }] },
      { id: "s6-process", apiKey: "processImprovement", valueType: "string", label: "Process Improvement", type: "chip-single", group: "process-chips", required: false, isDecision: true, decisionId: "process_improve", options: [{ value: "not_priority", label: "Not a Priority" },{ value: "considering", label: "Considering" },{ value: "improving", label: "Actively Improving" },{ value: "continuous", label: "Continuous Improvement" }] },
      { id: "s6-hiring", apiKey: "hiringPlans", valueType: "string", label: "Hiring Plans (12 Months)", type: "chip-single", group: "hiring-chips", required: false, isDecision: true, decisionId: "hiring", options: [{ value: "no_hiring", label: "No Hiring" },{ value: "one", label: "1 Employee" },{ value: "two_three", label: "2-3 Employees" },{ value: "apprentice", label: "Apprentice" },{ value: "subcontractors", label: "Subcontractors Only" },{ value: "significant", label: "Significant Expansion" }] },
      { id: "s6-investments", apiKey: "plannedInvestments", valueType: "array", label: "Planned Investments", type: "chip-multi", group: "invest-chips", required: false, isDecision: true, decisionId: "investments", options: [{ value: "vehicles", label: "Vehicles" },{ value: "equipment", label: "Equipment" },{ value: "technology", label: "Technology" },{ value: "property", label: "Property" },{ value: "training", label: "Training" },{ value: "marketing", label: "Marketing" },{ value: "none", label: "None" }], allowOther: true },
      { id: "s6-invest-budget", apiKey: "investmentBudget", valueType: "string", label: "Investment Budget", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "under-10k", label: "Under $10K" },{ value: "10k-25k", label: "$10K-$25K" },{ value: "25k-50k", label: "$25K-$50K" },{ value: "50k-100k", label: "$50K-$100K" },{ value: "100k+", label: "$100K+" },{ value: "not-determined", label: "Not Determined" }] },
      { id: "s6-marketing-budget", apiKey: "marketingBudget", valueType: "string", label: "Marketing Budget (Monthly)", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "none", label: "None" },{ value: "under-500", label: "Under $500" },{ value: "500-1k", label: "$500-$1,000" },{ value: "1k-2k", label: "$1,000-$2,000" },{ value: "2k-5k", label: "$2,000-$5,000" },{ value: "5k+", label: "$5,000+" }] },
      { id: "s6-marketing-challenges", apiKey: "marketingChallenges", valueType: "array", label: "Marketing Challenges", type: "chip-multi", group: "mktg-chips", required: false, allowOther: true, options: [{ value: "found-online", label: "Getting Found Online" },{ value: "referrals", label: "Getting Referrals" },{ value: "standing-out", label: "Standing Out" },{ value: "converting", label: "Converting Enquiries" },{ value: "no-time", label: "No Time" },{ value: "dont-know", label: "Don\u2019t Know What Works" }] }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 7: Risk & Resilience
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 6,
    icon: "\u{1F6E1}",
    title: "7. Risk & Resilience",
    chipLabel: "Risk & Resilience",
    subtitle: "Business risks, insurance, compliance, contingency, and succession planning.",
    fields: [
      { id: "s7-risks", apiKey: "biggestRisks", valueType: "array", label: "Biggest Business Risks", type: "chip-multi", group: "risk-chips", required: false, allowOther: true, options: [{ value: "seasonal", label: "Seasonal Slowdowns" },{ value: "key-person", label: "Key Person Dependency" },{ value: "late-payments", label: "Late Payments / Bad Debts" },{ value: "client-concentration", label: "Customer Concentration" },{ value: "material-costs", label: "Material Cost Increases" },{ value: "staff-shortage", label: "Staff Availability" },{ value: "regulatory", label: "Regulatory Changes" },{ value: "equipment", label: "Equipment Breakdown" },{ value: "economic-downturn", label: "Economic Downturn" },{ value: "competition", label: "Competition" },{ value: "tech-disruption", label: "Technology Disruption" },{ value: "reputational", label: "Reputational Risk" }] },
      { id: "s7-contingency", apiKey: "contingencyPlanning", valueType: "string", label: "Contingency Planning", type: "chip-single", group: "contingency-chips", required: false, options: [{ value: "no-plan", label: "No Plan" },{ value: "basic", label: "Basic Plan" },{ value: "documented", label: "Documented Plan" },{ value: "tested", label: "Tested Plan" }] },
      { id: "s7-cash-reserve", apiKey: "cashReserve", valueType: "string", label: "Cash Reserve", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "none", label: "None" },{ value: "1-month", label: "1 Month" },{ value: "2-3-months", label: "2-3 Months" },{ value: "3-6-months", label: "3-6 Months" },{ value: "6+-months", label: "6+ Months" }] },
      { id: "s7-insurance", apiKey: "insuranceCoverage", valueType: "array", label: "Insurance Coverage", type: "chip-multi", group: "insurance-chips", required: false, allowOther: true, options: [{ value: "public-liability", label: "Public Liability" },{ value: "tools-equipment", label: "Tools & Equipment" },{ value: "vehicle-fleet", label: "Vehicle/Fleet" },{ value: "workers-comp", label: "Workers Comp" },{ value: "prof-indemnity", label: "Professional Indemnity" },{ value: "biz-interruption", label: "Business Interruption" }] },
      { id: "s7-insurance-review", apiKey: "insuranceReviewDue", valueType: "string", label: "Insurance Review Due", type: "chip-single", group: "ins-review-chips", required: false, options: [{ value: "up-to-date", label: "Up to Date" },{ value: "3-months", label: "Due in 3 Months" },{ value: "6-months", label: "Due in 6 Months" },{ value: "overdue", label: "Overdue" }] },
      { id: "s7-compliance-cal", apiKey: "complianceCalendar", valueType: "string", label: "Compliance Calendar", type: "chip-single", group: "compliance-cal-chips", required: false, options: [{ value: "not-tracked", label: "Not Tracked" },{ value: "informal", label: "Informal Tracking" },{ value: "formal", label: "Formal Calendar" },{ value: "automated", label: "Automated Reminders" }] },
      { id: "s7-succession", apiKey: "successionPlanning", valueType: "string", label: "Succession Planning", type: "chip-single", group: "succession-chips", required: false, options: [{ value: "not-considered", label: "Not Considered" },{ value: "early-thinking", label: "Early Thinking" },{ value: "plan-in-place", label: "Plan in Place" },{ value: "implementing", label: "Actively Implementing" }] },
      { id: "s7-exit-timeline", apiKey: "exitTimeline", valueType: "string", label: "Exit Timeline", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "no-plans", label: "No Plans" },{ value: "5+-years", label: "5+ Years" },{ value: "3-5-years", label: "3-5 Years" },{ value: "1-3-years", label: "1-3 Years" },{ value: "under-1-year", label: "Under 1 Year" }] },
      { id: "s7-exit-strategy", apiKey: "exitStrategy", valueType: "string", label: "Exit Strategy", type: "chip-single", group: "exit-chips", required: false, options: [{ value: "sell", label: "Sell Business" },{ value: "family", label: "Transition to Family" },{ value: "wind-down", label: "Wind Down" }], allowOther: true },
      { id: "s7-additional", apiKey: "additionalContext", valueType: "string", label: "Additional Context", labelHint: "(anything else the AI should consider)", type: "textarea", required: false, placeholder: "e.g. Major contract coming up, planning a second location, specific challenge to address..." }
    ]
  }
];
