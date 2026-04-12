# StaxAI — Page Layout Standard
# Updated: April 2026

This document is the canonical reference for how authenticated pages are
assembled. It works alongside staxai-auth.css. The stylesheet defines the
classes and variables. This document defines how to combine them into pages.

This document is built strictly from exact code read directly from the repo
and decisions explicitly made by the owner. Nothing is assumed or reconstructed
from memory. When a pattern is not documented here, raise it before building.

This document grows incrementally. Each page review adds new patterns.

---

## 1. Authenticated Page Rules (All Pages)

- Every authenticated page links staxai-auth.css in the head
- Every authenticated page loads auth.js in the head
- Every authenticated page loads topbar.js before the closing body tag
- topbar.js handles all account dropdown behaviour — no dropdown wiring
  in any logic file
- No inline onclick handlers anywhere — all events via addEventListener
  in the logic file
- No hardcoded CSS values — CSS variables only
- Supabase CDN URL must match the platform standard used across all pages —
  confirm against an existing page before committing

---

## 2. Topbar

topbar.js handles the topbar on every authenticated page. Load it and it
works. No topbar HTML or JS needs to be documented or built separately.

The required HTML IDs for topbar.js to function are documented in
topbar.js itself and in CLAUDE.md.

---

## 3. Settings Pages

### 3.0. Page Heading

Reference: cl-settings.html

Every settings page has a page heading above the tab bar — a title and a
one-line description.

```html
<div class="page-header">
  <h1 class="page-title">[Page Title]</h1>
  <p class="page-subtitle">[Brief description of what this settings page controls.]</p>
</div>
```

Page heading CSS (inline in the settings page file):

```css
.page-header { margin-bottom: 32px; }
.page-title {
  font-family: var(--heading-font);
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
}
.page-subtitle {
  font-size: 15px;
  color: var(--text-muted);
}
```

### 3a. Tab Bar and Tab Panel Structure

Reference: cl-settings.html

```html
<div class="stab-bar">
  <button class="stab active" data-tab="[tab-id]">Tab Label</button>
  <button class="stab" data-tab="[tab-id]">Tab Label</button>
  <button class="stab" data-tab="[tab-id]">Tab Label</button>
</div>

<div class="stab-panel active" id="tab-[tab-id]">
  ...
</div>
<div class="stab-panel" id="tab-[tab-id]">
  ...
</div>
<div class="stab-panel" id="tab-[tab-id]">
  ...
</div>
```

Tab CSS (inline in the settings page file):

```css
.stab-bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--border);
  margin-bottom: 28px;
}
.stab {
  padding: 13px 24px;
  font-family: var(--body-font);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  border: none;
  background: none;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s, border-color 0.15s;
}
.stab:hover { color: var(--text); }
.stab.active {
  color: var(--blue);
  border-bottom-color: var(--blue);
  font-weight: 600;
}
.stab-panel { display: none; }
.stab-panel.active { display: block; width: 100%; box-sizing: border-box; }
```

Tab switching is wired in the logic file via addEventListener on .stab
buttons — never inline onclick.

### 3b. Settings Card

Every section within a tab is wrapped in a settings card.

```html
<div class="settings-card">
  <div class="settings-card-header">
    <div class="settings-card-title">Section Title</div>
    <div class="settings-card-hint">Brief description of what this section does.</div>
  </div>
  <div class="settings-rows">
    <!-- .settings-row blocks go here -->
  </div>
  <div class="settings-footer">
    <button class="btn-save" id="save-[section]-btn">Save</button>
    <span class="save-msg" id="save-[section]-msg"></span>
  </div>
</div>
```

Settings card CSS (inline in the settings page file):

```css
.settings-card {
  width: 100%;
  box-sizing: border-box;
  background: var(--white);
  border: 1px solid var(--border);
  border-left: 4px solid var(--blue);
  border-radius: 12px;
  margin-bottom: 24px;
  overflow: hidden;
}
.settings-card-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
}
.settings-card-title {
  font-family: var(--heading-font);
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.3px;
}
.settings-card-hint {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
  font-family: var(--body-font);
}
.settings-rows { padding: 0; }
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border);
}
.settings-row:last-child { border-bottom: none; }
.settings-row-label {
  font-weight: 600;
  color: var(--text);
  font-size: 14px;
  font-family: var(--body-font);
}
.settings-row-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
  font-family: var(--body-font);
}
.settings-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}
```

The settings-footer with Save button is omitted on sections that save
immediately on interaction (e.g. scan frequency toggles).

---

## 4. Connections Tab Pattern

Reference: cl-settings.html Library Connections tab and cl-settings-logic.js.

Used on any settings page where the tool connects to external accounts via
OAuth. Supports multiple connected accounts per provider.

### 4a. Static HTML Shell (per provider)

```html
<div class="settings-row settings-row-top">
  <div>
    <div class="settings-row-label">[Provider Label]</div>
    <div class="settings-row-desc">[Description of what this connection does.]</div>
  </div>
  <div class="connection-row-control">
    <div id="[provider]-connections-list" class="connection-list"></div>
    <button id="add-[provider]-btn" class="btn-add-connection">+ Add [Provider]</button>
  </div>
</div>
```

When no accounts are connected the connections list is empty and only the
Add button is visible.

### 4b. JS-Rendered Connected State (per account)

Each connected account is rendered by the logic file into the
#[provider]-connections-list container:

```javascript
'<div class="connection-item">' +
  '<div class="connection-item-row1">' +
    '<span class="connection-item-email">' + (e.email || '') + '</span>' +
    '<button class="btn-disconnect" data-email="' + (e.email || '') +
      '" data-type="[type]">Disconnect</button>' +
  '</div>' +
  '<div class="connection-item-row2">' +
    // lookback dropdown rendered here via helper function
  '</div>' +
'</div>'
```

### 4c. Connection Tile CSS

```css
.settings-row-top { align-items: flex-start; }
.connection-row-control {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: 1 1 auto;
  min-width: 0;
}
.connection-list { width: 100%; }
.connection-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.connection-item:last-child { border-bottom: none; }
.connection-item-row1 { display: flex; align-items: center; gap: 8px; }
.connection-item-row2 {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}
.connection-item-email {
  width: 360px;
  flex: 0 0 360px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--body-font);
  color: var(--text);
  background: var(--white);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.connection-item-row1 > .btn-disconnect { margin-left: auto; }
.connection-item-lookback { display: inline-flex; align-items: center; flex-shrink: 0; }
.btn-disconnect {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--white);
  color: var(--red-dark);
  border: 2px solid var(--red-dark);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--body-font);
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.btn-disconnect::before { content: "\2717"; font-size: 14px; }
.btn-disconnect:hover { background: var(--red-hover-bg); color: var(--red-dark); }
.btn-add-connection {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--white);
  color: var(--blue);
  border: 2px solid var(--blue);
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--body-font);
  cursor: pointer;
  margin-top: 10px;
  transition: background 0.15s;
}
.btn-add-connection:hover { background: var(--blue-light); color: var(--blue); }
#connections-rows .settings-row > div:first-child { flex: 0 0 300px; max-width: 300px; }
```

---

## 5. Scan Frequency Pattern

Reference: cl-settings.html Scan Settings tab.

Used on any settings page where the tool has a configurable scan cadence.
Options vary by source type — email uses Daily / Weekly / Manual only,
website uses Weekly / Monthly / Manual only.

### 5a. Row HTML

```html
<div class="settings-row">
  <div>
    <div class="settings-row-label">[Source Name]</div>
    <div class="settings-row-desc">[Description of what is scanned.]</div>
  </div>
  <div class="settings-row-control" id="[source]-freq-ctrl">
    <button class="freq-btn active" data-field="[field_name]" data-value="daily">Daily</button>
    <button class="freq-btn" data-field="[field_name]" data-value="weekly">Weekly</button>
    <button class="freq-btn" data-field="[field_name]" data-value="manual">Manual only</button>
  </div>
</div>
```

Active selection is set on page load from the saved setting and toggled by
addEventListener in the logic file. Saves immediately on selection — no
Save button required on this section.

### 5b. Frequency Button CSS

```css
.settings-row-control {
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--blue);
  flex-shrink: 0;
  margin-left: 16px;
}
.freq-btn {
  background: var(--white);
  color: var(--text-muted);
  border: none;
  font-family: var(--body-font);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  border-right: 2px solid var(--blue);
  min-width: 90px;
  text-align: center;
}
.freq-btn:last-child { border-right: none; }
.freq-btn:hover { background: var(--blue-light); color: var(--blue); }
.freq-btn.active,
.freq-btn.active:hover { background: var(--blue-light); color: var(--blue); }
```

---

## 6. On/Off Toggle Section Pattern

Reference: cl-settings.html commit f7f72e2 (Categories tab, before removal).

Used on any settings page where a list of items can be individually enabled
or disabled. The same .freq-btn pattern from Section 5 is reused for On/Off
buttons.

### 6a. Tab Panel Structure

```html
<div class="stab-panel" id="tab-[section]">
  <div class="settings-card" id="[section]-card">
    <div class="settings-card-header">
      <div class="settings-card-title">Section Title</div>
      <div class="settings-card-hint">Description of what these toggles control.</div>
    </div>
    <div class="settings-rows" id="[section]-grid"></div>
    <div class="settings-footer">
      <button type="button" class="btn-save" id="save-[section]-btn">Save</button>
      <span class="save-msg" id="save-[section]-msg"></span>
    </div>
  </div>
</div>
```

### 6b. JS-Rendered Row Patterns

Standard on/off row:

```javascript
'<div class="settings-row cat-row">' +
  '<div><div class="settings-row-label">' + itemName + '</div></div>' +
  '<div class="settings-row-control">' +
    '<button type="button" class="freq-btn active" data-item="' + itemName + '" data-val="on">On</button>' +
    '<button type="button" class="freq-btn" data-item="' + itemName + '" data-val="off">Off</button>' +
  '</div>' +
'</div>'
```

Row with Remove option (user-added items):

```javascript
'<div class="settings-row cat-row">' +
  '<div><div class="settings-row-label">' + itemName + '</div></div>' +
  '<div class="settings-row-control">' +
    '<button type="button" class="btn-remove-url" data-remove="' + itemName + '">Remove</button>' +
    '<button type="button" class="freq-btn active" data-item="' + itemName + '" data-val="on">On</button>' +
    '<button type="button" class="freq-btn" data-item="' + itemName + '" data-val="off">Off</button>' +
  '</div>' +
'</div>'
```

### 6c. Add Item Row (when user-addable items are supported)

```html
<div class="settings-add-row" style="display:flex;align-items:center;gap:12px;
  padding:16px 24px 8px 24px;max-width:66%;">
  <input type="text" id="[section]-custom-input" class="settings-text-input"
    style="flex:1;min-width:0" placeholder="Add a custom item...">
  <button type="button" id="add-[section]-btn" class="btn-add">+ Add</button>
</div>
```

---

## 7. Tool Pages

Reference: content-library.html (look-and-feel bible) and staxai-auth.css.

### 7a. Page Container and Header

Tool pages use a `.container` wrapper with a `.page-header` containing a
title and subtitle. The same `.page-header` / `.page-title` /
`.page-subtitle` classes are used on both tool pages and settings pages.

```html
<div class="container">
  <div class="page-header">
    <h1 class="page-title">[Page Title]</h1>
    <p class="page-subtitle">[Brief description.]</p>
  </div>
  <!-- stats bar, tab bar, tab panels -->
</div>
```

Container CSS (inline in content-library.html):

```css
.container { max-width: 1400px; margin: 0 auto; padding: 32px 24px; }
```

Page header CSS (inline in content-library.html — identical to settings
pages):

```css
.page-header { margin-bottom: 28px; }
.page-title { font-size: 28px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.page-subtitle { color: var(--text-muted); font-size: 15px; }
```

### 7b. Primary Tab Bar

The primary tab bar uses `.tab-nav` as the container and `.ptab` buttons
for each tab. CSS is defined in staxai-auth.css Section 8. Each tab has a
`data-tab` attribute matching a content panel ID. Tabs can include emoji
prefixes.

```html
<div class="tab-nav">
  <button class="ptab active" data-tab="upload">Upload & Import</button>
  <button class="ptab" data-tab="review">Source Material Review</button>
  <button class="ptab" data-tab="outputs">Tool Outputs</button>
  <button class="ptab" data-tab="profile">Business Profile</button>
</div>

<div id="cl-tab-upload" class="ptab-content active"></div>
<div id="cl-tab-review" class="ptab-content"></div>
<div id="cl-tab-outputs" class="ptab-content"></div>
<div id="cl-tab-profile" class="ptab-content"></div>
```

Panel IDs follow the pattern `cl-tab-[data-tab value]`. The first tab and
its panel both have `.active` on page load.

Tab CSS (staxai-auth.css):

```css
.tab-nav {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--border);
  margin-bottom: 28px;
  overflow-x: auto;
  scrollbar-width: none;
}
.ptab {
  padding: 13px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  transition: all 0.2s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--body-font);
  text-decoration: none;
}
.ptab:hover { opacity: 0.85; }
.ptab.active { border-bottom-color: var(--orange); }
.ptab-content { display: none; }
.ptab-content.active { display: block; }
```

Active tab underline is `var(--orange)` on tool pages. Settings pages
override this with `var(--blue)` via the `.settings-active` class —
see staxai-auth.css.

Tab switching is wired in the logic file via addEventListener on `.ptab`
buttons — never inline onclick. The logic file function `switchPTab(tab)`
removes `.active` from all `.ptab` and `.ptab-content` elements, then
adds `.active` to the matching button and panel:

```javascript
function switchPTab(tab) {
  document.querySelectorAll('.ptab-content').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.ptab').forEach(function(el) { el.classList.remove('active'); });
  var panel = document.getElementById('cl-tab-' + tab);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.ptab').forEach(function(el) {
    if (el.dataset.tab === tab) el.classList.add('active');
  });
}

document.querySelectorAll('.ptab[data-tab]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    switchPTab(btn.dataset.tab);
  });
});
```

### 7c. Filter Pill Row (Source Material Review)

The review tab has a status pill row for filtering by item status, plus
secondary filter rows for category, tool, and source filters.

#### Status pills

```html
<div class="review-status-row">
  <button class="review-status-btn active" data-status="pending">Pending</button>
  <button class="review-status-btn" data-status="approved">Approved</button>
  <button class="review-status-btn" data-status="rejected">Rejected</button>
  <button class="review-status-btn" data-status="archived">Archived</button>
</div>
```

Status pill CSS (inline in content-library.html):

```css
.review-status-row { display:flex; gap:8px; padding:16px 0; align-items:center; }
.review-status-btn {
  display:flex; align-items:center; padding:10px 16px;
  border:1px solid rgba(0,0,0,0.10); border-left-width:4px;
  border-radius:10px; background:var(--white); color:var(--text-secondary);
  font-size:13px; font-family:inherit; font-weight:600;
  cursor:pointer; transition:opacity 0.15s;
}
.review-status-btn[data-status="pending"]  { border-left-color:var(--blue); }
.review-status-btn[data-status="approved"] { border-left-color:var(--green-dark); }
.review-status-btn[data-status="rejected"] { border-left-color:var(--red); }
.review-status-btn[data-status="archived"] { border-left-color:var(--grey-accent); }
.review-status-btn.active {
  background:var(--active-bg); color:inherit; font-weight:700;
}
.review-status-btn:hover { opacity:0.85; }
```

Each status pill has a 4px coloured left border matching its status. The
active pill gets `background:var(--active-bg)` and `font-weight:700`.
The `.active` style is the same for all statuses — only the left border
colour varies.

#### Secondary filter pills

Below the status row, secondary filter buttons allow filtering by
category, tool tag, and source. These are rendered by the logic file
into `.review-filter-row` and `.review-pill-row` containers.

```css
.review-filter-row { margin-bottom:12px; }
.review-pill-row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
.review-filter-btns-row { display:flex; align-items:center; gap:8px; padding:0 0 12px 0; }
```

Category pills (`.review-cats-btn`) have a purple left border. Tool
pills (`.review-tools-btn`) have a teal left border. Source pills
(`.review-source-btn`) have an orange left border. A clear-filters
button (`.review-clear-filters-btn`) sits at the end with
`margin-left:auto`. All share the same base structure:

```css
/* Example — category pill */
.review-cats-btn {
  border-width:1px 1px 1px 4px; border-style:solid;
  border-color:rgba(0,0,0,0.10); border-left-color:var(--purple);
  border-radius:10px; padding:10px 10px;
  font-size:13px; font-weight:600; color:var(--text-secondary);
  background:var(--white); cursor:pointer; font-family:var(--body-font);
  transition:opacity 0.15s; display:flex; align-items:center;
}
```

A search input (`.review-search-input`) sits in its own row:

```css
.review-search-row { margin-bottom:16px; }
.review-search-input {
  width:240px; max-width:240px; margin-left:auto; padding:10px 14px;
  border:1px solid var(--border); border-radius:8px; font-size:14px;
  font-family:inherit; box-sizing:border-box;
  background:var(--white); color:var(--text);
}
.review-search-input:focus { outline:none; border-color:var(--blue); }
```

### 7d. Content Card (Source Material Review)

Each content item is rendered as a `.review-card`. The card has a blue
left border accent, a header row with checkbox, editable title, badges,
and action buttons, a collapsible body preview, and expandable detail
sections.

```css
.review-list { display:flex; flex-direction:column; gap:12px; }

.review-card {
  background:var(--white); border-radius:12px;
  border-left:4px solid var(--blue);
  box-shadow:0 2px 8px rgba(0,0,0,0.07);
  overflow:hidden;
}
```

#### Card header

```css
.review-card-header {
  display:flex; align-items:center; gap:10px;
  padding:14px 16px; flex-wrap:wrap;
}
.review-checkbox { width:16px; height:16px; cursor:pointer; flex-shrink:0; }
.review-card-title {
  flex:1; min-width:140px; font-size:15px; font-weight:600;
  color:var(--text); outline:none; cursor:text;
  border-bottom:1px solid transparent;
}
.review-card-title:focus { border-bottom-color:var(--blue); }
```

The header contains, in order:
1. `.review-checkbox` — bulk select checkbox
2. `.review-card-title` — editable title (contenteditable in the logic
   file, with transparent bottom border that turns blue on focus)
3. `.review-type-badge` — content type label (e.g. "document", "image")
4. `.review-source-badge` — source label (e.g. "Gmail", "OneDrive")
5. `.review-upload-date` — relative or absolute date
6. `.review-card-btns` — action buttons (Approve, Reject)

Badge CSS:

```css
.review-type-badge {
  padding:3px 10px; border-radius:20px; font-size:12px;
  background:var(--blue-tint); color:var(--blue);
  white-space:nowrap; font-weight:500;
}
.review-source-badge {
  padding:3px 10px; border-radius:20px; font-size:12px;
  background:var(--bg); color:var(--text-muted); white-space:nowrap;
}
```

#### Action buttons

Approve and Reject buttons use the coloured left border pill pattern:

```css
.review-approve-btn {
  display:flex; align-items:center;
  border-width:1px 1px 1px 4px; border-style:solid;
  border-color:rgba(0,0,0,0.10); border-left-color:var(--green-dark);
  border-radius:10px; padding:10px 16px;
  font-size:13px; font-weight:600; color:var(--text-secondary);
  background:var(--white); cursor:pointer; font-family:var(--body-font);
  transition:opacity 0.15s;
}
.review-approve-btn:hover { background:var(--green-hover-bg); }

.review-reject-btn {
  display:flex; align-items:center;
  border-width:1px 1px 1px 4px; border-style:solid;
  border-color:rgba(0,0,0,0.10); border-left-color:var(--red);
  border-radius:10px; padding:10px 16px;
  font-size:13px; font-weight:600; color:var(--text-secondary);
  background:var(--white); cursor:pointer; font-family:var(--body-font);
  transition:opacity 0.15s;
}
.review-reject-btn:hover { background:var(--red-hover-bg); }
```

#### Body preview and expandable sections

Below the header, a preview row shows a truncated body with an expand
toggle:

```css
.review-card-preview-row {
  display:flex; align-items:center; gap:8px;
  padding:4px 16px 8px 16px; flex-basis:100%; min-width:0;
}
.review-expand-btn {
  background:none; border:none; cursor:pointer;
  color:var(--blue); font-size:12px; padding:0; flex-shrink:0;
}
.review-body-preview {
  font-size:13px; color:var(--text-muted);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  min-width:0; flex:1;
}
```

Expanded sections use `.review-section` with a top border separator:

```css
.review-section { padding:14px 16px; border-top:1px solid var(--border-light); }
.review-section-head {
  display:flex; justify-content:space-between; align-items:center;
  margin-bottom:10px;
}
.review-section-head span {
  font-size:12px; font-weight:700; color:var(--text-muted);
  text-transform:uppercase; letter-spacing:0.05em;
}
.review-body-text {
  font-size:14px; color:var(--text); line-height:1.6;
  outline:none; border:1px solid var(--border); border-radius:6px;
  padding:10px; min-height:60px; background:var(--bg-subtle);
}
.review-body-text:focus { border-color:var(--blue); background:var(--white); }
```

#### Empty and loading states

```css
.review-loading { text-align:center; padding:40px; color:var(--text-muted); font-size:14px; }
.review-empty { text-align:center; padding:40px; color:var(--text-disabled); font-size:14px; }
```

### 7e. Filter and Tab State Persistence

Reference: cl-review.js `_filterState`, `_saveFilterState`,
`_restoreFilterState`, `setStatus`.

Each status tab (Pending, Approved, Rejected, Archived) independently
preserves its own tool and category filter selections. When the user
switches between status tabs, the current filter state is saved and the
target tab's saved state is restored.

State is held in the `_filterState` object, initialised on the module:

```javascript
_filterState: {
  pending:  { tools: [], cats: [] },
  approved: { tools: [], cats: [] },
  rejected: { tools: [], cats: [] },
  archived: { tools: [], cats: [] }
}
```

`_saveFilterState()` copies the current `_toolFilters` and
`_categoryFilter` arrays into the slot for the current `_status`:

```javascript
_saveFilterState: function() {
  this._filterState[this._status] = {
    tools: this._toolFilters.slice(),
    cats: this._categoryFilter.slice()
  };
}
```

`_restoreFilterState(status)` reads the saved slot back into the active
filter arrays:

```javascript
_restoreFilterState: function(status) {
  var s = this._filterState[status];
  this._toolFilters = s ? s.tools.slice() : [];
  this._categoryFilter = s ? s.cats.slice() : [];
}
```

When a status pill is clicked (via `setStatus` or the `_bindControls`
click handler), the sequence is:

1. `_saveFilterState()` — persist current tab's filters
2. Set `_status` to the new status
3. `_restoreFilterState(status)` — load the new tab's saved filters
4. Clear `_searchTerm` to empty string
5. Clear `_selected` to a new empty `Set()`
6. Reset the search input value to empty
7. Close any open filter dropdowns via `_closeFilterDropdowns()`
8. Call `_load()` to fetch items for the new status and re-render

The primary tab bar (Upload / Review / Tool Outputs / Business Profile)
does not persist state — `switchPTab` simply toggles `.active` classes.
Each tab's content panel retains its DOM state while hidden (display:none)
so scroll position and form inputs survive tab switches.

### 7f. Checkbox Bulk Selection

Reference: cl-review.js `_selected`, `_bindCardEvents`,
`_updateBulkBar`.

Selection state is held in a `Set` on the module:

```javascript
_selected: new Set()
```

Each card renders a checkbox in the card header:

```javascript
'<input type="checkbox" class="review-checkbox" data-id="' + id + '"' + checked + '>'
```

The `checked` attribute is set from the current `_selected` set so
checkboxes survive re-renders:

```javascript
const checked = this._selected.has(item.id) ? ' checked' : '';
```

Checkbox change events are bound in `_bindCardEvents`:

```javascript
document.querySelectorAll('.review-checkbox').forEach(function(cb) {
  cb.addEventListener('change', function() {
    if (cb.checked) {
      self._selected.add(cb.dataset.id);
    } else {
      self._selected.delete(cb.dataset.id);
    }
    self._updateBulkBar();
  });
});
```

There is no select-all checkbox on individual cards. Selection is
per-item only. The `_selected` set is cleared (reset to `new Set()`)
whenever:
- A status tab is switched (`setStatus` and `_bindControls` click)
- A bulk action completes (`_bulkAction`, `_bulkActionAll`,
  `_bulkDelete`, `_bulkDeleteAll`)
- Data is reloaded (`_load`)

The Deselect All button in the bulk bar also clears the set and unchecks
all visible checkboxes.

### 7g. Bulk Action Bar

Reference: cl-review.js `_render`, `_updateBulkBar`.

The bulk action bar is rendered inside the review tab panel, positioned
between the filter button row and the item list. It is hidden by default
(`display:none`) and shown when one or more checkboxes are selected.

HTML structure (rendered by `_render`):

```html
<div id="review-bulk-bar" class="review-bulk-bar" style="display:none">
  <span id="review-bulk-count" class="review-bulk-label"></span>
  <button class="btn-outline review-bulk-approve-btn" id="review-bulk-approve-btn">Approve All Selected</button>
  <button class="btn-outline review-bulk-reject-btn" id="review-bulk-reject-btn">Reject All Selected</button>
  <button class="btn-outline" id="review-deselect-btn">Deselect All</button>
</div>
```

CSS (inline in content-library.html):

```css
.review-bulk-bar {
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  background:var(--bg); border:1px solid var(--border); border-radius:8px;
  padding:10px 16px; margin-bottom:16px;
}
.review-bulk-label { font-size:13px; color:var(--text-secondary); }
.review-bulk-approve-btn { border-color:var(--green-dark); color:var(--green-dark); }
.review-bulk-approve-btn:hover { background:var(--green-dark); color:var(--white); }
.review-bulk-reject-btn { border-color:var(--red); color:var(--red); }
.review-bulk-reject-btn:hover { background:var(--red); color:var(--white); }
```

Visibility is controlled by `_updateBulkBar`:

```javascript
_updateBulkBar: function() {
  const bar = document.getElementById('review-bulk-bar');
  const count = document.getElementById('review-bulk-count');
  if (!bar || !count) return;
  const n = this._selected.size;
  bar.style.display = n > 0 ? '' : 'none';
  count.textContent = n + ' selected';
}
```

The bar shows whenever `_selected.size > 0` and hides when it reaches 0.
The count label updates to show "{n} selected".

### 7h. Mark All / Bulk Action Behaviour

Reference: cl-review.js `_bulkAction`, `_bulkActionAll`, `_bulkDelete`,
`_bulkDeleteAll`, `_bindControls`.

There are two tiers of bulk action: selected items only (via the bulk
bar) and all visible items (via the Mark All buttons in the filter
button row).

#### Mark All buttons (filter button row)

The Approve All and Reject All buttons sit in the `.review-filter-btns-row`,
right-aligned via a `flex:1` spacer:

```html
<button class="btn-outline review-approve-all-btn" id="review-approve-all-btn">Approve All</button>
<button class="btn-outline review-reject-all-btn" id="review-reject-all-btn">Reject All</button>
```

These buttons act on **all currently filtered items** — not just checked
items. They are always visible regardless of checkbox selection.

The button labels change contextually based on the active status tab.
`_updateRejectButtons` runs after each load:

- On the Rejected tab: "Reject All" becomes "Delete All" and
  "Reject All Selected" becomes "Delete All Selected"
- On the Approved tab: the Approve All and bulk Approve buttons are
  hidden (`display:none`)

```javascript
_updateRejectButtons: function() {
  var isRejected = this._status === 'rejected';
  var isApproved = this._status === 'approved';
  var allBtn = document.getElementById('review-reject-all-btn');
  var selBtn = document.getElementById('review-bulk-reject-btn');
  if (allBtn) {
    allBtn.innerHTML = isRejected ? '&#10007; Delete All' : '&#10007; Reject All';
  }
  if (selBtn) {
    selBtn.innerHTML = isRejected ? '&#10007; Delete All Selected' : '&#10007; Reject All Selected';
  }
  var approveAllBtn = document.getElementById('review-approve-all-btn');
  var bulkApproveBtn = document.getElementById('review-bulk-approve-btn');
  if (approveAllBtn) approveAllBtn.style.display = isApproved ? 'none' : '';
  if (bulkApproveBtn) bulkApproveBtn.style.display = isApproved ? 'none' : '';
}
```

#### Bulk action functions

Four functions handle the database operations:

`_bulkAction(newStatus)` — acts on checked items only. Updates all IDs
in `_selected` to the new status, removes them from `_items`, clears
`_selected`, and re-renders:

```javascript
_bulkAction: async function(newStatus) {
  const ids = Array.from(this._selected);
  if (ids.length === 0) return;
  await this._supabase.from('content_library').update({ status: newStatus }).in('id', ids);
  this._items = this._items.filter(function(i) { return !self._selected.has(i.id); });
  this._selected = new Set();
  this._updateBulkBar();
  this._renderList();
  this._updateStatTiles();
}
```

`_bulkActionAll(newStatus)` — acts on all filtered items (respects
active category, tool, and search filters). Gets IDs from
`_filteredItems()`, updates all to the new status:

```javascript
_bulkActionAll: async function(newStatus) {
  var filtered = this._filteredItems();
  if (filtered.length === 0) return;
  var ids = filtered.map(function(i) { return i.id; });
  await this._supabase.from('content_library').update({ status: newStatus }).in('id', ids);
  this._items = this._items.filter(function(i) { return ids.indexOf(i.id) === -1; });
  this._selected = new Set();
  this._updateBulkBar();
  this._renderList();
  this._updateStatTiles();
}
```

`_bulkDelete()` — same as `_bulkAction` but deletes instead of
updating status. Used when the Reject button is clicked on the Rejected
tab (items already rejected are permanently deleted).

`_bulkDeleteAll()` — same as `_bulkActionAll` but deletes. Used when
Reject All / Delete All is clicked on the Rejected tab.

All four functions follow the same cleanup sequence after the database
call: filter removed items from `_items`, clear `_selected`, update the
bulk bar, re-render the list, and refresh the stat tiles via
`_updateStatTiles` (which calls `window.loadStats()`).

#### Wiring

The bulk bar buttons and Mark All buttons are bound in `_bindControls`:

```javascript
// Bulk bar — acts on selected items
document.getElementById('review-bulk-approve-btn').addEventListener('click', function() {
  self._bulkAction('approved');
});
document.getElementById('review-bulk-reject-btn').addEventListener('click', function() {
  if (self._status === 'rejected') { self._bulkDelete(); }
  else { self._bulkAction('rejected'); }
});
document.getElementById('review-deselect-btn').addEventListener('click', function() {
  self._selected = new Set();
  self._updateBulkBar();
  document.querySelectorAll('.review-checkbox').forEach(function(cb) { cb.checked = false; });
});

// Mark All — acts on all filtered items
document.getElementById('review-approve-all-btn').addEventListener('click', function() {
  self._bulkActionAll('approved');
});
document.getElementById('review-reject-all-btn').addEventListener('click', function() {
  if (self._status === 'rejected') { self._bulkDeleteAll(); }
  else { self._bulkActionAll('rejected'); }
});
```

---

## Change Log

| Version | Changes |
|---------|---------|
| v1.0 — April 2026 | Initial document. All patterns sourced from exact code read from cl-settings.html and cl-settings-logic.js (current HEAD) and commit f7f72e2. Topbar section intentionally minimal — topbar.js is the reference. Tool page section pending EA functional review. |
| v1.1 — April 2026 | Section 7a–7d added — page container, tab bar, filter pills, content card patterns from content-library.html and staxai-auth.css. |
| v1.2 — April 2026 | Section 7e–7h added — filter state persistence, checkbox bulk selection, bulk action bar, and Mark All behaviour from cl-review.js. |
