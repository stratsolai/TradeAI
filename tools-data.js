// tools-data.js — StaxAI
// Single source of truth for all tool and industry data.
//
// Schema (unified across core and industry tools):
//   id            (req) — canonical tool ID, kebab-case
//   title         (req) — tool name as a single string
//   icon          (req) — emoji
//   status        (req) — 'built' | 'pending'
//   category      (req) — 'sales-marketing' | 'customers-jobs'
//                       | 'suppliers-materials' | 'intelligence'
//   type          (req) — 'core' | 'industry'
//   desc          (opt) — description string
//   price         (opt) — display price string, e.g. '$69'
//   priceId       (opt) — Stripe price_id
//   industryKey   (opt) — INDUSTRIES key — only for type 'industry'
//
// Backwards compatibility:
//   window.CORE_TOOLS exports the core subset (18 entries) so existing
//   consumers (filter chips, pricing-page, activation modal, etc.) keep
//   working. window.TOOLS exports the full 56-entry catalogue for new
//   consumers that need industry tools too.

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

const TOOLS = [
  // ── CORE — BUILT (7) ─────────────────────────────────────────────────────
  {
    id: "chatbot", title: "Website Chatbot", icon: "💬",
    status: "built", category: "sales-marketing", type: "core",
    price: "$69", priceId: "price_1TRlgkHnoVvjo5gxXR6NMrkR",
    desc: "An AI chatbot answers customer enquiries, qualifies leads, and books jobs - 24/7. It learns your business from your emails, your website, your content library, or FAQs you add yourself. Every answer goes through your approval before it goes live. It keeps learning as it goes."
  },
  {
    id: "social", title: "Marketing and Social Media Manager", icon: "📱",
    status: "built", category: "sales-marketing", type: "core",
    price: "$69", priceId: "price_1TEQg8HnoVvjo5gxkxUaFrok",
    desc: "Describe your latest job, upload a photo, or let the AI pull from your content library - it creates professional social posts, AI-generated graphics, and full marketing campaigns. Promote new products and services, seasonal offers, or industry news. Auto-posts to Facebook and Instagram, or download for community groups, emails, and anywhere else."
  },
  {
    id: "design-viz", title: "Design Visualiser", icon: "🎨",
    status: "built", category: "sales-marketing", type: "core",
    price: "$69", priceId: "price_1TQLbEHnoVvjo5gxIuSSm7tH",
    desc: "Upload a site photo, describe the project, and AI generates a professional concept visualisation. Request variations - different colours, materials, or layouts - until it is perfect. Use it in your quotes, tenders, and marketing. Activate it with your website chatbot and customers can generate their own renders."
  },
  {
    id: "email", title: "Email Assistant", icon: "📧",
    status: "built", category: "intelligence", type: "core",
    price: "$39", priceId: "price_1TQLhHHnoVvjo5gxnwUQQYwM",
    desc: "AI reads your Gmail or Outlook inbox and turns it into a smart, interactive dashboard. See a clear summary of everything - what is urgent, what needs attention, and what can wait. Tap into any email to read the detail. No more scrolling through hundreds of messages to find what matters."
  },
  {
    id: "news-digest", title: "Industry News and Updates Digest", icon: "📰",
    status: "built", category: "intelligence", type: "core",
    price: "$39", priceId: "price_1TQLehHnoVvjo5gxjv8cH40m",
    desc: "Not another newsletter. AI scans your supplier emails, industry body updates, and regulator notices - plus searches reputable online sources - then summarises everything on an interactive dashboard. It is personalised to your business, not generic news. Tap into any story to read more."
  },
  {
    id: "bi", title: "Business Intelligence Dashboard", icon: "📊",
    status: "built", category: "intelligence", type: "core",
    price: "$69", priceId: "price_1T4dClHnoVvjo5gxjSvoi4ky",
    desc: "Your AI business advisor. It analyses activity across all your tools, your content library, and your accounting software - then goes further. AI predicts opportunities for new products and services, analyses your local competitive landscape, and recommends how to stay ahead. The more tools you activate, the smarter it gets."
  },
  {
    id: "strategic-plan", title: "Strategic Plan and Operations Dashboard", icon: "📝",
    status: "built", category: "intelligence", type: "core",
    price: "$69", priceId: "price_1TB7DDHnoVvjo5gxgLzZbego",
    desc: "Create your strategic business plan and 90-day interactive action plan in minutes from a simple AI-guided interview. Can be used to apply for finance."
  },

  // ── CORE — PENDING (existing 6) ──────────────────────────────────────────
  {
    id: "tender", title: "Tender Response Generator", icon: "📋",
    status: "pending", category: "sales-marketing", type: "core",
    price: "$69", priceId: "price_1TEQjVHnoVvjo5gxfyLbHE3M",
    desc: "Upload any RFT or RFQ - AI reads the requirements, searches your content library for relevant experience, certifications, and project history, then generates a professional tender response. Review it with AI-assisted editing - tap a button to expand sections, add detail, or adjust tone. Download as PDF or Word."
  },
  {
    id: "quote-enhancer", title: "Quote Enhancer", icon: "💰",
    status: "pending", category: "sales-marketing", type: "core",
    price: "$59", priceId: "price_1TB8QZHnoVvjo5gxwL0GKduI",
    desc: "Enter your line items and prices - or import them from your quoting tool - and AI transforms them into a professional branded quote. Detailed scope of works, warranty terms, payment milestones, exclusions, and a cover page with your branding. Add project photos and concept renders. Download as PDF or Word, or send it straight to the customer."
  },
  {
    id: "review-booster", title: "Review and Referral Booster", icon: "⭐",
    status: "pending", category: "sales-marketing", type: "core",
    price: "$39", priceId: "price_1TB8TFHnoVvjo5gxkF2QMzJa",
    desc: "Finish a job and a branded review request is automatically sent to your customer - or send one with a single tap. It follows up if they have not responded, and once they leave a review, it asks if they know someone who needs your services. Track every request, review, and referral on your dashboard."
  },
  {
    id: "swms", title: "SWMS and Safety Docs", icon: "⛑",
    status: "pending", category: "customers-jobs", type: "core",
    price: "$59", priceId: "price_1TB8RNHnoVvjo5gxPb5wxUuF",
    desc: "Describe the job and AI generates a Safe Work Method Statement specific to the work, your trade, and your state - hazards, risks, controls, PPE, emergency procedures. Workers sign off on-site with digital signatures on their phone. Build a library of templates that get smarter with every job."
  },
  {
    id: "customer-updates", title: "Customer Progress Updates", icon: "📸",
    status: "pending", category: "customers-jobs", type: "core",
    price: "$59", priceId: "price_1TB8S6HnoVvjo5gxVYoEezlN",
    desc: "Keep your customers in the loop without the hassle. Take photos on-site, tap send, and AI creates a professional branded progress update - what was done today, photos, and what is next. Your customer gets a clean update via email or a shareable link they can check anytime."
  },
  {
    id: "handover-docs", title: "Handover Documentation", icon: "📦",
    status: "pending", category: "customers-jobs", type: "core",
    price: "$59", priceId: "price_1TB8ShHnoVvjo5gxrGBAMHZL",
    desc: "Finish a job and hand your customer a professional branded pack - project summary, before and after photos, maintenance guide, warranty details - everything they need. Add key components like pumps or fixtures - AI searches the manufacturer and pulls real maintenance details and warranty terms into the document."
  },

  // ── CORE — PENDING (5 new — added per Section 1 of CL prompt rewrite) ───
  {
    id: "contract-manager", title: "Contract & Scope Change Manager", icon: "📑",
    status: "pending", category: "customers-jobs", type: "core",
    desc: "AI drafts variation notices with digital customer sign-off — full audit trail of all scope changes."
  },
  {
    id: "subcontractor-mgmt", title: "Subcontractor & Supplier Management", icon: "👷",
    status: "pending", category: "suppliers-materials", type: "core",
    desc: "Track subcontractor licences, insurance, and compliance — AI generates onboarding packs and expiry reminders."
  },
  {
    id: "staff-onboarding", title: "Staff Onboarding & Training Docs", icon: "👋",
    status: "pending", category: "intelligence", type: "core",
    desc: "AI generates induction documents, training checklists, and site-specific procedures — workers sign off digitally."
  },
  {
    id: "job-debrief", title: "Job Debrief & Lessons Learned", icon: "🔍",
    status: "pending", category: "intelligence", type: "core",
    desc: "Quick AI-assisted debrief at job completion — captures what went well, cost variance, and lessons learned."
  },
  {
    id: "compliance-calendar", title: "Compliance Calendar", icon: "📅",
    status: "pending", category: "intelligence", type: "core",
    desc: "AI builds your compliance calendar — licence renewals, insurance expiry, BAS deadlines — with proactive reminders."
  },

  // ── INDUSTRY — POOL (4) ─────────────────────────────────────────────────
  {
    id: "pool-chemistry", title: "Pool Chemistry Advisor", icon: "🧪",
    status: "pending", category: "sales-marketing", type: "industry", industryKey: "pool",
    desc: "Customers enter test results and AI tells them exactly what to add — reduces support calls."
  },
  {
    id: "warranty-tracker", title: "Warranty Claim Manager", icon: "🛡️",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "pool",
    desc: "Track all warranties — structure, equipment, tiling — with auto-reminders for expiry dates."
  },
  {
    id: "seasonal-reminder", title: "Seasonal Pool Care Reminders", icon: "🌊",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "pool",
    desc: "Auto-sends seasonal maintenance tips and service offers to past customers."
  },
  {
    id: "license-tracker", title: "License & Compliance Tracker", icon: "🪪",
    status: "pending", category: "intelligence", type: "industry", industryKey: "pool",
    desc: "Track QBCC licenses, insurance certificates and staff qualifications — alerts before expiry."
  },

  // ── INDUSTRY — PLUMBER (3) ──────────────────────────────────────────────
  {
    id: "emergency-router", title: "Emergency Job Router", icon: "🚨",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "plumber",
    desc: "AI triages emergency calls by severity and location, assigns nearest available plumber."
  },
  {
    id: "backflow-scheduler", title: "Backflow Testing Scheduler", icon: "🔄",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "plumber",
    desc: "Track all backflow prevention devices, auto-schedule annual tests, generate compliance reports."
  },
  {
    id: "hot-water-selector", title: "Hot Water System Selector", icon: "🚿",
    status: "pending", category: "sales-marketing", type: "industry", industryKey: "plumber",
    desc: "Customer enters household size and usage — AI recommends the optimal hot water system with ROI comparison."
  },

  // ── INDUSTRY — ELECTRICIAN (3) ──────────────────────────────────────────
  {
    id: "test-tag-manager", title: "Test & Tag Manager", icon: "🔌",
    status: "pending", category: "intelligence", type: "industry", industryKey: "electrician",
    desc: "Track all appliance testing schedules, generate AS/NZS 3760 compliant records and certificates."
  },
  {
    id: "compliance-cert-gen", title: "Compliance Certificate Generator", icon: "📜",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "electrician",
    desc: "Auto-fill electrical compliance certificates from job details — download or send to customer."
  },
  {
    id: "emergency-dispatch", title: "Emergency Callout Dispatcher", icon: "⚡",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "electrician",
    desc: "AI triages emergency calls, assigns nearest available sparky, sends customer ETA updates."
  },

  // ── INDUSTRY — BUILDER (4) ──────────────────────────────────────────────
  {
    id: "subcontractor-coordinator", title: "Subcontractor Coordinator", icon: "🔗",
    status: "pending", category: "suppliers-materials", type: "industry", industryKey: "builder",
    desc: "AI manages subcontractor scheduling, availability, and job assignment across active projects."
  },
  {
    id: "site-diary", title: "Digital Site Diary", icon: "📓",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "builder",
    desc: "Voice-to-text or typed site diary with weather, workers on site, progress notes — auto-generates daily report."
  },
  {
    id: "variation-tracker", title: "Variation Order Manager", icon: "📄",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "builder",
    desc: "AI drafts variation orders from site notes or photos — client approval workflow built in."
  },
  {
    id: "rfi-manager", title: "RFI & Query Manager", icon: "❓",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "builder",
    desc: "Track all RFIs and queries to architects, engineers, and consultants — auto-follow-up reminders."
  },

  // ── INDUSTRY — HVAC (4) ─────────────────────────────────────────────────
  {
    id: "service-prioritiser", title: "Service Call Prioritiser", icon: "🌡️",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "hvac",
    desc: "AI automatically triages incoming calls by urgency — no cooling in summer gets highest priority."
  },
  {
    id: "refrigerant-tracker", title: "Refrigerant Gas Tracker", icon: "❄️",
    status: "pending", category: "suppliers-materials", type: "industry", industryKey: "hvac",
    desc: "Track all refrigerant usage and generate EPA-compliant quarterly reports automatically."
  },
  {
    id: "maintenance-scheduler-hvac", title: "Preventative Maintenance Scheduler", icon: "🔧",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "hvac",
    desc: "Auto-reminds past customers when their annual service is due — fills slow periods."
  },
  {
    id: "energy-calculator", title: "Energy Efficiency Calculator", icon: "💡",
    status: "pending", category: "intelligence", type: "industry", industryKey: "hvac",
    desc: "Show customers exactly how much they will save upgrading to a more efficient system."
  },

  // ── INDUSTRY — FABRICATOR (4) ───────────────────────────────────────────
  {
    id: "material-optimizer", title: "Material Cutting Optimiser", icon: "✂️",
    status: "pending", category: "suppliers-materials", type: "industry", industryKey: "fabricator",
    desc: "Input sheet/bar dimensions and required pieces — AI calculates optimal cutting pattern to minimise waste."
  },
  {
    id: "weld-tracker", title: "Welder Qualification Tracker", icon: "🔥",
    status: "pending", category: "suppliers-materials", type: "industry", industryKey: "fabricator",
    desc: "Track all welder qualifications and test dates — alerts when re-certification is due."
  },
  {
    id: "job-costing", title: "Real-Time Job Costing", icon: "💹",
    status: "pending", category: "intelligence", type: "industry", industryKey: "fabricator",
    desc: "Track labour, materials, and overhead against quoted price in real time — flags margin erosion."
  },
  {
    id: "quality-checklist", title: "Quality Inspection Checklist", icon: "✅",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "fabricator",
    desc: "AI generates job-specific quality inspection checklists — digital sign-off with photos."
  },

  // ── INDUSTRY — CLEANER (3) ──────────────────────────────────────────────
  {
    id: "roster-optimizer", title: "Smart Roster Optimiser", icon: "📆",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "cleaner",
    desc: "AI builds optimal cleaning roster from available staff, job locations, and time windows."
  },
  {
    id: "quality-audit", title: "Site Quality Audit System", icon: "🔍",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "cleaner",
    desc: "Photo-based quality inspection checklist — AI flags missed areas — client sign-off with report."
  },
  {
    id: "consumables-tracker", title: "Consumables Inventory Tracker", icon: "🧴",
    status: "pending", category: "suppliers-materials", type: "industry", industryKey: "cleaner",
    desc: "Track cleaning product usage per job — auto-generates purchase orders when stock runs low."
  },

  // ── INDUSTRY — LANDSCAPER (3) ───────────────────────────────────────────
  {
    id: "plant-selector", title: "Smart Plant Selector", icon: "🌿",
    status: "pending", category: "sales-marketing", type: "industry", industryKey: "landscaper",
    desc: "Customer enters location, sun/shade, soil type and budget — AI recommends suitable plants with care guides."
  },
  {
    id: "seasonal-scheduler-land", title: "Seasonal Maintenance Scheduler", icon: "🍂",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "landscaper",
    desc: "Auto-generates seasonal maintenance schedule for each customer's garden — send as branded PDF."
  },
  {
    id: "irrigation-designer", title: "Irrigation System Designer", icon: "💧",
    status: "pending", category: "sales-marketing", type: "industry", industryKey: "landscaper",
    desc: "Upload site plan or describe garden layout — AI suggests optimal irrigation zones and component list."
  },

  // ── INDUSTRY — MANUFACTURER (4) ─────────────────────────────────────────
  {
    id: "production-scheduler", title: "Production Scheduler", icon: "🏭",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "manufacturer",
    desc: "AI optimises production run scheduling across machines, materials, and labour availability."
  },
  {
    id: "quality-spc", title: "Statistical Process Control (SPC)", icon: "📈",
    status: "pending", category: "intelligence", type: "industry", industryKey: "manufacturer",
    desc: "Input quality measurements — AI generates control charts and flags process drift before defects occur."
  },
  {
    id: "inventory-forecaster", title: "Smart Inventory Forecaster", icon: "📈",
    status: "pending", category: "suppliers-materials", type: "industry", industryKey: "manufacturer",
    desc: "AI predicts raw material requirements based on production schedule and historical usage."
  },
  {
    id: "oee-tracker", title: "OEE Performance Tracker", icon: "⚙️",
    status: "pending", category: "intelligence", type: "industry", industryKey: "manufacturer",
    desc: "Track Overall Equipment Effectiveness — AI identifies biggest productivity improvement opportunities."
  },

  // ── INDUSTRY — CONCRETER (3) ────────────────────────────────────────────
  {
    id: "pour-scheduler", title: "Smart Pour Scheduler", icon: "🌤️",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "concreter",
    desc: "AI checks weather forecasts and schedules concrete pours for optimal curing conditions."
  },
  {
    id: "mix-designer", title: "Concrete Mix Designer", icon: "🪣",
    status: "pending", category: "suppliers-materials", type: "industry", industryKey: "concreter",
    desc: "Input project requirements — AI recommends optimal mix design with supplier and cost comparison."
  },
  {
    id: "test-tracker", title: "Concrete Test Tracker", icon: "🧱",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "concreter",
    desc: "Track all concrete test cylinders — auto-generates test results report for engineers and councils."
  },

  // ── INDUSTRY — HANDYMAN (3) ─────────────────────────────────────────────
  {
    id: "multi-trade-scheduler", title: "Multi-Trade Job Scheduler", icon: "🗓️",
    status: "pending", category: "customers-jobs", type: "industry", industryKey: "handyman",
    desc: "AI optimises daily job schedule across multiple trade types and locations to minimise travel."
  },
  {
    id: "parts-finder", title: "Smart Parts Finder", icon: "🔩",
    status: "pending", category: "suppliers-materials", type: "industry", industryKey: "handyman",
    desc: "Photo or describe a broken part — AI identifies it and finds local suppliers with stock and pricing."
  },
  {
    id: "job-cost-estimator", title: "Quick Job Cost Estimator", icon: "🧮",
    status: "pending", category: "intelligence", type: "industry", industryKey: "handyman",
    desc: "Describe the job — AI generates an estimated cost breakdown by labour, materials, and travel."
  }
];

window.BUNDLE_TIERS = {
  stax3: {
    id: "stax3",
    name: "STAX3",
    slots: 3,
    price: "$129",
    priceMonthly: 129,
    description: "Pick any 3 tools",
    priceId: "price_1TEQc9HnoVvjo5gxHQ1CQYAT",
  },
  stax6: {
    id: "stax6",
    name: "STAX6",
    slots: 6,
    price: "$249",
    priceMonthly: 249,
    description: "Pick any 6 tools",
    priceId: "price_1TEQdAHnoVvjo5gxg6uwVWV1",
  },
  "stax-all": {
    id: "stax-all",
    name: "STAX All",
    slots: null,
    price: "$449",
    priceMonthly: 449,
    description: "All 13 core tools + industry tools",
    priceId: "price_1TEQdoHnoVvjo5gxlNMGajr8",
  },
};

// Browser exports.
//   window.TOOLS — full 56-entry catalogue (core + industry).
//   window.CORE_TOOLS — core-only subset (18 entries) for backwards
//     compatibility with consumers that enumerate the catalogue assuming
//     it's core-only (filter chips, pricing-page priceId check, etc.).
window.TOOLS = TOOLS;
window.CORE_TOOLS = TOOLS.filter(function(t) { return t.type === 'core'; });
