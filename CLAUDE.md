# CLAUDE.md
# StaxAI — Claude Code Session Reference
# Updated: April 2026

---

## ⚠️ CRITICAL — READ BEFORE TOUCHING ANYTHING

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

---

## ⚠️ Rules & Instructions v2.9 — What Applies to Claude Code

Read StaxAI-Rules-and-Instructions-v2.9.docx every session.
Large parts were written for a browser-based workflow that is
no longer in use. The following sections are browser-only —
skip them entirely:

SKIP — does not apply to Claude Code:
- Section 2 — GitHub Workflow (TI helper, PAT, blob/tree API)
- Section 3 — Chrome Extension Content Blocking
- Section 8 — Session Setup / GitHub API Tab
- Section 10 — Rules 1–5, 7, 8 (window._file, TI.load, atob,
  web_fetch, PAT, prompt())
- Section 11 — Chrome Extension Crash Prevention
- Section 15 — HEAD SHA via refs endpoint
- Pre-Commit Checklist Section 1 — file editing via window._file
- Pre-Commit Checklist Section 2 — btoa encoding rule only
  (apostrophe rules in Section 2 DO apply)
- Pre-Commit Checklist Section 7 — Git Data API method checks
  (never force push still applies — see above)

READ IN FULL — applies to Claude Code:
- Section 1 — Chat Behaviour
- Section 4 — Apostrophes & Special Characters
- Section 5 — Design System
- Section 6 — Document Maintenance
- Section 7 — Technical Rules (except Vercel tab navigation)
- Section 9 — Vercel Deployment
- Section 10 — Rules 10, 11, 12, 13, 14 (content migration,
  tools.html, index.html, hero CSS classes)
- Section 12 — Split File Architecture
- Section 13 — Development Standards
- Section 16 — Industry-Agnostic Platform
- Section 18 — Activity-Specific Rules (check every session)
- Pre-Commit Checklist Sections 3–6, 8 (adapted — see
  Pre-Commit Checks below)

---

## Active Tasks

Complete in order. Do not begin the next task until the current
one is finished and findings reviewed with the owner via Chat.

### ✅ Task 1 — Repo & Schema Inventory (complete)

Completed April 2026. Findings reviewed with owner via Chat.
- Every file listed and documented
- Stylesheet filename confirmed: staxai-auth.css
- 'Your Trade. Your Stax.' — not found anywhere in codebase
- 21 Supabase tables documented
- Project Brief updated to v12.23 with full file inventory
  and schema

### ✅ Task 2 — Structural Analysis (complete)

Completed April 2026. Findings reviewed with owner via Chat.
Full findings and agreed decisions documented below in the
Structural Analysis Findings & Agreed Decisions section.

### ✅ Task 3 — Category 2 Quick Wins (complete)

Completed April 2026. 14 commits, all pushed to GitHub.
- admin.html — TradeAI Pro → StaxAI (2 instances) — b7177ca
- forgot-password.html — TradeAI Pro → StaxAI — 089532c
- offline.html — TradeAI Pro → StaxAI — 13ec1bd
- reset-password.html — TradeAI Pro → StaxAI (2 instances) — f3fd22c
- pwa.js — TradeAI → StaxAI (2 instances) — 063e91f
- index.html — meta: trade businesses → small businesses — e10907a
- api/news-digest-refresh.js — industry assumption fix — 6458b43
- terms-of-service.html — industry assumption fix — 8f58ff0
- cl-profile.js — placeholder fix — 3170d54
- chatbot-settings.html — we language fix — 59c6dc9
- content-library.html — our → your + exclamation mark — 216d57f
- cl-logic.js — exclamation mark removed — f3f8dc0
- tools.html — duplicate CSS removed — f3a7f43
- api/news-digest-refresh.js — async async bug fixed, dead
  TRADE_SOURCES map removed, User-Agent updated to
  StaxAI/1.0 — 626907c

### Task 4 — Stylesheet Class Name Fix

⚠️ Do not begin until instructed by owner via Chat.

staxai-auth.css defines .topbar-account-btn and
.topbar-account-dropdown but every page in the codebase uses
.account-btn and .account-dropdown. The stylesheet dropdown
styles are currently unused by every page.

Fix: Update staxai-auth.css to use .account-btn and
.account-dropdown (matching all existing pages) rather than
renaming every page.

Before making any changes:
1. Read staxai-auth.css in full
2. Identify every instance of .topbar-account-btn and
   .topbar-account-dropdown
3. Report the full list of changes needed to the owner
4. Owner will confirm before any changes are committed

### Task 5 — Create topbar.js (shared file)

⚠️ Do not begin until Task 4 is complete.
⚠️ Requires approved spec before any work begins. Owner will
provide spec via Chat before this task starts.

topbar.js will be a new shared JS file containing the standard
account dropdown behaviour for all authenticated pages:
- Populate account-email-short with the user's email prefix
- Populate account-dropdown-email with the user's full email
- Wire dropdown toggle (open/close on button click,
  close on outside click)
- Wire sign-out button to /login consistently

This file will be loaded by every authenticated page as part
of the stylesheet rollout. It eliminates the duplicated
dropdown JS currently copy-pasted across 10+ files.

### Task 6 — Fix CL Settings OAuth (current build blocker)

⚠️ Do not begin until Task 5 is complete.

Files: cl-settings.html, cl-settings-logic.js

The OAuth connections for Gmail, Outlook, and Google Drive in
CL Settings are broken. The exact current state is unknown —
this has been fixed and broken multiple times.

Before making any changes:
1. Read cl-settings.html and cl-settings-logic.js in full
2. Report your full understanding of the current OAuth
   implementation to the owner via Chat
3. Owner will agree a fix approach with Chat
4. Only then begin any changes

---

## Structural Analysis Findings & Agreed Decisions

Completed April 2026 — Tasks 1 and 2. These findings inform
the build approach going forward.

### Post-Login Rebuild Strategy

Pre-login files (index.html, tools.html, panel.html,
panel-auth.html, industry-select.html, pricing-page.html)
are complete and not to be touched except for the specific
Category 2 fixes in Task 3 which are now done. No further
changes to pre-login files unless explicitly instructed.

All post-login authenticated pages are to be rebuilt to the
correct standard as part of the stylesheet rollout sequence.
The structural analysis findings on these files reflect known
problems that will be resolved during the rebuild — they are
not a separate fix list.

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

### Stylesheet — Known Issues

- staxai-auth.css defines .topbar-account-btn and
  .topbar-account-dropdown but every page uses .account-btn
  and .account-dropdown — stylesheet dropdown styles are
  currently unused. Fix is Task 4 above.
- content-library.html loads staxai-auth.css but also has
  its own inline CSS block overriding some dropdown styles —
  to be cleaned up during CL stylesheet rollout.
- cl-settings.html does not load staxai-auth.css at all —
  has its own complete inline CSS. To be fixed during
  CL Settings stylesheet rollout.

### Dropdown — Known Issues

Across all authenticated pages the dropdown is inconsistent:
- CL — no email display, sign-out goes to /login
- CL Settings — no sign-out wiring at all (broken)
- Chatbot — email display works, sign-out goes to /login
- Email Assistant — sign-out goes to index.html (wrong)

All of these are resolved by topbar.js (Task 5).

### Dead UI in content-library.html

Five modals exist in content-library.html (modal-website,
modal-drive, modal-schedule, modal-reject, modal-detail) with
onclick handlers calling functions that do not exist anywhere
in the codebase (closeModal, scrapeWebsite, confirmApprove,
confirmReject). These are dead UI — the modals cannot be
opened and the buttons do nothing.

Decision: Leave as-is for now. These will be addressed when
the CL rebuild reaches those features.

### window.CL_LOGIC

cl-logic.js does not define window.CL_LOGIC. The call to
window.CL_LOGIC.init() in content-library.html silently
fails. The page works anyway because cl-logic.js runs its
code on script load rather than waiting for init().

This is a structural violation but not a functional bug.
To be addressed when CL files are next touched as part of
the rebuild.

### Deferred — Address During Tool Rebuilds

The following findings from Task 2 are not separate tasks.
They will be resolved naturally as each tool is rebuilt
during the stylesheet rollout sequence:
- 60+ inline onclick handlers across post-login pages
- 450+ hardcoded CSS values across post-login pages
- Duplicated auth check pattern across 10+ files
- Duplicated escapeHtml() across 5 files
- Duplicated account dropdown JS across 10+ files
- panel.html / panel-auth.html shared renderPanel() duplication
- Logic files not following window.*_LOGIC + init() pattern

---

## End of Session — Mandatory

At the end of every session, before closing, produce a summary
in this exact format for the owner to bring to Chat:

COMPLETED THIS SESSION:
- [list every task completed with file names and commit refs]

CURRENT HEAD SHA: [sha]

NEXT SESSION SHOULD START WITH:
- [exact task and any specific instructions]

ANYTHING CHAT NEEDS TO KNOW:
- [decisions needed, blockers found, spec gaps, anything unusual]

This summary is how CLAUDE.md gets updated. The owner brings it
to Chat, we update this file together, then the owner starts a
new Code session with the updated CLAUDE.md.

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

---

## Platform Overview

StaxAI is an AI-powered SaaS platform for Australian SME
businesses. It gives business owners AI tools via individual
monthly subscriptions. No technical skills required.

- Live URL: https://staxai.com.au
- GitHub repo: https://github.com/stratsolai/TradeAI (public)
- Brand: StaxAI (formerly TradeAI Pro — never use the old name)
- Tagline: YOUR STAX │ YOUR WAY
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

---

## Supabase Schema

Refer to StaxAI Project Brief v12.23

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

## Pre-Launch Build Order

Mandatory sequence. No step begins until the previous step
is complete and confirmed working.

| Step | Task                                                       |
|------|------------------------------------------------------------|
| 1    | Fix CL Settings OAuth (Gmail, Outlook, Google Drive)       |
|      | — current blocker (Task 6 above)                           |
| 2    | Complete stylesheet rollout across CL files                |
| 3    | Complete stylesheet rollout across cl-settings.html        |
| 4    | Roll stylesheet out to all remaining authenticated pages   |
| 5    | Integration tests — all 5 tools                            |
| 6    | Functional reviews — all 5 tools (real data, end-to-end)  |
| 7    | Improvements per tool based on functional review findings  |
| 8    | Dashboard rebuild                                          |

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
- Pre-login files (index.html, tools.html, panel.html,
  panel-auth.html, industry-select.html, pricing-page.html)
  are not to be touched unless explicitly instructed.
- The Category 2 fixes in Task 3 are the only changes that
  were authorised for these files. That work is complete.

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
Easy to miss — have caused bugs before:

- tools.html has its own hardcoded copy of all tool data in
  its own script block, separate from tools-data.js. When
  changing any tool ID or property, update BOTH files.
- index.html has its own HERO_TOOLS array, separate from
  tools-data.js. When adding a tool or changing a toolId,
  update index.html HERO_TOOLS as well as tools-data.js
  and tools.html.
- index.html hero CSS classes must never be removed:
  .stax-stack, .stax-card, .stax-card-screenshot,
  .stax-card-info, .stax-tagline, .stax-tagline-pre,
  .stax-tagline-stax, .stax-tagline-post, .hero-stax-way.
- staxai-auth.css dropdown class names will be fixed in
  Task 4 to match .account-btn / .account-dropdown as used
  across all pages. Do not use .topbar-account-btn naming
  in any new code before Task 4 is complete.
- cl-settings.html does not load staxai-auth.css — it has
  its own inline CSS. This is a known issue to be fixed
  during the stylesheet rollout (Pre-Launch Step 3).
- content-library.html has 5 dead modals (modal-website,
  modal-drive, modal-schedule, modal-reject, modal-detail)
  with onclick handlers calling undefined functions. Do not
  attempt to wire these up — they are unbuilt features.

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

### Spec First
- No new feature, page, or schema change without an approved
  spec in Project Knowledge — no exceptions

### Pre-Commit Checks
⚠️ You must explicitly confirm every item on this checklist
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

JavaScript:
- No inline onclick handlers
- Apostrophes in JS strings handled correctly
- JS syntax valid — confirmed with node
- No force push

File integrity:
- DOCTYPE present, closing tags present
- File not truncated, not empty

Industry-agnostic (when editing AI prompts or data models):
- Confirmed works correctly for a non-trade industry such
  as accounting or consulting

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
| Auth CSS Spec v1.0              | Stylesheet spec — note: stylesheet  |
|                                 | is source of truth, not this doc    |
| CL New Features Spec v1.3       | Reference only — not governing.     |
|                                 | Current state determined by repo.   |
| Multi-User Account Spec v1.0    | Multi-user — approved, awaiting     |
|                                 | build                               |
| Tool ID Audit v1.0              | Canonical tool ID register          |
