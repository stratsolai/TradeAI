/**
 * cl-profile.js
 * Business Profile tab — shell, panel routing, form primitives,
 * validation, chip accordion, auto-save, Identity panel, Credentials
 * panel, and Marketing wrapper. Pairs with cl-profile-location.js
 * (Location panel) and cl-profile-products.js (Services & Products
 * panels), both of which Object.assign into the same window.CL_PROFILE
 * object so methods cross-reference each other freely. The marketing
 * wizard itself lives in cl-profile-marketing.js as window.BP_MARKETING.
 */

// @BP_FIELDS:identity — single source of truth for the fields this
// panel writes to profiles via /api/profile-save. Read by the
// endpoint at module load time (fs.readFileSync on this file +
// regex extract) to derive its allow-list. To add a new BP field:
// add it here, add its UI element below, add it to the updates
// object in _saveIdentity. The endpoint accepts it automatically
// on the next deploy with no separate sync. Do not rename the
// `window.BP_FIELDS_IDENTITY` identifier — the endpoint parser
// anchors on it.
window.BP_FIELDS_IDENTITY = [
  'business_name',
  'trading_name',
  'abn',
  'business_structure',
  'industry',
  'years_in_business',
  'employee_range',
  'logo_url',
  'marketing_theme_extra'
];

window.CL_PROFILE = window.CL_PROFILE || {};
Object.assign(window.CL_PROFILE, {
  _supabase: null, _userId: null, _profile: {},
  _autoSaveTimer: null, _activePanel: 'identity',
  init: function(supabase) {
    this._supabase = supabase;
    var container = document.getElementById('cl-tab-profile');
    if (!container) return;
    container.innerHTML = this._shell();
    this._bindTabs();
    this._bindDelegatedEvents(container);
    var self = this;
    var markInteracted = function() { self._userInteracted = true; };
    container.addEventListener('pointerdown', markInteracted, { capture: true, once: true });
    container.addEventListener('keydown', markInteracted, { capture: true, once: true });
    this._load();
  },

  _bindDelegatedEvents: function(container) {
    var self = this;
    container.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'remove-row') { self._removeRow(btn.dataset.target); }
      else if (action === 'add-phone') { self._addPhone(btn.dataset.target); }
      else if (action === 'add-location') { self._addLocation(); }
      else if (action === 'add-site') { self._addSite(); }
      else if (action === 'add-extra') { self._addExtra(); }
      else if (action === 'upload-logo') { document.getElementById('prof-logo-file').click(); }
      else if (action === 'add-other-item') { self._addOtherItem(btn.dataset.target); }
      else if (action === 'remove-other') { self._removeOtherChip(btn); }
      else if (action === 'add-theme-statement') { self._addThemeStatement(); }
      else if (action === 'prof-prev') { self._goToPanel(btn.dataset.target, false); }
      else if (action === 'prof-next') { self._goToPanel(btn.dataset.target, true); }
    });
    container.addEventListener('change', function(e) {
      if (e.target.classList.contains('prof-hours-toggle')) {
        self._toggleHoursRow(e.target);
      }
    });
  },

  _shell: function() {
    return '<div class="profile-wrap">' +
      '<div class="profile-nav-chips">' +
        '<button class="profile-nav-chip active" data-ptab="identity">1. Identity</button>' +
        '<button class="profile-nav-chip" data-ptab="location">2. Location &amp; Contact</button>' +
        '<button class="profile-nav-chip" data-ptab="services">3. Services</button>' +
        '<button class="profile-nav-chip" data-ptab="products">4. Products</button>' +
        '<button class="profile-nav-chip" data-ptab="credentials">5. Credentials &amp; Support</button>' +
        '<button class="profile-nav-chip" data-ptab="marketing">6. Marketing Theme</button>' +
      '</div>' +
      '<div id="prof-panel-identity" class="profile-panel active"></div>' +
      '<div id="prof-panel-location" class="profile-panel"></div>' +
      '<div id="prof-panel-services" class="profile-panel"></div>' +
      '<div id="prof-panel-products" class="profile-panel"></div>' +
      '<div id="prof-panel-credentials" class="profile-panel"></div>' +
      '<div id="prof-panel-marketing" class="profile-panel"></div>' +
    '</div>';
  },

  _bindTabs: function() {
    var self = this;
    var wrap = document.getElementById('cl-tab-profile');
    wrap.querySelectorAll('.profile-nav-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._triggerAutoSave(self._activePanel);
        wrap.querySelectorAll('.profile-nav-chip').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        wrap.querySelectorAll('.profile-panel').forEach(function(p) { p.classList.remove('active'); });
        self._activePanel = btn.dataset.ptab;
        document.getElementById('prof-panel-' + btn.dataset.ptab).classList.add('active');
      });
    });
  },

  _load: async function() {
    var sess = await this._supabase.auth.getSession();
    if (!sess.data.session) return;
    this._userId = sess.data.session.user.id;
    var res = await this._supabase.from('profiles').select('*').eq('id', this._userId).single();
    if (res.error) { console.error('[CL Profile] _load query error:', res.error.message); return; }
    this._profile = res.data || {};
    this._renderIdentity();
    this._renderLocation();
    this._renderServices();
    this._renderProducts();
    this._renderCredentials();
    this._renderMarketing();
  },

  _v: function(key) { var v = this._profile[key]; return (v === null || v === undefined) ? '' : v; },
  _va: function(key) { var v = this._profile[key]; return Array.isArray(v) ? v : []; },
  _vj: function(key, fallback) {
    var v = this._profile[key];
    if (v === null || v === undefined) return fallback || [];
    if (typeof v === 'string') { try { return JSON.parse(v); } catch(e) { return fallback || []; } }
    return v;
  },
  _panelOrder: ['identity', 'location', 'services', 'products', 'credentials', 'marketing'],

  // The btn-save button is kept in the DOM but display:none so the
  // existing handleSave-based autosave path keeps working — visually
  // the user sees only the wizard nav row below.
  _card: function(icon, title, subtitle, body, panelId, btnId) {
    return '<div class="profile-section-card">' +
      '<div class="profile-section-header">' +
        '<div class="profile-section-icon">' + icon + '</div>' +
        '<div>' +
          '<div class="profile-section-title">' + title + '</div>' +
          '<div class="profile-section-subtitle">' + subtitle + '</div>' +
        '</div>' +
      '</div>' +
      body +
      '<button id="' + btnId + '" class="btn-save" style="display:none" aria-hidden="true">Save</button>' +
      this._navHtml(panelId) +
    '</div>';
  },

  // Wizard-style Back/Next nav rendered at the bottom of each BP panel.
  // First panel has no Back, last panel has no Next. Saved ✓ indicator
  // sits to the right of Back and fades after each successful autosave.
  _navHtml: function(panelId) {
    var idx = this._panelOrder.indexOf(panelId);
    var hasBack = idx > 0;
    var hasNext = idx >= 0 && idx < this._panelOrder.length - 1;
    var backHtml = hasBack
      ? '<button class="btn-back" data-action="prof-prev" data-target="' + window.escHtml(this._panelOrder[idx - 1]) + '">Back</button>'
      : '';
    var nextHtml = hasNext
      ? '<button class="btn-back" data-action="prof-next" data-target="' + window.escHtml(this._panelOrder[idx + 1]) + '">Next</button>'
      : '';
    return '<div class="profile-nav-row" style="display:flex;align-items:center;gap:12px;margin-top:24px">' +
      backHtml +
      '<span id="prof-saved-' + window.escHtml(panelId) + '" class="profile-saved-indicator" style="color:var(--text-secondary);font-size:13px;opacity:0;transition:opacity 0.3s">Saved ✓</span>' +
      '<span style="flex:1"></span>' +
      nextHtml +
    '</div>';
  },

  // Set on the first genuine user interaction inside the BP tab.
  // Suppresses the spurious Saved ✓ flash that fires when init's
  // prefill cascades debounce-trigger an autosave.
  _userInteracted: false,

  _showSaved: function(panelId) {
    if (!this._userInteracted) return;
    var el = document.getElementById('prof-saved-' + panelId);
    if (!el) return;
    el.style.opacity = '1';
    if (el._fadeTimer) clearTimeout(el._fadeTimer);
    el._fadeTimer = setTimeout(function() { el.style.opacity = '0'; }, 2000);
  },

  _goToPanel: function(panelKey, shouldValidate) {
    if (!panelKey) return;
    // Forward navigation (Next) validates the leaving panel. When
    // validation fails the modal opens and navigation is blocked —
    // the user has to fix the missing fields before Next will work.
    // The modal's own dismiss handlers (attached in _validatePanel)
    // close it on OK / backdrop without progressing anywhere.
    // Back never validates.
    if (shouldValidate && !this._validatePanel(this._activePanel)) return;
    this._performPanelChange(panelKey);
  },

  _performPanelChange: function(panelKey) {
    this._triggerAutoSave(this._activePanel);
    var wrap = document.getElementById('cl-tab-profile');
    if (!wrap) return;
    wrap.querySelectorAll('.profile-nav-chip').forEach(function(b) {
      b.classList.toggle('active', b.dataset.ptab === panelKey);
    });
    wrap.querySelectorAll('.profile-panel').forEach(function(p) { p.classList.remove('active'); });
    var target = document.getElementById('prof-panel-' + panelKey);
    if (target) target.classList.add('active');
    this._activePanel = panelKey;
    // Scroll back to the top of the panel so the Back/Next row isn't
    // already in view when the user lands on a new panel.
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // ── Form primitives ──────────────────────────────────────────────
  _field: function(label, html) { return '<div class="profile-field-full"><label class="profile-label">' + label + '</label>' + html + '</div>'; },
  _field2: function(label, html) { return '<div class="profile-field"><label class="profile-label">' + label + '</label>' + html + '</div>'; },
  _input: function(id, type, val, ph, extra) { return '<input id="' + id + '" type="' + type + '" class="profile-input" value="' + window.escHtml(String(val)) + '" placeholder="' + ph + '"' + (extra ? ' ' + extra : '') + ' />'; },
  _textarea: function(id, val, ph, rows) { return '<textarea id="' + id + '" class="profile-textarea" rows="' + (rows || 4) + '" placeholder="' + ph + '">' + window.escHtml(String(val)) + '</textarea>'; },
  _dropdown: function(id, opts, sel) {
    var currentLabel = sel || 'Select...';
    var currentValue = sel || '';
    return '<span class="lookback-dropdown-wrap">' +
      '<button type="button" id="' + id + '" class="lookback-dropdown lookback-dropdown-field" data-value="' + window.escHtml(currentValue) + '">' + window.escHtml(currentLabel) + '</button>' +
      '<div class="lookback-dropdown-menu">' +
      opts.map(function(v) {
        return '<button type="button" class="lookback-dropdown-item' + (v === sel ? ' active' : '') + '" data-value="' + window.escHtml(v) + '">' + window.escHtml(v) + '</button>';
      }).join('') +
      '</div></span>';
  },

  _chipGroup: function(id, options, selected) {
    if (!Array.isArray(selected)) selected = [];
    return '<div id="' + id + '" class="review-pill-row">' +
      options.map(function(opt) {
        var isSelected = selected.indexOf(opt) > -1;
        return '<button type="button" class="filter-pill' + (isSelected ? ' active' : '') + '" data-value="' + window.escHtml(opt) + '">' + window.escHtml(opt) + '</button>';
      }).join('') +
    '</div>';
  },

  _chipGroupWithOther: function(id, options, selected, customItems) {
    if (!Array.isArray(selected)) selected = [];
    if (!Array.isArray(customItems)) customItems = [];
    var grouped = this._isGroupedOptions(options);

    var customChipsHtml = customItems.map(function(item) {
      return '<button type="button" class="filter-pill active prof-custom-pill" data-value="' + window.escHtml(item) + '" data-custom="1">' + window.escHtml(item) + ' <span class="prof-pill-remove" data-action="remove-other" data-group="' + id + '">×</span></button>';
    }).join('');

    var otherInputBlock =
      '<div style="display:flex;gap:8px;align-items:center;margin-top:8px">' +
        '<input type="text" class="profile-input" id="' + id + '-other-input" placeholder="Add custom entry" style="flex:1" />' +
        '<button type="button" class="btn-outline btn-sm" data-action="add-other-item" data-target="' + id + '">Add</button>' +
      '</div>';

    if (grouped) {
      return '<div id="' + id + '">' +
        this._renderAccordionGroups(options, 'value', selected, id) +
        '<div class="review-pill-row" data-custom-pill-row="1" style="margin-top:8px">' + customChipsHtml + '</div>' +
      '</div>' + otherInputBlock;
    }

    var standardChips = options.map(function(opt) {
      var isSelected = selected.indexOf(opt) > -1;
      return '<button type="button" class="filter-pill' + (isSelected ? ' active' : '') + '" data-value="' + window.escHtml(opt) + '">' + window.escHtml(opt) + '</button>';
    }).join('');
    return '<div id="' + id + '" class="review-pill-row">' +
      standardChips + customChipsHtml +
    '</div>' + otherInputBlock;
  },

  _isGroupedOptions: function(options) {
    return Array.isArray(options) && options.length > 0
      && typeof options[0] === 'object'
      && options[0] !== null
      && Array.isArray(options[0].items);
  },

  // Grouped chip picker rendered as collapsible sections per Industry
  // Taxonomy Spec v2.0 §7.2 — true two-state accordion. A section is
  // either fully expanded (header + all pills) or fully collapsed
  // (header only, with the "X selected" counter on the right). No
  // hybrid third state where selected pills stay visible alongside the
  // header when collapsed.
  //
  // Visibility is controlled at the body level: the body's inline
  // display:none hides every pill inside it when collapsed; the body's
  // display:block shows every pill when expanded. Pills no longer
  // carry per-element display:none — that was the source of the
  // hybrid state on initial render. The section also carries the
  // .expanded class whenever its body is visible, so the markup at
  // initial render matches what _setAccordionSectionState produces on
  // toggle (matching .expand-tile styling and any future CSS rules
  // that hang off .expanded).
  //
  // Auto-expand on init: groups containing at least one already-saved
  // selection start expanded (spec §6.2.2). Groups without start
  // collapsed.
  _renderAccordionGroups: function(groups, dataAttr, selected, idPrefix) {
    var self = this;
    if (!Array.isArray(selected)) selected = [];
    var selSet = {};
    selected.forEach(function(s) { selSet[s] = true; });
    var html = '<div data-chip-accordion="' + idPrefix + '">';
    groups.forEach(function(group, groupIdx) {
      var bodyId = idPrefix + '-acc-body-' + groupIdx;
      var anyActive = group.items.some(function(item) { return selSet[item]; });
      var pillsHtml = group.items.map(function(item) {
        var active = selSet[item];
        return '<button type="button" class="filter-pill' + (active ? ' active' : '') + '" data-' + dataAttr + '="' + window.escHtml(item) + '">' + window.escHtml(item) + '</button>';
      }).join('');
      var countLabel = self._countLabel(group.items.filter(function(i) { return selSet[i]; }).length);
      html +=
        '<div class="expand-tile' + (anyActive ? ' expanded' : '') + '" data-chip-acc-section="' + window.escHtml(group.name) + '">' +
          '<div class="expand-tile-header">' +
            '<span class="expand-tile-title">' + window.escHtml(group.name) + '</span>' +
            '<span class="expand-tile-count" data-chip-acc-count>' + countLabel + '</span>' +
          '</div>' +
          '<div id="' + bodyId + '" data-chip-acc-body style="display:' + (anyActive ? 'block' : 'none') + '">' +
            '<div class="review-pill-row" style="margin:0">' + pillsHtml + '</div>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  },

  _countLabel: function(n) { return n > 0 ? n + ' selected' : ''; },

  _setAccordionSectionState: function(section, expanded) {
    if (expanded) section.classList.add('expanded');
    else section.classList.remove('expanded');
    var body = section.querySelector('[data-chip-acc-body]');
    var pills = body ? body.querySelectorAll('.filter-pill') : [];
    if (expanded) {
      if (body) body.style.display = 'block';
      pills.forEach(function(p) { p.style.display = ''; });
    } else {
      // Industry Taxonomy v2.0 §7.2 — collapsed = header only.
      // No pills render, including selected ones. The "X selected" count
      // in the header is the only visible indicator of selections when
      // the tile is collapsed. Re-expanding restores all pills with
      // selections marked .active.
      if (body) body.style.display = 'none';
      pills.forEach(function(p) { p.style.display = 'none'; });
    }
  },

  _updateAccordionCount: function(section) {
    var count = section.querySelector('[data-chip-acc-count]');
    var body = section.querySelector('[data-chip-acc-body]');
    if (!count || !body) return;
    var n = body.querySelectorAll('.filter-pill.active').length;
    count.textContent = this._countLabel(n);
  },

  _bindChipAccordion: function(container) {
    if (!container || container.dataset.chipAccBound) return;
    container.dataset.chipAccBound = '1';
    var self = this;
    container.addEventListener('click', function(e) {
      var header = e.target.closest('.expand-tile-header');
      if (header) {
        var section = header.closest('.expand-tile');
        if (section && section.closest('[data-chip-accordion]')) {
          var expanded = section.classList.contains('expanded');
          self._setAccordionSectionState(section, !expanded);
        }
        return;
      }
      var pill = e.target.closest('.filter-pill');
      if (pill) {
        // _bindChipToggles / _bindMultiSelectPills toggles .active before
        // this listener runs (innermost-first bubble); defer via rAF so
        // we read the post-toggle state.
        requestAnimationFrame(function() {
          var section = pill.closest('[data-chip-acc-section]');
          if (!section) return;
          self._updateAccordionCount(section);
          if (!section.classList.contains('expanded')) {
            self._setAccordionSectionState(section, false);
          }
        });
      }
    });
  },

  _removeRow: function(id) {
    var el = document.getElementById(id);
    // Theme-statement rows have no input blur to fall back on after
    // removal, so schedule the marketing autosave explicitly. Other
    // panels (phones, locations) already cover removal via blur on
    // their remaining inputs and panel-switch autosave.
    var wasMarketingStmt = el && typeof el.id === 'string' && el.id.indexOf('prof-mkt-stmt-') === 0;
    if (el) el.parentNode.removeChild(el);
    if (wasMarketingStmt) this._scheduleAutoSave('marketing', 100);
  },

  _bindChipToggles: function(container) {
    var self = this;
    container.querySelectorAll('.review-pill-row').forEach(function(group) {
      if (group.dataset.chipBound) return;
      group.dataset.chipBound = '1';
      group.addEventListener('click', function(e) {
        if (e.target.closest('.prof-pill-remove')) return;
        var chip = e.target.closest('.filter-pill');
        if (chip && !chip.dataset.custom) {
          chip.classList.toggle('active');
          // Update the per-tile accordion count synchronously here —
          // the rAF version in _bindChipAccordion is kept as a backup
          // for the services/products path, but for industries the
          // inline call here removes any timing race that could leave
          // the count stale on the most-recent click. No-op when the
          // pill isn't inside an accordion section.
          var section = chip.closest('[data-chip-acc-section]');
          if (section) self._updateAccordionCount(section);
        }
      });
    });
  },

  _getSelectedChips: function(groupId) {
    var group = document.getElementById(groupId);
    if (!group) return [];
    return Array.from(group.querySelectorAll('.filter-pill.active:not([data-custom])')).map(function(c) {
      return c.getAttribute('data-value');
    });
  },

  // ── Validation ───────────────────────────────────────────────────
  // Validate a panel's mandatory fields. Each field spec is
  //   { test: function() bool, el: element|null, label: string }
  // Adds .input-error to each missing element (red border on inputs/
  // textareas/dropdowns, red outline on chip rows via the BP CSS),
  // scrolls to the first missing element, and throws an Error with
  // the full list of missing labels — handleSave catches the throw
  // and surfaces it in the .save-msg modal so the user sees what
  // still needs filling. Previous error markers in the panel scope
  // are cleared on every call so fields fix themselves as the user
  // resaves.
  _validateMandatory: function(panelId, fields) {
    var panel = document.getElementById(panelId);
    if (panel) {
      panel.querySelectorAll('.input-error').forEach(function(e) { e.classList.remove('input-error'); });
    }
    var firstMissing = null;
    var missingLabels = [];
    fields.forEach(function(f) {
      if (!f.test()) {
        if (f.el) f.el.classList.add('input-error');
        if (!firstMissing && f.el) firstMissing = f.el;
        missingLabels.push(f.label);
      }
    });
    if (missingLabels.length > 0) {
      if (firstMissing && typeof firstMissing.scrollIntoView === 'function') {
        firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      throw new Error('Please complete: ' + missingLabels.join(', '));
    }
  },

  // Warn-mode panel validation. Runs on Next clicks; surfaces missing
  // fields in the prof-save-msg modal and red-outlines the offending
  // controls but never blocks navigation — the user can keep moving
  // through the wizard. Marketing has no panel-level rules.
  _validatePanel: function(panel) {
    try {
      if (panel === 'identity') this._validateIdentityPanel();
      else if (panel === 'location') this._validateLocationPanel();
      else if (panel === 'services') this._validateMultiSelectPanel('svc');
      else if (panel === 'products') this._validateMultiSelectPanel('prod');
      else if (panel === 'credentials') this._validateCredentialsPanel();
      return true;
    } catch (err) {
      var msgEl = document.getElementById('prof-save-msg');
      if (msgEl) {
        var textEl = msgEl.querySelector('.save-msg-text');
        if (textEl) textEl.textContent = err.message || 'Please complete the required fields.';
        msgEl.classList.add('open');
        var okBtn = msgEl.querySelector('.save-msg-ok');
        if (okBtn) okBtn.addEventListener('click', function() { msgEl.classList.remove('open'); }, { once: true });
        msgEl.addEventListener('click', function(e) { if (e.target === msgEl) msgEl.classList.remove('open'); }, { once: true });
      }
      return false;
    }
  },

  _validateIdentityPanel: function() {
    var self = this;
    var bizNameEl = document.getElementById('prof-biz-name');
    var abnEl = document.getElementById('prof-abn');
    var structureEl = document.getElementById('prof-structure');
    var industriesEl = document.getElementById('prof-industries');
    var yearsEl = document.getElementById('prof-years');
    var logoEl = document.getElementById('prof-logo-img');
    if (!bizNameEl) return; // panel not rendered
    this._validateMandatory('prof-panel-identity', [
      { test: function() { return bizNameEl.value.trim() !== ''; }, el: bizNameEl, label: 'Business Name' },
      { test: function() { return abnEl.value.trim() !== ''; }, el: abnEl, label: 'ABN' },
      { test: function() { return (structureEl.getAttribute('data-value') || '').trim() !== ''; }, el: structureEl, label: 'Business Structure' },
      { test: function() { return self._getSelectedChips('prof-industries').length > 0; }, el: industriesEl, label: 'Industry (at least one)' },
      { test: function() { return !!self._profile.logo_url; }, el: logoEl, label: 'Business Logo' },
      { test: function() { return yearsEl.value.trim() !== '' && !isNaN(parseInt(yearsEl.value, 10)); }, el: yearsEl, label: 'Years in Business' }
    ]);
  },

  _validateLocationPanel: function() {
    var pb = document.getElementById('loc-primary-block');
    if (!pb) return;
    var nameEl = pb.querySelector('.loc-name');
    var streetEl = pb.querySelector('.loc-street');
    var suburbEl = pb.querySelector('.loc-suburb');
    var stateEl = pb.querySelector('.loc-state');
    var postcodeEl = pb.querySelector('.loc-postcode');
    var serviceAreaEl = document.getElementById('prof-service-area');
    var phonesEl = document.getElementById('loc-p-phones');
    var hoursEl = document.getElementById('prof-hours-grid');
    var primaryPhones = Array.from(pb.querySelectorAll('#loc-p-phones .profile-repeating-row')).map(function(row) {
      return { type: row.querySelector('.loc-phone-type').getAttribute('data-value') || 'Mobile', number: row.querySelector('.loc-phone-number').value.trim() };
    }).filter(function(ph) { return ph.number; });
    var serviceArea = this._getSelectedChips('prof-service-area').concat(this._getOtherItems('prof-service-area'));
    var tradingHours = this._collectTradingHours();
    this._validateMandatory('prof-panel-location', [
      { test: function() { return nameEl.value.trim() !== ''; }, el: nameEl, label: 'Location Name' },
      { test: function() { return streetEl.value.trim() !== ''; }, el: streetEl, label: 'Street Address' },
      { test: function() { return suburbEl.value.trim() !== ''; }, el: suburbEl, label: 'Suburb' },
      { test: function() { return (stateEl.getAttribute('data-value') || '').trim() !== ''; }, el: stateEl, label: 'State' },
      { test: function() { return postcodeEl.value.trim() !== ''; }, el: postcodeEl, label: 'Postcode' },
      { test: function() { return primaryPhones.length > 0; }, el: phonesEl, label: 'Phone Number (at least one)' },
      { test: function() { return serviceArea.length > 0; }, el: serviceAreaEl, label: 'Service Area (at least one)' },
      { test: function() { return Array.isArray(tradingHours) && tradingHours.some(function(h) { return h.enabled; }); }, el: hoursEl, label: 'Trading Hours (at least one day)' }
    ]);
  },

  _validateMultiSelectPanel: function(prefix) {
    var groupEl = document.getElementById('prof-' + prefix + '-pills');
    if (!groupEl) return;
    var data = this._collectMultiSelectData(prefix);
    var panelId = prefix === 'svc' ? 'prof-panel-services' : 'prof-panel-products';
    var label = prefix === 'svc' ? 'Services (at least one)' : 'Products (at least one)';
    this._validateMandatory(panelId, [
      { test: function() { return Array.isArray(data) && data.length > 0; }, el: groupEl, label: label }
    ]);
  },

  _validateCredentialsPanel: function() {
    var self = this;
    var paymentsEl = document.getElementById('prof-payments');
    var responseEl = document.getElementById('prof-response-time');
    var warrantyEl = document.getElementById('prof-warranty');
    var complaintsEl = document.getElementById('prof-complaints');
    var afterHoursEl = document.getElementById('prof-after-hours');
    if (!paymentsEl) return;
    var payments = self._getSelectedChips('prof-payments');
    var afterHoursType = (afterHoursEl.getAttribute('data-value') || '').trim();
    this._validateMandatory('prof-panel-credentials', [
      { test: function() { return payments.length > 0; }, el: paymentsEl, label: 'Payment Methods (at least one)' },
      { test: function() { return (responseEl.getAttribute('data-value') || '').trim() !== ''; }, el: responseEl, label: 'Response Time' },
      { test: function() { return warrantyEl.value.trim() !== ''; }, el: warrantyEl, label: 'Warranty / Guarantee' },
      { test: function() { return complaintsEl.value.trim() !== ''; }, el: complaintsEl, label: 'Complaints Handling' },
      { test: function() { return afterHoursType !== ''; }, el: afterHoursEl, label: 'After-Hours Support' }
    ]);
  },

  _getOtherItems: function(groupId) {
    var group = document.getElementById(groupId);
    if (!group) return [];
    return Array.from(group.querySelectorAll('.filter-pill[data-custom]')).map(function(c) {
      return c.getAttribute('data-value');
    });
  },

  _addOtherItem: function(groupId) {
    var input = document.getElementById(groupId + '-other-input');
    if (!input) return;
    var val = input.value.trim();
    if (!val) return;
    var group = document.getElementById(groupId);
    if (!group) return;
    var existing = this._getOtherItems(groupId);
    if (existing.indexOf(val) > -1) { input.value = ''; return; }
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-pill active prof-custom-pill';
    chip.setAttribute('data-value', val);
    chip.setAttribute('data-custom', '1');
    chip.innerHTML = window.escHtml(val) + ' <span class="prof-pill-remove" data-action="remove-other" data-group="' + groupId + '">×</span>';
    // Grouped layouts (services/products/licences) keep custom pills in
    // a dedicated row below the accordion. Flat layouts just append.
    var customRow = group.querySelector('[data-custom-pill-row="1"]');
    (customRow || group).appendChild(chip);
    input.value = '';
  },

  _removeOtherChip: function(btn) { var c = btn.closest('.filter-pill'); if (c) c.remove(); },

  // ── Auto-save ────────────────────────────────────────────────────
  _triggerAutoSave: function(panel) {
    // Auto-save is silent — it persists whatever the user has typed
    // so far without running mandatory-field validation. Only the
    // explicit Save button click should trigger validation. We call
    // each save function directly with { autoSave: true } rather
    // than invoking btn.click() so the autoSave flag actually
    // reaches the validation step (a synchronous click() would
    // race with the async handleSave callback).
    if (panel === 'marketing') {
      // Marketing has no btn-save anchor — runs straight to the
      // theme-statements writer.
      this._saveThemeStatements();
      return;
    }
    var btnIds = { identity: 'prof-id-save', location: 'prof-loc-save', services: 'prof-svc-save', products: 'prof-prod-save', credentials: 'prof-cred-save' };
    var btn = document.getElementById(btnIds[panel]);
    if (!btn || btn.disabled) return;
    if (panel === 'identity') this._saveIdentity({ autoSave: true });
    else if (panel === 'location') this._saveLocation({ autoSave: true });
    else if (panel === 'services') this._saveMultiSelect('svc', 'bp_services', 'prof-svc-save', { autoSave: true });
    else if (panel === 'products') this._saveMultiSelect('prod', 'bp_products', 'prof-prod-save', { autoSave: true });
    else if (panel === 'credentials') this._saveCredentials({ autoSave: true });
  },
  _scheduleAutoSave: function(panel, delay) {
    var s = this; if (s._autoSaveTimer) clearTimeout(s._autoSaveTimer);
    s._autoSaveTimer = setTimeout(function() { s._triggerAutoSave(panel); }, delay || 500);
  },
  _bindAutoSave: function(panel, container) {
    var self = this;
    container.querySelectorAll('input[type="text"],input[type="number"],input[type="url"],textarea').forEach(function(input) {
      if (input.dataset.autoSaveBound) return;
      input.dataset.autoSaveBound = '1';
      input.addEventListener('blur', function() { self._scheduleAutoSave(panel, 300); });
    });
    container.querySelectorAll('select, input[type="checkbox"]').forEach(function(el) {
      if (el.dataset.autoSaveBound) return;
      el.dataset.autoSaveBound = '1';
      el.addEventListener('change', function() { self._scheduleAutoSave(panel, 300); });
    });
    container.querySelectorAll('.review-pill-row').forEach(function(group) {
      if (group.dataset.autoSaveChipBound) return;
      group.dataset.autoSaveChipBound = '1';
      group.addEventListener('click', function(e) {
        if (e.target.closest('.filter-pill')) {
          self._scheduleAutoSave(panel, 500);
        }
      });
    });
  },

  // ── Shared lookback-dropdown helpers ─────────────────────────────
  // Inline lookback-dropdown wiring — same shape as the helpers in
  // CL_PROJECTS / SM_LOGIC. Trigger toggles the menu; item-click sets
  // data-value + label and fires onSelect; outside-click close is
  // handled globally for #cl-tab-profile by the listener at the
  // bottom of _renderLocation. Idempotent via dataset guard.
  _wireLookback: function(triggerOrId, menuOrId, onSelect) {
    var btn = typeof triggerOrId === 'string' ? document.getElementById(triggerOrId) : triggerOrId;
    var menu = typeof menuOrId === 'string' ? document.getElementById(menuOrId) : menuOrId;
    if (!btn || !menu) return;
    if (btn.dataset.lookbackBound === '1') return;
    btn.dataset.lookbackBound = '1';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    menu.addEventListener('click', function(e) {
      var item = e.target.closest('.lookback-dropdown-item');
      if (!item) return;
      var value = item.getAttribute('data-value');
      // Sentinel values bypass the trigger update so callers can take
      // over the click in onSelect (e.g. the Hours-of-Operation
      // Custom… item swaps the cell to a free-text input mode and
      // needs the trigger's prior data-value preserved for prefill).
      if (value !== '__custom__') {
        menu.querySelectorAll('.lookback-dropdown-item').forEach(function(i) { i.classList.remove('active'); });
        item.classList.add('active');
        btn.setAttribute('data-value', value);
        btn.textContent = item.textContent;
      }
      menu.classList.remove('open');
      if (typeof onSelect === 'function') onSelect(value, item.textContent);
    });
  },

  // Programmatic value-set for a lookback-dropdown — mirrors what
  // setting <select>.value used to do before the conversion. Used by
  // the address-autocomplete path that fills the State picker from
  // the parsed Google Places result.
  _setLookbackValue: function(btn, menu, value) {
    if (!btn || !menu) return;
    var items = menu.querySelectorAll('.lookback-dropdown-item');
    var target = null;
    items.forEach(function(i) { if (i.getAttribute('data-value') === value) target = i; });
    if (!target) return;
    items.forEach(function(i) { i.classList.remove('active'); });
    target.classList.add('active');
    btn.setAttribute('data-value', target.getAttribute('data-value'));
    btn.textContent = target.textContent;
  },

  // ── Identity panel ───────────────────────────────────────────────
  _renderIdentity: function() {
    var p = this._profile;
    var structures = ['Sole Trader', 'Partnership', 'Company', 'Trust', 'Other'];

    // Industries source per Industry Taxonomy Spec v2.0 §3 — read from
    // lib/industry-taxonomy.js via window.INDUSTRY_TAXONOMY (loaded as a
    // type=module script on this page). Shape the flat taxonomy into the
    // grouped form _renderAccordionGroups expects:
    //   [{ name: 'Group Label', items: [displayLabel, ...] }, ...]
    var industryGroups = [];
    if (Array.isArray(window.INDUSTRY_GROUPS) && Array.isArray(window.INDUSTRY_TAXONOMY)) {
      industryGroups = window.INDUSTRY_GROUPS.map(function(grp) {
        var items = window.INDUSTRY_TAXONOMY
          .filter(function(e) { return e.group === grp.id; })
          .sort(function(a, b) { return a.groupOrder - b.groupOrder; })
          .map(function(e) { return e.displayLabel; });
        return { name: grp.label, items: items };
      });
    }

    var selectedIndustries = this._va('industry');
    if (typeof this._v('industry') === 'string' && this._v('industry')) {
      selectedIndustries = [this._v('industry')];
    }

    var logoHtml = '<div class="profile-logo-wrap">' +
      (p.logo_url ? '<img id="prof-logo-img" src="' + window.escHtml(p.logo_url) + '" class="profile-logo-preview" alt="Logo" />' : '<div id="prof-logo-img" class="profile-logo-placeholder">No logo</div>') +
      '<input id="prof-logo-file" type="file" accept="image/*" class="profile-file-input" />' +
      '<button class="btn-outline btn-sm" data-action="upload-logo">Upload Logo</button>' +
    '</div>';

    // Industries picker per spec §6 — 5 collapsible group tiles, accordion
    // pattern shared with the Services tab (Section 7 bug fix applies to
    // both via _setAccordionSectionState). Selection counter and helper
    // text per §6.1; cap of 3 enforced via _bindIndustryWarn.
    var selectedCount = Array.isArray(selectedIndustries) ? selectedIndustries.length : 0;
    var industryChips =
      '<div class="profile-helper-text" style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Select up to 3 industries that describe your business.</div>' +
      '<div id="prof-industries-counter" style="font-size:13px;color:var(--text-muted);margin-bottom:10px">' + selectedCount + ' of 3 selected</div>' +
      '<div id="prof-industries">' + this._renderAccordionGroups(industryGroups, 'value', selectedIndustries, 'prof-industries') + '</div>';

    var body = '<div class="profile-fields">' +
      this._field('Legal Business Name <span class="profile-required">*</span>', this._input('prof-biz-name', 'text', this._v('business_name'), 'Your registered business name')) +
      this._field('Trading Name / t/as <span class="profile-optional">(optional)</span>', this._input('prof-trading-name', 'text', this._v('trading_name'), 'Trading name if different from legal name')) +
      this._field2('ABN <span class="profile-required">*</span>', this._input('prof-abn', 'text', this._v('abn'), 'xx xxx xxx xxx', 'maxlength="14"')) +
      this._field2('Business Structure <span class="profile-required">*</span>', this._dropdown('prof-structure', structures, this._v('business_structure'))) +
      this._field('Industries <span class="profile-required">*</span>', industryChips) +
      this._field('Business Logo <span class="profile-required">*</span>', logoHtml) +
      this._field2('Years in Business <span class="profile-required">*</span>', this._input('prof-years', 'number', this._v('years_in_business'), 'e.g. 5', 'min="0" max="200"')) +
      this._field2('Team Size', this._dropdown('prof-team-size', ['1', '2-5', '6-10', '11-20', '21-50', '50+'], this._v('employee_range'))) +
    '</div>' +
    '<div class="perm-modal-overlay" id="prof-industry-modal">' +
      '<div class="perm-modal">' +
        '<div class="perm-modal-title" id="prof-industry-modal-title">Remove Industry</div>' +
        '<div class="perm-modal-body" id="prof-industry-modal-body"></div>' +
        '<div class="perm-modal-actions">' +
          '<button type="button" class="perm-modal-cancel" id="prof-industry-modal-cancel">Cancel</button>' +
          '<button type="button" class="perm-modal-continue" id="prof-industry-modal-confirm">Remove</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="perm-modal-overlay" id="prof-industries-max-modal">' +
      '<div class="perm-modal">' +
        '<div class="perm-modal-title">Industry limit reached</div>' +
        '<div class="perm-modal-body">You can select up to 3 industries. Remove one to select another.</div>' +
        '<div class="perm-modal-actions">' +
          '<button type="button" class="perm-modal-continue" id="prof-industries-max-ok">OK</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.getElementById('prof-panel-identity').innerHTML = this._card('🏢', '1. Identity', 'Your registered business details', body, 'identity', 'prof-id-save');

    var self = this;
    var idPanel = document.getElementById('prof-panel-identity');
    self._bindPhoneTypeDropdowns(idPanel);
    self._bindChipToggles(idPanel);
    self._bindChipAccordion(document.getElementById('prof-industries'));
    self._bindIndustryWarn();

    var logoImg = document.getElementById('prof-logo-img');
    if (logoImg && logoImg.tagName === 'IMG') {
      logoImg.addEventListener('error', function() {
        var ph = document.createElement('div');
        ph.id = 'prof-logo-img';
        ph.className = 'profile-logo-placeholder';
        ph.textContent = 'No logo';
        logoImg.parentNode.replaceChild(ph, logoImg);
      });
    }

    document.getElementById('prof-id-save').addEventListener('click', function() { self._saveIdentity(); });
    document.getElementById('prof-logo-file').addEventListener('change', function(e) { self._uploadLogo(e.target.files[0]); });
    self._bindAutoSave('identity', idPanel);
    document.getElementById('prof-abn').addEventListener('input', function(e) {
      var d = e.target.value.replace(/\D/g, '').substring(0, 11);
      var f = '';
      if (d.length > 0) f = d.substring(0, 2);
      if (d.length > 2) f += ' ' + d.substring(2, 5);
      if (d.length > 5) f += ' ' + d.substring(5, 8);
      if (d.length > 8) f += ' ' + d.substring(8, 11);
      e.target.value = f;
    });
  },

  // Change-confirmation modal body builder per Industry Taxonomy Spec v2.0
  // §8.2. Under the no-gating decision (§1.4) the vestigial "industry-
  // specific tools owned for this industry" section is removed — there is
  // no concept of tool ownership scoped to an industry anymore. The
  // _BP_TO_TOOL_INDUSTRY map that fed that section is gone with it.
  _buildIndustryRemovalBody: function(industry) {
    var esc = window.escHtml;
    // Tool icons from the Canonical Tool ID Register in Tool
    // Specification Guide v2.5. Used as the list bullet marker
    // (visual replacement for the default dot) so the modal reads with
    // platform-standard tool iconography.
    var contextTools = [
      { icon: '💬', label: 'Website Chatbot',      use: 'system prompt' },
      { icon: '🎨', label: 'Design Visualiser',    use: 'render types' },
      { icon: '📰', label: 'Industry News Digest', use: 'news sources' },
      { icon: '📝', label: 'Strategic Plan',       use: 'industry analysis' }
    ];
    var contextItems = contextTools.map(function(t) {
      return '<li style="margin-bottom:4px">' + t.icon + ' ' + esc(t.label) + ' &mdash; ' + esc(t.use) + '</li>';
    }).join('');

    return '<p>Some tools use industry context to tailor their outputs:</p>' +
      '<ul style="list-style:none;padding-left:24px;margin:8px 0">' + contextItems + '</ul>' +
      '<p style="margin-top:12px">Existing outputs from these tools won\'t be deleted, but they may reference <strong>' + esc(industry) + '</strong>. Future outputs will use your remaining industries.</p>';
  },

  _bindIndustryWarn: function() {
    var group = document.getElementById('prof-industries');
    if (!group) return;
    var self = this;
    var MAX_INDUSTRIES = 3;

    // Capture-phase: block selection of a fourth industry before
    // _bindChipToggles toggles the active state. Cap raised from 2 to 3
    // per Industry Taxonomy Spec v2.0 §5.1. Phase 9 — surfaces the
    // block via the platform .perm-modal-overlay pattern instead of an
    // inline red banner so the warning matches every other modal in BP.
    group.addEventListener('click', function(e) {
      if (e.target.closest('.prof-pill-remove')) return;
      var chip = e.target.closest('.filter-pill');
      if (!chip || chip.dataset.custom) return;
      if (chip.classList.contains('active')) return;
      var activeCount = group.querySelectorAll('.filter-pill.active').length;
      if (activeCount >= MAX_INDUSTRIES) {
        e.stopImmediatePropagation();
        e.preventDefault();
        var maxModal = document.getElementById('prof-industries-max-modal');
        if (!maxModal) return;
        maxModal.classList.add('open');
        var okBtn = document.getElementById('prof-industries-max-ok');
        var close = function() { maxModal.classList.remove('open'); };
        if (okBtn) okBtn.addEventListener('click', close, { once: true });
        maxModal.addEventListener('click', function(ev) { if (ev.target === maxModal) close(); }, { once: true });
      }
    }, true);

    // Live selection counter: updates after every chip toggle. rAF defers
    // the read until after _bindChipToggles has flipped the .active state.
    function updateCounter() {
      var counter = document.getElementById('prof-industries-counter');
      if (!counter) return;
      var n = group.querySelectorAll('.filter-pill.active').length;
      counter.textContent = n + ' of ' + MAX_INDUSTRIES + ' selected';
    }
    group.addEventListener('click', function() { requestAnimationFrame(updateCounter); });

    group.addEventListener('click', function(e) {
      if (e.target.closest('.prof-pill-remove')) return;
      var chip = e.target.closest('.filter-pill');
      if (!chip) return;
      var val = chip.getAttribute('data-value');
      // Read against the current saved state (self._profile.industry,
      // which auto-save keeps fresh on every successful write) rather
      // than a closure captured at render time. Phase 9 Issue 3: the
      // closure was stale whenever the user picked an industry in the
      // same session — wasSelected returned false on the first deselect
      // attempt and the modal silently skipped.
      var savedIndustries = Array.isArray(self._profile.industry) ? self._profile.industry : [];
      var wasSelected = savedIndustries.indexOf(val) > -1;
      var isNowDeselected = !chip.classList.contains('active');
      if (wasSelected && isNowDeselected) {
        // Suppress the 500ms auto-save chip-click handler racing the
        // modal decision. Cancel = no save fires (pill snaps back to
        // active, DB unchanged). Confirm = re-arm auto-save so the
        // deselect actually persists. Phase 9 Issue 3.
        if (self._autoSaveTimer) { clearTimeout(self._autoSaveTimer); self._autoSaveTimer = null; }
        var modal = document.getElementById('prof-industry-modal');
        var title = document.getElementById('prof-industry-modal-title');
        var body = document.getElementById('prof-industry-modal-body');
        if (title) title.textContent = 'Remove ' + val + '?';
        body.innerHTML = self._buildIndustryRemovalBody(val);
        modal.classList.add('open');
        var confirmBtn = document.getElementById('prof-industry-modal-confirm');
        var cancelBtn = document.getElementById('prof-industry-modal-cancel');
        var cleanup = function() {
          modal.classList.remove('open');
          confirmBtn.removeEventListener('click', onConfirm);
          cancelBtn.removeEventListener('click', onCancel);
        };
        // Per-tile count for the section containing this chip. Updated
        // on both Confirm (pill now deselected) and Cancel (pill snaps
        // back to active) so the header counter stays in sync with the
        // visible pill state.
        var section = chip.closest('[data-chip-acc-section]');
        var refreshSectionCount = function() { if (section) self._updateAccordionCount(section); };
        var onConfirm = function() {
          cleanup();
          updateCounter();
          refreshSectionCount();
          self._scheduleAutoSave('identity', 100);
        };
        var onCancel = function() {
          chip.classList.add('active');
          cleanup();
          updateCounter();
          refreshSectionCount();
        };
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
      }
    });
  },

  _uploadLogo: async function(file) {
    if (!file) return;
    var ext = file.name.split('.').pop().toLowerCase();
    var path = 'logos/' + this._userId + '.' + ext;
    var up = await this._supabase.storage.from('cl-assets').upload(path, file, { upsert: true });
    if (up.error) { window.showModalError('Upload failed: ' + up.error.message); return; }
    var signedRes = await this._supabase.storage.from('cl-assets').createSignedUrl(path, 31536000);
    var url;
    if (signedRes.data && signedRes.data.signedUrl) {
      url = signedRes.data.signedUrl;
    } else {
      url = this._supabase.storage.from('cl-assets').getPublicUrl(path).data.publicUrl;
    }
    var logoRes = await this._supabase.from('profiles').update({ logo_url: url }).eq('id', this._userId);
    if (logoRes.error) { console.error('[CL Profile] _uploadLogo update error:', logoRes.error.message); return; }
    this._profile.logo_url = url;
    this._setLogoImg(url);
  },

  _setLogoImg: function(url) {
    var img = document.getElementById('prof-logo-img');
    if (!img) return;
    if (img.tagName === 'IMG') {
      img.src = url;
    } else {
      var newImg = document.createElement('img');
      newImg.id = 'prof-logo-img';
      newImg.src = url;
      newImg.className = 'profile-logo-preview';
      newImg.alt = 'Logo';
      newImg.addEventListener('error', function() {
        newImg.style.display = 'none';
        var ph = document.createElement('div');
        ph.id = 'prof-logo-img';
        ph.className = 'profile-logo-placeholder';
        ph.textContent = 'Logo';
        newImg.parentNode.replaceChild(ph, newImg);
      });
      img.parentNode.replaceChild(newImg, img);
    }
  },

  _saveIdentity: function(opts) {
    var self = this;
    var autoSave = !!(opts && opts.autoSave);
    var btn = document.getElementById('prof-id-save');
    window.handleSave(btn, async function() {
      var bizNameEl = document.getElementById('prof-biz-name');
      var abnEl = document.getElementById('prof-abn');
      var structureEl = document.getElementById('prof-structure');
      var industriesEl = document.getElementById('prof-industries');
      var yearsEl = document.getElementById('prof-years');
      var logoEl = document.getElementById('prof-logo-img');
      // Validation only runs on an explicit Save click. Auto-save
      // (panel switch / blur / chip click) silently persists partial
      // data so the user doesn't lose work moving between fields.
      if (!autoSave) {
        self._validateMandatory('prof-panel-identity', [
          { test: function() { return bizNameEl.value.trim() !== ''; }, el: bizNameEl, label: 'Business Name' },
          { test: function() { return abnEl.value.trim() !== ''; }, el: abnEl, label: 'ABN' },
          { test: function() { return (structureEl.getAttribute('data-value') || '').trim() !== ''; }, el: structureEl, label: 'Business Structure' },
          { test: function() { return self._getSelectedChips('prof-industries').length > 0; }, el: industriesEl, label: 'Industry (at least one)' },
          { test: function() { return !!self._profile.logo_url; }, el: logoEl, label: 'Business Logo' },
          { test: function() { return yearsEl.value.trim() !== '' && !isNaN(parseInt(yearsEl.value, 10)); }, el: yearsEl, label: 'Years in Business' }
        ]);
      }
      var teamSizeEl = document.getElementById('prof-team-size');
      var previousIndustry = Array.isArray(self._profile.industry) ? self._profile.industry.slice() : [];
      var updates = {
        business_name: bizNameEl.value.trim(),
        trading_name: document.getElementById('prof-trading-name').value.trim(),
        abn: abnEl.value.trim(),
        business_structure: structureEl.getAttribute('data-value') || '',
        industry: self._getSelectedChips('prof-industries'),
        years_in_business: parseInt(yearsEl.value) || null,
        employee_range: (teamSizeEl && teamSizeEl.getAttribute('data-value')) || ''
      };
      // SRL Cohort Architecture Addendum v1.2 — Identity panel writes
      // `industry`, which is a cohort-determining field. Route through
      // api/profile-save so cohort_id is recomputed and any new-cohort
      // SRL refresh is enqueued server-side. Browser no longer writes
      // profiles directly for this panel.
      var sessionRes = await self._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) throw new Error('No active session');
      var apiRes = await fetch('/api/profile-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify(updates)
      });
      var apiData = await apiRes.json().catch(function() { return {}; });
      if (!apiRes.ok || !apiData.success) throw new Error(apiData.error || ('Profile save failed: ' + apiRes.status));
      Object.assign(self._profile, updates);
      // Re-render Services / Products / Credentials when the saved
      // industry set changes — those panels read from the merge helpers
      // keyed on the user's current industries, and were previously
      // frozen on whatever was in profile.industry at initial _load()
      // (Phase 9 Issue 1).
      var newIndustry = Array.isArray(updates.industry) ? updates.industry : [];
      var sortKey = function(arr) { return arr.slice().sort().join('||'); };
      if (sortKey(previousIndustry) !== sortKey(newIndustry)) {
        self._renderServices();
        self._renderProducts();
        self._renderCredentials();
      }
      if (autoSave) self._showSaved('identity');
    }, document.getElementById('prof-save-msg'));
  },

  // ── Credentials panel — _renderCredentials / _saveCredentials live in
  //    cl-profile-products.js (kept alongside the other smaller panels
  //    so cl-profile.js stays under the 60K platform ceiling).

  // ── Marketing panel wrapper ──────────────────────────────────────
  // Hosts the BP_MARKETING wizard and the Additional Theme Statements
  // helper. The wizard itself lives in cl-profile-marketing.js.
  _renderMarketing: function() {
    var body =
      '<div id="prof-mkt-guided"></div>' +
      '<div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border)">' +
        '<div class="profile-label profile-label-heading" style="margin-bottom:8px">Additional Theme Statements <span class="profile-optional">(optional)</span></div>' +
        '<div style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Add separate theme statements to run alongside the marketing theme generated above.</div>' +
        '<div id="prof-mkt-statements"></div>' +
        '<button class="btn-add-connection" data-action="add-theme-statement" type="button">+ Add Statement</button>' +
      '</div>';
    document.getElementById('prof-panel-marketing').innerHTML = this._card(
      '🎨', '6. Marketing Theme', 'Answer a few questions and the AI will build your marketing theme', body, 'marketing', 'prof-mkt-save'
    );
    if (window.BP_MARKETING) {
      window.BP_MARKETING.init(this._supabase, this._userId, this._profile, this);
    }
    var statements = this._getAdditionalStatements();
    this._renderThemeStatementRows(statements);
    // Delegated autosave on theme statement inputs — covers both
    // existing rows and any added later via _addThemeStatement
    // without needing per-input rebinds.
    var self = this;
    var stmtsWrap = document.getElementById('prof-mkt-statements');
    if (stmtsWrap && !stmtsWrap.dataset.autoSaveBound) {
      stmtsWrap.dataset.autoSaveBound = '1';
      stmtsWrap.addEventListener('input', function() { self._scheduleAutoSave('marketing', 500); });
      stmtsWrap.addEventListener('blur', function() { self._scheduleAutoSave('marketing', 300); }, true);
    }
  },

  // Additional Theme Statements — stored inside marketing_theme_extra
  // alongside the wizard answers so a single column persists both.
  _getAdditionalStatements: function() {
    var mte = this._profile.marketing_theme_extra;
    var parsed = null;
    if (Array.isArray(mte) && mte.length === 1 && typeof mte[0] === 'string') {
      try { parsed = JSON.parse(mte[0]); } catch (e) { parsed = null; }
    } else if (mte && typeof mte === 'object' && !Array.isArray(mte)) {
      parsed = mte;
    }
    return parsed && Array.isArray(parsed.additional_statements) ? parsed.additional_statements : [];
  },

  _renderThemeStatementRows: function(statements) {
    var wrap = document.getElementById('prof-mkt-statements');
    if (!wrap) return;
    wrap.innerHTML = statements.map(function(s, i) {
      var id = 'prof-mkt-stmt-' + i;
      return '<div class="profile-repeating-row" id="' + id + '" style="margin-bottom:8px">' +
        '<input type="text" class="profile-input prof-mkt-stmt-input" value="' + window.escHtml(s || '') + '" placeholder="Add a theme statement" />' +
        '<button class="btn-remove-url" data-action="remove-row" data-target="' + id + '" type="button">Remove</button>' +
      '</div>';
    }).join('');
  },

  _addThemeStatement: function() {
    var wrap = document.getElementById('prof-mkt-statements');
    if (!wrap) return;
    var id = 'prof-mkt-stmt-' + Date.now();
    var row = document.createElement('div');
    row.className = 'profile-repeating-row';
    row.id = id;
    row.style.marginBottom = '8px';
    row.innerHTML =
      '<input type="text" class="profile-input prof-mkt-stmt-input" placeholder="Add a theme statement" />' +
      '<button class="btn-remove-url" data-action="remove-row" data-target="' + id + '" type="button">Remove</button>';
    wrap.appendChild(row);
    var inp = row.querySelector('input');
    if (inp) inp.focus();
  },

  _collectThemeStatements: function() {
    var inputs = document.querySelectorAll('#prof-mkt-statements .prof-mkt-stmt-input');
    var arr = [];
    inputs.forEach(function(inp) {
      var v = inp.value.trim();
      if (v) arr.push(v);
    });
    return arr;
  },

  _saveThemeStatements: function() {
    var self = this;
    (async function() {
      var statements = self._collectThemeStatements();
      // Re-read from DB so we merge into the freshest wizard JSON,
      // not whatever was cached when the panel last loaded.
      var freshRes = await self._supabase.from('profiles')
        .select('marketing_theme_extra').eq('id', self._userId).single();
      if (freshRes.error) throw new Error(freshRes.error.message);
      var existing = {};
      var mte = freshRes.data ? freshRes.data.marketing_theme_extra : null;
      if (Array.isArray(mte) && mte.length === 1 && typeof mte[0] === 'string') {
        try { existing = JSON.parse(mte[0]) || {}; } catch (e) { existing = {}; }
      } else if (mte && typeof mte === 'object' && !Array.isArray(mte)) {
        existing = mte;
      }
      existing.additional_statements = statements;
      var serialised = [JSON.stringify(existing)];
      var res = await self._supabase.from('profiles')
        .update({ marketing_theme_extra: serialised })
        .eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      self._profile.marketing_theme_extra = serialised;
    })().then(function() {
      self._showSaved('marketing');
    }).catch(function(err) {
      console.error('[CL Profile] marketing save error:', err.message || err);
    });
  }
});
