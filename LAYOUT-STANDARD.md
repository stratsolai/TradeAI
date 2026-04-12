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

*To be documented after Email Assistant tool page functional review —
April 2026.*

---

## Change Log

| Version | Changes |
|---------|---------|
| v1.0 — April 2026 | Initial document. All patterns sourced from exact code read from cl-settings.html and cl-settings-logic.js (current HEAD) and commit f7f72e2. Topbar section intentionally minimal — topbar.js is the reference. Tool page section pending EA functional review. |
