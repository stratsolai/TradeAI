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
        '<button class="profile-nav-chip active" data-ptab="identity">Identity</button>' +
        '<button class="profile-nav-chip" data-ptab="location">Location &amp; Contact</button>' +
        '<button class="profile-nav-chip" data-ptab="details">Business Details</button>' +
        '<button class="profile-nav-chip" data-ptab="marketing">Marketing Theme</button>' +
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
        '<button id="' + btnId + '" class="btn-primary" onclick="window.CL_PROFILE.' + fn + '()">Save</button>' +
      '</div>' +
    '</div>';
  },

  _field: function(label, html) {
    return '<div class="profile-field-full">' +
      '<label class="profile-label">' + label + '</label>' +
      html +
    '</div>';
  },

  _field2: function(label, html) {
    return '<div class="profile-field">' +
      '<label class="profile-label">' + label + '</label>' +
      html +
    '</div>';
  },

  _input: function(id, type, val, ph, extra) {
    return '<input id="' + id + '" type="' + type + '" class="profile-input"' +
      ' value="' + window.escHtml(String(val)) + '"' +
      ' placeholder="' + ph + '"' +
      (extra ? ' ' + extra : '') + ' />';
  },

  _textarea: function(id, val, ph, rows) {
    return '<textarea id="' + id + '" class="profile-textarea"' +
      ' rows="' + (rows || 4) + '"' +
      ' placeholder="' + ph + '">' +
      window.escHtml(String(val)) +
    '</textarea>';
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
    var empRanges = ['1', '2-5', '6-10', '11-20', '21-50', '50+'];

    var logoHtml = '<div class="profile-logo-wrap">' +
      (p.logo_url
        ? '<img id="prof-logo-img" src="' + window.escHtml(p.logo_url) + '" class="profile-logo-preview" alt="Logo" />'
        : '<div id="prof-logo-img" class="profile-logo-placeholder">No logo</div>') +
      '<input id="prof-logo-file" type="file" accept="image/*" class="profile-file-input" />' +
      '<button class="btn-outline" onclick="document.getElementById(\'prof-logo-file\').click()">Upload Logo</button>' +
    '</div>';

    var body = '<div class="profile-fields">' +
      this._field('Legal Business Name', this._input('prof-biz-name', 'text', this._v('business_name'), 'Your registered business name')) +
      this._field('Trading Name / t/as <span class="profile-optional">(optional)</span>', this._input('prof-trading-name', 'text', this._v('trading_name'), 'Trading name if different from legal name')) +
      this._field2('ABN', this._input('prof-abn', 'text', this._v('abn'), 'xx xxx xxx xxx', 'maxlength="14"')) +
      this._field2('Business Structure', this._select('prof-structure', structures, this._v('business_structure'))) +
      this._field('Industry / Profession', this._input('prof-industry', 'text', this._v('industry'), 'e.g. Plumbing, Accounting, Landscaping')) +
      this._field('Business Logo', logoHtml) +
    '</div>';

    document.getElementById('prof-panel-identity').innerHTML = this._card(
      '\uD83C\uDFE2', 'Identity', 'Your registered business details', body, 'prof-id-save', '_saveIdentity'
    );

    var self = this;
    document.getElementById('prof-logo-file').addEventListener('change', function(e) {
      self._uploadLogo(e.target.files[0]);
    });
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
    this._save({
      business_name: document.getElementById('prof-biz-name').value.trim(),
      trading_name: document.getElementById('prof-trading-name').value.trim(),
      abn: document.getElementById('prof-abn').value.trim(),
      business_structure: document.getElementById('prof-structure').value,
      industry: document.getElementById('prof-industry').value.trim()
    }, 'prof-id-save');
  },

  _renderLocation: function() {
    var p = this._profile;
    var isMulti = p.is_multi_location || false;
    var phones = Array.isArray(p.additional_phones) ? p.additional_phones : [];
    var sites = Array.isArray(p.website_urls) ? p.website_urls : [];
    var locs = Array.isArray(p.additional_locations) ? p.additional_locations : [];

    var phonesHtml = phones.map(function(ph, i) {
      return '<div class="profile-repeating-row" id="prof-ph-' + i + '">' +
        '<input type="text" class="profile-input prof-add-phone" value="' + window.escHtml(ph) + '" />' +
        '<button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-ph-' + i + '\')">Remove</button>' +
      '</div>';
    }).join('');

    var sitesHtml = sites.map(function(u, i) {
      return '<div class="profile-repeating-row" id="prof-site-' + i + '">' +
        '<input type="url" class="profile-input prof-add-site" value="' + window.escHtml(u) + '" />' +
        '<button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-site-' + i + '\')">Remove</button>' +
      '</div>';
    }).join('');

    var locsHtml = locs.map(function(loc, i) {
      return '<div class="profile-location-block" id="prof-loc-' + i + '">' +
        '<div class="profile-location-row-header">' +
          '<strong style="color:#1A5490;">Location ' + (i + 2) + '</strong>' +
          '<button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-loc-' + i + '\')">Remove</button>' +
        '</div>' +
        '<input type="text" class="profile-input loc-name" placeholder="Location name" value="' + window.escHtml(loc.name || '') + '" style="margin-bottom:8px;" />' +
        '<input type="text" class="profile-input loc-street" placeholder="Street address" value="' + window.escHtml(loc.street || '') + '" style="margin-bottom:8px;" />' +
        '<div class="profile-address-row" style="margin-bottom:8px;">' +
          '<input type="text" class="profile-input loc-suburb" placeholder="Suburb" value="' + window.escHtml(loc.suburb || '') + '" />' +
          '<input type="text" class="profile-input loc-state" placeholder="State" value="' + window.escHtml(loc.state || '') + '" />' +
          '<input type="text" class="profile-input loc-postcode" placeholder="Postcode" value="' + window.escHtml(loc.postcode || '') + '" />' +
        '</div>' +
        '<input type="text" class="profile-input loc-phone" placeholder="Phone" value="' + window.escHtml(loc.phone || '') + '" />' +
      '</div>';
    }).join('');

    var body = '<div class="profile-fields">' +
      this._field('Street Address', this._input('prof-street', 'text', this._v('address_street'), 'Street address')) +
      '<div class="profile-field-full"><div class="profile-address-row">' +
        '<div><label class="profile-label">Suburb</label>' + this._input('prof-suburb', 'text', this._v('address_suburb'), 'Suburb') + '</div>' +
        '<div><label class="profile-label">State</label>' + this._input('prof-state', 'text', this._v('address_state'), 'State') + '</div>' +
        '<div><label class="profile-label">Postcode</label>' + this._input('prof-postcode', 'text', this._v('address_postcode'), 'Postcode') + '</div>' +
      '</div></div>' +
      this._field('Primary Phone', this._input('prof-phone', 'text', this._v('phone'), 'Primary phone number')) +
      this._field('Additional Phone Numbers',
        '<div id="prof-phones-wrap">' + phonesHtml + '</div>' +
        '<button class="btn-outline btn-sm profile-add-btn" onclick="window.CL_PROFILE._addPhone()">+ Add Phone</button>'
      ) +
      this._field('Website URL(s)',
        '<div id="prof-sites-wrap">' + sitesHtml + '</div>' +
        '<button class="btn-outline btn-sm profile-add-btn" onclick="window.CL_PROFILE._addSite()">+ Add Website</button>'
      ) +
      '<div class="profile-field-full">' +
        '<label class="profile-label">Locations</label>' +
        '<div class="profile-toggle-row">' +
          '<button id="prof-loc-single" class="profile-nav-chip' + (!isMulti ? ' active' : '') + '" onclick="window.CL_PROFILE._setMulti(false)">Single location</button>' +
          '<button id="prof-loc-multi" class="profile-nav-chip' + (isMulti ? ' active' : '') + '" onclick="window.CL_PROFILE._setMulti(true)">Multiple locations</button>' +
        '</div>' +
      '</div>' +
      '<div id="prof-locs-wrap" class="profile-field-full"' + (!isMulti ? ' style="display:none"' : '') + '>' +
        '<div id="prof-locs-inner">' + locsHtml + '</div>' +
        '<button class="btn-outline btn-sm profile-add-btn" onclick="window.CL_PROFILE._addLocation()">+ Add Location</button>' +
      '</div>' +
    '</div>';

    document.getElementById('prof-panel-location').innerHTML = this._card(
      '\uD83D\uDCCD', 'Location &amp; Contact', 'Where you operate and how to reach you', body, 'prof-loc-save', '_saveLocation'
    );
  },

  _addPhone: function() {
    var c = document.getElementById('prof-phones-wrap');
    var i = c.children.length;
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = 'prof-ph-' + i;
    d.innerHTML = '<input type="text" class="profile-input prof-add-phone" placeholder="Phone number" />' +
      '<button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-ph-' + i + '\')">Remove</button>';
    c.appendChild(d);
  },

  _addSite: function() {
    var c = document.getElementById('prof-sites-wrap');
    var i = c.children.length;
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = 'prof-site-' + i;
    d.innerHTML = '<input type="url" class="profile-input prof-add-site" placeholder="https://yoursite.com.au" />' +
      '<button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-site-' + i + '\')">Remove</button>';
    c.appendChild(d);
  },

  _addLocation: function() {
    var c = document.getElementById('prof-locs-inner');
    var i = c.children.length;
    var d = document.createElement('div');
    d.className = 'profile-location-block';
    d.id = 'prof-loc-' + i;
    d.innerHTML = '<div class="profile-location-row-header">' +
      '<strong style="color:#1A5490;">Location ' + (i + 2) + '</strong>' +
      '<button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-loc-' + i + '\')">Remove</button>' +
    '</div>' +
    '<input type="text" class="profile-input loc-name" placeholder="Location name" style="margin-bottom:8px;" />' +
    '<input type="text" class="profile-input loc-street" placeholder="Street address" style="margin-bottom:8px;" />' +
    '<div class="profile-address-row" style="margin-bottom:8px;">' +
      '<input type="text" class="profile-input loc-suburb" placeholder="Suburb" />' +
      '<input type="text" class="profile-input loc-state" placeholder="State" />' +
      '<input type="text" class="profile-input loc-postcode" placeholder="Postcode" />' +
    '</div>' +
    '<input type="text" class="profile-input loc-phone" placeholder="Phone" />';
    c.appendChild(d);
  },

  _setMulti: function(isMulti) {
    document.getElementById('prof-loc-single').classList.toggle('active', !isMulti);
    document.getElementById('prof-loc-multi').classList.toggle('active', isMulti);
    document.getElementById('prof-locs-wrap').style.display = isMulti ? '' : 'none';
  },

  _saveLocation: function() {
    var phones = Array.from(document.querySelectorAll('.prof-add-phone')).map(function(el) { return el.value.trim(); }).filter(Boolean);
    var sites = Array.from(document.querySelectorAll('.prof-add-site')).map(function(el) { return el.value.trim(); }).filter(Boolean);
    var isMulti = document.getElementById('prof-loc-multi').classList.contains('active');
    var locBlocks = document.querySelectorAll('#prof-locs-inner .profile-location-block');
    var locs = Array.from(locBlocks).map(function(b) {
      return {
        name: b.querySelector('.loc-name').value.trim(),
        street: b.querySelector('.loc-street').value.trim(),
        suburb: b.querySelector('.loc-suburb').value.trim(),
        state: b.querySelector('.loc-state').value.trim(),
        postcode: b.querySelector('.loc-postcode').value.trim(),
        phone: b.querySelector('.loc-phone').value.trim()
      };
    });
    this._save({
      address_street: document.getElementById('prof-street').value.trim(),
      address_suburb: document.getElementById('prof-suburb').value.trim(),
      address_state: document.getElementById('prof-state').value.trim(),
      address_postcode: document.getElementById('prof-postcode').value.trim(),
      phone: document.getElementById('prof-phone').value.trim(),
      additional_phones: phones,
      website_urls: sites,
      is_multi_location: isMulti,
      additional_locations: locs
    }, 'prof-loc-save');
  },

  _renderDetails: function() {
    var empRanges = ['1', '2-5', '6-10', '11-20', '21-50', '50+'];
    var body = '<div class="profile-fields">' +
      this._field('Services Provided',
        this._textarea('prof-services', this._v('services'), 'Describe the services your business provides', 4)) +
      this._field('Products Offered <span class="profile-optional">(optional)</span>',
        this._textarea('prof-products', this._v('products'), 'Describe any products your business sells', 3)) +
      this._field2('Number of Employees', this._select('prof-emp-range', empRanges, this._v('employee_range'))) +
      this._field2('Years in Business', this._input('prof-years', 'number', this._v('years_in_business'), 'e.g. 5', 'min="0" max="200" style="max-width:120px;"')) +
    '</div>';
    document.getElementById('prof-panel-details').innerHTML = this._card(
      '\uD83D\uDCC4', 'Business Details', 'What your business does and how it operates', body, 'prof-det-save', '_saveDetails'
    );
  },

  _saveDetails: function() {
    this._save({
      services: document.getElementById('prof-services').value.trim(),
      products: document.getElementById('prof-products').value.trim(),
      employee_range: document.getElementById('prof-emp-range').value,
      years_in_business: parseInt(document.getElementById('prof-years').value) || null
    }, 'prof-det-save');
  },

  _renderMarketing: function() {
    var extras = Array.isArray(this._profile.marketing_theme_extra) ? this._profile.marketing_theme_extra : [];
    var extrasHtml = extras.map(function(item, i) {
      return '<div class="profile-repeating-row" id="prof-extra-' + i + '">' +
        '<input type="text" class="profile-input prof-extra-input" value="' + window.escHtml(item) + '" placeholder="Additional theme statement" />' +
        '<button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-extra-' + i + '\')">Remove</button>' +
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
        '<div id="prof-extras-wrap">' + extrasHtml + '</div>' +
        '<button class="btn-outline btn-sm profile-add-btn" onclick="window.CL_PROFILE._addExtra()">+ Add Statement</button>'
      ) +
    '</div>';

    document.getElementById('prof-panel-marketing').innerHTML = this._card(
      '\uD83C\uDFA8', 'Marketing Theme', 'These answers personalise your outputs across every StaxAI tool', body, 'prof-mkt-save', '_saveMarketing'
    );
  },

  _addExtra: function() {
    var c = document.getElementById('prof-extras-wrap');
    var i = c.children.length;
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = 'prof-extra-' + i;
    d.innerHTML = '<input type="text" class="profile-input prof-extra-input" placeholder="Additional theme statement" />' +
      '<button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRow(\'prof-extra-' + i + '\')">Remove</button>';
    c.appendChild(d);
  },

  _saveMarketing: function() {
    var extras = Array.from(document.querySelectorAll('.prof-extra-input')).map(function(el) { return el.value.trim(); }).filter(Boolean);
    this._save({
      marketing_theme_awareness: document.getElementById('prof-theme-aware').value.trim(),
      marketing_theme_differentiators: document.getElementById('prof-theme-diff').value.trim(),
      marketing_theme_feeling: document.getElementById('prof-theme-feel').value.trim(),
      marketing_theme_extra: extras
    }, 'prof-mkt-save');
  }
};
