# CLAUDE.md
# StaxAI — Claude Code Session Reference
# Updated: April 15 2026

---

## CRITICAL — READ BEFORE TOUCHING ANYTHING

These rules have caused real damage when missed. They are first
because they are the most important.

**Never force push — no exceptions, ever.**
**One file per commit — never batch multiple files.**
**Push to GitHub immediately after every commit — never leave
commits unpushed at the end of a session.**
**Only change what you were asked to change.** Do not refactor,
restructure, or tidy code you were not explicitly asked to touch.
**Read the entire file before editing anything.** Never make a
change based on a partial view of a file.
**Never reconstruct content from memory.** When migrating content
between files, always read the source file. Never write from
memory or spec descriptions alone.
**Stripe is in LIVE MODE.** Real money. Never use test keys in
production. Never create test transactions.
**Never expose API keys, Supabase service keys, or Stripe secret
keys to the browser under any circumstance.**
**Every new Supabase table requires RLS enabled before launch —
no exceptions.**
**No new feature, tool page, or schema change may be built
without an approved spec document in Project Knowledge.**
**Never run any Vercel CLI commands under any circumstances.**
Vercel log access is via the Vercel dashboard only. This
applies even when investigating errors.

---

## Working Model

This project is built by a non-technical owner working with
Claude Chat and Claude Code together. Chat handles planning,
decisions, and document writing. Claude Code handles all repo
work.

The owner requires guidance at every step:
- Always explain what you are about to do and why before doing it
- Flag clearly anything the owner needs to action themselves
- Never assume technical knowledge on the owner's part
- When in doubt about scope or approach — stop and report
  to the owner so they can discuss with Chat

Claude Code should work autonomously without asking permission
at each step. Report back only when all work is complete or if
something unexpected is found.

The agreed working style is: go slowly, explain things in plain
language before acting, check in before decisions that have
consequences, never tell Code how to do its job technically —
only what to do and why. The owner will push back when needed
and should be encouraged to do so.

---

## Tool Rollout Process

The agreed process for the stylesheet rollout, backend audit,
and functional review for each tool page and its settings
page. Follow in order. No step begins until the previous step
is complete.

1. Structural analysis — read the tool's HTML and CSS files
   in full. Report current state against the platform
   standard. No changes.
2. Backend audit — read all backend files associated with the
   tool. Report any divergences from platform patterns and CL
   reference implementations where applicable. No changes.
3. Review findings together and plan all cleanup and fixes.
4. Fix backend issues — one commit per fix.
5. Structural cleanup — dead code removal, topbar structure,
   inline styles moved to CSS block. One commit per change.
6. Settings page rebuild — rebuild to LAYOUT-STANDARD.md
   standard. Confirm connections, saves, and scan controls
   working before proceeding.
7. CSS analysis — compare cleaned page against staxai-auth.css
   and content-library.html. Report which components match the
   platform standard and which do not. No changes.
8. Review CSS findings together and agree what goes into the
   stylesheet and what stays page-specific.
9. Update staxai-auth.css if new variables or shared components
   are needed. One commit.
10. Roll CSS variables out to the page. One commit.
11. Functional review — use the tool end-to-end with real data
    on a working page. Review layout, UX, and functionality.
    Agree any structural or functional improvements.
12. Build agreed improvements — one commit per change.
13. Browser check — confirm nothing broken visually.
14. Mobile audit and fixes. Do not fix mobile layout issues
    on any page outside of the stylesheet rollout sequence.
    Exception: content-library.html, cl-settings.html,
    email-assistant.html, and email-assistant-settings.html
    already have mobile fixes applied.
15. Browser check — confirm mobile fixes.
16. Sign off.

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

### Task 18 — CL Tool Outputs Tab

Build complete April 2026. Final test of output content
and tile counts blocked until tools send data to the
Content Library. content-library.html structural cleanup
complete April 2026 — dead CSS removed, dead modals
removed, inline onclick handlers moved to logic file,
inline styles moved to CSS block. File reduced from
1,171 to approximately 510 lines.

### Task 20 — Email Assistant Functional Review and Build

In progress April 2026. Current session work completed:
email-assistant-settings.html fully rebuilt to
LAYOUT-STANDARD.md standard, OAuth connection fixed and
confirmed working for Gmail and Outlook.

Outstanding before sign-off:
- Integration test end-to-end with real Gmail and
  Outlook accounts

Note: stylesheet comparison pass is complete. The
outstanding EA fixes from this session (category labels,
shortcut pills, dedup alignment across CL and EA scan
files) are also part of this task and must be complete
and confirmed working before this task can be signed off.

### Task 21 — Scan Frequency Scheduling

Not started. The Scan Frequency UI exists on
cl-settings.html and email-assistant-settings.html and
saves a preference to Supabase, but no scheduler or cron
trigger reads that preference and queues scans at the
correct intervals. Affects both CL and EA. Wire saved
frequency preferences to the background scan worker
queue for both CL and EA.

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

---

## Pre-Launch Build Order

Mandatory sequence. No step begins until the previous step
is complete and confirmed working.

| Step | Task                                                       |
|------|------------------------------------------------------------|
| 1    | Task 21 — Scan frequency scheduling for CL and EA.         |
| 2    | Stylesheet rollout — news-digest.html and news-digest-settings.html. |
| 3    | Stylesheet rollout — all remaining authenticated pages     |
| 4    | Functional reviews — all 5 built tools                     |
| 5    | Improvements per tool based on functional review findings  |
| 6    | Integration tests — all 5 built tools                      |
| 7    | Dashboard rebuild                                          |

---

## Structural Analysis Findings & Agreed Decisions

### Post-Login Rebuild Strategy

Pre-login files are complete and not to be touched except for
explicitly instructed changes. All post-login authenticated
pages are to be rebuilt to the correct standard as part of
the stylesheet rollout sequence.

The reference implementation for all authenticated pages is:
- content-library.html — look-and-feel bible
- cl-settings.html — settings page pattern
- staxai-auth.css — single source of truth for all UI values

The sequence for each tool rebuild is:
1. Structural analysis specific to that tool (report only)
2. Rebuild to match the CL/stylesheet standard
3. Load staxai-auth.css and topbar.js
4. Remove all inline dropdown CSS and JS
5. Replace inline onclick handlers with addEventListener
6. Replace hardcoded CSS values with CSS variables
7. Test and confirm before moving to next tool

### Agreed Design Decisions

- .filter-pill border-radius is 8px in staxai-auth.css —
  platform standard for all filter pills
- Tool Outputs sidebar: selected tool = grey shaded,
  unselected active = white, inactive tools show + Learn
  More badge and navigate to /panel-auth?tool=[toolid].
  Selected tool font stays black — shading indicates
  selection.
- When topbar.js is rolled out to each page, remove
  existing inline dropdown wiring from that page's logic
  file at the same time to avoid the duplicate toggle bug
  fixed in commits cfbb8f3 and 4756821.

---

## Platform Overview

StaxAI is an AI-powered SaaS platform for Australian SME
businesses. It gives business owners AI tools via individual
monthly subscriptions. No technical skills required.

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
| Payments    | Stripe — LIVE MODE. Real money. Never use test keys.     |
| Social      | Meta Graph API v19.0                                     |
| News        | SerpAPI — 100 free searches/month                        |

---

## File Inventory

Refer to StaxAI Project Brief v12.23

Files added April 2026 (Task 27 — cl-settings-logic.js split):
- cl-settings-onedrive.js — OneDrive connection management
  (render, folder picker, disconnect, OAuth return)
- cl-settings-sharepoint.js — SharePoint connection management
  (render, site picker, library picker, disconnect, OAuth return)
- cl-settings-dropbox.js — Dropbox connection management
  (render, folder picker, disconnect, OAuth return)
- cl-settings-tools.js — Tool Connections (Xero, QuickBooks,
  ServiceM8, MYOB, Buildxact) management (render, connect,
  disconnect, permission modal, OAuth return)

---

## Supabase Schema

This section is the source of truth for the database schema.

---

## Stylesheet

The shared authenticated pages stylesheet is the single source
of truth for all colours, typography, spacing, and component
styles across all authenticated pages.

Filename: staxai-auth.css

- content-library.html is the look-and-feel bible for all
  authenticated pages. The stylesheet is aligned to CL.
- All new and edited files must use CSS variables throughout.
  Never use hardcoded values. Never approximate or substitute.

---

## Development Rules

Read the applicable sections of Rules v2.9 in full. This is a
working summary only.

### Code Editing
- Read the entire file before making any change
- Only change what you were asked to change
- Never reconstruct content from memory — read the source
- Validate JS syntax before committing — run node to confirm
- Confirm file integrity before committing: DOCTYPE present,
  closing tags present, file not truncated, no empty files

### Commit Discipline
- One file per commit — never batch
- Never force push — no exceptions ever
- Push to GitHub immediately after every commit
- Clear descriptive commit messages

### Code Standards
- No inline onclick handlers — all events via addEventListener
  in the logic file
- No hardcoded UI values — CSS variables only
- No hardcoded industry or trade assumptions — industry always
  read dynamically from user profile at runtime
- Australian English — colour, organisation, recognised, etc.
- No exclamation marks in UI copy
- No hours/dollars saved messaging
- Brand name: StaxAI or STAXAI only — never 'Stax AI' or
  'TradeAI Pro'
- 'You' and 'your' only — never 'we' or 'users'
- Apostrophes in single-quoted JS strings must be escaped
  with \' or use double-quoted outer strings. For HTML
  attributes in JS strings use &apos; or &#39;.

### Pre-Login Files
- Pre-login files are not to be touched unless explicitly
  instructed.

### Split Architecture (Rules v2.9 Section 12)
No monolithic files for new work. Full detail in Rules v2.9.

- Shell file ([tool].html): HTML structure, all CSS, generic
  JS functions. No tool-specific content or hardcoded data.
- Logic file ([tool]-logic.js): all tool-specific JS. Single
  global window object with init() method.
- Data file (panel-data-[toolid].js): tool-specific content
  for panel pages.
- No shell file should exceed ~60,000 chars.

### Codebase Quirks
- tools.html has its own hardcoded copy of all tool data
  separate from tools-data.js. Update BOTH when changing
  any tool ID or property.
- index.html has its own HERO_TOOLS array separate from
  tools-data.js. Update index.html as well as tools-data.js
  and tools.html when adding or changing a tool.
- index.html hero CSS classes must never be removed:
  .stax-stack, .stax-card, .stax-card-screenshot,
  .stax-card-info, .stax-tagline, .stax-tagline-pre,
  .stax-tagline-stax, .stax-tagline-post, .hero-stax-way.
- content-library.html has 5 dead modals with onclick
  handlers calling undefined functions. Do not attempt to
  wire these up — unbuilt features.

### Stylesheet & CSS
- All CSS variables defined in the shared stylesheet — never
  redefine them in logic or data files
- Never add tool-specific styles to a shell file CSS block
- Refer to the stylesheet directly for all design system values

### Database
- Every new Supabase table: RLS enabled before launch
- New schemas documented in spec before table is created
- Column naming: snake_case. Booleans: is_[name]/has_[name].
  Timestamps: created_at, updated_at.
- Never store sensitive data in Supabase tables

### API Endpoints
- All Claude API calls through Vercel serverless functions
  in api/ — never from the browser
- Naming convention: api/[action-name].js
- Supabase anon key in supabase-client.js is intentional —
  RLS must be enabled on any new table

### Tool to CL Write-back Patterns

All tools that write outputs to the Content Library must
follow one of these two patterns. No other approach is
permitted.

Tool Output items are never pending and never rejected.
Items with source = 'tool' appear only in the Tool Outputs
tab, never in Source Review. The only valid statuses for
tool output items are 'approved' and 'archived'.

source = 'tool' must always be set on content_library rows
written by a tool. Without this value the item will not
appear in Tool Outputs and will incorrectly appear in
Source Material instead.

Pattern A — Scan-import (AI confidence-based status). Used
when a tool is ingesting external content it did not create.
The AI determines status based on confidence. Status is
'approved' if the AI is confident the content has value,
'archived' if the content should be discarded. Never
'pending' or 'rejected'. Use upsert with onConflict:
'source_ref', ignoreDuplicates: true. Required fields:
source ('tool'), tool_source (tool ID), source_ref (unique
dedup key), status, category, tool_tags, content_text,
user_id.

Pattern B — Tool-generated (always approved). Used when a
tool has generated the content itself. Status is always
forced to 'approved' regardless of AI confidence. Use
upsert with onConflict: 'source_ref', ignoreDuplicates:
true. Required fields: same as Pattern A with status
always 'approved'.

Every future tool build must stamp first_used_at on
content_library rows when content is used in a generated
output. This controls edit and delete restrictions in
Source Review.

### Camera Pattern

All tools that support photo capture must reuse the camera
input pattern from PWA & Mobile Spec v1.1 Section 9. No
tool builds its own camera access separately. Photos taken
through a tool workflow are automatically saved to the
Content Library when the workflow completes successfully.
If the user abandons the workflow before completion, the
photo is not saved.

### Spec First
- No new feature, page, or schema change without an approved
  spec in Project Knowledge — no exceptions

### Pre-Commit Checks
You must explicitly confirm every item on this checklist
before every commit and state that all checks have passed.
If any item fails — stop and tell the owner before committing.

Copy & brand:
- Australian English throughout
- No old brand names or references
- No hours/dollars saved messaging
- No exclamation marks in UI copy
- No 'we' language
- No hardcoded industry assumptions

CSS (when editing files with CSS):
- No hardcoded values — CSS variables only
- No duplicate CSS rules introduced
- Topbar pattern matches platform standard
- Before every commit that adds new CSS classes, explicitly
  list every new class being added and confirm each one is
  either: added to staxai-auth.css because it is reusable
  across pages, or added to the page style block with a
  specific written reason why it is genuinely unique to
  that page and will never appear on any other page. This
  confirmation must appear in the commit report. If no
  clear reason exists for a page-level class, it belongs
  in the stylesheet.

JavaScript:
- No inline onclick handlers
- Apostrophes in JS strings handled correctly
- JS syntax valid — confirmed with node
- No force push
- No hardcoded hex colour values in JS — all colours applied
  via element.style must use
  getComputedStyle(document.documentElement).getPropertyValue
  ('--variable-name') to read from the stylesheet at runtime
- No inline style= attributes in dynamically-built HTML
  strings — all styling via named CSS classes
- Every new class name referenced in JS has a corresponding
  CSS definition in the stylesheet or page style block
- UI state only updates after confirmed database or API
  success — never before
- No silent catch blocks — every catch must at minimum log
  the error
- No JS hover bindings or visual state assignments via
  element.style — all hover states, active states, and
  visual appearance must be defined in CSS rules or classes
  in the stylesheet. JS may only toggle class names, never
  set visual style properties directly.

File integrity:
- DOCTYPE present, closing tags present
- File not truncated, not empty

Industry-agnostic (when editing AI prompts or data models):
- Confirmed works correctly for a non-trade industry such
  as accounting or consulting

### Authenticated Page Standards — Mandatory for All New and Rebuilt Pages

Every new or rebuilt authenticated page must follow these
standards without exception. These rules exist to prevent
the technical debt accumulated in early builds from recurring.

Stylesheet and CSS:
- Every authenticated page must load staxai-auth.css before
  any other stylesheet or logic file
- Every authenticated page must load shared-utils.js before
  any logic file
- Every CSS value must use a stylesheet variable — no
  hardcoded values ever
- Every reusable CSS class belongs in staxai-auth.css — only
  define classes in a page-level style block if they are
  genuinely specific to that page's unique layout and will
  never appear on any other page. When in doubt, put it in
  the stylesheet.
- Every colour applied via JS element.style must read the
  value from the stylesheet at runtime using
  getComputedStyle(document.documentElement).getPropertyValue
  ('--variable-name') — never hardcode hex values in JS
- No inline style= attributes in dynamically-built HTML
  strings — always use named CSS classes defined in the
  stylesheet or page style block

Topbar:
- Every authenticated page must load topbar.js
- When topbar.js is rolled out to a page, all existing
  inline dropdown CSS and JS must be removed from that page
  in the same commit
- No authenticated page may define its own topbar CSS —
  topbar styling belongs in topbar.js or the topbar section
  of staxai-auth.css only

JavaScript:
- Every class name referenced in JS must have a
  corresponding CSS definition
- Every async function must have error handling — try-catch
  on auth calls, .error checks on all Supabase query
  results, response.ok checks on all fetch calls
- Never use a silent catch block — every catch must at
  minimum log the error
- No inline onclick handlers — all events via
  addEventListener in the logic file
- Logic files must follow the window.*_LOGIC = { init() }
  pattern — all logic runs inside init(), nothing at module
  scope except the bootstrap IIFE

File size:
- Monitor file sizes against the 60K limit defined in
  CLAUDE.md
- If a logic file approaches 60K during a build session,
  stop and flag it before adding more code
- Never allow a file to exceed 60K without a plan to split
  it

Error handling:
- UI state must only update after a database or API
  operation has confirmed success — never optimistically
  update the UI before confirming the operation succeeded

---

## Important Platform Facts

- Stripe LIVE MODE — never use test keys or create test
  transactions. Webhook logic in api/stripe-webhook.js —
  never duplicate payment activation logic elsewhere.
- New tools needing Stripe payment: create a new Stripe
  product and document the price ID in the Tool
  Specification Guide before building.
- Supabase anon key in supabase-client.js is intentional —
  RLS is enabled.
- widget.js is an embeddable chatbot for customers' own
  websites — not an internal platform file.
- Content Library available to all paying customers
  automatically — no separate activation.
- Email Assistant (per-user personal inbox) and CL business
  email connection are two entirely separate systems.
  Never conflate them in UI or code.

---

## Document Reference

| Document                        | Purpose                             |
|---------------------------------|-------------------------------------|
| CLAUDE.md (this file)           | Current state and active tasks      |
| Rules & Instructions v2.9       | All rules — read applicable         |
|                                 | sections every session              |
| Project Brief v12.23            | Platform reference and architecture |
| Outstanding Tasks v1.2          | All outstanding tasks and known     |
|                                 | build issues by tool                |
| Tool Specification Guide v2.3   | All 13 tool specifications          |
| Panel Rebuild Spec v3.4         | Panel page — steps 4b/4c pending    |
| Dashboard & CL Spec v1.2        | Dashboard & CL governing doc        |
| Dashboard Spec v3.2             | Dashboard rebuild — blocked         |
| Auth Panel & Activate Spec v1.4 | Panel auth — step 5 pending         |
| Multi-User Account Spec v1.0    | Multi-user — approved, awaiting     |
|                                 | build                               |
| Tool ID Audit v1.0              | Canonical tool ID register          |
| Topbar JS Spec v1.0             | Spec for topbar.js — complete       |
| CL Connections Spec v1.0        | OneDrive, Dropbox, SharePoint       |
|                                 | connections architecture             |
| CL Connections Spec v1.2        | CL Connections spec. Approved.      |
|                                 | Build complete, integration test    |
|                                 | pending.                            |
| CL Items Spec v1.0              | Manual Add Item and Editable        |
|                                 | Pending Items                        |
| Image Processing Spec v1.0      | Visual content ingestion across     |
|                                 | all sources including photo upload   |
| CL Category Descriptions v1.0  | Agreed category descriptions for    |
|                                 | CL intake. Approved April 2026.     |
| CL Tool Descriptions v1.0      | Agreed tool descriptions for CL     |
|                                 | intake auto-tagging. April 2026.    |
| Manual Add Item Spec v1.0      | Manual Add Item spec. Approved      |
|                                 | April 2026, awaiting build.         |
| Google Drive Migration Spec v1.0 | Google Drive migration to multi-  |
|                                 | account pattern. Build complete,    |
|                                 | integration test pending.           |
| CL Connections Spec v1.2 App. A | Import lookback controls for all    |
|                                 | CL connections. Awaiting build.     |
| PWA & Mobile Spec v1.1          | PWA infrastructure, install prompt, |
|                                 | mobile layout standard, camera      |
|                                 | access pattern. Build complete,     |
|                                 | integration test complete.          |
|                                 | Prerequisite for Task 12.           |
| Image Processing Spec v1.1      | Image ingestion across all CL       |
|                                 | sources, on-site photo capture,     |
|                                 | tool camera reuse pattern. Build    |
|                                 | complete, integration test in       |
|                                 | progress.                           |
| StaxAI-External-Platform-       | External platform connections        |
| Connections-Spec-v1_0           | (Xero, QuickBooks, ServiceM8,       |
|                                 | MYOB deferred, Buildxact deferred). |
|                                 | Spec approved April 2026. Build     |
|                                 | complete, integration test in       |
|                                 | progress.                           |
| StaxAI-New-Tool-Ideas-v1.0     | Six new tool ideas for future       |
|                                 | consideration. Not approved for     |
|                                 | build. Each requires a full spec    |
|                                 | before build begins.                |
| StaxAI-Email-Assistant-Flag-   | Email flagging with Gmail/Outlook   |
| Handled-Spec-v1_1              | write-back, dismiss/restore,        |
|                                 | days-back scan coverage control.    |
|                                 | Approved April 2026. Build          |
|                                 | complete.                           |
