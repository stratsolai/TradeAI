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
    });
  },

  _shell: function() {
    return '<div class="profile-wrap">' +
      '<div class="profile-nav-chips">' +
        '<button class="profile-nav-chip active" data-ptab="identity">1. Identity</button>' +
        '<button class="profile-nav-chip" data-ptab="location">2. Location &amp; Contact</button>' +
        '<button class="profile-nav-chip" data-ptab="details">3. Business Details</button>' +
        '<button class="profile-nav-chip" data-ptab="marketing">4. Marketing Theme</button>' +
      '</div>' +
      '<div id="prof-panel-identity" class="profile-panel active"></div>' +
      '<div id="prof-panel-location" class="profile-panel"></div>' +
      '<div id="prof-panel-details" class="profile-panel"></div>' +
      '<div id="prof-panel-marketing" class="profile-panel"></div>' +
    '</div>';
  },

  _bindTabs: function() {
    var wrap = document.getElementById('cl-tab-profile');
    wrap.querySelectorAll('.profile-nav-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        wrap.querySelectorAll('.profile-nav-chip').forEach(function(b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        wrap.querySelectorAll('.profile-panel').forEach(function(p) {
          p.classList.remove('active');
        });
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
    this._renderDetails();
    this._renderMarketing();
  },

  _v: function(key) {
    var v = this._profile[key];
    return (v === null || v === undefined) ? '' : v;
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

  _removeRow: function(id) {
    var el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
  },

  _renderIdentity: function() {
    var p = this._profile;
    var structures = ['Sole Trader', 'Partnership', 'Company', 'Trust', 'Other'];
    var industries = ['Building & Construction', 'Electrical & Solar', 'Plumbing & Gas', 'HVAC & Refrigeration', 'Landscaping & Outdoor', 'Painting & Finishing', 'Fabrication & Manufacturing', 'Cleaning & Maintenance', 'Service & Professional'];
    var logoHtml = '<div class="profile-logo-wrap">' +
      (p.logo_url ? '<img id="prof-logo-img" src="' + window.escHtml(p.logo_url) + '" class="profile-logo-preview" alt="Logo" />' : '<div id="prof-logo-img" class="profile-logo-placeholder">No logo</div>') +
      '<input id="prof-logo-file" type="file" accept="image/*" class="profile-file-input" />' +
      '<button class="btn btn-outline" data-action="upload-logo">Upload Logo</button>' +
    '</div>';
    var body = '<div class="profile-fields">' +
      this._field('Legal Business Name', this._input('prof-biz-name', 'text', this._v('business_name'), 'Your registered business name')) +
      this._field('Trading Name / t/as <span class="profile-optional">(optional)</span>', this._input('prof-trading-name', 'text', this._v('trading_name'), 'Trading name if different from legal name')) +
      this._field2('ABN', this._input('prof-abn', 'text', this._v('abn'), 'xx xxx xxx xxx', 'maxlength="14"')) +
      this._field2('Business Structure', this._dropdown('prof-structure', structures, this._v('business_structure'))) +
      this._field2('Industry', this._dropdown('prof-industry', industries, this._v('industry'))) +
      this._field('Business Logo', logoHtml) +
    '</div>';
    document.getElementById('prof-panel-identity').innerHTML = this._card('\uD83C\uDFE2', '1. Identity', 'Your registered business details', body, 'prof-id-save');
    var self = this;
    var idBtn = document.getElementById('prof-id-save');
    if (idBtn) idBtn.addEventListener('click', function() { self._saveIdentity(); });
    var idPanel = document.getElementById('prof-panel-identity');
    if (idPanel) self._bindPhoneTypeDropdowns(idPanel);
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
    if (img) img.src = url;
  },

  _saveIdentity: function() {
    var self = this;
    var btn = document.getElementById('prof-id-save');
    window.handleSave(btn, async function() {
      var updates = { business_name: document.getElementById('prof-biz-name').value.trim(), trading_name: document.getElementById('prof-trading-name').value.trim(), abn: document.getElementById('prof-abn').value.trim(), business_structure: document.getElementById('prof-structure').getAttribute('data-value') || '', industry: document.getElementById('prof-industry').getAttribute('data-value') || '' };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

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
    var body =
      this._locationBlock(primaryLoc, 0, true) +
      '<div id="prof-extra-locs">' + extraLocsHtml + '</div>' +
      '<button class="btn btn-outline profile-btn-add-location" data-action="add-location">+ Add Location</button>' +
      '<div class="profile-location-block profile-location-block-websites">' +
        '<div class="profile-label profile-label-heading">Website URL(s)</div>' +
        '<input type="url" id="prof-site-primary" class="profile-input profile-input-mb" value="' + window.escHtml(sites[0] || '') + '" placeholder="https://yoursite.com.au" />' +
        '<div id="prof-sites-extra">' + extraSitesHtml + '</div>' +
        '<button class="btn btn-outline profile-btn-add-website" data-action="add-site">+ Add Website</button>' +
      '</div>';
    document.getElementById('prof-panel-location').innerHTML = this._card(
      '\uD83D\uDCCD', '2. Location &amp; Contact', 'Where you operate and how to reach you', body, 'prof-loc-save'
    );
    var self2 = this;
    var locBtn = document.getElementById('prof-loc-save');
    if (locBtn) locBtn.addEventListener('click', function() { self2._saveLocation(); });
    var locPanel = document.getElementById('prof-panel-location');
    if (locPanel) {
      self2._wirePhoneFormat(locPanel);
      self2._bindPhoneTypeDropdowns(locPanel);
    }
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.lookback-dropdown-wrap')) {
        document.querySelectorAll('#cl-tab-profile .lookback-dropdown-menu.open').forEach(function(m) { m.classList.remove('open'); });
        document.querySelectorAll('#cl-tab-profile .lookback-dropdown.active').forEach(function(b) { b.classList.remove('active'); });
      }
    });
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
  },

  _saveLocation: function() {
    // Read primary location
    var pb = document.getElementById('loc-primary-block');
    var primaryPhones = Array.from(pb.querySelectorAll('#loc-p-phones .profile-repeating-row')).map(function(row) {
      return { type: row.querySelector('.loc-phone-type').getAttribute('data-value') || 'Mobile', number: row.querySelector('.loc-phone-number').value.trim() };
    }).filter(function(ph) { return ph.number; });
    // Read extra locations
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
    // Read websites
    var sites = [];
    var primary = document.getElementById('prof-site-primary');
    if (primary && primary.value.trim()) sites.push(primary.value.trim());
    Array.from(document.querySelectorAll('#prof-sites-extra .prof-add-site')).forEach(function(el) {
      if (el.value.trim()) sites.push(el.value.trim());
    });
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
        website_urls: sites
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  _renderDetails: function() {
    var empRanges = ['1', '2-5', '6-10', '11-20', '21-50', '50+'];
    var body = '<div class="profile-fields">' +
      this._field('Services Provided', this._textarea('prof-services', this._v('services'), 'Describe the services your business provides', 4)) +
      this._field('Products Offered <span class="profile-optional">(optional)</span>', this._textarea('prof-products', this._v('products'), 'Describe any products your business sells', 3)) +
      this._field2('Number of Employees', this._dropdown('prof-emp-range', empRanges, this._v('employee_range'))) +
      this._field2('Years in Business', this._input('prof-years', 'number', this._v('years_in_business'), 'e.g. 5', 'min="0" max="200" class="profile-input-narrow"')) +
    '</div>';
    document.getElementById('prof-panel-details').innerHTML = this._card('\uD83D\uDCC4', '3. Business Details', 'What your business does and how it operates', body, 'prof-det-save');
    var self3 = this;
    var detBtn = document.getElementById('prof-det-save');
    if (detBtn) detBtn.addEventListener('click', function() { self3._saveDetails(); });
    var detPanel = document.getElementById('prof-panel-details');
    if (detPanel) self3._bindPhoneTypeDropdowns(detPanel);
  },

  _saveDetails: function() {
    var self = this;
    var btn = document.getElementById('prof-det-save');
    window.handleSave(btn, async function() {
      var updates = { services: document.getElementById('prof-services').value.trim(), products: document.getElementById('prof-products').value.trim(), employee_range: document.getElementById('prof-emp-range').getAttribute('data-value') || '', years_in_business: parseInt(document.getElementById('prof-years').value) || null };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
    }, document.getElementById('prof-save-msg'));
  },

  _renderMarketing: function() {
    var p = this._profile;
    var extras = Array.isArray(p.marketing_theme_extra) ? p.marketing_theme_extra : [];
    var extraRowsHtml = extras.map(function(item, i) {
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
      '\uD83C\uDFA8', '4. Marketing Theme', 'These answers personalise your outputs across every StaxAI tool', body, 'prof-mkt-save'
    );
    var mktBtn = document.getElementById('prof-mkt-save');
    if (mktBtn) { var self4 = this; mktBtn.addEventListener('click', function() { self4._saveMarketing(); }); }
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
