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
    this._load();
  },

  _shell: function() {
    return '<div class="profile-wrap">' +
      '<div class="profile-nav-chips">' +
        '<button class="profile-nav-chip active" data-ptab="identity" style="border-left-color:#1A5490;">1. Identity</button>' +
        '<button class="profile-nav-chip" data-ptab="location" style="border-left-color:#c4622a;">2. Location &amp; Contact</button>' +
        '<button class="profile-nav-chip" data-ptab="details" style="border-left-color:#28a745;">3. Business Details</button>' +
        '<button class="profile-nav-chip" data-ptab="marketing" style="border-left-color:#7b2d8b;">4. Marketing Theme</button>' +
      '</div>' +
      '<div id="prof-panel-identity" class="profile-panel"></div>' +
      '<div id="prof-panel-location" class="profile-panel" style="display:none"></div>' +
      '<div id="prof-panel-details" class="profile-panel" style="display:none"></div>' +
      '<div id="prof-panel-marketing" class="profile-panel" style="display:none"></div>' +
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
          p.style.display = 'none';
        });
        document.getElementById('prof-panel-' + btn.dataset.ptab).style.display = '';
      });
    });
  },

  _load: async function() {
    var sess = await this._supabase.auth.getSession();
    if (!sess.data.session) return;
    this._userId = sess.data.session.user.id;
    var res = await this._supabase.from('profiles').select('*').eq('id', this._userId).single();
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

  _save: async function(updates, btnId) {
    var btn = document.getElementById(btnId);
    if (btn) btn.textContent = 'Saving...';
    var res = await this._supabase.from('profiles').update(updates).eq('id', this._userId);
    if (!btn) return;
    if (res.error) {
      btn.textContent = 'Error saving';
    } else {
      Object.assign(this._profile, updates);
      btn.textContent = 'Saved \u2713';
      setTimeout(function() { if (btn) btn.textContent = 'Save'; }, 2000);
    }
  },

  _card: function(icon, title, subtitle, body, btnId, fn) {
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
        '<button id="' + btnId + '" class="btn btn-primary" onclick="window.CL_PROFILE.' + fn + '()">Save</button>' +
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

  _select: function(id, opts, sel) {
    var o = opts.map(function(v) {
      return '<option value="' + window.escHtml(v) + '"' + (sel === v ? ' selected' : '') + '>' + window.escHtml(v) + '</option>';
    }).join('');
    return '<select id="' + id + '" class="profile-select"><option value="">Select...</option>' + o + '</select>';
  },

  _removeRow: function(id) {
    var el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
  },

  _renderIdentity: function() {
    var p = this._profile;
    var structures = ['Sole Trader', 'Partnership', 'Company', 'Trust', 'Other'];
    var logoHtml = '<div class="profile-logo-wrap">' +
      (p.logo_url ? '<img id="prof-logo-img" src="' + window.escHtml(p.logo_url) + '" class="profile-logo-preview" alt="Logo" />' : '<div id="prof-logo-img" class="profile-logo-placeholder">No logo</div>') +
      '<input id="prof-logo-file" type="file" accept="image/*" class="profile-file-input" />' +
      '<button class="btn btn-outline" onclick="document.getElementById(\'prof-logo-file\').click()">Upload Logo</button>' +
    '</div>';
    var body = '<div class="profile-fields">' +
      this._field('Legal Business Name', this._input('prof-biz-name', 'text', this._v('business_name'), 'Your registered business name')) +
      this._field('Trading Name / t/as <span class="profile-optional">(optional)</span>', this._input('prof-trading-name', 'text', this._v('trading_name'), 'Trading name if different from legal name')) +
      this._field2('ABN', this._input('prof-abn', 'text', this._v('abn'), 'xx xxx xxx xxx', 'maxlength="14"')) +
      this._field2('Business Structure', this._select('prof-structure', structures, this._v('business_structure'))) +
      this._field('Industry / Profession', this._input('prof-industry', 'text', this._v('industry'), 'e.g. Plumbing, Accounting, Landscaping')) +
      this._field('Business Logo', logoHtml) +
    '</div>';
    document.getElementById('prof-panel-identity').innerHTML = this._card('\uD83C\uDFE2', '1. Identity', 'Your registered business details', body, 'prof-id-save', '_saveIdentity');
    var self = this;
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
    await this._supabase.from('profiles').update({ logo_url: url }).eq('id', this._userId);
    this._profile.logo_url = url;
    var img = document.getElementById('prof-logo-img');
    if (img) img.src = url;
  },

  _saveIdentity: function() {
    this._save({ business_name: document.getElementById('prof-biz-name').value.trim(), trading_name: document.getElementById('prof-trading-name').value.trim(), abn: document.getElementById('prof-abn').value.trim(), business_structure: document.getElementById('prof-structure').value, industry: document.getElementById('prof-industry').value.trim() }, 'prof-id-save');
  },

    _locationBlock: function(loc, idx, isPrimary) {
    var idPfx = isPrimary ? 'loc-p' : 'loc-' + idx;
    var nameVal = loc.name || '';
    var phones = Array.isArray(loc.phones) ? loc.phones : (loc.phone ? [{ type: 'Main', number: loc.phone }] : [{ type: 'Main', number: '' }]);
    var typeOpts = ['Main', 'Mobile', 'Secondary Landline', 'Fax', 'After Hours'];
    var phonesHtml = phones.map(function(ph, pi) {
      var typeSelect = '<select class="profile-select loc-phone-type" style="width:160px;flex-shrink:0;">' +
        typeOpts.map(function(t) { return '<option value="' + t + '"' + (ph.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
      '</select>';
      return '<div class="profile-repeating-row" id="' + idPfx + '-ph-' + pi + '">' +
        typeSelect +
        '<input type="text" class="profile-input loc-phone-number" value="' + window.escHtml(ph.number || '') + '" placeholder="Phone number" />' +
        '<button class="btn btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'' + idPfx + '-ph-' + pi + '\')">Remove</button>' +
      '</div>';
    }).join('');
    var removeBtn = isPrimary ? '' :
      '<button class="btn btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'loc-block-' + idx + '\')">Remove Location</button>';
    return '<div class="profile-location-block" id="' + (isPrimary ? 'loc-primary-block' : 'loc-block-' + idx) + '">' +
      '<div class="profile-location-row-header">' +
        '<strong style="color:#1A5490;">' + (isPrimary ? 'Primary Location' : 'Location ' + (idx + 2)) + '</strong>' +
        removeBtn +
      '</div>' +
      '<div class="profile-fields" style="margin-bottom:12px;">' +
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
      '<div class="profile-label" style="margin-bottom:8px;">Phone Numbers</div>' +
      '<div class="loc-phones-wrap" id="' + idPfx + '-phones">' + phonesHtml + '</div>' +
      '<button class="btn btn-outline" style="border-left-color:#c4622a;margin-top:4px;" onclick="window.CL_PROFILE._addPhone(\'' + idPfx + '\')">+ Add Phone</button>' +
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
      phones: Array.isArray(p.primary_phones) ? p.primary_phones : (p.phone ? [{ type: 'Main', number: p.phone }] : [{ type: 'Main', number: '' }])
    };
    var extraLocs = Array.isArray(p.additional_locations) ? p.additional_locations : [];
    var sites = Array.isArray(p.website_urls) ? p.website_urls : [];
    var extraLocsHtml = extraLocs.map(function(loc, i) {
      return window.CL_PROFILE._locationBlock(loc, i, false);
    }).join('');
    var extraSitesHtml = sites.slice(1).map(function(u, i) {
      return '<div class="profile-repeating-row" id="prof-site-' + (i + 1) + '">' +
        '<input type="url" class="profile-input prof-add-site" value="' + window.escHtml(u) + '" placeholder="https://yoursite.com.au" />' +
        '<button class="btn btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-site-' + (i + 1) + '\')">Remove</button>' +
      '</div>';
    }).join('');
    var body =
      this._locationBlock(primaryLoc, 0, true) +
      '<div id="prof-extra-locs">' + extraLocsHtml + '</div>' +
      '<button class="btn btn-outline" style="margin-top:12px;margin-bottom:24px;" onclick="window.CL_PROFILE._addLocation()">+ Add Location</button>' +
      '<div class="profile-section-card" style="margin-top:0;border-left-color:#c4622a;">' +
        '<div class="profile-label" style="margin-bottom:8px;">Website URL(s)</div>' +
        '<input type="url" id="prof-site-primary" class="profile-input" value="' + window.escHtml(sites[0] || '') + '" placeholder="https://yoursite.com.au" style="margin-bottom:8px;" />' +
        '<div id="prof-sites-extra">' + extraSitesHtml + '</div>' +
        '<button class="btn btn-outline" style="border-left-color:#c4622a;margin-top:8px;" onclick="window.CL_PROFILE._addSite()">+ Add Website</button>' +
      '</div>';
    document.getElementById('prof-panel-location').innerHTML = this._card(
      '\uD83D\uDCCD', '2. Location &amp; Contact', 'Where you operate and how to reach you', body, 'prof-loc-save', '_saveLocation'
    );
  },

  _addPhone: function(idPfx) {
    var wrap = document.getElementById(idPfx + '-phones');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-repeating-row').length;
    var typeOpts = ['Main', 'Mobile', 'Secondary Landline', 'Fax', 'After Hours'];
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = idPfx + '-ph-' + i;
    d.innerHTML = '<select class="profile-select loc-phone-type" style="width:160px;flex-shrink:0;">' +
      typeOpts.map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') +
    '</select>' +
    '<input type="text" class="profile-input loc-phone-number" placeholder="Phone number" />' +
    '<button class="btn btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'' + idPfx + '-ph-' + i + '\')">Remove</button>';
    wrap.appendChild(d);
  },

  _addSite: function() {
    var wrap = document.getElementById('prof-sites-extra');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-repeating-row').length + 1;
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = 'prof-site-' + i;
    d.innerHTML = '<input type="url" class="profile-input prof-add-site" placeholder="https://yoursite.com.au" />' +
      '<button class="btn btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-site-' + i + '\')">Remove</button>';
    wrap.appendChild(d);
  },

  _addLocation: function() {
    var wrap = document.getElementById('prof-extra-locs');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-location-block').length;
    var emptyLoc = { name: '', unit: '', street: '', suburb: '', state: '', postcode: '', phones: [{ type: 'Main', number: '' }] };
    var div = document.createElement('div');
    div.innerHTML = window.CL_PROFILE._locationBlock(emptyLoc, i, false);
    wrap.appendChild(div.firstChild);
  },

  _saveLocation: function() {
    // Read primary location
    var pb = document.getElementById('loc-primary-block');
    var primaryPhones = Array.from(pb.querySelectorAll('#loc-p-phones .profile-repeating-row')).map(function(row) {
      return { type: row.querySelector('.loc-phone-type').value, number: row.querySelector('.loc-phone-number').value.trim() };
    }).filter(function(ph) { return ph.number; });
    // Read extra locations
    var extraBlocks = document.querySelectorAll('#prof-extra-locs .profile-location-block');
    var locs = Array.from(extraBlocks).map(function(b, i) {
      var idPfx = 'loc-' + i;
      var phones = Array.from(b.querySelectorAll('#' + idPfx + '-phones .profile-repeating-row')).map(function(row) {
        return { type: row.querySelector('.loc-phone-type').value, number: row.querySelector('.loc-phone-number').value.trim() };
      }).filter(function(ph) { return ph.number; });
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
    this._save({
      address_name: pb.querySelector('.loc-name').value.trim(),
      address_unit: pb.querySelector('.loc-unit').value.trim(),
      address_street: pb.querySelector('.loc-street').value.trim(),
      address_suburb: pb.querySelector('.loc-suburb').value.trim(),
      address_state: pb.querySelector('.loc-state').value.trim(),
      address_postcode: pb.querySelector('.loc-postcode').value.trim(),
      primary_phones: primaryPhones,
      phone: primaryPhones.length ? primaryPhones[0].number : '',
      additional_locations: locs,
      website_urls: sites
    }, 'prof-loc-save');
  },

  _renderDetails: function() {
    var empRanges = ['1', '2-5', '6-10', '11-20', '21-50', '50+'];
    var body = '<div class="profile-fields">' +
      this._field('Services Provided', this._textarea('prof-services', this._v('services'), 'Describe the services your business provides', 4)) +
      this._field('Products Offered <span class="profile-optional">(optional)</span>', this._textarea('prof-products', this._v('products'), 'Describe any products your business sells', 3)) +
      this._field2('Number of Employees', this._select('prof-emp-range', empRanges, this._v('employee_range'))) +
      this._field2('Years in Business', this._input('prof-years', 'number', this._v('years_in_business'), 'e.g. 5', 'min="0" max="200" style="max-width:120px;"')) +
    '</div>';
    document.getElementById('prof-panel-details').innerHTML = this._card('\uD83D\uDCC4', '3. Business Details', 'What your business does and how it operates', body, 'prof-det-save', '_saveDetails');
  },

  _saveDetails: function() {
    this._save({ services: document.getElementById('prof-services').value.trim(), products: document.getElementById('prof-products').value.trim(), employee_range: document.getElementById('prof-emp-range').value, years_in_business: parseInt(document.getElementById('prof-years').value) || null }, 'prof-det-save');
  },

  _renderMarketing: function() {
    var p = this._profile;
    var extras = Array.isArray(p.marketing_theme_extra) ? p.marketing_theme_extra : [];
    var extraRowsHtml = extras.map(function(item, i) {
      return '<div class="profile-repeating-row" id="prof-extra-' + i + '">' +
        '<input type="text" class="profile-input prof-extra-input" value="' + window.escHtml(item) + '" placeholder="Additional theme statement" />' +
        '<button class="btn btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-extra-' + i + '\')">Remove</button>' +
      '</div>';
    }).join('');
    var body = '<div class="profile-fields">' +
      this._field('What do you want your customers to know about your business?',
        this._textarea('prof-theme-aware', this._v('marketing_theme_awareness'), 'e.g. We have been serving our local community for over 15 years with honest, reliable service', 3)) +
      this._field('What sets you apart from your competitors?',
        this._textarea('prof-theme-diff', this._v('marketing_theme_differentiators'), 'e.g. Same-day service, upfront pricing, and a 100% satisfaction guarantee', 3)) +
      this._field('What feeling do you want customers to have when they interact with you?',
        this._textarea('prof-theme-feel', this._v('marketing_theme_feeling'), 'e.g. Confident, reassured, and well looked after', 3)) +
      this._field('Additional Theme Statements <span class="profile-optional">(optional)</span>',
        '<input type="text" id="prof-extra-primary" class="profile-input" value="' + window.escHtml(extras[0] || '') + '" placeholder="Additional theme statement" style="margin-bottom:8px;" />' +
        '<div id="prof-extras-extra">' + extraRowsHtml + '</div>'
      ) +
    '</div>' +
    '<button class="btn btn-outline" style="border-left-color:#7b2d8b;margin-top:8px;" onclick="window.CL_PROFILE._addExtra()">+ Add Statement</button>';
    document.getElementById('prof-panel-marketing').innerHTML = this._card(
      '\uD83C\uDFA8', '4. Marketing Theme', 'These answers personalise your outputs across every StaxAI tool', body, 'prof-mkt-save', '_saveMarketing'
    );
  },

  _addExtra: function() {
    var wrap = document.getElementById('prof-extras-extra');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-repeating-row').length + 1;
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = 'prof-extra-' + i;
    d.innerHTML = '<input type="text" class="profile-input prof-extra-input" placeholder="Additional theme statement" />' +
      '<button class="btn btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-extra-' + i + '\')">Remove</button>';
    wrap.appendChild(d);
  },

  _saveMarketing: function() {
    var statements = [];
    var primary = document.getElementById('prof-extra-primary');
    if (primary && primary.value.trim()) statements.push(primary.value.trim());
    Array.from(document.querySelectorAll('#prof-extras-extra .prof-extra-input')).forEach(function(el) {
      if (el.value.trim()) statements.push(el.value.trim());
    });
    this._save({
      marketing_theme_awareness: document.getElementById('prof-theme-aware').value.trim(),
      marketing_theme_differentiators: document.getElementById('prof-theme-diff').value.trim(),
      marketing_theme_feeling: document.getElementById('prof-theme-feel').value.trim(),
      marketing_theme_extra: statements
    }, 'prof-mkt-save');
  }
};
