# CLAUDE.md
# StaxAI — Claude Code Session Reference
# Updated: April 21, 2026

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

### Task 13 — External Platform Connections (Accounting and Job Management)

Spec complete — StaxAI-External-Platform-Connections-Spec-v1_0.
MYOB deferred — Coming Soon placeholder in UI. Awaiting
clarification on whether developer program subscription is
required for production use before registering. Buildxact
deferred — Coming Soon placeholder in UI. Third-party
registration with Buildxact support required before build
can begin. Integration test complete — Xero, QuickBooks,
and ServiceM8 all connected successfully. Disconnect not
yet verified. Fetch endpoint data pull testing deferred to
each tool's integration test. Fergus — developer platform
registration email sent April 2026, awaiting response.
Tradify — enquiry email sent April 2026, awaiting
confirmation of whether public API is available.

### Task 22 — Industry News & Updates Digest Rebuild

In progress. Backend complete (commit dd10602). Display
rebuild and settings page update in progress. Governed by
StaxAI-ID-Rebuild-Spec-v1_1.

### Task 23 — Strategic Plan Tool Rebuild

Complete rebuild to bring up to current platform standards.
Assessment, backend fixes, structural rebuild, stylesheet
integration, missing features, and functional review.

### Task 24 — Chatbot Tool Rebuild

Complete rebuild to bring up to current platform standards.
Assessment, backend fixes, structural rebuild, stylesheet
integration, missing features, and functional review.

### Task 25 — Social Media Tool Rebuild

Complete rebuild to bring up to current platform standards.
Assessment, backend fixes, structural rebuild, stylesheet
integration, missing features, and functional review.

### Task 26 — Dashboard Rebuild

Pre-Dashboard build requirements must be resolved in a
dedicated planning session before the Dashboard rebuild
begins. No Dashboard build work starts until all three are
agreed and specced: Force Business Profile completion on
first login, STAX All industry selection logic, Industry
taxonomy review.

---

## Known Issues & Notes

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
- dashboard.html install banner: the PWA install prompt
  banner was added to dashboard.html during the PWA build
  (April 2026). The banner markup and logic must be
  properly reviewed and integrated during the Dashboard
  rebuild — it should not be treated as final.
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
| AI          | Anthropic Claude API — claude-haiku-4-5 for internal     |
|             | tools, claude-sonnet-4-6 for customer-facing outputs.    |
|             | Never exposed to browser.                                |
| AI Graphics | Ideogram API                                             |
| Payments    | Stripe — LIVE MODE for testing. Real money handling.     |
| Social      | Meta Graph API v19.0                                     |
| News        | Serper.dev — API for news search functionality            |
