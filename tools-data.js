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
    icon: "🤖",
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
