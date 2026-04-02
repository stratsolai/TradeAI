window.CL_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: { email_scan_frequency: 'manual', drive_scan_frequency: 'manual', website_scan_frequency: 'manual' },
  _emails: [],
  _driveConnected: false,
  _websiteUrls: [],

  init: function () {
    var self = this;
    self._supabase = window.supabaseClient;

    self._supabase.auth.getUser().then(function (res) {
      if (!res || !res.data || !res.data.user) {
        window.location.href = '/login.html';
        return;
      }
      self._userId = res.data.user.id;

      var emailEl = document.getElementById('account-email-short');
      if (emailEl) emailEl.textContent = res.data.user.email || '';

      self._bindAccountDropdown();
      self._bindTabSwitcher();
      self._bindScanSave();
      self._bindCategorySave();
      self._bindOAuthButtons();
      self._bindWebsiteButtons();
      self._bindEventDelegation();

      var loading = document.getElementById('auth-loading');
      var wrap = document.getElementById('page-wrap');
      if (loading) loading.style.display = 'none';
      if (wrap) wrap.style.display = 'block';

      self._loadAll();
    });
  },

  _loadAll: async function () {
    var self = this;
    await Promise.all([self._loadConnections(), self._loadScanSettings(), self._loadCategories()]);
  },

  _loadConnections: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('profiles')
        .select('cl_connected_emails, cl_drive_connected, website_urls')
        .eq('id', self._userId)
        .maybeSingle();
      if (res.error) { console.error('_loadConnections error:', res.error); return; }
      var data = res.data || {};
      self._emails = data.cl_connected_emails || [];
      self._driveConnected = data.cl_drive_connected || false;
      self._websiteUrls = data.website_urls || [];
      self._renderEmailList();
      self._renderDriveList();
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

    gmailList.innerHTML = gmails.length ? gmails.map(function (e) {
      return '<div class="connection-item">' +
        '<span class="connection-item-email">' + (e.email || '') + '</span>' +
        '<button class="btn-disconnect" data-email="' + (e.email || '') + '" data-type="email">Disconnect</button>' +
        '</div>';
    }).join('') : '';

    outlookList.innerHTML = outlooks.length ? outlooks.map(function (e) {
      return '<div class="connection-item">' +
        '<span class="connection-item-email">' + (e.email || '') + '</span>' +
        '<button class="btn-disconnect" data-email="' + (e.email || '') + '" data-type="email">Disconnect</button>' +
        '</div>';
    }).join('') : '';
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
  },

  _renderWebsiteList: function () {
    var self = this;
    var list = document.getElementById('website-urls-list');
    if (!list) return;
    list.innerHTML = self._websiteUrls.map(function (url) {
      return '<div class="website-url-item">' +
        '<input class="website-url-input" type="text" value="' + url + '" readonly />' +
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
    var grid = document.getElementById('category-grid');
    var customList = document.getElementById('custom-categories-list');
    if (grid) {
      grid.querySelectorAll('.cat-pill').forEach(function (pill) {
        var val = pill.getAttribute('data-value');
        pill.classList.toggle('active', active.indexOf(val) !== -1);
      });
    }
    if (customList) {
      customList.innerHTML = custom.map(function (c) {
        return '<div class="cat-row">' +
          '<span>' + c + '</span>' +
          '<button class="btn-remove-custom" data-value="' + c + '">Remove</button>' +
          '</div>';
      }).join('');
    }
  },

  _bindAccountDropdown: function () {
    var btn = document.getElementById('account-btn');
    var dropdown = document.getElementById('account-dropdown');
    if (btn && dropdown) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', function () { dropdown.classList.remove('open'); });
    }
    var signOut = document.getElementById('sign-out-btn');
    if (signOut) {
      signOut.addEventListener('click', function () {
        window.supabaseClient.auth.signOut().then(function () {
          window.location.href = '/login.html';
        });
      });
    }
  },

  _bindTabSwitcher: function () {
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var panel = document.getElementById('tab-' + target);
        if (panel) panel.classList.add('active');
      });
    });
  },

  _bindOAuthButtons: function () {
    var self = this;
    var gmailBtn = document.getElementById('add-gmail-btn');
    var outlookBtn = document.getElementById('add-outlook-btn');
    var driveBtn = document.getElementById('add-drive-btn');
    if (gmailBtn) gmailBtn.addEventListener('click', function () { self._startOAuth('gmail'); });
    if (outlookBtn) outlookBtn.addEventListener('click', function () { self._startOAuth('microsoft'); });
    if (driveBtn) driveBtn.addEventListener('click', function () { self._startOAuth('google-drive'); });
  },

  _startOAuth: function (provider) {
    var self = this;
    if (!self._userId) return;
    window.location.href = '/api/auth/initiate?provider=' + provider + '&userId=' + self._userId + '&flow=cl';
  },

  _bindWebsiteButtons: function () {
    var self = this;
    var addBtn = document.getElementById('add-website-btn');
    var saveBtn = document.getElementById('website-save-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        self._websiteUrls.push('');
        self._renderWebsiteList();
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', function () { self._saveWebsiteUrls(); });
    }
  },

  _bindScanSave: function () {
    var self = this;
    ['email-freq-ctrl', 'drive-freq-ctrl', 'website-freq-ctrl'].forEach(function (id) {
      var ctrl = document.getElementById(id);
      if (!ctrl) return;
      ctrl.addEventListener('click', function (e) {
        var btn = e.target.closest('.freq-btn');
        if (!btn) return;
        var field = id === 'email-freq-ctrl' ? 'email_scan_frequency'
          : id === 'drive-freq-ctrl' ? 'drive_scan_frequency'
          : 'website_scan_frequency';
        self._settings[field] = btn.getAttribute('data-value');
        self._setFreqButtons(id, self._settings[field]);
      });
    });
    var saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) saveBtn.addEventListener('click', function () { self._saveScanSettings(); });
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
        }
      });
    }
    if (saveBtn) saveBtn.addEventListener('click', function () { self._saveCategories(); });
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
        }
        return;
      }
      var removeBtn = e.target.closest('.btn-remove-url');
      if (removeBtn) {
        var url = removeBtn.getAttribute('data-url');
        self._websiteUrls = self._websiteUrls.filter(function (u) { return u !== url; });
        self._renderWebsiteList();
        return;
      }
      var removeCat = e.target.closest('.btn-remove-custom');
      if (removeCat) {
        var val = removeCat.getAttribute('data-value');
        self._removeCustomCategory(val);
        return;
      }
      var pill = e.target.closest('.cat-pill');
      if (pill) {
        pill.classList.toggle('active');
        return;
      }
    });
  },

  _disconnectEmail: async function (email) {
    var self = this;
    try {
      self._emails = self._emails.filter(function (e) {
        return e && e.email !== email;
      });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_connected_emails: self._emails })
        .eq('id', self._userId);
      if (res.error) {
        console.error('_disconnectEmail error:', res.error);
        await self._loadConnections();
        return;
      }
      self._renderEmailList();
    } catch (e) { console.error('_disconnectEmail exception:', e); }
  },

  _disconnectDrive: async function () {
    var self = this;
    try {
      self._driveConnected = false;
      var res = await self._supabase
        .from('profiles')
        .update({ cl_drive_connected: false })
        .eq('id', self._userId);
      if (res.error) {
        console.error('_disconnectDrive error:', res.error);
        await self._loadConnections();
        return;
      }
      self._renderDriveList();
    } catch (e) { console.error('_disconnectDrive exception:', e); }
  },

  _saveWebsiteUrls: async function () {
    var self = this;
    try {
      var inputs = document.querySelectorAll('.website-url-input');
      var urls = [];
      inputs.forEach(function (input) {
        var val = input.value.trim();
        if (val) urls.push(val);
      });
      self._websiteUrls = urls;
      var res = await self._supabase
        .from('profiles')
        .update({ website_urls: urls })
        .eq('id', self._userId);
      if (res.error) { console.error('_saveWebsiteUrls error:', res.error); return; }
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
      var msg = document.getElementById('save-scan-msg');
      if (msg) { msg.style.display = 'block'; setTimeout(function () { msg.style.display = 'none'; }, 2000); }
    } catch (e) { console.error('_saveScanSettings exception:', e); }
  },

  _saveCategories: async function () {
    var self = this;
    try {
      var active = [];
      document.querySelectorAll('.cat-pill.active').forEach(function (p) {
        active.push(p.getAttribute('data-value'));
      });
      var custom = [];
      document.querySelectorAll('.btn-remove-custom').forEach(function (b) {
        custom.push(b.getAttribute('data-value'));
      });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_active_categories: active, cl_custom_categories: custom })
        .eq('id', self._userId);
      if (res.error) { console.error('_saveCategories error:', res.error); return; }
      var msg = document.getElementById('save-categories-msg');
      if (msg) { msg.style.display = 'block'; setTimeout(function () { msg.style.display = 'none'; }, 2000); }
    } catch (e) { console.error('_saveCategories exception:', e); }
  },

  _addCustomCategory: function (val) {
    var self = this;
    var list = document.getElementById('custom-categories-list');
    if (!list) return;
    var div = document.createElement('div');
    div.className = 'cat-row';
    div.innerHTML = '<span>' + val + '</span><button class="btn-remove-custom" data-value="' + val + '">Remove</button>';
    list.appendChild(div);
  },

  _removeCustomCategory: function (val) {
    var list = document.getElementById('custom-categories-list');
    if (!list) return;
    var btn = list.querySelector('[data-value="' + val + '"]');
    if (btn && btn.closest('.cat-row')) btn.closest('.cat-row').remove();
  }

};

document.addEventListener('DOMContentLoaded', function () {
  window.CL_SETTINGS_LOGIC.init();
});
