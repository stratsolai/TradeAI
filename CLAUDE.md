# CLAUDE.md
# StaxAI — Claude Code Session Reference
# Updated: April 8 2026

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

### Task 10 — CL Connections integration test in progress

Full integration test for OneDrive, SharePoint, and Dropbox
per CL Connections Spec v1.2 checklist. OneDrive scanning
confirmed working. SharePoint and Dropbox testing in progress.

Fixed during integration test:
- SharePoint scan returning no files — recursive walker added
  in api/sharepoint-import.js so files in subfolders are found
  at all depths
- OneDrive scan returning no files in nested folders — same
  recursive walker pattern applied to api/onedrive-import.js
- Dropbox root-level files now scanned automatically on every
  import-all call
- SharePoint last_scanned_at moved from account level to per
  site inside cl_sharepoint_accounts.sites
- File format coverage extended — PowerPoint, HEIC, HTML,
  CSV on Drive, legacy Office on every cloud connector
- Per-status counts (approved / pending / rejected) returned
  by every scan endpoint and surfaced in the upload tab
- Scan completion messages — stacking, per-status,
  dismissible, source-identified. Every message leads with
  the tile name (Gmail, Outlook, Google Drive, OneDrive,
  SharePoint, Dropbox, Website). SharePoint messages include
  the site name as well as the library name.
- Promotions & Offers rule promoted from category description
  to RULES section as RULE 8 in every prompt-bearing file.
  Sender added to email prompts (cl-email-scan.js and
  cl-outlook-scan.js) so the model can apply the rule to
  inbound supplier promotional emails.
- Website character cap raised from 8,000 to 40,000 and
  max_tokens raised from 4,000 to 8,000 in scrape-website.js
- Dropbox pill consistency — Scan Now now requires pill
  selection (consistent with all other tiles). The synthetic
  "Dropbox root files" pill is still rendered so users can
  scan root by ticking it.
- Defensive error handling added to all seven scan branches
  in cl-upload.js. Vercel timeouts now produce a clear error
  message identifying the source instead of an unhelpful
  "Unexpected token A..." JSON parse error.
- Google Drive scan — confirmed working end to end.

Outstanding before sign-off:
- SharePoint — Investment Proposal v1.docx (DOCX)
  consistently not imported across multiple clean test
  runs — diagnosis pending.
- Dropbox — two of three PDFs consistently missed across
  multiple clean test runs — diagnosis pending.
- Gmail — returning 1 of 4 emails on a clean database —
  diagnosis pending.
- OneDrive — timing out on Vercel's 300-second limit due
  to the recursive walker on large folder trees — blocked
  on Task 15 (background scanning).
- Outlook — returning fewer emails than expected due to
  last_scanned_at semantics — blocked on Lookback Controls
  (Appendix A).
- Website — single page only, subpages not crawled —
  blocked on Task 16.

### Task 10a — Manual Upload category leaking into AI extraction

Discrete fix task. Must be fixed before Task 10 can be
signed off.

The Manual Upload category is reserved for the manual
upload flow only and must never be assigned by the AI
extraction pipeline. It is currently appearing as an
AI-assigned category on Dropbox scan results. The fix is
to remove Manual Upload from the category list available
to the AI in EXTRACTION_SYSTEM_PROMPT across all eight
prompt-bearing files (cl-email-scan.js, cl-outlook-scan.js,
onedrive-import.js, sharepoint-import.js, dropbox-import.js,
drive-import.js, scrape-website.js, process-file.js). The
category must remain in the canonical CATEGORY_LOOKUP and
ALL_CATEGORIES lists in those files so manual-upload rows
already in content_library still validate, but it must not
appear in the prompt's CATEGORIES section that the model
chooses from.

### Task 11 — CL Items

Build Manual Add Item and Editable Pending Items. Spec:
Manual Add Item Spec v1.0. Awaiting build.

### Task 12 — Image Processing

Extend all scan endpoints and upload tab to handle images.
Spec required before build begins.

### Task 13 — Accounting Platform Integration

Connect MYOB, Xero, QuickBooks, Reckon as CL data sources.
Spec required before build begins.

### Task 14 — Email Attachment Scanning (Gmail + Outlook)

Extend cl-email-scan.js and cl-outlook-scan.js to read message
attachments in addition to the email body. Currently both
endpoints only call extractEmailBody / extractOutlookBody and
ignore every attachment on every message — invoices, supplier
statements, quotes, brochures, certificates, and price lists
that arrive as PDF/DOCX/XLSX attachments are silently invisible
to the platform. For SMBs this is the largest single ingestion
gap because business email value lives in the attachments, not
the cover message.

Spec required before build begins. Spec must cover at minimum:

- Attachment discovery — Gmail's payload.parts walk for parts
  with Content-Disposition: attachment, Outlook's
  /messages/{id}/attachments endpoint.
- Per-attachment download via the relevant provider API
  (Gmail users.messages.attachments.get, Outlook
  /messages/{id}/attachments/{attachmentId}/$value).
- Reuse the canonical CL intake pipeline once the attachment
  bytes are in hand — same EXTRACTION_SYSTEM_PROMPT, same
  disposition / confidence / Financial Documents / auto-archive
  logic, same cl_source_items + content_library shape used by
  the file connectors. The shared extraction prompt is already
  duplicated across the connectors and is on the consolidation
  list — worth deciding before this build whether to extract
  the prompt to a shared module first or duplicate it once more.
- File format coverage — at minimum the same set the cloud
  connectors accept (PDF, DOCX, XLSX, PPTX, legacy Office,
  text/*, images). Gate at the same place the other connectors
  do.
- Dedupe key — message-id alone is no longer enough since one
  message can carry many attachments. Suggest a composite key
  of gmail_message_id / outlook_message_id + attachment_id (or
  attachment filename hash) on cl_source_items.source_detail.
- Size and rate limits — Claude document API caps documents
  around 32MB base64; Gmail attachments can exceed that. Spec
  must say what happens for oversized attachments (skip with
  explicit log? attempt anyway? offer manual fallback?).
- last_scanned_at semantics — currently the email scanners
  stamp last_scanned_at after a successful body scan. With
  attachments, decide whether the timestamp should advance on
  body-only success or only when attachments are also processed,
  so a partial failure does not skip everything on rescan.
- Lookback interaction — Task 14 should respect the per-account
  lookback_months value once Lookback Controls Appendix A is
  built.

### Task 15 — Background Scan Processing

Move scan execution off the synchronous Vercel serverless
request path and onto a queue + worker model so scans are
not bound by the 300-second function timeout, do not lose
their state when the user navigates away, and do not block
the upload tab while running. Architecture is **Option B —
Supabase queue + Vercel Cron worker**. Spec required before
build begins.

Key design requirements for the spec:

- cl_scan_jobs table schema — at minimum: id, user_id,
  source_type, source_account, source_path / source_id,
  status (queued / running / completed / failed),
  approved / pending / rejected counters, error text,
  created_at, started_at, completed_at, last_heartbeat_at,
  retry_count.
- Queue endpoint — POST /api/scan-queue inserts a row and
  returns immediately with the job id. cl-upload.js calls
  this in place of the current direct /api/<source>-import
  fetches and shows a "scan queued" state on the tile.
- Worker endpoint — /api/scan-worker picks up queued jobs
  (FIFO with optional prioritisation), runs the existing
  import-all logic for that source against the job's
  account / folder, and updates the job row with counts and
  status. Existing import endpoint logic is reused so the
  canonical CL intake pipeline does not get duplicated.
- Vercel Cron wiring — scan-worker invoked on a Vercel Cron
  schedule (per the Pro plan minimum interval). Each cron
  invocation processes a small batch of queued jobs and
  exits well before the 300-second cap, then the next cron
  tick picks up the next batch.
- UI changes — cl-upload.js shows a queued state on each
  tile after Scan Now, polls /api/scan-jobs?user_id= for
  status updates (or subscribes via Supabase Realtime if
  the latency is too high), and renders the existing
  stacking dismissible messages when each job completes.
- Concurrency limits — cap the number of jobs the worker
  processes in parallel within a single cron invocation,
  and cap the number of in-flight Claude API calls across
  all running jobs. Stays well under the Anthropic per-key
  rate limit even at peak.
- Claude API rate limit handling — on a 429 from
  api.anthropic.com, the worker should requeue the current
  job with a backoff delay rather than failing it. Track
  retries on the job row and only mark failed after a
  configurable number of retries.
- Job prioritisation — manual scans (user clicked Scan Now)
  take priority over scheduled scans (frequency setting).
  Spec needs to define how this is expressed in the queue
  ordering.
- Timeout recovery — jobs stuck in running state after 10
  minutes (i.e. last_heartbeat_at older than 10 minutes)
  are reset to queued by a watchdog so a Vercel function
  death does not strand the job. The worker writes
  last_heartbeat_at periodically while running.
- Designed for scale from the start — the schema, the
  queue ordering, and the concurrency caps must work for
  hundreds of users with multiple connected accounts each
  scanning daily, not just for the current handful of
  test users. Decisions baked in at spec time so we do
  not have to re-architect when usage grows.

When the admin dashboard is built it must include scan
queue monitoring — job counts by status, average and 95th
percentile processing times by source, failure rates, queue
depth, oldest queued job age. If scan performance degrades
under load — queue depth growing faster than the worker
can drain it, processing times climbing into the cron
interval, retry counts spiking — the architecture should
be migrated from Option B to Inngest before users are
affected. Inngest's durable execution model handles queue
overflow, concurrency control, and retries natively
without the cron-interval latency floor; the migration
target is documented up front so the admin dashboard
metrics can be set against thresholds that trigger the
migration.

### Task 16 — Website Subpage Crawling

Each website scan currently processes one URL only — only
the page at the configured URL is fetched and extracted.
Subpages (Services, About, Pricing, Team, Testimonials,
blog posts, project case studies) are invisible regardless
of how content-rich they are. For most marketing sites the
bulk of valuable content lives on subpages that the
homepage just links to. Spec required before build begins.

Spec must cover at minimum:

- Link following — extract internal links from the fetched
  page, follow them up to a configurable per-domain depth
  and per-domain page count. Same-domain only by default.
- robots.txt compliance — fetch and respect robots.txt
  before crawling. User-Agent set to a stable identifier
  so site owners can block the scanner if they choose.
- sitemap.xml support — when present, prefer the sitemap
  over link-following because it gives a complete page
  list without the domain-walking overhead.
- Per-page token budgets — each page goes through the
  existing runExtractionPrompt with the existing 40,000
  character cap and 8,000 max_tokens, but the total
  crawl needs an overall page count cap to keep cost and
  runtime predictable.
- Dedupe — the same URL fetched twice within one scan
  should not produce two cl_source_items rows. The
  source_ref shape web:<url>:<scanTs>:<idx> already
  handles per-URL dedupe but the scan-level dedupe set
  needs to remember which URLs the current crawl has
  already visited.
- Background scan integration — subpage crawling will
  produce many more per-page extraction calls and is a
  natural candidate for the Task 15 background scan
  worker, not the synchronous endpoint. Spec for Task 16
  should land after Task 15's spec to take advantage of
  the queue.

### Lookback Controls — Appendix A

Build user-controlled import lookback for all CL connections
per CL Connections Spec v1.2 Appendix A. Covers Gmail,
Outlook, OneDrive, SharePoint, Dropbox. Google Drive
lookback already built as part of Google Drive Migration.
Runs after Task 10 integration test.

Note: the current last_scanned_at behaviour in
cl-email-scan.js and cl-outlook-scan.js causes subsequent
scans to miss historical emails — once a scan completes
last_scanned_at advances to "now" and the next scan only
fetches messages received after that timestamp, narrowing
the window further on every run. The Appendix A build
must address this. Scans should use the user's lookback
window as the lower bound on every scan, not
last_scanned_at. last_scanned_at can still be used for
optimisation (e.g. an upper bound on what has already been
processed) but must not be the only filter.

---

## Known Issues & Notes

- OneDrive scans on large folder trees may hit Vercel's
  300-second function timeout. The recursive walker added
  to api/onedrive-import.js processes every subfolder
  depth-first and each file is run through Claude's
  document API and the canonical extraction prompt
  synchronously, so a deeply nested folder with hundreds
  of documents can exceed the cap. Vercel returns its
  plain-text gateway page on timeout, which cl-upload.js
  now surfaces as a clear "OneDrive server returned 504"
  error rather than the previous "Unexpected token A..."
  parse error. Will be resolved by Task 15 background
  scan processing — once scans run on a queue + worker
  model, the per-invocation timeout no longer caps the
  total scan duration.
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
- Lookback controls for OneDrive, SharePoint, and Dropbox
  are wired in cl-settings-logic.js (lookback_months
  persisted to jsonb) but the import endpoints do not yet
  read the value. Wire up per CL Connections Spec v1.2
  Appendix A build sequence.
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
- _upgradeSharepointEntry helper duplicated across
  cl-settings-logic.js, api/sharepoint-import.js, and
  cl-upload.js intentionally — each file independently
  upgrades legacy { site, libraries } entries to the
  multi-site { sites: [...] } shape on read. Consolidate
  into a shared module during stylesheet rollout cleanup
  pass.
- _saveDriveFolders in cl-settings-logic.js is unused dead
  code following the Drive folder picker rewrite to
  immediate-save Add/Remove buttons. Remove during
  stylesheet rollout cleanup pass.

---

## Pre-Launch Build Order

Mandatory sequence. No step begins until the previous step
is complete and confirmed working.

| Step | Task                                                       |
|------|------------------------------------------------------------|
| 1    | ~~Complete Task 6 — CL Settings OAuth / CL Upload~~  DONE |
| 2    | ~~Complete CL Functional Improvements~~  DONE              |
| 3    | Complete Standalone Tasks A, B, C                          |
| 4    | Complete CL Connections — build complete, integration     |
|      | test in progress. Confirmed working: Google Drive.         |
|      | Partial: Dropbox, SharePoint, Gmail. Outstanding: see      |
|      | Task 10 outstanding items above.                           |
| 4a   | Complete lookback controls (CL Connections Spec v1.2       |
|      | Appendix A)                                                |
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
| Google Drive Migration Spec v1.0 | Google Drive migration to multi-  |
|                                 | account pattern. Build complete,    |
|                                 | integration test pending.           |
| CL Connections Spec v1.2 App. A | Import lookback controls for all    |
|                                 | CL connections. Awaiting build.     |
