window.CL_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: { email_scan_frequency: 'manual', drive_scan_frequency: 'manual', website_scan_frequency: 'manual', onedrive_scan_frequency: 'manual', sharepoint_scan_frequency: 'manual', dropbox_scan_frequency: 'manual' },
  _emails: [],
  _driveAccounts: [],
  _websiteUrls: [],
  _onedriveAccounts: [],
  _sharepointAccounts: [],
  _dropboxAccounts: [],
  _xeroAccounts: [],
  _quickbooksAccounts: [],
  _servicem8Accounts: [],
  _fergusAccounts: [],

  init: function () {
    var self = this;
    self._supabase = window.supabaseClient;
    self._bindTabs();
    self._checkTabQueryParam();

    self._supabase.auth.getUser().then(function (res) {
      if (!res || !res.data || !res.data.user) return;
      self._userId = res.data.user.id;

      self._bindEventDelegation();
      self._bindScanSave();
      self._bindWebsiteButtons();
      self._loadAll();
      self._checkDriveOAuthReturn();
      self._checkOnedriveOAuthReturn();
      self._checkSharepointOAuthReturn();
      self._checkDropboxOAuthReturn();
      self._checkToolOAuthReturn();
      self._bindPermissionModal();

      self._bindCLPicker('drive-folder-picker', function () {});
      self._bindCLPicker('onedrive-folder-picker', function () {});
      self._bindCLPicker('sharepoint-site-picker', function () {});
      self._bindCLPicker('sharepoint-library-picker', function () {});
      self._bindCLPicker('dropbox-folder-picker', function () {});

      // SharePoint site picker — convert to immediate-save pattern.
      // Hide the legacy Save button and restyle Cancel as Close. The
      // ::before glyph suppression lives with the other picker Close
      // button rules in cl-settings.html.
      var spsSaveBtn = document.getElementById('sharepoint-site-picker-save');
      if (spsSaveBtn) spsSaveBtn.style.display = 'none';
      var spsCancelBtn = document.getElementById('sharepoint-site-picker-cancel');
      if (spsCancelBtn) {
        spsCancelBtn.className = 'btn-disconnect';
        spsCancelBtn.textContent = 'Close';
      }

      // When a folder picker closes, clear the flex-wrap that the picker-
      // relocation logic in _openXxxFolderPicker sets on the picker's host
      // .settings-row. Leaving flex-wrap:wrap on permanently shifts the
      // email tile horizontally even with the picker hidden.
      function bindPickerFlexWrapReset(cancelBtnId, pickerId) {
        var btn = document.getElementById(cancelBtnId);
        if (!btn) return;
        btn.addEventListener('click', function () {
          var p = document.getElementById(pickerId);
          if (p && p.parentElement && p.parentElement.classList && p.parentElement.classList.contains('settings-row')) {
            p.parentElement.classList.remove('picker-row-wrap');
          }
        });
      }
      bindPickerFlexWrapReset('drive-folder-picker-cancel', 'drive-folder-picker');
      bindPickerFlexWrapReset('onedrive-folder-picker-cancel', 'onedrive-folder-picker');
      bindPickerFlexWrapReset('sharepoint-site-picker-cancel', 'sharepoint-site-picker');
      bindPickerFlexWrapReset('sharepoint-library-picker-cancel', 'sharepoint-library-picker');
      bindPickerFlexWrapReset('dropbox-folder-picker-cancel', 'dropbox-folder-picker');
    });
  },

  _bindTabs: function () {
    document.querySelectorAll('.ptab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.ptab').forEach(function(b) { b.classList.remove('settings-active'); });
        document.querySelectorAll('.ptab-content').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('settings-active');
        var panel = document.getElementById('tab-' + btn.getAttribute('data-tab'));
        if (panel) panel.classList.add('active');
      });
    });
  },

  _checkTabQueryParam: function () {
    var params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'tool-connections') {
      document.querySelectorAll('.ptab').forEach(function(b) { b.classList.remove('settings-active'); });
      document.querySelectorAll('.ptab-content').forEach(function(p) { p.classList.remove('active'); });
      var toolTab = document.querySelector('.ptab[data-tab="tool"]');
      var toolPanel = document.getElementById('tab-tool');
      if (toolTab) toolTab.classList.add('settings-active');
      if (toolPanel) toolPanel.classList.add('active');
    }
  },

  _loadAll: async function () {
    var self = this;
    await Promise.all([
      self._loadConnections(),
      self._loadScanSettings()
    ]);
  },

  // upgradeSharepointEntry loaded from /upgrade-sharepoint.js (window global).

  _loadConnections: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('profiles')
        .select('cl_connected_emails, cl_drive_accounts, website_urls, cl_onedrive_accounts, cl_sharepoint_accounts, cl_dropbox_accounts, cl_xero_accounts, cl_quickbooks_accounts, cl_servicem8_accounts, cl_fergus_accounts')
        .eq('id', self._userId)
        .maybeSingle();
      if (res.error) { console.error('_loadConnections error:', res.error); return; }
      var data = res.data || {};
      self._emails = data.cl_connected_emails || [];
      // Defensive normalisation on read: filter out any null / falsy
      // elements from each cloud accounts array. No current write path
      // in cl-onedrive-callback.js, cl-sharepoint-callback.js,
      // cl-dropbox-callback.js, cl-drive-callback.js, or any of the
      // import endpoints pushes a null — every write site either
      // pushes a complete entry object or modifies an existing entry
      // in place. But historical data from earlier-version bugs has
      // been observed (a null entry in cl_onedrive_accounts caused
      // _renderOnedriveList to crash earlier today), so scrubbing
      // nulls at the read boundary makes the renders permanently
      // safe regardless of what got into the database before.
      function nonNull(arr) { return arr.filter(function (a) { return a; }); }
      self._driveAccounts = nonNull(Array.isArray(data.cl_drive_accounts) ? data.cl_drive_accounts : []);
      self._websiteUrls = data.website_urls || [];
      self._onedriveAccounts = nonNull(Array.isArray(data.cl_onedrive_accounts) ? data.cl_onedrive_accounts : []);
      self._sharepointAccounts = nonNull(Array.isArray(data.cl_sharepoint_accounts) ? data.cl_sharepoint_accounts : []);
      self._sharepointAccounts.forEach(function (a) { window.upgradeSharepointEntry(a); });
      self._dropboxAccounts = nonNull(Array.isArray(data.cl_dropbox_accounts) ? data.cl_dropbox_accounts : []);
      self._xeroAccounts = nonNull(Array.isArray(data.cl_xero_accounts) ? data.cl_xero_accounts : []);
      self._quickbooksAccounts = nonNull(Array.isArray(data.cl_quickbooks_accounts) ? data.cl_quickbooks_accounts : []);
      self._servicem8Accounts = nonNull(Array.isArray(data.cl_servicem8_accounts) ? data.cl_servicem8_accounts : []);
      self._fergusAccounts = nonNull(Array.isArray(data.cl_fergus_accounts) ? data.cl_fergus_accounts : []);
      self._renderEmailList();
      self._renderDriveList();
      self._renderWebsiteList();
      self._renderOnedriveList();
      self._renderSharepointList();
      self._renderDropboxList();
      self._renderToolConnections();
    } catch (e) { console.error('_loadConnections exception:', e); }
  },

  _loadScanSettings: async function () {
    var self = this;
    try {
      var res = await self._supabase
        .from('cl_settings')
        .select('email_scan_frequency, drive_scan_frequency, website_scan_frequency, onedrive_scan_frequency, sharepoint_scan_frequency, dropbox_scan_frequency')
        .eq('user_id', self._userId)
        .maybeSingle();
      if (res.error) { console.error('_loadScanSettings error:', res.error); return; }
      if (res.data) {
        self._settings.email_scan_frequency = res.data.email_scan_frequency || 'manual';
        self._settings.drive_scan_frequency = res.data.drive_scan_frequency || 'manual';
        self._settings.website_scan_frequency = res.data.website_scan_frequency || 'manual';
        self._settings.onedrive_scan_frequency = res.data.onedrive_scan_frequency || 'manual';
        self._settings.sharepoint_scan_frequency = res.data.sharepoint_scan_frequency || 'manual';
        self._settings.dropbox_scan_frequency = res.data.dropbox_scan_frequency || 'manual';
      }
      self._renderScanSettings();
    } catch (e) { console.error('_loadScanSettings exception:', e); }
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
        '<div class="connection-item-row1">' +
          '<span class="connection-item-email">' + (e.email || '') + '</span>' +
          '<button class="btn-disconnect" data-email="' + (e.email || '') + '" data-type="email">Disconnect</button>' +
        '</div>' +
        '<div class="connection-item-row2">' +
          self._buildEmailLookbackHtml('gmail', e.email, e.lookback_days) +
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
          self._buildEmailLookbackHtml('outlook', e.email, e.lookback_days) +
        '</div>' +
        '</div>';
    }).join('');

    var gmailBtn = document.getElementById('add-gmail-btn');
    var outlookBtn = document.getElementById('add-outlook-btn');
    if (gmailBtn) { gmailBtn.onclick = function () { self._showCLConnPermModal('gmail'); }; }
    if (outlookBtn) { outlookBtn.onclick = function () { self._showCLConnPermModal('microsoft'); }; }
  },

  _renderDriveList: function () {
    var self = this;
    var list = document.getElementById('drive-connections-list');
    if (!list) return;
    list.innerHTML = self._driveAccounts.map(function (a) {
      var folders = Array.isArray(a.folders) ? a.folders : [];
      var folderHtml = folders.map(function (f) {
        return '<div class="connection-folder-row picker-row-between">' +
          '<div class="connection-folder-name">' + (f.name || f.id || '') + '</div>' +
          '<button class="btn-remove-folder" data-account="' + (a.account_email || '') + '" data-folder-id="' + (f.id || '') + '" data-type="drive-folder">Remove</button>' +
          '</div>';
      }).join('');
      return '<div class="connection-item">' +
        '<div class="connection-item-row1">' +
          '<span class="connection-item-email">' + (a.account_email || '') + '</span>' +
          '<button class="btn-disconnect" data-account="' + (a.account_email || '') + '" data-type="drive">Disconnect</button>' +
        '</div>' +
        '<div class="connection-item-row2">' +
          self._buildLookbackHtml('drive', a.account_email, a.lookback_months) +
          '<button class="btn-pick-folders" data-account="' + (a.account_email || '') + '" data-type="drive">📁 Choose Folders</button>' +
        '</div>' +
        '</div>' +
        (folders.length > 0 ? '<div class="connection-folders-list">' + folderHtml + '</div>' : '');
    }).join('');
    var driveBtn = document.getElementById('add-drive-btn');
    if (driveBtn) { driveBtn.onclick = function () { self._showCLConnPermModal('google-drive'); }; }
  },

  _renderWebsiteList: function () {
    var self = this;
    var list = document.getElementById('website-urls-list');
    if (!list) return;
    list.innerHTML = self._websiteUrls.map(function (url) {
      return '<div class="website-url-item">' +
        '<div style="flex:1;min-width:0;">' +
          '<input class="website-url-input" type="text" value="' + url + '" />' +
          '<div class="website-url-error picker-error" style="display:none;margin-top:3px;font-size:var(--badge-font-size);"></div>' +
        '</div>' +
        '<button class="btn-remove-url" data-url="' + url + '">Remove</button>' +
        '</div>';
    }).join('');
  },

  _renderScanSettings: function () {
    var self = this;
    self._setFreqButtons('email-freq-ctrl', self._settings.email_scan_frequency);
    self._setFreqButtons('drive-freq-ctrl', self._settings.drive_scan_frequency);
    self._setFreqButtons('website-freq-ctrl', self._settings.website_scan_frequency);
    self._setFreqButtons('onedrive-freq-ctrl', self._settings.onedrive_scan_frequency);
    self._setFreqButtons('sharepoint-freq-ctrl', self._settings.sharepoint_scan_frequency);
    self._setFreqButtons('dropbox-freq-ctrl', self._settings.dropbox_scan_frequency);
  },

  _setFreqButtons: function (containerId, value) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.freq-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-value') === value);
    });
  },


  _bindEventDelegation: function () {
    var self = this;
    document.addEventListener('change', function (e) {
      var websiteInput = e.target.closest && e.target.closest('#website-urls-list .website-url-input');
      if (websiteInput) {
        self._saveWebsiteUrls();
      }
    });
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
          // Close all other open lookback menus first
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
          var lbType = lbTrigger.getAttribute('data-lookback-type');
          var provider = lbTrigger.getAttribute('data-provider');
          var acct = lbTrigger.getAttribute('data-account');
          // Update button label
          lbTrigger.innerHTML = lbItem.textContent;
          // Update active item
          lbMenu.querySelectorAll('.lookback-dropdown-item').forEach(function (it) { it.classList.remove('active'); });
          lbItem.classList.add('active');
          // Close menu
          lbMenu.classList.remove('open');
          lbTrigger.classList.remove('active');
          // Save to Supabase
          if (lbType === 'drive' && acct) {
            self._changeLookback(provider, acct, val);
          } else if (lbType === 'email' && acct) {
            self._changeEmailLookback(provider, acct, val);
          }
        }
        return;
      }

      var disconnectBtn = e.target.closest('.btn-disconnect, .btn-remove-folder');
      if (disconnectBtn) {
        var type = disconnectBtn.getAttribute('data-type');
        if (type === 'email') {
          var email = disconnectBtn.getAttribute('data-email');
          if (email) self._disconnectEmail(email);
        } else if (type === 'drive') {
          var drvAcct = disconnectBtn.getAttribute('data-account');
          if (drvAcct) self._disconnectDriveAccount(drvAcct);
        } else if (type === 'drive-folder') {
          var drvfA = disconnectBtn.getAttribute('data-account');
          var drvfId = disconnectBtn.getAttribute('data-folder-id');
          if (drvfA && drvfId) self._disconnectDriveFolder(drvfA, drvfId);
        } else if (type === 'onedrive') {
          var odAcct = disconnectBtn.getAttribute('data-account');
          if (odAcct) self._disconnectOnedriveAccount(odAcct);
        } else if (type === 'sharepoint') {
          var spAcct = disconnectBtn.getAttribute('data-account');
          if (spAcct) self._disconnectSharepointAccount(spAcct);
        } else if (type === 'dropbox') {
          var dbAcct = disconnectBtn.getAttribute('data-account');
          if (dbAcct) self._disconnectDropboxAccount(dbAcct);
        } else if (type === 'onedrive-folder') {
          var odfA = disconnectBtn.getAttribute('data-account');
          var odfId = disconnectBtn.getAttribute('data-folder-id');
          if (odfA && odfId) self._disconnectOnedriveFolder(odfA, odfId);
        } else if (type === 'sharepoint-site') {
          var spsA = disconnectBtn.getAttribute('data-account');
          var spsId = disconnectBtn.getAttribute('data-site-id');
          if (spsA && spsId) self._disconnectSharepointSite(spsA, spsId);
        } else if (type === 'sharepoint-library') {
          var splA = disconnectBtn.getAttribute('data-account');
          var splS = disconnectBtn.getAttribute('data-site-id');
          var splId = disconnectBtn.getAttribute('data-library-id');
          if (splA && splS && splId) self._disconnectSharepointLibrary(splA, splS, splId);
        } else if (type === 'dropbox-folder') {
          var dbfA = disconnectBtn.getAttribute('data-account');
          var dbfId = disconnectBtn.getAttribute('data-folder-id');
          if (dbfA && dbfId) self._disconnectDropboxFolder(dbfA, dbfId);
        } else if (type === 'xero') {
          var xAcct = disconnectBtn.getAttribute('data-account');
          if (xAcct) self._disconnectToolAccount('xero', xAcct);
        } else if (type === 'quickbooks') {
          var qbAcct = disconnectBtn.getAttribute('data-account');
          if (qbAcct) self._disconnectToolAccount('quickbooks', qbAcct);
        } else if (type === 'servicem8') {
          var smAcct = disconnectBtn.getAttribute('data-account');
          if (smAcct) self._disconnectToolAccount('servicem8', smAcct);
        } else if (type === 'fergus') {
          var fgAcct = disconnectBtn.getAttribute('data-account');
          if (fgAcct) self._disconnectToolAccount('fergus', fgAcct);
        }
        return;
      }

      var pickFoldersBtn = e.target.closest('.btn-pick-folders');
      if (pickFoldersBtn) {
        var pfType = pickFoldersBtn.getAttribute('data-type');
        var pfAcct = pickFoldersBtn.getAttribute('data-account');
        if (pfType === 'onedrive' && pfAcct) self._openOnedriveFolderPicker(pfAcct);
        else if (pfType === 'dropbox' && pfAcct) self._openDropboxFolderPicker(pfAcct);
        else if (pfType === 'drive' && pfAcct) self._openDriveFolderPicker(pfAcct);
        return;
      }
      var pickSitesBtn = e.target.closest('.btn-pick-sites');
      if (pickSitesBtn) {
        var psAcct = pickSitesBtn.getAttribute('data-account');
        if (psAcct) self._openSharepointSitePicker(psAcct);
        return;
      }
      var pickLibrariesBtn = e.target.closest('.btn-pick-libraries');
      if (pickLibrariesBtn) {
        var plAcct = pickLibrariesBtn.getAttribute('data-account');
        var plSiteId = pickLibrariesBtn.getAttribute('data-site-id');
        if (plAcct && plSiteId) self._openSharepointLibraryPicker(plAcct, plSiteId);
        return;
      }

      var removeUrlBtn = e.target.closest('.btn-remove-url[data-url]');
      if (removeUrlBtn) {
        var url = removeUrlBtn.getAttribute('data-url');
        self._websiteUrls = self._websiteUrls.filter(function (u) { return u !== url; });
        self._renderWebsiteList();
        self._saveWebsiteUrls();
        return;
      }

      var scanBtn = e.target.closest('.freq-btn[data-value]');
      if (scanBtn) {
        var container = scanBtn.closest('[id$="-freq-ctrl"]');
        if (container) {
          var field = container.id === 'email-freq-ctrl' ? 'email_scan_frequency'
            : container.id === 'drive-freq-ctrl' ? 'drive_scan_frequency'
            : container.id === 'onedrive-freq-ctrl' ? 'onedrive_scan_frequency'
            : container.id === 'sharepoint-freq-ctrl' ? 'sharepoint_scan_frequency'
            : container.id === 'dropbox-freq-ctrl' ? 'dropbox_scan_frequency'
            : 'website_scan_frequency';
          self._settings[field] = scanBtn.getAttribute('data-value');
          self._setFreqButtons(container.id, self._settings[field]);
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

  _bindWebsiteButtons: function () {
    var self = this;
    var addBtn = document.getElementById('add-website-btn');
    if (addBtn) addBtn.addEventListener('click', function () {
      // Add an empty row to the in-memory list and re-render so a
      // fresh input box appears for the user to type into. Do NOT
      // call _saveWebsiteUrls here — its validation loop strips
      // empty inputs at line 491, then overwrites _websiteUrls with
      // the filtered list, which would immediately delete the row
      // we just added and the new input field would vanish before
      // the user could type in it. The blur/change event delegated
      // at line 263 already triggers _saveWebsiteUrls once the user
      // has typed something, so the immediate-save behaviour is
      // preserved without the disappearing-row bug.
      self._websiteUrls.push('');
      self._renderWebsiteList();
    });
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

  _disconnectDriveAccount: async function (accountEmail) {
    var self = this;
    try {
      self._driveAccounts = self._driveAccounts.filter(function (a) { return a && a.account_email !== accountEmail; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_drive_accounts: self._driveAccounts })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectDriveAccount error:', res.error); await self._loadConnections(); return; }
      self._renderDriveList();
    } catch (e) { console.error('_disconnectDriveAccount exception:', e); }
  },

  _disconnectDriveFolder: async function (accountEmail, folderId) {
    var self = this;
    try {
      var entryIdx = self._driveAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
      if (entryIdx === -1) return;
      var folders = Array.isArray(self._driveAccounts[entryIdx].folders) ? self._driveAccounts[entryIdx].folders : [];
      self._driveAccounts[entryIdx].folders = folders.filter(function (f) { return f.id !== folderId; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_drive_accounts: self._driveAccounts })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectDriveFolder error:', res.error); await self._loadConnections(); return; }
      self._renderDriveList();
    } catch (e) { console.error('_disconnectDriveFolder exception:', e); }
  },

  _changeLookback: async function (provider, accountEmail, value) {
    var self = this;
    var fieldMap = {
      drive:      { state: '_driveAccounts',      column: 'cl_drive_accounts' },
      onedrive:   { state: '_onedriveAccounts',   column: 'cl_onedrive_accounts' },
      sharepoint: { state: '_sharepointAccounts', column: 'cl_sharepoint_accounts' },
      dropbox:    { state: '_dropboxAccounts',    column: 'cl_dropbox_accounts' }
    };
    var conf = fieldMap[provider];
    if (!conf) return;
    try {
      var arr = self[conf.state];
      var entryIdx = arr.findIndex(function (a) { return a && a.account_email === accountEmail; });
      if (entryIdx === -1) return;
      var months = value === '' ? null : parseInt(value, 10);
      arr[entryIdx].lookback_months = months;
      var update = {};
      update[conf.column] = arr;
      var res = await self._supabase
        .from('profiles')
        .update(update)
        .eq('id', self._userId);
      if (res.error) { console.error('_changeLookback error:', res.error); await self._loadConnections(); return; }
    } catch (e) { console.error('_changeLookback exception:', e); }
  },

  _validateUrl: function (raw) {
    if (!raw) return { valid: false, url: '', error: 'Please enter a URL' };
    var url = raw.trim();
    // Auto-correct missing protocol
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    // Block obviously malformed URLs
    try {
      var parsed = new URL(url);
      if (!parsed.hostname || parsed.hostname.indexOf('.') === -1) {
        return { valid: false, url: url, error: 'Enter a valid website address (e.g. www.example.com.au)' };
      }
      if (parsed.pathname === '///' || parsed.hostname === '') {
        return { valid: false, url: url, error: 'This URL is not valid. Check for extra slashes or missing domain.' };
      }
    } catch (e) {
      return { valid: false, url: url, error: 'This URL is not valid. Check the format and try again.' };
    }
    return { valid: true, url: url, error: '' };
  },

  _saveWebsiteUrls: async function () {
    var self = this;
    try {
      var inputs = document.querySelectorAll('#website-urls-list .website-url-input');
      var errors = document.querySelectorAll('#website-urls-list .website-url-error');
      var urls = [];
      var hasError = false;
      // Clear previous errors
      errors.forEach(function (el) { el.style.display = 'none'; el.textContent = ''; });
      inputs.forEach(function (input, idx) {
        var raw = input.value.trim();
        if (!raw) return;
        var result = self._validateUrl(raw);
        if (!result.valid) {
          hasError = true;
          var errEl = errors[idx];
          if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
          input.classList.add('input-error');
        } else {
          input.value = result.url;
          input.classList.remove('input-error');
          urls.push(result.url);
        }
      });
      if (hasError) return;
      self._websiteUrls = urls;
      var res = await self._supabase
        .from('profiles')
        .update({ website_urls: urls })
        .eq('id', self._userId);
      if (res.error) { console.error('_saveWebsiteUrls error:', res.error); return; }
      self._renderWebsiteList();
    } catch (e) { console.error('_saveWebsiteUrls exception:', e); }
  },

  _saveScanSettings: function () {
    var self = this;
    var btn = document.getElementById('save-settings-btn');
    window.handleSave(btn, async function() {
      var existing = await self._supabase
        .from('cl_settings')
        .select('user_id')
        .eq('user_id', self._userId)
        .maybeSingle();
      var payload = {
        email_scan_frequency: self._settings.email_scan_frequency,
        drive_scan_frequency: self._settings.drive_scan_frequency,
        website_scan_frequency: self._settings.website_scan_frequency,
        onedrive_scan_frequency: self._settings.onedrive_scan_frequency,
        sharepoint_scan_frequency: self._settings.sharepoint_scan_frequency,
        dropbox_scan_frequency: self._settings.dropbox_scan_frequency,
        updated_at: new Date().toISOString()
      };
      var res;
      if (existing.data) {
        res = await self._supabase.from('cl_settings').update(payload).eq('user_id', self._userId);
      } else {
        payload.user_id = self._userId;
        res = await self._supabase.from('cl_settings').insert(payload);
      }
      if (res.error) throw new Error(res.error.message);
    }, document.getElementById('scan-save-msg'));
  },

  _checkDriveOAuthReturn: async function () {
    var self = this;
    var params = new URLSearchParams(window.location.search);
    if (params.get('connected') !== 'google-drive') return;
    window.history.replaceState({}, '', window.location.pathname);
    await self._loadConnections();
    if (self._driveAccounts.length > 0) {
      var lastAcct = self._driveAccounts[self._driveAccounts.length - 1];
      if (lastAcct && lastAcct.account_email) {
        self._openDriveFolderPicker(lastAcct.account_email);
      }
    }
  },

  _openDriveFolderPicker: async function (accountEmail) {
    var self = this;
    var picker = document.getElementById('drive-folder-picker');
    var pickerList = document.getElementById('drive-folder-picker-list');
    if (!picker || !pickerList) return;
    // Relocate the picker inside the Google Drive settings-row so it sits
    // above the row's bottom divider, anchored to the Drive section instead
    // of bleeding visually into the OneDrive section below. flex-wrap is
    // re-applied on every open and cleared by the cancel-button listener
    // in init() — leaving it permanently set would shift the email tile
    // horizontally even after the picker is hidden.
    var driveAddBtn = document.getElementById('add-drive-btn');
    var driveRow = driveAddBtn ? driveAddBtn.closest('.settings-row') : null;
    if (driveRow) {
      if (picker.parentElement !== driveRow) {
        driveRow.appendChild(picker);
        picker.classList.add('picker-inline');
      }
      driveRow.classList.add('picker-row-wrap');
    }
    picker.setAttribute('data-account', accountEmail);
    picker.style.display = 'block';
    pickerList.innerHTML = '<div class="picker-loading">Loading folders...</div>';
    try {
      var token = await self._getAccessToken();
      var resp = await fetch('/api/drive-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'list-folders', accountEmail: accountEmail })
      });
      var data = await resp.json();
      if (!data.success) { throw new Error(data.error || 'Could not list Google Drive folders'); }
      var folders = data.folders || [];
      if (folders.length === 0) {
        pickerList.innerHTML = '<div class="picker-empty">No folders found in this Google Drive account.</div>';
        return;
      }
      var entry = self._driveAccounts.find(function (a) { return a && a.account_email === accountEmail; });
      var existingIds = (entry && Array.isArray(entry.folders)) ? entry.folders.map(function (f) { return f.id; }) : [];
      pickerList.innerHTML = folders.map(function (f) {
        var already = existingIds.indexOf(f.id) !== -1;
        var btnClass = already ? 'btn-remove-folder' : 'btn-add-folder';
        var btnLabel = already ? 'Remove' : '+ Add';
        return '<div class="connection-folder-row picker-folder-row-pad">' +
          '<input type="text" class="website-url-input" value="' + (f.name || '') + '" readonly>' +
          '<button type="button" class="folder-picker-toggle ' + btnClass + '" data-folder-id="' + f.id + '" data-folder-name="' + (f.name || '') + '">' + btnLabel + '</button>' +
          '</div>';
      }).join('');
      pickerList.onclick = async function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.folder-picker-toggle') : null;
        if (!btn || btn.disabled) return;
        var folderId = btn.getAttribute('data-folder-id');
        var folderName = btn.getAttribute('data-folder-name');
        var entryIdx = self._driveAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
        if (entryIdx === -1) return;
        var current = Array.isArray(self._driveAccounts[entryIdx].folders) ? self._driveAccounts[entryIdx].folders : [];
        var isAdded = current.some(function (f) { return f.id === folderId; });
        var next = isAdded
          ? current.filter(function (f) { return f.id !== folderId; })
          : current.concat([{ id: folderId, name: folderName }]);
        btn.disabled = true;
        self._driveAccounts[entryIdx].folders = next;
        try {
          var res = await self._supabase
            .from('profiles')
            .update({ cl_drive_accounts: self._driveAccounts })
            .eq('id', self._userId);
          if (res.error) {
            console.error('Drive folder picker save error:', res.error);
            self._driveAccounts[entryIdx].folders = current;
            btn.disabled = false;
            return;
          }
          if (isAdded) {
            btn.classList.remove('btn-remove-folder');
            btn.classList.add('btn-add-folder');
            btn.textContent = '+ Add';
          } else {
            btn.classList.remove('btn-add-folder');
            btn.classList.add('btn-remove-folder');
            btn.textContent = 'Remove';
          }
          self._renderDriveList();
          btn.disabled = false;
        } catch (saveErr) {
          console.error('Drive folder picker save exception:', saveErr);
          self._driveAccounts[entryIdx].folders = current;
          btn.disabled = false;
        }
      };
    } catch (err) {
      console.error('Drive folder picker error:', err);
      pickerList.innerHTML = '<div class="picker-error">Could not load folders. Please try again.</div>';
    }
  },


  // ── Task 10 CL Connections — OneDrive, SharePoint, Dropbox ─────────────
  // All three follow the Gmail/Outlook multi-account pattern: tokens are
  // stored as a jsonb array on the profile, one tile row per array entry,
  // per-row Disconnect, "Connect Another" starts a fresh OAuth flow.

  _bindCLPicker: function (pickerId, saveCallback) {
    var saveBtn = document.getElementById(pickerId + '-save');
    if (saveBtn) saveBtn.addEventListener('click', saveCallback);
    var cancelBtn = document.getElementById(pickerId + '-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      var p = document.getElementById(pickerId);
      if (p) p.style.display = 'none';
    });
  },

  _getAccessToken: async function () {
    var sessionRes = await this._supabase.auth.getSession();
    return sessionRes && sessionRes.data && sessionRes.data.session ? sessionRes.data.session.access_token : null;
  },

  _startCLOAuth: function (provider) {
    if (!this._userId) return;
    window.location.href = '/api/cl-oauth-initiate?provider=' + provider + '&userId=' + this._userId;
  },

  // Lookback dropdown — rendered identically on all four file storage providers.
  // provider: 'drive' | 'onedrive' | 'sharepoint' | 'dropbox'
  _buildLookbackHtml: function (provider, accountEmail, currentMonths) {
    var current = (currentMonths == null) ? '1' : String(currentMonths);
    var opts = [
      { v: '',   l: 'All time' },
      { v: '1',  l: '1 month' },
      { v: '3',  l: '3 months' },
      { v: '6',  l: '6 months' },
      { v: '12', l: '12 months' },
      { v: '24', l: '24 months' }
    ];
    var currentLabel = '1 month';
    opts.forEach(function (o) { if (o.v === current) currentLabel = o.l; });
    return '<span class="connection-item-lookback">' +
      '<span class="lookback-dropdown-wrap">' +
        '<button type="button" class="lookback-dropdown" data-provider="' + provider + '" data-account="' + (accountEmail || '') + '" data-lookback-type="drive">' + currentLabel + '</button>' +
        '<div class="lookback-dropdown-menu">' +
        opts.map(function (o) {
          var cls = o.v === current ? ' active' : '';
          return '<button type="button" class="lookback-dropdown-item' + cls + '" data-value="' + o.v + '">' + o.l + '</button>';
        }).join('') +
        '</div>' +
      '</span>' +
    '</span>';
  },

  // Lookback dropdown for email providers (Gmail / Outlook).
  // Uses days instead of months — email lookback windows are shorter.
  // provider: 'gmail' | 'outlook'
  _buildEmailLookbackHtml: function (provider, accountEmail, currentDays) {
    var current = (currentDays == null) ? '30' : String(currentDays);
    var opts = [
      { v: '30',  l: '30 days' },
      { v: '60',  l: '60 days' },
      { v: '90',  l: '90 days' },
      { v: '180', l: '6 months' },
      { v: '365', l: '12 months' }
    ];
    var currentLabel = '30 days';
    opts.forEach(function (o) { if (o.v === current) currentLabel = o.l; });
    return '<span class="connection-item-lookback">' +
      '<span class="lookback-dropdown-wrap">' +
        '<button type="button" class="lookback-dropdown" data-provider="' + provider + '" data-account="' + (accountEmail || '') + '" data-lookback-type="email">' + currentLabel + '</button>' +
        '<div class="lookback-dropdown-menu">' +
        opts.map(function (o) {
          var cls = o.v === current ? ' active' : '';
          return '<button type="button" class="lookback-dropdown-item' + cls + '" data-value="' + o.v + '">' + o.l + '</button>';
        }).join('') +
        '</div>' +
      '</span>' +
    '</span>';
  },

  _changeEmailLookback: async function (provider, accountEmail, value) {
    var self = this;
    try {
      var arr = self._emails;
      var entryIdx = arr.findIndex(function (a) { return a && a.email === accountEmail; });
      if (entryIdx === -1) return;
      arr[entryIdx].lookback_days = parseInt(value, 10) || 30;
      var res = await self._supabase
        .from('profiles')
        .update({ cl_connected_emails: arr })
        .eq('id', self._userId);
      if (res.error) { console.error('_changeEmailLookback error:', res.error); await self._loadConnections(); return; }
    } catch (e) { console.error('_changeEmailLookback exception:', e); }
  },

  // ── OneDrive — moved to cl-settings-onedrive.js (Task 27)

  // ── SharePoint — moved to cl-settings-sharepoint.js (Task 27)
  // ── Dropbox — moved to cl-settings-dropbox.js (Task 27)

  // ── Tool Connections — moved to cl-settings-tools.js (Task 27)

};
