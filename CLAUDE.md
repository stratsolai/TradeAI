# CLAUDE.md
# StaxAI — Claude Code Session Reference
# Updated: May 17, 2026

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

### Task 30 — Build Testing Environment

Status: Phase 1 complete. Phase 2 not started.

Spec: StaxAI-Test-Environment-Setup-v1_2.docx in Project Knowledge.

**Phase 1: Accounts — COMPLETE ✅**

| Account | Status |
|---------|--------|
| Gmail (coastalbuilt.test@gmail.com) | ✅ Created |
| Outlook (coastalbuilt.test@outlook.com) | ✅ Created |
| Google Drive (8 folders created) | ✅ Done |
| Xero Demo Company | ✅ Connected |
| ServiceM8 | ✅ Created |
| Facebook Page + Instagram Business | ✅ Created |
| StaxAI test user (STAXAI TEST) | ✅ Exists |
| Business Profile (Coastal Built) | ✅ Filled in |

**Phase 2: Data Generation — NOT STARTED**

Approach agreed: use the Xero Demo Company data as the
foundation. Same customers/suppliers from Xero are used across
ServiceM8, emails, and documents. Sequence: Customer List →
Supplier List → Job History → Invoice/Bill Data → Email Content
→ Drive Documents.

Google Drive folders created: /Quotes, /Contracts, /Insurance,
/Licences, /Safety, /Projects, /Suppliers, /Templates.

### Task 31 — Full Platform Testing

Status: Blocked on Task 30.

All tools require end-to-end testing using the test environment
once populated.

- BI → SP wiring — confirm "Add to Strategic Plan" button works

### Dashboard widget — Social Media column reference bugs

Three queries in dashboard-widgets.js reference columns on the social_posts 
table that don't exist in the current schema. Errors visible in console on 
every dashboard load:

- Line 790 — column social_posts.campaign_id does not exist (Social week widget)
- Line 815 — column social_posts.scheduled_at does not exist (Social week-strip widget)
- Line 824 — column social_posts.connections does not exist (Social platform widget)

All three return 400 Bad Request from Supabase REST API. Widgets fail silently 
— dashboard still loads but Social Media tiles are non-functional.

Discovered during signup fix verification testing (13 May 2026). Resolution 
requires reviewing the three lines against the current social_posts schema 
and either updating the queries to match the schema, or adding the missing 
columns if they're meant to exist per the SM spec.

### Task 33 — Page Load Speed & Shell Flicker

Status: Not started.

Platform-wide task to improve page load speeds and hide shell 
elements until data is ready. Examples identified:
- Dashboard YOUR STAX headings visible before data loads
- Admin topbar flicker before auth check completes

Review all authenticated pages and implement consistent 
loading behaviour.

### Task 34 — Error Handling Consistency

Status: Not started.

Platform-wide audit to establish consistent error handling 
approach across all tools:
- Modal errors vs inline errors — when to use each
- Silent catch blocks — add console.error before fallback
- Recommend and apply consistent pattern across all pages

### Task 35 — BI Follow-up Items

Status: Not started. Complete after BI enhancement is finished.

| Item | Notes |
|------|-------|
| QuickBooks pl_breakdown support | QB-only customers see "No accounting software connected" for the Operational Performance tile until quickbooks-fetch gains a pl_breakdown action equivalent to the Xero one |
| Single connection per category | Enforce one accounting system only (Xero/MYOB/QuickBooks) and one job system only (ServiceM8/Fergus/Buildxact/Tradify). Show a message if the user tries to connect a second provider in the same category |
| Test BI with MYOB demo company | Verify MYOB data flows correctly through every BI tile once MYOB is reactivated |
| Demo Company Switch feature | Add a "Switch Company" option that lets users explore the Coastal Built demo data as read-only. Benefits: onboarding, sales demos, training, trust. Considerations: data isolation, read-only enforcement, session handling, and a visual indicator that demo mode is active |

### Task 36 — OAuth Consolidation

Status: Not started.

Consolidate api/cl-oauth-initiate.js and the three standalone callback files into api/auth/initiate.js and api/auth/oauth-callback.js. Redirect URIs in Azure and Dropbox will need updating at that time.

### Task 37 — Panel & Panel-Auth Rebuild

Status: Not started. Blocked on Task 31.

First step: review and update Tool Specification Guide v2.5 in Project Knowledge.

Rebuild panel.html and panel-auth.html to current platform standards. Includes panel data files for all tools and ROI calculator rebuild.

### Task 38 — Pre-Launch UX Pass

Status: Not started.

Single coordinated task across entire authenticated platform:
- Smart Help bubbles and contextual tooltips
- How-To videos (1 minute per tool)
- User Manual
- Hero screenshots
- Demo videos

**Help Bubbles — Metric Definitions**

These definitions are for Smart Help bubbles and contextual tooltips.

Social Media Metrics:
- Reach: Total number of unique users who saw your posts
- Engagement: Total interactions (likes, comments, shares, clicks)
- Engagement Rate: (Engagement ÷ Reach) × 100 — shown as percentage

Chatbot Metrics:
- Conversations: Total chat sessions with website visitors
- Booking Requests: Visitors who requested an appointment or callback
- Lead Conversion Rate: (Booking Requests ÷ Conversations) × 100
- Unanswered: Questions the chatbot couldn't answer
- Answered Rate: ((Total Questions - Unanswered) ÷ Total Questions) × 100

### Task 39 — Marketing Messaging

Status: Not started.

Review marketing doc in Project Knowledge and apply messaging updates to pre-login pages.

### Task 40 — Mobile UX Audit

Status: Not started.

Full review of all authenticated pages on mobile devices.

### Task 41 — Contact Page

Status: Not started.

Build contact page for the platform.

### Task 42 — AI Disclaimer & Approval Workflow

Status: Not started. Spec required before build.

Add reminder/disclaimer in appropriate platform locations that AI can make mistakes. Users must approve AI-generated outputs before downloading, saving, or using.

### Task 43 — Logo Final Selection

Status: Not started.

Choose from shortlisted logo versions.

### Task 44 — Remaining Core Tool Builds

Status: Not started.

Approximately 9 tools still to be built (16 total, 7 done). Each tool requires spec approval before build.

### Task 45 — Anthropic Admin API Integration

Status: Not started. Spec required before build.

The Profitability Dashboard currently relies on local token-based cost
estimation via lib/usage-logger.js — hardcoded AUD pricing tables
multiplied by token counts from Anthropic API responses, written to the
api_usage table. This works for per-tool / per-user attribution but is
not a real billing source.

Integration with Anthropic's Admin API would provide:
- Reconciliation between local estimates and actual Anthropic-billed
  amounts (catches drift from FX rate changes, model pricing changes,
  or token-counting differences)
- Real spend data for the Profitability Dashboard rather than estimates
- Organisation-level visibility for cost monitoring as user base grows

Requires sk-ant-admin key prefix, RFC 3339 date format, organisation-
level setup. Returns 400 if starting_at is the current day.

Spec required before build.

---

## Platform Facts

- Email body stored as .txt in cl-assets. Website content
  stored as .html in cl-assets. Tools must retrieve
  original content from cl-assets via
  cl_source_items.file_url — not from
  content_library.content_text which contains the AI
  summary only.
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
- The Shared Research Layer is cohort-shared, not per-user.
  Cohorts are keyed by industries|sorted-slug::state-abbrev::region-slug
  — for example, 'building-and-construction|landscaping-and-outdoor::nsw::mid-north-coast'.
  All users in the same cohort read the same shared_research rows.
- SRL refresh is cron-only. The active cron pair is
  api/srl-scheduler.js (daily at 04:00 UTC) and api/srl-worker.js
  (every 5 minutes). No browser-side or user-activity trigger.
  api/news-digest-scheduler.js and api/news-digest-worker.js are
  dormant authed stubs reserved for ID's future tool-side cadence
  workstream — see the dormant-marker comment in each file for
  re-enable rules.
- shared_research_cache is shared across users — caching is
  keyed by the query string + query_type + recency hash,
  independent of user_id. Per-user audit lives in
  shared_research_cache_access.
- Xero OAuth scopes for new apps (created after 2 March
  2026) must use the new granular scope names. Correct
  scope string (matches api/cl-oauth-initiate.js):
  openid profile email accounting.invoices.read
  accounting.contacts.read accounting.settings.read
  accounting.reports.profitandloss.read
  accounting.reports.balancesheet.read
  accounting.reports.aged.read projects.read
  offline_access
  Note: accounting.transactions.read does NOT exist for
  apps created after 2 March 2026. Quotes are covered by
  accounting.invoices.read. The broad accounting.reports.read
  is also unavailable to post-cutoff apps — granular per-
  report names are the only path. Aged Receivables /
  Aged Payables reports are gated behind
  accounting.reports.aged.read specifically.
- ServiceM8 OAuth scopes — correct scope string confirmed:
  read_jobs read_customers read_staff read_job_materials
  read_job_contacts read_forms
- upgradeSharepointEntry function exists in two places —
  upgrade-sharepoint.js (canonical, browser) and
  api/sharepoint-import.js (API copy, intentional — Vercel
  esbuild cannot resolve CJS modules from ES module API
  files at build time). Not a bug.
- NSW eTendering API is publicly accessible with no API
  key — rate-limited by IP. No environment variable required.

---

## Development Rules

### Code Standards
- Australian English — colour, organisation, recognised, etc.
- Brand name: StaxAI or STAXAI only — never 'Stax AI' or 'TradeAI Pro'
- 'You' and 'your' only — never 'we' or 'users'
- No exclamation marks in UI copy
- No hours/dollars saved messaging
- Apostrophes in single-quoted JS strings must be escaped with \' or use double-quoted outer strings. For HTML attributes in JS strings use &apos; or &#39;
- Before creating any new CSS class, search how other tool files style the same HTML element type. Grep for the element (e.g. `<select class=`) across existing tools to find the platform's established pattern.

### Pre-Login Files
- Pre-login files are not to be touched unless explicitly instructed

### Codebase Quirks
- Tool data is duplicated across four files: tools-data.js (canonical), tools.html (hardcoded copy), index.html (HERO_TOOLS array), and dashboard-data.js (TOOLS array). When changing any tool ID, property, price, or priceId, update all four. Refactor target: have the three consumers read from window.CORE_TOOLS instead of holding their own copies.
- index.html hero CSS classes must never be removed: .stax-stack, .stax-card, .stax-card-screenshot, .stax-card-info, .stax-tagline, .stax-tagline-pre, .stax-tagline-stax, .stax-tagline-post, .hero-stax-way
- content-library.html has 5 dead modals with onclick handlers calling undefined functions. Do not attempt to wire these up — unbuilt features

### Database Rules
- Every new Supabase table: RLS enabled before launch
- New schemas documented in spec before table is created
- Column naming: snake_case. Booleans: is_[name]/has_[name]. Timestamps: created_at, updated_at
- Never store sensitive data in Supabase tables
- content_library.source is NOT NULL and the table has a CHECK constraint: `(source = 'tool' OR source_item_id IS NOT NULL)`. Any non-tool row written without a source_item_id pointing at cl_source_items is rejected by Postgres — orphan rows are schema-impossible. See the Source Ingestion Pattern section below.

### API Endpoints
- All Claude API calls through Vercel serverless functions in api/ — never from the browser
- Naming convention: api/[action-name].js
- Supabase anon key in supabase-client.js is intentional — RLS must be enabled on any new table

### Source Ingestion Pattern

All 8 ingestion endpoints — cl-email-scan, cl-outlook-scan, drive-import, onedrive-import, sharepoint-import, dropbox-import, scrape-website, process-file — must use the shared cl_source_items helper. No endpoint inserts into cl_source_items directly.

cl_source_items is the canonical record of every ingested artefact. Every non-tool content_library row references it via source_item_id, which the schema CHECK constraint enforces (see Database Rules above). The orphan content_library rows that the old per-endpoint logic could produce are now impossible by construction.

**ensureSourceItem helper — lib/cl-source-items.js**

Every ingestion endpoint follows the same flow:

1. Build a source_unique_key with `buildSourceUniqueKey(sourceType, parts)` — the format is per-source-type (see table below) and is deterministic, so re-runs produce the same key.
2. Pre-filter the work list against `cl_source_items.source_unique_key` so already-ingested items are not re-fetched or re-extracted.
3. Upload the source bytes to cl-assets with `upsert: true` (idempotent — retries don't fail on existing objects).
4. Call `ensureSourceItem(supabase, { user_id, source_unique_key, source_type, fields })` which finds-or-creates the row and returns its id (or null on failure). Race-safe: parallel calls with the same key recover via re-select rather than failing on the partial unique index.
5. If `ensureSourceItem` returns null, **skip the artefact entirely** — no content_library write happens. Failures are counted under `skipped_reasons.source_row_failed` so the future Admin monitoring widget can surface them.

**source_unique_key formats**

| Source              | Format                                        |
|---------------------|-----------------------------------------------|
| Gmail body          | `gmail:<message_id>`                          |
| Gmail attachment    | `gmail-att:<message_id>:<attachment_id>`      |
| Outlook body        | `outlook:<message_id>`                        |
| Outlook attachment  | `outlook-att:<message_id>:<attachment_id>`    |
| Google Drive        | `drive:<drive_file_id>`                       |
| OneDrive            | `onedrive:<onedrive_item_id>`                 |
| SharePoint          | `sharepoint:<site_id>:<sharepoint_item_id>`   |
| Dropbox             | `dropbox:<dropbox_file_id>`                   |
| Document upload     | `upload:<storagePath>`                        |
| Photo upload        | `photo:<storagePath>`                         |
| Website             | `website:<scanTs>:<sha256(fullPageUrl)>`      |

A partial unique index on `(user_id, source_unique_key) WHERE source_unique_key IS NOT NULL` backs the contract — duplicate keys per user can't be inserted.

**Logging**

Failure paths in ingestion follow the platform format `[Scope] Action — key: value`, e.g. `[Gmail] Source row failed — msgId: <id>`. Errors must not be silently swallowed — the original orphan bug came from a bare catch block.

### Tool to CL Write-back Patterns

All tools that write outputs to the Content Library must follow one of these two patterns. No other approach is permitted.

Tool Output items are never pending and never rejected. Items with source = 'tool' appear only in the Tool Outputs tab, never in Source Review. The only valid statuses for tool output items are 'approved' and 'archived'.

source = 'tool' must always be set on content_library rows written by a tool. Without this value the item will not appear in Tool Outputs and will incorrectly appear in Source Material instead.

Pattern A — Scan-import (AI confidence-based status). Used when a tool is ingesting external content it did not create. The AI determines status based on confidence. Status is 'approved' if the AI is confident the content has value, 'archived' if the content should be discarded. Never 'pending' or 'rejected'. Use upsert with onConflict: 'source_ref', ignoreDuplicates: true. Required fields: source ('tool'), tool_source (tool ID), source_ref (unique dedup key), status, category, tool_tags, content_text, user_id.

Pattern B — Tool-generated (always approved). Used when a tool has generated the content itself. Status is always forced to 'approved' regardless of AI confidence. Use upsert with onConflict: 'source_ref', ignoreDuplicates: true. Required fields: same as Pattern A with status always 'approved'.

**Browser writers — centralised endpoint.** Tools that run in the browser and write to the Content Library (chatbot, design-viz, social) use the centralised /api/cl-tool-write endpoint. Tag definitions for each tool are in TOOL_OUTPUT_MATRIX in lib/cl-prompts.js. The endpoint handles auth, tags, dedup, and all required fields.

To add a new browser writer:
1. Add a row to TOOL_OUTPUT_MATRIX in lib/cl-prompts.js for the new tool
2. From the browser, call fetch('/api/cl-tool-write', ...) with the tool's tool_source and content
3. Done — the endpoint handles everything else

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
| Colours | CSS variables only. Primary: var(--blue) = #4A6D8C. Never hardcode colours. |
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
| AI          | Anthropic Claude API — claude-haiku-4-5-20251001 for     |
|             | content extraction and versioning across the Content     |
|             | Library and tools, claude-sonnet-4-6 for customer-       |
|             | facing outputs and SRL curation. Never exposed to        |
|             | browser.                                                 |
| AI Graphics | Ideogram API (Social Media). REimagine Home API (DV — pending). |
| Payments    | Stripe — LIVE MODE for testing. Real money handling.     |
| Social      | Meta Graph API v19.0                                     |
| News        | Serper.dev — API for news search functionality            |
