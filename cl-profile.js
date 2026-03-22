window.CL_PROFILE = {
  _supabase: null,
  _userId: null,
  _profile: {},

  init: function(supabase) {
    this._supabase = supabase;
    var container = document.getElementById('cl-tab-profile');
    if (!container) return;
    container.innerHTML = this._renderShell();
    this._bindTabSwitching();
    this._loadProfile();
  },

  _renderShell: function() {
    return '<div class="sp-page" style="padding:32px 40px 80px;">' +
      '<div class="sp-nav-chips" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px;">' +
        '<button class="sp-nav-chip sp-nav-chip-active" data-ptab="identity" style="background:#E8F0F7;">Identity</button>' +
        '<button class="sp-nav-chip" data-ptab="location">Location &amp; Contact</button>' +
        '<button class="sp-nav-chip" data-ptab="details">Business Details</button>' +
        '<button class="sp-nav-chip" data-ptab="marketing">Marketing Theme</button>' +
      '</div>' +
      '<div id="profile-tab-identity" class="profile-panel"></div>' +
      '<div id="profile-tab-location" class="profile-panel" style="display:none"></div>' +
      '<div id="profile-tab-details" class="profile-panel" style="display:none"></div>' +
      '<div id="profile-tab-marketing" class="profile-panel" style="display:none"></div>' +
    '</div>';
  },

  _bindTabSwitching: function() {
    var container = document.getElementById('cl-tab-profile');
    container.querySelectorAll('.sp-nav-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.sp-nav-chip').forEach(function(b) {
          b.classList.remove('sp-nav-chip-active'); b.style.background = '';
        });
        btn.classList.add('sp-nav-chip-active'); btn.style.background = '#E8F0F7';
        container.querySelectorAll('.profile-panel').forEach(function(p) {
          p.style.display = 'none';
        });
        document.getElementById('profile-tab-' + btn.dataset.ptab).style.display = '';
      });
    });
  },

  _loadProfile: async function() {
    var session = await this._supabase.auth.getSession();
    if (!session.data.session) return;
    this._userId = session.data.session.user.id;
    var result = await this._supabase.from('profiles').select('*').eq('id', this._userId).single();
    this._profile = result.data || {};
    this._renderIdentity();
    this._renderLocation();
    this._renderDetails();
    this._renderMarketing();
  },

  _val: function(key) {
    var v = this._profile[key];
    return (v === null || v === undefined) ? '' : v;
  },

  _saveSection: async function(updates, btnId) {
    var btn = document.getElementById(btnId);
    if (btn) btn.textContent = 'Saving...';
    var result = await this._supabase.from('profiles').update(updates).eq('id', this._userId);
    if (btn) {
      if (result.error) {
        btn.textContent = 'Error saving';
      } else {
        Object.assign(this._profile, updates);
        btn.textContent = 'Saved \u2713';
        setTimeout(function() { if (btn) btn.textContent = 'Save'; }, 2000);
      }
    }
  },

  _section: function(content) {
    return '<div class="sp-section">' + content + '</div>';
  },

  _field: function(label, inputHtml, hint) {
    return '<div class="sp-field">' +
      '<label class="sp-field-label">' + label + '</label>' +
      (hint ? '<div class="sp-field-help">' + hint + '</div>' : '') +
      inputHtml +
    '</div>';
  },

  _input: function(id, type, value, placeholder, extra) {
    return '<input id="' + id + '" type="' + type + '" class="sp-input" value="' + window.escHtml(String(value)) + '" placeholder="' + placeholder + '" ' + (extra || '') + ' />';
  },

  _textarea: function(id, value, placeholder, rows) {
    return '<textarea id="' + id + '" class="sp-input" rows="' + (rows || 4) + '" placeholder="' + placeholder + '">' + window.escHtml(String(value)) + '</textarea>';
  },

  _select: function(id, options, selected) {
    var opts = options.map(function(o) {
      return '<option value="' + window.escHtml(o) + '"' + (selected === o ? ' selected' : '') + '>' + window.escHtml(o) + '</option>';
    }).join('');
    return '<select id="' + id + '" class="sp-select"><option value="">Select...</option>' + opts + '</select>';
  },

  _saveRow: function(btnId, handler) {
    return '<div style="display:flex;align-items:center;gap:16px;margin-top:24px;">' +
      '<button id="' + btnId + '" class="btn-sp-generate" onclick="window.CL_PROFILE.' + handler + '()">Save</button>' +
    '</div>';
  },

  // ---- IDENTITY ----
  _renderIdentity: function() {
    var p = this._profile;
    var industries = ['Pool Building','Plumbing','Electrical','Building & Construction','HVAC','Fabrication','Cleaning','Landscaping','Manufacturing','Concreting','Handyman','Other'];
    var structures = ['Sole Trader','Partnership','Company','Trust','Other'];

    var logoHtml = '<div style="display:flex;align-items:center;gap:16px;margin-top:8px;">' +
      (p.logo_url ? '<img src="' + window.escHtml(p.logo_url) + '" id="prof-logo-preview" style="height:60px;border-radius:6px;border:1px solid #E0E0E0;" alt="Logo" />' :
        '<div id="prof-logo-preview" style="width:80px;height:60px;background:#F5F7FA;border:1px solid #E0E0E0;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">No logo</div>') +
      '<div><input id="prof-logo-input" type="file" accept="image/*" style="display:none" />' +
      '<button class="btn-sp-back" onclick="document.getElementById(\'prof-logo-input\').click()">Upload Logo</button></div>' +
    '</div>';

    document.getElementById('profile-tab-identity').innerHTML = this._section(
      '<div class="sp-section-header"><div class="sp-section-icon">\uD83C\uDFE2</div><div><div class="sp-section-title">Identity</div><div class="sp-section-subtitle">Your registered business details</div></div></div>' +
      '<div class="sp-fields">' +
        this._field('Legal Business Name', this._input('prof-legal-name', 'text', this._val('business_name'), 'Your registered business name')) +
        this._field('Trading Name / t/as <span style="font-weight:400;color:#888;">(optional)</span>', this._input('prof-trading-name', 'text', this._val('trading_name'), 'Trading name if different from legal name')) +
        this._field('ABN', this._input('prof-abn', 'text', this._val('abn'), 'xx xxx xxx xxx', 'maxlength="14"')) +
        this._field('Business Structure', this._select('prof-structure', structures, this._val('business_structure'))) +
        this._field('Industry', this._select('prof-industry', industries, this._val('industry'))) +
        this._field('Business Logo', logoHtml) +
      '</div>' +
      this._saveRow('prof-identity-save', '_saveIdentity')
    );

    var self = this;
    document.getElementById('prof-logo-input').addEventListener('change', function(e) {
      self._uploadLogo(e.target.files[0]);
    });
    document.getElementById('prof-abn').addEventListener('input', function(e) {
      var v = e.target.value.replace(/\D/g, '').substring(0, 11);
      var f = '';
      if (v.length > 0) f = v.substring(0, 2);
      if (v.length > 2) f += ' ' + v.substring(2, 5);
      if (v.length > 5) f += ' ' + v.substring(5, 8);
      if (v.length > 8) f += ' ' + v.substring(8, 11);
      e.target.value = f;
    });
  },

  _uploadLogo: async function(file) {
    if (!file) return;
    var ext = file.name.split('.').pop();
    var path = 'logos/' + this._userId + '.' + ext;
    var up = await this._supabase.storage.from('cl-assets').upload(path, file, { upsert: true });
    if (up.error) { alert('Logo upload failed: ' + up.error.message); return; }
    var urlData = this._supabase.storage.from('cl-assets').getPublicUrl(path);
    var logoUrl = urlData.data.publicUrl;
    await this._supabase.from('profiles').update({ logo_url: logoUrl }).eq('id', this._userId);
    this._profile.logo_url = logoUrl;
    var prev = document.getElementById('prof-logo-preview');
    if (prev) { prev.src = logoUrl; }
  },

  _saveIdentity: function() {
    this._saveSection({
      business_name: document.getElementById('prof-legal-name').value.trim(),
      trading_name: document.getElementById('prof-trading-name').value.trim(),
      abn: document.getElementById('prof-abn').value.trim(),
      business_structure: document.getElementById('prof-structure').value,
      industry: document.getElementById('prof-industry').value
    }, 'prof-identity-save');
  },

  _renderLocation: function() {
    var p = this._profile;
    var isMulti = p.is_multi_location || false;
    var addPhones = Array.isArray(p.additional_phones) ? p.additional_phones : [];
    var websites = Array.isArray(p.website_urls) ? p.website_urls : [];
    var addLocations = Array.isArray(p.additional_locations) ? p.additional_locations : [];
    var addPhonesHtml = addPhones.map(function(ph, i) { return '<div style="display:flex;gap:8px;margin-bottom:8px;" id="add-phone-row-' + i + '"><input type="text" class="sp-input add-phone-input" value="' + window.escHtml(ph) + '" style="flex:1;" /><button class="btn-sp-back" onclick="window.CL_PROFILE._removeRow(\'add-phone-row-' + i + '\')">Remove</button></div>'; }).join('');
    var websitesHtml = websites.map(function(url, i) { return '<div style="display:flex;gap:8px;margin-bottom:8px;" id="website-row-' + i + '"><input type="url" class="sp-input website-input" value="' + window.escHtml(url) + '" style="flex:1;" /><button class="btn-sp-back" onclick="window.CL_PROFILE._removeRow(\'website-row-' + i + '\')">Remove</button></div>'; }).join('');
    var addLocationsHtml = addLocations.map(function(loc, i) { return '<div class="sp-section" style="margin-bottom:12px;" id="add-loc-row-' + i + '"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><strong style="color:#1A5490;">Location ' + (i + 2) + '</strong><button class="btn-sp-back" onclick="window.CL_PROFILE._removeRow(\'add-loc-row-' + i + '\')">Remove</button></div><input type="text" class="sp-input loc-name" placeholder="Location name" value="' + window.escHtml(loc.name || '') + '" style="margin-bottom:8px;" /><input type="text" class="sp-input loc-street" placeholder="Street address" value="' + window.escHtml(loc.street || '') + '" style="margin-bottom:8px;" /><div style="display:grid;grid-template-columns:1fr 80px 90px;gap:8px;margin-bottom:8px;"><input type="text" class="sp-input loc-suburb" placeholder="Suburb" value="' + window.escHtml(loc.suburb || '') + '" /><input type="text" class="sp-input loc-state" placeholder="State" value="' + window.escHtml(loc.state || '') + '" /><input type="text" class="sp-input loc-postcode" placeholder="Postcode" value="' + window.escHtml(loc.postcode || '') + '" /></div><input type="text" class="sp-input loc-phone" placeholder="Phone" value="' + window.escHtml(loc.phone || '') + '" /></div>'; }).join('');
    document.getElementById('profile-tab-location').innerHTML = this._section(
      '<div class="sp-section-header"><div class="sp-section-icon">\uD83D\uDCCD4</div><div><div class="sp-section-title">Location &amp; Contact</div><div class="sp-section-subtitle">Where you operate and how to reach you</div></div></div>' +
      '<div class="sp-fields">' +
        this._field('Street Address', this._input('prof-street', 'text', this._val('address_street'), 'Street address')) +
        '<div style="display:grid;grid-template-columns:1fr 80px 90px;gap:16px;">' +
          this._field('Suburb', this._input('prof-suburb', 'text', this._val('address_suburb'), 'Suburb')) +
          this._field('State', this._input('prof-state', 'text', this._val('address_state'), 'State')) +
          this._field('Postcode', this._input('prof-postcode', 'text', this._val('address_postcode'), 'Postcode')) +
        '</div>' +
        this._field('Primary Phone', this._input('prof-phone', 'text', this._val('phone'), 'Primary phone number')) +
        this._field('Additional Phone Numbers', '<div id="add-phones-container">' + addPhonesHtml + '</div><button class="btn-sp-back" onclick="window.CL_PROFILE._addPhone()" style="margin-top:4px;">+ Add Phone</button>') +
        this._field('Website URL(s)', '<div id="websites-container">' + websitesHtml + '</div><button class="btn-sp-back" onclick="window.CL_PROFILE._addWebsite()" style="margin-top:4px;">+ Add Website</button>') +
        '<div class="sp-field"><label class="sp-field-label">Locations</label><div style="display:flex;gap:8px;margin-top:8px;"><button id="loc-toggle-single" class="sp-nav-chip' + (!isMulti ? ' sp-nav-chip-active' : '') + '" onclick="window.CL_PROFILE._setMultiLocation(false)">Single location</button><button id="loc-toggle-multi" class="sp-nav-chip' + (isMulti ? ' sp-nav-chip-active' : '') + '" onclick="window.CL_PROFILE._setMultiLocation(true)">Multiple locations</button></div></div>' +
        '<div id="additional-locations-wrap"' + (!isMulti ? ' style="display:none"' : '') + '><div id="add-locations-container">' + addLocationsHtml + '</div><button class="btn-sp-back" onclick="window.CL_PROFILE._addLocation()" style="margin-top:8px;">+ Add Location</button></div>' +
      '</div>' +
      this._saveRow('prof-location-save', '_saveLocation')
    );
  },

  _addPhone: function() { var c = document.getElementById('add-phones-container'); var i = c.children.length; var d = document.createElement('div'); d.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;'; d.id = 'add-phone-row-' + i; d.innerHTML = '<input type="text" class="sp-input add-phone-input" placeholder="Phone number" style="flex:1;" /><button class="btn-sp-back" onclick="window.CL_PROFILE._removeRow(\'add-phone-row-' + i + '\')">Remove</button>'; c.appendChild(d); },

  _addWebsite: function() { var c = document.getElementById('websites-container'); var i = c.children.length; var d = document.createElement('div'); d.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;'; d.id = 'website-row-' + i; d.innerHTML = '<input type="url" class="sp-input website-input" placeholder="https://yoursite.com.au" style="flex:1;" /><button class="btn-sp-back" onclick="window.CL_PROFILE._removeRow(\'website-row-' + i + '\')">Remove</button>'; c.appendChild(d); },

  _addLocation: function() { var c = document.getElementById('add-locations-container'); var i = c.children.length; var num = i + 2; var d = document.createElement('div'); d.className = 'sp-section'; d.style.marginBottom = '12px'; d.id = 'add-loc-row-' + i; d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><strong style="color:#1A5490;">Location ' + num + '</strong><button class="btn-sp-back" onclick="window.CL_PROFILE._removeRow(\'add-loc-row-' + i + '\')">Remove</button></div><input type="text" class="sp-input loc-name" placeholder="Location name" style="margin-bottom:8px;" /><input type="text" class="sp-input loc-street" placeholder="Street address" style="margin-bottom:8px;" /><div style="display:grid;grid-template-columns:1fr 80px 90px;gap:8px;margin-bottom:8px;"><input type="text" class="sp-input loc-suburb" placeholder="Suburb" /><input type="text" class="sp-input loc-state" placeholder="State" /><input type="text" class="sp-input loc-postcode" placeholder="Postcode" /></div><input type="text" class="sp-input loc-phone" placeholder="Phone" />'; c.appendChild(d); },

  _removeRow: function(id) { var r = document.getElementById(id); if (r) r.parentNode.removeChild(r); },

  _setMultiLocation: function(isMulti) {
    document.getElementById('loc-toggle-single').classList.toggle('sp-nav-chip-active', !isMulti);
    document.getElementById('loc-toggle-multi').classList.toggle('sp-nav-chip-active', isMulti);
    document.getElementById('additional-locations-wrap').style.display = isMulti ? '' : 'none';
  },

  _saveLocation: function() {
    var addPhones = Array.from(document.querySelectorAll('.add-phone-input')).map(function(i) { return i.value.trim(); }).filter(Boolean);
    var websites = Array.from(document.querySelectorAll('.website-input')).map(function(i) { return i.value.trim(); }).filter(Boolean);
    var isMulti = document.getElementById('loc-toggle-multi').classList.contains('sp-nav-chip-active');
    var locBlocks = document.querySelectorAll('#add-locations-container .sp-section');
    var addLocations = Array.from(locBlocks).map(function(b) { return { name: b.querySelector('.loc-name').value.trim(), street: b.querySelector('.loc-street').value.trim(), suburb: b.querySelector('.loc-suburb').value.trim(), state: b.querySelector('.loc-state').value.trim(), postcode: b.querySelector('.loc-postcode').value.trim(), phone: b.querySelector('.loc-phone').value.trim() }; });
    this._saveSection({ address_street: document.getElementById('prof-street').value.trim(), address_suburb: document.getElementById('prof-suburb').value.trim(), address_state: document.getElementById('prof-state').value.trim(), address_postcode: document.getElementById('prof-postcode').value.trim(), phone: document.getElementById('prof-phone').value.trim(), additional_phones: addPhones, website_urls: websites, is_multi_location: isMulti, additional_locations: addLocations }, 'prof-location-save');
  },

  _renderDetails: function() {
    var p = this._profile;
    var ranges = ['1','2-5','6-10','11-20','21-50','50+'];
    document.getElementById('profile-tab-details').innerHTML = this._section(
      '<div class="sp-section-header"><div class="sp-section-icon">\uD83D\uDCC4</div><div><div class="sp-section-title">Business Details</div><div class="sp-section-subtitle">What your business does and how it operates</div></div></div>' +
      '<div class="sp-fields">' +
        this._field('Services Provided', this._textarea('prof-services', this._val('services'), 'Describe the services your business provides', 4)) +
        this._field('Products Offered <span style="font-weight:400;color:#888;">(optional)</span>', this._textarea('prof-products', this._val('products'), 'Describe any products your business sells', 3)) +
        this._field('Number of Employees', this._select('prof-employee-range', ranges, this._val('employee_range'))) +
        this._field('Years in Business', this._input('prof-years', 'number', this._val('years_in_business'), 'e.g. 5', 'min="0" max="200" style="max-width:120px;"')) +
      '</div>' +
      this._saveRow('prof-details-save', '_saveDetails')
    );
  },

  _saveDetails: function() {
    this._saveSection({ services: document.getElementById('prof-services').value.trim(), products: document.getElementById('prof-products').value.trim(), employee_range: document.getElementById('prof-employee-range').value, years_in_business: parseInt(document.getElementById('prof-years').value) || null }, 'prof-details-save');
  },

  _renderMarketing: function() {
    var p = this._profile;
    var extras = Array.isArray(p.marketing_theme_extra) ? p.marketing_theme_extra : [];
    var extrasHtml = extras.map(function(item, i) { return '<div style="display:flex;gap:8px;margin-bottom:8px;" id="theme-extra-row-' + i + '"><input type="text" class="sp-input theme-extra-input" value="' + window.escHtml(item) + '" style="flex:1;" placeholder="Additional theme statement" /><button class="btn-sp-back" onclick="window.CL_PROFILE._removeRow(\'theme-extra-row-' + i + '\')">Remove</button></div>'; }).join('');
    document.getElementById('profile-tab-marketing').innerHTML = this._section(
      '<div class="sp-section-header"><div class="sp-section-icon">\uD83C\uDFA8</div><div><div class="sp-section-title">Marketing Theme</div><div class="sp-section-subtitle">These answers personalise your outputs across every StaxAI tool</div></div></div>' +
      '<div class="sp-fields">' +
        this._field('What do you want your customers to know about your business?', this._textarea('prof-theme-awareness', this._val('marketing_theme_awareness'), 'e.g. We have been serving our local community for over 15 years with honest, reliable service', 3)) +
        this._field('What sets you apart from your competitors?', this._textarea('prof-theme-diff', this._val('marketing_theme_differentiators'), 'e.g. Same-day service, upfront pricing, and a 100% satisfaction guarantee', 3)) +
        this._field('What feeling do you want customers to have when they interact with you?', this._textarea('prof-theme-feeling', this._val('marketing_theme_feeling'), 'e.g. Confident, reassured, and well looked after', 3)) +
        this._field('Additional Theme Statements <span style="font-weight:400;color:#888;">(optional)</span>', '<div id="theme-extras-container">' + extrasHtml + '</div><button class="btn-sp-back" onclick="window.CL_PROFILE._addThemeExtra()" style="margin-top:4px;">+ Add Statement</button>') +
      '</div>' +
      this._saveRow('prof-marketing-save', '_saveMarketing')
    );
  },

  _addThemeExtra: function() { var c = document.getElementById('theme-extras-container'); var i = c.children.length; var d = document.createElement('div'); d.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;'; d.id = 'theme-extra-row-' + i; d.innerHTML = '<input type="text" class="sp-input theme-extra-input" placeholder="Additional theme statement" style="flex:1;" /><button class="btn-sp-back" onclick="window.CL_PROFILE._removeRow(\'theme-extra-row-' + i + '\')">Remove</button>'; c.appendChild(d); },

  _saveMarketing: function() {
    var extras = Array.from(document.querySelectorAll('.theme-extra-input')).map(function(i) { return i.value.trim(); }).filter(Boolean);
    this._saveSection({ marketing_theme_awareness: document.getElementById('prof-theme-awareness').value.trim(), marketing_theme_differentiators: document.getElementById('prof-theme-diff').value.trim(), marketing_theme_feeling: document.getElementById('prof-theme-feeling').value.trim(), marketing_theme_extra: extras }, 'prof-marketing-save');
  }
};
