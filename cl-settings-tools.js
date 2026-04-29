// cl-settings-tools.js — Task 27 File Split
// Tool Connections (Xero, QuickBooks, ServiceM8, MYOB, Buildxact) for CL Settings.
// Attaches methods to window.CL_SETTINGS_LOGIC. Loaded after cl-settings-logic.js.

(function (S) {

  // ── Task 13 — Tool Connections (Xero, QuickBooks, ServiceM8) ──────────
  // These connections store OAuth credentials so tools can pull live data
  // on demand. No import pipeline, no scan behaviour.

  S._toolPlatforms = [
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
      key: 'fergus',
      label: 'Fergus',
      stateField: '_fergusAccounts',
      column: 'cl_fergus_accounts',
      accountKey: 'account_name',
      idKey: 'account_name',
      desc: 'Connect your Fergus account so your tools can access jobs, clients, invoices, quotes, and more.',
      permTitle: 'Connect Fergus',
      permBody: 'StaxAI will be able to read your jobs, clients, invoices, and quotes. It cannot create or edit jobs, send messages, or change anything in your Fergus account.',
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
  ];

  S._renderToolConnections = function () {
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
          '<span class="tool-conn-account-name">' + window.escHtml(name) + '</span>' +
          (date ? '<span class="tool-conn-account-date">Connected ' + date + '</span>' : '') +
          '<button class="btn-disconnect" data-account="' + window.escHtml(a[p.idKey] || '') + '" data-type="' + p.key + '">Disconnect</button>' +
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
            (accounts.length > 0 ? '+ Connect' : '+ Connect ' + p.label) +
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
  };

  S._startToolConnect = function (platform) {
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
  };

  S._clConnPermMessages = {
    gmail: {
      title: 'Connect Gmail',
      body: 'StaxAI will be able to read your emails to scan for business content. StaxAI cannot send, delete, or modify your emails.',
      oauth: 'startOAuth'
    },
    microsoft: {
      title: 'Connect Outlook',
      body: 'StaxAI will be able to read your emails to scan for business content. StaxAI cannot send, delete, or modify your emails.',
      oauth: 'startOAuth'
    },
    'google-drive': {
      title: 'Connect Google Drive',
      body: 'StaxAI will be able to read files in the folders you select. StaxAI cannot create, edit, or delete any files in your Google Drive.',
      oauth: 'startCLOAuth'
    },
    onedrive: {
      title: 'Connect OneDrive',
      body: 'StaxAI will be able to read files in the folders you select. StaxAI cannot create, edit, or delete any files in your OneDrive.',
      oauth: 'startCLOAuth'
    },
    sharepoint: {
      title: 'Connect SharePoint',
      body: 'StaxAI will be able to read documents from the libraries you select. StaxAI cannot create, edit, or delete any files in your SharePoint site.',
      oauth: 'startCLOAuth'
    },
    dropbox: {
      title: 'Connect Dropbox',
      body: 'StaxAI will be able to read files in the folders you select. StaxAI cannot create, edit, or delete any files in your Dropbox.',
      oauth: 'startCLOAuth'
    }
  };

  S._pendingCLConnection = null;

  S._showCLConnPermModal = function (provider) {
    var msg = this._clConnPermMessages[provider];
    if (!msg) return;
    var titleEl = document.getElementById('perm-modal-title');
    var bodyEl = document.getElementById('perm-modal-body');
    var overlay = document.getElementById('perm-modal-overlay');
    if (!titleEl || !bodyEl || !overlay) return;
    titleEl.textContent = msg.title;
    bodyEl.textContent = msg.body;
    overlay.classList.add('open');
    this._pendingCLConnection = { provider: provider, oauth: msg.oauth };
  };

  S._bindPermissionModal = function () {
    var self = this;
    var overlay = document.getElementById('perm-modal-overlay');
    var cancelBtn = document.getElementById('perm-modal-cancel');
    var continueBtn = document.getElementById('perm-modal-continue');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (overlay) overlay.classList.remove('open');
        self._pendingToolPlatform = null;
        self._pendingCLConnection = null;
      });
    }
    if (continueBtn) {
      continueBtn.addEventListener('click', function () {
        if (overlay) overlay.classList.remove('open');
        if (self._pendingCLConnection) {
          var conn = self._pendingCLConnection;
          self._pendingCLConnection = null;
          if (conn.oauth === 'startOAuth') {
            self._startOAuth(conn.provider);
          } else {
            self._startCLOAuth(conn.provider);
          }
        } else if (self._pendingToolPlatform) {
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
          self._pendingCLConnection = null;
        }
      });
    }
  };

  S._disconnectToolAccount = async function (platform, accountId) {
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
  };

  S._checkToolOAuthReturn = function () {
    var self = this;
    var params = new URLSearchParams(window.location.search);
    var connected = params.get('connected');
    var error = params.get('error');
    var tab = params.get('tab');

    // Only handle tool connection platforms
    var toolKeys = ['xero', 'quickbooks', 'servicem8', 'fergus'];
    var isToolPlatform = false;
    if (connected && toolKeys.indexOf(connected) !== -1) isToolPlatform = true;
    if (error && toolKeys.some(function (k) { return error.indexOf(k) !== -1; })) isToolPlatform = true;
    if (tab === 'tool-connections') isToolPlatform = true;
    if (!isToolPlatform) return;

    // Switch to the Tool Connections tab so the user lands on the
    // correct tab regardless of whether the inline script in
    // cl-settings.html has already handled the ?tab= parameter.
    document.querySelectorAll('.ptab').forEach(function (b) { b.classList.remove('settings-active'); });
    document.querySelectorAll('.ptab-content').forEach(function (p) { p.classList.remove('active'); });
    var toolTab = document.querySelector('.ptab[data-tab="tool"]');
    var toolPanel = document.getElementById('tab-tool');
    if (toolTab) toolTab.classList.add('settings-active');
    if (toolPanel) toolPanel.classList.add('active');

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);

    // Show success/error message after connections load
    if (connected && toolKeys.indexOf(connected) !== -1) {
      // Wait for _loadAll to finish, then show message
      var check = function () {
        var msgEl = document.getElementById('tool-msg-' + connected);
        if (msgEl) {
          msgEl.classList.remove('error'); msgEl.classList.add('tool-conn-msg', 'success');
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
            msgEl.classList.remove('success'); msgEl.classList.add('tool-conn-msg', 'error');
            msgEl.textContent = 'Connection failed. Please try again.';
          }
        };
        setTimeout(check2, 500);
      }
    }
  };

})(window.CL_SETTINGS_LOGIC);
