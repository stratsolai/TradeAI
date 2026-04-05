window.CL_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: { email_scan_frequency: 'manual', drive_scan_frequency: 'manual', website_scan_frequency: 'manual' },
  _emails: [],
  _driveConnected: false,
  _driveFolders: [],
  _websiteUrls: [],

  init: function () {
    var self = this;
    self._supabase = window.supabaseClient;

    self._supabase.auth.getUser().then(function (res) {
      if (!res || !res.data || !res.data.user) return;
      self._userId = res.data.user.id;

      // Account dropdown
      var _ab = document.getElementById('account-btn');
      if (_ab) _ab.addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('account-dropdown').classList.toggle('open');
      });
      document.addEventListener('click', function () {
        var dd = document.getElementById('account-dropdown');
        if (dd) dd.classList.remove('open');
      });

      self._bindEventDelegation();
      self._bindScanSave();
      self._bindCategorySave();
      self._bindWebsiteButtons();
      self._loadAll();
      self._checkDriveOAuthReturn();

      var pickerSaveBtn = document.getElementById('drive-folder-picker-save');
      if (pickerSaveBtn) pickerSaveBtn.addEventListener('click', function () { self._saveDriveFolders(); });
      var pickerCancelBtn = document.getElementById('drive-folder-picker-cancel');
      if (pickerCancelBtn) pickerCancelBtn.addEventListener('click', function () {
        var picker = document.getElementById('drive-folder-picker');
        if (picker) picker.style.display = 'none';
      });
    });
  },

  _loadAll: async function () {
    var self = this;
    await Promise.all([
      self._loadConnections(),
      self._loadScanSettings(),
      self._loadCategories()
    ]);
  },

  _loadConnections: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('profiles')
        .select('cl_connected_emails, cl_drive_connected, cl_drive_folders, website_urls')
        .eq('id', self._userId)
        .maybeSingle();
      if (res.error) { console.error('_loadConnections error:', res.error); return; }
      var data = res.data || {};
      self._emails = data.cl_connected_emails || [];
      self._driveConnected = data.cl_drive_connected || false;
      self._driveFolders = data.cl_drive_folders || [];
      self._websiteUrls = data.website_urls || [];
      self._renderEmailList();
      self._renderDriveList();
      self._renderDriveFolders();
      self._renderWebsiteList();
    } catch (e) { console.error('_loadConnections exception:', e); }
  },

  _loadScanSettings: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('cl_settings')
        .select('email_scan_frequency, drive_scan_frequency, website_scan_frequency')
        .eq('user_id', self._userId)
        .maybeSingle();
      if (res.error) { console.error('_loadScanSettings error:', res.error); return; }
      if (res.data) {
        self._settings.email_scan_frequency = res.data.email_scan_frequency || 'manual';
        self._settings.drive_scan_frequency = res.data.drive_scan_frequency || 'manual';
        self._settings.website_scan_frequency = res.data.website_scan_frequency || 'manual';
      }
      self._renderScanSettings();
    } catch (e) { console.error('_loadScanSettings exception:', e); }
  },

  _loadCategories: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('profiles')
        .select('cl_active_categories, cl_custom_categories')
        .eq('id', self._userId)
        .maybeSingle();
      if (res.error) { console.error('_loadCategories error:', res.error); return; }
      var data = res.data || {};
      self._renderCategories(data.cl_active_categories || [], data.cl_custom_categories || []);
    } catch (e) { console.error('_loadCategories exception:', e); }
  },

  _renderEmailList: function () {
    var self = this;
    var gmailList = document.getElementById('gmail-connections-list');
    var outlookList = document.getElementById('outlook-connections-list');
    if (!gmailList || !outlookList) return;

    var gmails = self._emails.filter(function (e) {
      return e && (e.provider === 'gmail' || e.provider === 'google');
    });
    var outlooks = self._emails.filter(function (e) {
      return e && (e.provider === 'microsoft' || e.provider === 'outlook');
    });

    gmailList.innerHTML = gmails.map(function (e) {
      return '<div class="connection-item">' +
        '<span class="connection-item-email">' + (e.email || '') + '</span>' +
        '<button class="btn-disconnect" data-email="' + (e.email || '') + '" data-type="email">Disconnect</button>' +
        '</div>';
    }).join('');

    outlookList.innerHTML = outlooks.map(function (e) {
      return '<div class="connection-item">' +
        '<span class="connection-item-email">' + (e.email || '') + '</span>' +
        '<button class="btn-disconnect" data-email="' + (e.email || '') + '" data-type="email">Disconnect</button>' +
        '</div>';
    }).join('');

    var gmailBtn = document.getElementById('add-gmail-btn');
    var outlookBtn = document.getElementById('add-outlook-btn');
    if (gmailBtn) { gmailBtn.onclick = function () { self._startOAuth('gmail'); }; }
    if (outlookBtn) { outlookBtn.onclick = function () { self._startOAuth('microsoft'); }; }
  },

  _renderDriveList: function () {
    var self = this;
    var list = document.getElementById('drive-connections-list');
    if (!list) return;
    if (self._driveConnected) {
      list.innerHTML = '<div class="connection-item">' +
        '<span class="connection-status connected">Connected</span>' +
        '<button class="btn-disconnect" data-type="drive">Disconnect</button>' +
        '</div>';
    } else {
      list.innerHTML = '';
    }
    var driveBtn = document.getElementById('add-drive-btn');
    if (driveBtn) { driveBtn.onclick = function () { self._startOAuth('google-drive'); }; }
  },

  _renderWebsiteList: function () {
    var self = this;
    var list = document.getElementById('website-urls-list');
    if (!list) return;
    list.innerHTML = self._websiteUrls.map(function (url) {
      return '<div class="website-url-item">' +
        '<input class="website-url-input" type="text" value="' + url + '" />' +
        '<button class="btn-remove-url" data-url="' + url + '">Remove</button>' +
        '</div>';
    }).join('');
  },

  _renderScanSettings: function () {
    var self = this;
    self._setFreqButtons('email-freq-ctrl', self._settings.email_scan_frequency);
    self._setFreqButtons('drive-freq-ctrl', self._settings.drive_scan_frequency);
    self._setFreqButtons('website-freq-ctrl', self._settings.website_scan_frequency);
  },

  _setFreqButtons: function (containerId, value) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.freq-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-value') === value);
    });
  },

  _renderCategories: function (active, custom) {
    var self = this;
    var grid = document.getElementById('category-grid');
    if (!grid) return;

    var defaults = [
      'Services & Pricing', 'Projects & Portfolio', 'Team & Culture',
      'Products & Equipment', 'Promotions & Offers', 'Customer Testimonials',
      'Tips & How-To', 'Industry News', 'Company Updates', 'Seasonal Content'
    ];

    var html = defaults.map(function (cat) {
      var isOn = active.indexOf(cat) !== -1;
      return '<div class="settings-row cat-row">' +
        '<div><div class="settings-row-label">' + cat + '</div></div>' +
        '<div class="settings-row-control">' +
          '<button type="button" class="freq-btn' + (isOn ? ' active' : '') + '" data-cat="' + cat + '" data-val="on">On</button>' +
          '<button type="button" class="freq-btn' + (!isOn ? ' active' : '') + '" data-cat="' + cat + '" data-val="off">Off</button>' +
        '</div>' +
      '</div>';
    }).join('');

    custom.forEach(function (cat) {
      var isOn = active.indexOf(cat) !== -1;
      html += '<div class="settings-row cat-row">' +
        '<div><div class="settings-row-label">' + cat + '</div></div>' +
        '<div class="settings-row-control">' +
          '<button type="button" class="btn-remove-url" data-cat-remove="' + cat + '">Remove</button>' +
          '<button type="button" class="freq-btn' + (isOn ? ' active' : '') + '" data-cat="' + cat + '" data-val="on">On</button>' +
          '<button type="button" class="freq-btn' + (!isOn ? ' active' : '') + '" data-cat="' + cat + '" data-val="off">Off</button>' +
        '</div>' +
      '</div>';
    });

    grid.innerHTML = html;
  },

  _resetSaveBtn: function (id, label) {
    var btn = document.getElementById(id);
    if (btn) { btn.textContent = label; btn.disabled = false; }
  },

  _bindEventDelegation: function () {
    var self = this;
    document.addEventListener('click', function (e) {

      var disconnectBtn = e.target.closest('.btn-disconnect');
      if (disconnectBtn) {
        var type = disconnectBtn.getAttribute('data-type');
        if (type === 'email') {
          var email = disconnectBtn.getAttribute('data-email');
          if (email) self._disconnectEmail(email);
        } else if (type === 'drive') {
          self._disconnectDrive();
        } else if (type === 'drive-folder') {
          var folderId = disconnectBtn.getAttribute('data-folder-id');
          if (folderId) self._disconnectDriveFolder(folderId);
        }
        return;
      }

      var removeUrlBtn = e.target.closest('.btn-remove-url[data-url]');
      if (removeUrlBtn) {
        var url = removeUrlBtn.getAttribute('data-url');
        self._websiteUrls = self._websiteUrls.filter(function (u) { return u !== url; });
        self._renderWebsiteList();
        self._resetSaveBtn('website-save-btn', 'Save');
        return;
      }

      var removeCatBtn = e.target.closest('[data-cat-remove]');
      if (removeCatBtn) {
        var cat = removeCatBtn.getAttribute('data-cat-remove');
        self._removeCustomCategory(cat);
        self._resetSaveBtn('save-categories-btn', 'Save');
        return;
      }

      var freqBtn = e.target.closest('.freq-btn[data-cat]');
      if (freqBtn) {
        var row = freqBtn.closest('.cat-row');
        if (row) {
          row.querySelectorAll('.freq-btn[data-cat]').forEach(function (b) { b.classList.remove('active'); });
          freqBtn.classList.add('active');
          self._resetSaveBtn('save-categories-btn', 'Save');
        }
        return;
      }

      var scanBtn = e.target.closest('.freq-btn[data-value]');
      if (scanBtn) {
        var container = scanBtn.closest('[id$="-freq-ctrl"]');
        if (container) {
          var field = container.id === 'email-freq-ctrl' ? 'email_scan_frequency'
            : container.id === 'drive-freq-ctrl' ? 'drive_scan_frequency'
            : 'website_scan_frequency';
          self._settings[field] = scanBtn.getAttribute('data-value');
          self._setFreqButtons(container.id, self._settings[field]);
          self._resetSaveBtn('save-settings-btn', 'Save');
        }
        return;
      }

    });
  },

  _bindScanSave: function () {
    var self = this;
    var saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) saveBtn.addEventListener('click', function () { self._saveScanSettings(); });
    var signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) signOutBtn.addEventListener('click', function () {
      self._supabase.auth.signOut().then(function () {
        window.location.href = '/index.html';
      });
    });
  },

  _bindCategorySave: function () {
    var self = this;
    var addBtn = document.getElementById('add-category-btn');
    var saveBtn = document.getElementById('save-categories-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var input = document.getElementById('category-custom-input');
        if (input && input.value.trim()) {
          self._addCustomCategory(input.value.trim());
          input.value = '';
          self._resetSaveBtn('save-categories-btn', 'Save');
        }
      });
    }
    if (saveBtn) saveBtn.addEventListener('click', function () { self._saveCategories(); });
  },

  _bindWebsiteButtons: function () {
    var self = this;
    var addBtn = document.getElementById('add-website-btn');
    var saveBtn = document.getElementById('website-save-btn');
    if (addBtn) addBtn.addEventListener('click', function () {
      self._websiteUrls.push('');
      self._renderWebsiteList();
      self._resetSaveBtn('website-save-btn', 'Save');
    });
    if (saveBtn) saveBtn.addEventListener('click', function () { self._saveWebsiteUrls(); });
  },

  _startOAuth: function (provider) {
    var self = this;
    if (!self._userId) return;
    window.location.href = '/api/auth/initiate?provider=' + provider + '&userId=' + self._userId + '&flow=cl';
  },

  _disconnectEmail: async function (email) {
    var self = this;
    try {
      self._emails = self._emails.filter(function (e) { return e && e.email !== email; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_connected_emails: self._emails })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectEmail error:', res.error); await self._loadConnections(); return; }
      self._renderEmailList();
    } catch (e) { console.error('_disconnectEmail exception:', e); }
  },

  _disconnectDrive: async function () {
    var self = this;
    try {
      self._driveConnected = false;
      self._driveFolders = [];
      var res = await self._supabase
        .from('profiles')
        .update({ cl_drive_connected: false, cl_drive_folders: null })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectDrive error:', res.error); await self._loadConnections(); return; }
      self._renderDriveList();
      self._renderDriveFolders();
    } catch (e) { console.error('_disconnectDrive exception:', e); }
  },

  _saveWebsiteUrls: async function () {
    var self = this;
    try {
      var inputs = document.querySelectorAll('.website-url-input');
      var urls = [];
      inputs.forEach(function (input) { var v = input.value.trim(); if (v) urls.push(v); });
      self._websiteUrls = urls;
      var res = await self._supabase
        .from('profiles')
        .update({ website_urls: urls })
        .eq('id', self._userId);
      if (res.error) { console.error('_saveWebsiteUrls error:', res.error); return; }
      var btn = document.getElementById('website-save-btn');
      if (btn) { btn.textContent = 'Saved'; btn.disabled = true; }
      self._renderWebsiteList();
    } catch (e) { console.error('_saveWebsiteUrls exception:', e); }
  },

  _saveScanSettings: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('cl_settings')
        .upsert({
          user_id: self._userId,
          email_scan_frequency: self._settings.email_scan_frequency,
          drive_scan_frequency: self._settings.drive_scan_frequency,
          website_scan_frequency: self._settings.website_scan_frequency,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (res.error) { console.error('_saveScanSettings error:', res.error); return; }
      var btn = document.getElementById('save-settings-btn');
      if (btn) { btn.textContent = 'Saved'; btn.disabled = true; }
    } catch (e) { console.error('_saveScanSettings exception:', e); }
  },

  _saveCategories: async function () {
    var self = this;
    try {
      var active = [];
      document.querySelectorAll('.cat-row .freq-btn.active[data-val="on"]').forEach(function (btn) {
        active.push(btn.getAttribute('data-cat'));
      });
      var custom = [];
      document.querySelectorAll('[data-cat-remove]').forEach(function (btn) {
        custom.push(btn.getAttribute('data-cat-remove'));
      });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_active_categories: active, cl_custom_categories: custom })
        .eq('id', self._userId);
      if (res.error) { console.error('_saveCategories error:', res.error); return; }
      var btn = document.getElementById('save-categories-btn');
      if (btn) { btn.textContent = 'Saved'; btn.disabled = true; }
    } catch (e) { console.error('_saveCategories exception:', e); }
  },

  _addCustomCategory: function (val) {
    var self = this;
    var grid = document.getElementById('category-grid');
    if (!grid) return;
    var div = document.createElement('div');
    div.className = 'settings-row cat-row';
    div.innerHTML = '<div><div class="settings-row-label">' + val + '</div></div>' +
      '<div class="settings-row-control">' +
        '<button type="button" class="btn-remove-url" data-cat-remove="' + val + '">Remove</button>' +
        '<button type="button" class="freq-btn active" data-cat="' + val + '" data-val="on">On</button>' +
        '<button type="button" class="freq-btn" data-cat="' + val + '" data-val="off">Off</button>' +
      '</div>';
    grid.appendChild(div);
  },

  _removeCustomCategory: function (val) {
    var grid = document.getElementById('category-grid');
    if (!grid) return;
    var btn = grid.querySelector('[data-cat-remove="' + val + '"]');
    if (btn && btn.closest('.cat-row')) btn.closest('.cat-row').remove();
  },

  _checkDriveOAuthReturn: async function () {
    var self = this;
    var params = new URLSearchParams(window.location.search);
    if (params.get('connected') !== 'google-drive') return;
    window.history.replaceState({}, '', window.location.pathname);
    var picker = document.getElementById('drive-folder-picker');
    var pickerList = document.getElementById('drive-folder-picker-list');
    var pickerMsg = document.getElementById('drive-folder-picker-msg');
    if (!picker || !pickerList) return;
    picker.style.display = 'block';
    pickerList.innerHTML = '<div style="padding:12px;color:#888;">Loading folders...</div>';
    try {
      var resp = await fetch('/api/drive-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: self._userId, action: 'list-folders' })
      });
      var data = await resp.json();
      var folders = data.folders || [];
      if (folders.length === 0) {
        pickerList.innerHTML = '<div style="padding:12px;color:#888;">No folders found in your Google Drive.</div>';
        return;
      }
      var existingIds = self._driveFolders.map(function (f) { return f.id; });
      pickerList.innerHTML = folders.map(function (f) {
        var already = existingIds.indexOf(f.id) !== -1;
        return '<label class="connection-item" style="cursor:pointer;gap:10px;">' +
          '<input type="checkbox" class="drive-folder-checkbox" data-folder-id="' + f.id + '" data-folder-name="' + f.name + '"' + (already ? ' checked disabled' : '') + '>' +
          '<span class="connection-item-email">' + f.name + (already ? ' (already connected)' : '') + '</span>' +
          '</label>';
      }).join('');
    } catch (err) {
      console.error('Drive folder list error:', err);
      pickerList.innerHTML = '<div style="padding:12px;color:#dc3545;">Could not load folders. Please try again.</div>';
    }
  },

  _saveDriveFolders: async function () {
    var self = this;
    var checkboxes = document.querySelectorAll('.drive-folder-checkbox:checked:not(:disabled)');
    var newFolders = [];
    checkboxes.forEach(function (cb) {
      newFolders.push({ id: cb.getAttribute('data-folder-id'), name: cb.getAttribute('data-folder-name') });
    });
    if (newFolders.length === 0) return;
    var merged = self._driveFolders.concat(newFolders);
    try {
      var res = await self._supabase
        .from('profiles')
        .update({ cl_drive_folders: merged })
        .eq('id', self._userId);
      if (res.error) { console.error('_saveDriveFolders error:', res.error); return; }
      self._driveFolders = merged;
      self._renderDriveFolders();
      var picker = document.getElementById('drive-folder-picker');
      if (picker) picker.style.display = 'none';
      var pickerMsg = document.getElementById('drive-folder-picker-msg');
      if (pickerMsg) { pickerMsg.textContent = ''; pickerMsg.style.display = 'none'; }
    } catch (e) { console.error('_saveDriveFolders exception:', e); }
  },

  _renderDriveFolders: function () {
    var self = this;
    var list = document.getElementById('drive-folders-list');
    if (!list) return;
    if (!self._driveFolders || self._driveFolders.length === 0) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = self._driveFolders.map(function (f) {
      return '<div class="connection-item">' +
        '<span class="connection-item-email">' + f.name + '</span>' +
        '<button class="btn-disconnect" data-type="drive-folder" data-folder-id="' + f.id + '">Disconnect</button>' +
        '</div>';
    }).join('');
  },

  _disconnectDriveFolder: async function (folderId) {
    var self = this;
    try {
      self._driveFolders = self._driveFolders.filter(function (f) { return f.id !== folderId; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_drive_folders: self._driveFolders })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectDriveFolder error:', res.error); await self._loadConnections(); return; }
      self._renderDriveFolders();
    } catch (e) { console.error('_disconnectDriveFolder exception:', e); }
  }

};
