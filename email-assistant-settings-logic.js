window.EA_SETTINGS = {
  _supabase: null,
  _userId: null,
  _eaEmails: [],
  _settings: {},
  _categories: [],

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
    });
  },

  // ── TABS ──
  _bindTabs: function () {
    document.querySelectorAll('.stab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.stab').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.stab-panel').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var panel = document.getElementById('tab-' + btn.getAttribute('data-tab'));
        if (panel) panel.classList.add('active');
      });
    });
  },

  // ── LOAD ──
  _loadAll: async function () {
    var self = this;
    await Promise.all([self._loadConnections(), self._loadSettings()]);
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
    } catch (e) {}

    var DEFAULT_CATS = [
      { id: 'urgent', label: 'Urgent', description: 'Emails requiring immediate attention or a same-day response', enabled: true },
      { id: 'enquiries', label: 'Leads / Enquiries', description: 'New enquiries and expressions of interest from potential customers', enabled: true },
      { id: 'projects', label: 'Jobs / Projects', description: 'Emails related to active or upcoming work, projects, and jobs', enabled: true },
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

    self._renderScanFrequency();
    self._renderCategories();
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
    if (gmailBtn) { gmailBtn.onclick = function () { self._startOAuth('gmail'); }; }
    if (outlookBtn) { outlookBtn.onclick = function () { self._startOAuth('microsoft'); }; }
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
    var cadence = this._settings.scan_cadence || 'manual';
    var ctrl = document.getElementById('scan-freq-ctrl');
    if (!ctrl) return;
    ctrl.querySelectorAll('.freq-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-value') === cadence);
    });
  },

  _bindScanSave: function () {
    var self = this;
    var ctrl = document.getElementById('scan-freq-ctrl');
    if (!ctrl) return;
    ctrl.querySelectorAll('.freq-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        ctrl.querySelectorAll('.freq-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var value = btn.getAttribute('data-value');
        self._settings.scan_cadence = value;
        await self._saveSettings();
      });
    });
  },

  // ── CATEGORIES ──
  _renderCategories: function () {
    var self = this;
    var grid = document.getElementById('categories-grid');
    if (!grid) return;

    var DEFAULT_COUNT = 8;
    var html = self._categories.map(function (cat, idx) {
      var isOn = cat.enabled;
      var isDefault = idx < DEFAULT_COUNT;
      var label = (cat.label || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      var desc = (cat.description || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      var descHtml = isDefault
        ? '<div class="settings-row-desc">' + desc + '</div>'
        : '<div style="margin-top:4px;"><input type="text" class="settings-text-input ea-cat-desc-input" data-cat-desc="' + idx + '" value="' + desc + '" placeholder="Description (required)" style="width:100%"></div>';
      var removeHtml = !isDefault
        ? '<button type="button" class="btn-remove-url" data-remove="' + idx + '">Remove</button>'
        : '';
      var row = '<div class="settings-row cat-row">' +
        '<div><div class="settings-row-label">' + label + '</div>' + descHtml + '</div>' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
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
            msg.style.color = 'var(--red)';
            setTimeout(function () { msg.style.display = 'none'; }, 3000);
          }
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
            msg.style.color = 'var(--red)';
            setTimeout(function () { msg.style.display = 'none'; }, 3000);
          }
          return;
        }
        self._settings.categories = self._categories;
        await self._saveSettings();
        var msg = document.getElementById('save-categories-msg');
        if (msg) {
          msg.textContent = 'Categories saved.';
          msg.style.display = 'inline';
          msg.style.color = 'var(--green-dark)';
          setTimeout(function () { msg.style.display = 'none'; }, 3000);
        }
      });
    }
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
      var count = result.count || 0;
      if (count > 0) {
        if (msg) {
          msg.textContent = 'Cannot remove — ' + count + ' email' + (count !== 1 ? 's' : '') + ' use this category. Disable it and wait up to 90 days for emails to clear.';
          msg.style.display = 'inline';
          msg.style.color = 'var(--red)';
          setTimeout(function () { msg.style.display = 'none'; }, 5000);
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
      msg.style.color = 'var(--green-dark)';
      setTimeout(function () { msg.style.display = 'none'; }, 3000);
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
