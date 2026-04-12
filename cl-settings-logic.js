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
            p.parentElement.style.flexWrap = '';
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
    document.querySelectorAll('.stab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.stab').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.stab-panel').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var panel = document.getElementById('tab-' + btn.getAttribute('data-tab'));
        if (panel) panel.classList.add('active');
      });
    });
  },

  _checkTabQueryParam: function () {
    var params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'tool-connections') {
      document.querySelectorAll('.stab').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.stab-panel').forEach(function(p) { p.classList.remove('active'); });
      var toolTab = document.querySelector('.stab[data-tab="tool"]');
      var toolPanel = document.getElementById('tab-tool');
      if (toolTab) toolTab.classList.add('active');
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
        .select('cl_connected_emails, cl_drive_accounts, website_urls, cl_onedrive_accounts, cl_sharepoint_accounts, cl_dropbox_accounts, cl_xero_accounts, cl_quickbooks_accounts, cl_servicem8_accounts')
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
    if (gmailBtn) { gmailBtn.onclick = function () { self._startOAuth('gmail'); }; }
    if (outlookBtn) { outlookBtn.onclick = function () { self._startOAuth('microsoft'); }; }
  },

  _renderDriveList: function () {
    var self = this;
    var list = document.getElementById('drive-connections-list');
    if (!list) return;
    list.innerHTML = self._driveAccounts.map(function (a) {
      var folders = Array.isArray(a.folders) ? a.folders : [];
      var folderHtml = folders.map(function (f) {
        return '<div class="connection-folder-row" style="justify-content:space-between;">' +
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
    if (driveBtn) { driveBtn.onclick = function () { self._startCLOAuth('google-drive'); }; }
  },

  _renderWebsiteList: function () {
    var self = this;
    var list = document.getElementById('website-urls-list');
    if (!list) return;
    list.innerHTML = self._websiteUrls.map(function (url) {
      return '<div class="website-url-item">' +
        '<div style="flex:1;min-width:0;">' +
          '<input class="website-url-input" type="text" value="' + url + '" />' +
          '<div class="website-url-error" style="display:none;font-size:12px;color:#dc3545;margin-top:3px;"></div>' +
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

  _resetSaveBtn: function (id, label) {
    var btn = document.getElementById(id);
    if (btn) { btn.textContent = label; btn.disabled = false; }
  },

  _bindEventDelegation: function () {
    var self = this;
    document.addEventListener('change', function (e) {
      var lookbackSel = e.target.closest('.drive-lookback-select');
      if (lookbackSel) {
        var provider = lookbackSel.getAttribute('data-provider') || 'drive';
        var acct = lookbackSel.getAttribute('data-account');
        if (acct) self._changeLookback(provider, acct, lookbackSel.value);
        return;
      }
      var emailLookbackSel = e.target.closest('.email-lookback-select');
      if (emailLookbackSel) {
        var eprovider = emailLookbackSel.getAttribute('data-provider') || 'gmail';
        var eacct = emailLookbackSel.getAttribute('data-account');
        if (eacct) self._changeEmailLookback(eprovider, eacct, emailLookbackSel.value);
        return;
      }
      var websiteInput = e.target.closest && e.target.closest('#website-urls-list .website-url-input');
      if (websiteInput) {
        self._saveWebsiteUrls();
      }
    });
    document.addEventListener('click', function (e) {

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
          input.style.borderColor = '#dc3545';
        } else {
          input.value = result.url;
          input.style.borderColor = '';
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
      var btn = document.getElementById('website-save-btn');
      if (btn) { btn.textContent = 'Saved'; btn.disabled = true; }
    } catch (e) { console.error('_saveWebsiteUrls exception:', e); }
  },

  _saveScanSettings: async function () {
    var self = this;
    try {
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
      if (res.error) { console.error('_saveScanSettings error:', res.error); return; }
      var btn = document.getElementById('save-settings-btn');
      if (btn) { btn.textContent = 'Saved'; btn.disabled = true; }
    } catch (e) { console.error('_saveScanSettings exception:', e); }
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
        picker.style.flexBasis = '100%';
        picker.style.width = '100%';
        picker.style.margin = '12px 0 0 0';
      }
      driveRow.style.flexWrap = 'wrap';
    }
    picker.setAttribute('data-account', accountEmail);
    picker.style.display = 'block';
    pickerList.innerHTML = '<div style="padding:12px;color:#888;">Loading folders...</div>';
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
        pickerList.innerHTML = '<div style="padding:12px;color:#888;">No folders found in this Google Drive account.</div>';
        return;
      }
      var entry = self._driveAccounts.find(function (a) { return a && a.account_email === accountEmail; });
      var existingIds = (entry && Array.isArray(entry.folders)) ? entry.folders.map(function (f) { return f.id; }) : [];
      pickerList.innerHTML = folders.map(function (f) {
        var already = existingIds.indexOf(f.id) !== -1;
        var btnClass = already ? 'btn-remove-folder' : 'btn-add-folder';
        var btnLabel = already ? 'Remove' : '+ Add';
        return '<div class="connection-folder-row" style="padding:6px 0;">' +
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
      pickerList.innerHTML = '<div style="padding:12px;color:#dc3545;">Could not load folders. Please try again.</div>';
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
    var current = (currentMonths == null) ? '12' : String(currentMonths);
    var opts = [
      { v: '',   l: 'All time' },
      { v: '1',  l: '1 month' },
      { v: '3',  l: '3 months' },
      { v: '6',  l: '6 months' },
      { v: '12', l: '12 months' },
      { v: '24', l: '24 months' }
    ];
    return '<span class="connection-item-lookback">' +
      '<select class="drive-lookback-select" data-provider="' + provider + '" data-account="' + (accountEmail || '') + '">' +
      opts.map(function (o) {
        var s = o.v === current ? ' selected' : '';
        return '<option value="' + o.v + '"' + s + '>' + o.l + '</option>';
      }).join('') +
      '</select></span>';
  },

  // Lookback dropdown for email providers (Gmail / Outlook).
  // Uses days instead of months — email lookback windows are shorter.
  // provider: 'gmail' | 'outlook'
  _buildEmailLookbackHtml: function (provider, accountEmail, currentDays) {
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

  _changeEmailLookback: async function (provider, accountEmail, value) {
    var self = this;
    try {
      var arr = self._emails;
      var entryIdx = arr.findIndex(function (a) { return a && a.email === accountEmail; });
      if (entryIdx === -1) return;
      arr[entryIdx].lookback_days = parseInt(value, 10) || 90;
      var res = await self._supabase
        .from('profiles')
        .update({ cl_connected_emails: arr })
        .eq('id', self._userId);
      if (res.error) { console.error('_changeEmailLookback error:', res.error); await self._loadConnections(); return; }
    } catch (e) { console.error('_changeEmailLookback exception:', e); }
  },

  // ── OneDrive ───────────────────────────────────────────────────────────

  _renderOnedriveList: function () {
    var self = this;
    var list = document.getElementById('onedrive-connections-list');
    if (!list) return;
    list.innerHTML = self._onedriveAccounts.map(function (a) {
      // Skip null or otherwise falsy entries — a corrupted jsonb row
      // would otherwise crash the map with "Cannot read properties of
      // null (reading 'folders')" and abort the rest of _loadConnections,
      // which is what was leaving the Add OneDrive / SharePoint / Dropbox
      // buttons unbound.
      if (!a) return '';
      var folders = Array.isArray(a.folders) ? a.folders : [];
      var folderHtml = folders.map(function (f) {
        return '<div class="connection-folder-row" style="justify-content:space-between;">' +
          '<div class="connection-folder-name">' + (f.name || f.id || '') + '</div>' +
          '<button class="btn-remove-folder" data-account="' + (a.account_email || '') + '" data-folder-id="' + (f.id || '') + '" data-type="onedrive-folder">Remove</button>' +
          '</div>';
      }).join('');
      return '<div class="connection-item">' +
        '<div class="connection-item-row1">' +
          '<span class="connection-item-email">' + (a.account_email || '') + '</span>' +
          '<button class="btn-disconnect" data-account="' + (a.account_email || '') + '" data-type="onedrive">Disconnect</button>' +
        '</div>' +
        '<div class="connection-item-row2">' +
          self._buildLookbackHtml('onedrive', a.account_email, a.lookback_months) +
          '<button class="btn-pick-folders" data-account="' + (a.account_email || '') + '" data-type="onedrive">📁 Choose Folders</button>' +
        '</div>' +
        '</div>' +
        (folders.length > 0 ? '<div class="connection-folders-list">' + folderHtml + '</div>' : '');
    }).join('');
    var addBtn = document.getElementById('add-onedrive-btn');
    if (addBtn) { addBtn.onclick = function () { self._startCLOAuth('onedrive'); }; }
  },

  _checkOnedriveOAuthReturn: async function () {
    var self = this;
    var params = new URLSearchParams(window.location.search);
    if (params.get('connected') !== 'onedrive') return;
    window.history.replaceState({}, '', window.location.pathname);
    await self._loadConnections();
    if (self._onedriveAccounts.length > 0) {
      var lastAcct = self._onedriveAccounts[self._onedriveAccounts.length - 1];
      if (lastAcct && lastAcct.account_email) {
        self._openOnedriveFolderPicker(lastAcct.account_email);
      }
    }
  },

  _openOnedriveFolderPicker: async function (accountEmail) {
    var self = this;
    var picker = document.getElementById('onedrive-folder-picker');
    var pickerList = document.getElementById('onedrive-folder-picker-list');
    if (!picker || !pickerList) return;
    // Relocate the picker inside the OneDrive settings-row so it sits above
    // the row's bottom divider, anchored to the OneDrive section. flex-wrap
    // is re-applied on every open and cleared by the cancel-button listener
    // in init() — leaving it permanently set would shift the email tile.
    var addBtn = document.getElementById('add-onedrive-btn');
    var parentRow = addBtn ? addBtn.closest('.settings-row') : null;
    if (parentRow) {
      if (picker.parentElement !== parentRow) {
        parentRow.appendChild(picker);
        picker.style.flexBasis = '100%';
        picker.style.width = '100%';
        picker.style.margin = '12px 0 0 0';
      }
      parentRow.style.flexWrap = 'wrap';
    }
    picker.setAttribute('data-account', accountEmail);
    picker.style.display = 'block';
    pickerList.innerHTML = '<div style="padding:12px;color:#888;">Loading folders...</div>';
    try {
      var token = await self._getAccessToken();
      var resp = await fetch('/api/onedrive-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'list-folders', accountEmail: accountEmail })
      });
      var data = await resp.json();
      if (!data.success) { throw new Error(data.error || 'Could not list OneDrive folders'); }
      var folders = data.folders || [];
      if (folders.length === 0) {
        pickerList.innerHTML = '<div style="padding:12px;color:#888;">No folders found in this OneDrive account.</div>';
        return;
      }
      var entry = self._onedriveAccounts.find(function (a) { return a && a.account_email === accountEmail; });
      var existingIds = (entry && Array.isArray(entry.folders)) ? entry.folders.map(function (f) { return f.id; }) : [];
      pickerList.innerHTML = folders.map(function (f) {
        var already = existingIds.indexOf(f.id) !== -1;
        var btnClass = already ? 'btn-remove-folder' : 'btn-add-folder';
        var btnLabel = already ? 'Remove' : '+ Add';
        return '<div class="connection-folder-row" style="padding:6px 0;">' +
          '<input type="text" class="website-url-input" value="' + (f.name || '') + '" readonly>' +
          '<button type="button" class="folder-picker-toggle ' + btnClass + '" data-folder-id="' + f.id + '" data-folder-name="' + (f.name || '') + '">' + btnLabel + '</button>' +
          '</div>';
      }).join('');
      pickerList.onclick = async function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.folder-picker-toggle') : null;
        if (!btn || btn.disabled) return;
        var folderId = btn.getAttribute('data-folder-id');
        var folderName = btn.getAttribute('data-folder-name');
        var entryIdx = self._onedriveAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
        if (entryIdx === -1) return;
        var current = Array.isArray(self._onedriveAccounts[entryIdx].folders) ? self._onedriveAccounts[entryIdx].folders : [];
        var isAdded = current.some(function (f) { return f.id === folderId; });
        var next = isAdded
          ? current.filter(function (f) { return f.id !== folderId; })
          : current.concat([{ id: folderId, name: folderName }]);
        btn.disabled = true;
        self._onedriveAccounts[entryIdx].folders = next;
        try {
          var res = await self._supabase
            .from('profiles')
            .update({ cl_onedrive_accounts: self._onedriveAccounts })
            .eq('id', self._userId);
          if (res.error) {
            console.error('OneDrive folder picker save error:', res.error);
            self._onedriveAccounts[entryIdx].folders = current;
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
          self._renderOnedriveList();
          btn.disabled = false;
        } catch (saveErr) {
          console.error('OneDrive folder picker save exception:', saveErr);
          self._onedriveAccounts[entryIdx].folders = current;
          btn.disabled = false;
        }
      };
    } catch (err) {
      console.error('OneDrive folder picker error:', err);
      pickerList.innerHTML = '<div style="padding:12px;color:#dc3545;">Could not load folders. Please try again.</div>';
    }
  },

  _disconnectOnedriveAccount: async function (accountEmail) {
    var self = this;
    try {
      self._onedriveAccounts = self._onedriveAccounts.filter(function (a) { return a && a.account_email !== accountEmail; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_onedrive_accounts: self._onedriveAccounts })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectOnedriveAccount error:', res.error); await self._loadConnections(); return; }
      self._renderOnedriveList();
    } catch (e) { console.error('_disconnectOnedriveAccount exception:', e); }
  },

  _disconnectOnedriveFolder: async function (accountEmail, folderId) {
    var self = this;
    try {
      var entryIdx = self._onedriveAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
      if (entryIdx === -1) return;
      var folders = Array.isArray(self._onedriveAccounts[entryIdx].folders) ? self._onedriveAccounts[entryIdx].folders : [];
      self._onedriveAccounts[entryIdx].folders = folders.filter(function (f) { return f.id !== folderId; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_onedrive_accounts: self._onedriveAccounts })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectOnedriveFolder error:', res.error); await self._loadConnections(); return; }
      self._renderOnedriveList();
    } catch (e) { console.error('_disconnectOnedriveFolder exception:', e); }
  },

  // ── SharePoint ─────────────────────────────────────────────────────────

  _renderSharepointList: function () {
    var self = this;
    var list = document.getElementById('sharepoint-connections-list');
    if (!list) return;
    list.innerHTML = self._sharepointAccounts.map(function (a) {
      window.upgradeSharepointEntry(a);
      var sites = Array.isArray(a.sites) ? a.sites : [];
      // Each site renders as a section: site name row (flush-left), then a
      // Choose Libraries — <Site Name> button on its own row indented to
      // sit visually under the site, then the libraries for that site
      // also indented so they read as children of the site above.
      // Multiple sites stack one section after another.
      var sitesHtml = sites.map(function (s) {
        var libraries = Array.isArray(s.libraries) ? s.libraries : [];
        var libraryHtml = libraries.map(function (lib) {
          return '<div class="connection-folder-row" style="justify-content:space-between;padding-left:24px;">' +
            '<div class="connection-folder-name">' + (lib.name || lib.id || '') + '</div>' +
            '<button class="btn-remove-folder" data-account="' + (a.account_email || '') + '" data-site-id="' + (s.id || '') + '" data-library-id="' + (lib.id || '') + '" data-type="sharepoint-library">Remove</button>' +
            '</div>';
        }).join('');
        var siteName = s.displayName || s.name || s.id || '';
        var pickLibsHtml = '<div class="connection-folder-row" style="padding-left:24px;">' +
          '<button class="btn-pick-libraries" data-account="' + (a.account_email || '') + '" data-site-id="' + (s.id || '') + '" title="' + siteName + '">Choose Libraries — ' + siteName + '</button>' +
          '</div>';
        return '<div class="connection-folder-row" style="justify-content:space-between;">' +
          '<div class="connection-folder-name">' + siteName + '</div>' +
          '<button class="btn-remove-folder" data-account="' + (a.account_email || '') + '" data-site-id="' + (s.id || '') + '" data-type="sharepoint-site">Remove</button>' +
          '</div>' +
          pickLibsHtml +
          libraryHtml;
      }).join('');
      return '<div class="connection-item">' +
        '<div class="connection-item-row1">' +
          '<span class="connection-item-email">' + (a.account_email || '') + '</span>' +
          '<button class="btn-disconnect" data-account="' + (a.account_email || '') + '" data-type="sharepoint">Disconnect</button>' +
        '</div>' +
        '<div class="connection-item-row2">' +
          self._buildLookbackHtml('sharepoint', a.account_email, a.lookback_months) +
          '<button class="btn-pick-sites" data-account="' + (a.account_email || '') + '">Choose Sites</button>' +
        '</div>' +
        '</div>' +
        (sites.length > 0 ? '<div class="connection-folders-list">' + sitesHtml + '</div>' : '');
    }).join('');
    var addBtn = document.getElementById('add-sharepoint-btn');
    if (addBtn) { addBtn.onclick = function () { self._startCLOAuth('sharepoint'); }; }
  },

  _checkSharepointOAuthReturn: async function () {
    var self = this;
    var params = new URLSearchParams(window.location.search);
    if (params.get('connected') !== 'sharepoint') return;
    window.history.replaceState({}, '', window.location.pathname);
    await self._loadConnections();
    if (self._sharepointAccounts.length > 0) {
      var lastAcct = self._sharepointAccounts[self._sharepointAccounts.length - 1];
      if (lastAcct && lastAcct.account_email) {
        self._openSharepointSitePicker(lastAcct.account_email);
      }
    }
  },

  _openSharepointSitePicker: async function (accountEmail) {
    var self = this;
    var picker = document.getElementById('sharepoint-site-picker');
    var pickerList = document.getElementById('sharepoint-site-picker-list');
    if (!picker || !pickerList) return;
    // The site picker stays in its static DOM position (a sibling of the
    // SharePoint settings-row inside #connections-rows). It is intentionally
    // NOT relocated into the .settings-row — relocating + setting flex-wrap
    // on the row caused the tile above the picker to rearrange on open.
    picker.setAttribute('data-account', accountEmail);
    picker.style.display = 'block';
    pickerList.innerHTML = '<div style="padding:12px;color:#888;">Loading sites...</div>';
    try {
      var token = await self._getAccessToken();
      var resp = await fetch('/api/sharepoint-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'list-sites', accountEmail: accountEmail })
      });
      var data = await resp.json();
      if (!data.success) { throw new Error(data.error || 'Could not list SharePoint sites'); }
      var sites = data.sites || [];
      if (sites.length === 0) {
        pickerList.innerHTML = '<div style="padding:12px;color:#888;">No SharePoint sites found for this account.</div>';
        return;
      }
      var entry = self._sharepointAccounts.find(function (a) { return a && a.account_email === accountEmail; });
      if (entry) window.upgradeSharepointEntry(entry);
      var existingIds = (entry && Array.isArray(entry.sites)) ? entry.sites.map(function (s) { return s.id; }) : [];
      // Multi-select pattern matching the OneDrive folder picker. Each row
      // toggles a site in or out of entry.sites[]. Removing a site here also
      // removes its libraries; the user picks libraries per site afterwards.
      pickerList.innerHTML = sites.map(function (s) {
        var already = existingIds.indexOf(s.id) !== -1;
        var btnClass = already ? 'btn-remove-folder' : 'btn-add-folder';
        var btnLabel = already ? 'Remove' : '+ Add';
        return '<div class="connection-folder-row" style="padding:6px 0;">' +
          '<input type="text" class="website-url-input" value="' + (s.displayName || '') + '" readonly>' +
          '<button type="button" class="folder-picker-toggle ' + btnClass + '" data-site-id="' + s.id + '" data-site-name="' + (s.displayName || '') + '" data-site-weburl="' + (s.webUrl || '') + '">' + btnLabel + '</button>' +
          '</div>';
      }).join('');
      pickerList.onclick = async function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.folder-picker-toggle') : null;
        if (!btn || btn.disabled) return;
        var siteId = btn.getAttribute('data-site-id');
        var siteName = btn.getAttribute('data-site-name');
        var siteWebUrl = btn.getAttribute('data-site-weburl');
        var entryIdx = self._sharepointAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
        if (entryIdx === -1) return;
        window.upgradeSharepointEntry(self._sharepointAccounts[entryIdx]);
        var current = Array.isArray(self._sharepointAccounts[entryIdx].sites) ? self._sharepointAccounts[entryIdx].sites : [];
        var isAdded = current.some(function (s) { return s.id === siteId; });
        var next = isAdded
          ? current.filter(function (s) { return s.id !== siteId; })
          : current.concat([{ id: siteId, displayName: siteName, webUrl: siteWebUrl, libraries: [] }]);
        btn.disabled = true;
        self._sharepointAccounts[entryIdx].sites = next;
        try {
          var res = await self._supabase
            .from('profiles')
            .update({ cl_sharepoint_accounts: self._sharepointAccounts })
            .eq('id', self._userId);
          if (res.error) {
            console.error('SharePoint site picker save error:', res.error);
            self._sharepointAccounts[entryIdx].sites = current;
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
          self._renderSharepointList();
          btn.disabled = false;
        } catch (saveErr) {
          console.error('SharePoint site picker save exception:', saveErr);
          self._sharepointAccounts[entryIdx].sites = current;
          btn.disabled = false;
        }
      };
    } catch (err) {
      console.error('SharePoint site picker error:', err);
      pickerList.innerHTML = '<div style="padding:12px;color:#dc3545;">Could not load sites. Please try again.</div>';
    }
  },

  _openSharepointLibraryPicker: async function (accountEmail, siteId) {
    var self = this;
    var picker = document.getElementById('sharepoint-library-picker');
    var pickerList = document.getElementById('sharepoint-library-picker-list');
    if (!picker || !pickerList) return;
    // Relocate the picker inside the SharePoint settings-row so it sits above
    // the row's bottom divider, anchored to the SharePoint section. flex-wrap
    // is re-applied on every open and cleared by the cancel-button listener
    // in init() — leaving it permanently set would shift the email tile.
    var addBtn = document.getElementById('add-sharepoint-btn');
    var parentRow = addBtn ? addBtn.closest('.settings-row') : null;
    if (parentRow) {
      if (picker.parentElement !== parentRow) {
        parentRow.appendChild(picker);
        picker.style.flexBasis = '100%';
        picker.style.width = '100%';
        picker.style.margin = '12px 0 0 0';
      }
      parentRow.style.flexWrap = 'wrap';
    }
    picker.setAttribute('data-account', accountEmail);
    picker.setAttribute('data-site-id', siteId || '');
    picker.style.display = 'block';
    pickerList.innerHTML = '<div style="padding:12px;color:#888;">Loading libraries...</div>';
    try {
      var token = await self._getAccessToken();
      var resp = await fetch('/api/sharepoint-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'list-libraries', accountEmail: accountEmail, siteId: siteId })
      });
      var data = await resp.json();
      if (!data.success) { throw new Error(data.error || 'Could not list document libraries'); }
      var libraries = data.libraries || [];
      if (libraries.length === 0) {
        pickerList.innerHTML = '<div style="padding:12px;color:#888;">No document libraries found on this site.</div>';
        return;
      }
      var entry = self._sharepointAccounts.find(function (a) { return a && a.account_email === accountEmail; });
      if (entry) window.upgradeSharepointEntry(entry);
      var sitesArr = entry && Array.isArray(entry.sites) ? entry.sites : [];
      var site = sitesArr.find(function (s) { return s && s.id === siteId; });
      var existingIds = (site && Array.isArray(site.libraries)) ? site.libraries.map(function (lib) { return lib.id; }) : [];
      pickerList.innerHTML = libraries.map(function (lib) {
        var already = existingIds.indexOf(lib.id) !== -1;
        var btnClass = already ? 'btn-remove-folder' : 'btn-add-folder';
        var btnLabel = already ? 'Remove' : '+ Add';
        return '<div class="connection-folder-row" style="padding:6px 0;">' +
          '<input type="text" class="website-url-input" value="' + (lib.name || '') + '" readonly>' +
          '<button type="button" class="folder-picker-toggle ' + btnClass + '" data-library-id="' + lib.id + '" data-library-name="' + (lib.name || '') + '">' + btnLabel + '</button>' +
          '</div>';
      }).join('');
      pickerList.onclick = async function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.folder-picker-toggle') : null;
        if (!btn || btn.disabled) return;
        var libraryId = btn.getAttribute('data-library-id');
        var libraryName = btn.getAttribute('data-library-name');
        var entryIdx = self._sharepointAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
        if (entryIdx === -1) return;
        window.upgradeSharepointEntry(self._sharepointAccounts[entryIdx]);
        var sitesArr2 = Array.isArray(self._sharepointAccounts[entryIdx].sites) ? self._sharepointAccounts[entryIdx].sites : [];
        var siteIdx = sitesArr2.findIndex(function (s) { return s && s.id === siteId; });
        if (siteIdx === -1) return;
        var current = Array.isArray(sitesArr2[siteIdx].libraries) ? sitesArr2[siteIdx].libraries : [];
        var isAdded = current.some(function (lib) { return lib.id === libraryId; });
        var next = isAdded
          ? current.filter(function (lib) { return lib.id !== libraryId; })
          : current.concat([{ id: libraryId, name: libraryName }]);
        btn.disabled = true;
        sitesArr2[siteIdx].libraries = next;
        self._sharepointAccounts[entryIdx].sites = sitesArr2;
        try {
          var res = await self._supabase
            .from('profiles')
            .update({ cl_sharepoint_accounts: self._sharepointAccounts })
            .eq('id', self._userId);
          if (res.error) {
            console.error('SharePoint library picker save error:', res.error);
            sitesArr2[siteIdx].libraries = current;
            self._sharepointAccounts[entryIdx].sites = sitesArr2;
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
          self._renderSharepointList();
          btn.disabled = false;
        } catch (saveErr) {
          console.error('SharePoint library picker save exception:', saveErr);
          sitesArr2[siteIdx].libraries = current;
          self._sharepointAccounts[entryIdx].sites = sitesArr2;
          btn.disabled = false;
        }
      };
    } catch (err) {
      console.error('SharePoint library picker error:', err);
      pickerList.innerHTML = '<div style="padding:12px;color:#dc3545;">Could not load libraries. Please try again.</div>';
    }
  },

  _disconnectSharepointAccount: async function (accountEmail) {
    var self = this;
    try {
      self._sharepointAccounts = self._sharepointAccounts.filter(function (a) { return a && a.account_email !== accountEmail; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_sharepoint_accounts: self._sharepointAccounts })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectSharepointAccount error:', res.error); await self._loadConnections(); return; }
      self._renderSharepointList();
    } catch (e) { console.error('_disconnectSharepointAccount exception:', e); }
  },

  _disconnectSharepointSite: async function (accountEmail, siteId) {
    var self = this;
    try {
      var entryIdx = self._sharepointAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
      if (entryIdx === -1) return;
      window.upgradeSharepointEntry(self._sharepointAccounts[entryIdx]);
      var sites = Array.isArray(self._sharepointAccounts[entryIdx].sites) ? self._sharepointAccounts[entryIdx].sites : [];
      self._sharepointAccounts[entryIdx].sites = sites.filter(function (s) { return s && s.id !== siteId; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_sharepoint_accounts: self._sharepointAccounts })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectSharepointSite error:', res.error); await self._loadConnections(); return; }
      self._renderSharepointList();
    } catch (e) { console.error('_disconnectSharepointSite exception:', e); }
  },

  _disconnectSharepointLibrary: async function (accountEmail, siteId, libraryId) {
    var self = this;
    try {
      var entryIdx = self._sharepointAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
      if (entryIdx === -1) return;
      window.upgradeSharepointEntry(self._sharepointAccounts[entryIdx]);
      var sites = Array.isArray(self._sharepointAccounts[entryIdx].sites) ? self._sharepointAccounts[entryIdx].sites : [];
      var siteIdx = sites.findIndex(function (s) { return s && s.id === siteId; });
      if (siteIdx === -1) return;
      var libraries = Array.isArray(sites[siteIdx].libraries) ? sites[siteIdx].libraries : [];
      sites[siteIdx].libraries = libraries.filter(function (lib) { return lib.id !== libraryId; });
      self._sharepointAccounts[entryIdx].sites = sites;
      var res = await self._supabase
        .from('profiles')
        .update({ cl_sharepoint_accounts: self._sharepointAccounts })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectSharepointLibrary error:', res.error); await self._loadConnections(); return; }
      self._renderSharepointList();
    } catch (e) { console.error('_disconnectSharepointLibrary exception:', e); }
  },

  // ── Dropbox ────────────────────────────────────────────────────────────

  _renderDropboxList: function () {
    var self = this;
    var list = document.getElementById('dropbox-connections-list');
    if (!list) return;
    list.innerHTML = self._dropboxAccounts.map(function (a) {
      // Skip null or otherwise falsy entries — same vulnerability
      // and same fix as _renderOnedriveList. The defensive null
      // filter in _loadConnections should have already scrubbed
      // these, but the in-render guard is kept for any code path
      // that mutates _dropboxAccounts after load.
      if (!a) return '';
      var folders = Array.isArray(a.folders) ? a.folders : [];
      var folderHtml = folders.map(function (f) {
        return '<div class="connection-folder-row" style="justify-content:space-between;">' +
          '<div class="connection-folder-name">' + (f.name || f.id || '') + '</div>' +
          '<button class="btn-remove-folder" data-account="' + (a.account_email || '') + '" data-folder-id="' + (f.id || '') + '" data-type="dropbox-folder">Remove</button>' +
          '</div>';
      }).join('');
      return '<div class="connection-item">' +
        '<div class="connection-item-row1">' +
          '<span class="connection-item-email">' + (a.account_email || '') + '</span>' +
          '<button class="btn-disconnect" data-account="' + (a.account_email || '') + '" data-type="dropbox">Disconnect</button>' +
        '</div>' +
        '<div class="connection-item-row2">' +
          self._buildLookbackHtml('dropbox', a.account_email, a.lookback_months) +
          '<button class="btn-pick-folders" data-account="' + (a.account_email || '') + '" data-type="dropbox">📁 Choose Folders</button>' +
        '</div>' +
        '</div>' +
        (folders.length > 0 ? '<div class="connection-folders-list">' + folderHtml + '</div>' : '');
    }).join('');
    var addBtn = document.getElementById('add-dropbox-btn');
    if (addBtn) { addBtn.onclick = function () { self._startCLOAuth('dropbox'); }; }
  },

  _checkDropboxOAuthReturn: async function () {
    var self = this;
    var params = new URLSearchParams(window.location.search);
    if (params.get('connected') !== 'dropbox') return;
    window.history.replaceState({}, '', window.location.pathname);
    await self._loadConnections();
    if (self._dropboxAccounts.length > 0) {
      var lastAcct = self._dropboxAccounts[self._dropboxAccounts.length - 1];
      if (lastAcct && lastAcct.account_email) {
        self._openDropboxFolderPicker(lastAcct.account_email);
      }
    }
  },

  _openDropboxFolderPicker: async function (accountEmail) {
    var self = this;
    var picker = document.getElementById('dropbox-folder-picker');
    var pickerList = document.getElementById('dropbox-folder-picker-list');
    if (!picker || !pickerList) return;
    // Relocate the picker inside the Dropbox settings-row so it sits above
    // the row's bottom divider, anchored to the Dropbox section. flex-wrap
    // is re-applied on every open and cleared by the cancel-button listener
    // in init() — leaving it permanently set would shift the email tile.
    var addBtn = document.getElementById('add-dropbox-btn');
    var parentRow = addBtn ? addBtn.closest('.settings-row') : null;
    if (parentRow) {
      if (picker.parentElement !== parentRow) {
        parentRow.appendChild(picker);
        picker.style.flexBasis = '100%';
        picker.style.width = '100%';
        picker.style.margin = '12px 0 0 0';
      }
      parentRow.style.flexWrap = 'wrap';
    }
    picker.setAttribute('data-account', accountEmail);
    picker.style.display = 'block';
    pickerList.innerHTML = '<div style="padding:12px;color:#888;">Loading folders...</div>';
    try {
      var token = await self._getAccessToken();
      var resp = await fetch('/api/dropbox-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'list-folders', accountEmail: accountEmail })
      });
      var data = await resp.json();
      if (!data.success) { throw new Error(data.error || 'Could not list Dropbox folders'); }
      var folders = data.folders || [];
      if (folders.length === 0) {
        pickerList.innerHTML = '<div style="padding:12px;color:#888;">No folders found in this Dropbox account.</div>';
        return;
      }
      var entry = self._dropboxAccounts.find(function (a) { return a && a.account_email === accountEmail; });
      var existingIds = (entry && Array.isArray(entry.folders)) ? entry.folders.map(function (f) { return f.id; }) : [];
      pickerList.innerHTML = folders.map(function (f) {
        var already = existingIds.indexOf(f.id) !== -1;
        var btnClass = already ? 'btn-remove-folder' : 'btn-add-folder';
        var btnLabel = already ? 'Remove' : '+ Add';
        return '<div class="connection-folder-row" style="padding:6px 0;">' +
          '<input type="text" class="website-url-input" value="' + (f.name || '') + '" readonly>' +
          '<button type="button" class="folder-picker-toggle ' + btnClass + '" data-folder-id="' + f.id + '" data-folder-name="' + (f.name || '') + '">' + btnLabel + '</button>' +
          '</div>';
      }).join('');
      pickerList.onclick = async function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.folder-picker-toggle') : null;
        if (!btn || btn.disabled) return;
        var folderId = btn.getAttribute('data-folder-id');
        var folderName = btn.getAttribute('data-folder-name');
        var entryIdx = self._dropboxAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
        if (entryIdx === -1) return;
        var current = Array.isArray(self._dropboxAccounts[entryIdx].folders) ? self._dropboxAccounts[entryIdx].folders : [];
        var isAdded = current.some(function (f) { return f.id === folderId; });
        var next = isAdded
          ? current.filter(function (f) { return f.id !== folderId; })
          : current.concat([{ id: folderId, name: folderName }]);
        btn.disabled = true;
        self._dropboxAccounts[entryIdx].folders = next;
        try {
          var res = await self._supabase
            .from('profiles')
            .update({ cl_dropbox_accounts: self._dropboxAccounts })
            .eq('id', self._userId);
          if (res.error) {
            console.error('Dropbox folder picker save error:', res.error);
            self._dropboxAccounts[entryIdx].folders = current;
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
          self._renderDropboxList();
          btn.disabled = false;
        } catch (saveErr) {
          console.error('Dropbox folder picker save exception:', saveErr);
          self._dropboxAccounts[entryIdx].folders = current;
          btn.disabled = false;
        }
      };
    } catch (err) {
      console.error('Dropbox folder picker error:', err);
      pickerList.innerHTML = '<div style="padding:12px;color:#dc3545;">Could not load folders. Please try again.</div>';
    }
  },

  _disconnectDropboxAccount: async function (accountEmail) {
    var self = this;
    try {
      self._dropboxAccounts = self._dropboxAccounts.filter(function (a) { return a && a.account_email !== accountEmail; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_dropbox_accounts: self._dropboxAccounts })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectDropboxAccount error:', res.error); await self._loadConnections(); return; }
      self._renderDropboxList();
    } catch (e) { console.error('_disconnectDropboxAccount exception:', e); }
  },

  _disconnectDropboxFolder: async function (accountEmail, folderId) {
    var self = this;
    try {
      var entryIdx = self._dropboxAccounts.findIndex(function (a) { return a && a.account_email === accountEmail; });
      if (entryIdx === -1) return;
      var folders = Array.isArray(self._dropboxAccounts[entryIdx].folders) ? self._dropboxAccounts[entryIdx].folders : [];
      self._dropboxAccounts[entryIdx].folders = folders.filter(function (f) { return f.id !== folderId; });
      var res = await self._supabase
        .from('profiles')
        .update({ cl_dropbox_accounts: self._dropboxAccounts })
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectDropboxFolder error:', res.error); await self._loadConnections(); return; }
      self._renderDropboxList();
    } catch (e) { console.error('_disconnectDropboxFolder exception:', e); }
  },

  // ── Task 13 — Tool Connections (Xero, QuickBooks, ServiceM8) ──────────
  // These connections store OAuth credentials so tools can pull live data
  // on demand. No import pipeline, no scan behaviour.

  _toolPlatforms: [
    {
      key: 'xero',
      label: 'Xero',
      stateField: '_xeroAccounts',
      column: 'cl_xero_accounts',
      accountKey: 'account_name',
      idKey: 'tenant_id',
      desc: 'Connect your Xero account so your tools can access invoices, contacts, financial summaries, and more.',
      permTitle: 'Connect Xero',
      permBody: 'StaxAI will be able to read your invoices, bills, contacts, quotes, price list, jobs, and financial summaries. It cannot make payments, create or edit records, or change anything in your Xero account.',
      comingSoon: false
    },
    {
      key: 'myob',
      label: 'MYOB',
      stateField: '_myobAccounts',
      column: 'cl_myob_accounts',
      accountKey: 'account_name',
      idKey: 'company_file_id',
      desc: 'Coming Soon — MYOB integration is in progress.',
      permTitle: '',
      permBody: '',
      comingSoon: true
    },
    {
      key: 'quickbooks',
      label: 'QuickBooks',
      stateField: '_quickbooksAccounts',
      column: 'cl_quickbooks_accounts',
      accountKey: 'account_name',
      idKey: 'realm_id',
      desc: 'Connect your QuickBooks Online account so your tools can access invoices, contacts, financial summaries, and more.',
      permTitle: 'Connect QuickBooks',
      permBody: 'StaxAI will be able to read your invoices, bills, contacts, estimates, price list, projects, and financial summaries. It cannot make payments, create or edit records, or change anything in your QuickBooks account.',
      comingSoon: false
    },
    {
      key: 'servicem8',
      label: 'ServiceM8',
      stateField: '_servicem8Accounts',
      column: 'cl_servicem8_accounts',
      accountKey: 'account_email',
      idKey: 'account_email',
      desc: 'Connect your ServiceM8 account so your tools can access jobs, clients, invoices, quotes, and more.',
      permTitle: 'Connect ServiceM8',
      permBody: 'StaxAI will be able to read your jobs, clients, invoices, quotes, staff, materials, and job forms. It cannot create or edit jobs, send messages, or change anything in your ServiceM8 account.',
      comingSoon: false
    },
    {
      key: 'buildxact',
      label: 'Buildxact',
      stateField: '_buildxactAccounts',
      column: 'cl_buildxact_accounts',
      accountKey: 'account_name',
      idKey: 'account_id',
      desc: 'Coming Soon — Buildxact integration is in progress.',
      permTitle: '',
      permBody: '',
      comingSoon: true
    }
  ],

  _renderToolConnections: function () {
    var self = this;
    var container = document.getElementById('tool-connections-rows');
    if (!container) return;

    var html = self._toolPlatforms.map(function (p) {
      if (p.comingSoon) {
        return '<div class="tool-conn-tile">' +
          '<div class="tool-conn-info">' +
            '<div class="tool-conn-label">' + p.label + ' <span class="tool-conn-coming-soon">Coming Soon</span></div>' +
            '<div class="tool-conn-desc">' + p.desc + '</div>' +
          '</div>' +
          '<div class="tool-conn-control"></div>' +
        '</div>';
      }

      var accounts = self[p.stateField] || [];
      var accountsHtml = accounts.map(function (a) {
        if (!a) return '';
        var name = a[p.accountKey] || 'Connected';
        var date = a.connected_at ? new Date(a.connected_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return '<div class="tool-conn-account">' +
          '<span class="tool-conn-account-name">' + self._escapeHtml(name) + '</span>' +
          (date ? '<span class="tool-conn-account-date">Connected ' + date + '</span>' : '') +
          '<button class="btn-disconnect" data-account="' + self._escapeHtml(a[p.idKey] || '') + '" data-type="' + p.key + '">Disconnect</button>' +
        '</div>';
      }).join('');

      var msgHtml = '<div class="tool-conn-msg" id="tool-msg-' + p.key + '"></div>';

      return '<div class="tool-conn-tile">' +
        '<div class="tool-conn-info">' +
          '<div class="tool-conn-label">' + p.label + '</div>' +
          '<div class="tool-conn-desc">' + p.desc + '</div>' +
        '</div>' +
        '<div class="tool-conn-control">' +
          accountsHtml +
          msgHtml +
          '<button class="btn-add-connection tool-conn-btn" data-platform="' + p.key + '">' +
            (accounts.length > 0 ? '+ Connect Another' : '+ Connect ' + p.label) +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = html;

    // Bind connect buttons
    container.querySelectorAll('.tool-conn-btn[data-platform]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var platform = btn.getAttribute('data-platform');
        self._startToolConnect(platform);
      });
    });
  },

  _escapeHtml: function (str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _startToolConnect: function (platform) {
    var self = this;
    var p = self._toolPlatforms.find(function (pl) { return pl.key === platform; });
    if (!p || p.comingSoon) return;

    // Show permission modal
    var titleEl = document.getElementById('perm-modal-title');
    var bodyEl = document.getElementById('perm-modal-body');
    var overlay = document.getElementById('perm-modal-overlay');
    if (!titleEl || !bodyEl || !overlay) return;

    titleEl.textContent = p.permTitle;
    bodyEl.textContent = p.permBody;
    overlay.classList.add('open');
    self._pendingToolPlatform = platform;
  },

  _bindPermissionModal: function () {
    var self = this;
    var overlay = document.getElementById('perm-modal-overlay');
    var cancelBtn = document.getElementById('perm-modal-cancel');
    var continueBtn = document.getElementById('perm-modal-continue');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (overlay) overlay.classList.remove('open');
        self._pendingToolPlatform = null;
      });
    }
    if (continueBtn) {
      continueBtn.addEventListener('click', function () {
        if (overlay) overlay.classList.remove('open');
        if (self._pendingToolPlatform) {
          self._startCLOAuth(self._pendingToolPlatform);
          self._pendingToolPlatform = null;
        }
      });
    }
    // Close on overlay click (outside modal)
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          overlay.classList.remove('open');
          self._pendingToolPlatform = null;
        }
      });
    }
  },

  _disconnectToolAccount: async function (platform, accountId) {
    var self = this;
    var p = self._toolPlatforms.find(function (pl) { return pl.key === platform; });
    if (!p) return;
    try {
      var arr = self[p.stateField] || [];
      arr = arr.filter(function (a) { return a && a[p.idKey] !== accountId; });
      self[p.stateField] = arr;
      var update = {};
      update[p.column] = arr;
      var res = await self._supabase
        .from('profiles')
        .update(update)
        .eq('id', self._userId);
      if (res.error) { console.error('_disconnectToolAccount error:', res.error); await self._loadConnections(); return; }
      self._renderToolConnections();
    } catch (e) { console.error('_disconnectToolAccount exception:', e); }
  },

  _checkToolOAuthReturn: function () {
    var self = this;
    var params = new URLSearchParams(window.location.search);
    var connected = params.get('connected');
    var error = params.get('error');
    var tab = params.get('tab');

    // Only handle tool connection platforms
    var toolKeys = ['xero', 'quickbooks', 'servicem8'];
    var isToolPlatform = false;
    if (connected && toolKeys.indexOf(connected) !== -1) isToolPlatform = true;
    if (error && toolKeys.some(function (k) { return error.indexOf(k) !== -1; })) isToolPlatform = true;
    if (tab === 'tool-connections') isToolPlatform = true;
    if (!isToolPlatform) return;

    // Switch to the Tool Connections tab so the user lands on the
    // correct tab regardless of whether the inline script in
    // cl-settings.html has already handled the ?tab= parameter.
    document.querySelectorAll('.stab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.stab-panel').forEach(function (p) { p.classList.remove('active'); });
    var toolTab = document.querySelector('.stab[data-tab="tool"]');
    var toolPanel = document.getElementById('tab-tool');
    if (toolTab) toolTab.classList.add('active');
    if (toolPanel) toolPanel.classList.add('active');

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);

    // Show success/error message after connections load
    if (connected && toolKeys.indexOf(connected) !== -1) {
      // Wait for _loadAll to finish, then show message
      var check = function () {
        var msgEl = document.getElementById('tool-msg-' + connected);
        if (msgEl) {
          msgEl.className = 'tool-conn-msg success';
          msgEl.textContent = connected.charAt(0).toUpperCase() + connected.slice(1) + ' connected successfully.';
        }
      };
      setTimeout(check, 500);
    }
    if (error) {
      var platform = toolKeys.find(function (k) { return error.indexOf(k) !== -1; });
      if (platform) {
        var check2 = function () {
          var msgEl = document.getElementById('tool-msg-' + platform);
          if (msgEl) {
            msgEl.className = 'tool-conn-msg error';
            msgEl.textContent = 'Connection failed. Please try again.';
          }
        };
        setTimeout(check2, 500);
      }
    }
  }

};
