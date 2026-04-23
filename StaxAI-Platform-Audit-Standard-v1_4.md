# StaxAI
# PLATFORM INTEGRITY AUDIT STANDARD
## Reusable audit instruction for all authenticated pages and tool files

| | |
|---|---|
| **Document** | StaxAI-Platform-Audit-Standard-v1_4 |
| **Version** | v1.5 — April 2026 |
| **Status** | Approved — permanent reference |
| **Purpose** | Structured audit instruction to run against every authenticated page set. Covers file architecture, stylesheet compliance, JavaScript standards, error handling patterns, database integrity, shared utility usage, behavioural consistency, and copy standards. Run as a report-only step. No changes during audit. |
| **Reference** | Rules & Instructions v2.9, CLAUDE.md, Page Layout Standard, staxai-auth.css, shared-utils.js |

> **Warning:** This audit is always report-only. No changes are made during an audit session. Findings are reviewed with the owner and a fix list is agreed before any code changes begin.

---

## 1. How to Use This Document

This document is a reusable audit standard. To run an audit against a page set, send the instruction in Section 3 to Claude Code with the specific files listed for that page set. Code reads every file, checks every item in every category, and produces a structured findings report.

After the report comes back, review the findings with the owner in Chat. Agree a prioritised fix list. Then give Code targeted fix instructions one commit per fix.

This document is updated whenever new platform standards are agreed. Every update gets a new version number. Always use the latest version.

---

## 2. Audit Categories

The audit covers 14 categories. Each category is checked against every file in the page set. Results are reported as Pass, Fail, or N/A per item per file.

### Category 1 — File Architecture

- Page follows the split architecture: shell HTML + logic JS file. No monolithic files.
- Shell file contains HTML structure, all CSS, and generic JS functions only. No tool-specific content or hardcoded data.
- Logic file defines a single global window object (e.g. window.ND_LOGIC) with an init() method. All logic runs inside init(). Nothing at module scope except the bootstrap call.
- Bootstrap IIFE in the shell HTML passes supabase and user to init() after session confirmation.
- All files are within size limits: shell files under 60,000 chars, logic files under 60,000 chars.
- shared-utils.js is loaded before the logic file on every page.
- escHtml() is used from shared-utils.js — never duplicated locally in any file.
- handleSave() is used from shared-utils.js for all Save button operations — never implemented locally.
- Any function used by 3 or more files lives in shared-utils.js, not duplicated inline (per Rules v2.9 Section 13b).
- No dead imports, unused requires, or duplicate module-level declarations.

### Category 2 — Script Load Order

- staxai-auth.css loaded before all other stylesheets and before any scripts.
- Script load order matches content-library.html exactly: auth.js → topbar.js → shared-utils.js → pwa.js → logic file.
- Supabase CDN URL matches the platform standard used across all pages.
- No scripts loaded in the HTML head — all scripts before closing body tag except staxai-auth.css.

### Category 3 — Auth Gate

- #page-wrap hidden via display:none in the HTML until session is confirmed by getSession() or getUser().
- No page content renders before auth resolves.
- Redirect to /login on session failure.
- Auth gate present on every authenticated page — no exceptions.

### Category 4 — Topbar

- topbar.js loaded and handles the topbar entirely.
- Standard topbar shell HTML present with correct IDs for topbar.js to function.
- No inline topbar CSS in the page style block.
- No inline dropdown wiring in the logic file — no account button click handlers, no sign-out handlers, no account email population. These are all handled by topbar.js.
- Correct navigation links for the page type: Dashboard link present, tool-specific settings or tool link present where appropriate.

### Category 5 — Stylesheet Compliance

- Every CSS value in the page style block uses a stylesheet variable — no hardcoded hex values, px sizes, font family names, or border-radius values.
- All CSS classes used in the HTML and JS come from staxai-auth.css where an equivalent class exists. No page-level CSS for components that exist in the stylesheet.
- Page-level style block contains only CSS classes that are genuinely unique to that page and will never appear on any other page. Each page-level class has a written justification for why it cannot be in the stylesheet.
- No inline style= attributes in JS-built HTML strings. All styling via named CSS classes.
- No hex colour values in JS. All colours read from the stylesheet at runtime via getComputedStyle if needed.
- No JS hover bindings or visual state assignments via element.style. All hover states defined in CSS.
- staxai-auth.css loads before the page style block — the stylesheet always wins the cascade for shared classes.
- Uses existing platform components instead of custom equivalents. FAIL if the tool creates custom button, pill, navigation, or card classes when platform equivalents exist in staxai-auth.css (e.g. .btn-primary, .btn-outline, .filter-pill, .profile-nav-chip, .profile-section-card, .ptab). Before creating any new CSS class, grep staxai-auth.css for an existing component that serves the same purpose.
- No shared components in page style blocks. FAIL if a CSS component used by more than one page is defined in a page-local style block instead of staxai-auth.css. Components used by multiple pages must be in the shared stylesheet.
- Every platform class referenced in HTML or JS must be verified to exist in staxai-auth.css before use. Run grep against the stylesheet to confirm. Do not assume a class exists based on another page's local styles — page-local CSS is not available to other pages.

### Category 6 — JavaScript Standards

- No inline onclick handlers anywhere — in the HTML or in JS-built HTML strings.
- All events wired via addEventListener in the logic file.
- All Supabase query results checked for .error — no unchecked queries.
- All fetch() calls checked for response.ok before processing the response.
- No silent catch blocks — every catch logs the error with console.error at minimum.
- UI state only updates after confirmed database or API success — never optimistically before the operation completes.
- All class toggling via classList — never element.style for visual states.
- Every class name referenced in JS has a corresponding CSS definition in the stylesheet or page style block.
- JS syntax valid — confirmed with node --check.
- Apostrophes in JS strings handled correctly — escaped or using double-quoted outer strings.
- No hardcoded industry, trade, or business-type assumptions in prompts, labels, or data models.
- No custom interactive behaviours that don't exist on reference platform pages. FAIL if the tool adds visual state changes (e.g. colour progression on tabs, done states, preview text in buttons) that are not present on comparable platform pages. Check against the reference page specified for visual consistency.

### Category 7 — Error Handling Standard

- All error messages display as modal popups using platform-standard modal components — never as inline text or alerts.
- Error modals use the .save-msg modal pattern from shared-utils.js or equivalent platform-standard modal classes.
- No error messages rendered as plain text, status text, or inline DOM elements.
- API failure messages are user-friendly and actionable — no raw error codes or technical jargon in user-facing messages.
- All error states provide a clear action for the user (retry, go back, contact support, etc.).
- Network/API errors distinguish between client issues (invalid input) and server issues (try again later).

### Category 8 — Save Button Standard

- All Save buttons use the .btn-save class from staxai-auth.css.
- All Save buttons call window.handleSave(btn, saveFn, msgEl) from shared-utils.js.
- No local implementation of save feedback logic — handleSave() handles all Saving... / Saved ✓ / error states.
- No persistent Saved/disabled state — button always resets after 2 seconds.
- One .save-msg modal element present per page for error display.
- No success modal — success is communicated via button text only.
- Validation errors (not save errors) may still use the .save-msg modal with appropriate error text.

### Category 9 — Settings Page Standard

This category applies to settings pages only. N/A for tool pages.

- Tab bar present using .tab-nav / .ptab / .ptab-content pattern from the Page Layout Standard Section 3a.
- Every section of settings is in its own tab — no flat card layout without tabs.
- Tab switching wired via addEventListener in the logic file — never inline.
- Page heading uses .page-header / .page-title / .page-subtitle pattern from the Page Layout Standard Section 3.0.
- Each settings section uses the .settings-card pattern from the Page Layout Standard Section 3b: .settings-card-header, .settings-card-title, .settings-card-hint, .settings-rows, .settings-footer.
- Frequency selectors use the .freq-btn pattern from the Page Layout Standard Section 5.
- Lookback dropdowns use the .lookback-dropdown component from staxai-auth.css.
- Immediate-save controls (freq-btn, lookback-dropdown) have no Save button — they save on interaction.
- Deferred-save controls (text inputs, checkboxes) have a Save button using handleSave().

### Category 10 — Mobile Standard

This category applies to confirmed mobile-capable pages only. N/A for desktop-only pages. Confirmed mobile pages: dashboard.html, account.html, login.html, forgot-password.html, reset-password.html, social.html, email-assistant.html, news-digest.html, customer-updates.html (when built), design-viz.html (when built).

- No PWA desktop-only guard on mobile-capable pages.
- Tab bar scrolls horizontally on mobile via .tab-nav overflow behaviour — no wrapping.
- All interactive elements have a minimum 44px tap target height.
- No content overflows the viewport on a 375px wide screen.
- Font sizes readable on mobile — no text smaller than 13px.
- Cards full width on mobile.
- Action buttons full width or appropriately sized on mobile.

### Category 11 — Redundant Code

- No dead CSS rules — every class in the page style block is referenced in the HTML or JS.
- No unused functions or variables in the logic file.
- No commented-out code blocks.
- No duplicate CSS rules introduced.
- No functions duplicating behaviour already in shared-utils.js or staxai-auth.css.
- No legacy patterns from pre-rollout builds: no inline topbar CSS, no old dropdown wiring, no hardcoded colour values, no radio button patterns replaced by freq-btn.

### Category 12 — Copy and Brand Standards

- Australian English throughout: colour, organisation, recognised, behaviour, etc.
- No exclamation marks in UI copy.
- No 'we' or 'our' language — 'you' and 'your' only.
- No old brand names: never 'TradeAI Pro', never 'Stax AI' (two words). Always 'StaxAI' or 'STAXAI'.
- No hardcoded industry or trade assumptions in any UI copy, prompt text, or placeholder text.
- No hours/dollars saved messaging.

### Category 13 — Database Integrity

- All database table names referenced in .from() calls exist in the actual Supabase schema.
- All column names referenced in .select() calls exist in their respective tables.
- All column names referenced in .eq(), .neq(), .gt(), .lt(), .gte(), .lte(), .like(), .ilike(), .in() calls exist in their respective tables.
- All column names referenced in .update() and .insert() calls exist in their respective tables.
- All column names referenced in .upsert() calls and onConflict parameters exist in their respective tables.
- All data property access (data.column_name, item.column_name) matches actual column names from the query results.
- All ORDER BY column references (.order()) exist in their respective tables.
- No queries attempt to access columns that were renamed, removed, or never existed in the schema.

### Category 14 — Component Standards

- Platform component verification. Before referencing any platform class in HTML or JS, the auditor must confirm it exists in staxai-auth.css by searching the file directly. Do not rely on class names seen in other page HTML files — those may be page-local CSS. Every class assumed to come from the stylesheet must have a confirmed match in the stylesheet.
- Approval required for custom CSS creation. Any new CSS class that does not exist in staxai-auth.css requires explicit owner approval before creation. The audit must flag every page-local CSS class and confirm it has no equivalent in the stylesheet. If an equivalent exists, the page must use the stylesheet class.
- Reference page specified for visual consistency. Every tool page audit must name one existing platform page as its visual reference (e.g. "matches news-digest.html" or "matches content-library.html Business Profile"). The auditor must visually compare navigation, buttons, pills, cards, and form inputs between the tool and its reference page. FAIL if any component renders differently from the reference page when using the same platform class.
- Custom class count reported. The audit must count and report the total number of page-local CSS classes (classes defined in the page style block, not in staxai-auth.css). This count is tracked over time. Any increase between audit versions requires justification.

---

## 3. Audit Instruction Template

Copy and paste the following instruction to Claude Code. Replace [FILE LIST] with the specific files for the page set being audited.

> **Warning:** Send this instruction exactly as written. Do not summarise or paraphrase. The instruction must be complete for Code to produce a thorough report.

> Read CLAUDE.md in full, then begin.
>
> Read the following files in full: [FILE LIST]. Also read staxai-auth.css and shared-utils.js in full.
>
> This is a platform integrity audit. Check every item in every category below against every file. Report findings as a structured table: Category, Item, File, Result (Pass / Fail / N/A), and Notes for any Fail or partial result. Do not make any changes. Report only.

Then paste the full Category list from Section 2 of this document into the instruction.

---

## 4. Page Sets

The following table lists the files to include for each page set audit. Always include staxai-auth.css and shared-utils.js in every audit.

| Page Set | Files to Audit |
|---|---|
| Content Library | All frontend files: content-library.html, cl-logic.js, cl-review.js, cl-upload.js, cl-outputs.js, cl-profile.js, cl-queue.js. All backend API files: api/cl-*.js and any other API endpoints that interact with CL data. |
| CL Settings | All frontend files: cl-settings.html, cl-settings-logic.js, cl-settings-onedrive.js, cl-settings-sharepoint.js, cl-settings-dropbox.js, cl-settings-tools.js. All backend API files related to CL settings and connections. |
| Email Assistant | All frontend files: email-assistant.html, email-assistant-logic.js. All backend API files: api/ea-*.js and any other API endpoints that interact with EA data. |
| EA Settings | All frontend files: email-assistant-settings.html, email-assistant-settings-logic.js. All backend API files related to EA settings and connections. |
| Industry News Digest | All frontend files: news-digest.html, news-digest-logic.js. All backend API files: api/news-digest-*.js and any other API endpoints that interact with ID data. |
| ID Settings | All frontend files: news-digest-settings.html, news-digest-settings-logic.js. All backend API files related to ID settings. |
| Dashboard | All frontend files: dashboard.html, dashboard-data.js, dashboard-widgets.js. All backend API files that interact with dashboard data. |
| Account | All frontend files: account.html, account-logic.js. All backend API files that interact with account/user management data. |
| Panel Auth | All frontend files: panel-auth.html. All backend API files related to panel authentication and tool activation. |
| Strategic Plan | All frontend files: strategic-plan.html, strategic-plan-logic.js, strategic-plan-data.js. All backend API files: api/strategic-plan-generate.js, api/strategic-plan-load-context.js. Reference page: content-library.html Business Profile section. |

---

## 5. What to Do With Findings

After Code returns the audit report:

- Review every Fail item with the owner in Chat. Confirm each is a genuine issue and agree the correct fix.
- Prioritise fixes: safety/security issues first, then functional issues, then visual/consistency issues.
- Give Code fix instructions one commit per fix. Never batch multiple fixes into one commit.
- After all fixes are committed, re-run the audit against the same file set to confirm everything passes.
- Sign off the page set only when all items pass or are confirmed N/A.

---

## 6. Adding New Audit Items

When a new platform standard is agreed, add it to the relevant category in Section 2 of this document and increment the version number. Every future audit automatically covers it.

New items discovered during a fix session that should have been caught by the audit must be added before the next audit begins. This document grows incrementally as the platform matures.

---

## 7. Change Log

| Version | Changes |
|---|---|
| v1.0 — April 2026 | Initial document. 11 audit categories covering file architecture, script load order, auth gate, topbar, stylesheet compliance, JavaScript standards, Save button standard, settings page standard, mobile standard, redundant code, and copy/brand standards. Sourced from Rules v2.9, CLAUDE.md, Page Layout Standard, and issues identified during the April 2026 stylesheet rollout and ID tool rebuild sessions. |
| v1.1 — April 2026 | Added Category 7 — Error Handling Standard. Error messages must display as modal popups using platform-standard components, not inline text. Categories renumbered: Save Button Standard now Category 8, Settings Page Standard now Category 9, Mobile Standard now Category 10, Redundant Code now Category 11, Copy and Brand Standards now Category 12. Total categories increased from 11 to 12. |
| v1.2 — April 2026 | Added Category 13 — Database Integrity. All database table names and column names referenced in code must exist in the actual Supabase schema. Covers .select(), .eq(), .update(), .insert(), .upsert(), and data property access patterns. Prevents schema/code mismatches that cause runtime errors. Total categories increased from 12 to 13. |
| v1.3 — April 2026 | Updated Page Sets to include all backend API files for comprehensive coverage. Each tool audit now includes both frontend files and all related API endpoints that interact with that tool's data. Prevents schema mismatches in backend code that were previously missed. |
| v1.4 — April 2026 | Restored Categories 1-12 that were accidentally dropped in v1.2. The v1.2 update replaced the entire category list with only the new Category 13 instead of adding to the existing categories. This version merges: Categories 1-12 from v1.1 (including the corrected .tab-nav/.ptab/.ptab-content pattern), Category 13 from v1.2, and the expanded Page Sets from v1.3. All 13 categories and 90 audit items now present. |
| v1.5 — April 2026 | Strengthened audit to catch component reuse violations discovered during the Strategic Plan tool rebuild. Category 5 (Stylesheet Compliance): added 3 new checks — must use existing platform components instead of custom equivalents, no shared components in page-local style blocks, and must verify platform classes exist in staxai-auth.css before referencing them. Category 6 (JavaScript Standards): added check for custom interactive behaviours not present on reference platform pages. New Category 14 (Component Standards): 4 checks covering platform component verification, approval for custom CSS creation, reference page requirement for visual consistency, and custom class count reporting. Added Strategic Plan to Page Sets. Total categories increased from 13 to 14. |
