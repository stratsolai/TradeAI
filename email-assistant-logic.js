/**
 * email-assistant-logic.js
 * All logic for the AI Email Assistant tool.
 * Loaded by email-assistant.html shell.
 * Uses window.supabaseClient — never window._supabase.
 */

window.EA_LOGIC = (function () {

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  let _session       = null;
  let _settings      = null;
  let _emails        = [];
  let _activeCategory = 'all';
  let _settingsOpen  = false;

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  async function init() {
    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
    if (error || !session) {
      window.location.href = 'index.html';
      return;
    }
    _session = session;

    await _loadSettings();
    _buildCategoryTabs();
    _renderConnectionStatus();
    _wireEvents();
    if (_settings && _settings.scan_cadence !== 'manual') {
      await _checkAutoScan();
    }
    await _loadStoredEmails();
  }

  // -------------------------------------------------------------------------
  // Settings — direct Supabase SDK calls (no API endpoint)
  // -------------------------------------------------------------------------
  var DEFAULT_CATEGORIES = [
    { id: 'urgent',    label: 'Urgent',       enabled: true },
    { id: 'leads',     label: 'Leads',        enabled: true },
    { id: 'enquiries', label: 'Enquiries',    enabled: true },
    { id: 'jobs',      label: 'Jobs',         enabled: true },
    { id: 'invoices',  label: 'Invoices',     enabled: true },
    { id: 'suppliers', label: 'Suppliers',    enabled: true },
    { id: 'low',       label: 'Low Priority', enabled: true }
  ];

  async function _loadSettings() {
    try {
      var res = await window.supabaseClient
        .from('email_assistant_settings')
        .select('*')
        .eq('user_id', _session.user.id)
        .maybeSingle();
      if (res.data) {
        _settings = {
          id: res.data.id,
          categories: (res.data.categories && res.data.categories.length > 0) ? res.data.categories : DEFAULT_CATEGORIES,
          scan_cadence: res.data.scan_cadence || 'manual',
          show_handled: res.data.show_handled || false
        };
      }
    } catch (e) {
      console.error('Settings load error:', e);
    }
    if (!_settings) {
      _settings = { categories: DEFAULT_CATEGORIES, scan_cadence: 'manual', show_handled: false };
    }
  }

  async function _saveSettings() {
    try {
      var payload = {
        user_id: _session.user.id,
        categories: _settings.categories,
        scan_cadence: _settings.scan_cadence,
        show_handled: _settings.show_handled,
        updated_at: new Date().toISOString()
      };
      var error;
      if (_settings.id) {
        ({ error } = await window.supabaseClient.from('email_assistant_settings').update(payload).eq('id', _settings.id));
      } else {
        payload.created_at = new Date().toISOString();
        var res = await window.supabaseClient.from('email_assistant_settings').insert(payload).select().single();
        if (res.data) _settings.id = res.data.id;
        error = res.error;
      }
      if (error) { _showError('Could not save settings'); return false; }
      return true;
    } catch (e) {
      _showError('Could not save settings');
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Connection status
  // -------------------------------------------------------------------------
  let _connectedAccounts = [];

  async function _renderConnectionStatus() {
    const { data: profile } = await window.supabaseClient
      .from('profiles')
      .select('ea_connected_emails')
      .eq('id', _session.user.id)
      .single();

    const eaEmails = (profile && Array.isArray(profile.ea_connected_emails)) ? profile.ea_connected_emails : [];
    _connectedAccounts = eaEmails;

    const gmailAccounts = eaEmails.filter(function(e) { return e.provider === 'gmail' || e.provider === 'google'; });
    const outlookAccounts = eaEmails.filter(function(e) { return e.provider === 'microsoft' || e.provider === 'outlook'; });

    const el = document.getElementById('ea-connection-status');
    if (!el) return;

    if (gmailAccounts.length === 0 && outlookAccounts.length === 0) {
      el.innerHTML = "<div class=\"ea-connect-prompt\">Connect your email to get started. Use the Settings panel to connect Gmail or Outlook.</div>";
    } else {
      const parts = [];
      if (gmailAccounts.length > 0)   parts.push('Gmail');
      if (outlookAccounts.length > 0) parts.push('Outlook');
      el.innerHTML = "<div class=\"ea-connected-badge\">Connected: " + parts.join(', ') + "</div>";
    }
  }
  // -------------------------------------------------------------------------
  // Stored emails
  // -------------------------------------------------------------------------
  async function _loadStoredEmails() {
    const query = window.supabaseClient
      .from('email_summaries')
      .select('*')
      .eq('user_id', _session.user.id)
      .order('received_at', { ascending: false })
      .limit(100);

    if (!_settings.show_handled) {
      query.eq('handled', false);
    }

    const { data, error } = await query;
    if (error) { console.error('Load emails error:', error); return; }
    _emails = data || [];
    _renderEmailFeed();
  }

  // -------------------------------------------------------------------------
  // Scan
  // -------------------------------------------------------------------------
  var _pendingJobs = 0;
  var _jobChannels = {};

  async function _scan() {
    const btn = document.getElementById('ea-scan-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }

    _showFeedMessage('Scanning your inbox...');

    try {
      var token = _session.access_token;
      _pendingJobs = 0;

      var gmailAccounts = _connectedAccounts.filter(function(e) { return e.provider === 'gmail' || e.provider === 'google'; });
      var outlookAccounts = _connectedAccounts.filter(function(e) { return e.provider === 'microsoft' || e.provider === 'outlook'; });

      // Queue and watch Gmail accounts
      for (var gi = 0; gi < gmailAccounts.length; gi++) {
        await _queueAndWatch('ea-gmail', gmailAccounts[gi].email, token);
      }

      // Queue and watch Outlook accounts
      for (var oi = 0; oi < outlookAccounts.length; oi++) {
        await _queueAndWatch('ea-outlook', outlookAccounts[oi].email, token);
      }

      if (_pendingJobs === 0) {
        _showFeedMessage('No email accounts connected. Connect Gmail or Outlook in Settings.');
        _finishScan();
      }

    } catch (e) {
      _showFeedMessage('Scan failed. Please try again.');
      _finishScan();
    }
  }

  async function _queueAndWatch(sourceType, accountEmail, token) {
    try {
      var resp = await fetch('/api/scan-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ sourceType: sourceType, sourceAccount: accountEmail })
      });
      var result;
      try { result = await resp.json(); } catch (e) { result = { error: 'Server returned an invalid response' }; }
      if (!resp.ok || result.error) {
        console.error('[EA] Queue error for', accountEmail, ':', result.error || resp.status);
        return;
      }
      _pendingJobs++;
      _watchJob(result.jobId, accountEmail);
    } catch (e) {
      console.error('[EA] Queue exception for', accountEmail, ':', e.message);
    }
  }

  function _watchJob(jobId, label) {
    var channel = window.supabaseClient
      .channel('ea-scan-job-' + jobId)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cl_scan_jobs', filter: 'id=eq.' + jobId },
        function(payload) {
          var row = payload.new;
          if (!row) return;

          if (row.status === 'running') {
            _showFeedMessage('Scanning ' + label + '...');
          } else if (row.status === 'completed') {
            var msg = label + ' — ' + (row.imported_count || 0) + ' email' + ((row.imported_count || 0) !== 1 ? 's' : '') + ' imported';
            if (row.skipped_count) msg += ', ' + row.skipped_count + ' skipped';
            _showFeedMessage(msg);
            _cleanupJob(jobId);
          } else if (row.status === 'failed') {
            _showFeedMessage(label + ' — scan failed: ' + (row.error_text || 'Unknown error'));
            _cleanupJob(jobId);
          } else if (row.status === 'cancelled') {
            _showFeedMessage(label + ' — scan cancelled');
            _cleanupJob(jobId);
          }
        }
      )
      .subscribe();
    _jobChannels[jobId] = channel;
  }

  function _cleanupJob(jobId) {
    if (_jobChannels[jobId]) {
      window.supabaseClient.removeChannel(_jobChannels[jobId]);
      delete _jobChannels[jobId];
    }
    _pendingJobs--;
    if (_pendingJobs <= 0) {
      _pendingJobs = 0;
      _loadStoredEmails();
      _finishScan();
    }
  }

  function _finishScan() {
    var btn = document.getElementById('ea-scan-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Scan Now'; }
  }

  async function _checkAutoScan() {
    const { data } = await window.supabaseClient
      .from('email_summaries')
      .select('received_at')
      .eq('user_id', _session.user.id)
      .order('received_at', { ascending: false })
      .limit(1);

    const lastScan = data && data[0] ? new Date(data[0].received_at) : null;
    const now      = new Date();
    let   doScan   = false;

    if (!lastScan) {
      doScan = true;
    } else if (_settings.scan_cadence === 'daily') {
      doScan = (now - lastScan) > 24 * 60 * 60 * 1000;
    } else if (_settings.scan_cadence === 'weekly') {
      doScan = (now - lastScan) > 7 * 24 * 60 * 60 * 1000;
    }

    if (doScan) await _scan();
  }
  // -------------------------------------------------------------------------
  // Render email feed
  // -------------------------------------------------------------------------
  function _buildCategoryTabs() {
    const container = document.getElementById('ea-category-tabs');
    if (!container) return;

    const tabs = [{ id: 'all', label: 'All' }]
      .concat(_settings.categories.filter(c => c.enabled));

    container.innerHTML = tabs.map(cat =>
      "<button class=\"ea-tab" + (cat.id === _activeCategory ? ' active' : '') + "\" " +
      "data-category=\"" + cat.id + "\">" + cat.label + "</button>"
    ).join('');

    container.querySelectorAll('.ea-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeCategory = btn.dataset.category;
        container.querySelectorAll('.ea-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _renderEmailFeed();
      });
    });
  }

  function _renderEmailFeed() {
    const container = document.getElementById('ea-email-feed');
    if (!container) return;

    const filtered = _activeCategory === 'all'
      ? _emails
      : _emails.filter(e => e.category === _activeCategory);

    if (!filtered.length) {
      container.innerHTML = "<div class=\"ea-empty\">No emails in this category.</div>";
      return;
    }

    container.innerHTML = filtered.map(email => _renderEmailCard(email)).join('');

    container.querySelectorAll('.ea-card').forEach(card => {
      const messageId  = card.dataset.id;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.ea-handled-btn')) return;
        var email = _emails.find(function(em) { return em.message_id === messageId; });
        if (email) _showEmailDetail(email);
      });

      const handledBtn = card.querySelector('.ea-handled-btn');
      if (handledBtn) {
        handledBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          _markHandled(messageId, card);
        });
      }
    });
  }

  function _renderEmailCard(email) {
    const relativeTime = _relativeTime(email.received_at);
    const catLabel     = _getCategoryLabel(email.category);
    const hasLink      = !!email.message_url;

    return "<div class=\"ea-card" + (hasLink ? ' ea-card-linked' : '') + "\" " +
      "data-id=\"" + email.message_id + "\" " +
      "data-message-url=\"" + (email.message_url || '') + "\">" +
      "<div class=\"ea-card-header\">" +
        "<div class=\"ea-sender\">" +
          "<span class=\"ea-sender-name\">" + _esc(email.sender) + "</span>" +
          "<span class=\"ea-sender-email\">" + _esc(email.sender_email) + "</span>" +
        "</div>" +
        "<div class=\"ea-card-meta\">" +
          "<span class=\"ea-badge ea-badge-" + _esc(email.category) + "\">" + _esc(catLabel) + "</span>" +
          "<span class=\"ea-time\">" + relativeTime + "</span>" +
        "</div>" +
      "</div>" +
      "<div class=\"ea-subject\">" + _esc(email.subject) + "</div>" +
      "<div class=\"ea-summary\">" + _esc(email.summary) + "</div>" +
      "<div class=\"ea-card-footer\">" +
        "<button class=\"ea-handled-btn\" title=\"Mark as handled\">&#x2713; Handled</button>" +
        "<span class=\"ea-open-hint\">Tap to view</span>" +
      "</div>" +
    "</div>";
  }
  // -------------------------------------------------------------------------
  // Email detail view — fetch body from cl-assets and display in-platform
  // -------------------------------------------------------------------------
  async function _showEmailDetail(email) {
    var container = document.getElementById('ea-email-feed');
    if (!container) return;

    var catLabel = _getCategoryLabel(email.category);
    var relTime = _relativeTime(email.received_at);
    var providerLabel = email.provider === 'gmail' ? 'Gmail' : 'Outlook';

    // Build the detail view immediately with summary while body loads
    var openBtnHtml = email.message_url
      ? '<a href="' + _esc(email.message_url) + '" target="_blank" class="ea-detail-open-btn">Open in ' + providerLabel + ' &rarr;</a>'
      : '';

    container.innerHTML =
      '<div class="ea-detail">' +
        '<div class="ea-detail-topbar">' +
          '<button class="ea-detail-back-btn">&larr; Back</button>' +
          openBtnHtml +
        '</div>' +
        '<div class="ea-detail-header">' +
          '<div class="ea-sender">' +
            '<span class="ea-sender-name">' + _esc(email.sender) + '</span>' +
            '<span class="ea-sender-email">' + _esc(email.sender_email) + '</span>' +
          '</div>' +
          '<div class="ea-card-meta">' +
            '<span class="ea-badge ea-badge-' + _esc(email.category) + '">' + _esc(catLabel) + '</span>' +
            '<span class="ea-time">' + relTime + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="ea-detail-subject">' + _esc(email.subject) + '</div>' +
        '<div class="ea-detail-summary"><strong>Summary:</strong> ' + _esc(email.summary) + '</div>' +
        '<div class="ea-detail-body" id="ea-detail-body">Loading email body...</div>' +
        '<div class="ea-detail-footer">' +
          '<button class="ea-handled-btn ea-detail-handled-btn" data-id="' + _esc(email.message_id) + '">&#x2713; Mark as Handled</button>' +
          openBtnHtml +
        '</div>' +
      '</div>';

    // Wire back button
    container.querySelector('.ea-detail-back-btn').addEventListener('click', function() {
      _renderEmailFeed();
    });

    // Wire handled button in detail view
    var handledBtn = container.querySelector('.ea-detail-handled-btn');
    if (handledBtn) {
      handledBtn.addEventListener('click', function() {
        _markHandledFromDetail(email.message_id);
      });
    }

    // Fetch full body from cl-assets
    var bodyEl = document.getElementById('ea-detail-body');
    if (email.body_url) {
      try {
        var signedResult = await window.supabaseClient.storage
          .from('cl-assets')
          .createSignedUrl(email.body_url, 3600);
        if (signedResult.data && signedResult.data.signedUrl) {
          var bodyRes = await fetch(signedResult.data.signedUrl);
          if (bodyRes.ok) {
            var bodyText = await bodyRes.text();
            bodyEl.textContent = bodyText;
          } else {
            bodyEl.textContent = 'Could not load email body.';
          }
        } else {
          bodyEl.textContent = 'Could not load email body.';
        }
      } catch (fetchErr) {
        console.error('[EA] Body fetch error:', fetchErr.message);
        bodyEl.textContent = 'Could not load email body.';
      }
    } else {
      bodyEl.textContent = 'Email body not available. This email was scanned before body storage was enabled.';
    }
  }

  async function _markHandledFromDetail(messageId) {
    var result = await window.supabaseClient
      .from('email_summaries')
      .update({ handled: true })
      .eq('user_id', _session.user.id)
      .eq('message_id', messageId);

    if (!result.error) {
      _emails = _emails.map(function(e) {
        return e.message_id === messageId ? Object.assign({}, e, { handled: true }) : e;
      });
      _renderEmailFeed();
    }
  }

  // -------------------------------------------------------------------------
  // Mark as handled
  // -------------------------------------------------------------------------
  async function _markHandled(messageId, cardEl) {
    const { error } = await window.supabaseClient
      .from('email_summaries')
      .update({ handled: true })
      .eq('user_id', _session.user.id)
      .eq('message_id', messageId);

    if (!error) {
      _emails = _emails.map(e =>
        e.message_id === messageId ? Object.assign({}, e, { handled: true }) : e
      );
      if (!_settings.show_handled) {
        cardEl.remove();
        const container = document.getElementById('ea-email-feed');
        if (container && !container.querySelector('.ea-card')) {
          container.innerHTML = "<div class=\"ea-empty\">No emails in this category.</div>";
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Settings panel
  // -------------------------------------------------------------------------
  function _openSettings() {
    _settingsOpen = true;
    const modal = document.getElementById('ea-settings-modal');
    if (!modal) return;
    _renderSettingsModal();
    modal.classList.add('open');
  }

  function _closeSettings() {
    _settingsOpen = false;
    const modal = document.getElementById('ea-settings-modal');
    if (modal) modal.classList.remove('open');
  }

  function _renderSettingsModal() {
    const body = document.getElementById('ea-settings-body');
    if (!body) return;

    const cadenceOptions = ['manual', 'daily', 'weekly'].map(opt =>
      "<option value=\"" + opt + "\"" + (_settings.scan_cadence === opt ? " selected" : "") + ">" +
      (opt === 'manual' ? 'Manual only' : opt.charAt(0).toUpperCase() + opt.slice(1)) +
      "</option>"
    ).join('');

    const categoriesHtml = _settings.categories.map((cat, i) =>
      "<div class=\"ea-setting-row\" data-index=\"" + i + "\">" +
        "<label class=\"ea-toggle\">" +
          "<input type=\"checkbox\" class=\"cat-enabled\" " + (cat.enabled ? "checked" : "") + " />" +
          "<span class=\"ea-toggle-slider\"></span>" +
        "</label>" +
        "<input type=\"text\" class=\"cat-label ea-text-input\" value=\"" + _esc(cat.label) + "\" maxlength=\"40\" />" +
      "</div>"
    ).join('');

    const connHtml = document.getElementById('ea-connection-status')
      ? document.getElementById('ea-connection-status').innerHTML
      : '';

    body.innerHTML =
      "<div class=\"ea-settings-section\">" +
        "<h3 class=\"ea-settings-heading\">Email Accounts</h3>" +
        "<div class=\"ea-connection-detail\">" + connHtml + "</div>" +
        "<div class=\"ea-connect-buttons\">" +
          "<a href=\"/api/auth/gmail/connect\" class=\"ea-btn-connect\">Connect Gmail</a>" +
          "<a href=\"/api/auth/outlook/connect\" class=\"ea-btn-connect\">Connect Outlook</a>" +
        "</div>" +
      "</div>" +
      "<div class=\"ea-settings-section\">" +
        "<h3 class=\"ea-settings-heading\">Categories</h3>" +
        "<div id=\"ea-categories-list\">" + categoriesHtml + "</div>" +
        "<button id=\"ea-add-category\" class=\"ea-btn-secondary\">Add Category</button>" +
      "</div>" +
      "<div class=\"ea-settings-section\">" +
        "<h3 class=\"ea-settings-heading\">Scan Frequency</h3>" +
        "<select id=\"ea-scan-cadence\" class=\"ea-select\">" + cadenceOptions + "</select>" +
      "</div>" +
      "<div class=\"ea-settings-section\">" +
        "<h3 class=\"ea-settings-heading\">Display</h3>" +
        "<label class=\"ea-toggle-row\">" +
          "<span>Show handled emails</span>" +
          "<label class=\"ea-toggle\">" +
            "<input type=\"checkbox\" id=\"ea-show-handled\" " + (_settings.show_handled ? "checked" : "") + " />" +
            "<span class=\"ea-toggle-slider\"></span>" +
          "</label>" +
        "</label>" +
      "</div>" +
      "<div class=\"ea-settings-actions\">" +
        "<button id=\"ea-settings-save\" class=\"ea-btn-primary\">Save</button>" +
        "<button id=\"ea-settings-cancel\" class=\"ea-btn-secondary\">Cancel</button>" +
      "</div>";

    document.getElementById('ea-add-category').addEventListener('click', () => {
      _settings.categories.push({ id: 'custom-' + Date.now(), label: 'New Category', enabled: true });
      _renderSettingsModal();
    });

    document.getElementById('ea-settings-save').addEventListener('click', async () => {
      _collectSettingsFromModal();
      const ok = await _saveSettings();
      if (ok) {
        _closeSettings();
        _buildCategoryTabs();
        await _loadStoredEmails();
      }
    });

    document.getElementById('ea-settings-cancel').addEventListener('click', _closeSettings);
  }

  function _collectSettingsFromModal() {
    const rows = document.querySelectorAll('#ea-categories-list .ea-setting-row');
    rows.forEach((row, i) => {
      const enabled = row.querySelector('.cat-enabled').checked;
      const label   = row.querySelector('.cat-label').value.trim() || _settings.categories[i].label;
      _settings.categories[i].enabled = enabled;
      _settings.categories[i].label   = label;
    });
    _settings.scan_cadence = document.getElementById('ea-scan-cadence').value;
    _settings.show_handled = document.getElementById('ea-show-handled').checked;
  }
  // -------------------------------------------------------------------------
  // Wire global events
  // -------------------------------------------------------------------------
  function _wireEvents() {
    const scanBtn     = document.getElementById('ea-scan-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const modalClose  = document.getElementById('ea-settings-close');
    const modal       = document.getElementById('ea-settings-modal');

    if (scanBtn)     scanBtn.addEventListener('click', _scan);
    if (settingsBtn) settingsBtn.addEventListener('click', _openSettings);
    if (modalClose)  modalClose.addEventListener('click', _closeSettings);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) _closeSettings();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function _getCategoryLabel(id) {
    if (!_settings || !_settings.categories) return id;
    const cat = _settings.categories.find(c => c.id === id);
    return cat ? cat.label : id;
  }

  function _relativeTime(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 1)   return 'Just now';
    if (mins  < 60)  return mins  + ' minute'  + (mins  > 1 ? 's' : '') + ' ago';
    if (hours < 24)  return hours + ' hour'   + (hours > 1 ? 's' : '') + ' ago';
    return days + ' day' + (days > 1 ? 's' : '') + ' ago';
  }

  function _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _showError(msg) {
    const el = document.getElementById('ea-error-msg');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function _showFeedMessage(msg) {
    const container = document.getElementById('ea-email-feed');
    if (container) container.innerHTML = "<div class=\"ea-empty\">" + _esc(msg) + "</div>";
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  return { init };

})();

document.addEventListener('DOMContentLoaded', () => window.EA_LOGIC.init());
window.addEventListener('pageshow', (e) => { if (e.persisted) window.EA_LOGIC.init(); });
