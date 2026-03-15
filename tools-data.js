// tools-data.js - TradeAI Pro
// Single source of truth for all tool and industry data

const INDUSTRIES = [
  { id: "pool", label: "Pool Builders", icon: "🏊", desc: "AI tools built for pool builders and installers.", toolCount: 16, highlight: "SWMS and safety docs in minutes" },
  { id: "plumber", label: "Plumbers", icon: "🔧", desc: "AI tools built for plumbing businesses.", toolCount: 16, highlight: "Professional quotes and handover docs" },
  { id: "electrician", label: "Electricians", icon: "⚡", desc: "AI tools built for electrical contractors.", toolCount: 16, highlight: "Compliance docs and tender responses" },
  { id: "builder", label: "Builders", icon: "🏗️", desc: "AI tools built for building and construction.", toolCount: 17, highlight: "Tender responses and project updates" },
  { id: "hvac", label: "HVAC", icon: "❄️", desc: "AI tools built for HVAC businesses.", toolCount: 16, highlight: "Maintenance guides and handover packs" },
  { id: "fabricator", label: "Fabricators", icon: "🔩", desc: "AI tools built for fabrication businesses.", toolCount: 16, highlight: "Professional quotes and marketing content" },
  { id: "cleaner", label: "Cleaners", icon: "🧹", desc: "AI tools built for cleaning businesses.", toolCount: 16, highlight: "Automated reviews and referrals" },
  { id: "landscaper", label: "Landscapers", icon: "🌿", desc: "AI tools built for landscaping businesses.", toolCount: 16, highlight: "Design visualiser and progress updates" },
  { id: "manufacturer", label: "Manufacturers", icon: "🏭", desc: "AI tools built for manufacturing businesses.", toolCount: 16, highlight: "Tender responses and business intelligence" },
  { id: "concreter", label: "Concreters", icon: "🪨", desc: "AI tools built for concreting businesses.", toolCount: 16, highlight: "SWMS docs and quote enhancement" },
  { id: "handyman", label: "Handymen", icon: "🛠️", desc: "AI tools built for handyman businesses.", toolCount: 16, highlight: "Smart marketing and review boosting" }
];

const CORE_TOOLS = [
  {
    id: "chatbot",
    status: "built",
    icon: "💬",
    category: "marketing",
    title: ["AI Website", "Chatbot"],
    desc: "An AI chatbot answers customer enquiries, qualifies leads, and books jobs - 24/7. It learns your business from your emails, your website, your content library, or FAQs you add yourself. Every answer goes through your approval before it goes live. It keeps learning as it goes.",
    price: "$79",
    priceId: "price_1T4dAyHnoVvjo5gxMgLczawf",
  },
  {
    id: "social",
    status: "built",
    icon: "📱",
    category: "marketing",
    title: ["Marketing and", "Social Media Manager"],
    desc: "Describe your latest job, upload a photo, or let the AI pull from your content library - it creates professional social posts, AI-generated graphics, and full marketing campaigns. Promote new products and services, seasonal offers, or industry news. Auto-posts to Facebook and Instagram, or download for community groups, emails, and anywhere else.",
    price: "$79",
    priceId: "price_1T4dCEHnoVvjo5gxQysf0vQI",
  },
  {
    id: "email",
    status: "built",
    icon: "📧",
    category: "operations",
    title: ["AI Email", "Assistant"],
    desc: "AI reads your Gmail or Outlook inbox and turns it into a smart, interactive dashboard. See a clear summary of everything - what is urgent, what needs attention, and what can wait. Tap into any email to read the detail. No more scrolling through hundreds of messages to find what matters.",
    price: "$59",
    priceId: "price_1T4dBcHnoVvjo5gx8EuxX5hL",
  },
  {
    id: "strategic-plan",
    status: "built",
    icon: "📋",
    category: "intelligence",
    title: ["Strategic Plan and", "Operations Dashboard"],
    desc: "Create your strategic business plan and 90-day interactive action plan in minutes from a simple AI-guided interview. Can be used to apply for finance.",
    price: "$69",
    priceId: "price_1TB7DDHnoVvjo5gxgLzZbego",
  },
  {
    id: "news-digest",
    status: "built",
    icon: "📰",
    category: "intelligence",
    title: ["Industry News and", "Updates Digest"],
    desc: "Not another newsletter. AI scans your supplier emails, industry body updates, and regulator notices - plus searches reputable online sources - then summarises everything on an interactive dashboard. It is personalised to your business, not generic news. Tap into any story to read more.",
    price: "$59",
    priceId: "price_1TB7IdHnoVvjo5gxTA1rOKRI",
  },
  {
    id: "bi",
    status: "pending",
    icon: "📊",
    category: "intelligence",
    title: ["Business Intelligence", "Dashboard"],
    desc: "Your AI business advisor. It analyses activity across all your tools, your content library, and your accounting software - then goes further. AI predicts opportunities for new products and services, analyses your local competitive landscape, and recommends how to stay ahead. The more tools you activate, the smarter it gets.",
    price: "$89",
    priceId: null,
  },
  {
    id: "tender",
    status: "pending",
    icon: "📝",
    category: "operations",
    title: ["Tender Response", "Generator"],
    desc: "Upload any RFT or RFQ - AI reads the requirements, searches your content library for relevant experience, certifications, and project history, then generates a professional tender response. Review it with AI-assisted editing - tap a button to expand sections, add detail, or adjust tone. Download as PDF or Word.",
    price: "$99",
    priceId: "price_1T4dDMHnoVvjo5gxWhPHyqQc",
  },
  {
    id: "quote-enhancer",
    status: "pending",
    icon: "💰",
    category: "operations",
    title: ["Quote", "Enhancer"],
    desc: "Enter your line items and prices - or import them from your quoting tool - and AI transforms them into a professional branded quote. Detailed scope of works, warranty terms, payment milestones, exclusions, and a cover page with your branding. Add project photos and concept renders. Download as PDF or Word, or send it straight to the customer.",
    price: "Coming Soon",
    priceId: "price_1TB8QZHnoVvjo5gxwL0GKduI",
  },
  {
    id: "swms",
    status: "pending",
    icon: "🦺",
    category: "operations",
    title: ["SWMS and", "Safety Docs"],
    desc: "Describe the job and AI generates a Safe Work Method Statement specific to the work, your trade, and your state - hazards, risks, controls, PPE, emergency procedures. Workers sign off on-site with digital signatures on their phone. Build a library of templates that get smarter with every job.",
    price: "Coming Soon",
    priceId: "price_1TB8RNHnoVvjo5gxPb5wxUuF",
  },
  {
    id: "customer-updates",
    status: "pending",
    icon: "📸",
    category: "operations",
    title: ["Customer Progress", "Updates"],
    desc: "Keep your customers in the loop without the hassle. Take photos on-site, tap send, and AI creates a professional branded progress update - what was done today, photos, and what is next. Your customer gets a clean update via email or a shareable link they can check anytime.",
    price: "Coming Soon",
    priceId: "price_1TB8S6HnoVvjo5gxVYoEezlN",
  },
  {
    id: "handover-docs",
    status: "pending",
    icon: "📦",
    category: "operations",
    title: ["Handover", "Documentation"],
    desc: "Finish a job and hand your customer a professional branded pack - project summary, before and after photos, maintenance guide, warranty details - everything they need. Add key components like pumps or fixtures - AI searches the manufacturer and pulls real maintenance details and warranty terms into the document.",
    price: "Coming Soon",
    priceId: "price_1TB8ShHnoVvjo5gxrGBAMHZL",
  },
  {
    id: "review-booster",
    status: "pending",
    icon: "⭐",
    category: "marketing",
    title: ["Review and Referral", "Booster"],
    desc: "Finish a job and a branded review request is automatically sent to your customer - or send one with a single tap. It follows up if they have not responded, and once they leave a review, it asks if they know someone who needs your services. Track every request, review, and referral on your dashboard.",
    price: "Coming Soon",
    priceId: "price_1TB8TFHnoVvjo5gxkF2QMzJa",
  },
  {
    id: "design-viz",
    status: "pending",
    icon: "🎨",
    category: "marketing",
    title: ["Design", "Visualiser"],
    desc: "Upload a site photo, describe the project, and AI generates a professional concept visualisation. Request variations - different colours, materials, or layouts - until it is perfect. Use it in your quotes, tenders, and marketing. Activate it with your website chatbot and customers can generate their own renders.",
    price: "Coming Soon",
  }
];


const INDUSTRY_SPECIFIC = {
  pool: [
    {
      id: "pool-chemistry", cat: "Operations", icon: "🧪", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Pool Chemistry Advisor",
    },
    {
      id: "warranty-tracker", cat: "Documents & Admin", icon: "🛡️", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Warranty Claim Manager",
    },
    {
      id: "seasonal-reminder", cat: "Marketing", icon: "🍂", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Seasonal Pool Care Reminders",
    },
    {
      id: "license-tracker", cat: "Documents & Admin", icon: "📋", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "License & Compliance Tracker",
    },
  ],
  hvac: [
    {
      id: "service-prioritizer", cat: "Operations", icon: "🚨", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Service Call Prioritiser",
    },
    {
      id: "refrigerant-tracker", cat: "Documents & Admin", icon: "🧪", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Refrigerant Gas Tracker",
    },
    {
      id: "maintenance-scheduler-hvac", cat: "Operations", icon: "🔄", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Preventative Maintenance Scheduler",
    },
    {
      id: "energy-calculator", cat: "Sales & Quotes", icon: "⚡", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Energy Efficiency Calculator",
    },
  ],
  electrical: [
    {
      id: "test-tag-manager", cat: "Documents & Admin", icon: "🔌", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Test & Tag Manager",
    },
    {
      id: "compliance-cert-gen", cat: "Documents & Admin", icon: "📜", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Compliance Certificate Generator",
    },
    {
      id: "emergency-dispatch", cat: "Operations", icon: "🚨", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Emergency Callout Dispatcher",
    },
  ],
  fabrication: [
    {
      id: "material-optimizer", cat: "Operations", icon: "📐", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Material Cutting Optimiser",
    },
    {
      id: "weld-tracker", cat: "Documents & Admin", icon: "🔥", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Welder Qualification Tracker",
    },
    {
      id: "job-costing", cat: "Financial Management", icon: "💰", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Real-Time Job Costing",
    },
    {
      id: "quality-checklist", cat: "Documents & Admin", icon: "✅", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Quality Inspection Checklist",
    },
  ],
  plumbing: [
    {
      id: "emergency-router", cat: "Operations", icon: "🚰", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Emergency Job Router",
    },
    {
      id: "backflow-scheduler", cat: "Operations", icon: "💧", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Backflow Testing Scheduler",
    },
    {
      id: "hot-water-selector", cat: "Sales & Quotes", icon: "♨️", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Hot Water System Selector",
    },
  ],
  construction: [
    {
      id: "subcontractor-coordinator", cat: "Operations", icon: "👷", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Subcontractor Coordinator",
    },
    {
      id: "site-diary", cat: "Documents & Admin", icon: "📔", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Digital Site Diary",
    },
    {
      id: "variation-tracker", cat: "Financial Management", icon: "📝", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Variation Order Manager",
    },
    {
      id: "rfi-manager", cat: "Documents & Admin", icon: "❓", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "RFI & Query Manager",
    },
  ],
  landscaping: [
    {
      id: "plant-selector", cat: "Sales & Quotes", icon: "🌱", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Smart Plant Selector",
    },
    {
      id: "seasonal-scheduler-land", cat: "Operations", icon: "📅", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Seasonal Maintenance Scheduler",
    },
    {
      id: "irrigation-designer", cat: "Sales & Quotes", icon: "💧", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Irrigation System Designer",
    },
  ],
  cleaning: [
    {
      id: "roster-optimizer", cat: "Operations", icon: "👥", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Smart Roster Optimiser",
    },
    {
      id: "quality-audit", cat: "Documents & Admin", icon: "⭐", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Site Quality Audit System",
    },
    {
      id: "consumables-tracker", cat: "Financial Management", icon: "🧴", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Consumables Inventory Tracker",
    },
  ],
  manufacturing: [
    {
      id: "production-scheduler", cat: "Operations", icon: "📊", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Production Scheduler",
    },
    {
      id: "quality-spc", cat: "Documents & Admin", icon: "📈", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Statistical Process Control (SPC)",
    },
    {
      id: "inventory-forecaster", cat: "Financial Management", icon: "📦", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Smart Inventory Forecaster",
    },
    {
      id: "oee-tracker", cat: "Operations", icon: "⚡", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "OEE Performance Tracker",
    },
  ],
  concreting: [
    {
      id: "pour-scheduler", cat: "Operations", icon: "🚛", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Smart Pour Scheduler",
    },
    {
      id: "mix-designer", cat: "Sales & Quotes", icon: "⚗️", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Concrete Mix Designer",
    },
    {
      id: "test-tracker", cat: "Documents & Admin", icon: "🧪", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Concrete Test Tracker",
    },
  ],
  handyman: [
    {
      id: "multi-trade-scheduler", cat: "Operations", icon: "🗓️", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Multi-Trade Job Scheduler",
    },
    {
      id: "parts-finder", cat: "Operations", icon: "🔍", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Smart Parts Finder",
    },
    {
      id: "job-cost-estimator", cat: "Sales & Quotes", icon: "💵", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Quick Job Cost Estimator",
    },
  ],
};