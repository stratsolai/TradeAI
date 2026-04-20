window.EA_SETTINGS = {
  _supabase: null,
  _userId: null,
  _eaEmails: [],
  _settings: {},
  _categories: [],
  _categoryShortcuts: ['enquiries', 'projects'],

  init: function () {
    var self = this;
    self._supabase = window.supabaseClient;
    self._bindTabs();

    self._supabase.auth.getUser().then(function (res) {
      if (!res || !res.data || !res.data.user) { window.location.href = '/login'; return; }
      self._userId = res.data.user.id;
      document.getElementById('page-wrap').style.display = 'block';
      self._loadAll();
      self._bindEventDelegation();
      self._bindPermissionModal();
      self._bindSaveMsgDismiss();
    });
  },

  // ── TABS ──
  _bindTabs: function () {
    document.querySelectorAll('.ptab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.ptab').forEach(function (b) { b.classList.remove('settings-active'); });
        document.querySelectorAll('.ptab-content').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('settings-active');
        var panel = document.getElementById('tab-' + btn.getAttribute('data-tab'));
        if (panel) panel.classList.add('active');
      });
    });
  },

  // ── LOAD ──
  _loadAll: async function () {
    var self = this;
    await Promise.all([self._loadConnections(), self._loadSettings()]);
    self._renderScanFrequency();
  },

  _loadConnections: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('profiles')
        .select('ea_connected_emails')
        .eq('id', self._userId)
        .single();
      if (res.error) { console.error('[EA Settings] loadConnections error:', res.error); }
      if (res.data && Array.isArray(res.data.ea_connected_emails)) {
        self._eaEmails = res.data.ea_connected_emails;
      } else {
        self._eaEmails = [];
      }
    } catch (e) { console.error('[EA Settings] loadConnections exception:', e); self._eaEmails = []; }
    self._renderEmailList();
  },

  _loadSettings: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('email_assistant_settings')
        .select('*')
        .eq('user_id', self._userId)
        .maybeSingle();
      if (res.error) { console.error('[EA Settings] loadSettings query error:', res.error); }
      if (res.data) self._settings = res.data;
    } catch (e) { console.error('[EA Settings] loadSettings error:', e.message); }

    var DEFAULT_CATS = [
      { id: 'urgent', label: 'Urgent', description: 'Emails requiring immediate attention or a same-day response', enabled: true },
      { id: 'enquiries', label: 'Leads', description: 'New enquiries and expressions of interest from potential customers', enabled: true },
      { id: 'projects', label: 'Projects', description: 'Emails related to active or upcoming work, projects, and jobs', enabled: true },
      { id: 'financial', label: 'Financial', description: 'Invoices, statements, receipts, payments, and financial correspondence', enabled: true },
      { id: 'customers', label: 'Customers', description: 'Correspondence from existing customers including service requests, follow-ups, and feedback', enabled: true },
      { id: 'operations', label: 'Operations', description: 'Supplier, staff, compliance, and general business correspondence', enabled: true },
      { id: 'newsletters', label: 'Newsletters / Marketing', description: 'Promotional emails, newsletters, industry updates, and marketing material', enabled: true },
      { id: 'other', label: 'Other', description: 'Emails that do not clearly fit any other category', enabled: true }
    ];
    var defaultIds = DEFAULT_CATS.map(function(c) { return c.id; });

    if (Array.isArray(self._settings.categories) && self._settings.categories.length > 0) {
      // Build cleaned list: defaults first (preserving saved enabled state), then any valid custom categories
      var savedById = {};
      self._settings.categories.forEach(function(c) { if (c && c.id) savedById[c.id] = c; });
      // Rebuild defaults with saved enabled state preserved
      var cleaned = DEFAULT_CATS.map(function(def) {
        var saved = savedById[def.id];
        return { id: def.id, label: def.label, description: def.description, enabled: (saved && saved.enabled === false) ? false : def.enabled };
      });
      // Append user-defined custom categories (IDs not in default list)
      var custom = self._settings.categories.filter(function(c) {
        return c && c.id && defaultIds.indexOf(c.id) === -1 && c.description;
      });
      cleaned = cleaned.concat(custom);
      self._categories = cleaned;
      // Save if the list changed (e.g. old defaults without descriptions were cleaned up)
      if (cleaned.length !== self._settings.categories.length) {
        self._settings.categories = cleaned;
        self._saveSettings();
      }
    } else {
      self._categories = DEFAULT_CATS;
    }

    // Load category shortcuts — default to Leads and Projects, normalise labels to IDs
    if (Array.isArray(self._settings.category_shortcuts) && self._settings.category_shortcuts.length > 0) {
      var scCats = self._categories;
      self._categoryShortcuts = self._settings.category_shortcuts.map(function(val) {
        var byLabel = scCats.find(function(c) { return c.label === val; });
        return byLabel ? byLabel.id : val;
      });
    } else {
      self._categoryShortcuts = ['enquiries', 'projects'];
    }

    self._renderCategories();
    self._renderShortcuts();
    self._bindScanSave();
    self._bindCategorySave();
  },

  // ── CONNECTIONS ──
  _renderEmailList: function () {
    var self = this;
    var gmailList = document.getElementById('gmail-connections-list');
    var outlookList = document.getElementById('outlook-connections-list');
    if (!gmailList || !outlookList) return;

    var gmails = self._eaEmails.filter(function (e) { return e && (e.provider === 'gmail' || e.provider === 'google'); });
    var outlooks = self._eaEmails.filter(function (e) { return e && (e.provider === 'microsoft' || e.provider === 'outlook'); });

    gmailList.innerHTML = gmails.map(function (e) {
      return '<div class="connection-item">' +
        '<div class="connection-item-row1">' +
          '<span class="connection-item-email">' + (e.email || '') + '</span>' +
          '<button class="btn-disconnect" data-email="' + (e.email || '') + '" data-type="email">Disconnect</button>' +
        '</div>' +
        '<div class="connection-item-row2">' +
          self._buildLookbackHtml('gmail', e.email, e.lookback_days) +
        '</div>' +
      '</div>';
    }).join('');

    outlookList.innerHTML = outlooks.map(function (e) {
      return '<div class="connection-item">' +
        '<div class="connection-item-row1">' +
          '<span class="connection-item-email">' + (e.email || '') + '</span>' +
          '<button class="btn-disconnect" data-email="' + (e.email || '') + '" data-type="email">Disconnect</button>' +
        '</div>' +
        '<div class="connection-item-row2">' +
          self._buildLookbackHtml('outlook', e.email, e.lookback_days) +
        '</div>' +
      '</div>';
    }).join('');

    var gmailBtn = document.getElementById('add-gmail-btn');
    var outlookBtn = document.getElementById('add-outlook-btn');
    if (gmailBtn) { gmailBtn.addEventListener('click', function () { self._showPermModal('gmail'); }); }
    if (outlookBtn) { outlookBtn.addEventListener('click', function () { self._showPermModal('microsoft'); }); }
  },

  _buildLookbackHtml: function (provider, accountEmail, currentDays) {
    var current = (currentDays == null) ? '30' : String(currentDays);
    var opts = [
      { v: '30',  l: '30 days' },
      { v: '60',  l: '60 days' },
      { v: '90',  l: '90 days' }
    ];
    var currentLabel = '30 days';
    opts.forEach(function (o) { if (o.v === current) currentLabel = o.l; });
    return '<span class="connection-item-lookback">' +
      '<span class="lookback-dropdown-wrap">' +
        '<button type="button" class="lookback-dropdown" data-provider="' + provider + '" data-account="' + (accountEmail || '') + '" data-lookback-type="email">' + currentLabel + ' &#9662;</button>' +
        '<div class="lookback-dropdown-menu">' +
        opts.map(function (o) {
          var cls = o.v === current ? ' active' : '';
          return '<button type="button" class="lookback-dropdown-item' + cls + '" data-value="' + o.v + '">' + o.l + '</button>';
        }).join('') +
        '</div>' +
      '</span>' +
    '</span>';
  },

  _startOAuth: function (provider) {
    if (!this._userId) return;
    window.location.href = '/api/auth/initiate?provider=' + provider + '&userId=' + this._userId + '&flow=ea';
  },

  _permMessages: {
    gmail: {
      title: 'Connect Gmail',
      body: 'StaxAI will be able to read your emails and star and unstar messages on your behalf. This is used solely for the email flagging feature. StaxAI cannot send, delete, or modify your emails in any other way.'
    },
    microsoft: {
      title: 'Connect Outlook',
      body: 'StaxAI will be able to read your emails and flag and unflag messages on your behalf. This is used solely for the email flagging feature. StaxAI cannot send, delete, or modify your emails in any other way.'
    }
  },

  _pendingProvider: null,

  _showPermModal: function (provider) {
    var msg = this._permMessages[provider];
    if (!msg) return;
    var titleEl = document.getElementById('perm-modal-title');
    var bodyEl = document.getElementById('perm-modal-body');
    var overlay = document.getElementById('perm-modal-overlay');
    if (!titleEl || !bodyEl || !overlay) return;
    titleEl.textContent = msg.title;
    bodyEl.textContent = msg.body;
    overlay.classList.add('open');
    this._pendingProvider = provider;
  },

  _bindPermissionModal: function () {
    var self = this;
    var overlay = document.getElementById('perm-modal-overlay');
    var cancelBtn = document.getElementById('perm-modal-cancel');
    var continueBtn = document.getElementById('perm-modal-continue');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (overlay) overlay.classList.remove('open');
        self._pendingProvider = null;
      });
    }
    if (continueBtn) {
      continueBtn.addEventListener('click', function () {
        if (overlay) overlay.classList.remove('open');
        if (self._pendingProvider) {
          self._startOAuth(self._pendingProvider);
          self._pendingProvider = null;
        }
      });
    }
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          overlay.classList.remove('open');
          self._pendingProvider = null;
        }
      });
    }
  },

  _disconnectEmail: async function (email) {
    var self = this;
    try {
      self._eaEmails = self._eaEmails.filter(function (e) { return e && e.email !== email; });
      var res = await self._supabase
        .from('profiles')
        .update({ ea_connected_emails: self._eaEmails })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectEmail error:', res.error); await self._loadConnections(); return; }
      self._renderEmailList();
    } catch (e) { console.error('_disconnectEmail exception:', e); }
  },

  _changeLookback: async function (provider, accountEmail, value) {
    var self = this;
    try {
      var entryIdx = self._eaEmails.findIndex(function (a) { return a && a.email === accountEmail; });
      if (entryIdx === -1) return;
      self._eaEmails[entryIdx].lookback_days = parseInt(value, 10) || 30;
      var res = await self._supabase
        .from('profiles')
        .update({ ea_connected_emails: self._eaEmails })
        .eq('id', self._userId);
      if (res.error) { console.error('_changeLookback error:', res.error); await self._loadConnections(); }
    } catch (e) { console.error('_changeLookback exception:', e); }
  },

  // ── SCAN FREQUENCY ──
  _renderScanFrequency: function () {
    var self = this;
    var container = document.getElementById('ea-scan-freq-rows');
    if (!container) return;

    if (self._eaEmails.length === 0) {
      container.innerHTML = '<div class="settings-row"><div><div class="settings-row-label" style="color:var(--text-muted);">No accounts connected.</div></div></div>';
      return;
    }

    container.innerHTML = self._eaEmails.map(function (acct, idx) {
      var cadence = acct.scan_cadence || 'manual';
      var provLabel = (acct.provider === 'gmail' || acct.provider === 'google') ? 'Gmail' : 'Outlook';
      return '<div class="settings-row">' +
        '<div>' +
          '<div class="settings-row-label">' + provLabel + '</div>' +
          '<div class="settings-row-desc">' + (acct.email || '') + '</div>' +
        '</div>' +
        '<div class="settings-row-control" id="scan-freq-ctrl-' + idx + '">' +
          '<button class="freq-btn' + (cadence === 'daily' ? ' active' : '') + '" data-acct="' + idx + '" data-value="daily">Daily</button>' +
          '<button class="freq-btn' + (cadence === 'weekly' ? ' active' : '') + '" data-acct="' + idx + '" data-value="weekly">Weekly</button>' +
          '<button class="freq-btn' + (cadence === 'manual' ? ' active' : '') + '" data-acct="' + idx + '" data-value="manual">Manual only</button>' +
        '</div>' +
      '</div>';
    }).join('');
  },

  _bindScanSave: function () {
    var self = this;
    // Freq button clicks — update in-memory and toggle active state
    document.addEventListener('click', function (e) {
      var scanBtn = e.target.closest('.freq-btn[data-acct]');
      if (!scanBtn) return;
      var idx = parseInt(scanBtn.getAttribute('data-acct'), 10);
      if (isNaN(idx) || !self._eaEmails[idx]) return;
      self._eaEmails[idx].scan_cadence = scanBtn.getAttribute('data-value');
      var ctrl = document.getElementById('scan-freq-ctrl-' + idx);
      if (ctrl) {
        ctrl.querySelectorAll('.freq-btn').forEach(function (b) { b.classList.remove('active'); });
        scanBtn.classList.add('active');
      }
    });

    // Save button
    var saveBtn = document.getElementById('save-scan-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var msgEl = document.getElementById('save-scan-msg');
        window.handleSave(saveBtn, async function() {
          var res = await self._supabase
            .from('profiles')
            .update({ ea_connected_emails: self._eaEmails })
            .eq('id', self._userId);
          if (res.error) throw new Error(res.error.message);
        }, msgEl);
      });
    }
  },

  // ── CATEGORIES ──
  _renderCategories: function () {
    var self = this;
    var grid = document.getElementById('categories-grid');
    if (!grid) return;

    var DEFAULT_COUNT = 8;
    var html = self._categories.map(function (cat, idx) {
      // Urgent is a status, not a toggleable category — skip it
      if (cat.id === 'urgent') return '';
      var isOn = cat.enabled;
      var isDefault = idx < DEFAULT_COUNT;
      var label = window.escHtml(cat.label || '');
      var desc = window.escHtml(cat.description || '');
      var descHtml = isDefault
        ? '<div class="settings-row-desc">' + desc + '</div>'
        : '<div style="margin-top:4px;"><input type="text" class="settings-text-input ea-cat-desc-input" data-cat-desc="' + idx + '" value="' + desc + '" placeholder="Description (required)" style="width:100%"></div>';
      var removeHtml = !isDefault
        ? '<button type="button" class="btn-remove-url" data-remove="' + idx + '">Remove</button>'
        : '';
      var row = '<div class="settings-row cat-row">' +
        '<div><div class="settings-row-label">' + label + '</div>' + descHtml + '</div>' +
        '<div style="display:flex;align-items:center;gap:var(--actions-gap);">' +
          removeHtml +
          '<div class="settings-row-control">' +
            '<button type="button" class="freq-btn' + (isOn ? ' active' : '') + '" data-cat="' + idx + '" data-val="on">On</button>' +
            '<button type="button" class="freq-btn' + (!isOn ? ' active' : '') + '" data-cat="' + idx + '" data-val="off">Off</button>' +
          '</div>' +
        '</div>' +
      '</div>';
      return row;
    }).join('');

    grid.innerHTML = html;
  },

  // ── CATEGORY SHORTCUTS ──
  _renderShortcuts: function () {
    var self = this;
    var container = document.getElementById('shortcuts-card');
    if (!container) return;

    var activeCats = self._categories.filter(function (c) {
      return c.enabled && c.id !== 'urgent';
    });

    var html = '<div class="settings-card-header">' +
      '<div class="settings-card-title">Category Shortcuts</div>' +
      '<div class="settings-card-hint">Choose up to 2 categories to show as shortcut pills on the Email Assistant inbox. The remaining categories appear in a dropdown.</div>' +
    '</div>' +
    '<div class="settings-rows" id="shortcuts-grid">' +
    activeCats.map(function (cat) {
      var isSelected = self._categoryShortcuts.indexOf(cat.id) > -1;
      return '<div class="settings-row">' +
        '<div><div class="settings-row-label">' + window.escHtml(cat.label) + '</div></div>' +
        '<div class="settings-row-control">' +
          '<button type="button" class="freq-btn' + (isSelected ? ' active' : '') + '" data-shortcut="' + window.escHtml(cat.id) + '">' +
            (isSelected ? 'Selected' : 'Select') +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('') +
    '</div>' +
    '<div class="settings-footer">' +
      '<button type="button" class="btn-save" id="save-shortcuts-btn">Save</button>' +
    '</div>';

    container.innerHTML = html;
    if (!document.getElementById('save-shortcuts-msg')) {
      var msgEl = document.createElement('div');
      msgEl.id = 'save-shortcuts-msg';
      msgEl.className = 'save-msg';
      msgEl.innerHTML = '<div class="save-msg-card"><div class="save-msg-text"></div><button type="button" class="save-msg-ok">OK</button></div>';
      document.body.appendChild(msgEl);
    }
    self._bindShortcutEvents();
  },

  _bindShortcutEvents: function () {
    var self = this;
    var grid = document.getElementById('shortcuts-grid');
    if (!grid) return;

    var saveBtn = document.getElementById('save-shortcuts-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        self._settings.category_shortcuts = self._categoryShortcuts;
        var msgEl = document.getElementById('save-shortcuts-msg');
        window.handleSave(saveBtn, async function() {
          var payload = {
            user_id: self._userId,
            categories: self._categories,
            category_shortcuts: self._categoryShortcuts,
            scan_cadence: self._settings.scan_cadence || 'manual',
            updated_at: new Date().toISOString()
          };
          var error;
          if (self._settings.id) {
            ({ error } = await self._supabase.from('email_assistant_settings').update(payload).eq('id', self._settings.id));
          } else {
            payload.created_at = new Date().toISOString();
            var res = await self._supabase.from('email_assistant_settings').insert(payload).select().single();
            if (res.data) self._settings = res.data;
            error = res.error;
          }
          if (error) throw new Error(error.message);
        }, msgEl);
      });
    }
  },

  _bindCategorySave: function () {
    var self = this;
    var addBtn = document.getElementById('add-category-btn');
    var saveBtn = document.getElementById('save-categories-btn');

    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var nameInput = document.getElementById('category-custom-input');
        var descInput = document.getElementById('category-custom-desc');
        var nameVal = nameInput ? nameInput.value.trim() : '';
        var descVal = descInput ? descInput.value.trim() : '';
        if (!nameVal || !descVal) {
          self._showSaveMsg('save-categories-msg', 'Both name and description are required.', 'error');
          return;
        }
        var customId = nameVal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        self._categories.push({ id: customId, label: nameVal, description: descVal, enabled: true });
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
        self._renderCategories();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        // Collect updated descriptions from editable inputs
        document.querySelectorAll('.ea-cat-desc-input').forEach(function(input) {
          var idx = parseInt(input.dataset.catDesc, 10);
          if (!isNaN(idx) && self._categories[idx]) {
            self._categories[idx].description = input.value.trim();
          }
        });
        // Validate custom categories have descriptions
        var missing = false;
        for (var i = 8; i < self._categories.length; i++) {
          if (!self._categories[i].description) { missing = true; break; }
        }
        if (missing) {
          self._showSaveMsg('save-categories-msg', 'All custom categories require a description.', 'error');
          return;
        }
        self._settings.categories = self._categories;
        self._categoryShortcuts = self._categoryShortcuts.filter(function (id) {
          return self._categories.some(function (c) { return c.id === id && c.enabled; });
        });
        self._settings.category_shortcuts = self._categoryShortcuts;
        var msgEl = document.getElementById('save-categories-msg');
        window.handleSave(saveBtn, async function() {
          var payload = {
            user_id: self._userId,
            categories: self._categories,
            category_shortcuts: self._categoryShortcuts,
            scan_cadence: self._settings.scan_cadence || 'manual',
            updated_at: new Date().toISOString()
          };
          var error;
          if (self._settings.id) {
            ({ error } = await self._supabase.from('email_assistant_settings').update(payload).eq('id', self._settings.id));
          } else {
            payload.created_at = new Date().toISOString();
            var res = await self._supabase.from('email_assistant_settings').insert(payload).select().single();
            if (res.data) self._settings = res.data;
            error = res.error;
          }
          if (error) throw new Error(error.message);
          self._renderShortcuts();
        }, msgEl);
      });
    }
  },

  _removeCategory: async function (idx) {
    var self = this;
    var cat = self._categories[idx];
    if (!cat) return;
    try {
      var result = await self._supabase
        .from('email_summaries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', self._userId)
        .eq('category', cat.id);
      if (result.error) { console.error('[EA Settings] Remove check query error:', result.error); return; }
      var count = result.count || 0;
      if (count > 0) {
        self._showSaveMsg('save-categories-msg', 'Cannot remove — ' + count + ' email' + (count !== 1 ? 's' : '') + ' use this category. Disable it and wait up to 90 days for emails to clear.', 'error');
        return;
      }
    } catch (e) {
      console.error('[EA Settings] Remove check error:', e);
      return;
    }
    self._categories.splice(idx, 1);
    self._settings.categories = self._categories;
    await self._saveSettings();
    self._renderCategories();
    self._showSaveMsg('save-categories-msg', 'Category removed.', 'success');
  },

  // ── EVENT DELEGATION ──
  _bindEventDelegation: function () {
    var self = this;

    // Close lookback dropdowns on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.lookback-dropdown-wrap')) {
        document.querySelectorAll('.lookback-dropdown-menu.open').forEach(function (m) { m.classList.remove('open'); });
        document.querySelectorAll('.lookback-dropdown.active').forEach(function (b) { b.classList.remove('active'); });
      }
    });

    document.addEventListener('click', function (e) {

      // Lookback dropdown — toggle menu
      var lbBtn = e.target.closest('.lookback-dropdown');
      if (lbBtn) {
        var wrap = lbBtn.closest('.lookback-dropdown-wrap');
        var menu = wrap ? wrap.querySelector('.lookback-dropdown-menu') : null;
        if (menu) {
          document.querySelectorAll('.lookback-dropdown-menu.open').forEach(function (m) { if (m !== menu) m.classList.remove('open'); });
          document.querySelectorAll('.lookback-dropdown.active').forEach(function (b) { if (b !== lbBtn) b.classList.remove('active'); });
          menu.classList.toggle('open');
          lbBtn.classList.toggle('active');
        }
        return;
      }

      // Lookback dropdown — item selected
      var lbItem = e.target.closest('.lookback-dropdown-item');
      if (lbItem) {
        var lbWrap = lbItem.closest('.lookback-dropdown-wrap');
        var lbTrigger = lbWrap ? lbWrap.querySelector('.lookback-dropdown') : null;
        var lbMenu = lbItem.closest('.lookback-dropdown-menu');
        if (lbTrigger && lbMenu) {
          var val = lbItem.getAttribute('data-value');
          var provider = lbTrigger.getAttribute('data-provider');
          var acct = lbTrigger.getAttribute('data-account');
          lbTrigger.innerHTML = lbItem.textContent + ' &#9662;';
          lbMenu.querySelectorAll('.lookback-dropdown-item').forEach(function (it) { it.classList.remove('active'); });
          lbItem.classList.add('active');
          lbMenu.classList.remove('open');
          lbTrigger.classList.remove('active');
          if (acct) self._changeLookback(provider, acct, val);
        }
        return;
      }

      var disconnectBtn = e.target.closest('.btn-disconnect');
      if (disconnectBtn) {
        var email = disconnectBtn.getAttribute('data-email');
        if (email) self._disconnectEmail(email);
        return;
      }

      var removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        var idx = parseInt(removeBtn.getAttribute('data-remove'), 10);
        if (!isNaN(idx) && self._categories[idx]) {
          self._removeCategory(idx);
        }
        return;
      }

      var shortcutBtn = e.target.closest('[data-shortcut]');
      if (shortcutBtn) {
        var catId = shortcutBtn.getAttribute('data-shortcut');
        var scIdx = self._categoryShortcuts.indexOf(catId);
        if (scIdx > -1) {
          self._categoryShortcuts.splice(scIdx, 1);
          shortcutBtn.classList.remove('active');
          shortcutBtn.textContent = 'Select';
        } else {
          if (self._categoryShortcuts.length >= 2) {
            self._showSaveMsg('save-shortcuts-msg', 'Maximum 2 shortcuts. Deselect one first.', 'error');
            return;
          }
          self._categoryShortcuts.push(catId);
          shortcutBtn.classList.add('active');
          shortcutBtn.textContent = 'Selected';
        }
        var scSaveBtn = document.getElementById('save-shortcuts-btn');
        if (scSaveBtn) { scSaveBtn.textContent = 'Save'; scSaveBtn.disabled = false; }
        return;
      }

      var catBtn = e.target.closest('.freq-btn[data-cat]');
      if (catBtn) {
        var catIdx = parseInt(catBtn.getAttribute('data-cat'), 10);
        var val = catBtn.getAttribute('data-val');
        if (!isNaN(catIdx) && self._categories[catIdx]) {
          self._categories[catIdx].enabled = (val === 'on');
          var row = catBtn.closest('.settings-row-control');
          if (row) {
            row.querySelectorAll('.freq-btn').forEach(function (b) { b.classList.remove('active'); });
            catBtn.classList.add('active');
          }
          }
        return;
      }
    });
  },

  // ── SAVE MSG MODAL ──
  _showSaveMsg: function (elementId, text, type) {
    var el = document.getElementById(elementId);
    if (!el) return;
    var textEl = el.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = text;
    el.classList.remove('msg-error', 'msg-success');
    el.classList.add(type === 'success' ? 'msg-success' : 'msg-error');
    el.classList.add('open');
  },

  _bindSaveMsgDismiss: function () {
    var self = this;
    document.addEventListener('click', function (e) {
      var okBtn = e.target.closest('.save-msg-ok');
      if (okBtn) {
        var overlay = okBtn.closest('.save-msg');
        if (overlay) {
          overlay.classList.remove('open', 'msg-error', 'msg-success');
        }
        return;
      }
      // Close on overlay background click
      if (e.target.classList.contains('save-msg') && e.target.classList.contains('open')) {
        e.target.classList.remove('open', 'msg-error', 'msg-success');
      }
    });
  },

  // ── SAVE ──
  _saveSettings: async function () {
    var self = this;
    var payload = {
      user_id: self._userId,
      categories: self._categories,
      category_shortcuts: self._categoryShortcuts,
      scan_cadence: self._settings.scan_cadence || 'manual',
      updated_at: new Date().toISOString()
    };
    try {
      var error;
      if (self._settings.id) {
        ({ error } = await self._supabase.from('email_assistant_settings').update(payload).eq('id', self._settings.id));
      } else {
        payload.created_at = new Date().toISOString();
        var res = await self._supabase.from('email_assistant_settings').insert(payload).select().single();
        if (res.data) self._settings = res.data;
        error = res.error;
      }
      if (error) console.error('Save error:', error);
    } catch (e) { console.error('Save exception:', e); }
  }
};

window.EA_SETTINGS.init();
window.addEventListener('pageshow', function (e) { if (e.persisted) window.EA_SETTINGS.init(); });
