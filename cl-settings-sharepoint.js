// cl-settings-sharepoint.js — Task 27 File Split
// SharePoint connection management for CL Settings.
// Attaches methods to window.CL_SETTINGS_LOGIC. Loaded after cl-settings-logic.js.

(function (S) {

  S._renderSharepointList = function () {
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
          return '<div class="connection-folder-row picker-row-between picker-row-indent">' +
            '<div class="connection-folder-name">' + (lib.name || lib.id || '') + '</div>' +
            '<button class="btn-remove-folder" data-account="' + (a.account_email || '') + '" data-site-id="' + (s.id || '') + '" data-library-id="' + (lib.id || '') + '" data-type="sharepoint-library">Remove</button>' +
            '</div>';
        }).join('');
        var siteName = s.displayName || s.name || s.id || '';
        var pickLibsHtml = '<div class="connection-folder-row picker-row-indent">' +
          '<button class="btn-pick-libraries" data-account="' + (a.account_email || '') + '" data-site-id="' + (s.id || '') + '" title="' + siteName + '">Choose Libraries — ' + siteName + '</button>' +
          '</div>';
        return '<div class="connection-folder-row picker-row-between">' +
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
    if (addBtn) { addBtn.onclick = function () { self._showCLConnPermModal('sharepoint'); }; }
  };

  S._checkSharepointOAuthReturn = async function () {
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
  };

  S._openSharepointSitePicker = async function (accountEmail) {
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
    pickerList.innerHTML = '<div class="picker-loading">Loading sites...</div>';
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
        pickerList.innerHTML = '<div class="picker-empty">No SharePoint sites found for this account.</div>';
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
        return '<div class="connection-folder-row picker-folder-row-pad">' +
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
      pickerList.innerHTML = '<div class="picker-error">Could not load sites. Please try again.</div>';
    }
  };

  S._openSharepointLibraryPicker = async function (accountEmail, siteId) {
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
        picker.classList.add('picker-inline');
      }
      parentRow.classList.add('picker-row-wrap');
    }
    picker.setAttribute('data-account', accountEmail);
    picker.setAttribute('data-site-id', siteId || '');
    picker.style.display = 'block';
    pickerList.innerHTML = '<div class="picker-loading">Loading libraries...</div>';
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
        pickerList.innerHTML = '<div class="picker-empty">No document libraries found on this site.</div>';
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
        return '<div class="connection-folder-row picker-folder-row-pad">' +
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
      pickerList.innerHTML = '<div class="picker-error">Could not load libraries. Please try again.</div>';
    }
  };

  S._disconnectSharepointAccount = async function (accountEmail) {
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
  };

  S._disconnectSharepointSite = async function (accountEmail, siteId) {
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
  };

  S._disconnectSharepointLibrary = async function (accountEmail, siteId, libraryId) {
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
  };

})(window.CL_SETTINGS_LOGIC);
