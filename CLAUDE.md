# CLAUDE.md
# StaxAI — Claude Code Session Reference
# Updated: April 2026

---

## ⚠️ CRITICAL — READ BEFORE TOUCHING ANYTHING

These rules have caused real damage when missed. They are first
because they are the most important.

**Never force push — no exceptions, ever.**
**One file per commit — never batch multiple files.**
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

### Task 1 — Repo & Schema Inventory (report only — no commits)

Report all findings to the owner via Chat before any changes
are made to any file.

1. List every file in the repo with its purpose
2. Confirm the correct stylesheet filename
3. Search the entire repo for the string 'Your Trade. Your Stax.'
   and report every file and line where it appears
4. Confirm the full Supabase schema from the codebase — every
   table and column referenced across all files
5. Findings feed into Project Brief Sections 7 and 8, which
   Chat will update after review

### Task 2 — Structural Analysis (report only — no commits)

Report all findings to the owner via Chat. No changes committed
until findings reviewed and a plan agreed.

Review the entire codebase for:
- Compliance with split architecture (Rules v2.9 Section 12)
  — identify any monolithic files that violate this pattern
- Code quality — redundant code, dead code, duplicated logic,
  inconsistent or poorly structured blocks
- Best practice software development standards — files that
  are hard to maintain or incorrectly wired together
- Any other violations of development standards in Rules v2.9
  Section 13

### Task 3 — Fix CL Settings OAuth (current build blocker)

⚠️ Do not begin until Tasks 1 and 2 are complete and findings
reviewed with the owner via Chat.

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
|      | — CURRENT BLOCKER                                          |
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
| Project Brief v12.22            | Platform reference and architecture |
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
