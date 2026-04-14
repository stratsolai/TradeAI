// cl-settings-dropbox.js — Task 27 File Split
// Dropbox connection management for CL Settings.
// Attaches methods to window.CL_SETTINGS_LOGIC. Loaded after cl-settings-logic.js.

(function (S) {

  S._renderDropboxList = function () {
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
        return '<div class="connection-folder-row picker-row-between">' +
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
    if (addBtn) { addBtn.onclick = function () { self._showCLConnPermModal('dropbox'); }; }
  };

  S._checkDropboxOAuthReturn = async function () {
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
  };

  S._openDropboxFolderPicker = async function (accountEmail) {
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
        picker.classList.add('picker-inline');
      }
      parentRow.classList.add('picker-row-wrap');
    }
    picker.setAttribute('data-account', accountEmail);
    picker.style.display = 'block';
    pickerList.innerHTML = '<div class="picker-loading">Loading folders...</div>';
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
        pickerList.innerHTML = '<div class="picker-empty">No folders found in this Dropbox account.</div>';
        return;
      }
      var entry = self._dropboxAccounts.find(function (a) { return a && a.account_email === accountEmail; });
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
      pickerList.innerHTML = '<div class="picker-error">Could not load folders. Please try again.</div>';
    }
  };

  S._disconnectDropboxAccount = async function (accountEmail) {
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
  };

  S._disconnectDropboxFolder = async function (accountEmail, folderId) {
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
  };

})(window.CL_SETTINGS_LOGIC);
