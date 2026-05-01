# CLAUDE.md
# StaxAI — Claude Code Session Reference
# Updated: April 30, 2026

---

## CRITICAL — READ BEFORE TOUCHING ANYTHING

**Platform Context:**
This platform is not live. There is only one user and all data is test data. Stripe is in LIVE MODE for testing purposes only. Decisions about database changes do not require data-loss analysis.

**For Claude Code:**
Never expose API keys, Supabase service keys, or Stripe secret keys to the browser under any circumstance.
Every new Supabase table requires RLS enabled before launch — no exceptions.
No new feature, tool page, or schema change may be built without an approved spec document in Project Knowledge.
Only change what you were asked to change. Do not refactor, restructure, or tidy code you were not explicitly asked to touch.
Avoid pure technical jargon when reporting back — explain in plain language.
Push to GitHub immediately after every commit — never leave commits unpushed at the end of a session.

**For Claude Chat:**
NEVER MAKE ASSUMPTIONS OR GUESS AND THEN PRESENT THAT INFORMATION AS FACT.
Never tell Code how to do his job technically — only what to do and why.
Use Australian English throughout — colour, organisation, recognised, etc.
Never make decisions for the owner — always ask for confirmation.
Summarise all responses from Code without leaving anything out.
Code cannot access the knowledge base, Vercel dashboard, or Supabase dashboard — Chat must provide all specs and context.

---

## Working Model

This project is built by a non-technical owner working with Claude Chat and Claude Code together. Chat handles planning, decisions, and document writing. Code handles all repo work.

Claude Code should flag clearly anything the owner needs to action themselves. When in doubt about scope or approach — stop and report to the owner so they can discuss with Chat.

Claude Code should work autonomously without asking permission at each step. Report back only when all work is complete or if something unexpected is found.

The owner will push back when needed and should be encouraged to do so.

---

## Platform Development Standards

| **Category** | **Requirement** | **Details** |
|--------------|----------------|-------------|
| **Foundation Files** | Must read before starting | Read staxai-auth.css, shared-utils.js, and Page Layout Standard in full before building any tool |
| **File Architecture** | Follow split architecture pattern | [tool].html (shell), [tool]-logic.js (window.*_LOGIC = {init()}), panel-data-[toolid].js. Max 60K chars per file. Reference Page Layout Standard for structural patterns |
| **Critical Standards** | Must follow platform essentials | Load staxai-auth.css first (single source of truth), use CSS variables only (#4A6D8C main colour), topbar.js integration, shared-utils.js functions (handleSave(), escHtml()), Australian English, modal error handling, RLS on tables, addEventListener only. **Never add new classes to staxai-auth.css without explicit owner permission.** |
| **Required Integration** | Database, API, optional patterns | API calls through Vercel functions only. Tool to CL Write-back Patterns if needed. Camera Pattern if photo capture needed. Follow CL/EA/ID implementations as reference |
| **Storage & File Patterns** | All tools use cl-assets bucket | Document uploads, file generation, and public URL creation must use the established cl-assets bucket in Supabase. Never create tool-specific storage buckets. Follow Content Library upload patterns for consistency |
| **Mobile Designation** | Check existing classification | Reference existing mobile vs desktop designation - never assume |
| **Quality Assurance** | Run Platform Audit Standard after build | Must pass comprehensive platform audit before launch. Owner has detailed checklist |

---

## Tool Rebuild Process (Strategic, Chatbot, Social)

**Phase 1: Assessment & Planning**
1. **Structural audit** — Code reads all tool files and reports current state vs platform standards
2. **Backend audit** — Code reads all API endpoints, database queries, OAuth flows and reports against current platform patterns (CL/EA/ID reference)
3. **Database audit** — Code reviews all database tables/fields and reports any missing fields, incorrect setups, or unused references
4. **Rebuild vs refactor analysis** — Code estimates effort to clean existing files vs starting fresh, recommends approach per tool
5. **Gap analysis** — Code identifies what's missing vs functional requirements and current platform capabilities
6. **Review findings together** — Decide rebuild approach and priorities per tool

**Phase 2: Rebuild**
7. **Backend fixes** — Bring all API endpoints, database patterns, OAuth flows up to platform standard
8. **Structural rebuild** — Clean files, implement proper architecture (split files, topbar.js, shared-utils.js, etc.)
9. **Stylesheet integration** — Implement all CSS variables, shared components, platform UI patterns
10. **Missing features build** — Add any functionality that's missing vs requirements
11. **Settings page rebuild** — Ensure settings follow the established pattern (CL/EA/ID style)

**Phase 3: Validation**
12. **Functional review** — Test tool end-to-end with real data against requirements
13. **Cross-platform consistency check** — Ensure dropdowns, tabs, headings, etc. match CL/EA/ID exactly
14. **Integration testing** — Confirm tool plays nicely with CL, topbar, other platform components
15. **Browser & performance testing** — Visual/functional check across browsers
16. **Final integration test** — Confirm OAuth, API connections, database operations all work correctly

---

## Active Tasks

### Task 13 — Integration Requirements

**Job Management / Accounting Integrations:**

| Integration | Status | Next Step |
|-------------|--------|-----------|
| Fergus | Credentials received and in Vercel. OAuth callback, data fetch endpoint, and UI integration built. Database column cl_fergus_accounts added to profiles table. | Awaiting API endpoint confirmation from Fergus (email sent) |
| Buildxact | Registration confirmed, awaiting credentials | Wait for Client ID & Secret from support |
| Tradify | API enquiry sent, awaiting response | May not have public API |
| MYOB | Ready but paused until launch | $110/month from day one — activate just before launch |

Callback URLs confirmed:
- Fergus: `https://staxai.com.au/api/cl-fergus-callback`
- Buildxact: `https://staxai.com.au/api/cl-buildxact-callback`

Both follow Pattern 2 (standalone CL integration) matching
ServiceM8.

**Government Tender APIs:**

| Source | Status | Method |
|--------|--------|--------|
| AusTender (Federal) | Ready to build | RSS feed + page scraping — no auth required |
| NSW (buy.nsw) | Email registered | tenders@staxai.com.au subscribed to notifications — waiting for first email to assess data |
| buy.nsw API | Closed | API restricted to government agencies only |

AusTender RSS feed confirmed:
- URL: `https://www.tenders.gov.au/public_data/rss/rss.xml`
- Contains 88 current open tenders (Approaches to Market)
- Requires page scraping for full details (closing date,
  agency, category)
- No authentication required — just needs browser-like
  User-Agent header

**Google OAuth Verification:**
- Status: Submitted for manual review (28 April 2026)
- Waiting on: Google response for branding verification
- Scopes requested: gmail.modify, drive.readonly
- Expected timeline: 2-3 days for branding, then 3-5 weeks
  for scope verification + CASA assessment

**Meta App Review:**
- Status: Facebook crawler now working (Response Code 206)
- og:image and fb:app_id added to all public pages
- Business Verification started
- Ready to submit App Review once Business Verification
  progresses

**Vercel/Facebook Firewall:**
- Status: Resolved — Facebook can now crawl the site

**Predis.ai:**
- Status: 7-day free trial active (started 28 April 2026)
- Action needed: Decide whether to continue subscription
  before trial ends

**REimagine Home API (Design Visualiser):**
- Status: Email sent to info@reimaginehome.ai, awaiting
  response
- Purpose: Replace Ideogram API for Design Visualiser tool
- Spec: DV Spec v1.2 approved and ready — blocked on API
  access
- DV build and audit complete — API update required before
  testing

### Task 26 — Dashboard Rebuild

Dashboard rebuild complete. UI review required — main landing
page looks flat and needs visual improvement.

Status: waiting on UI review.

### Task 29 — Build Admin Page

Status: Not started.

Spec: StaxAI-Admin-Page-Spec-v1_0.docx in Project Knowledge.

### Task 30 — Build Testing Environment

Status: Not started.

Spec: StaxAI-Test-Environment-Setup-v1_0.docx in Project Knowledge.

### Task 31 — Full Platform Testing

Status: Blocked on Task 30.

All tools require end-to-end testing using the test environment
once populated.

### Task 32 — Outstanding Tasks Review

Status: Not started.

Review StaxAI-Outstanding-Tasks-v1_3.docx and bring in additional
tasks as required.

---

## Known Issues & Notes

- Stripe webhook events — now listening to 5 events:
  checkout.session.completed, customer.subscription.deleted,
  price.created, price.updated, price.deleted. Price events
  auto-sync tool_prices table in Supabase.
- Payment system fixed (April 2026) — Bundle purchases now
  correctly save stripe_customer_id and mark is_trial=false.
  Single tool purchases now activate the tool via activateTool().
  Cancellation handling implemented in
  customer.subscription.deleted event. subscription_data.metadata
  added to checkouts so cancellation webhook has the data it
  needs.
- Dynamic pricing implemented (April 2026) — Tool prices fetched
  from Supabase tool_prices table via api/get-prices.js (public,
  cached 5 min). Account page shows user's actual subscription
  prices via api/get-subscription-prices.js (authenticated).
  Fallback to hardcoded prices (all-or-nothing) if API fails.
- tool_prices table created (April 2026) — Maps Stripe price_id
  to tool_id/bundle_tier and display_price. RLS enabled with
  read access for authenticated users.
- Account page rebuilt (April 2026) — Tabbed layout
  (Subscriptions, Team, Account). Tab visibility based on user
  role (Owner sees all, Manager sees Subscriptions + Account,
  Staff sees Account only). Back link dynamically shows
  referring page.
- Google OAuth consent screen in Testing mode — currently only
  designated test users can connect Gmail accounts. Must be
  published to In production before real users can connect.
  May trigger Google's verification process for the
  gmail.readonly scope. Must be resolved before launch.
- staxai-auth.css loads after the inline </style> block in
  content-library.html — stylesheet always wins the cascade
  for any class defined in both. Known issue to resolve
  during stylesheet rollout.
- OAuth consolidation — api/cl-oauth-initiate.js and the
  three standalone callback files should be consolidated
  into api/auth/initiate.js and api/auth/oauth-callback.js
  in a dedicated session. Redirect URIs in Azure and Dropbox
  will need updating at that time.
- Extraction prompt duplicated across onedrive-import.js,
  sharepoint-import.js, dropbox-import.js, cl-email-scan.js,
  cl-outlook-scan.js, process-file.js. Consolidate into a
  shared module during stylesheet rollout cleanup pass.
- Pagination fixed at 200 items for OneDrive/SharePoint
  folder listings and SharePoint sites. Add pagination
  support if needed.
- Email body stored as .txt in cl-assets. Website content
  stored as .html in cl-assets. Tools must retrieve
  original content from cl-assets via
  cl_source_items.file_url — not from
  content_library.content_text which contains the AI
  summary only.
- PWA install prompt is handled by pwa.js, which is loaded
  on every authenticated page. No dashboard-specific banner —
  the prompt surfaces via the browser's beforeinstallprompt
  event. Trial banner and PWA prompt are independent and do
  not clash visually.
- Mobile vs desktop page split agreed April 2026. The
  following pages are confirmed mobile-capable (full access
  in PWA): dashboard.html, account.html, login.html,
  forgot-password.html, reset-password.html, social.html,
  email-assistant.html, news-digest.html,
  customer-updates.html (when built), design-viz.html
  (when built). All other authenticated pages are
  desktop-only and will show the Task 17 message on
  mobile. When new tool pages are built, confirm mobile or
  desktop designation before build begins.
- Existing image rows in content_library uploaded before
  April 2026 have content_type null — thumbnail detection
  falls back to source_detail.file_type for these rows. New
  image rows have content_type: 'image' set correctly going
  forward.
- Folder scan connectors processed images as stub rows before
  the Task 12 build — pre-existing stub rows in
  cl_source_items will block reprocessing via dedup. Clear
  these rows before rescanning folders that contain images
  previously scanned as stubs.
- Xero OAuth scopes for new apps (created after 2 March
  2026) must use the new granular scope names. Correct
  scope string confirmed from official documentation:
  openid profile email accounting.invoices.read
  accounting.contacts.read accounting.settings.read
  accounting.reports.profitandloss.read
  accounting.reports.balancesheet.read projects.read
  offline_access
- ServiceM8 OAuth scopes — correct scope string confirmed:
  read_jobs read_customers read_staff read_job_materials
  read_job_contacts read_forms
- upgradeSharepointEntry function exists in two places —
  upgrade-sharepoint.js (canonical, browser) and
  api/sharepoint-import.js (API copy, intentional — Vercel
  esbuild cannot resolve CJS modules from ES module API
  files at build time). Not a bug.
- This platform is not live. There is only one user and
  all data is test data. Decisions about database changes
  do not require data-loss analysis.
- Global session expiry handler added to shared-utils.js
  April 2026. Uses onAuthStateChange to listen for the
  SIGNED_OUT event and redirects to /login. Covers all
  authenticated pages automatically because shared-utils.js
  is loaded on every authenticated page. Safe alongside the
  existing sign-out redirect in topbar.js — both target
  /login so the first redirect wins.
- NSW eTendering API is publicly accessible with no API
  key — rate-limited by IP. No environment variable required.
- Serper.dev usage monitoring — review credit consumption
  regularly via serper.dev dashboard. Usage tracking to be
  added to admin page when built.
- SMTP2Go is the platform email service. Env var SMTP2GO_API_KEY
  in Vercel. From address: notifications@staxai.com.au. First
  use is CB notification emails. Supabase Auth still handles
  auth emails (password reset, signup) via its own SMTP.
- DV switched from Ideogram to REimagine Home API (April 2026).
  DV Spec v1.2 reflects this change. Pending API access.
- CB notification emails have unsubscribe footer from SMTP2Go
  API key settings — review appearance when testing.
- Strategic Plan, News Digest, and Email Assistant builds
  complete — all passed audit, integration test, and functional
  review.
- BI Dashboard build and audit complete. Integration test
  waiting on demo data population.
- Design Visualiser build and audit complete. API update
  required before testing.
- SM audit remediation completed April 2026 — full gap
  analysis and fixes applied. File split created
  (social-modules-2.js). Visual consistency fixes applied
  (dropdowns now use .lookback-dropdown).
- og:image added to 11 public pages. fb:app_id added to all
  pages with og tags. April 2026.
- Fergus integration structure built — OAuth callback, data
  fetch endpoint, and UI integration in CL settings.
  cl_fergus_accounts column added to profiles table.
- Page titles fixed — removed "Mockup" references from all
  authenticated pages.
- Env var security fixed in Vercel — all sensitive keys
  marked as Sensitive.

---

## Help Bubbles — Metric Definitions

These definitions are for Smart Help bubbles and contextual tooltips (pre-launch task).

**Social Media Metrics:**
- Reach: Total number of unique users who saw your posts
- Engagement: Total interactions (likes, comments, shares, clicks)
- Engagement Rate: (Engagement ÷ Reach) × 100 — shown as percentage

**Chatbot Metrics:**
- Conversations: Total chat sessions with website visitors
- Booking Requests: Visitors who requested an appointment or callback
- Lead Conversion Rate: (Booking Requests ÷ Conversations) × 100
- Unanswered: Questions the chatbot couldn't answer
- Answered Rate: ((Total Questions - Unanswered) ÷ Total Questions) × 100

---

## Development Rules

### Code Standards
- Australian English — colour, organisation, recognised, etc.
- Brand name: StaxAI or STAXAI only — never 'Stax AI' or 'TradeAI Pro'
- 'You' and 'your' only — never 'we' or 'users'
- No exclamation marks in UI copy
- No hours/dollars saved messaging
- Apostrophes in single-quoted JS strings must be escaped with \' or use double-quoted outer strings. For HTML attributes in JS strings use &apos; or &#39;

### Pre-Login Files
- Pre-login files are not to be touched unless explicitly instructed

### Codebase Quirks
- tools.html has its own hardcoded copy of all tool data separate from tools-data.js. Update BOTH when changing any tool ID or property
- index.html has its own HERO_TOOLS array separate from tools-data.js. Update index.html as well as tools-data.js and tools.html when adding or changing a tool
- index.html hero CSS classes must never be removed: .stax-stack, .stax-card, .stax-card-screenshot, .stax-card-info, .stax-tagline, .stax-tagline-pre, .stax-tagline-stax, .stax-tagline-post, .hero-stax-way
- content-library.html has 5 dead modals with onclick handlers calling undefined functions. Do not attempt to wire these up — unbuilt features
- dashboard-data.js has its own TOOLS array with tool definitions separate from tools-data.js. Both must be updated when changing tool prices or priceIds. Consider refactoring dashboard-data.js to read from window.CORE_TOOLS instead of maintaining its own copy.

### Database Rules
- Every new Supabase table: RLS enabled before launch
- New schemas documented in spec before table is created
- Column naming: snake_case. Booleans: is_[name]/has_[name]. Timestamps: created_at, updated_at
- Never store sensitive data in Supabase tables

### API Endpoints
- All Claude API calls through Vercel serverless functions in api/ — never from the browser
- Naming convention: api/[action-name].js
- Supabase anon key in supabase-client.js is intentional — RLS must be enabled on any new table

### Tool to CL Write-back Patterns

All tools that write outputs to the Content Library must follow one of these two patterns. No other approach is permitted.

Tool Output items are never pending and never rejected. Items with source = 'tool' appear only in the Tool Outputs tab, never in Source Review. The only valid statuses for tool output items are 'approved' and 'archived'.

source = 'tool' must always be set on content_library rows written by a tool. Without this value the item will not appear in Tool Outputs and will incorrectly appear in Source Material instead.

Pattern A — Scan-import (AI confidence-based status). Used when a tool is ingesting external content it did not create. The AI determines status based on confidence. Status is 'approved' if the AI is confident the content has value, 'archived' if the content should be discarded. Never 'pending' or 'rejected'. Use upsert with onConflict: 'source_ref', ignoreDuplicates: true. Required fields: source ('tool'), tool_source (tool ID), source_ref (unique dedup key), status, category, tool_tags, content_text, user_id.

Pattern B — Tool-generated (always approved). Used when a tool has generated the content itself. Status is always forced to 'approved' regardless of AI confidence. Use upsert with onConflict: 'source_ref', ignoreDuplicates: true. Required fields: same as Pattern A with status always 'approved'.

Every future tool build must stamp first_used_at on content_library rows when content is used in a generated output. This controls edit and delete restrictions in Source Review.

### Camera Pattern

All tools that support photo capture must reuse the camera input pattern from PWA & Mobile Spec v1.1 Section 9. No tool builds its own camera access separately. Photos taken through a tool workflow are automatically saved to the Content Library when the workflow completes successfully. If the user abandons the workflow before completion, the photo is not saved.

### Spec First
- No new feature, page, or schema change without an approved spec in Project Knowledge — owner can override when agreed with Chat

### Spec Compliance Section — Mandatory for All Tool Specs

Every tool specification must include the following Platform Compliance section, word-for-word, immediately after the Overview section. This section is non-negotiable and must not be modified per tool.

#### Platform Compliance — MANDATORY

**WARNING:** This section is non-negotiable. Code must read and follow these requirements before writing any code. Violations will require rebuild.

**Files to Read First**

Before starting any build work, Code must read these files in full:

- CLAUDE.md — platform rules and constraints
- staxai-auth.css — the single source of truth for all styling
- shared-utils.js — shared functions that must be used
- Page Layout Standard section in CLAUDE.md
- Platform Audit Standard v1.4 — the checklist this tool must pass

**Architecture Requirements**

| Requirement | Detail |
|---|---|
| Split file architecture | [tool].html (shell + CSS), [tool]-logic.js (window.[TOOL]_LOGIC = {init()}), panel-data-[tool].js (tool panel data) |
| Maximum file size | 60,000 characters per file. If [tool]-logic.js exceeds this, split into [tool]-logic.js + [tool]-modules.js |
| Topbar integration | Must use topbar.js — do not build custom navigation |
| Shared utilities | Must use shared-utils.js functions: handleSave(), escHtml(), formatDate(), etc. |
| Event handlers | addEventListener only — no inline onclick handlers |
| Australian English | colour, organisation, recognised, etc. throughout all UI copy |

**Styling Requirements**

| Requirement | Detail |
|---|---|
| CSS source | staxai-auth.css is the single source of truth. Load it first. |
| Colours | CSS variables only. Primary: var(--stax-primary) = #4A6D8C. Never hardcode colours. |
| New classes | DO NOT create new classes in staxai-auth.css without explicit owner permission. |
| Missing styles | If a required style doesn't exist, STOP and report back. Do not invent classes. |
| Component patterns | Match existing CL/EA/ID implementations exactly for dropdowns, tabs, cards, modals. |

**WARNING:** If Code needs a CSS class, component, or pattern that doesn't exist in staxai-auth.css, Code must STOP and report back. The owner and Chat will decide whether to add it to the stylesheet or find an existing solution. Code does not create new classes independently.

**API Requirements**

| Requirement | Detail |
|---|---|
| All AI calls | Server-side only via Vercel functions in api/ folder |
| Model | claude-sonnet-4-6 for customer-facing outputs |
| Authentication | JWT Bearer token + supabase.auth.getUser() on every endpoint |
| Error handling | Modal error display using platform pattern — no console.log for user-facing errors |
| API keys | Never expose to browser. All keys server-side only. |

**Database Requirements**

| Requirement | Detail |
|---|---|
| New tables | RLS enabled before any data is written |
| Column naming | snake_case. Booleans: is_[name] or has_[name]. Timestamps: created_at, updated_at |
| Schema documentation | Any new tables must be documented in this spec before creation |

End of mandatory compliance section.

---

## Important Platform Facts

- New tools needing Stripe payment: create a new Stripe product and document the price ID in the Tool Specification Guide before building
- Supabase anon key in supabase-client.js is intentional — RLS is enabled
- widget.js is an embeddable chatbot for customers' own websites — not an internal platform file
- Content Library available to all paying customers automatically — no separate activation

---

## Platform Overview

StaxAI is an AI-powered SaaS platform for Australian SME businesses. It gives business owners AI tools via individual monthly subscriptions. No technical skills required.

- Live URL: https://staxai.com.au
- GitHub repo: https://github.com/stratsolai/TradeAI (public)
- Brand: StaxAI (formerly TradeAI Pro — never use the old name)
- Tagline: YOUR STAX | YOUR WAY
- Target users: Australian SME businesses across all industries

---

## Technology Stack

| Layer       | Technology                                               |
|-------------|----------------------------------------------------------|
| Frontend    | HTML / CSS / Vanilla JS — no framework                   |
| Hosting     | Vercel Pro — auto-deploys from GitHub main               |
| Database    | Supabase (PostgreSQL)                                    |
| Auth        | Supabase Auth — email/password + session management      |
| Email       | SMTP2Go — transactional emails via REST API.             |
|             | Env var: SMTP2GO_API_KEY. From: notifications@staxai.com.au |
| AI          | Anthropic Claude API — claude-haiku-4-5 for internal     |
|             | tools, claude-sonnet-4-6 for customer-facing outputs.    |
|             | Never exposed to browser.                                |
| AI Graphics | Ideogram API (Social Media). REimagine Home API (DV — pending). |
| Payments    | Stripe — LIVE MODE for testing. Real money handling.     |
| Social      | Meta Graph API v19.0                                     |
| News        | Serper.dev — API for news search functionality            |
