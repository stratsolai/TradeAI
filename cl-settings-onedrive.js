// cl-settings-onedrive.js — Task 27 File Split
// OneDrive connection management for CL Settings.
// Attaches methods to window.CL_SETTINGS_LOGIC. Loaded after cl-settings-logic.js.

(function (S) {

  S._renderOnedriveList = function () {
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
        return '<div class="connection-folder-row picker-row-between">' +
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
    if (addBtn) { addBtn.onclick = function () { self._showCLConnPermModal('onedrive'); }; }
  };

  S._checkOnedriveOAuthReturn = async function () {
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
  };

  S._openOnedriveFolderPicker = async function (accountEmail) {
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
        picker.classList.add('picker-inline');
      }
      parentRow.classList.add('picker-row-wrap');
    }
    picker.setAttribute('data-account', accountEmail);
    picker.style.display = 'block';
    pickerList.innerHTML = '<div class="picker-loading">Loading folders...</div>';
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
        pickerList.innerHTML = '<div class="picker-empty">No folders found in this OneDrive account.</div>';
        return;
      }
      var entry = self._onedriveAccounts.find(function (a) { return a && a.account_email === accountEmail; });
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
      pickerList.innerHTML = '<div class="picker-error">Could not load folders. Please try again.</div>';
    }
  };

  S._disconnectOnedriveAccount = async function (accountEmail) {
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
  };

  S._disconnectOnedriveFolder = async function (accountEmail, folderId) {
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
  };

})(window.CL_SETTINGS_LOGIC);
