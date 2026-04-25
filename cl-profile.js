window.CL_PROFILE = {
  _supabase: null,
  _userId: null,
  _profile: {},

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
      else if (action === 'add-service') { self._addServiceRow('svc'); }
      else if (action === 'add-product') { self._addServiceRow('prod'); }
      else if (action === 'add-other-item') { self._addOtherItem(btn.dataset.target); }
      else if (action === 'remove-other') { self._removeOtherChip(btn); }
      else if (action === 'remove-svc') { self._removeSvcRow(btn.dataset.target); }
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
    var wrap = document.getElementById('cl-tab-profile');
    wrap.querySelectorAll('.profile-nav-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        wrap.querySelectorAll('.profile-nav-chip').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        wrap.querySelectorAll('.profile-panel').forEach(function(p) { p.classList.remove('active'); });
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

  _v: function(key) {
    var v = this._profile[key];
    return (v === null || v === undefined) ? '' : v;
  },

  _va: function(key) {
    var v = this._profile[key];
    return Array.isArray(v) ? v : [];
  },

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

  _field: function(label, html) {
    return '<div class="profile-field-full"><label class="profile-label">' + label + '</label>' + html + '</div>';
  },

  _field2: function(label, html) {
    return '<div class="profile-field"><label class="profile-label">' + label + '</label>' + html + '</div>';
  },

  _input: function(id, type, val, ph, extra) {
    return '<input id="' + id + '" type="' + type + '" class="profile-input" value="' + window.escHtml(String(val)) + '" placeholder="' + ph + '"' + (extra ? ' ' + extra : '') + ' />';
  },

  _textarea: function(id, val, ph, rows) {
    return '<textarea id="' + id + '" class="profile-textarea" rows="' + (rows || 4) + '" placeholder="' + ph + '">' + window.escHtml(String(val)) + '</textarea>';
  },

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
    return '<div id="' + id + '" class="profile-chip-group">' +
      options.map(function(opt) {
        var isSelected = selected.indexOf(opt) > -1;
        return '<button type="button" class="profile-chip' + (isSelected ? ' selected' : '') + '" data-value="' + window.escHtml(opt) + '">' + window.escHtml(opt) + '</button>';
      }).join('') +
    '</div>';
  },

  _chipGroupWithOther: function(id, options, selected, customItems) {
    if (!Array.isArray(selected)) selected = [];
    if (!Array.isArray(customItems)) customItems = [];
    var standardChips = options.map(function(opt) {
      var isSelected = selected.indexOf(opt) > -1;
      return '<button type="button" class="profile-chip' + (isSelected ? ' selected' : '') + '" data-value="' + window.escHtml(opt) + '">' + window.escHtml(opt) + '</button>';
    }).join('');
    var otherChips = customItems.map(function(item) {
      return '<span class="profile-other-chip">' + window.escHtml(item) +
        '<button type="button" class="profile-other-chip-remove" data-action="remove-other" data-group="' + id + '" data-value="' + window.escHtml(item) + '">\u00D7</button></span>';
    }).join('');
    return '<div id="' + id + '" class="profile-chip-group" data-custom=\'' + window.escHtml(JSON.stringify(customItems)) + '\'>' +
      standardChips +
    '</div>' +
    '<div class="profile-other-wrap">' +
      '<div class="profile-other-chips" id="' + id + '-others">' + otherChips + '</div>' +
      '<div class="profile-other-row">' +
        '<input type="text" class="profile-input" id="' + id + '-other-input" placeholder="Add custom entry" />' +
        '<button type="button" class="btn-outline btn-sm" data-action="add-other-item" data-target="' + id + '">Add</button>' +
      '</div>' +
    '</div>';
  },

  _removeRow: function(id) {
    var el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
  },

  _bindChipToggles: function(container) {
    container.querySelectorAll('.profile-chip-group').forEach(function(group) {
      if (group.dataset.chipBound) return;
      group.dataset.chipBound = '1';
      group.addEventListener('click', function(e) {
        var chip = e.target.closest('.profile-chip');
        if (chip) chip.classList.toggle('selected');
      });
    });
  },

  _getSelectedChips: function(groupId) {
    var group = document.getElementById(groupId);
    if (!group) return [];
    return Array.from(group.querySelectorAll('.profile-chip.selected')).map(function(c) {
      return c.getAttribute('data-value');
    });
  },

  _getOtherItems: function(groupId) {
    var wrap = document.getElementById(groupId + '-others');
    if (!wrap) return [];
    return Array.from(wrap.querySelectorAll('.profile-other-chip')).map(function(c) {
      return c.textContent.replace('\u00D7', '').trim();
    });
  },

  _addOtherItem: function(groupId) {
    var input = document.getElementById(groupId + '-other-input');
    if (!input) return;
    var val = input.value.trim();
    if (!val) return;
    var wrap = document.getElementById(groupId + '-others');
    if (!wrap) return;
    var existing = this._getOtherItems(groupId);
    if (existing.indexOf(val) > -1) { input.value = ''; return; }
    var chip = document.createElement('span');
    chip.className = 'profile-other-chip';
    chip.innerHTML = window.escHtml(val) +
      '<button type="button" class="profile-other-chip-remove" data-action="remove-other" data-group="' + groupId + '" data-value="' + window.escHtml(val) + '">\u00D7</button>';
    wrap.appendChild(chip);
    input.value = '';
  },

  _removeOtherChip: function(btn) {
    var chip = btn.closest('.profile-other-chip');
    if (chip) chip.parentNode.removeChild(chip);
  },

  // ─────────────────────────────────────────────────────────
  // Panel 1: Identity
  // ─────────────────────────────────────────────────────────

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

    var industryChips = this._chipGroup('prof-industries', industries, selectedIndustries);
    var industryWarn = '<div id="prof-industry-warn" class="profile-chip-warn"></div>';

    var body = '<div class="profile-fields">' +
      this._field('Legal Business Name', this._input('prof-biz-name', 'text', this._v('business_name'), 'Your registered business name')) +
      this._field('Trading Name / t/as <span class="profile-optional">(optional)</span>', this._input('prof-trading-name', 'text', this._v('trading_name'), 'Trading name if different from legal name')) +
      this._field2('ABN', this._input('prof-abn', 'text', this._v('abn'), 'xx xxx xxx xxx', 'maxlength="14"')) +
      this._field2('Business Structure', this._dropdown('prof-structure', structures, this._v('business_structure'))) +
      this._field('Industries <span class="profile-optional">(select all that apply)</span>', industryChips + industryWarn) +
      this._field('Business Logo', logoHtml) +
      this._field2('Years in Business', this._input('prof-years', 'number', this._v('years_in_business'), 'e.g. 5', 'min="0" max="200"')) +
    '</div>';

    document.getElementById('prof-panel-identity').innerHTML = this._card('\uD83C\uDFE2', '1. Identity', 'Your registered business details', body, 'prof-id-save');

    var self = this;
    var idPanel = document.getElementById('prof-panel-identity');
    self._bindPhoneTypeDropdowns(idPanel);
    self._bindChipToggles(idPanel);
    self._bindIndustryWarn(selectedIndustries);

    document.getElementById('prof-id-save').addEventListener('click', function() { self._saveIdentity(); });
    document.getElementById('prof-logo-file').addEventListener('change', function(e) { self._uploadLogo(e.target.files[0]); });
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

  _bindIndustryWarn: function(previousIndustries) {
    var self = this;
    var group = document.getElementById('prof-industries');
    if (!group) return;
    group.addEventListener('click', function(e) {
      var chip = e.target.closest('.profile-chip');
      if (!chip) return;
      var val = chip.getAttribute('data-value');
      var wasSelected = previousIndustries.indexOf(val) > -1;
      var isNowDeselected = !chip.classList.contains('selected');
      var warn = document.getElementById('prof-industry-warn');
      if (wasSelected && isNowDeselected) {
        warn.innerHTML = 'Removing <strong>' + window.escHtml(val) + '</strong> will disable it rather than delete it. Existing services, products, and tool outputs linked to this industry will remain intact.';
        warn.classList.add('visible');
      } else {
        warn.classList.remove('visible');
      }
    });
  },

  _uploadLogo: async function(file) {
    if (!file) return;
    var ext = file.name.split('.').pop();
    var path = 'logos/' + this._userId + '.' + ext;
    var up = await this._supabase.storage.from('cl-assets').upload(path, file, { upsert: true });
    if (up.error) { alert('Upload failed: ' + up.error.message); return; }
    var url = this._supabase.storage.from('cl-assets').getPublicUrl(path).data.publicUrl;
    var logoRes = await this._supabase.from('profiles').update({ logo_url: url }).eq('id', this._userId);
    if (logoRes.error) { console.error('[CL Profile] _uploadLogo update error:', logoRes.error.message); return; }
    this._profile.logo_url = url;
    var img = document.getElementById('prof-logo-img');
    if (img.tagName === 'IMG') { img.src = url; }
    else {
      var newImg = document.createElement('img');
      newImg.id = 'prof-logo-img';
      newImg.src = url;
      newImg.className = 'profile-logo-preview';
      newImg.alt = 'Logo';
      img.parentNode.replaceChild(newImg, img);
    }
  },

  _saveIdentity: function() {
    var self = this;
    var btn = document.getElementById('prof-id-save');
    window.handleSave(btn, async function() {
      var industries = self._getSelectedChips('prof-industries');
      if (industries.length === 0) throw new Error('Please select at least one industry.');
      var updates = {
        business_name: document.getElementById('prof-biz-name').value.trim(),
        trading_name: document.getElementById('prof-trading-name').value.trim(),
        abn: document.getElementById('prof-abn').value.trim(),
        business_structure: document.getElementById('prof-structure').getAttribute('data-value') || '',
        industry: industries,
        years_in_business: parseInt(document.getElementById('prof-years').value) || null
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  // ─────────────────────────────────────────────────────────
  // Panel 2: Location & Contact
  // ─────────────────────────────────────────────────────────

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
          '<div><label class="profile-label">State</label><input type="text" class="profile-input loc-state" placeholder="State" value="' + window.escHtml(loc.state || '') + '" /></div>' +
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
  },

  _saveLocation: function() {
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
      var updates = {
        address_name: pb.querySelector('.loc-name').value.trim(),
        address_unit: pb.querySelector('.loc-unit').value.trim(),
        address_street: pb.querySelector('.loc-street').value.trim(),
        address_suburb: pb.querySelector('.loc-suburb').value.trim(),
        address_state: pb.querySelector('.loc-state').value.trim(),
        address_postcode: pb.querySelector('.loc-postcode').value.trim(),
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

  // ─────────────────────────────────────────────────────────
  // Panel 3: Services
  // ─────────────────────────────────────────────────────────

  _renderServices: function() {
    var services = this._vj('bp_services', []);
    var industries = this._va('industry');
    var availableServices = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.getMergedServices(industries) : [];

    var rowsHtml = services.map(function(svc, i) {
      return window.CL_PROFILE._svcRow('svc', i, svc, availableServices);
    }).join('');

    var body = '<div class="profile-fields">' +
      this._field('Services <span class="profile-optional">(add your services with pricing)</span>',
        '<div id="prof-svc-rows">' + rowsHtml + '</div>' +
        '<button class="btn btn-outline profile-add-btn" data-action="add-service">+ Add Service</button>'
      ) +
    '</div>';

    document.getElementById('prof-panel-services').innerHTML = this._card(
      '\uD83D\uDEE0\uFE0F', '3. Services', 'What services your business provides with pricing', body, 'prof-svc-save'
    );

    var self = this;
    document.getElementById('prof-svc-save').addEventListener('click', function() { self._saveServices(); });
    var svcPanel = document.getElementById('prof-panel-services');
    self._bindPhoneTypeDropdowns(svcPanel);
    self._bindSvcDropdowns(svcPanel);
  },

  _svcRow: function(prefix, idx, data, availableItems) {
    data = data || {};
    var pricingTypes = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.pricingTypes : [];
    var pType = data.pricing_type || '';
    var showAmount = pType === 'hourly' || pType === 'fixed';
    var showRange = pType === 'range';

    var itemOpts = availableItems.map(function(s) {
      return '<button type="button" class="lookback-dropdown-item' + (s === data.name ? ' active' : '') + '" data-value="' + window.escHtml(s) + '">' + window.escHtml(s) + '</button>';
    }).join('') + '<button type="button" class="lookback-dropdown-item' + (data.is_custom ? ' active' : '') + '" data-value="__other__">Other (custom)</button>';

    var pTypeOpts = pricingTypes.map(function(pt) {
      return '<button type="button" class="lookback-dropdown-item' + (pt.value === pType ? ' active' : '') + '" data-value="' + pt.value + '">' + window.escHtml(pt.label) + '</button>';
    }).join('');

    var displayName = data.name || 'Select service...';
    var pTypeLabel = pType ? (pricingTypes.find(function(pt) { return pt.value === pType; }) || {}).label || 'Pricing type...' : 'Pricing type...';

    var amountHtml = '';
    if (showAmount) {
      amountHtml = '<input type="number" class="profile-input prof-svc-amount-val" value="' + (data.amount || '') + '" placeholder="$ Amount" min="0" />';
    } else if (showRange) {
      amountHtml = '<input type="number" class="profile-input prof-svc-amount-min" value="' + (data.amount_min || '') + '" placeholder="$ Min" min="0" style="max-width:80px" />' +
        '<input type="number" class="profile-input prof-svc-amount-max" value="' + (data.amount_max || '') + '" placeholder="$ Max" min="0" style="max-width:80px" />';
    }

    var customInput = data.is_custom ? '<input type="text" class="profile-input prof-svc-custom-name" value="' + window.escHtml(data.name || '') + '" placeholder="Enter custom service name" style="margin-top:4px" />' : '';

    return '<div class="profile-svc-row' + (showRange ? ' profile-svc-row-range' : '') + '" id="' + prefix + '-row-' + idx + '">' +
      '<div>' +
        '<span class="lookback-dropdown-wrap">' +
          '<button type="button" class="lookback-dropdown lookback-dropdown-field prof-svc-name" data-value="' + window.escHtml(data.is_custom ? '__other__' : data.name || '') + '">' + window.escHtml(displayName) + '</button>' +
          '<div class="lookback-dropdown-menu">' + itemOpts + '</div>' +
        '</span>' +
        customInput +
      '</div>' +
      '<span class="lookback-dropdown-wrap">' +
        '<button type="button" class="lookback-dropdown lookback-dropdown-field prof-svc-ptype" data-value="' + window.escHtml(pType) + '">' + window.escHtml(pTypeLabel) + '</button>' +
        '<div class="lookback-dropdown-menu">' + pTypeOpts + '</div>' +
      '</span>' +
      amountHtml +
      '<button class="profile-svc-remove" data-action="remove-svc" data-target="' + prefix + '-row-' + idx + '">\u00D7</button>' +
    '</div>';
  },

  _addServiceRow: function(prefix) {
    var container = document.getElementById('prof-' + prefix + '-rows');
    if (!container) return;
    var idx = container.querySelectorAll('.profile-svc-row').length;
    var industries = this._va('industry');
    var items = prefix === 'svc'
      ? (window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.getMergedServices(industries) : [])
      : (window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.getMergedProducts(industries) : []);
    var div = document.createElement('div');
    div.innerHTML = this._svcRow(prefix, idx, {}, items);
    container.appendChild(div.firstChild);
    this._bindPhoneTypeDropdowns(container);
    this._bindSvcDropdowns(container);
  },

  _removeSvcRow: function(id) {
    var el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
  },

  _bindSvcDropdowns: function(container) {
    var self = this;
    container.querySelectorAll('.lookback-dropdown-wrap').forEach(function(wrap) {
      if (wrap.dataset.svcBound) return;
      wrap.dataset.svcBound = '1';
      var trigger = wrap.querySelector('.lookback-dropdown');
      var menu = wrap.querySelector('.lookback-dropdown-menu');
      if (!trigger || !menu) return;

      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelectorAll('.lookback-dropdown-menu.open').forEach(function(m) { if (m !== menu) m.classList.remove('open'); });
        menu.classList.toggle('open');
        trigger.classList.toggle('active');
      });

      menu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var val = item.getAttribute('data-value');
          trigger.setAttribute('data-value', val);
          trigger.textContent = val === '__other__' ? 'Other (custom)' : val;
          menu.querySelectorAll('.lookback-dropdown-item').forEach(function(it) { it.classList.remove('active'); });
          item.classList.add('active');
          menu.classList.remove('open');
          trigger.classList.remove('active');

          if (trigger.classList.contains('prof-svc-name') && val === '__other__') {
            var row = trigger.closest('.profile-svc-row');
            if (row && !row.querySelector('.prof-svc-custom-name')) {
              var inp = document.createElement('input');
              inp.type = 'text';
              inp.className = 'profile-input prof-svc-custom-name';
              inp.placeholder = 'Enter custom name';
              inp.style.marginTop = '4px';
              trigger.closest('div').appendChild(inp);
            }
          } else if (trigger.classList.contains('prof-svc-name')) {
            var row2 = trigger.closest('.profile-svc-row');
            var cust = row2 ? row2.querySelector('.prof-svc-custom-name') : null;
            if (cust) cust.parentNode.removeChild(cust);
          }

          if (trigger.classList.contains('prof-svc-ptype')) {
            self._updatePricingFields(trigger.closest('.profile-svc-row'), val);
          }
        });
      });
    });
  },

  _updatePricingFields: function(row, pType) {
    var existingAmounts = row.querySelectorAll('.prof-svc-amount-val, .prof-svc-amount-min, .prof-svc-amount-max');
    existingAmounts.forEach(function(el) { el.parentNode.removeChild(el); });

    var removeBtn = row.querySelector('.profile-svc-remove');
    if (pType === 'hourly' || pType === 'fixed') {
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'profile-input prof-svc-amount-val';
      inp.placeholder = '$ Amount';
      inp.min = '0';
      row.insertBefore(inp, removeBtn);
      row.classList.remove('profile-svc-row-range');
    } else if (pType === 'range') {
      var min = document.createElement('input');
      min.type = 'number';
      min.className = 'profile-input prof-svc-amount-min';
      min.placeholder = '$ Min';
      min.min = '0';
      min.style.maxWidth = '80px';
      var max = document.createElement('input');
      max.type = 'number';
      max.className = 'profile-input prof-svc-amount-max';
      max.placeholder = '$ Max';
      max.min = '0';
      max.style.maxWidth = '80px';
      row.insertBefore(min, removeBtn);
      row.insertBefore(max, removeBtn);
      row.classList.add('profile-svc-row-range');
    } else {
      row.classList.remove('profile-svc-row-range');
    }
  },

  _collectSvcRows: function(prefix) {
    var container = document.getElementById('prof-' + prefix + '-rows');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.profile-svc-row')).map(function(row) {
      var nameBtn = row.querySelector('.prof-svc-name');
      var pTypeBtn = row.querySelector('.prof-svc-ptype');
      var rawName = nameBtn ? nameBtn.getAttribute('data-value') : '';
      var isCustom = rawName === '__other__';
      var customInput = row.querySelector('.prof-svc-custom-name');
      var name = isCustom ? (customInput ? customInput.value.trim() : '') : rawName;
      if (!name) return null;
      var pType = pTypeBtn ? pTypeBtn.getAttribute('data-value') : '';
      var amountVal = row.querySelector('.prof-svc-amount-val');
      var amountMin = row.querySelector('.prof-svc-amount-min');
      var amountMax = row.querySelector('.prof-svc-amount-max');
      return {
        name: name,
        pricing_type: pType,
        amount: amountVal ? parseFloat(amountVal.value) || null : null,
        amount_min: amountMin ? parseFloat(amountMin.value) || null : null,
        amount_max: amountMax ? parseFloat(amountMax.value) || null : null,
        is_custom: isCustom
      };
    }).filter(function(r) { return r !== null; });
  },

  _saveServices: function() {
    var self = this;
    var btn = document.getElementById('prof-svc-save');
    window.handleSave(btn, async function() {
      var services = self._collectSvcRows('svc');
      var updates = { bp_services: services };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  // ─────────────────────────────────────────────────────────
  // Panel 4: Products
  // ─────────────────────────────────────────────────────────

  _renderProducts: function() {
    var products = this._vj('bp_products', []);
    var industries = this._va('industry');
    var availableProducts = window.BP_INDUSTRY_DATA ? window.BP_INDUSTRY_DATA.getMergedProducts(industries) : [];

    var rowsHtml = products.map(function(prod, i) {
      return window.CL_PROFILE._svcRow('prod', i, prod, availableProducts);
    }).join('');

    var body = '<div class="profile-fields">' +
      this._field('Products <span class="profile-optional">(add your products with pricing)</span>',
        '<div id="prof-prod-rows">' + rowsHtml + '</div>' +
        '<button class="btn btn-outline profile-add-btn" data-action="add-product">+ Add Product</button>'
      ) +
    '</div>';

    document.getElementById('prof-panel-products').innerHTML = this._card(
      '\uD83D\uDCE6', '4. Products', 'What products your business sells with pricing', body, 'prof-prod-save'
    );

    var self = this;
    document.getElementById('prof-prod-save').addEventListener('click', function() { self._saveProducts(); });
    var prodPanel = document.getElementById('prof-panel-products');
    self._bindPhoneTypeDropdowns(prodPanel);
    self._bindSvcDropdowns(prodPanel);
  },

  _saveProducts: function() {
    var self = this;
    var btn = document.getElementById('prof-prod-save');
    window.handleSave(btn, async function() {
      var products = self._collectSvcRows('prod');
      var updates = { bp_products: products };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  // ─────────────────────────────────────────────────────────
  // Panel 5: Credentials & Support
  // ─────────────────────────────────────────────────────────

  _renderCredentials: function() {
    var licenceOpts = [
      'Builder\u2019s Licence', 'Electrical Licence', 'Plumbing Licence',
      'Gas Fitting Licence', 'Refrigerant Handling Licence', 'Practising Certificate',
      'CPA / CA', 'ISO Certification', 'Safety Certification',
      'Asbestos Removal Licence', 'White Card', 'Working at Heights'
    ];
    var selectedLicences = this._va('licences');
    var customLicences = selectedLicences.filter(function(l) { return licenceOpts.indexOf(l) === -1; });
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

    document.getElementById('prof-cred-save').addEventListener('click', function() { self._saveCredentials(); });

    var afterHoursBtn = document.getElementById('prof-after-hours');
    if (afterHoursBtn) {
      var observer = new MutationObserver(function() {
        var val = afterHoursBtn.getAttribute('data-value');
        var textField = document.getElementById('prof-after-hours-text');
        if (textField) textField.style.display = val === 'Available' ? '' : 'none';
      });
      observer.observe(afterHoursBtn, { attributes: true, attributeFilter: ['data-value'] });
    }
  },

  _saveCredentials: function() {
    var self = this;
    var btn = document.getElementById('prof-cred-save');
    window.handleSave(btn, async function() {
      var licences = self._getSelectedChips('prof-licences').concat(self._getOtherItems('prof-licences'));
      var payments = self._getSelectedChips('prof-payments');
      var afterHoursType = document.getElementById('prof-after-hours').getAttribute('data-value') || '';
      var afterHoursText = document.getElementById('prof-after-hours-text').value.trim();
      var updates = {
        licences: licences,
        payment_methods: payments,
        response_time: document.getElementById('prof-response-time').getAttribute('data-value') || '',
        warranty_info: document.getElementById('prof-warranty').value.trim(),
        complaints_handling: document.getElementById('prof-complaints').value.trim(),
        after_hours_support: { type: afterHoursType, hours_text: afterHoursText }
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  // ─────────────────────────────────────────────────────────
  // Panel 6: Marketing Theme
  // ─────────────────────────────────────────────────────────

  _renderMarketing: function() {
    var p = this._profile;
    var extras = Array.isArray(p.marketing_theme_extra) ? p.marketing_theme_extra : [];
    var extraRowsHtml = extras.slice(1).map(function(item, i) {
      return '<div class="profile-repeating-row" id="prof-extra-' + i + '">' +
        '<input type="text" class="profile-input prof-extra-input" value="' + window.escHtml(item) + '" placeholder="Additional theme statement" />' +
        '<button class="btn btn-outline btn-sm" data-action="remove-row" data-target="prof-extra-' + i + '">Remove</button>' +
      '</div>';
    }).join('');
    var body = '<div class="profile-fields">' +
      this._field('What do you want your customers to know about your business?',
        this._textarea('prof-theme-aware', this._v('marketing_theme_awareness'), 'e.g. A family-owned business serving the local community for over 15 years with honest, reliable service', 3)) +
      this._field('What sets you apart from your competitors?',
        this._textarea('prof-theme-diff', this._v('marketing_theme_differentiators'), 'e.g. Same-day service, upfront pricing, and a 100% satisfaction guarantee', 3)) +
      this._field('What feeling do you want customers to have when they interact with you?',
        this._textarea('prof-theme-feel', this._v('marketing_theme_feeling'), 'e.g. Confident, reassured, and well looked after', 3)) +
      this._field('Additional Theme Statements <span class="profile-optional">(optional)</span>',
        '<input type="text" id="prof-extra-primary" class="profile-input profile-input-mb" value="' + window.escHtml(extras[0] || '') + '" placeholder="Additional theme statement" />' +
        '<div id="prof-extras-extra">' + extraRowsHtml + '</div>'
      ) +
    '</div>' +
    '<button class="btn btn-outline profile-btn-add-statement" data-action="add-extra">+ Add Statement</button>';
    document.getElementById('prof-panel-marketing').innerHTML = this._card(
      '\uD83C\uDFA8', '6. Marketing Theme', 'These answers personalise your outputs across every StaxAI tool', body, 'prof-mkt-save'
    );
    var self = this;
    document.getElementById('prof-mkt-save').addEventListener('click', function() { self._saveMarketing(); });
  },

  _addExtra: function() {
    var wrap = document.getElementById('prof-extras-extra');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-repeating-row').length + 1;
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = 'prof-extra-' + i;
    d.innerHTML = '<input type="text" class="profile-input prof-extra-input" placeholder="Additional theme statement" />' +
      '<button class="btn btn-outline btn-sm" data-action="remove-row" data-target="prof-extra-' + i + '">Remove</button>';
    wrap.appendChild(d);
  },

  _saveMarketing: function() {
    var self = this;
    var statements = [];
    var primary = document.getElementById('prof-extra-primary');
    if (primary && primary.value.trim()) statements.push(primary.value.trim());
    Array.from(document.querySelectorAll('#prof-extras-extra .prof-extra-input')).forEach(function(el) {
      if (el.value.trim()) statements.push(el.value.trim());
    });
    var btn = document.getElementById('prof-mkt-save');
    window.handleSave(btn, async function() {
      var updates = {
        marketing_theme_awareness: document.getElementById('prof-theme-aware').value.trim(),
        marketing_theme_differentiators: document.getElementById('prof-theme-diff').value.trim(),
        marketing_theme_feeling: document.getElementById('prof-theme-feel').value.trim(),
        marketing_theme_extra: statements
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  }
};
