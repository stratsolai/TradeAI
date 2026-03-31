// cl-settings-logic.js — Content Library Settings logic
// Part of Content Library split architecture
// Step 6: New file. window.CL_SETTINGS_LOGIC = { init: function(supabase) {} } pattern.
// Reads/writes cl_settings table. Handles auto-scan frequency toggles.

window.CL_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: {},

  init: function(supabase) {
    this._supabase = supabase;
    this._bindToggleButtons();
    this._bindSave();
    var self = this;
    this._loadSettings().then(function() {
      self._bindCategories();
      self._loadCategories();
    });
  },

  // ── BIND TOGGLE BUTTONS ─────────────────────────────────────────────────

  _bindToggleButtons: function() {
    var self = this;
    var allBtns = document.querySelectorAll('.freq-btn');
    allBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var field = btn.getAttribute('data-field');
        var value = btn.getAttribute('data-value');
        if (ctrl) {
          ctrl.querySelectorAll('.freq-btn').forEach(function(b) {
            b.classList.remove('active');
          });
        }
        btn.classList.add('active');
        self._settings[field] = value;
      });
    });
  },

  // ── BIND SAVE ───────────────────────────────────────────────────────────

  _bindSave: function() {
    var self = this;
    var saveBtn = document.getElementById('save-scan-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        self._saveSettings();
      });
    }
  },

  // ── LOAD SETTINGS ────────────────────────────────────────────────────

  _loadSettings: async function() {
    var supabase = this._supabase;
    if (!supabase) return;
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data.user;
      if (!user) return;
      this._userId = user.id;

      var resp = await supabase
        .from('cl_settings')
        .select('email_scan_frequency, drive_scan_frequency, website_scan_frequency')
        .eq('user_id', user.id)
        .maybeSingle();

      if (resp.data) {
        this._settings = {
          email_scan_frequency: resp.data.email_scan_frequency || 'daily',
          drive_scan_frequency: resp.data.drive_scan_frequency || 'weekly',
          website_scan_frequency: resp.data.website_scan_frequency || 'weekly'
        };
      } else {
        this._settings = {
          email_scan_frequency: 'daily',
          drive_scan_frequency: 'weekly',
          website_scan_frequency: 'weekly'
        };
      }

      this._applyToUI();

    } catch (err) {
      console.error('CL_SETTINGS_LOGIC load error:', err);
    }
  },

  // ── APPLY TO UI ─────────────────────────────────────────────────────────

  _applyToUI: function() {
    var self = this;
    var fields = ['email_scan_frequency', 'drive_scan_frequency', 'website_scan_frequency'];
    fields.forEach(function(field) {
      var value = self._settings[field];
      var btns = document.querySelectorAll('.freq-btn[Data-field="' + field + '"]');
      btns.forEach(function(btn) {
        if (btn.getAttribute('data-value') === value) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    });
  },

  // ── SAVE SETTINGS ──────────────────────────────────────────────────────

  _saveSettings: async function() {
    var supabase = this._supabase;
    var userId = this._userId;
    if (!supabase || !userId) return;

    var saveBtn = document.getElementById('save-scan-btn');
    var saveMsg = document.getElementById('save-scan-msg');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    try {
      var updates = {
        user_id: userId,
        email_scan_frequency: this._settings.email_scan_frequency || 'daily',
        drive_scan_frequency: this._settings.drive_scan_frequency || 'weekly',
        website_scan_frequency: this._settings.website_scan_frequency || 'weekly',
        updated_at: new Date().toISOString()
      };

      var resp = await supabase
        .from('cl_settings')
        .upsert(updates, { onConflict: 'user_id' });

      if (resp.error) throw resp.error;
      this._showMsg(saveMsg, 'Saved', false);

    } catch (err) {
      console.error('CL_SETTINGS_LOGIC save error:', err);
      this._showMsg(saveMsg, 'Save failed. Please try again.', true);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Settings'; }
    }
  },

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  _showMsg: function(msgEl, text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = isError ? 'save-msg save-msg-error' : 'save-msg save-msg-ok';
    msgEl.style.display = 'inline';
    setTimeout(function() { msgEl.style.display = 'none'; }, 3500);
  },

  // ── CATEGORIES ──────────────────────────────────────────────────────────

  _activeCategories: [],
  _customCategories: [],

  _loadCategories: async function() {
    var self = this;
    if (!self._supabase || !self._userId) return;
    var result = await self._supabase.from('profiles').select('cl_active_categories, cl_custom_categories').eq('id', self._userId).single();
    if (result.data) {
      self._activeCategories = result.data.cl_active_categories || ["service","about","portfolio","testimonial","offer","team","tip","faq","news","compliance"];
      self._customCategories = result.data.cl_custom_categories || [];
    } else {
      self._activeCategories = ["service","about","portfolio","testimonial","offer","team","tip","faq","news","compliance"];
      self._customCategories = [];
    }
    self._renderCategories();
  },

  _renderCategories: function() {
    var self = this;
    var grid = document.getElementById('category-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var defaults = [
      {id:'service',label:'Services'},{id:'about',label:'About Us'},{id:'portfolio',label:'Portfolio'},
      {id:'testimonial',label:'Testimonials'},{id:'offer',label:'Offers'},{id:'team',label:'Team'},
      {id:'tip',label:'Tips'},{id:'faq',label:'FAQ'},{id:'news',label:'News'},{id:'compliance',label:'Compliance'}
    ];
    var allCats = defaults.slice();
    self._customCategories.forEach(function(id) {
      if (!allCats.find(function(c){ return c.id === id; })) {
        allCats.push({ id: id, label: id.charAt(0).toUpperCase() + id.slice(1) });
      }
    });
    allCats.forEach(function(cat) {
      var isActive = self._activeCategories.indexOf(cat.id) !== -1;
      var row = document.createElement('div');
      row.className = 'settings-row cat-toggle-row';
      row.setAttribute('data-cat-id', cat.id);
      var labelDiv = document.createElement('div');
      labelDiv.className = 'settings-row-label';
      labelDiv.textContent = cat.label;
      var toggle = document.createElement('button');
      toggle.className = 'cat-toggle-btn' + (isActive ? ' active' : '');
      toggle.textContent = isActive ? 'On' : 'Off';
      toggle.addEventListener('click', function() {
        var idx = self._activeCategories.indexOf(cat.id);
        if (idx === -1) {
          self._activeCategories.push(cat.id);
          toggle.classList.add('active');
          toggle.textContent = 'On';
        } else {
          self._activeCategories.splice(idx, 1);
          toggle.classList.remove('active');
          toggle.textContent = 'Off';
        }
      });
      row.appendChild(labelDiv);
      row.appendChild(toggle);
      grid.appendChild(row);
    });
  },
    _bindCategories: function() {
    var self = this;
    var addBtn = document.getElementById('add-category-btn');
    var input = document.getElementById('category-custom-input');
    var saveBtn = document.getElementById('save-categories-btn');
    var msgEl = document.getElementById('save-categories-msg');
    if (addBtn && input) {
      addBtn.addEventListener('click', function() {
        var val = input.value.trim().toLowerCase().replace(/\\s+/g, '-');
        if (!val) return;
        if (self._customCategories.indexOf(val) === -1) {
          self._customCategories.push(val);
          self._activeCategories.push(val);
          self._renderCategories();
        }
        input.value = '';
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        if (!self._supabase || !self._userId) return;
        var result = await self._supabase.from('profiles').update({ cl_active_categories: self._activeCategories, cl_custom_categories: self._customCategories }).eq('id', self._userId);
        if (!result.error && msgEl) {
          msgEl.style.display = 'inline';
          setTimeout(function() { msgEl.style.display = 'none'; }, 3000);
        }
      });
    }
  }

};


// ---- CL Settings: Auth, Account Dropdown & Connections ----

document.addEventListener('DOMContentLoaded', async function() {

  const supabase = window.supabaseClient;
  if (!supabase) { console.error('Supabase not available'); return; }

  // -- Auth --
  const { data: authData } = await supabase.auth.getUser();
  if (!authData || !authData.user) { window.location.href = '/login.html'; return; }
  const user = authData.user;

  // -- Account dropdown --
  const emailShortEl = document.querySelector('#account-email-short');
  if (emailShortEl) emailShortEl.textContent = 'Account';

  const acctBtn = document.querySelector('#account-btn');
  const acctDropdown = document.querySelector('#account-dropdown');
  if (acctBtn && acctDropdown) {
    acctBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      acctDropdown.classList.toggle('open');
    });
    document.addEventListener('click', function() { acctDropdown.classList.remove('open'); });
  }
  const signOutBtn = document.querySelector('#sign-out-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function() {
      await supabase.auth.signOut();
      window.location.href = '/login.html';
    });
  }

  // -- Load profile --
  const { data: profile } = await supabase
    .from('profiles')
    .select('cl_connected_emails, cl_drive_connected, website_urls')
    .eq('id', user.id)
    .single();

  const connectedEmails = (profile && profile.cl_connected_emails) ? profile.cl_connected_emails : [];
  const driveConnected = profile && profile.cl_drive_connected;
  const websiteUrls = (profile && profile.website_urls) ? profile.website_urls : [];
  renderWebsiteUrls();

  // -- Render Gmail connections --
  function renderEmailList(provider) {
    const listEl = document.getElementById(provider + '-connections-list');
    if (!listEl) return;
    const providerEmails = connectedEmails.filter(function(e) { return e.provider === provider; });
    if (providerEmails.length === 0) {
      listEl.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:4px 0;">No accounts connected</div>';
    } else {
      listEl.innerHTML = providerEmails.map(function(e, i) {
        return '<div class="connection-item">' +
          '<div><div class="connection-item-email">' + e.email + '</div></div>' +
          '<button class="btn-disconnect" data-provider="' + provider + '" data-email="' + e.email + '">Disconnect</button>' +
        '</div>';
      }).join('');
      listEl.querySelectorAll('.btn-disconnect').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          await disconnectEmail(btn.getAttribute('data-provider'), btn.getAttribute('data-email'));
        });
      });
    }
  }

  renderEmailList('gmail');
  renderEmailList('outlook');

  // -- Disconnect email --
  async function disconnectEmail(provider, email) {
    const updated = connectedEmails.filter(function(e) { return !(e.provider === provider && e.email === email); });
    const { error } = await supabase.from('profiles').update({ cl_connected_emails: updated }).eq('id', user.id);
    if (!error) {
      connectedEmails.splice(0, connectedEmails.length, ...updated);
      renderEmailList(provider);
    }
  }

  // -- Add Gmail / Outlook buttons --
  ['gmail', 'outlook'].forEach(function(provider) {
    const addBtn = document.getElementById('add-' + provider + '-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function() { handleOAuthConnect(provider); });
    }
  });

  // -- OAuth connect --
  function handleOAuthConnect(provider) {
    const redirectTo = window.location.origin + '/api/auth/oauth-callback.js?flow=cl&provider=' + provider;
    let oauthProvider, scopes;
    if (provider === 'gmail') {
      oauthProvider = 'google';
      scopes = 'email profile https://www.googleapis.com/auth/gmail.readonly';
    } else if (provider === 'outlook') {
      oauthProvider = 'azure';
      scopes = 'email offline_access Mail.Read';
    } else if (provider === 'drive') {
      oauthProvider = 'google';
      scopes = 'email profile https://www.googleapis.com/auth/drive.readonly';
    }
    supabase.auth.signInWithOAuth({
      provider: oauthProvider,
      options: { scopes: scopes, redirectTo: redirectTo, queryParams: { access_type: 'offline', prompt: 'consent' } }
    });
  }

  // -- Google Drive (multi-account) --
  function renderDriveList() {
    const listEl = document.getElementById('drive-connections-list');
    if (!listEl) return;
    const driveAccounts = connectedEmails.filter(function(e) { return e.provider === 'drive'; });
    if (driveAccounts.length === 0) {
      listEl.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:4px 0;">No account connected</div>';
    } else {
      listEl.innerHTML = driveAccounts.map(function(e) {
        return '<div class="connection-item">' +
          '<div><div class="connection-item-email">' + e.email + '</div></div>' +
          '<button class="btn-disconnect" data-provider="drive" data-email="' + e.email + '">Disconnect</button>' +
        '</div>';
      }).join('');
      listEl.querySelectorAll('.btn-disconnect').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          await disconnectEmail('drive', btn.getAttribute('data-email'));
          renderDriveList();
        });
      });
    }
  }
  renderDriveList();

  const addDriveBtn = document.getElementById('add-drive-btn');
  if (addDriveBtn) {
    addDriveBtn.addEventListener('click', function() { handleOAuthConnect('drive'); });
  }

  // -- Website URLs --
  function renderWebsiteUrls() {
    const listEl = document.getElementById('website-urls-list');
    if (!listEl) return;
    const urlsToRender = websiteUrls.length === 0 ? [''] : websiteUrls;
    listEl.innerHTML = urlsToRender.map(function(url) {
        return '<div class="website-url-item">' +
          '<input type="url" class="website-url-input" value="' + url + '" placeholder="https://yourwebsite.com.au" />' +
          '<button class="btn-remove-url" title="Remove">&times;</button>' +
        '</div>';
      }).join('');
      listEl.querySelectorAll('.btn-remove-url').forEach(function(btn, i) {
        btn.addEventListener('click', function() {
          websiteUrls.splice(i, 1);
          renderWebsiteUrls();
        });
      });
  }
  renderWebsiteUrls();

  const addWebsiteBtn = document.getElementById('add-website-btn');
  if (addWebsiteBtn) {
    addWebsiteBtn.addEventListener('click', function() {
      websiteUrls.push('');
      renderWebsiteUrls();
      const inputs = document.querySelectorAll('.website-url-input');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    });
  }

  const websiteSaveBtn = document.getElementById('website-save-btn');
  if (websiteSaveBtn) {
    websiteSaveBtn.addEventListener('click', async function() {
      const inputs = document.querySelectorAll('.website-url-input');
      const urls = Array.from(inputs).map(function(i) { return i.value.trim(); }).filter(function(v) { return v.length > 0; });
      websiteUrls.splice(0, websiteUrls.length, ...urls);
      const { error } = await supabase.from('profiles').update({ website_urls: urls }).eq('id', user.id);
      if (!error) {
        websiteSaveBtn.textContent = 'Saved';
        setTimeout(function() { websiteSaveBtn.textContent = 'Save'; }, 2000);
      }
    });
  }

  // -- Save Settings button (Auto-Scan Frequency) --
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async function() {
      if (window.CL_SETTINGS) window.CL_SETTINGS.init(supabase);
    });
  }

});

window.addEventListener('pageshow', function(e) {
  if (e.persisted) {
    var _esl = document.querySelector('#account-email-short'); if (_esl) _esl.textContent = 'Account';
    var btn = document.querySelector('#account-btn');
    var drop = document.querySelector('#account-dropdown');
    if (btn && drop) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        drop.classList.toggle('open');
      });
      document.addEventListener('click', function() {
        drop.classList.remove('open');
      });
    }
  }
});
