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
    id: "lead-bot",
    toolId: "chatbot",
    status: "built",
    icon: "💬",
    category: "marketing",
    category_label: "Marketing",
    title: ["AI Website", "Chatbot"],
    tagline: "Your 24/7 sales team that never sleeps ✨",
    desc: "An AI chatbot answers customer enquiries, qualifies leads, and books jobs - 24/7. It learns your business from your emails, your website, your content library, or FAQs you add yourself. Every answer goes through your approval before it goes live. It keeps learning as it goes.",
    price: "$79",
    benefits: [
      "Answers customer enquiries 24/7 - even when you are on-site",
      "Qualifies leads and books jobs automatically",
      "Learns from your emails, website and content library",
      "Every FAQ approved by you before it goes live",
      "Gets smarter with every customer interaction"
    ],
    roi: {
      inputs: [
        { id: "visitors", label: "Website visitors per month", min: 50, max: 2000, default: 500, step: 50 },
        { id: "missed", label: "Enquiries you miss per month", min: 1, max: 50, default: 12, step: 1 },
        { id: "jobval", label: "Average job value", min: 500, max: 50000, default: 4500, step: 500, prefix: "$" }
      ],
      calculate: "const leads = Math.round(visitors * 0.04); const afterHours = Math.round(missed * 0.6); const booked = Math.round((leads + afterHours) * 0.3); const revenue = booked * jobval; return { leads, afterHours, booked, revenue };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and your chatbot is instantly created and ready to configure." },
      { icon: "⚙️", title: "Settings", desc: "Add your FAQs, connect your email, and set your greeting message and tone." },
      { icon: "🚀", title: "Live", desc: "Copy one line of code to your website and your chatbot is live capturing leads." }
    ]
  },
  {
    id: "social-media-manager",
    toolId: "social",
    status: "built",
    icon: "📱",
    category: "marketing",
    category_label: "Marketing",
    title: ["Marketing and", "Social Media Manager"],
    tagline: "Your marketing team in a tool",
    desc: "Describe your latest job, upload a photo, or let the AI pull from your content library - it creates professional social posts, AI-generated graphics, and full marketing campaigns. Promote new products and services, seasonal offers, or industry news. Auto-posts to Facebook and Instagram, or download for community groups, emails, and anywhere else.",
    price: "$79",
    benefits: [
      "AI creates professional posts, graphics and full marketing campaigns",
      "Auto-posts directly to Facebook and Instagram",
      "AI-generated graphics via Ideogram - no design skills needed",
      "Creates content from job photos, uploads, Google Drive or text",
      "SEO-optimised website and blog content included"
    ],
    roi: {
      inputs: [
        { id: "posts", label: "Posts created per month", min: 1, max: 30, default: 8, step: 1 },
        { id: "followers", label: "Social media followers", min: 100, max: 10000, default: 800, step: 100 },
        { id: "jobval", label: "Average job value", min: 500, max: 50000, default: 4500, step: 500, prefix: "$" }
      ],
      calculate: "const reach = Math.round(followers * 0.08 * posts); const leads = Math.round(reach * 0.02); const booked = Math.round(leads * 0.3); const revenue = booked * jobval; return { leads, afterHours: reach, booked, revenue };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and connect your Facebook and Instagram accounts in seconds." },
      { icon: "⚙️", title: "Settings", desc: "Set your posting schedule, tone of voice and content category preferences." },
      { icon: "🚀", title: "Live", desc: "Upload a photo or describe a job and AI creates and posts your content automatically." }
    ]
  },
  {
    id: "email-assistant",
    toolId: "email",
    status: "built",
    icon: "📧",
    category: "operations",
    category_label: "Operations",
    title: ["AI Email", "Assistant"],
    tagline: "Inbox chaos sorted in seconds",
    desc: "AI reads your Gmail or Outlook inbox and turns it into a smart, interactive dashboard. See a clear summary of everything - what is urgent, what needs attention, and what can wait. Tap into any email to read the detail. No more scrolling through hundreds of messages to find what matters.",
    price: "$59",
    benefits: [
      "Connects to Gmail and Outlook via secure OAuth",
      "Urgency flagging surfaces what needs immediate attention",
      "Smart dashboard replaces inbox chaos with clarity",
      "Identifies supplier pricing data for business intelligence",
      "AI draft replies ready when you need them"
    ],
    roi: {
      inputs: [
        { id: "emails", label: "Emails received per day", min: 5, max: 200, default: 40, step: 5 },
        { id: "timeper", label: "Minutes spent on email per day", min: 10, max: 180, default: 60, step: 10 },
        { id: "hourlyrate", label: "Your hourly rate", min: 50, max: 500, default: 120, step: 10, prefix: "$" }
      ],
      calculate: "const saved = Math.round(timeper * 0.5); const weekly = Math.round((saved * 5 * hourlyrate) / 60); const monthly = weekly * 4; const booked = Math.round(monthly / hourlyrate); return { leads: saved, afterHours: weekly, booked, revenue: monthly };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and connect your Gmail or Outlook account with one click." },
      { icon: "⚙️", title: "Settings", desc: "Set your urgency preferences and email scanning frequency." },
      { icon: "🚀", title: "Live", desc: "Your inbox is instantly transformed into a smart prioritised dashboard." }
    ]
  },
  {
    id: "strategic-plan",
    toolId: "strategic-plan",
    status: "built",
    icon: "📋",
    category: "intelligence",
    category_label: "Business Intelligence",
    title: ["Strategic Plan and", "Operations Dashboard"],
    tagline: "Your business roadmap in minutes",
    desc: "Create your strategic business plan and 90-day interactive action plan in minutes from a simple AI-guided interview. Can be used to apply for finance.",
    price: "$69",
    benefits: [
      "AI-guided interview generates your full strategic plan in minutes",
      "Bank and finance-ready output for loan and grant applications",
      "90-day interactive action plan with progress tracking",
      "Two documents generated - strategic plan and operational plan",
      "No business degree required - AI makes it accessible for everyone"
    ],
    roi: {
      inputs: [
        { id: "revenue", label: "Annual revenue", min: 50000, max: 2000000, default: 400000, step: 50000, prefix: "$" },
        { id: "goals", label: "Growth target percentage", min: 5, max: 50, default: 20, step: 5 },
        { id: "loanval", label: "Finance amount seeking", min: 0, max: 500000, default: 100000, step: 10000, prefix: "$" }
      ],
      calculate: "const growth = Math.round(revenue * (goals / 100)); const booked = Math.round(growth / 10000); const leads = goals; return { leads, afterHours: growth, booked, revenue: growth };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and start your AI-guided business interview immediately." },
      { icon: "⚙️", title: "Settings", desc: "Complete the 6-section interview covering your business, goals and market." },
      { icon: "🚀", title: "Live", desc: "Download your bank-ready strategic plan and start your 90-day action tracker." }
    ]
  },
  {
    id: "news-digest",
    toolId: "news-digest",
    status: "built",
    icon: "📰",
    category: "intelligence",
    category_label: "Business Intelligence",
    title: ["Industry News and", "Updates Digest"],
    tagline: "Stay informed, stay compliant, stay ahead",
    desc: "Not another newsletter. AI scans your supplier emails, industry body updates, and regulator notices - plus searches reputable online sources - then summarises everything on an interactive dashboard. It is personalised to your business, not generic news. Tap into any story to read more.",
    price: "$59",
    benefits: [
      "Personalised to your trade, suppliers and industry body",
      "Scans your supplier emails for pricing and product updates",
      "Regulation and compliance changes surfaced automatically",
      "Interactive dashboard - tap any story for full detail",
      "Blog topic suggestions fed directly into your marketing tool"
    ],
    roi: {
      inputs: [
        { id: "suppliers", label: "Number of suppliers", min: 1, max: 50, default: 8, step: 1 },
        { id: "newstime", label: "Minutes spent researching news per week", min: 10, max: 300, default: 60, step: 10 },
        { id: "hourlyrate", label: "Your hourly rate", min: 50, max: 500, default: 120, step: 10, prefix: "$" }
      ],
      calculate: "const saved = Math.round(newstime * 0.75); const monthly = Math.round((saved * 4 * hourlyrate) / 60); const leads = suppliers; const booked = Math.round(monthly / 500); return { leads, afterHours: saved, booked, revenue: monthly };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and select your industry and preferred news sources." },
      { icon: "⚙️", title: "Settings", desc: "Connect your email and set your digest frequency and source preferences." },
      { icon: "🚀", title: "Live", desc: "Your personalised industry dashboard updates automatically every day." }
    ]
  },
  {
    id: "executive-summary",
    toolId: "bi",
    status: "built",
    icon: "📊",
    category: "intelligence",
    category_label: "Business Intelligence",
    title: ["Business Intelligence", "Dashboard"],
    tagline: "Your AI business advisor",
    desc: "Your AI business advisor. It analyses activity across all your tools, your content library, and your accounting software - then goes further. AI predicts opportunities for new products and services, analyses your local competitive landscape, and recommends how to stay ahead. The more tools you activate, the smarter it gets.",
    price: "$89",
    benefits: [
      "AI predicts new product and service opportunities for your business",
      "Local competitive analysis with regional and demographic data",
      "Gets smarter the more tools you activate",
      "Integrates with MYOB and Xero for real business context",
      "Management and board-ready report outputs"
    ],
    roi: {
      inputs: [
        { id: "revenue", label: "Annual revenue", min: 50000, max: 5000000, default: 500000, step: 50000, prefix: "$" },
        { id: "tools", label: "Number of TradeAI tools active", min: 1, max: 13, default: 4, step: 1 },
        { id: "margin", label: "Current profit margin percentage", min: 5, max: 60, default: 20, step: 5 }
      ],
      calculate: "const insight = Math.round(revenue * 0.05 * (tools / 13)); const booked = Math.round(insight / 10000); const leads = tools * 3; return { leads, afterHours: insight, booked, revenue: insight };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and connect your accounting software and active tools." },
      { icon: "⚙️", title: "Settings", desc: "Set your industry, region and reporting preferences." },
      { icon: "🚀", title: "Live", desc: "Your AI advisor analyses your data and surfaces opportunities and recommendations." }
    ]
  },
  {
    id: "tender-response",
    toolId: "tender",
    status: "pending",
    icon: "📝",
    category: "operations",
    category_label: "Operations",
    title: ["Tender Response", "Generator"],
    tagline: "Win more tenders with less effort",
    desc: "Upload any RFT or RFQ - AI reads the requirements, searches your content library for relevant experience, certifications, and project history, then generates a professional tender response. Review it with AI-assisted editing - tap a button to expand sections, add detail, or adjust tone. Download as PDF or Word.",
    price: "$99",
    benefits: [
      "AI reads and breaks down complex RFT and RFQ documents",
      "Pulls from your content library, certifications and project history",
      "AI-assisted editing with expand, formalise and strengthen buttons",
      "Learns formatting from your past tender responses",
      "Download as PDF or Word - ready to submit"
    ],
    roi: {
      inputs: [
        { id: "tenders", label: "Tenders submitted per year", min: 1, max: 50, default: 8, step: 1 },
        { id: "tenderval", label: "Average tender value", min: 5000, max: 2000000, default: 150000, step: 5000, prefix: "$" },
        { id: "winrate", label: "Current win rate percentage", min: 5, max: 80, default: 25, step: 5 }
      ],
      calculate: "const extraWins = Math.round(tenders * 0.15); const revenue = extraWins * tenderval; const booked = extraWins; const leads = tenders; return { leads, afterHours: Math.round(tenders * 8), booked, revenue };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and upload your past tender responses so AI learns your format." },
      { icon: "⚙️", title: "Settings", desc: "Confirm your business profile, certifications and default sections." },
      { icon: "🚀", title: "Live", desc: "Upload any RFT or RFQ and receive a complete professional response in minutes." }
    ]
  },
  {
    id: "quote-enhancer",
    toolId: "quote-enhancer",
    status: "pending",
    icon: "💰",
    category: "operations",
    category_label: "Operations",
    title: ["Quote", "Enhancer"],
    tagline: "Every quote looks like a premium operator wrote it",
    desc: "Enter your line items and prices - or import them from your quoting tool - and AI transforms them into a professional branded quote. Detailed scope of works, warranty terms, payment milestones, exclusions, and a cover page with your branding. Add project photos and concept renders. Download as PDF or Word, or send it straight to the customer.",
    price: "Coming Soon",
    benefits: [
      "AI writes professional scope of works from basic line items",
      "AI-generated warranty language and trade-specific exclusions",
      "Branded cover page and professional formatting included",
      "Warranty library set up once and flows into every job",
      "Download as PDF or Word or send direct to customer"
    ],
    roi: {
      inputs: [
        { id: "quotes", label: "Quotes sent per month", min: 1, max: 100, default: 15, step: 1 },
        { id: "quoteval", label: "Average quote value", min: 500, max: 500000, default: 8000, step: 500, prefix: "$" },
        { id: "winrate", label: "Current win rate percentage", min: 5, max: 80, default: 35, step: 5 }
      ],
      calculate: "const extraWins = Math.round(quotes * 0.1); const revenue = extraWins * quoteval; const booked = extraWins; const leads = quotes; return { leads, afterHours: Math.round(quotes * 0.1 * 100), booked, revenue };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and set up your warranty library and default exclusions per trade." },
      { icon: "⚙️", title: "Settings", desc: "Configure your cover page branding, payment milestone templates and terms." },
      { icon: "🚀", title: "Live", desc: "Enter your prices and AI instantly generates a complete professional quote." }
    ]
  },
  {
    id: "swms",
    toolId: "swms",
    status: "pending",
    icon: "🦺",
    category: "operations",
    category_label: "Operations",
    title: ["SWMS and", "Safety Docs"],
    tagline: "Job-specific safety docs in minutes",
    desc: "Describe the job and AI generates a Safe Work Method Statement specific to the work, your trade, and your state - hazards, risks, controls, PPE, emergency procedures. Workers sign off on-site with digital signatures on their phone. Build a library of templates that get smarter with every job.",
    price: "Coming Soon",
    benefits: [
      "Job-specific SWMS tailored to your trade, job and state",
      "State and territory compliant - correct WHS regulator and legislation",
      "Digital signature capture on-site - no paper needed",
      "Template library builds and gets smarter with every job",
      "Site inductions, toolbox talks and incident reports included"
    ],
    roi: {
      inputs: [
        { id: "jobs", label: "Jobs per month requiring SWMS", min: 1, max: 100, default: 12, step: 1 },
        { id: "swmstime", label: "Minutes to create a SWMS manually", min: 15, max: 240, default: 45, step: 15 },
        { id: "hourlyrate", label: "Your hourly rate", min: 50, max: 500, default: 120, step: 10, prefix: "$" }
      ],
      calculate: "const saved = Math.round(swmstime * 0.8); const monthly = Math.round((saved * jobs * hourlyrate) / 60); const booked = Math.round(monthly / 1000); const leads = jobs; return { leads, afterHours: saved * jobs, booked, revenue: monthly };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and upload your existing SWMS templates so AI learns your preferences." },
      { icon: "⚙️", title: "Settings", desc: "Set your default control measures, PPE requirements and state or territory." },
      { icon: "🚀", title: "Live", desc: "Describe the job and receive a compliant SWMS ready for digital sign-off in minutes." }
    ]
  },
  {
    id: "customer-updates",
    toolId: "customer-updates",
    status: "pending",
    icon: "📸",
    category: "operations",
    category_label: "Operations",
    title: ["Customer Progress", "Updates"],
    tagline: "No more anxious customers calling to ask what is happening",
    desc: "Keep your customers in the loop without the hassle. Take photos on-site, tap send, and AI creates a professional branded progress update - what was done today, photos, and what is next. Your customer gets a clean update via email or a shareable link they can check anytime.",
    price: "Coming Soon",
    benefits: [
      "One tap to send - AI writes the professional update from your photos",
      "Branded customer-facing progress page with shareable link",
      "Reduces anxious customer calls during the job",
      "Creates documented project history as evidence if needed",
      "Automatically triggers handover docs and review request at completion"
    ],
    roi: {
      inputs: [
        { id: "activejobs", label: "Active jobs at any time", min: 1, max: 50, default: 6, step: 1 },
        { id: "calls", label: "Customer progress calls per week", min: 1, max: 50, default: 10, step: 1 },
        { id: "hourlyrate", label: "Your hourly rate", min: 50, max: 500, default: 120, step: 10, prefix: "$" }
      ],
      calculate: "const savedCalls = Math.round(calls * 0.7); const monthly = Math.round((savedCalls * 4 * 10 * hourlyrate) / 60); const booked = Math.round(monthly / 1000); const leads = activejobs; return { leads, afterHours: savedCalls * 4, booked, revenue: monthly };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and create your first project with customer name and job details." },
      { icon: "⚙️", title: "Settings", desc: "Set your default update template and delivery preferences - email, link or both." },
      { icon: "🚀", title: "Live", desc: "Take a photo on-site, tap send, and your customer receives a professional branded update." }
    ]
  },
  {
    id: "handover-docs",
    toolId: "handover-docs",
    status: "pending",
    icon: "📦",
    category: "operations",
    category_label: "Operations",
    title: ["Handover", "Documentation"],
    tagline: "Leave every customer impressed",
    desc: "Finish a job and hand your customer a professional branded pack - project summary, before and after photos, maintenance guide, warranty details - everything they need. Add key components like pumps or fixtures - AI searches the manufacturer and pulls real maintenance details and warranty terms into the document.",
    price: "Coming Soon",
    benefits: [
      "AI generates everything from your existing project data",
      "Maintenance guide auto-generated per trade and job type",
      "Component lookup pulls real manufacturer warranty and maintenance data",
      "Australian Consumer Law statutory guarantee auto-included",
      "Triggers review request at the perfect moment - job completion"
    ],
    roi: {
      inputs: [
        { id: "jobspm", label: "Jobs completed per month", min: 1, max: 100, default: 10, step: 1 },
        { id: "jobval", label: "Average job value", min: 500, max: 500000, default: 8000, step: 500, prefix: "$" },
        { id: "referrals", label: "Referrals expected from better handovers", min: 0, max: 10, default: 2, step: 1 }
      ],
      calculate: "const revenue = referrals * jobval * 12; const booked = referrals * 12; const leads = jobspm; return { leads, afterHours: jobspm * 12, booked, revenue };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and set up your warranty library and maintenance guide preferences." },
      { icon: "⚙️", title: "Settings", desc: "Configure your branded cover page and default handover document sections." },
      { icon: "🚀", title: "Live", desc: "Complete a job and generate a professional branded handover pack in minutes." }
    ]
  },
  {
    id: "review-booster",
    toolId: "review-booster",
    status: "pending",
    icon: "⭐",
    category: "marketing",
    category_label: "Marketing",
    title: ["Review and Referral", "Booster"],
    tagline: "Turn happy customers into your best salespeople",
    desc: "Finish a job and a branded review request is automatically sent to your customer - or send one with a single tap. It follows up if they have not responded, and once they leave a review, it asks if they know someone who needs your services. Track every request, review, and referral on your dashboard.",
    price: "Coming Soon",
    benefits: [
      "Automated branded review requests sent at job completion",
      "Follow-up reminders catch customers who meant to review but forgot",
      "Referral mechanic turns every happy customer into a lead source",
      "Dashboard tracks every request, review and referral in one place",
      "Google reviews directly improve your local SEO and new customer acquisition"
    ],
    roi: {
      inputs: [
        { id: "jobspm", label: "Jobs completed per month", min: 1, max: 100, default: 10, step: 1 },
        { id: "jobval", label: "Average job value", min: 500, max: 500000, default: 8000, step: 500, prefix: "$" },
        { id: "reviewrate", label: "Expected review conversion rate percentage", min: 5, max: 80, default: 30, step: 5 }
      ],
      calculate: "const reviews = Math.round(jobspm * (reviewrate / 100)); const referrals = Math.round(reviews * 0.15); const revenue = referrals * jobval * 12; const booked = referrals * 12; return { leads: reviews, afterHours: referrals, booked, revenue };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and paste in your Google Business Profile review link." },
      { icon: "⚙️", title: "Settings", desc: "Set your follow-up reminder timing and referral message preferences." },
      { icon: "🚀", title: "Live", desc: "Complete jobs and review requests go out automatically - referrals follow." }
    ]
  },
  {
    id: "design-viz",
    toolId: "design-viz",
    status: "pending",
    icon: "🎨",
    category: "marketing",
    category_label: "Marketing",
    title: ["Design", "Visualiser"],
    tagline: "Show customers what they are paying for before you start",
    desc: "Upload a site photo, describe the project, and AI generates a professional concept visualisation. Request variations - different colours, materials, or layouts - until it is perfect. Use it in your quotes, tenders, and marketing. Activate it with your website chatbot and customers can generate their own renders.",
    price: "Coming Soon",
    benefits: [
      "Turns every quote into a visual pitch - dramatically increases conversion",
      "No design skills or expensive rendering software needed",
      "Works from a simple phone photo - no professional photography needed",
      "Renders automatically flow into quotes, tenders and marketing content",
      "Customers can generate their own renders via your website chatbot"
    ],
    roi: {
      inputs: [
        { id: "quotes", label: "Quotes sent per month", min: 1, max: 100, default: 15, step: 1 },
        { id: "quoteval", label: "Average quote value", min: 500, max: 500000, default: 12000, step: 500, prefix: "$" },
        { id: "convlift", label: "Expected conversion rate increase percentage", min: 5, max: 50, default: 15, step: 5 }
      ],
      calculate: "const extraWins = Math.round(quotes * (convlift / 100)); const revenue = extraWins * quoteval; const booked = extraWins; const leads = quotes; return { leads, afterHours: Math.round(quotes * convlift), booked, revenue };"
    },
    steps: [
      { icon: "⚡", title: "Activate", desc: "Subscribe and set your default style preferences and watermark settings." },
      { icon: "⚙️", title: "Settings", desc: "Choose customer-facing chatbot mode - off, watermarked or full access." },
      { icon: "🚀", title: "Live", desc: "Upload a site photo, describe the project and receive a professional concept render instantly." }
    ]
  }
];


const INDUSTRY_SPECIFIC = {
  pool: [
    {
      id: "pool-chemistry", cat: "Operations", icon: "🧪", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Pool Chemistry Advisor",
      desc: "Customers enter test results and AI tells them exactly what to add. Reduces support calls by 70% — builds loyalty.",
      live: false,
      roiLabel1: "Pools you maintain", roiLabel2: "Support calls/month", roiDefault1: 150, roiDefault2: 40,
      benefits: ["Customers enter test strip results, AI recommends treatment", "Calculates exact dosage based on pool volume", "Reduces 'chemistry help' calls by 70%", "Seasonal adjustment recommendations included"],
      example: `POOL CHEMISTRY — Williams Pool

Test results entered: 17 Feb 2026
Chlorine: 0.8 ppm (LOW ⚠️)
pH: 7.9 (HIGH ⚠️)

WHAT TO DO NOW:
1. Add 800g chlorine granules
2. Add 480g pH Minus (dry acid)
3. Run pump 4 hours
4. Retest this evening

Shopping list: ~$30 at pool shop
[Video: How to Add Chemicals]`,
    },
    {
      id: "warranty-tracker", cat: "Documents & Admin", icon: "🛡️", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Warranty Claim Manager",
      desc: "Track all warranties — structure, equipment, tiling. Auto-reminds customers before expiry and handles claims digitally.",
      live: false,
      roiLabel1: "Pools under warranty", roiLabel2: "Hours on warranty admin/month", roiDefault1: 200, roiDefault2: 2,
      benefits: ["Tracks structural (7yr), equipment (2yr), tiling warranties", "Sends reminders 60 days before expiry", "Digital warranty claim lodgment with photos", "Prevents warranty disputes with clear records"],
      example: `WARRANTY STATUS — Williams Pool

Structure (Blue Haven): 7 years ✓ 7yrs remaining
Equipment (Zodiac): 2 years ✓ 2yrs remaining
Tiling: 2 years ✓ 2yrs remaining

Warranty claim lodged:
Pump grinding noise → Zodiac service notified
Tracking #ZOD-2026-447
Resolution expected: 5-7 business days`,
    },
    {
      id: "seasonal-reminder", cat: "Marketing", icon: "🍂", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Seasonal Pool Care Reminders",
      desc: "Auto-sends seasonal maintenance tips and service offers to your entire customer database. Generates recurring revenue effortlessly.",
      live: false,
      roiLabel1: "Pools in database", roiLabel2: "Seasonal campaigns per year", roiDefault1: 300, roiDefault2: 4,
      benefits: ["Spring opening, summer tips, winter closing campaigns", "Includes service booking links", "Upsells covers, heating, automation", "Generates $15-30k additional revenue per year"],
      example: `WINTER CARE REMINDER — Sent to 300 customers

Hi Sarah, winter's here! 🍂

CHECKLIST
□ Reduce chlorinator to 20-30%
□ Balance pH (7.2-7.6)
□ Clean filter

OFFER: Winter service package $180
Covers everything in the checklist — 
we come to you.

[Book Winter Service]

Results: 42 bookings = $7,560 revenue`,
    },
    {
      id: "license-tracker", cat: "Documents & Admin", icon: "📋", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "License & Compliance Tracker",
      desc: "Track QBCC licenses, insurance certificates and staff qualifications. Never miss a renewal or fail an audit.",
      live: false,
      roiLabel1: "Licenses & policies tracked", roiLabel2: "Hours on compliance/month", roiDefault1: 6, roiDefault2: 4,
      benefits: ["Tracks QBCC/VBA builder licenses", "Monitors public liability & contract works insurance", "Alerts 60 days before expiry", "Digital certificate storage ready for tender submissions"],
      example: `COMPLIANCE DASHBOARD

QBCC License #12345678
Status: ✓ CURRENT (expires Jun 2027)
Renewal reminder: set for April 2027

Public Liability: $20M ✓ CURRENT
Contract Works: ✓ CURRENT

Staff:
Mark Chen — Supervisor Cert ✓
⚠️ Emma Thompson — expires in 6 months

[Download All Certificates for Tender]`,
    },
  ],
  hvac: [
    {
      id: "service-prioritizer", cat: "Operations", icon: "🚨", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Service Call Prioritiser",
      desc: "AI automatically triages incoming calls by urgency. No cooling + server room = emergency. Blocked drain = routine. Routes correctly every time.",
      live: false,
      roiLabel1: "Service calls per month", roiLabel2: "Minutes triaging per call", roiDefault1: 80, roiDefault2: 5,
      benefits: ["Auto-categorises: Emergency / Urgent / Routine / Quote", "Flags: 'no cooling', 'gas smell', 'water leak', 'burning smell'", "Dispatches urgent jobs within 4 hours automatically", "Routes to nearest technician by GPS"],
      example: `CALL TRIAGE — Monday 9:15 AM

🚨 EMERGENCY
Medical centre — AC completely dead, server room heating
→ Mike dispatched, ETA 25 mins

⚡ URGENT
"Grinding noise, burning smell" — residential
→ James scheduled 2:00 PM today

📋 ROUTINE
Slow draining — not urgent
→ Scheduled Wednesday AM

All customers notified automatically.`,
    },
    {
      id: "refrigerant-tracker", cat: "Documents & Admin", icon: "🧪", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Refrigerant Gas Tracker",
      desc: "Track all refrigerant usage and generate EPA-compliant quarterly reports automatically. Never miss a compliance deadline.",
      live: false,
      roiLabel1: "Gas transactions/month", roiLabel2: "Minutes per record", roiDefault1: 30, roiDefault2: 8,
      benefits: ["Logs every gas purchase and usage automatically", "Generates quarterly EPA compliance reports", "Tracks technician ARCtick license expiry dates", "Alerts when stock levels are low"],
      example: `REFRIGERANT REPORT — Q4 2025

R32: 38.5kg used across 24 jobs
R410A: 28kg used across 18 jobs

EPA Report: Ready to submit ✓

⚠️ LOW STOCK — Reorder now:
R32: 2 × 15kg cylinders ($1,260)
R410A: 1 × 15kg cylinder ($720)

[Auto-generate purchase order]
[Submit EPA report]`,
    },
    {
      id: "maintenance-scheduler-hvac", cat: "Operations", icon: "🔄", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Preventative Maintenance Scheduler",
      desc: "Auto-reminds past customers when their annual service is due. Books appointments without you lifting a finger. Guaranteed recurring revenue.",
      live: false,
      roiLabel1: "Customers with systems installed", roiLabel2: "Services booked per month", roiDefault1: 150, roiDefault2: 12,
      benefits: ["Tracks every system install date automatically", "Sends reminder 2 weeks before service due", "Customers can book online instantly", "Follows up if no response after 1 week"],
      example: `MAINTENANCE REMINDER — Sent automatically

Hi Sarah, your annual AC service is due!

Your Daikin split system at 22 Park Ave 
was installed 12 months ago.

Service cost: $180 (inc GST)
Takes: 45 minutes

[Book Online — choose your time]

Available:
• Wed 20 Feb, 10:00 AM ✓
• Thu 21 Feb, 2:00 PM ✓

28 reminders sent this month → 12 bookings`,
    },
    {
      id: "energy-calculator", cat: "Sales & Quotes", icon: "⚡", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Energy Efficiency Calculator",
      desc: "Show customers exactly how much they'll save upgrading to a new system. Convert 40% more upgrade quotes to sales with real data.",
      live: false,
      roiLabel1: "Upgrade quotes per month", roiLabel2: "Minutes calculating savings", roiDefault1: 15, roiDefault2: 20,
      benefits: ["Calculates annual running costs of current vs new system", "Shows payback period for the upgrade investment", "Includes government rebates and incentives", "Visual comparison — proves ROI to customers"],
      example: `ENERGY SAVINGS — Roberts Law Firm

Current system (2012): $3,240/year power
New Daikin VRV: $2,173/year power

Annual saving: $1,067
+ Reduced repairs: $800
= Total saving: $1,867/year

Upgrade cost: $20,300 (after rebates)
Payback: 10.9 years

BUT your old system needs replacement 
anyway — upgrading now saves $8,000 
versus replacing later.

[Accept Quote]`,
    },
  ],
  electrical: [
    {
      id: "test-tag-manager", cat: "Documents & Admin", icon: "🔌", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Test & Tag Manager",
      desc: "Track all appliance testing schedules, generate AS/NZS 3760 compliant certificates and auto-remind commercial clients before retest is due.",
      live: false,
      roiLabel1: "Appliances tested/month", roiLabel2: "Minutes per certificate", roiDefault1: 120, roiDefault2: 5,
      benefits: ["Auto-generates AS/NZS 3760 compliant test certificates", "Tracks retest due dates for every appliance", "Sends automatic reminders to commercial clients", "Mobile app for on-site testing and QR code scanning"],
      example: `TEST & TAG CERTIFICATE

HP Desktop — Asset WF-0847
Location: Level 2, Desk 24
Test date: 17 Feb 2026
Next retest: 17 Feb 2027

✓ Earth continuity: 0.08Ω
✓ Insulation: >100MΩ
✓ Polarity: Correct

Result: PASS ✓
Tag: Green (Annual)

[QR Code for asset history]`,
    },
    {
      id: "compliance-cert-gen", cat: "Documents & Admin", icon: "📜", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Compliance Certificate Generator",
      desc: "Auto-fill electrical compliance certificates from job details. Compliant with QLD, NSW, VIC, SA and WA regulations — generated in seconds.",
      live: false,
      roiLabel1: "Certificates per month", roiLabel2: "Minutes per certificate", roiDefault1: 35, roiDefault2: 15,
      benefits: ["Compliant with all state electrical safety regulations", "Pre-fills from job details automatically", "Digitally signed and emailed to customer", "Integrates with state authority lodgment systems"],
      example: `CERTIFICATE OF ELECTRICAL COMPLIANCE
QLD Electrical Safety Act 2002

Cert #EC-2026-08471 — 17 Feb 2026
Licensed Electrician: Mike Chen E12345

Work: 32A supply for ducted AC system
Location: 22 Park Ave, Paddington

✓ Continuity of earthing: Pass
✓ Insulation resistance: >50MΩ
✓ RCD trip time: 18ms (Pass)

Lodged with ESO: 17/02/2026 ✓`,
    },
    {
      id: "emergency-dispatch", cat: "Operations", icon: "🚨", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Emergency Callout Dispatcher",
      desc: "Routes after-hours emergencies to your on-call electrician automatically via GPS. Calculates callout fees and sends job details.",
      live: false,
      roiLabel1: "Emergency calls/month", roiLabel2: "Minutes per dispatch", roiDefault1: 20, roiDefault2: 10,
      benefits: ["24/7 AI answering for emergency calls", "Routes to nearest available electrician via GPS", "Calculates callout fee: time and distance", "SMS job details to electrician before arrival"],
      example: `🚨 EMERGENCY DISPATCH — 11:47 PM

Customer: Sarah Williams, 22 Park Ave
"No power, sparks from switchboard, burning smell"

Risk: HIGH — immediate response
Nearest: Mike Chen (2.8km, on-call)

SMS sent to Mike: 11:48 PM
Customer: "Electrician on way, ETA 12:00 AM"

Mike arrived: 11:58 PM
Issue: Main switchboard fault
Resolved: 1.2 hours
Invoice: $394 (inc GST)
Rating: 5/5 ⭐`,
    },
  ],
  fabrication: [
    {
      id: "material-optimizer", cat: "Operations", icon: "📐", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Material Cutting Optimiser",
      desc: "AI calculates the most efficient way to cut steel sheets and sections. Reduce waste by 40-60% and save $5-10k per year.",
      live: false,
      roiLabel1: "Cutting jobs/month", roiLabel2: "Current waste %", roiDefault1: 50, roiDefault2: 18,
      benefits: ["Optimises cutting patterns to reduce waste by 40-60%", "Works with sheets, tubes, angles and flat bar", "Accounts for blade width (kerf) automatically", "Generates cutting diagrams for the workshop"],
      example: `CUTTING OPTIMISATION — Job #2456
Steel shelving: 20 uprights + 40 shelves

Standard approach: 22 lengths = $1,870
AI optimised: 17 lengths = $1,445

YOU SAVE: $425 per job (23%)

Pattern A: 2400 | 2400 | 1200 = 6000mm ✓
Pattern B: 1200 × 4 | 600 × 2 = 6000mm ✓

[Generate cutting diagrams for workshop]`,
    },
    {
      id: "weld-tracker", cat: "Documents & Admin", icon: "🔥", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Welder Qualification Tracker",
      desc: "Track welder certifications, WPS/PQR qualifications and AS 1554 compliance. Know who can work on what — every job.",
      live: false,
      roiLabel1: "Welders on staff", roiLabel2: "Compliance checks/month", roiDefault1: 8, roiDefault2: 20,
      benefits: ["Tracks all welder qualifications and expiry dates", "Manages WPS (Welding Procedure Specifications)", "Ensures AS 1554.1 compliance automatically", "Alerts 30 days before cert expiry"],
      example: `WELDER QUALIFICATIONS — Mike Chen

✓ Structural Steel (AS 1554.1) — expires Aug 2026
✓ Pressure Vessels (AS 3992) — expires Nov 2026
✗ Aluminium TIG — EXPIRED Jan 2026

Job #2456 — Structural steel:
Mike Chen: ✓ APPROVED

⚠️ Book requalification for aluminium cert`,
    },
    {
      id: "job-costing", cat: "Financial Management", icon: "💰", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Real-Time Job Costing",
      desc: "Track actual costs vs quoted in real-time. Know if you're making or losing money before the job finishes — not after.",
      live: false,
      roiLabel1: "Jobs running at once", roiLabel2: "Hours on manual tracking", roiDefault1: 12, roiDefault2: 3,
      benefits: ["Tracks materials, labour, consumables in real-time", "Alerts when job exceeds budget by 10%", "Shows profit margin on every active job", "Identifies which job types are most profitable"],
      example: `JOB COSTING — #2456 Warehouse Beams

Budget: $12,500
Actual so far: $9,240 (65% complete)
Projected final: $14,215

⚠️ OVER BUDGET by $1,715
Cause: Extra steel, design change

Action: Variation issued to customer $2,100

Most profitable jobs:
1. Architectural screens: 42% margin
2. Custom gates: 38% margin
3. Repairs: 18% ⚠️ Review pricing`,
    },
    {
      id: "quality-checklist", cat: "Documents & Admin", icon: "✅", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Quality Inspection Checklist",
      desc: "Digital inspection checklists with photos for every job stage. Prove quality, prevent rework and reduce defects by 60%.",
      live: false,
      roiLabel1: "Jobs per month", roiLabel2: "Minutes per inspection", roiDefault1: 20, roiDefault2: 15,
      benefits: ["Pre-built checklists for common job types", "Attach photos at each inspection point", "Digital signatures from supervisors", "Automatic reports emailed to customers"],
      example: `QUALITY INSPECTION — Job #2456
Pre-delivery check — 16 Feb 2026

✓ Dimensional checks: All within ±2mm
✓ Weld inspection: No defects
✓ Surface finish: Primer applied
✓ Documentation: Certs on file
📸 3 photos attached

RESULT: PASS — Ready for delivery
Signed: Sarah Wong (Supervisor)`,
    },
  ],
  plumbing: [
    {
      id: "emergency-router", cat: "Operations", icon: "🚰", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Emergency Job Router",
      desc: "AI prioritises burst pipes and gas leaks over blocked drains. Routes urgent jobs to the nearest available plumber every time.",
      live: false,
      roiLabel1: "Service calls per day", roiLabel2: "Minutes triaging", roiDefault1: 25, roiDefault2: 5,
      benefits: ["Detects keywords: burst pipe, gas leak, no hot water", "Routes emergencies within 5 minutes", "Sends job details and customer history to plumber's phone", "Tracks response times for quality control"],
      example: `JOB TRIAGE — 9:15 AM

🚨 EMERGENCY
"Burst pipe in ceiling, water into bedroom"
→ Tom dispatched (2.1km), ETA 9:28 AM

⚡ URGENT
"Gas smell in kitchen"
→ Mike dispatched (safety priority)

📋 ROUTINE
"Slow draining kitchen sink"
→ James scheduled 2:00 PM

All customers notified with ETA.`,
    },
    {
      id: "backflow-scheduler", cat: "Operations", icon: "💧", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Backflow Testing Scheduler",
      desc: "Annual backflow testing reminders, auto-booking and certificate generation. Guaranteed, predictable recurring revenue.",
      live: false,
      roiLabel1: "Backflow devices tracked", roiLabel2: "Services booked/month", roiDefault1: 200, roiDefault2: 15,
      benefits: ["Tracks all installed backflow devices", "Sends reminder 6 weeks before test due", "Generates compliance certificates automatically", "Generates $20-30k recurring revenue per year"],
      example: `BACKFLOW REMINDER — Sent automatically

Hi David, your annual test is due by 31 March.

Device: RPZ valve — 45 Smith St
Last tested: March 2025
Cost: $165 inc GST

[Book Online] or call us

Required by law (Plumbing & Drainage Act)
Avoid $1,100 council fines.`,
    },
    {
      id: "hot-water-selector", cat: "Sales & Quotes", icon: "♨️", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Hot Water System Selector",
      desc: "AI recommends the perfect hot water system based on household size, usage and budget — with running costs and payback calculated.",
      live: false,
      roiLabel1: "Hot water quotes/month", roiLabel2: "Minutes per recommendation", roiDefault1: 20, roiDefault2: 15,
      benefits: ["5 questions → best system recommendation", "Compares gas, electric, heat pump, solar", "Calculates 10-year total cost of ownership", "Includes all government rebates automatically"],
      example: `HOT WATER RECOMMENDATION
Williams Residence — 4 people

RECOMMENDED: Heat Pump (Stiebel Eltron 302L)

Current electric: $950/year
Heat pump: $280/year
Annual saving: $670

After rebates: $3,800 net cost
Payback: 5.7 years
10-year saving: $4,500+

[Accept Quote] [Compare Options]`,
    },
  ],
  construction: [
    {
      id: "subcontractor-coordinator", cat: "Operations", icon: "👷", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Subcontractor Coordinator",
      desc: "Auto-schedules and tracks all subbies. Sends notifications, tracks invoices and prevents scheduling conflicts automatically.",
      live: false,
      roiLabel1: "Subbies per project", roiLabel2: "Hours coordinating/week", roiDefault1: 8, roiDefault2: 6,
      benefits: ["Auto-schedules trades in correct sequence", "Sends SMS reminders 24hrs before start", "Tracks invoices and payment schedules", "Flags scheduling conflicts automatically"],
      example: `SUBBIE SCHEDULE — 17-21 Feb

MON: Plumber — first fix ✓ Confirmed
TUE: ⚠️ Conflict detected
     Plumber running over
     → Electrician rescheduled to Wed
     → Both notified automatically

THU: Gyprock — wall lining
     ⚠️ Awaiting confirmation
     Follow-up sent

All insurance & licenses verified ✓`,
    },
    {
      id: "site-diary", cat: "Documents & Admin", icon: "📔", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Digital Site Diary",
      desc: "Voice-to-text site notes with automatic weather logging, photo tagging and daily reports emailed to all stakeholders.",
      live: false,
      roiLabel1: "Diary entries/week", roiLabel2: "Minutes per entry", roiDefault1: 5, roiDefault2: 15,
      benefits: ["Voice recording converts to text automatically", "Auto-logs weather conditions and temperature", "Attach photos with automatic date/location stamps", "Daily summary emailed to client and office"],
      example: `SITE DIARY — 17 Feb 2026

Weather: 28°C, partly cloudy ✓ (auto-logged)

Voice note transcribed:
"Crew of 4 arrived 7:00 AM. Formwork on 
east wall complete. Plumber first fix done 
by 2 PM. Inspector visited 11 AM, approved 
formwork, cleared for tomorrow's pour."

Photos attached: 4 (auto-tagged with time)
Report emailed to: client, office ✓`,
    },
    {
      id: "variation-tracker", cat: "Financial Management", icon: "📝", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Variation Order Manager",
      desc: "Track all design changes, generate variation quotes instantly and get digital client approval. Stop scope creep and unpaid work.",
      live: false,
      roiLabel1: "Variations per project", roiLabel2: "Hours on variation admin", roiDefault1: 8, roiDefault2: 1.5,
      benefits: ["Generates variation quotes in 5 minutes", "Digital client approval with e-signature", "Tracks all changes vs original contract", "Recovers $10-20k in missed charges per year"],
      example: `VARIATION #004 — 14 Feb 2026

Change: Additional window east wall
Materials + labour: $1,850 + GST = $2,035

Client: [Approve $2,035] ← Clicked
Status: ✓ APPROVED — 15 Feb 9:45 AM
Digital signature: Sarah Williams

Contract updated:
Original: $285,000
Variations: $6,835
New total: $291,835`,
    },
    {
      id: "rfi-manager", cat: "Documents & Admin", icon: "❓", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "RFI & Query Manager",
      desc: "Track all Requests for Information, automatically follow up, and prevent delays caused by unanswered design queries.",
      live: false,
      roiLabel1: "RFIs per project", roiLabel2: "Hours chasing responses", roiDefault1: 15, roiDefault2: 2,
      benefits: ["Generates professional RFIs from templates", "Tracks response times and overdue items", "Auto-follows up unanswered RFIs", "Prevents project delays from information gaps"],
      example: `RFI #012 — 14 Feb 2026

Query: Drawing shows 1800mm window but 
spec calls for 2100mm. Which is correct?

Impact if not resolved:
• Window order delayed
• Framing cannot proceed

Response required by: 18 Feb 2026

STATUS: ✓ RESOLVED in 23 hours
"Specification correct — 2100mm. 
Drawing Rev B issued today."`,
    },
  ],
  landscaping: [
    {
      id: "plant-selector", cat: "Sales & Quotes", icon: "🌱", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Smart Plant Selector",
      desc: "AI recommends the right plants based on location, soil, sun and client preferences. Reduce plant failures by 70%.",
      live: false,
      roiLabel1: "Design consultations/month", roiLabel2: "Minutes researching plants", roiDefault1: 20, roiDefault2: 30,
      benefits: ["Recommends plants for Brisbane/Melbourne/Sydney climates", "Considers sun, soil, water needs automatically", "Suggests native, drought-tolerant options", "Generates plant list with supplier codes for ordering"],
      example: `PLANT SELECTION — Williams Residence

Site: Brisbane, north-facing, clay soil, full sun
Preference: Native, low maintenance

RECOMMENDED:
• Lilly Pilly 'Resilience' ×8 — screening
• Coastal Banksia ×4 — feature
• Kangaroo Paw ×12 — colour
• Native Violet ×30 — groundcover

Total: 54 plants, $1,526 (under budget)
All drought tolerant ✓ Brisbane suited ✓

[Generate Quote] [View 3D Preview]`,
    },
    {
      id: "seasonal-scheduler-land", cat: "Operations", icon: "📅", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Seasonal Maintenance Scheduler",
      desc: "Auto-books seasonal services (pruning, fertilising, mulching) with past clients. Predictable recurring revenue.",
      live: false,
      roiLabel1: "Maintenance clients", roiLabel2: "Services booked/month", roiDefault1: 80, roiDefault2: 8,
      benefits: ["Seasonal reminders: Spring, Summer, Autumn, Winter", "Recommends services based on garden type", "Clients book online instantly", "Generates $30-50k recurring revenue annually"],
      example: `SPRING REMINDER — Sent to 80 clients

Hi Sarah, spring is here! 🌸

Recommended for your native garden:
✓ Spring prune & tidy
✓ Fertilise garden beds
✓ Fresh mulch layer

Service time: 3 hours — $420 inc GST

[Book Online — 3 dates available]

This month: 12 bookings from 80 sent = $5,040`,
    },
    {
      id: "irrigation-designer", cat: "Sales & Quotes", icon: "💧", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Irrigation System Designer",
      desc: "AI designs efficient drip or spray irrigation systems, calculates water usage and generates parts lists ready to order.",
      live: false,
      roiLabel1: "Irrigation quotes/month", roiLabel2: "Hours per design", roiDefault1: 10, roiDefault2: 2,
      benefits: ["Designs system based on garden layout and plant needs", "Calculates pipe sizes, pump requirements and zones", "Generates parts list with supplier codes", "Shows water savings vs manual watering"],
      example: `IRRIGATION DESIGN — Williams Residence
180m² garden, 3 zones

Zone 1: Drip for screening plants
Zone 2: Drip for feature beds
Zone 3: Pop-up spray for lawn

Weekly water: 1,275L (summer)
Annual water cost: $113

VS manual watering:
Time saved: 4hrs/week = 208hrs/year

System cost: $3,234 inc install
[Approve Design] [Add Rainwater Tank]`,
    },
  ],
  cleaning: [
    {
      id: "roster-optimizer", cat: "Operations", icon: "👥", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Smart Roster Optimiser",
      desc: "AI builds optimal cleaning rosters — staff availability, skills, site requirements, travel routing. Saves 4-6 hours per week.",
      live: false,
      roiLabel1: "Cleaners on staff", roiLabel2: "Hours rostering/week", roiDefault1: 15, roiDefault2: 4,
      benefits: ["Optimises travel routes to minimise driving", "Matches cleaner skills to site requirements", "Handles leave requests and swaps automatically", "Sends roster via SMS to all staff"],
      example: `ROSTER — Week 17 Feb

Sarah Mitchell:
06:00-09:00 Westfield Office (CBD)
09:30-12:30 Roberts Law (Spring Hill)
Travel: 12 min between sites ✓

⚠️ Emma Thompson: Annual leave Mon-Wed
→ Sites redistributed, all covered ✓

⚠️ David Lee: Sick call received
→ Backup contacted, cover confirmed ✓

All staff notified via SMS ✓`,
    },
    {
      id: "quality-audit", cat: "Documents & Admin", icon: "⭐", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Site Quality Audit System",
      desc: "Digital checklists for every clean with photos. Prove quality to clients with monthly reports. Reduces complaints by 80%.",
      live: false,
      roiLabel1: "Sites audited/month", roiLabel2: "Minutes per audit", roiDefault1: 40, roiDefault2: 20,
      benefits: ["Pre-built checklists for offices, medical, retail", "Score each area out of 5 stars with photos", "Automatic monthly reports sent to clients", "Tracks cleaner performance over time"],
      example: `QUALITY AUDIT — Westfield Office L8

Reception: ⭐⭐⭐⭐⭐ (5/5)
Kitchen: ⭐⭐⭐⭐☆ (4/5)
  ⚠️ Coffee machine exterior noted
Bathrooms: ⭐⭐⭐⭐⭐ (5/5)
Offices: ⭐⭐⭐⭐⭐ (5/5)

OVERALL: 4.75/5 — Excellent

Report auto-sent to client ✓`,
    },
    {
      id: "consumables-tracker", cat: "Financial Management", icon: "🧴", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Consumables Inventory Tracker",
      desc: "Tracks chemical and consumable usage per site. Auto-reorders before stockouts and alerts unusual usage (waste or theft).",
      live: false,
      roiLabel1: "Sites serviced", roiLabel2: "Hours on stock management/week", roiDefault1: 30, roiDefault2: 3,
      benefits: ["Tracks usage of chemicals, paper, bags per site", "Auto-generates reorder when stock is low", "Detects unusual usage patterns (waste or theft)", "Calculates cost per clean for accurate pricing"],
      example: `CONSUMABLES — February 2026

⚠️ AUTO-REORDER TRIGGERED:
Multi-purpose cleaner: Low (order 40L = $340)
Toilet paper: Low (order 10 boxes = $450)

⚠️ UNUSUAL USAGE DETECTED:
Gym (Fortitude Valley): Chemicals up 40%
Action: Supervisor to investigate

Cost per clean (Westfield):
Consumables: $12 (23% of revenue ✓)`,
    },
  ],
  manufacturing: [
    {
      id: "production-scheduler", cat: "Operations", icon: "📊", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Production Scheduler",
      desc: "AI optimises production runs, minimises changeovers and balances machine capacity. Reduce downtime by 30%.",
      live: false,
      roiLabel1: "Production runs/month", roiLabel2: "Hours scheduling/week", roiDefault1: 80, roiDefault2: 12,
      benefits: ["Optimises job sequence to minimise setup changes", "Balances workload across machines", "Accounts for material availability", "Predicts bottlenecks 1-2 weeks ahead"],
      example: `PRODUCTION SCHEDULE — Week 17 Feb

AI GROUPED aluminium jobs together:
MON AM: Job #2456 — Aluminium brackets
MON PM: Job #2461 — Aluminium plates
(Same material = 30 min setup saved ✓)
MON LATE: Job #2458 — Steel (change)

⚠️ BOTTLENECK: Powder coating 105% Thu-Fri
→ External coater contacted automatically

On-time delivery: 22/23 jobs (96%) ✓`,
    },
    {
      id: "quality-spc", cat: "Documents & Admin", icon: "📈", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Statistical Process Control (SPC)",
      desc: "Track measurements, detect process drift before defects occur, and generate control charts. Reduce scrap by 50%.",
      live: false,
      roiLabel1: "Parts inspected/month", roiLabel2: "Current scrap rate %", roiDefault1: 5000, roiDefault2: 4,
      benefits: ["Real-time control charts (X-bar, R-chart)", "Detects process drift before bad parts are made", "Automatic out-of-control alerts to supervisor", "ISO 9001 compliant documentation"],
      example: `SPC ALERT — CNC Mill #1

Hole diameter: 12.00mm ±0.05mm
Last 7 readings: trending toward upper limit

#484: 12.03mm ⚠️
#485: 12.03mm ⚠️
#486: 12.04mm ⚠️ AT LIMIT
#487: 12.04mm ⚠️ AT LIMIT

🚨 STOP PRODUCTION
Check tool wear → replace if worn
Verify calibration → resume

Estimated scrap cost if ignored: $2,400`,
    },
    {
      id: "inventory-forecaster", cat: "Financial Management", icon: "📦", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Smart Inventory Forecaster",
      desc: "AI predicts material needs 2-4 weeks ahead based on your production schedule. Auto-reorders. Prevents stockouts.",
      live: false,
      roiLabel1: "SKUs managed", roiLabel2: "Stockout incidents/month", roiDefault1: 150, roiDefault2: 8,
      benefits: ["Predicts material needs 2-4 weeks ahead", "Auto-generates purchase orders", "Prevents stockouts (95%+ fill rate)", "Reduces excess inventory by 30%"],
      example: `INVENTORY FORECAST — Next 30 Days

🚨 URGENT REORDER:
Aluminium 6061 Sheet: 4 days supply left
Forecasted need: 45 sheets
→ Order 60 sheets NOW ($4,200)

Or order 100 bulk: $6,500 ($65/sheet vs $70)
→ Save $300 + free delivery

⚠️ LOW STOCK:
Steel bar: Order by Friday
Carbide inserts: Order by Monday

[Auto-generate all purchase orders]`,
    },
    {
      id: "oee-tracker", cat: "Operations", icon: "⚡", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "OEE Performance Tracker",
      desc: "Track Overall Equipment Effectiveness (availability, performance, quality) and find your biggest improvement opportunities.",
      live: false,
      roiLabel1: "Machines tracked", roiLabel2: "Current OEE %", roiDefault1: 8, roiDefault2: 65,
      benefits: ["Calculates OEE: Availability × Performance × Quality", "Tracks downtime reasons automatically", "Benchmarks against 85% world-class standard", "Identifies top 3 improvement opportunities"],
      example: `OEE REPORT — CNC Mill #1 Feb 2026

OEE: 68% (target: 85% world-class)

Availability: 82% — 29hrs downtime
Biggest cause: Setup time (41%)

TOP 3 IMPROVEMENTS:
1. Reduce setup: 40min → 20min = +156hrs/yr
2. Prevent breakdowns: predictive maintenance
3. Improve first-pass yield: 93% → 99%

If 85% OEE achieved:
+850 parts/month = $42,500 extra revenue
No new capital required.`,
    },
  ],
  concreting: [
    {
      id: "pour-scheduler", cat: "Operations", icon: "🚛", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Smart Pour Scheduler",
      desc: "Coordinates concrete deliveries, crew and pump trucks — and auto-reschedules when rain is forecast. No more weather losses.",
      live: false,
      roiLabel1: "Pours per month", roiLabel2: "Hours coordinating logistics", roiDefault1: 25, roiDefault2: 4,
      benefits: ["Books concrete truck, pump and crew in one action", "Monitors 7-day weather forecast automatically", "Auto-reschedules if rain probability >40%", "Sends reminders to all parties 24hrs before"],
      example: `POUR SCHEDULE — Week 17-21 Feb

WED 19 FEB: Slab pour — safe ✓ (10% rain)
✓ 8m³ Hanson concrete, 7:00 AM
✓ Pump truck, crew of 4

🚨 FRI 21 FEB: POSTPONED
Rain: 85%, 18mm expected, 35km/h wind
→ Rescheduled to Monday 24 Feb 7AM
→ All parties notified, no cancel fees`,
    },
    {
      id: "mix-designer", cat: "Sales & Quotes", icon: "⚗️", badge: "advanced", badgeLabel: "✨ Advanced", isIndustrySpecific: true,
      title: "Concrete Mix Designer",
      desc: "AI recommends the optimal concrete mix for every application — strength, slump, aggregate, additives. AS 1379 compliant.",
      live: false,
      roiLabel1: "Different mix specs/month", roiLabel2: "Hours on mix design", roiDefault1: 15, roiDefault2: 2,
      benefits: ["Recommends mix based on application (slab, footings, driveway)", "Specifies strength grade and slump", "Suggests additives for summer heat automatically", "Complies with AS 1379 and AS 3600"],
      example: `MIX SPECIFICATION — Exposed Driveway

Application: 45m² exposed aggregate driveway
Strength: 32MPa (above 25MPa min)
Slump: 80mm

SUMMER ADDITIVES (essential 28°C+):
• Retarder: 500ml/m³ (extend working time)
• Plasticiser: 1L/m³ (easier to finish)
• Surface retarder spray: after pour

Order: Hanson "32MPa Exposed Agg Summer"
Quantity: 5m³ (with waste), 7:00 AM
[Generate order]`,
    },
    {
      id: "test-tracker", cat: "Documents & Admin", icon: "🧪", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Concrete Test Tracker",
      desc: "Track all test cylinders, lab results and compliance certificates. Never miss a required test or fail an inspection.",
      live: false,
      roiLabel1: "Pours per month", roiLabel2: "Cylinders to track", roiDefault1: 25, roiDefault2: 75,
      benefits: ["Logs every cylinder with pour date and location", "Tracks 7-day and 28-day test schedules", "Auto-reminds lab to test on correct dates", "Generates compliance certificates automatically"],
      example: `TEST REGISTER — February 2026

Williams Driveway (poured 14 Feb)
7-day test: Due 21 Feb ⏰ Scheduled
28-day: Due 14 Mar → reminder set

Murphy Foundation (poured 10 Feb)
7-day: Completed ✓ 31 MPa (78% of 40MPa)
28-day: Due 10 Mar → scheduled

COMPLIANCE: 100% — all on track ✓

Certificates auto-emailed after 28-day result.`,
    },
  ],
  handyman: [
    {
      id: "multi-trade-scheduler", cat: "Operations", icon: "🗓️", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Multi-Trade Job Scheduler",
      desc: "AI routes you efficiently between different trade jobs. Group by location and trade type. Fit 20% more jobs every week.",
      live: false,
      roiLabel1: "Jobs per week", roiLabel2: "Hours lost to travel/admin", roiDefault1: 18, roiDefault2: 8,
      benefits: ["Groups jobs by location and trade type", "Optimises route to minimise driving", "Accounts for materials pickup stops", "Sends customers their arrival time automatically"],
      example: `OPTIMISED SCHEDULE — Monday

Standard routing: 78km, 2.8hrs driving
AI optimised: 42km, 1.6hrs driving
Saved: 1.2 hours = room for 2 extra jobs

AM (Carpentry cluster — Paddington):
07:30 Replace deck boards → 22 Park Ave
09:30 Install shelves → 18 Hill St (2km ✓)
11:30 Repair fence → 45 Smith St (3km ✓)

PM (Plumbing cluster — Bardon):
13:30 Fix tap + install vanity
15:00 Replace shower head + toilet`,
    },
    {
      id: "parts-finder", cat: "Operations", icon: "🔍", badge: "quick", badgeLabel: "⚡ Quick Win", isIndustrySpecific: true,
      title: "Smart Parts Finder",
      desc: "Upload a photo of a broken part and AI identifies it, checks local stock and compares prices. No more wrong part purchases.",
      live: false,
      roiLabel1: "Jobs per month", roiLabel2: "Hardware store trips wasted", roiDefault1: 60, roiDefault2: 20,
      benefits: ["Upload photo → AI identifies exact part with model number", "Checks Bunnings, Mitre 10, Reece for local stock", "Compares prices and shows today's availability", "Saves frequent parts for one-click reordering"],
      example: `PARTS ID — Tap cartridge (photo uploaded)

Match: Caroma 35mm ceramic disc (94%)
Part: #237050W

Bunnings Ashgrove (4km): $25.65 trade ✓
Reece Plumbing (6km): $27.20 trade
Mitre 10 (2km): Not in stock ✗

Recommendation: Bunnings on the way
Total trip + parts: ~$45

Also grab: tap washers, teflon tape (low)`,
    },
    {
      id: "job-cost-estimator", cat: "Sales & Quotes", icon: "💵", badge: "popular", badgeLabel: "🔥 Popular", isIndustrySpecific: true,
      title: "Quick Job Cost Estimator",
      desc: "Describe the job in plain English and AI calculates the full cost — materials, labour, margin. Send a quote via SMS in 2 minutes.",
      live: false,
      roiLabel1: "Quotes per month", roiLabel2: "Minutes per quote currently", roiDefault1: 40, roiDefault2: 25,
      benefits: ["Describe job in plain English, AI calculates cost", "Materials + labour + margin included automatically", "Adjusts for complexity and access difficulty", "Send quote via SMS in under 2 minutes"],
      example: `QUICK QUOTE — Voice input

"Replace 8 deck boards, Merbau, 2.4m, 
deck is 15 years old"

Materials: $415 (boards, screws)
Labour: 3hrs @ $95 = $285
Contingency: $150 (15yr deck risk)
GST: $85

TOTAL: $935 inc GST
Margin: 29% ✓

[Send via SMS] — ready in 2 minutes`,
    },
  ],
};