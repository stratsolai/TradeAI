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

    self._categories = Array.isArray(self._settings.categories) ? self._settings.categories : [
      { id: 'urgent', label: 'Urgent', enabled: true },
      { id: 'leads', label: 'Leads', enabled: true },
      { id: 'enquiries', label: 'Enquiries', enabled: true },
      { id: 'jobs', label: 'Jobs', enabled: true },
      { id: 'invoices', label: 'Invoices', enabled: true },
      { id: 'suppliers', label: 'Suppliers', enabled: true },
      { id: 'low', label: 'Low Priority', enabled: true }
    ];

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
    var current = (currentDays == null) ? '90' : String(currentDays);
    var opts = [
      { v: '30',  l: '30 days' },
      { v: '60',  l: '60 days' },
      { v: '90',  l: '90 days' },
      { v: '180', l: '6 months' },
      { v: '365', l: '12 months' }
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
      self._eaEmails[entryIdx].lookback_days = parseInt(value, 10) || 90;
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

    var html = self._categories.map(function (cat, idx) {
      var isOn = cat.enabled;
      var isDefault = idx < 7;
      var label = (cat.label || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      var row = '<div class="settings-row cat-row">' +
        '<div><div class="settings-row-label">' + label + '</div></div>' +
        '<div class="settings-row-control">';
      if (!isDefault) {
        row += '<button type="button" class="btn-remove-url" data-remove="' + idx + '">Remove</button>';
      }
      row += '<button type="button" class="freq-btn' + (isOn ? ' active' : '') + '" data-cat="' + idx + '" data-val="on">On</button>' +
        '<button type="button" class="freq-btn' + (!isOn ? ' active' : '') + '" data-cat="' + idx + '" data-val="off">Off</button>' +
        '</div></div>';
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
        var input = document.getElementById('category-custom-input');
        if (input && input.value.trim()) {
          var customLabel = input.value.trim();
          var customId = customLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          self._categories.push({ id: customId, label: customLabel, enabled: true });
          input.value = '';
          self._renderCategories();
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
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
        if (!isNaN(idx)) {
          self._categories.splice(idx, 1);
          self._renderCategories();
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
