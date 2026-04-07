# CLAUDE.md
# StaxAI — Claude Code Session Reference
# Updated: April 7 2026

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

---

## Rules & Instructions v2.9 — What Applies to Claude Code

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
- Section 10 — Rules 10, 11, 12, 13, 14
- Section 12 — Split File Architecture
- Section 13 — Development Standards
- Section 16 — Industry-Agnostic Platform
- Section 18 — Activity-Specific Rules (check every session)
- Pre-Commit Checklist Sections 3–6, 8

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

---

## Stylesheet Rollout Process

The agreed process for the CSS variable rollout across all
authenticated pages:

1. Code reads the next CSS block in the target file AND the
   stylesheet, compares them, and reports any missing or
   incorrect values in the stylesheet
2. Chat and owner review findings and decide what is correct
3. Code makes both changes together — updates stylesheet first,
   then swaps hardcoded values in the file — two separate
   commits, one per file
4. Owner checks browser to confirm nothing changed visually
5. Repeat for next block

---

## Active Tasks

### CL Functional Improvements

Tasks 1–5 and Task 14 — CL Functional Improvements complete.

---

## Active Tasks — Continued

These tasks must be completed before the stylesheet rollout
begins.

### Task 8 — CL Intake Architecture

Task 8 — CL Intake Architecture complete.

### Task 10 — CL Connections

Task 10 — CL Connections (OneDrive, SharePoint, Dropbox) —
build complete, integration test pending.

New files: api/cl-oauth-initiate.js,
api/cl-onedrive-callback.js, api/onedrive-import.js,
api/cl-sharepoint-callback.js, api/sharepoint-import.js,
api/cl-dropbox-callback.js, api/dropbox-import.js.

Updated files: cl-settings-logic.js, cl-settings.html,
cl-upload.js.

Integration test checklist:
- Connect OneDrive — OAuth completes, folder picker shows
  folders, folders saved, Scan Now imports files, items
  appear in Source Material Review
- Connect SharePoint — OAuth completes, site picker shows
  sites, library picker shows libraries, Scan Now imports
  files, items appear in Source Material Review
- Connect Dropbox — OAuth completes, folder picker shows
  folders, folders saved, Scan Now imports files, items
  appear in Source Material Review
- All three sources show correct source_detail on items in
  Source Review
- Rescan is idempotent — already scanned files are skipped
- Connect Another adds a second account without overwriting
  the first
- Disconnect removes the account and its folders correctly

### Task 11 — CL Items

- Build Manual Add Item and Editable Pending Items in the
  Content Library. Requires CL Items Spec v1.0 to be written
  and approved before build begins.

### Task 12 — Image Processing

- Extend all scan endpoints and the upload tab to handle
  images and visual content. Includes photo upload capability.
  Requires Image Processing Spec v1.0 to be written and
  approved before build begins.

### Task 13 — Accounting Platform Integration

- Connect MYOB, Xero, QuickBooks, and Reckon as CL data
  sources. Requires dedicated spec before build begins.

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
- btn-outline class in staxai-auth.css applies a 2px border
  that overrides inline styles. When styling buttons to match
  platform patterns, check for btn-outline interactions and
  use explicit border values rather than relying on class
  inheritance.
- cl_outlook_last_scanned_at column on profiles table is a
  dead column — no endpoint reads or writes it. Outlook scan
  uses outlookEntry.last_scanned_at inside cl_connected_emails
  jsonb array. To be removed during stylesheet rollout.
- Google Drive flat columns (cl_drive_connected,
  cl_drive_access_token, cl_drive_refresh_token,
  cl_drive_folders) are superseded by cl_drive_accounts but
  still exist in profiles. drive-import.js and
  api/auth/oauth-callback.js still read and write the flat
  columns. Must be migrated to cl_drive_accounts before
  launch.
- drive-import.js uses the legacy extraction prompt and
  references the dropped cl_active_categories column. Must
  be updated to match the modern standard used in the new
  import endpoints before launch.
- connection-subitem CSS class in cl-settings-logic.js is
  unstyled. Pick up during stylesheet rollout.
- .btn-sm has two conflicting definitions in
  content-library.html. Consolidate during stylesheet
  rollout.
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
- Pill width in cl-upload.js may need CSS adjustment for
  long email addresses with multi-account connections. Pick
  up during stylesheet rollout.

---

## Pre-Launch Build Order

Mandatory sequence. No step begins until the previous step
is complete and confirmed working.

| Step | Task                                                       |
|------|------------------------------------------------------------|
| 1    | ~~Complete Task 6 — CL Settings OAuth / CL Upload~~  DONE |
| 2    | ~~Complete CL Functional Improvements~~  DONE              |
| 3    | Complete Standalone Tasks A, B, C                          |
| 4    | Complete CL Connections (OneDrive, Dropbox, SharePoint)    |
| 5    | Complete CL Items (Manual Add Item, Editable Pending)      |
| 6    | Complete stylesheet rollout across CL files                |
| 7    | Complete stylesheet rollout across cl-settings.html        |
| 8    | Roll stylesheet out to all remaining authenticated pages   |
| 9    | Integration tests — all 5 tools                            |
| 10   | Functional reviews — all 5 tools (real data, end-to-end)  |
| 11   | Improvements per tool based on functional review findings  |
| 12   | Dashboard rebuild                                          |

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

### Deferred — Address During Tool Rebuilds

The following will be resolved naturally as each tool is
rebuilt during the stylesheet rollout:
- 60+ inline onclick handlers across post-login pages
- 450+ hardcoded CSS values across post-login pages
- Duplicated auth check pattern across 10+ files
- Duplicated escapeHtml() across 5 files
- Duplicated account dropdown JS across 10+ files
- panel.html / panel-auth.html shared renderPanel() duplication
- Logic files not following window.*_LOGIC + init() pattern
- Full CL page uniformity audit — fonts, colours, consistency
  across all tabs — dedicated session after standalone tasks
  A, B, C are complete
- Tool Outputs — tool order and which tools actually belong
  in the list to be revisited once real outputs are visible

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

---

## Supabase Schema

Refer to StaxAI Project Brief v12.23

Notable changes made April 2026:
- profiles: added cl_drive_folders (jsonb),
  cl_drive_access_token (text), cl_drive_refresh_token (text),
  cl_outlook_last_scanned_at (timestamptz)
- profiles: removed cl_active_categories, cl_custom_categories
- profiles: added cl_drive_accounts (jsonb),
  cl_onedrive_accounts (jsonb), cl_sharepoint_accounts (jsonb),
  cl_dropbox_accounts (jsonb)
- profiles: dropped cl_onedrive_connected,
  cl_onedrive_access_token, cl_onedrive_refresh_token,
  cl_onedrive_folders, cl_sharepoint_connected,
  cl_sharepoint_access_token, cl_sharepoint_refresh_token,
  cl_sharepoint_site, cl_sharepoint_libraries,
  cl_dropbox_connected, cl_dropbox_access_token,
  cl_dropbox_refresh_token, cl_dropbox_folders
- cl_settings: added onedrive_scan_frequency,
  sharepoint_scan_frequency, dropbox_scan_frequency
- content_library: UNIQUE constraint added on source_ref
- content_library: NOT NULL constraint removed from content_type
- content_library: added source_detail (jsonb), source_item_id
  (text), tool_tags (jsonb), tool_source (text), category_tags
  (jsonb)
- content_library: added version_pair_id (uuid),
  version_archived_by (uuid)

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
- cl-settings.html does not load staxai-auth.css — known
  issue to be fixed during stylesheet rollout (Pre-Launch
  Step 4).
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
