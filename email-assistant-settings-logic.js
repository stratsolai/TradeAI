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
      if (res.data && Array.isArray(res.data.ea_connected_emails)) {
        self._eaEmails = res.data.ea_connected_emails;
      } else {
        self._eaEmails = [];
      }
    } catch (e) { self._eaEmails = []; }
    self._renderEmailList();
  },

  _loadSettings: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('email_assistant_settings')
        .select('*')
        .eq('user_id', self._userId)
        .single();
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
        return { id: def.id, label: def.label, description: def.description, enabled: saved ? saved.enabled : def.enabled };
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

    // Load category shortcuts — default to Leads and Projects
    if (Array.isArray(self._settings.category_shortcuts) && self._settings.category_shortcuts.length > 0) {
      self._categoryShortcuts = self._settings.category_shortcuts;
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
    if (gmailBtn) { gmailBtn.onclick = function () { self._showPermModal('gmail'); }; }
    if (outlookBtn) { outlookBtn.onclick = function () { self._showPermModal('microsoft'); }; }
  },

  _buildLookbackHtml: function (provider, accountEmail, currentDays) {
    var current = (currentDays == null) ? '30' : String(currentDays);
    var opts = [
      { v: '30',  l: '30 days' },
      { v: '60',  l: '60 days' },
      { v: '90',  l: '90 days' }
    ];
    return '<span class="connection-item-lookback">' +
      '<select class="email-lookback-select" data-provider="' + provider + '" data-account="' + (accountEmail || '') + '">' +
      opts.map(function (o) {
        var s = o.v === current ? ' selected' : '';
        return '<option value="' + o.v + '"' + s + '>' + o.l + '</option>';
      }).join('') +
      '</select></span>';
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
      body: 'StaxAI will be able to read your emails. StaxAI cannot send, delete, or modify your emails in any way.'
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
      var saveBtn = document.getElementById('save-scan-btn');
      if (saveBtn) { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }
    });

    // Save button
    var saveBtn = document.getElementById('save-scan-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        try {
          var res = await self._supabase
            .from('profiles')
            .update({ ea_connected_emails: self._eaEmails })
            .eq('id', self._userId);
          if (res.error) { console.error('Save scan freq error:', res.error); return; }
          saveBtn.textContent = 'Saved';
          saveBtn.disabled = true;
        } catch (e) { console.error('Save scan freq exception:', e); }
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
      '<span class="save-msg" id="save-shortcuts-msg"></span>' +
    '</div>';

    container.innerHTML = html;
    self._bindShortcutEvents();
  },

  _bindShortcutEvents: function () {
    var self = this;
    var grid = document.getElementById('shortcuts-grid');
    if (!grid) return;

    grid.querySelectorAll('.freq-btn[data-shortcut]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var catId = btn.dataset.shortcut;
        var idx = self._categoryShortcuts.indexOf(catId);
        if (idx > -1) {
          // Deselect
          self._categoryShortcuts.splice(idx, 1);
          btn.classList.remove('active');
          btn.textContent = 'Select';
        } else {
          // Enforce maximum 2
          if (self._categoryShortcuts.length >= 2) {
            var msg = document.getElementById('save-shortcuts-msg');
            if (msg) {
              msg.textContent = 'Maximum 2 shortcuts. Deselect one first.';
              msg.style.display = 'inline';
              msg.classList.remove('msg-success');
              msg.classList.add('msg-error');
              setTimeout(function () { msg.style.display = 'none'; msg.classList.remove('msg-error'); }, 3000);
            }
            return;
          }
          self._categoryShortcuts.push(catId);
          btn.classList.add('active');
          btn.textContent = 'Selected';
        }
        var saveBtn = document.getElementById('save-shortcuts-btn');
        if (saveBtn) { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }
      });
    });

    var saveBtn = document.getElementById('save-shortcuts-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        self._settings.category_shortcuts = self._categoryShortcuts;
        await self._saveSettings();
        saveBtn.textContent = 'Saved';
        saveBtn.disabled = true;
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
          var msg = document.getElementById('save-categories-msg');
          if (msg) {
            msg.textContent = 'Both name and description are required.';
            msg.style.display = 'inline';
            msg.classList.remove('msg-success');
            msg.classList.add('msg-error');
            setTimeout(function () { msg.style.display = 'none'; msg.classList.remove('msg-error'); }, 3000);
          }
          return;
        }
        var customId = nameVal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        self._categories.push({ id: customId, label: nameVal, description: descVal, enabled: true });
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
        self._renderCategories();
        self._resetCatSaveBtn();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
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
          var msg = document.getElementById('save-categories-msg');
          if (msg) {
            msg.textContent = 'All custom categories require a description.';
            msg.style.display = 'inline';
            msg.classList.remove('msg-success');
            msg.classList.add('msg-error');
            setTimeout(function () { msg.style.display = 'none'; msg.classList.remove('msg-error'); }, 3000);
          }
          return;
        }
        self._settings.categories = self._categories;
        // Remove shortcuts for categories that were just disabled
        self._categoryShortcuts = self._categoryShortcuts.filter(function (id) {
          return self._categories.some(function (c) { return c.id === id && c.enabled; });
        });
        self._settings.category_shortcuts = self._categoryShortcuts;
        await self._saveSettings();
        self._renderShortcuts();
        if (saveBtn) { saveBtn.textContent = 'Saved'; saveBtn.disabled = true; }
      });
    }
  },

  _resetCatSaveBtn: function () {
    var btn = document.getElementById('save-categories-btn');
    if (btn) { btn.textContent = 'Save'; btn.disabled = false; }
  },

  _removeCategory: async function (idx) {
    var self = this;
    var cat = self._categories[idx];
    if (!cat) return;
    var msg = document.getElementById('save-categories-msg');
    try {
      var result = await self._supabase
        .from('email_summaries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', self._userId)
        .eq('category', cat.id);
      if (result.error) { console.error('[EA Settings] Remove check query error:', result.error); return; }
      var count = result.count || 0;
      if (count > 0) {
        if (msg) {
          msg.textContent = 'Cannot remove — ' + count + ' email' + (count !== 1 ? 's' : '') + ' use this category. Disable it and wait up to 90 days for emails to clear.';
          msg.style.display = 'inline';
          msg.classList.remove('msg-success');
          msg.classList.add('msg-error');
          setTimeout(function () { msg.style.display = 'none'; msg.classList.remove('msg-error'); }, 5000);
        }
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
    if (msg) {
      msg.textContent = 'Category removed.';
      msg.style.display = 'inline';
      msg.classList.remove('msg-error');
      msg.classList.add('msg-success');
      setTimeout(function () { msg.style.display = 'none'; msg.classList.remove('msg-success'); }, 3000);
    }
  },

  // ── EVENT DELEGATION ──
  _bindEventDelegation: function () {
    var self = this;
    document.addEventListener('click', function (e) {
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
          self._resetCatSaveBtn();
        }
        return;
      }
    });

    document.addEventListener('change', function (e) {
      var lookback = e.target.closest('.email-lookback-select');
      if (lookback) {
        var provider = lookback.getAttribute('data-provider');
        var acct = lookback.getAttribute('data-account');
        if (acct) self._changeLookback(provider, acct, lookback.value);
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
