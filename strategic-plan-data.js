// strategic-plan-data.js
// Section definitions for the Strategic Plan & 90-Day Ops tool.
// Defines window.SP_SECTIONS â read by strategic-plan-logic.js to render the interview.
// To add, remove, or edit questions: edit this file only.

window.SP_SECTIONS = [

  // -------------------------------------------------------------------------
  // SECTION 0 - Business Snapshot
  // -------------------------------------------------------------------------
  {
    id: 0,
    icon: "ð",
    title: "1. Business Snapshot",
    subtitle: "Basic details about your business. We've pre-filled what we know - just confirm or update.",
    fields: [
      { id: "s0-business-name", label: "Business Name", type: "text", required: false, placeholder: "e.g. Smith Plumbing Pty Ltd, Apex Legal Group, Chen Advisory" },
      { id: "s0-abn", label: "ABN", type: "text", required: false, placeholder: "e.g. 12 345 678 901" },
      { id: "s0-structure", label: "Business Structure", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "sole-trader", label: "Sole Trader" },{ value: "partnership", label: "Partnership" },{ value: "company", label: "Pty Ltd Company" },{ value: "trust", label: "Trust" }] },
      { id: "s0-industry", label: "Industry / Profession", type: "text", required: false, placeholder: "e.g. Plumbing, Commercial Law, Accounting & Advisory, Landscaping" },
      { id: "s0-years", label: "Years in Business", type: "text", required: false, placeholder: "e.g. 8" },
      { id: "s0-location", label: "Location", type: "text", required: false, placeholder: "e.g. Melbourne, VIC" },
      { id: "s0-team-size", label: "Team Size", labelHint: "(including yourself)", type: "text", required: false, placeholder: "e.g. 4" },
      { id: "s0-licences", label: "Licences & Certifications", type: "text", required: false, placeholder: "e.g. A-Grade Electrician Licence, QBCC, Legal Practising Certificate" },
      { id: "s0-key-person", label: "Key Person Dependency", labelHint: "(optional)", type: "chip-single", group: "key-person-chips", required: false, helpText: "If you couldn't work for 2 weeks, what would happen to the business?", options: [{ value: "runs-fine", label: "Business keeps running" },{ value: "slows-down", label: "It would slow down" },{ value: "would-stop", label: "It would stop completely" }] }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 1 - What You Do & Who For
  // -------------------------------------------------------------------------
  {
    id: 1,
    icon: "ð§",
    title: "2. What You Do & Who For",
    subtitle: "Describe your services and customers. This is the heart of your business case.",
    fields: [
      { id: "s1-services", label: "Core Services", labelHint: "(what do you mainly do?)", type: "textarea", required: false, placeholder: "e.g. Residential plumbing repairs, commercial fit-outs, strategic advisory retainers, tax compliance and planning" },
      { id: "s1-customers", label: "Target Customers", type: "chip-multi", group: "customer-chips", required: false, options: [{ value: "homeowners", label: "Homeowners" },{ value: "commercial", label: "Commercial" },{ value: "builders-devs", label: "Builders / Developers" },{ value: "industrial", label: "Industrial" },{ value: "strata", label: "Strata / Property Managers" },{ value: "retail-hosp", label: "Retail / Hospitality" },{ value: "corporate", label: "Corporate / Enterprise" },{ value: "government", label: "Government / Council" },{ value: "professional-svcs", label: "Professional Services" },{ value: "nfp", label: "Not-for-Profit / Community" }] },
      { id: "s1-service-area", label: "Service Area", type: "text", required: false, placeholder: "e.g. All of Greater Melbourne, within 50km of Brisbane CBD, National" },
      { id: "s1-differentiators", label: "What makes you different from your competitors?", type: "textarea", required: false, placeholder: "e.g. 24/7 emergency service, 15+ years experience, fixed-fee engagements" },
      { id: "s1-competitors", label: "Your top 3 competitors", labelHint: "(optional)", type: "text", required: false, placeholder: "e.g. Smith & Co, FastFix, MasterPlumb" },
      { id: "s1-best-service", label: "Most profitable service or product", labelHint: "(optional)", type: "text", required: false, placeholder: "e.g. Emergency callouts, strategic advisory retainers" }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 2 - Financial Health
  // -------------------------------------------------------------------------
  {
    id: 2,
    icon: "ð°",
    title: "3. Where You Are - Financial",
    subtitle: "This section is what banks and lenders focus on most. Approximate figures are fine - you are not being audited.",
    infoBox: "This information is used to build your financial overview section. It is stored securely and never shared. Approximate figures are completely fine.",
    fields: [
      { id: "s2-revenue", label: "Approximate Annual Revenue", type: "select", required: false, options: [{ value: "", label: "Select range..." },{ value: "under-100k", label: "Under $100,000" },{ value: "100k-250k", label: "$100,000 to $250,000" },{ value: "250k-500k", label: "$250,000 to $500,000" },{ value: "500k-1m", label: "$500,000 to $1,000,000" },{ value: "1m-2m", label: "$1,000,000 to $2,000,000" },{ value: "over-2m", label: "Over $2,000,000" }] },
      { id: "s2-jobs-per-month", label: "Average Jobs / Clients Per Month", type: "text", required: false, placeholder: "e.g. 25" },
      { id: "s2-avg-job-value", label: "Average Job / Engagement Value", type: "text", required: false, placeholder: "e.g. $450, $2,500 to $5,000, $15,000 retainer" },
      { id: "s2-cost-categories", label: "Biggest Cost Categories", type: "chip-multi", group: "cost-chips", required: false, options: [{ value: "labour", label: "LabUGr / Wages" },{ value: "materials", label: "Materials" },{ value: "vehicles", label: "Vehicles" },{ value: "insurance", label: "Insurance" },{ value: "rent", label: "Rent / Premises" },{ value: "software", label: "Software & Tools" }] },
      { id: "s2-existing-finance", label: "Current Finance / Loans", labelHint: "(optional)", type: "text", required: false, placeholder: "e.g. $45,000 vehicle loan, $20,000 equipment finance" },
      { id: "s2-payment-terms", label: "Average time customers take to pay", labelHint: "(optional)", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "same-day", label: "Same day" },{ value: "7-days", label: "Within 7 days" },{ value: "14-30-days", label: "14 to 30 days" },{ value: "30-plus-days", label: "30+ days" }] },
      { id: "s2-margin-awareness", label: "Do you know your gross margin?", labelHint: "(optional)", type: "chip-single", group: "margin-chips", required: false, options: [{ value: "yes-clearly", label: "Yes, clearly" },{ value: "roughly", label: "Roughly" },{ value: "no", label: "No" }] },
      { id: "s2-plan-purpose", label: "What is this plan being used for?", labelHint: "(optional)", type: "chip-multi", group: "plan-purpose", required: false, options: [{ value: "bank-lender", label: "Bank / Lender Application" },{ value: "internal", label: "Internal Business Planning" },{ value: "investor", label: "Investor / Partner" },{ value: "grant", label: "Grant Application" }] }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 3 - Goals & Growth
  // -------------------------------------------------------------------------
  {
    id: 3,
    icon: "ð¯",
    title: "4. Where You Are Going - Goals",
    subtitle: "What does success look like for your business? This section shows lenders and partners that you have a clear direction.",
    fields: [
      { id: "s3-goals-1yr", label: "12-Month Goals", labelHint: "(what do you want to achieve in the next year?)", type: "textarea", required: false, placeholder: "e.g. Grow revenue by 25%, hire a second staff member, launch a new service line" },
      { id: "s3-goals-3yr", label: "3-Year Vision", labelHint: "(where do you want the business to be?)", type: "textarea", required: false, placeholder: "e.g. Have a team of 6, be the go-to provider in our area, achieve $1.5M revenue" },
      { id: "s3-investments", label: "Planned Major Purchases or Investments", labelHint: "(next 12 to 24 months)", type: "textarea", required: false, placeholder: "e.g. New work van, office fit-out, technology upgrade" },
      { id: "s3-hiring", label: "Hiring Plans", type: "chip-single", group: "hiring-chips", required: false, options: [{ value: "no-hiring", label: "No hiring planned" },{ value: "1-employee", label: "1 new employee" },{ value: "2-3-employees", label: "2 to 3 new employees" },{ value: "apprentice", label: "Taking on an apprentice" },{ value: "subcontractors", label: "Subcontractors only" }] },
      { id: "s3-marketing-budget", label: "Approximate monthly marketing budget", labelHint: "(optional)", type: "text", required: false, placeholder: "e.g. $500, Under $1,000, None currently" },
      { id: "s3-marketing-challenge", label: "Biggest marketing challenge", labelHint: "(optional)", type: "chip-multi", group: "mktg-challenge-chips", required: false, options: [{ value: "getting-found", label: "Getting found online" },{ value: "referrals", label: "Getting referrals" },{ value: "standing-out", label: "Standing out from competitors" },{ value: "converting", label: "Converting enquiries" },{ value: "no-time", label: "No time for marketing" },{ value: "dont-know", label: "DOn't know what works" }] }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 4 - Operations & Team
  // -------------------------------------------------------------------------
  {
    id: 4,
    icon: "âï¸",
    title: "5. How You Operate & Who Does What",
    subtitle: "How your business runs day-to-day. Shows you have a solid operational foundation.",
    fields: [
      { id: "s4-lead-sources", label: "How do you get most of your work?", labelHint: "(select all that apply)", type: "chip-multi", group: "lead-chips", required: false, options: [{ value: "word-of-mouth", label: "Word of mouth / referrals" },{ value: "google", label: "Google / online search" },{ value: "social", label: "Social media" },{ value: "builder-rels", label: "Builder / partner relationships" },{ value: "repeat", label: "Repeat customers" },{ value: "advertising", label: "Advertising / directories" }] },
      { id: "s4-suppliers", label: "Key Suppliers", labelHint: "(main material, service or equipment suppliers)", type: "text", required: false, placeholder: "e.g. Reece Plumbing, Tradelink, AWS, Microsoft" },
      { id: "s4-subcontractors", label: "Do you use subcontractors?", type: "select", required: false, options: [{ value: "", label: "Select..." },{ value: "no", label: "No - all work done in-house" },{ value: "occasionally", label: "Occasionally for specialist work" },{ value: "regularly", label: "Regularly for overflow or specialist trades" },{ value: "mostly", label: "Mostly subcontractors with minimal employees" }] },
      { id: "s4-technology", label: "Technology & Software Used", type: "chip-multi", group: "tech-chips", required: false, options: [{ value: "job-mgmt", label: "Job management app" },{ value: "accounting", label: "Accounting software" },{ value: "quoting", label: "Quoting software" },{ value: "staxaii", label: "StaxAI" },{ value: "scheduling", label: "Scheduling software" },{ value: "crm", label: "CDM" },{ value: "none", label: "None currently" }] },
      { id: "s4-marketing", label: "Marketing activities", labelHint: "(what you currently do)", type: "textarea", required: false, placeholder: "e.g. Google Business Profile, Facebook page, LinkedIn, email newsletter, networking events" },
      { id: "s4-key-roles", label: "Key roles in your business", labelHint: "(optional)", type: "chip-multi", group: "roles-chips", required: false, options: [{ value: "just-me", label: "Just me" },{ value: "admin", label: "Admin" },{ value: "office-mgr", label: "Office manager" },{ value: "leading-hand", label: "Leading hand" },{ value: "project-mgr", label: "Project manager" },{ value: "estimator", label: "Estimator" },{ value: "biz-dev", label: "Business development" },{ value: "bookkeeper", label: "Bookkeeper" },{ value: "other", label: "Other" }] },
      { id: "s4-compliance", label: "Compliance actions due in next 12 months", labelHint: "(optional)", type: "textarea", required: false, placeholder: "e.g. Renew public liability insurance, ASIC annual review, practising certificate renewal" }
    ]
  },

  // -------------------------------------------------------------------------
  // SECTION 5 - Risk & Contingency
  // -------------------------------------------------------------------------
  {
    id: 5,
    icon: "ð¡ï¸",
    title: "6. Risk & Contingency",
    subtitle: "Showing you have thought about risks and have a plan makes lenders much more comfortable. Be honest - no business is risk-free.",
    fields: [
      { id: "s5-risks", label: "Biggest Risks to Your Business", labelHint: "(select all that apply)", type: "chip-multi", group: "risk-chips", required: false, options: [{ value: "seasonal", label: "SeaYnal slowdowns" },{ value: "key-person", label: "Key person risk" },{ value: "late-payments", label: "Late payments / bad debts" },{ value: "key-clients", label: "Dependence on a few key clients" },{ value: "material-costs", label: "Material cost increases" },{ value: "staff-shortage", label: "Staff availability / skills shortage" },{ value: "regulatory", label: "Regulatory / compliance changes" },{ value: "equipment", label: "Equipment breakdown" }] },
      { id: "s5-contingency", label: "How would you handle a slow 3-month period?", type: "textarea", required: false, placeholder: "e.g. We have 3 months of operating costs in reserve, would reduce discretionary spending, activate referral campaigns" },
      { id: "s5-insurance", label: "Insurance Coverage", labelHint: "(what you currently hold)", type: "chip-multi", group: "insurance-chips", required: false, options: [{ value: "public-liability", label: "Public Liability" },{ value: "tools-equipment", label: "Tools & Equipment" },{ value: "vehicle-fleet", label: "Vehicle / Fleet" },{ value: "workers-comp", label: "Workers Compensation" },{ value: "prof-indemnity", label: "Professional Indemnity" },{ value: "biz-interruption", label: "Business Interruption" }] },
      { id: "s5-additional", label: "Anything else you would like included?", labelHint: "(optional)", type: "textarea", required: false, placeholder: "Any awards, certifications, notable projects, community involvement, unique strengths?" }
    ]
  }
];
