window.CL_PROFILE = {
  _supabase: null,
  _userId: null,
  _profile: {},

  init: function(supabase) {
    this._supabase = supabase;
    const container = document.getElementById('cl-tab-profile');
    if (!container) return;
    container.innerHTML = this._renderShell();
    this._bindTabSwitching();
    this._loadProfile();
  },

  _renderShell: function() {
    return '<div class="profile-wrap">' +
      '<div class="profile-subtabs">' +
        '<button class="ptab active" data-ptab="identity">Identity</button>' +
        '<button class="ptab" data-ptab="location">Location &amp; Contact</button>' +
        '<button class="ptab" data-ptab="details">Business Details</button>' +
        '<button class="ptab" data-ptab="marketing">Marketing Theme</button>' +
      '</div>' +
      '<div id="profile-tab-identity" class="profile-panel"></div>' +
      '<div id="profile-tab-location" class="profile-panel" style="display:none"></div>' +
      '<div id="profile-tab-details" class="profile-panel" style="display:none"></div>' +
      '<div id="profile-tab-marketing" class="profile-panel" style="display:none"></div>' +
    '</div>';
  },

  _bindTabSwitching: function() {
    const self = this;
    const container = document.getElementById('cl-tab-profile');
    container.querySelectorAll('.profile-subtabs .ptab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.profile-subtabs .ptab').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        container.querySelectorAll('.profile-panel').forEach(function(p) { p.style.display = 'none'; });
        document.getElementById('profile-tab-' + btn.dataset.ptab).style.display = '';
      });
    });
  },

  _loadProfile: async function() {
    const session = await this._supabase.auth.getSession();
    if (!session.data.session) return;
    this._userId = session.data.session.user.id;
    const { data, error } = await this._supabase
      .from('profiles')
      .select('*')
      .eq('id', this._userId)
      .single();
    if (!data) { this._profile = {}; } else { this._profile = data; }
    this._renderIdentity();
    this._renderLocation();
    this._renderDetails();
    this._renderMarketing();
  },

  _val: function(key) {
    const v = this._profile[key];
    if (v === null || v === undefined) return '';
    return v;
  },

  _saveSection: async function(sectionId, updates, btnId) {
    const btn = document.getElementById(btnId);
    if (btn) btn.textContent = 'Saving...';
    const { error } = await this._supabase
      .from('profiles')
      .update(updates)
      .eq('id', this._userId);
    if (btn) {
      if (error) {
        btn.textContent = 'Error saving';
      } else {
        Object.assign(this._profile, updates);
        btn.textContent = 'Saved \u2713';
        setTimeout(function() { if (btn) btn.textContent = 'Save'; }, 2000);
      }
    }
  },

  // ---- IDENTITY ----
  _renderIdentity: function() {
    const p = this._profile;
    const industries = ['Pool Building','Plumbing','Electrical','Building & Construction','HVAC','Fabrication','Cleaning','Landscaping','Manufacturing','Concreting','Handyman','Other'];
    const industryOptions = industries.map(function(i) {
      return '<option value="' + window.escHtml(i) + '"' + (p.industry === i ? ' selected' : '') + '>' + window.escHtml(i) + '</option>';
    }).join('');
    const structures = ['Sole Trader','Partnership','Company','Trust','Other'];
    const structureOptions = structures.map(function(s) {
      return '<option value="' + window.escHtml(s) + '"' + (p.business_structure === s ? ' selected' : '') + '>' + window.escHtml(s) + '</option>';
    }).join('');

    document.getElementById('profile-tab-identity').innerHTML =
      '<div class="profile-section-card">' +
        '<h3 class="profile-section-title">Identity</h3>' +
        '<div class="profile-field-group">' +
          '<label class="profile-label">Legal Business Name</label>' +
          '<input id="prof-legal-name" type="text" class="profile-input" value="' + window.escHtml(this._val('business_name')) + '" placeholder="Your registered business name" />' +
        '</div>' +
        '<div class="profile-field-group">' +
          '<label class="profile-label">Trading Name / t/as <span class="profile-optional">(optional)</span></label>' +
          '<input id="prof-trading-name" type="text" class="profile-input" value="' + window.escHtml(this._val('trading_name')) + '" placeholder="Trading name if different from legal name" />' +
        '</div>' +
        '<div class="profile-field-group">' +
          '<label class="profile-label">ABN</label>' +
          '<input id="prof-abn" type="text" class="profile-input" value="' + window.escHtml(this._val('abn')) + '" placeholder="xx xxx xxx xxx" maxlength="14" />' +
        '</div>' +
        '<div class="profile-field-group">' +
          '<label class="profile-label">Business Structure</label>' +
          '<select id="prof-structure" class="profile-select"><option value="">Select structure</option>' + structureOptions + '</select>' +
        '</div>' +
        '<div class="profile-field-group">' +
          '<label class="profile-label">Industry</label>' +
          '<select id="prof-industry" class="profile-select"><option value="">Select industry</option>' + industryOptions + '</select>' +
        '</div>' +
        '<div class="profile-field-group">' +
          '<label class="profile-label">Business Logo</label>' +
          '<div class="profile-logo-wrap">' +
            (p.logo_url ? '<img id="prof-logo-preview" src="' + window.escHtml(p.logo_url) + '" class="profile-logo-preview" alt="Business logo" />' : '<div id="prof-logo-preview" class="profile-logo-placeholder">No logo uploaded</div>') +
            '<input id="prof-logo-input" type="file" accept="image/*" class="profile-file-input" />' +
            '<button class="btn-outline" onclick="document.getElementById(\'prof-logo-input\').click()">Upload Logo</button>' +
          '</div>' +
        '</div>' +
        '<div class="profile-save-row">' +
          '<button id="prof-identity-save" class="btn-primary" onclick="window.CL_PROFILE._saveIdentity()">Save</button>' +
          '<span id="prof-identity-status" class="profile-save-status"></span>' +
        '</div>' +
      '</div>';

    const self = this;
    document.getElementById('prof-logo-input').addEventListener('change', function(e) {
      self._uploadLogo(e.target.files[0]);
    });
    document.getElementById('prof-abn').addEventListener('input', function(e) {
      let val = e.target.value.replace(/\D/g, '').substring(0, 11);
      let formatted = '';
      if (val.length > 0) formatted = val.substring(0, 2);
      if (val.length > 2) formatted += ' ' + val.substring(2, 5);
      if (val.length > 5) formatted += ' ' + val.substring(5, 8);
      if (val.length > 8) formatted += ' ' + val.substring(8, 11);
      e.target.value = formatted;
    });
  },

  _uploadLogo: async function(file) {
    if (!file) return;
    const ext = file.name.split('.').pop();
    const path = 'logos/' + this._userId + '.' + ext;
    const { data, error } = await this._supabase.storage.from('cl-assets').upload(path, file, { upsert: true });
    if (error) { alert('Logo upload failed: ' + error.message); return; }
    const { data: urlData } = this._supabase.storage.from('cl-assets').getPublicUrl(path);
    const logoUrl = urlData.publicUrl;
    await this._supabase.from('profiles').update({ logo_url: logoUrl }).eq('id', this._userId);
    this._profile.logo_url = logoUrl;
    const preview = document.getElementById('prof-logo-preview');
    if (preview) { preview.src = logoUrl; preview.style.display = ''; }
  },

  _saveIdentity: function() {
    const updates = {
      business_name: document.getElementById('prof-legal-name').value.trim(),
      trading_name: document.getElementById('prof-trading-name').value.trim(),
      abn: document.getElementById('prof-abn').value.trim(),
      business_structure: document.getElementById('prof-structure').value,
      industry: document.getElementById('prof-industry').value
    };
    this._saveSection('identity', updates, 'prof-identity-save');
  },

  _renderLocation: function() {
    const p = this._profile;
    const isMulti = p.is_multi_location || false;
    const addPhones = Array.isArray(p.additional_phones) ? p.additional_phones : [];
    const websites = Array.isArray(p.website_urls) ? p.website_urls : [];
    const addLocations = Array.isArray(p.additional_locations) ? p.additional_locations : [];
    let addPhonesHtml = addPhones.map(function(ph, i) {
      return '<div class="profile-repeating-row" id="add-phone-row-' + i + '"><input type="text" class="profile-input add-phone-input" value="' + window.escHtml(ph) + '" /><button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRepeatingRow(\'add-phone-row-' + i + '\')">Remove</button></div>';
    }).join('');
    let websitesHtml = websites.map(function(url, i) {
      return '<div class="profile-repeating-row" id="website-row-' + i + '"><input type="url" class="profile-input website-input" value="' + window.escHtml(url) + '" /><button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRepeatingRow(\'website-row-' + i + '\')">Remove</button></div>';
    }).join('');
    let addLocationsHtml = addLocations.map(function(loc, i) {
      return '<div class="profile-location-block" id="add-loc-row-' + i + '"><div class="profile-location-row-header"><span>Location ' + (i + 2) + '</span><button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRepeatingRow(\'add-loc-row-' + i + '\')">Remove</button></div><input type="text" class="profile-input loc-name" placeholder="Location name" value="' + window.escHtml(loc.name || '') + '" /><input type="text" class="profile-input loc-street" placeholder="Street address" value="' + window.escHtml(loc.street || '') + '" /><div class="profile-address-row"><input type="text" class="profile-input loc-suburb" placeholder="Suburb" value="' + window.escHtml(loc.suburb || '') + '" /><input type="text" class="profile-input loc-state" placeholder="State" value="' + window.escHtml(loc.state || '') + '" /><input type="text" class="profile-input loc-postcode" placeholder="Postcode" value="' + window.escHtml(loc.postcode || '') + '" /></div><input type="text" class="profile-input loc-phone" placeholder="Phone" value="' + window.escHtml(loc.phone || '') + '" /></div>' ;
    }).join('');
    document.getElementById('profile-tab-location').innerHTML = '<div class="profile-section-card"><h3 class="profile-section-title">Location &amp; Contact</h3><div class="profile-field-group"><label class="profile-label">Street Address</label><input id="prof-street" type="text" class="profile-input" value="' + window.escHtml(this._val('address_street')) + '" placeholder="Street address" /></div><div class="profile-address-row"><div class="profile-field-group"><label class="profile-label">Suburb</label><input id="prof-suburb" type="text" class="profile-input" value="' + window.escHtml(this._val('address_suburb')) + '" placeholder="Suburb" /></div><div class="profile-field-group"><label class="profile-label">State</label><input id="prof-state" type="text" class="profile-input" value="' + window.escHtml(this._val('address_state')) + '" placeholder="State" /></div><div class="profile-field-group"><label class="profile-label">Postcode</label><input id="prof-postcode" type="text" class="profile-input" value="' + window.escHtml(this._val('address_postcode')) + '" placeholder="Postcode" /></div></div><div class="profile-field-group"><label class="profile-label">Primary Phone</label><input id="prof-phone" type="text" class="profile-input" value="' + window.escHtml(this._val('phone')) + '" placeholder="Primary phone number" /></div><div class="profile-field-group"><label class="profile-label">Additional Phone Numbers</label><div id="add-phones-container">' + addPhonesHtml + '</div><button class="btn-outline btn-sm profile-add-btn" onclick="window.CL_PROFILE._addPhone()">+ Add Phone</button></div><div class="profile-field-group"><label class="profile-label">Website URL(s)</label><div id="websites-container">' + websitesHtml + '</div><button class="btn-outline btn-sm profile-add-btn" onclick="window.CL_PROFILE._addWebsite()">+ Add Website</button></div><div class="profile-field-group"><label class="profile-label">Locations</label><div class="profile-toggle-row"><button id="loc-toggle-single" class="ptab' + (!isMulti ? ' active' : '') + '" onclick="window.CL_PROFILE._setMultiLocation(false)">Single location</button><button id="loc-toggle-multi" class="ptab' + (isMulti ? ' active' : '') + '" onclick="window.CL_PROFILE._setMultiLocation(true)">Multiple locations</button></div></div><div id="additional-locations-wrap"' + (!isMulti ? ' style="display:none"' : '') + '><div id="add-locations-container">' + addLocationsHtml + '</div><button class="btn-outline btn-sm profile-add-btn" onclick="window.CL_PROFILE._addLocation()">+ Add Location</button></div><div class="profile-save-row"><button id="prof-location-save" class="btn-primary" onclick="window.CL_PROFILE._saveLocation()">Save</button><span id="prof-location-status" class="profile-save-status"></span></div></div>';
  },

  _addPhone: function() {
    const container = document.getElementById('add-phones-container');
    const i = container.children.length;
    const row = document.createElement('div');
    row.className = 'profile-repeating-row';
    row.id = 'add-phone-row-' + i;
    row.innerHTML = '<input type="text" class="profile-input add-phone-input" placeholder="Phone number" /><button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRepeatingRow(\'add-phone-row-' + i + '\')">Remove</button>';
    container.appendChild(row);
  },

  _addWebsite: function() {
    const container = document.getElementById('websites-container');
    const i = container.children.length;
    const row = document.createElement('div');
    row.className = 'profile-repeating-row';
    row.id = 'website-row-' + i;
    row.innerHTML = '<input type="url" class="profile-input website-input" placeholder="https://yoursite.com.au" /><button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRepeatingRow(\'website-row-' + i + '\')">Remove</button>';
    container.appendChild(row);
  },

  _addLocation: function() {
    const container = document.getElementById('add-locations-container');
    const i = container.children.length;
    const num = i + 2;
    const block = document.createElement('div');
    block.className = 'profile-location-block';
    block.id = 'add-loc-row-' + i;
    block.innerHTML = '<div class="profile-location-row-header"><span>Location ' + num + '</span><button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRepeatingRow(\'add-loc-row-' + i + '\')">Remove</button></div><input type="text" class="profile-input loc-name" placeholder="Location name" /><input type="text" class="profile-input loc-street" placeholder="Street address" /><div class="profile-address-row"><input type="text" class="profile-input loc-suburb" placeholder="Suburb" /><input type="text" class="profile-input loc-state" placeholder="State" /><input type="text" class="profile-input loc-postcode" placeholder="Postcode" /></div><input type="text" class="profile-input loc-phone" placeholder="Phone" />';
    container.appendChild(block);
  },

  _removeRepeatingRow: function(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.parentNode.removeChild(row);
  },

  _setMultiLocation: function(isMulti) {
    document.getElementById('loc-toggle-single').classList.toggle('active', !isMulti);
    document.getElementById('loc-toggle-multi').classList.toggle('active', isMulti);
    document.getElementById('additional-locations-wrap').style.display = isMulti ? '' : 'none';
  },

  _saveLocation: function() {
    const addPhones = Array.from(document.querySelectorAll('.add-phone-input')).map(function(i) { return i.value.trim(); }).filter(Boolean);
    const websites = Array.from(document.querySelectorAll('.website-input')).map(function(i) { return i.value.trim(); }).filter(Boolean);
    const isMulti = document.getElementById('loc-toggle-multi').classList.contains('active');
    const locBlocks = document.querySelectorAll('#add-locations-container .profile-location-block');
    const addLocations = Array.from(locBlocks).map(function(block) {
      return { name: block.querySelector('.loc-name').value.trim(), street: block.querySelector('.loc-street').value.trim(), suburb: block.querySelector('.loc-suburb').value.trim(), state: block.querySelector('.loc-state').value.trim(), postcode: block.querySelector('.loc-postcode').value.trim(), phone: block.querySelector('.loc-phone').value.trim() };
    });
    this._saveSection('location', { address_street: document.getElementById('prof-street').value.trim(), address_suburb: document.getElementById('prof-suburb').value.trim(), address_state: document.getElementById('prof-state').value.trim(), address_postcode: document.getElementById('prof-postcode').value.trim(), phone: document.getElementById('prof-phone').value.trim(), additional_phones: addPhones, website_urls: websites, is_multi_location: isMulti, additional_locations: addLocations }, 'prof-location-save');
  },

  _renderDetails: function() {
    const p = this._profile;
    const ranges = ['1','2-5','6-10','11-20','21-50','50+'];
    const rangeOptions = ranges.map(function(r) { return '<option value="' + r + '"' + (p.employee_range === r ? ' selected' : '') + '>' + r + '</option>'; }).join('');
    document.getElementById('profile-tab-details').innerHTML = '<div class="profile-section-card"><h3 class="profile-section-title">Business Details</h3><div class="profile-field-group"><label class="profile-label">Services Provided</label><textarea id="prof-services" class="profile-textarea" rows="4" placeholder="Describe the services your business provides">' + window.escHtml(this._val('services')) + '</textarea></div><div class="profile-field-group"><label class="profile-label">Products Offered <span class="profile-optional">(optional)</span></label><textarea id="prof-products" class="profile-textarea" rows="3" placeholder="Describe any products your business sells">' + window.escHtml(this._val('products')) + '</textarea></div><div class="profile-field-group"><label class="profile-label">Number of Employees</label><select id="prof-employee-range" class="profile-select"><option value="">Select range</option>' + rangeOptions + '</select></div><div class="profile-field-group"><label class="profile-label">Years in Business</label><input id="prof-years" type="number" class="profile-input profile-input-sm" min="0" max="200" value="' + window.escHtml(String(this._val('years_in_business'))) + '" placeholder="e.g. 5" /></div><div class="profile-save-row"><button id="prof-details-save" class="btn-primary" onclick="window.CL_PROFILE._saveDetails()">Save</button><span id="prof-details-status" class="profile-save-status"></span></div></div>';
  },

  _saveDetails: function() {
    this._saveSection('details', { services: document.getElementById('prof-services').value.trim(), products: document.getElementById('prof-products').value.trim(), employee_range: document.getElementById('prof-employee-range').value, years_in_business: parseInt(document.getElementById('prof-years').value) || null }, 'prof-details-save');
  },

  _renderMarketing: function() {
    const p = this._profile;
    const extras = Array.isArray(p.marketing_theme_extra) ? p.marketing_theme_extra : [];
    let extrasHtml = extras.map(function(item, i) { return '<div class="profile-repeating-row" id="theme-extra-row-' + i + '"><input type="text" class="profile-input theme-extra-input" value="' + window.escHtml(item) + '" placeholder="Additional theme statement" /><button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRepeatingRow(\'theme-extra-row-' + i + '\')">Remove</button></div>'; }).join('');
    document.getElementById('profile-tab-marketing').innerHTML = '<div class="profile-section-card"><h3 class="profile-section-title">Marketing Theme</h3><p class="profile-section-desc">These answers are used across every StaxAI tool to personalise your outputs. The more detail you provide, the better your results.</p><div class="profile-field-group"><label class="profile-label">What do you want your customers to know about your business?</label><textarea id="prof-theme-awareness" class="profile-textarea" rows="3" placeholder="e.g. We have been serving our local community for over 15 years with honest, reliable service">' + window.escHtml(this._val('marketing_theme_awareness')) + '</textarea></div><div class="profile-field-group"><label class="profile-label">What sets you apart from your competitors?</label><textarea id="prof-theme-diff" class="profile-textarea" rows="3" placeholder="e.g. Same-day service, upfront pricing, and a 100% satisfaction guarantee">' + window.escHtml(this._val('marketing_theme_differentiators')) + '</textarea></div><div class="profile-field-group"><label class="profile-label">What feeling do you want customers to have when they interact with you?</label><textarea id="prof-theme-feeling" class="profile-textarea" rows="3" placeholder="e.g. Confident, reassured, and well looked after">' + window.escHtml(this._val('marketing_theme_feeling')) + '</textarea></div><div class="profile-field-group"><label class="profile-label">Additional Theme Statements <span class="profile-optional">(optional)</span></label><div id="theme-extras-container">' + extrasHtml + '</div><button class="btn-outline btn-sm profile-add-btn" onclick="window.CL_PROFILE._addThemeExtra()">+ Add Statement</button></div><div class="profile-save-row"><button id="prof-marketing-save" class="btn-primary" onclick="window.CL_PROFILE._saveMarketing()">Save</button><span id="prof-marketing-status" class="profile-save-status"></span></div></div>';
  },

  _addThemeExtra: function() {
    const container = document.getElementById('theme-extras-container');
    const i = container.children.length;
    const row = document.createElement('div');
    row.className = 'profile-repeating-row';
    row.id = 'theme-extra-row-' + i;
    row.innerHTML = '<input type="text" class="profile-input theme-extra-input" placeholder="Additional theme statement" /><button class="btn-outline btn-sm" onclick="window.CL_PROFILE._removeRepeatingRow(\'theme-extra-row-' + i + '\')">Remove</button>';
    container.appendChild(row);
  },

  _saveMarketing: function() {
    const extras = Array.from(document.querySelectorAll('.theme-extra-input')).map(function(i) { return i.value.trim(); }).filter(Boolean);
    this._saveSection('marketing', { marketing_theme_awareness: document.getElementById('prof-theme-awareness').value.trim(), marketing_theme_differentiators: document.getElementById('prof-theme-diff').value.trim(), marketing_theme_feeling: document.getElementById('prof-theme-feeling').value.trim(), marketing_theme_extra: extras }, 'prof-marketing-save');
  }
};
