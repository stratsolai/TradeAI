window.CL_PROFILE = {
  _supabase: null, _userId: null, _profile: {},
  _autoSaveTimer: null, _activePanel: 'identity',
  init: function(supabase) {
    this._supabase = supabase;
    var container = document.getElementById('cl-tab-profile');
    if (!container) return;
    container.innerHTML = this._shell();
    this._bindTabs();
    this._bindDelegatedEvents(container);
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
  _card: function(icon, title, subtitle, body, btnId) {
    return '<div class="profile-section-card">' +
      '<div class="profile-section-header">' +
        '<div class="profile-section-icon">' + icon + '</div>' +
        '<div>' +
          '<div class="profile-section-title">' + title + '</div>' +
          '<div class="profile-section-subtitle">' + subtitle + '</div>' +
        '</div>' +
      '</div>' +
      body +
      '<div class="profile-save-row">' +
        '<button id="' + btnId + '" class="btn-save">Save</button>' +
      '</div>' +
    '</div>';
  },

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
      return '<button type="button" class="filter-pill active prof-custom-pill" data-value="' + window.escHtml(item) + '" data-custom="1">' + window.escHtml(item) + ' <span class="prof-pill-remove" data-action="remove-other" data-group="' + id + '">\u00D7</span></button>';
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

  // BP UX Improvements Spec v1.0 \u00A72.2 \u2014 render the standard chips for a
  // grouped chip picker as collapsible accordion sections, alphabetised
  // within each group. Selected chips remain visible when a section is
  // collapsed; non-selected chips are hidden via inline display:none so
  // we don't need to add new CSS classes.
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
        var hidden = active ? '' : 'display:none';
        return '<button type="button" class="filter-pill' + (active ? ' active' : '') + '" data-' + dataAttr + '="' + window.escHtml(item) + '"' + (hidden ? ' style="' + hidden + '"' : '') + '>' + window.escHtml(item) + '</button>';
      }).join('');
      var countLabel = self._countLabel(group.items.filter(function(i) { return selSet[i]; }).length);
      html +=
        '<div data-chip-acc-section="' + window.escHtml(group.name) + '" data-chip-acc-expanded="0" style="margin-bottom:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface)">' +
          '<button type="button" data-chip-acc-toggle="1" data-chip-acc-target="' + bodyId + '" aria-expanded="false" style="width:100%;padding:10px 14px;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;gap:10px;text-align:left;font-size:14px;font-weight:500;color:var(--text)">' +
            '<span style="flex:1">' + window.escHtml(group.name) + '</span>' +
            '<span data-chip-acc-count style="font-size:12px;color:var(--text-muted);min-width:75px;text-align:right">' + countLabel + '</span>' +
            '<span data-chip-acc-chevron style="display:inline-block;transition:transform 0.2s;color:var(--text-muted);font-size:14px">\u25BE</span>' +
          '</button>' +
          '<div id="' + bodyId + '" data-chip-acc-body style="display:' + (anyActive ? 'block' : 'none') + ';padding:0 14px 12px 14px">' +
            '<div class="review-pill-row" style="margin:0">' + pillsHtml + '</div>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  },

  _countLabel: function(n) { return n > 0 ? n + ' selected' : ''; },

  _setAccordionSectionState: function(section, expanded) {
    section.dataset.chipAccExpanded = expanded ? '1' : '0';
    var body = section.querySelector('[data-chip-acc-body]');
    var pills = body ? body.querySelectorAll('.filter-pill') : [];
    var toggle = section.querySelector('[data-chip-acc-toggle]');
    var chevron = section.querySelector('[data-chip-acc-chevron]');
    if (expanded) {
      if (body) body.style.display = 'block';
      pills.forEach(function(p) { p.style.display = ''; });
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
      var anyActive = false;
      pills.forEach(function(p) {
        var isActive = p.classList.contains('active');
        p.style.display = isActive ? '' : 'none';
        if (isActive) anyActive = true;
      });
      if (body) body.style.display = anyActive ? 'block' : 'none';
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      if (chevron) chevron.style.transform = 'rotate(0deg)';
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
      var toggle = e.target.closest('[data-chip-acc-toggle]');
      if (toggle) {
        var section = toggle.closest('[data-chip-acc-section]');
        if (section) {
          var expanded = section.dataset.chipAccExpanded === '1';
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
          if (section.dataset.chipAccExpanded !== '1') {
            self._setAccordionSectionState(section, false);
          }
        });
      }
    });
  },

  _removeRow: function(id) {
    var el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
  },

  _bindChipToggles: function(container) {
    container.querySelectorAll('.review-pill-row').forEach(function(group) {
      if (group.dataset.chipBound) return;
      group.dataset.chipBound = '1';
      group.addEventListener('click', function(e) {
        if (e.target.closest('.prof-pill-remove')) return;
        var chip = e.target.closest('.filter-pill');
        if (chip && !chip.dataset.custom) chip.classList.toggle('active');
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
    chip.innerHTML = window.escHtml(val) + ' <span class="prof-pill-remove" data-action="remove-other" data-group="' + groupId + '">\u00D7</span>';
    // Grouped layouts (services/products/licences) keep custom pills in
    // a dedicated row below the accordion. Flat layouts just append.
    var customRow = group.querySelector('[data-custom-pill-row="1"]');
    (customRow || group).appendChild(chip);
    input.value = '';
  },

  _removeOtherChip: function(btn) { var c = btn.closest('.filter-pill'); if (c) c.remove(); },
  _triggerAutoSave: function(panel) {
    // Auto-save is silent — it persists whatever the user has typed
    // so far without running mandatory-field validation. Only the
    // explicit Save button click should trigger validation. We call
    // each save function directly with { autoSave: true } rather
    // than invoking btn.click() so the autoSave flag actually
    // reaches the validation step (a synchronous click() would
    // race with the async handleSave callback).
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

  // Identity

  _renderIdentity: function() {
    var p = this._profile;
    var structures = ['Sole Trader', 'Partnership', 'Company', 'Trust', 'Other'];
    var industries = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.groups.map(function(g) { return g.name; }) : [];
    var selectedIndustries = this._va('industry');
    if (typeof this._v('industry') === 'string' && this._v('industry')) {
      selectedIndustries = [this._v('industry')];
    }

    var logoHtml = '<div class="profile-logo-wrap">' +
      (p.logo_url ? '<img id="prof-logo-img" src="' + window.escHtml(p.logo_url) + '" class="profile-logo-preview" alt="Logo" />' : '<div id="prof-logo-img" class="profile-logo-placeholder">No logo</div>') +
      '<input id="prof-logo-file" type="file" accept="image/*" class="profile-file-input" />' +
      '<button class="btn btn-outline" data-action="upload-logo">Upload Logo</button>' +
    '</div>';

    var industryChips = this._chipGroup('prof-industries', industries, selectedIndustries) +
      '<div id="prof-industries-max-msg" style="display:none;color:var(--red);font-size:13px;margin-top:6px">Maximum 2 industries — remove one to select another</div>';

    var body = '<div class="profile-fields">' +
      this._field('Legal Business Name', this._input('prof-biz-name', 'text', this._v('business_name'), 'Your registered business name')) +
      this._field('Trading Name / t/as <span class="profile-optional">(optional)</span>', this._input('prof-trading-name', 'text', this._v('trading_name'), 'Trading name if different from legal name')) +
      this._field2('ABN', this._input('prof-abn', 'text', this._v('abn'), 'xx xxx xxx xxx', 'maxlength="14"')) +
      this._field2('Business Structure', this._dropdown('prof-structure', structures, this._v('business_structure'))) +
      this._field('Industries <span class="profile-optional">(select up to 2)</span>', industryChips) +
      this._field('Business Logo', logoHtml) +
      this._field2('Years in Business', this._input('prof-years', 'number', this._v('years_in_business'), 'e.g. 5', 'min="0" max="200"')) +
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
    '</div>';

    document.getElementById('prof-panel-identity').innerHTML = this._card('\uD83C\uDFE2', '1. Identity', 'Your registered business details', body, 'prof-id-save');

    var self = this;
    var idPanel = document.getElementById('prof-panel-identity');
    self._bindPhoneTypeDropdowns(idPanel);
    self._bindChipToggles(idPanel);
    self._bindIndustryWarn(selectedIndustries);

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

  // Maps BP industry names (BP_INDUSTRY_DATA.groups[].name) to the
  // industryKey values used by tools-data.js for type:'industry' tools.
  // Mirrors panel.html's KEY_TO_INDUSTRY (canonical) so the modal
  // matches the industry context used elsewhere on the platform.
  _BP_TO_TOOL_INDUSTRY: {
    'Building & Construction':       ['builder'],
    'Electrical & Solar':            ['electrician'],
    'Plumbing & Gas':                ['plumber'],
    'HVAC & Refrigeration':          ['hvac'],
    'Landscaping & Outdoor':         ['landscaper', 'pool', 'concreter'],
    'Painting & Finishing':          [],
    'Fabrication & Manufacturing':   ['fabricator', 'manufacturer'],
    'Cleaning & Maintenance':        ['cleaner', 'handyman'],
    'Service & Professional':        []
  },

  _buildIndustryRemovalBody: function(industry) {
    var esc = window.escHtml;
    var profile = this._profile || {};
    var activated = Array.isArray(profile.activated_tools) ? profile.activated_tools : [];

    // Section 1: tools using industry context — fixed informational list
    var contextTools = [
      { id: 'chatbot',        label: 'Chatbot',                  use: 'system prompt' },
      { id: 'design-viz',     label: 'Design Visualiser',        use: 'render types' },
      { id: 'news-digest',    label: 'Industry News Digest',     use: 'news sources' },
      { id: 'strategic-plan', label: 'Strategic Plan',           use: 'industry analysis' }
    ];
    var contextItems = contextTools.map(function(t) {
      return '<li>' + esc(t.label) + ' — ' + esc(t.use) + '</li>';
    }).join('');

    // Section 2: industry-specific tools owned for this industry
    var industryTools = [];
    var keys = this._BP_TO_TOOL_INDUSTRY[industry] || [];
    if (keys.length && Array.isArray(window.TOOLS) && activated.length) {
      industryTools = window.TOOLS.filter(function(t) {
        return t.type === 'industry' && keys.indexOf(t.industryKey) > -1 && activated.indexOf(t.id) > -1;
      });
    }
    var industryToolsSection = '';
    if (industryTools.length) {
      industryToolsSection =
        '<p style="margin-top:12px"><strong>' + esc(industry) + '</strong>-specific tools currently active:</p>' +
        '<ul>' + industryTools.map(function(t) { return '<li>' + esc(t.title) + '</li>'; }).join('') + '</ul>';
    }

    return '<p>Removing <strong>' + esc(industry) + '</strong> will affect tools that use industry context:</p>' +
      '<ul>' + contextItems + '</ul>' +
      industryToolsSection +
      '<p style="margin-top:12px;color:var(--text-muted)">Existing tool outputs will not be deleted but may reference the removed industry.</p>';
  },

  _bindIndustryWarn: function(previousIndustries) {
    var group = document.getElementById('prof-industries');
    if (!group) return;
    var self = this;
    var MAX_INDUSTRIES = 2;

    // Capture-phase: block selection of a third industry before
    // _bindChipToggles toggles the active state. Mirrors the cap
    // behaviour in the pre-login industry-modal.js.
    group.addEventListener('click', function(e) {
      if (e.target.closest('.prof-pill-remove')) return;
      var chip = e.target.closest('.filter-pill');
      if (!chip || chip.dataset.custom) return;
      if (chip.classList.contains('active')) return;
      var activeCount = group.querySelectorAll('.filter-pill.active').length;
      if (activeCount >= MAX_INDUSTRIES) {
        e.stopImmediatePropagation();
        e.preventDefault();
        var msg = document.getElementById('prof-industries-max-msg');
        if (msg) {
          msg.style.display = '';
          if (msg._hideTimer) clearTimeout(msg._hideTimer);
          msg._hideTimer = setTimeout(function() { msg.style.display = 'none'; }, 2500);
        }
      }
    }, true);

    group.addEventListener('click', function(e) {
      if (e.target.closest('.prof-pill-remove')) return;
      var chip = e.target.closest('.filter-pill');
      if (!chip) return;
      var val = chip.getAttribute('data-value');
      var wasSelected = previousIndustries.indexOf(val) > -1;
      var isNowDeselected = !chip.classList.contains('active');
      if (wasSelected && isNowDeselected) {
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
        var onConfirm = function() { cleanup(); };
        var onCancel = function() { chip.classList.add('active'); cleanup(); };
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
      var updates = {
        business_name: bizNameEl.value.trim(),
        trading_name: document.getElementById('prof-trading-name').value.trim(),
        abn: abnEl.value.trim(),
        business_structure: structureEl.getAttribute('data-value') || '',
        industry: self._getSelectedChips('prof-industries'),
        years_in_business: parseInt(yearsEl.value) || null
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  // Location

  _locationBlock: function(loc, idx, isPrimary) {
    var idPfx = isPrimary ? 'loc-p' : 'loc-' + idx;
    var nameVal = loc.name || '';
    var phones = Array.isArray(loc.phones) ? loc.phones : (loc.phone ? [{ type: 'Mobile', number: loc.phone }] : [{ type: 'Mobile', number: '' }]);
    var typeOpts = ['Main', 'Mobile', 'Work', 'Fax'];
    var phonesHtml = phones.map(function(ph, pi) {
      var currentType = ph.type || 'Mobile';
      var typeSelect = '<span class="lookback-dropdown-wrap">' +
        '<button type="button" class="lookback-dropdown loc-phone-type" data-value="' + window.escHtml(currentType) + '">' + window.escHtml(currentType) + ' &#9662;</button>' +
        '<div class="lookback-dropdown-menu">' +
        typeOpts.map(function(t) {
          return '<button type="button" class="lookback-dropdown-item' + (t === currentType ? ' active' : '') + '" data-value="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
        }).join('') +
        '</div></span>';
      return '<div class="profile-repeating-row" id="' + idPfx + '-ph-' + pi + '">' +
        typeSelect +
        '<input type="text" class="profile-input loc-phone-number" value="' + window.escHtml(window.formatPhoneNumber(ph.number || '')) + '" placeholder="Phone number" />' +
        '<button class="btn-dismiss" data-action="remove-row" data-target="' + idPfx + '-ph-' + pi + '">Remove</button>' +
      '</div>';
    }).join('');
    var removeBtn = isPrimary ? '' :
      '<button class="btn-dismiss" data-action="remove-row" data-target="loc-block-' + idx + '">Remove Location</button>';
    return '<div class="profile-location-block" id="' + (isPrimary ? 'loc-primary-block' : 'loc-block-' + idx) + '">' +
      '<div class="profile-location-row-header">' +
        '<strong class="profile-location-title">' + (isPrimary ? 'Primary Location' : 'Location ' + (idx + 2)) + '</strong>' +
        removeBtn +
      '</div>' +
      '<div class="profile-fields profile-fields-compact">' +
        '<div class="profile-field-full"><label class="profile-label">Location Name</label>' +
          '<input type="text" class="profile-input loc-name" placeholder="e.g. Main Office, Warehouse, Bendigo Site" value="' + window.escHtml(nameVal) + '" /></div>' +
        '<div class="profile-field-full"><label class="profile-label">Suite / Level / Unit <span class="profile-optional">(optional)</span></label>' +
          '<input type="text" class="profile-input loc-unit" placeholder="e.g. Suite 4, Level 2, Shed 3" value="' + window.escHtml(loc.unit || '') + '" /></div>' +
        '<div class="profile-field-full"><label class="profile-label">Street Address</label>' +
          '<input type="text" class="profile-input loc-street" placeholder="Street address" value="' + window.escHtml(loc.street || '') + '" /></div>' +
        '<div class="profile-field-full"><div class="profile-address-row">' +
          '<div><label class="profile-label">Suburb</label><input type="text" class="profile-input loc-suburb" placeholder="Suburb" value="' + window.escHtml(loc.suburb || '') + '" /></div>' +
          '<div><label class="profile-label">State</label><select class="profile-input loc-state">' +
            ['', 'NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map(function(s) {
              var lbl = s === '' ? 'Select state' : s;
              return '<option value="' + s + '"' + (loc.state === s ? ' selected' : '') + '>' + lbl + '</option>';
            }).join('') +
          '</select></div>' +
          '<div><label class="profile-label">Postcode</label><input type="text" class="profile-input loc-postcode" placeholder="Postcode" value="' + window.escHtml(loc.postcode || '') + '" /></div>' +
        '</div></div>' +
      '</div>' +
      '<div class="profile-label profile-label-heading">Phone Numbers</div>' +
      '<div class="loc-phones-wrap" id="' + idPfx + '-phones">' + phonesHtml + '</div>' +
      '<button class="btn btn-outline profile-add-btn" data-action="add-phone" data-target="' + idPfx + '">+ Add Phone</button>' +
    '</div>';
  },

  _renderLocation: function() {
    var p = this._profile;
    var primaryLoc = {
      name: this._v('address_name'),
      unit: this._v('address_unit'),
      street: this._v('address_street'),
      suburb: this._v('address_suburb'),
      state: this._v('address_state'),
      postcode: this._v('address_postcode'),
      phones: Array.isArray(p.additional_phones) ? p.additional_phones.map(function(ph) {
        if (typeof ph === 'string') { try { return JSON.parse(ph); } catch(e) { return { type: 'Mobile', number: ph }; } }
        return ph;
      }) : [{ type: 'Mobile', number: '' }]
    };
    var extraLocs = Array.isArray(p.additional_locations) ? p.additional_locations : [];
    var sites = Array.isArray(p.website_urls) ? p.website_urls : [];
    var extraLocsHtml = extraLocs.map(function(loc, i) {
      return window.CL_PROFILE._locationBlock(loc, i, false);
    }).join('');
    var extraSitesHtml = sites.slice(1).map(function(u, i) {
      return '<div class="profile-repeating-row" id="prof-site-' + (i + 1) + '">' +
        '<input type="url" class="profile-input prof-add-site" value="' + window.escHtml(u) + '" placeholder="https://yoursite.com.au" />' +
        '<button class="btn-dismiss" data-action="remove-row" data-target="prof-site-' + (i + 1) + '">Remove</button>' +
      '</div>';
    }).join('');

    var serviceAreaOpts = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.serviceAreaOptions : [];
    var selectedArea = this._va('service_area');
    var customAreas = selectedArea.filter(function(a) { return serviceAreaOpts.indexOf(a) === -1; });
    var serviceAreaHtml = this._chipGroupWithOther('prof-service-area', serviceAreaOpts, selectedArea, customAreas);

    var tradingHours = this._vj('trading_hours', []);
    var hoursHtml = this._renderTradingHours(tradingHours);

    var body =
      this._locationBlock(primaryLoc, 0, true) +
      '<div id="prof-extra-locs">' + extraLocsHtml + '</div>' +
      '<button class="btn btn-outline profile-btn-add-location" data-action="add-location">+ Add Location</button>' +
      '<div class="profile-location-block profile-location-block-websites">' +
        '<div class="profile-label profile-label-heading">Website URL(s)</div>' +
        '<input type="url" id="prof-site-primary" class="profile-input profile-input-mb" value="' + window.escHtml(sites[0] || '') + '" placeholder="https://yoursite.com.au" />' +
        '<div id="prof-sites-extra">' + extraSitesHtml + '</div>' +
        '<button class="btn btn-outline profile-btn-add-website" data-action="add-site">+ Add Website</button>' +
      '</div>' +
      '<div class="profile-fields" style="margin-top:16px">' +
        this._field('Service Area', serviceAreaHtml) +
        this._field('Trading Hours', hoursHtml) +
      '</div>';

    document.getElementById('prof-panel-location').innerHTML = this._card(
      '\uD83D\uDCCD', '2. Location &amp; Contact', 'Where you operate and how to reach you', body, 'prof-loc-save'
    );

    var self = this;
    document.getElementById('prof-loc-save').addEventListener('click', function() { self._saveLocation(); });
    var locPanel = document.getElementById('prof-panel-location');
    self._wirePhoneFormat(locPanel);
    self._bindPhoneTypeDropdowns(locPanel);
    self._bindChipToggles(locPanel);
    self._bindHoursPresets();
    self._bindAutoSave('location', locPanel);
    self._initStreetAutocomplete();

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.lookback-dropdown-wrap')) {
        document.querySelectorAll('#cl-tab-profile .lookback-dropdown-menu.open').forEach(function(m) { m.classList.remove('open'); });
        document.querySelectorAll('#cl-tab-profile .lookback-dropdown.active').forEach(function(b) { b.classList.remove('active'); });
      }
    });
  },

  _renderTradingHours: function(hours) {
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var hoursMap = {};
    if (Array.isArray(hours)) {
      hours.forEach(function(h) { hoursMap[h.day] = h; });
    }
    var timeOpts = '';
    for (var h = 0; h < 24; h++) {
      for (var m = 0; m < 60; m += 30) {
        var hh = (h < 10 ? '0' : '') + h;
        var mm = m === 0 ? '00' : '30';
        var label = (h === 0 ? '12' : h > 12 ? (h - 12) : h) + ':' + mm + (h < 12 ? ' AM' : ' PM');
        timeOpts += '<option value="' + hh + ':' + mm + '">' + label + '</option>';
      }
    }

    var presetHtml = '<div class="profile-hours-preset">' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="business">Mon\u2013Fri 8:00\u20135:00</button>' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="24-7">24/7</button>' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="appointment">By Appointment</button>' +
    '</div>';

    var rowsHtml = days.map(function(day) {
      var data = hoursMap[day] || { enabled: false, open: '08:00', close: '17:00' };
      var checked = data.enabled ? ' checked' : '';
      return '<div class="profile-hours-row">' +
        '<label class="profile-hours-day"><input type="checkbox" class="prof-hours-toggle" data-day="' + day + '"' + checked + ' /> ' + day + '</label>' +
        '<select class="profile-input prof-hours-open" data-day="' + day + '"' + (data.enabled ? '' : ' disabled') + '>' + timeOpts.replace('value="' + (data.open || '08:00') + '"', 'value="' + (data.open || '08:00') + '" selected') + '</select>' +
        '<select class="profile-input prof-hours-close" data-day="' + day + '"' + (data.enabled ? '' : ' disabled') + '>' + timeOpts.replace('value="' + (data.close || '17:00') + '"', 'value="' + (data.close || '17:00') + '" selected') + '</select>' +
      '</div>';
    }).join('');

    return presetHtml + '<div class="profile-hours-grid" id="prof-hours-grid">' + rowsHtml + '</div>';
  },

  _toggleHoursRow: function(checkbox) {
    var day = checkbox.dataset.day;
    var row = checkbox.closest('.profile-hours-row');
    var selects = row.querySelectorAll('select');
    selects.forEach(function(s) { s.disabled = !checkbox.checked; });
  },

  _bindHoursPresets: function() {
    var self = this;
    document.querySelectorAll('.prof-hours-preset').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var preset = btn.dataset.preset;
        var grid = document.getElementById('prof-hours-grid');
        if (!grid) return;
        var toggles = grid.querySelectorAll('.prof-hours-toggle');
        var opens = grid.querySelectorAll('.prof-hours-open');
        var closes = grid.querySelectorAll('.prof-hours-close');
        toggles.forEach(function(t, i) {
          if (preset === '24-7') {
            t.checked = true;
            opens[i].disabled = false;
            opens[i].value = '00:00';
            closes[i].disabled = false;
            closes[i].value = '23:30';
          } else if (preset === 'appointment') {
            t.checked = false;
            opens[i].disabled = true;
            closes[i].disabled = true;
          } else if (preset === 'business') {
            var isWeekday = i < 5;
            t.checked = isWeekday;
            opens[i].disabled = !isWeekday;
            closes[i].disabled = !isWeekday;
            if (isWeekday) { opens[i].value = '08:00'; closes[i].value = '17:00'; }
          }
        });
      });
    });
  },

  _collectTradingHours: function() {
    var grid = document.getElementById('prof-hours-grid');
    if (!grid) return [];
    var hours = [];
    grid.querySelectorAll('.profile-hours-row').forEach(function(row) {
      var toggle = row.querySelector('.prof-hours-toggle');
      if (!toggle) return;
      hours.push({
        day: toggle.dataset.day,
        enabled: toggle.checked,
        open: row.querySelector('.prof-hours-open').value,
        close: row.querySelector('.prof-hours-close').value
      });
    });
    return hours;
  },

  _bindPhoneTypeDropdowns: function(container) {
    container.querySelectorAll('.lookback-dropdown-wrap').forEach(function(wrap) {
      if (wrap.dataset.phoneTypeBound) return;
      wrap.dataset.phoneTypeBound = '1';
      var trigger = wrap.querySelector('.lookback-dropdown');
      var menu = wrap.querySelector('.lookback-dropdown-menu');
      if (!trigger || !menu) return;
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelectorAll('.lookback-dropdown-menu.open').forEach(function(m) { if (m !== menu) m.classList.remove('open'); });
        document.querySelectorAll('.lookback-dropdown.active').forEach(function(b) { if (b !== trigger) b.classList.remove('active'); });
        menu.classList.toggle('open');
        trigger.classList.toggle('active');
      });
      menu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function() {
          trigger.setAttribute('data-value', item.getAttribute('data-value'));
          trigger.innerHTML = window.escHtml(item.getAttribute('data-value')) + ' &#9662;';
          menu.querySelectorAll('.lookback-dropdown-item').forEach(function(it) { it.classList.remove('active'); });
          item.classList.add('active');
          menu.classList.remove('open');
          trigger.classList.remove('active');
        });
      });
    });
  },

  _wirePhoneFormat: function(container) {
    container.querySelectorAll('.loc-phone-number').forEach(function(input) {
      if (input.dataset.phoneFormatted) return;
      input.dataset.phoneFormatted = '1';
      input.addEventListener('input', function() {
        var pos = input.selectionStart;
        var oldLen = input.value.length;
        input.value = window.formatPhoneNumber(input.value);
        var newLen = input.value.length;
        input.setSelectionRange(pos + (newLen - oldLen), pos + (newLen - oldLen));
      });
    });
  },

  _addPhone: function(idPfx) {
    var wrap = document.getElementById(idPfx + '-phones');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-repeating-row').length;
    var typeOpts = ['Main', 'Mobile', 'Work', 'Fax'];
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = idPfx + '-ph-' + i;
    d.innerHTML = '<span class="lookback-dropdown-wrap">' +
      '<button type="button" class="lookback-dropdown loc-phone-type" data-value="Mobile">Mobile &#9662;</button>' +
      '<div class="lookback-dropdown-menu">' +
      typeOpts.map(function(t) {
        return '<button type="button" class="lookback-dropdown-item' + (t === 'Mobile' ? ' active' : '') + '" data-value="' + t + '">' + t + '</button>';
      }).join('') +
      '</div></span>' +
    '<input type="text" class="profile-input loc-phone-number" placeholder="Phone number" />' +
    '<button class="btn-dismiss" data-action="remove-row" data-target="' + idPfx + '-ph-' + i + '">Remove</button>';
    wrap.appendChild(d);
    this._wirePhoneFormat(d);
    this._bindPhoneTypeDropdowns(d);
  },

  _addSite: function() {
    var wrap = document.getElementById('prof-sites-extra');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-repeating-row').length + 1;
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = 'prof-site-' + i;
    d.innerHTML = '<input type="url" class="profile-input prof-add-site" placeholder="https://yoursite.com.au" />' +
      '<button class="btn-dismiss" data-action="remove-row" data-target="prof-site-' + i + '">Remove</button>';
    wrap.appendChild(d);
  },

  _addLocation: function() {
    var wrap = document.getElementById('prof-extra-locs');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-location-block').length;
    var emptyLoc = { name: '', unit: '', street: '', suburb: '', state: '', postcode: '', phones: [{ type: 'Mobile', number: '' }] };
    var div = document.createElement('div');
    div.innerHTML = window.CL_PROFILE._locationBlock(emptyLoc, i, false);
    wrap.appendChild(div.firstChild);
    this._wirePhoneFormat(wrap);
    this._bindPhoneTypeDropdowns(wrap);
    this._initStreetAutocomplete();
  },

  // BP UX Improvements Spec v1.0 §3 — wire Google Places Autocomplete
  // to every Street Address input. The widget handles its own session
  // tokens, restricts results to AU addresses, and falls back silently
  // to manual entry if the API key endpoint or Maps script can't load.
  _initStreetAutocomplete: function() {
    var self = this;
    if (!self._supabase) return;
    self._loadGoogleMapsPlaces().then(function() {
      if (!window.google || !window.google.maps || !window.google.maps.places) return;
      var inputs = document.querySelectorAll('#prof-panel-location .loc-street');
      inputs.forEach(function(input) {
        if (input.dataset.gmapAutocompleteBound) return;
        input.dataset.gmapAutocompleteBound = '1';
        var ac = new window.google.maps.places.Autocomplete(input, {
          componentRestrictions: { country: 'au' },
          fields: ['address_components'],
          types: ['address']
        });
        ac.addListener('place_changed', function() {
          var place = ac.getPlace();
          if (!place || !place.address_components) return;
          self._applyAutocompleteResult(input, place.address_components);
        });
      });
    }).catch(function() { /* swallow — manual entry still works */ });
  },

  _loadGoogleMapsPlaces: function() {
    if (window.google && window.google.maps && window.google.maps.places) {
      return Promise.resolve();
    }
    if (window.__staxGmapPromise) return window.__staxGmapPromise;
    var self = this;
    window.__staxGmapPromise = (async function() {
      var sessionRes = await self._supabase.auth.getSession();
      var token = sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.access_token;
      if (!token) throw new Error('No session');
      var keyRes = await fetch('/api/places-key', { headers: { Authorization: 'Bearer ' + token } });
      if (!keyRes.ok) throw new Error('Places key unavailable');
      var keyJson = await keyRes.json();
      if (!keyJson || !keyJson.key) throw new Error('Places key missing');
      return new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(keyJson.key) + '&libraries=places&loading=async';
        script.async = true;
        script.defer = true;
        script.onload = function() { resolve(); };
        script.onerror = function() { reject(new Error('Maps script failed to load')); };
        document.head.appendChild(script);
      });
    })().catch(function(err) {
      // Reset the cached promise so a later panel render can retry.
      window.__staxGmapPromise = null;
      throw err;
    });
    return window.__staxGmapPromise;
  },

  _applyAutocompleteResult: function(streetInput, components) {
    var parsed = { street_number: '', route: '', subpremise: '', locality: '', state: '', postcode: '' };
    components.forEach(function(c) {
      if (c.types.indexOf('subpremise') > -1) parsed.subpremise = c.long_name;
      else if (c.types.indexOf('street_number') > -1) parsed.street_number = c.long_name;
      else if (c.types.indexOf('route') > -1) parsed.route = c.long_name;
      else if (c.types.indexOf('locality') > -1) parsed.locality = c.long_name;
      else if (c.types.indexOf('administrative_area_level_1') > -1) parsed.state = c.short_name;
      else if (c.types.indexOf('postal_code') > -1) parsed.postcode = c.long_name;
    });
    var streetParts = [parsed.street_number, parsed.route].filter(Boolean);
    streetInput.value = streetParts.join(' ').trim();
    var block = streetInput.closest('.profile-location-block');
    if (!block) return;
    var unitEl = block.querySelector('.loc-unit');
    if (unitEl && parsed.subpremise && !unitEl.value.trim()) {
      unitEl.value = parsed.subpremise;
    }
    var suburbEl = block.querySelector('.loc-suburb');
    if (suburbEl && parsed.locality) suburbEl.value = parsed.locality;
    var stateEl = block.querySelector('.loc-state');
    if (stateEl && parsed.state) stateEl.value = parsed.state;
    var postEl = block.querySelector('.loc-postcode');
    if (postEl && parsed.postcode) postEl.value = parsed.postcode;
    // The location panel's auto-save listens for blur/change events;
    // we set values programmatically so trigger an explicit save.
    if (this._scheduleAutoSave) this._scheduleAutoSave('location', 300);
  },

  _saveLocation: function(opts) {
    var autoSave = !!(opts && opts.autoSave);
    var pb = document.getElementById('loc-primary-block');
    var primaryPhones = Array.from(pb.querySelectorAll('#loc-p-phones .profile-repeating-row')).map(function(row) {
      return { type: row.querySelector('.loc-phone-type').getAttribute('data-value') || 'Mobile', number: row.querySelector('.loc-phone-number').value.trim() };
    }).filter(function(ph) { return ph.number; });
    var extraBlocks = document.querySelectorAll('#prof-extra-locs .profile-location-block');
    var locs = Array.from(extraBlocks).map(function(b) {
      var phonesWrap = b.querySelector('.loc-phones-wrap');
      var phones = phonesWrap ? Array.from(phonesWrap.querySelectorAll('.profile-repeating-row')).map(function(row) {
        return { type: row.querySelector('.loc-phone-type').getAttribute('data-value') || 'Mobile', number: row.querySelector('.loc-phone-number').value.trim() };
      }).filter(function(ph) { return ph.number; }) : [];
      return {
        name: b.querySelector('.loc-name').value.trim(),
        unit: b.querySelector('.loc-unit').value.trim(),
        street: b.querySelector('.loc-street').value.trim(),
        suburb: b.querySelector('.loc-suburb').value.trim(),
        state: b.querySelector('.loc-state').value.trim(),
        postcode: b.querySelector('.loc-postcode').value.trim(),
        phones: phones
      };
    });
    var sites = [];
    var primary = document.getElementById('prof-site-primary');
    if (primary && primary.value.trim()) sites.push(primary.value.trim());
    Array.from(document.querySelectorAll('#prof-sites-extra .prof-add-site')).forEach(function(el) {
      if (el.value.trim()) sites.push(el.value.trim());
    });
    var serviceArea = this._getSelectedChips('prof-service-area').concat(this._getOtherItems('prof-service-area'));
    var tradingHours = this._collectTradingHours();

    var self = this;
    var btn = document.getElementById('prof-loc-save');
    window.handleSave(btn, async function() {
      var nameEl = pb.querySelector('.loc-name');
      var streetEl = pb.querySelector('.loc-street');
      var suburbEl = pb.querySelector('.loc-suburb');
      var stateEl = pb.querySelector('.loc-state');
      var postcodeEl = pb.querySelector('.loc-postcode');
      var serviceAreaEl = document.getElementById('prof-service-area');
      var phonesEl = document.getElementById('loc-p-phones');
      var hoursEl = document.getElementById('prof-hours-grid');
      // Skip validation on auto-save — see comment in _saveIdentity.
      if (!autoSave) {
        self._validateMandatory('prof-panel-location', [
          { test: function() { return nameEl.value.trim() !== ''; }, el: nameEl, label: 'Location Name' },
          { test: function() { return streetEl.value.trim() !== ''; }, el: streetEl, label: 'Street Address' },
          { test: function() { return suburbEl.value.trim() !== ''; }, el: suburbEl, label: 'Suburb' },
          { test: function() { return stateEl.value.trim() !== ''; }, el: stateEl, label: 'State' },
          { test: function() { return postcodeEl.value.trim() !== ''; }, el: postcodeEl, label: 'Postcode' },
          { test: function() { return primaryPhones.length > 0; }, el: phonesEl, label: 'Phone Number (at least one)' },
          { test: function() { return serviceArea.length > 0; }, el: serviceAreaEl, label: 'Service Area (at least one)' },
          { test: function() { return Array.isArray(tradingHours) && tradingHours.some(function(h) { return h.enabled; }); }, el: hoursEl, label: 'Trading Hours (at least one day)' }
        ]);
      }
      var updates = {
        address_name: nameEl.value.trim(),
        address_unit: pb.querySelector('.loc-unit').value.trim(),
        address_street: streetEl.value.trim(),
        address_suburb: suburbEl.value.trim(),
        address_state: stateEl.value.trim(),
        address_postcode: postcodeEl.value.trim(),
        additional_phones: primaryPhones,
        additional_locations: locs,
        website_urls: sites,
        service_area: serviceArea,
        trading_hours: tradingHours
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  _renderServices: function() {
    this._renderMultiSelect('svc', 'bp_services', 'Services', '\uD83D\uDEE0\uFE0F', '3. Services',
      'What services your business provides with pricing', 'prof-panel-services', 'prof-svc-save');
  },

  _renderProducts: function() {
    this._renderMultiSelect('prod', 'bp_products', 'Products', '\uD83D\uDCE6', '4. Products',
      'What products your business sells with pricing', 'prof-panel-products', 'prof-prod-save');
  },

  _renderMultiSelect: function(prefix, profileKey, label, icon, title, subtitle, panelId, saveBtnId) {
    var self = this;
    var items = this._vj(profileKey, []);
    var industries = this._va('industry');
    var availableGroups = window.BP_INDUSTRY_DATA
      ? (prefix === 'svc' ? window.BP_INDUSTRY_DATA.getMergedServices(industries) : window.BP_INDUSTRY_DATA.getMergedProducts(industries))
      : [];
    var selectedNames = items.map(function(i) { return i.name || ''; }).filter(function(n) { return !!n; });
    var customItems = items.filter(function(i) { return i.is_custom; });
    var pricingTypes = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.pricingTypes : [];

    var pillsHtml = '<div class="profile-label" style="margin-bottom:8px">Select from your industry list</div>';
    pillsHtml += '<div id="prof-' + prefix + '-pills" style="margin-bottom:16px">';
    pillsHtml += this._renderAccordionGroups(availableGroups, 'svc-pill', selectedNames, 'prof-' + prefix);
    pillsHtml += '</div>';

    var customHtml = '<div style="margin-bottom:16px">';
    customHtml += '<div class="profile-label" style="margin-bottom:8px">Custom ' + label.toLowerCase() + '</div>';
    customHtml += '<div id="prof-' + prefix + '-custom-pills" class="review-pill-row" style="margin-bottom:8px">';
    customItems.forEach(function(item) {
      customHtml += '<button type="button" class="filter-pill active prof-custom-pill" data-svc-custom="' + window.escHtml(item.name) + '">' +
        window.escHtml(item.name) + ' <span class="prof-pill-remove" data-action="remove-other" data-group="prof-' + prefix + '-custom-pills">\u00D7</span></button>';
    });
    customHtml += '</div>';
    customHtml += '<div style="display:flex;gap:8px;align-items:center">';
    customHtml += '<input type="text" class="profile-input" id="prof-' + prefix + '-other-input" placeholder="Add custom ' + label.toLowerCase().slice(0, -1) + '" style="flex:1" />';
    customHtml += '<button type="button" class="btn-outline btn-sm" id="prof-' + prefix + '-add-other">Add</button>';
    customHtml += '</div></div>';

    var pricingHtml = '<div id="prof-' + prefix + '-pricing" style="margin-top:8px"></div>';

    var body = '<div class="profile-fields" style="display:block">' +
      '<div class="profile-field-full">' +
        '<label class="profile-label">' + label + ' <span class="profile-optional">(select all that apply, then set pricing)</span></label>' +
        pillsHtml + customHtml +
        '<div class="profile-label" style="margin-bottom:8px;margin-top:16px;font-weight:var(--heading-lg-weight)">Pricing for selected ' + label.toLowerCase() + '</div>' +
        pricingHtml +
      '</div>' +
    '</div>';

    document.getElementById(panelId).innerHTML = this._card(icon, title, subtitle, body, saveBtnId);

    this._renderPricingRows(prefix, items, pricingTypes);
    this._bindMultiSelectPills(prefix, profileKey, pricingTypes);
    this._bindChipAccordion(document.getElementById('prof-' + prefix + '-pills'));

    var panelContainer = document.getElementById(panelId);
    this._bindAutoSave(prefix === 'svc' ? 'services' : 'products', panelContainer);

    document.getElementById(saveBtnId).addEventListener('click', function() {
      self._saveMultiSelect(prefix, profileKey, saveBtnId);
    });
  },

  _renderPricingRows: function(prefix, items, pricingTypes) {
    var self = this;
    var container = document.getElementById('prof-' + prefix + '-pricing');
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:var(--note-font-size);padding:8px 0">No ' + (prefix === 'svc' ? 'services' : 'products') + ' selected yet. Click items above to add them.</div>';
      this._bindPriceInputBehaviour(container);
      return;
    }
    var html = '';
    items.forEach(function(item, idx) {
      var pType = item.pricing_type || '';
      var pTypeLabel = pType ? (pricingTypes.find(function(pt) { return pt.value === pType; }) || {}).label || 'Pricing type...' : 'Pricing type...';
      var pTypeOpts = pricingTypes.map(function(pt) {
        return '<button type="button" class="lookback-dropdown-item' + (pt.value === pType ? ' active' : '') + '" data-value="' + pt.value + '">' + window.escHtml(pt.label) + '</button>';
      }).join('');
      var amountHtml = '';
      // BP UX Improvements Spec v1.0 §4 — text input + thousand separators,
      // wider fields so 7-digit prices fit without truncation.
      if (pType === 'hourly' || pType === 'fixed') {
        amountHtml = '<input type="text" inputmode="decimal" class="profile-input prof-svc-amount-val" value="' + window.escHtml(self._formatPrice(item.amount)) + '" placeholder="$ Amount" style="max-width:160px" />';
      } else if (pType === 'range') {
        amountHtml = '<input type="text" inputmode="decimal" class="profile-input prof-svc-amount-min" value="' + window.escHtml(self._formatPrice(item.amount_min)) + '" placeholder="$ Min" style="max-width:110px" />' +
          '<input type="text" inputmode="decimal" class="profile-input prof-svc-amount-max" value="' + window.escHtml(self._formatPrice(item.amount_max)) + '" placeholder="$ Max" style="max-width:110px" />';
      }
      var rowClass = 'profile-svc-row' + (pType === 'range' ? ' profile-svc-row-range' : '');
      html += '<div class="' + rowClass + '" data-svc-pricing="' + window.escHtml(item.name) + '" data-custom="' + (item.is_custom ? '1' : '0') + '">' +
        '<div style="font-size:var(--btn-font-size);font-weight:500;color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + window.escHtml(item.name) + '</div>' +
        '<span class="lookback-dropdown-wrap">' +
          '<button type="button" class="lookback-dropdown lookback-dropdown-field prof-svc-ptype" data-value="' + window.escHtml(pType) + '">' + window.escHtml(pTypeLabel) + '</button>' +
          '<div class="lookback-dropdown-menu">' + pTypeOpts + '</div>' +
        '</span>' +
        amountHtml +
      '</div>';
    });
    container.innerHTML = html;
    this._bindPriceInputBehaviour(container);

    container.querySelectorAll('.lookback-dropdown-wrap').forEach(function(wrap) {
      var trigger = wrap.querySelector('.lookback-dropdown');
      var menu = wrap.querySelector('.lookback-dropdown-menu');
      if (!trigger || !menu) return;
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelectorAll('.lookback-dropdown-menu.open').forEach(function(m) { if (m !== menu) m.classList.remove('open'); });
        menu.classList.toggle('open');
        trigger.classList.toggle('active');
      });
      menu.querySelectorAll('.lookback-dropdown-item').forEach(function(menuItem) {
        menuItem.addEventListener('click', function() {
          var val = menuItem.getAttribute('data-value');
          trigger.setAttribute('data-value', val);
          trigger.textContent = menuItem.textContent;
          menu.querySelectorAll('.lookback-dropdown-item').forEach(function(it) { it.classList.remove('active'); });
          menuItem.classList.add('active');
          menu.classList.remove('open');
          trigger.classList.remove('active');
          self._updatePricingFields(trigger.closest('.profile-svc-row'), val);
        });
      });
    });
  },

  _bindMultiSelectPills: function(prefix, profileKey, pricingTypes) {
    var self = this;
    var pillsContainer = document.getElementById('prof-' + prefix + '-pills');
    if (pillsContainer) {
      pillsContainer.addEventListener('click', function(e) {
        var pill = e.target.closest('.filter-pill');
        if (!pill) return;
        pill.classList.toggle('active');
        self._syncPricingFromPills(prefix, pricingTypes);
      });
    }

    var customPillsContainer = document.getElementById('prof-' + prefix + '-custom-pills');
    if (customPillsContainer) {
      customPillsContainer.addEventListener('click', function(e) {
        var removeSpan = e.target.closest('.prof-pill-remove');
        if (removeSpan) {
          var pill = removeSpan.closest('.filter-pill');
          if (pill) pill.parentNode.removeChild(pill);
          self._syncPricingFromPills(prefix, pricingTypes);
        }
      });
    }

    var addBtn = document.getElementById('prof-' + prefix + '-add-other');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var input = document.getElementById('prof-' + prefix + '-other-input');
        var val = input ? input.value.trim() : '';
        if (!val) return;
        var customContainer = document.getElementById('prof-' + prefix + '-custom-pills');
        var existing = Array.from(customContainer.querySelectorAll('.filter-pill')).map(function(p) { return p.getAttribute('data-svc-custom'); });
        if (existing.indexOf(val) > -1) { input.value = ''; return; }
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'filter-pill active prof-custom-pill';
        chip.setAttribute('data-svc-custom', val);
        chip.innerHTML = window.escHtml(val) + ' <span class="prof-pill-remove" data-action="remove-other" data-group="prof-' + prefix + '-custom-pills">\u00D7</span>';
        customContainer.appendChild(chip);
        input.value = '';
        self._syncPricingFromPills(prefix, pricingTypes);
      });
    }
  },

  _syncPricingFromPills: function(prefix, pricingTypes) {
    var pillsContainer = document.getElementById('prof-' + prefix + '-pills');
    var customContainer = document.getElementById('prof-' + prefix + '-custom-pills');
    var pricingContainer = document.getElementById('prof-' + prefix + '-pricing');
    if (!pricingContainer) return;

    var self = this;
    var existingPricing = {};
    pricingContainer.querySelectorAll('[data-svc-pricing]').forEach(function(row) {
      var name = row.getAttribute('data-svc-pricing');
      var pTypeBtn = row.querySelector('.prof-svc-ptype');
      var amountVal = row.querySelector('.prof-svc-amount-val');
      var amountMin = row.querySelector('.prof-svc-amount-min');
      var amountMax = row.querySelector('.prof-svc-amount-max');
      existingPricing[name] = {
        pricing_type: pTypeBtn ? pTypeBtn.getAttribute('data-value') : '',
        amount: amountVal ? self._unformatPrice(amountVal.value) : null,
        amount_min: amountMin ? self._unformatPrice(amountMin.value) : null,
        amount_max: amountMax ? self._unformatPrice(amountMax.value) : null,
        is_custom: row.getAttribute('data-custom') === '1'
      };
    });

    var items = [];
    if (pillsContainer) {
      pillsContainer.querySelectorAll('.filter-pill.active').forEach(function(pill) {
        var name = pill.getAttribute('data-svc-pill');
        var existing = existingPricing[name] || {};
        items.push({ name: name, pricing_type: existing.pricing_type || '', amount: existing.amount || null, amount_min: existing.amount_min || null, amount_max: existing.amount_max || null, is_custom: false });
      });
    }
    if (customContainer) {
      customContainer.querySelectorAll('.filter-pill').forEach(function(pill) {
        var name = pill.getAttribute('data-svc-custom');
        var existing = existingPricing[name] || {};
        items.push({ name: name, pricing_type: existing.pricing_type || '', amount: existing.amount || null, amount_min: existing.amount_min || null, amount_max: existing.amount_max || null, is_custom: true });
      });
    }
    this._renderPricingRows(prefix, items, pricingTypes);
  },

  _updatePricingFields: function(row, pType) {
    var existingAmounts = row.querySelectorAll('.prof-svc-amount-val, .prof-svc-amount-min, .prof-svc-amount-max');
    existingAmounts.forEach(function(el) { el.parentNode.removeChild(el); });

    function makePriceInput(cls, placeholder, width) {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.className = 'profile-input ' + cls;
      inp.placeholder = placeholder;
      inp.style.maxWidth = width;
      return inp;
    }

    if (pType === 'hourly' || pType === 'fixed') {
      row.appendChild(makePriceInput('prof-svc-amount-val', '$ Amount', '160px'));
      row.classList.remove('profile-svc-row-range');
    } else if (pType === 'range') {
      row.appendChild(makePriceInput('prof-svc-amount-min', '$ Min', '110px'));
      row.appendChild(makePriceInput('prof-svc-amount-max', '$ Max', '110px'));
      row.classList.add('profile-svc-row-range');
    } else {
      row.classList.remove('profile-svc-row-range');
    }
  },

  // Format a numeric value as a thousand-separated string for display in
  // a price input. Returns '' for null/undefined/0/NaN so empty inputs
  // stay visually empty rather than showing "0". (BP UX Spec v1.0 §4.)
  _formatPrice: function(num) {
    if (num == null || num === '' || isNaN(num)) return '';
    var n = Number(num);
    if (n === 0) return '';
    return n.toLocaleString('en-AU', { maximumFractionDigits: 2 });
  },

  // Inverse of _formatPrice — strip any non-numeric characters (commas,
  // currency symbols, spaces) and parse to a Number. Returns null for
  // empty/invalid input so "no value" round-trips cleanly.
  _unformatPrice: function(str) {
    if (str == null || str === '') return null;
    var clean = String(str).replace(/[^\d.]/g, '');
    if (!clean) return null;
    var n = parseFloat(clean);
    return isNaN(n) ? null : n;
  },

  _bindPriceInputBehaviour: function(container) {
    if (!container || container.dataset.priceBehaviourBound) return;
    container.dataset.priceBehaviourBound = '1';
    var self = this;
    var sel = '.prof-svc-amount-val, .prof-svc-amount-min, .prof-svc-amount-max';
    container.addEventListener('focusin', function(e) {
      var input = e.target;
      if (!input.matches || !input.matches(sel)) return;
      // Strip formatting and clear if zero so user can type immediately.
      var raw = self._unformatPrice(input.value);
      input.value = (raw == null || raw === 0) ? '' : String(raw);
    });
    container.addEventListener('focusout', function(e) {
      var input = e.target;
      if (!input.matches || !input.matches(sel)) return;
      input.value = self._formatPrice(self._unformatPrice(input.value));
    });
  },

  _collectMultiSelectData: function(prefix) {
    var self = this;
    var pricingContainer = document.getElementById('prof-' + prefix + '-pricing');
    if (!pricingContainer) return [];
    return Array.from(pricingContainer.querySelectorAll('[data-svc-pricing]')).map(function(row) {
      var name = row.getAttribute('data-svc-pricing');
      var isCustom = row.getAttribute('data-custom') === '1';
      var pTypeBtn = row.querySelector('.prof-svc-ptype');
      var pType = pTypeBtn ? pTypeBtn.getAttribute('data-value') : '';
      var amountVal = row.querySelector('.prof-svc-amount-val');
      var amountMin = row.querySelector('.prof-svc-amount-min');
      var amountMax = row.querySelector('.prof-svc-amount-max');
      return {
        name: name,
        pricing_type: pType,
        amount: amountVal ? self._unformatPrice(amountVal.value) : null,
        amount_min: amountMin ? self._unformatPrice(amountMin.value) : null,
        amount_max: amountMax ? self._unformatPrice(amountMax.value) : null,
        is_custom: isCustom
      };
    });
  },

  _saveMultiSelect: function(prefix, profileKey, saveBtnId, opts) {
    var self = this;
    var autoSave = !!(opts && opts.autoSave);
    var btn = document.getElementById(saveBtnId);
    window.handleSave(btn, async function() {
      var data = self._collectMultiSelectData(prefix);
      // Skip validation on auto-save — see comment in _saveIdentity.
      if (!autoSave) {
        var panelId = prefix === 'svc' ? 'prof-panel-services' : 'prof-panel-products';
        var groupEl = document.getElementById('prof-' + prefix + '-pills');
        var label = prefix === 'svc' ? 'Services (at least one)' : 'Products (at least one)';
        self._validateMandatory(panelId, [
          { test: function() { return Array.isArray(data) && data.length > 0; }, el: groupEl, label: label }
        ]);
      }
      var updates = {};
      updates[profileKey] = data;
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  // Credentials

  _renderCredentials: function() {
    var industries = this._va('industry');
    if (typeof this._v('industry') === 'string' && this._v('industry')) {
      industries = [this._v('industry')];
    }
    var licenceOpts = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.getMergedLicences(industries) : [];
    var selectedLicences = this._va('licences');
    // licenceOpts is now an array of { name, items } groups; flatten to a
    // membership set so we can detect saved values that don't match any
    // standard chip and render them as custom pills instead.
    var standardLicenceSet = {};
    licenceOpts.forEach(function(g) { (g.items || []).forEach(function(i) { standardLicenceSet[i] = true; }); });
    var customLicences = selectedLicences.filter(function(l) { return !standardLicenceSet[l]; });
    var licenceHtml = this._chipGroupWithOther('prof-licences', licenceOpts, selectedLicences, customLicences);

    var paymentOpts = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.paymentMethodOptions : [];
    var selectedPayments = this._va('payment_methods');
    var paymentHtml = this._chipGroup('prof-payments', paymentOpts, selectedPayments);

    var responseOpts = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.responseTimeOptions : [];
    var responseHtml = this._dropdown('prof-response-time', responseOpts, this._v('response_time'));

    var afterHoursOpts = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.afterHoursOptions : [];
    var ahData = this._vj('after_hours_support', { type: '', hours_text: '' });
    var ahType = ahData.type || '';
    var ahText = ahData.hours_text || '';
    var afterHoursHtml = this._dropdown('prof-after-hours', afterHoursOpts, ahType) +
      '<input type="text" id="prof-after-hours-text" class="profile-input" value="' + window.escHtml(ahText) + '" placeholder="e.g. Available 6pm\u201310pm weekdays" style="margin-top:8px;' + (ahType === 'Available' ? '' : 'display:none;') + '" />';

    var body = '<div class="profile-fields">' +
      this._field('Licences &amp; Accreditations <span class="profile-optional">(optional)</span>', licenceHtml) +
      this._field('Payment Methods Accepted', paymentHtml) +
      this._field2('Typical Response Time', responseHtml) +
      this._field2('After-Hours Support', afterHoursHtml) +
      this._field('Warranty / Guarantee', this._textarea('prof-warranty', this._v('warranty_info'), 'e.g. 12-month warranty on all workmanship', 3)) +
      this._field('Complaints Handling', this._textarea('prof-complaints', this._v('complaints_handling'), 'e.g. All complaints acknowledged within 24 hours, resolved within 5 business days', 3)) +
    '</div>';

    document.getElementById('prof-panel-credentials').innerHTML = this._card(
      '\uD83D\uDCDC', '5. Credentials &amp; Support', 'Licences, payment, response times, and support policies', body, 'prof-cred-save'
    );

    var self = this;
    var credPanel = document.getElementById('prof-panel-credentials');
    self._bindChipToggles(credPanel);
    self._bindPhoneTypeDropdowns(credPanel);
    self._bindChipAccordion(document.getElementById('prof-licences'));
    self._bindAutoSave('credentials', credPanel);

    document.getElementById('prof-cred-save').addEventListener('click', function() { self._saveCredentials(); });

    var afterHoursBtn = document.getElementById('prof-after-hours');
    if (afterHoursBtn) {
      var observer = new MutationObserver(function() {
        var val = afterHoursBtn.getAttribute('data-value');
        var textField = document.getElementById('prof-after-hours-text');
        if (textField) textField.style.display = val === 'Available' ? '' : 'none';
        self._scheduleAutoSave('credentials', 500);
      });
      observer.observe(afterHoursBtn, { attributes: true, attributeFilter: ['data-value'] });
    }

    var responseBtn = document.getElementById('prof-response-time');
    if (responseBtn) {
      var respObserver = new MutationObserver(function() {
        self._scheduleAutoSave('credentials', 500);
      });
      respObserver.observe(responseBtn, { attributes: true, attributeFilter: ['data-value'] });
    }
  },

  _saveCredentials: function(opts) {
    var self = this;
    var autoSave = !!(opts && opts.autoSave);
    var btn = document.getElementById('prof-cred-save');
    window.handleSave(btn, async function() {
      var licences = self._getSelectedChips('prof-licences').concat(self._getOtherItems('prof-licences'));
      var payments = self._getSelectedChips('prof-payments');
      var paymentsEl = document.getElementById('prof-payments');
      var responseEl = document.getElementById('prof-response-time');
      var warrantyEl = document.getElementById('prof-warranty');
      var complaintsEl = document.getElementById('prof-complaints');
      var afterHoursEl = document.getElementById('prof-after-hours');
      var afterHoursType = afterHoursEl.getAttribute('data-value') || '';
      var afterHoursText = document.getElementById('prof-after-hours-text').value.trim();
      // Skip validation on auto-save — see comment in _saveIdentity.
      if (!autoSave) {
        self._validateMandatory('prof-panel-credentials', [
          { test: function() { return payments.length > 0; }, el: paymentsEl, label: 'Payment Methods (at least one)' },
          { test: function() { return (responseEl.getAttribute('data-value') || '').trim() !== ''; }, el: responseEl, label: 'Response Time' },
          { test: function() { return warrantyEl.value.trim() !== ''; }, el: warrantyEl, label: 'Warranty / Guarantee' },
          { test: function() { return complaintsEl.value.trim() !== ''; }, el: complaintsEl, label: 'Complaints Handling' },
          { test: function() { return afterHoursType.trim() !== ''; }, el: afterHoursEl, label: 'After-Hours Support' }
        ]);
      }
      var updates = {
        licences: licences,
        payment_methods: payments,
        response_time: responseEl.getAttribute('data-value') || '',
        warranty_info: warrantyEl.value.trim(),
        complaints_handling: complaintsEl.value.trim(),
        after_hours_support: { type: afterHoursType, hours_text: afterHoursText }
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  _renderMarketing: function() {
    var body =
      '<div id="prof-mkt-guided"></div>' +
      '<div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border)">' +
        '<div class="profile-label profile-label-heading" style="margin-bottom:8px">Additional Theme Statements <span class="profile-optional">(optional)</span></div>' +
        '<div style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Add separate theme statements to run alongside the marketing theme generated above.</div>' +
        '<div id="prof-mkt-statements"></div>' +
        '<button class="btn btn-outline profile-add-btn" data-action="add-theme-statement" type="button">+ Add Statement</button>' +
        '<div class="profile-save-row" style="margin-top:16px">' +
          '<button id="prof-mkt-statements-save" class="btn-save">Save Statements</button>' +
        '</div>' +
      '</div>';
    document.getElementById('prof-panel-marketing').innerHTML = this._card(
      '\uD83C\uDFA8', '6. Marketing Theme', 'Answer a few questions and the AI will build your marketing theme', body, 'prof-mkt-save'
    );
    document.getElementById('prof-mkt-save').style.display = 'none';
    if (window.BP_MARKETING) {
      window.BP_MARKETING.init(this._supabase, this._userId, this._profile, this);
    }
    var statements = this._getAdditionalStatements();
    this._renderThemeStatementRows(statements);
    var self = this;
    document.getElementById('prof-mkt-statements-save').addEventListener('click', function() {
      self._saveThemeStatements();
    });
  },

  // Additional Theme Statements \u2014 stored inside marketing_theme_extra
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
        '<button class="btn-dismiss" data-action="remove-row" data-target="' + id + '" type="button">Remove</button>' +
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
      '<button class="btn-dismiss" data-action="remove-row" data-target="' + id + '" type="button">Remove</button>';
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
    var btn = document.getElementById('prof-mkt-statements-save');
    window.handleSave(btn, async function() {
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
    }, document.getElementById('prof-save-msg'));
  }
};
