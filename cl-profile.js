// cl-profile.js — Business Profile tab logic
// Part of Content Library split architecture
// Step 5: New file. window.CL_PROFILE = { init: function(supabase) {} } pattern.
// All sections save independently to profiles table. No single save-all button.

window.CL_PROFILE = {

  _supabase: null,
  _userId: null,

  init: function(supabase) {
    this._supabase = supabase;
    this._renderProfileTab();
    this._loadProfile();
  },

  // ── RENDER PROFILE TAB ──────────────────────────────────────────────────────

  _renderProfileTab: function() {
    var container = document.getElementById('tab-profile');
    if (!container) return;
    container.innerHTML =
      '<div class="profile-tab-inner">' +

        // IDENTITY
        '<div class="profile-section" id="profile-section-identity">' +
          '<div class="profile-section-header">' +
            '<div class="profile-section-title">Identity</div>' +
          '</div>' +
          '<div class="profile-fields">' +
            '<div class="profile-field">' +
              '<label class="profile-label">Legal Name</label>' +
              '<input type="text" id="prof-business-name" class="profile-input" placeholder="Your registered business name" />' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Trading Name / t/as <span class="profile-optional">(optional)</span></label>' +
              '<input type="text" id="prof-trading-name" class="profile-input" placeholder="Trading name if different from legal name" />' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">ABN</label>' +
              '<input type="text" id="prof-abn" class="profile-input" placeholder="xx xxx xxx xxx" maxlength="14" />' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Business Structure</label>' +
              '<select id="prof-business-structure" class="profile-select">' +
                '<option value="">Select structure</option>' +
                '<option value="Sole Trader">Sole Trader</option>' +
                '<option value="Partnership">Partnership</option>' +
                '<option value="Company">Company</option>' +
                '<option value="Trust">Trust</option>' +
                '<option value="Other">Other</option>' +
              '</select>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Industry</label>' +
              '<select id="prof-industry" class="profile-select">' +
                '<option value="">Select industry</option>' +
                '<option value="Pool Builder">Pool Builder</option>' +
                '<option value="Plumber">Plumber</option>' +
                '<option value="Electrician">Electrician</option>' +
                '<option value="Builder">Builder</option>' +
                '<option value="HVAC">HVAC</option>' +
                '<option value="Fabricator">Fabricator</option>' +
                '<option value="Cleaner">Cleaner</option>' +
                '<option value="Landscaper">Landscaper</option>' +
                '<option value="Manufacturer">Manufacturer</option>' +
                '<option value="Concreter">Concreter</option>' +
                '<option value="Handyman">Handyman</option>' +
                '<option value="Other">Other</option>' +
              '</select>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Logo</label>' +
              '<div class="logo-upload-row">' +
                '<div id="prof-logo-preview" class="logo-preview" style="display:none"></div>' +
                '<label for="prof-logo-input" class="btn-logo-upload">Choose Logo</label>' +
                '<input type="file" id="prof-logo-input" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" style="display:none" />' +
                '<span id="prof-logo-filename" class="logo-filename"></span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="profile-section-footer">' +
            '<button id="save-identity-btn" class="btn-profile-save">Save Identity</button>' +
            '<span id="save-identity-msg" class="save-msg" style="display:none"></span>' +
          '</div>' +
        '</div>' +

              '<input type="tel" id="prof-phone" class="profile-input" placeholder="Primary phone number" />' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Additional Phone Numbers</label>' +
              '<div id="prof-additional-phones" class="repeating-field-list"></div>' +
              '<button type="button" id="add-phone-btn" class="btn-add-field">+ Add phone number</button>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Website URL(s)</label>' +
              '<div id="prof-website-urls" class="repeating-field-list"></div>' +
              '<button type="button" id="add-website-btn" class="btn-add-field">+ Add website URL</button>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Multiple Locations</label>' +
              '<div class="toggle-row">' +
                '<span class="toggle-label-off">Single location</span>' +
                '<label class="toggle-switch">' +
                  '<input type="checkbox" id="prof-multi-location" />' +
                  '<span class="toggle-slider"></span>' +
                '</label>' +
                '<span class="toggle-label-on">Multiple locations</span>' +
              '</div>' +
            '</div>' +
            '<div id="additional-locations-section" style="display:none">' +
              '<div class="profile-field">' +
                '<label class="profile-label">Additional Locations</label>' +
                '<div id="prof-additional-locations" class="additional-locations-list"></div>' +
                '<button type="button" id="add-location-btn" class="btn-add-field">+ Add location</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="profile-section-footer">' +
            '<button id="save-location-btn" class="btn-profile-save">Save Location &amp; Contact</button>' +
            '<span id="save-location-msg" class="save-msg" style="display:none"></span>' +
          '</div>' +
        '</div>' +

        // BUSINESS DETAILS
        '<div class="profile-section" id="profile-section-details">' +
          '<div class="profile-section-header">' +
            '<div class="profile-section-title">Business Details</div>' +
          '</div>' +
          '<div class="profile-fields">' +
            '<div class="profile-field">' +
              '<label class="profile-label">Services Provided</label>' +
              '<textarea id="prof-services" class="profile-textarea" rows="4" placeholder="High-level description of what your business does"></textarea>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Products Offered <span class="profile-optional">(optional)</span></label>' +
              '<textarea id="prof-products" class="profile-textarea" rows="3" placeholder="Products your business sells or installs"></textarea>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Number of Employees</label>' +
              '<select id="prof-employee-range" class="profile-select">' +
                '<option value="">Select range</option>' +
                '<option value="1">1</option>' +
                '<option value="2-5">2&#8211;5</option>' +
                '<option value="6-10">6&#8211;10</option>' +
                '<option value="11-20">11&#8211;20</option>' +
                '<option value="21-50">21&#8211;50</option>' +
                '<option value="50+">50+</option>' +
              '</select>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Years in Business</label>' +
              '<input type="number" id="prof-years-in-business" class="profile-input profile-input-short" min="0" max="200" placeholder="e.g. 12" />' +
            '</div>' +
          '</div>' +
          '<div class="profile-section-footer">' +
            '<button id="save-details-btn" class="btn-profile-save">Save Business Details</button>' +
            '<span id="save-details-msg" class="save-msg" style="display:none"></span>' +
          '</div>' +
        '</div>' +

        // MARKETING THEME
        '<div class="profile-section" id="profile-section-marketing">' +
          '<div class="profile-section-header">' +
            '<div class="profile-section-title">Marketing Theme</div>' +
            '<div class="profile-section-hint">Your answers are used by every AI tool to personalise its output for your business. The more detail you add, the better the results.</div>' +
          '</div>' +
          '<div class="profile-fields">' +
            '<div class="profile-field">' +
              '<label class="profile-label">What do you want your customers to know about your business?</label>' +
              '<div class="profile-hint">e.g. easy to work with, fast response, local experts, family owned</div>' +
              '<textarea id="prof-theme-awareness" class="profile-textarea" rows="3" placeholder="What you want customers to know"></textarea>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">What sets you apart from your competitors?</label>' +
              '<div class="profile-hint">e.g. 20 years experience, specialist in heritage buildings, award winning service</div>' +
              '<textarea id="prof-theme-differentiators" class="profile-textarea" rows="3" placeholder="What makes you different"></textarea>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">What feeling do you want customers to have when they interact with you?</label>' +
              '<div class="profile-hint">e.g. confident, reassured, excited, in safe hands</div>' +
              '<textarea id="prof-theme-feeling" class="profile-textarea" rows="3" placeholder="The feeling you want to create"></textarea>' +
            '</div>' +
            '<div class="profile-field">' +
              '<label class="profile-label">Additional Theme Statements <span class="profile-optional">(optional)</span></label>' +
              '<div id="prof-theme-extra" class="repeating-field-list"></div>' +

              '<button type="button" id="add-theme-extra-btn" class="btn-add-field">+ Add statement</button>' +
            '</div>' +
          '</div>' +
          '<div class="profile-section-footer">' +
            '<button id="save-marketing-btn" class="btn-profile-save">Save Marketing Theme</button>' +
            '<span id="save-marketing-msg" class="save-msg" style="display:none"></span>' +
          '</div>' +
        '</div>' +

        // CONNECTIONS
        '<div class="profile-section" id="profile-section-connections">' +
          '<div class="profile-section-header">' +
            '<div class="profile-section-title">Connections</div>' +
            '<div class="profile-section-hint">Connect your business accounts so the Content Library can automatically import content and intelligence from your existing sources.</div>' +
          '</div>' +
          '<div class="connections-list">' +

            '<div class="connection-row" id="conn-row-gmail">' +
              '<div class="connection-row-info">' +
                '<div class="connection-row-icon">&#128139;</div>' +
                '<div class="connection-row-text">' +
                  '<div class="connection-row-name">Business Email (Gmail)</div>' +
                  '<div class="connection-row-desc">Scans your business inbox for supplier updates, industry news, and content. Separate from your personal Email Assistant.</div>' +
                '</div>' +
              '</div>' +
              '<div class="connection-row-action">' +
                '<span id="conn-gmail-badge" class="conn-badge conn-badge-checking">Checking...</span>' +
                '<button id="conn-gmail-btn" class="btn-conn-connect" style="display:none">Connect</button>' +
                '<button id="conn-gmail-disconnect-btn" class="btn-conn-disconnect" style="display:none">Disconnect</button>' +
              '</div>' +
            '</div>' +

            '<div class="connection-row" id="conn-row-outlook">' +
              '<div class="connection-row-info">' +
                '<div class="connection-row-icon">&#128139;</div>' +
                '<div class="connection-row-text">' +
                  '<div class="connection-row-name">Business Email (Outlook)</div>' +
                  '<div class="connection-row-desc">Scans your business Outlook inbox for supplier updates, industry news, and content. Separate from your personal Email Assistant.</div>' +
                '</div>' +
              '</div>' +
              '<div class="connection-row-action">' +
                '<span id="conn-outlook-badge" class="conn-badge conn-badge-checking">Checking...</span>' +
                '<button id="conn-outlook-btn" class="btn-conn-connect" style="display:none">Connect</button>' +
                '<button id="conn-outlook-disconnect-btn" class="btn-conn-disconnect" style="display:none">Disconnect</button>' +
              '</div>' +
            '</div>' +

            '<div class="connection-row" id="conn-row-gdrive">' +
              '<div class="connection-row-info">' +
                '<div class="connection-row-icon">&#128193;</div>' +
                '<div class="connection-row-text">' +
                  '<div class="connection-row-name">Google Drive</div>' +
                  '<div class="connection-row-desc">Imports photos and documents from your Drive folders into the Content Library.</div>' +
                '</div>' +
              '</div>' +
              '<div class="connection-row-action">' +
                '<span id="conn-gdrive-badge" class="conn-badge conn-badge-checking">Checking...</span>' +
                '<button id="conn-gdrive-btn" class="btn-conn-connect" style="display:none">Connect</button>' +
                '<button id="conn-gdrive-disconnect-btn" class="btn-conn-disconnect" style="display:none">Disconnect</button>' +
              '</div>' +
            '</div>' +

            '<div class="connection-row" id="conn-row-website">' +
              '<div class="connection-row-info">' +
                '<div class="connection-row-icon">&#127760;</div>' +
                '<div class="connection-row-text">' +
                  '<div class="connection-row-name">Website</div>' +
                  '<div class="connection-row-desc">AI scans your website pages to extract services, team info, testimonials, and content.</div>' +
                '</div>' +
              '</div>' +
              '<div class="connection-row-action">' +
                '<span id="conn-website-badge" class="conn-badge conn-badge-checking">Checking...</span>' +
                '<input type="url" id="conn-website-url" class="conn-url-input" placeholder="https://yourwebsite.com.au" style="display:none" />' +
                '<button id="conn-website-save-btn" class="btn-conn-connect" style="display:none">Save URL</button>' +
                '<button id="conn-website-edit-btn" class="btn-conn-connect" style="display:none">Edit URL</button>' +
              '</div>' +
            '</div>' +

          '</div>' +
          '<div class="profile-section-footer">' +
            '<span id="save-connections-msg" class="save-msg" style="display:none"></span>' +
          '</div>' +
        '</div>' +

      '</div>';

    this._bindEvents();
  },

  // ── LOAD PROFILE ────────────────────────────────────────────────────────────

  _loadProfile: async function() {
    var supabase = this._supabase;
    if (!supabase) return;
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data.user;
      if (!user) return;
      this._userId = user.id;

      var resp = await supabase
        .from('profiles')
        .select('business_name, trading_name, abn, business_structure, industry, logo_url, address_street, address_suburb, address_state, address_postcode, phone, additional_phones, website_urls, is_multi_location, additional_locations, services, products, employee_range, years_in_business, marketing_theme_awareness, marketing_theme_differentiators, marketing_theme_feeling, marketing_theme_extra, business_email_gmail, business_email_outlook, gdrive_connected')
        .eq('user_id', user.id)
        .single();

      var p = resp.data;
      if (!p) return;

      // Identity
      this._setVal('prof-business-name', p.business_name);
      this._setVal('prof-trading-name', p.trading_name);
      this._setVal('prof-abn', p.abn);
      this._setSelect('prof-business-structure', p.business_structure);
      this._setSelect('prof-industry', p.industry);
      if (p.logo_url) {
        var preview = document.getElementById('prof-logo-preview');
        if (preview) {
          preview.innerHTML = '<img src="' + p.logo_url + '" alt="Logo" class="logo-preview-img" />';
          preview.style.display = 'block';
        }
      }

      // Location
      this._setVal('prof-address-street', p.address_street);
      this._setVal('prof-address-suburb', p.address_suburb);
      this._setSelect('prof-address-state', p.address_state);
      this._setVal('prof-address-postcode', p.address_postcode);
      this._setVal('prof-phone', p.phone);
      this._renderRepeatingList('prof-additional-phones', p.additional_phones || [], 'tel', 'Phone number');
      this._renderRepeatingList('prof-website-urls', p.website_urls || [], 'url', 'https://');
      var multiToggle = document.getElementById('prof-multi-location');
      if (multiToggle) {
        multiToggle.checked = !!p.is_multi_location;
        var locSection = document.getElementById('additional-locations-section');
        if (locSection) locSection.style.display = p.is_multi_location ? 'block' : 'none';
      }
      if (p.additional_locations) {
        this._renderAdditionalLocations(p.additional_locations);
      }

      // Business Details
      this._setVal('prof-services', p.services);
      this._setVal('prof-products', p.products);
      this._setSelect('prof-employee-range', p.employee_range);
      this._setVal('prof-years-in-business', p.years_in_business);

      // Marketing Theme
      this._setVal('prof-theme-awareness', p.marketing_theme_awareness);
      this._setVal('prof-theme-differentiators', p.marketing_theme_differentiators);
      this._setVal('prof-theme-feeling', p.marketing_theme_feeling);
      this._renderRepeatingList('prof-theme-extra', p.marketing_theme_extra || [], 'text', 'Additional theme statement');

      // Connections
      this._updateConnBadge('gmail', !!p.business_email_gmail);
      this._updateConnBadge('outlook', !!p.business_email_outlook);
      this._updateConnBadge('gdrive', !!p.gdrive_connected);
      // Website — check if website_urls has a value
      var websiteUrl = (p.website_urls && p.website_urls.length > 0) ? p.website_urls[0] : null;
      this._updateWebsiteBadge(websiteUrl);

    } catch (err) {
      console.error('CL_PROFILE load error:', err);
    }
  },

  // ── BIND EVENTS ─────────────────────────────────────────────────────────────

  _bindEvents: function() {
    var self = this;

    // Save buttons
    var saveBtn = function(btnId, fn) {
      var btn = document.getElementById(btnId);
      if (btn) btn.addEventListener('click', function() { fn.call(self); });
    };
    saveBtn('save-identity-btn', this._saveIdentity);
    saveBtn('save-location-btn', this._saveLocation);
    saveBtn('save-details-btn', this._saveDetails);
    saveBtn('save-marketing-btn', this._saveMarketing);

    // Repeating field add buttons
    var addBtn = function(btnId, listId, type, placeholder) {
      var btn = document.getElementById(btnId);
      if (btn) btn.addEventListener('click', function() {
        self._addRepeatingField(listId, type, placeholder);
      });
    };
    addBtn('add-phone-btn', 'prof-additional-phones', 'tel', 'Phone number');
    addBtn('add-website-btn', 'prof-website-urls', 'url', 'https://');
    addBtn('add-theme-extra-btn', 'prof-theme-extra', 'text', 'Additional theme statement');
    addBtn('add-location-btn', 'prof-additional-locations', '_location', '');

    // Multi-location toggle
    var multiToggle = document.getElementById('prof-multi-location');
    if (multiToggle) {
      multiToggle.addEventListener('change', function() {
        var locSection = document.getElementById('additional-locations-section');
        if (locSection) locSection.style.display = multiToggle.checked ? 'block' : 'none';
      });
    }

    // Logo upload
    var logoInput = document.getElementById('prof-logo-input');
    if (logoInput) {
      logoInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files[0]) {
          self._handleLogoUpload(e.target.files[0]);
        }
      });
    }

    // Connection buttons
    var connBtn = function(btnId, fn) {
      var btn = document.getElementById(btnId);
      if (btn) btn.addEventListener('click', function() { fn.call(self); });
    };
    connBtn('conn-gmail-btn', this._connectGmail);
    connBtn('conn-gmail-disconnect-btn', this._disconnectGmail);
    connBtn('conn-outlook-btn', this._connectOutlook);
    connBtn('conn-outlook-disconnect-btn', this._disconnectOutlook);
    connBtn('conn-gdrive-btn', this._connectGdrive);
    connBtn('conn-gdrive-disconnect-btn', this._disconnectGdrive);
    connBtn('conn-website-save-btn', this._saveWebsiteUrl);
    connBtn('conn-website-edit-btn', this._editWebsiteUrl);
  },

  // ── SAVE IDENTITY ────────────────────────────────────────────────────────────

  _saveIdentity: async function() {
    var updates = {
      business_name: this._getVal('prof-business-name'),
      trading_name: this._getVal('prof-trading-name'),
      abn: this._getVal('prof-abn'),
      business_structure: this._getVal('prof-business-structure'),
      industry: this._getVal('prof-industry')
    };
    await this._saveSection(updates, 'save-identity-btn', 'save-identity-msg');
  },

  // ── SAVE LOCATION ────────────────────────────────────────────────────────────

  _saveLocation: async function() {
    var multiToggle = document.getElementById('prof-multi-location');
    var updates = {
      address_street: this._getVal('prof-address-street'),
      address_suburb: this._getVal('prof-address-suburb'),
      address_state: this._getVal('prof-address-state'),
      address_postcode: this._getVal('prof-address-postcode'),
      phone: this._getVal('prof-phone'),
      additional_phones: this._getRepeatingValues('prof-additional-phones'),
      website_urls: this._getRepeatingValues('prof-website-urls'),
      is_multi_location: multiToggle ? multiToggle.checked : false,
      additional_locations: this._getAdditionalLocations()
    };
    await this._saveSection(updates, 'save-location-btn', 'save-location-msg');
  },

  // ── SAVE BUSINESS DETAILS ────────────────────────────────────────────────────

  _saveDetails: async function() {
    var yearsVal = this._getVal('prof-years-in-business');
    var updates = {
      services: this._getVal('prof-services'),
      products: this._getVal('prof-products'),
      employee_range: this._getVal('prof-employee-range'),
      years_in_business: yearsVal ? parseInt(yearsVal, 10) : null
    };
    await this._saveSection(updates, 'save-details-btn', 'save-details-msg');
  },

  // ── SAVE MARKETING THEME ─────────────────────────────────────────────────────

  _saveMarketing: async function() {
    var updates = {
      marketing_theme_awareness: this._getVal('prof-theme-awareness'),
      marketing_theme_differentiators: this._getVal('prof-theme-differentiators'),
      marketing_theme_feeling: this._getVal('prof-theme-feeling'),
      marketing_theme_extra: this._getRepeatingValues('prof-theme-extra')
    };
    await this._saveSection(updates, 'save-marketing-btn', 'save-marketing-msg');
  },

  // ── SAVE SECTION (shared) ────────────────────────────────────────────────────

  _saveSection: async function(updates, btnId, msgId) {
    var supabase = this._supabase;
    var userId = this._userId;
    if (!supabase || !userId) return;
    var btn = document.getElementById(btnId);
    var msg = document.getElementById(msgId);
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    try {
      var resp = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', userId);
      if (resp.error) throw resp.error;
      this._showSaveMsg(msg, 'Saved', false);
    } catch (err) {
      console.error('CL_PROFILE save error:', err);
      this._showSaveMsg(msg, 'Save failed. Please try again.', true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.textContent.replace('Saving...', btn.getAttribute('data-label') || btn.textContent);
      }
    }
  },

  // ── LOGO UPLOAD ──────────────────────────────────────────────────────────────

  _handleLogoUpload: async function(file) {
    var supabase = this._supabase;
    var userId = this._userId;
    if (!supabase || !userId) return;
    var filename = document.getElementById('prof-logo-filename');
    if (filename) filename.textContent = 'Uploading...';
    try {
      var ext = file.name.split('.').pop();
      var path = userId + '/logo.' + ext;
      var uploadResp = await supabase.storage
        .from('cl-assets')
        .upload(path, file, { upsert: true });
      if (uploadResp.error) throw uploadResp.error;
      var urlResp = supabase.storage.from('cl-assets').getPublicUrl(path);
      var logoUrl = urlResp.data.publicUrl;
      // Save URL to profiles
      await supabase.from('profiles').update({ logo_url: logoUrl }).eq('user_id', userId);
      // Show preview
      var preview = document.getElementById('prof-logo-preview');
      if (preview) {
        preview.innerHTML = '<img src="' + logoUrl + '" alt="Logo" class="logo-preview-img" />';
        preview.style.display = 'block';
      }
      if (filename) filename.textContent = 'Logo uploaded';
    } catch (err) {
      console.error('Logo upload error:', err);
      if (filename) filename.textContent = 'Upload failed. Please try again.';
    }
  },

  // ── CONNECTIONS ──────────────────────────────────────────────────────────────

  _updateConnBadge: function(type, isConnected) {
    var badge = document.getElementById('conn-' + type + '-badge');
    var connectBtn = document.getElementById('conn-' + type + '-btn');
    var disconnectBtn = document.getElementById('conn-' + type + '-disconnect-btn');
    if (!badge) return;
    if (isConnected) {
      badge.textContent = 'Connected';
      badge.className = 'conn-badge conn-badge-connected';
      if (connectBtn) connectBtn.style.display = 'none';
      if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
    } else {
      badge.textContent = 'Not connected';
      badge.className = 'conn-badge conn-badge-disconnected';
      if (connectBtn) connectBtn.style.display = 'inline-block';
      if (disconnectBtn) disconnectBtn.style.display = 'none';
    }
  },

  _updateWebsiteBadge: function(url) {
    var badge = document.getElementById('conn-website-badge');
    var saveBtn = document.getElementById('conn-website-save-btn');
    var editBtn = document.getElementById('conn-website-edit-btn');
    var urlInput = document.getElementById('conn-website-url');
    if (!badge) return;
    if (url) {
      badge.textContent = url;
      badge.className = 'conn-badge conn-badge-connected';
      if (urlInput) urlInput.style.display = 'none';
      if (saveBtn) saveBtn.style.display = 'none';
      if (editBtn) editBtn.style.display = 'inline-block';
    } else {
      badge.textContent = 'Not configured';
      badge.className = 'conn-badge conn-badge-disconnected';
      if (urlInput) { urlInput.style.display = 'inline-block'; }
      if (saveBtn) saveBtn.style.display = 'inline-block';
      if (editBtn) editBtn.style.display = 'none';
    }
  },

  _connectGmail: function() {
    // OAuth flow — redirect to Google OAuth endpoint via Supabase
    var self = this;
    if (!this._supabase) return;
    this._supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { scopes: 'https://www.googleapis.com/auth/gmail.readonly', redirectTo: window.location.href }
    }).then(function() {
      // On return, webhook or callback sets business_email_gmail = true
      self._updateConnBadge('gmail', true);
    });
  },

  _disconnectGmail: async function() {
    await this._saveSection({ business_email_gmail: false }, 'conn-gmail-disconnect-btn', 'save-connections-msg');
    this._updateConnBadge('gmail', false);
  },

  _connectOutlook: function() {
    var self = this;
    if (!this._supabase) return;
    this._supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'Mail.Read', redirectTo: window.location.href }
    }).then(function() {
      self._updateConnBadge('outlook', true);
    });
  },

  _disconnectOutlook: async function() {
    await this._saveSection({ business_email_outlook: false }, 'conn-outlook-disconnect-btn', 'save-connections-msg');
    this._updateConnBadge('outlook', false);
  },

  _connectGdrive: function() {
    var self = this;
    if (!this._supabase) return;
    this._supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { scopes: 'https://www.googleapis.com/auth/drive.readonly', redirectTo: window.location.href }
    }).then(function() {
      self._updateConnBadge('gdrive', true);
    });
  },

  _disconnectGdrive: async function() {
    await this._saveSection({ gdrive_connected: false }, 'conn-gdrive-disconnect-btn', 'save-connections-msg');
    this._updateConnBadge('gdrive', false);
  },

  _saveWebsiteUrl: async function() {
    var urlInput = document.getElementById('conn-website-url');
    var url = urlInput ? urlInput.value.trim() : '';
    if (!url) return;
    await this._saveSection({ website_urls: [url] }, 'conn-website-save-btn', 'save-connections-msg');
    this._updateWebsiteBadge(url);
  },

  _editWebsiteUrl: function() {
    var urlInput = document.getElementById('conn-website-url');
    var saveBtn = document.getElementById('conn-website-save-btn');
    var editBtn = document.getElementById('conn-website-edit-btn');
    var badge = document.getElementById('conn-website-badge');
    if (urlInput) urlInput.style.display = 'inline-block';
    if (saveBtn) saveBtn.style.display = 'inline-block';
    if (editBtn) editBtn.style.display = 'none';
    if (badge) { badge.textContent = 'Not configured'; badge.className = 'conn-badge conn-badge-disconnected'; }
  },

  // ── REPEATING FIELDS ─────────────────────────────────────────────────────────

  _renderRepeatingList: function(containerId, values, type, placeholder) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    (values || []).forEach(function(val) {
      container.appendChild(window.CL_PROFILE._makeRepeatingRow(val, type, placeholder));
    });
  },

  _addRepeatingField: function(containerId, type, placeholder) {
    if (type === '_location') {
      this._addLocationRow();
      return;
    }
    var container = document.getElementById(containerId);
    if (!container) return;
    container.appendChild(this._makeRepeatingRow('', type, placeholder));
  },

  _makeRepeatingRow: function(value, type, placeholder) {
    var row = document.createElement('div');
    row.className = 'repeating-row';
    var input = document.createElement('input');
    input.type = type === '_location' ? 'text' : type;
    input.className = 'profile-input repeating-input';
    input.placeholder = placeholder;
    input.value = value || '';
    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-field';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', function() { row.remove(); });
    row.appendChild(input);
    row.appendChild(removeBtn);
    return row;
  },

  _getRepeatingValues: function(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return [];
    var inputs = container.querySelectorAll('.repeating-input');
    var values = [];
    inputs.forEach(function(input) {
      var v = input.value.trim();
      if (v) values.push(v);
    });
    return values;
  },

  // ── ADDITIONAL LOCATIONS ─────────────────────────────────────────────────────

  _renderAdditionalLocations: function(locations) {
    var container = document.getElementById('prof-additional-locations');
    if (!container) return;
    container.innerHTML = '';
    (locations || []).forEach(function(loc) {
      window.CL_PROFILE._addLocationRow(loc);
    });
    var locSection = document.getElementById('additional-locations-section');
    if (locSection && locations && locations.length > 0) locSection.style.display = 'block';
  },

  _addLocationRow: function(loc) {
    var container = document.getElementById('prof-additional-locations');
    if (!container) return;
    loc = loc || {};
    var row = document.createElement('div');
    row.className = 'location-row';
    row.innerHTML =
      '<div class="location-row-fields">' +
        '<input type="text" class="profile-input loc-name" placeholder="Location name" value="' + (loc.name || '') + '" />' +
        '<input type="text" class="profile-input loc-street" placeholder="Street address" value="' + (loc.street || '') + '" />' +
        '<input type="text" class="profile-input loc-suburb" placeholder="Suburb" value="' + (loc.suburb || '') + '" />' +
        '<input type="text" class="profile-input loc-state" placeholder="State" value="' + (loc.state || '') + '" />' +
        '<input type="text" class="profile-input loc-postcode" placeholder="Postcode" value="' + (loc.postcode || '') + '" />' +
        '<input type="tel" class="profile-input loc-phone" placeholder="Phone" value="' + (loc.phone || '') + '" />' +
      '</div>' +
      '<button type="button" class="btn-remove-field">Remove</button>';
    row.querySelector('.btn-remove-field').addEventListener('click', function() { row.remove(); });
    container.appendChild(row);
  },

  _getAdditionalLocations: function() {
    var container = document.getElementById('prof-additional-locations');
    if (!container) return [];
    var rows = container.querySelectorAll('.location-row');
    var locs = [];
    rows.forEach(function(row) {
      locs.push({
        name: (row.querySelector('.loc-name') || {}).value || '',
        street: (row.querySelector('.loc-street') || {}).value || '',
        suburb: (row.querySelector('.loc-suburb') || {}).value || '',
        state: (row.querySelector('.loc-state') || {}).value || '',
        postcode: (row.querySelector('.loc-postcode') || {}).value || '',
        phone: (row.querySelector('.loc-phone') || {}).value || ''
      });
    });
    return locs;
  },

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  _setVal: function(id, val) {
    var el = document.getElementById(id);
    if (el && val != null) el.value = val;
  },

  _getVal: function(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  },

  _setSelect: function(id, val) {
    var el = document.getElementById(id);
    if (el && val != null) el.value = val;
  },

  _showSaveMsg: function(msgEl, text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = isError ? 'save-msg save-msg-error' : 'save-msg save-msg-ok';
    msgEl.style.display = 'inline';
    setTimeout(function() { msgEl.style.display = 'none'; }, 3500);
  }

};
