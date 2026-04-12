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
  // Settings
  // -------------------------------------------------------------------------
  async function _loadSettings() {
    try {
      const res = await fetch('/api/email-assistant-settings', {
        headers: { 'Authorization': 'Bearer ' + _session.access_token }
      });
      if (res.ok) {
        _settings = await res.json();
      }
    } catch (e) {
      console.error('Settings load error:', e);
    }
    if (!_settings) {
      _settings = {
        categories: [
          { id: 'urgent',    label: 'Urgent',       enabled: true },
          { id: 'leads',     label: 'Leads',        enabled: true },
          { id: 'enquiries', label: 'Enquiries',    enabled: true },
          { id: 'jobs',      label: 'Jobs',         enabled: true },
          { id: 'invoices',  label: 'Invoices',     enabled: true },
          { id: 'suppliers', label: 'Suppliers',    enabled: true },
          { id: 'low',       label: 'Low Priority', enabled: true }
        ],
        scan_cadence: 'manual',
        show_handled: false
      };
    }
  }

  async function _saveSettings() {
    try {
      const res = await fetch('/api/email-assistant-settings', {
        method:  'POST',
        headers: {
          'Authorization': 'Bearer ' + _session.access_token,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify(_settings)
      });
      if (!res.ok) {
        const data = await res.json();
        _showError(data.error || 'Could not save settings');
        return false;
      }
      return true;
    } catch (e) {
      _showError('Could not save settings');
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Connection status
  // -------------------------------------------------------------------------
  async function _renderConnectionStatus() {
    const { data: profile } = await window.supabaseClient
      .from('profiles')
      .select('ea_connected_emails')
      .eq('id', _session.user.id)
      .single();

    const eaEmails = (profile && Array.isArray(profile.ea_connected_emails)) ? profile.ea_connected_emails : [];
    const gmailConnected = eaEmails.some(function(e) { return e.provider === 'gmail' || e.provider === 'google'; });
    const outlookConnected = eaEmails.some(function(e) { return e.provider === 'microsoft' || e.provider === 'outlook'; });

    const el = document.getElementById('ea-connection-status');
    if (!el) return;

    if (!gmailConnected && !outlookConnected) {
      el.innerHTML = "<div class=\"ea-connect-prompt\">Connect your email to get started. Use the Settings panel to connect Gmail or Outlook.</div>";
    } else {
      const parts = [];
      if (gmailConnected)   parts.push('Gmail');
      if (outlookConnected) parts.push('Outlook');
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
  async function _scan() {
    const btn = document.getElementById('ea-scan-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }

    _showFeedMessage('Scanning your inbox...');

    try {
      const activeCategories = _settings.categories.filter(c => c.enabled);
      const res = await fetch('/api/email', {
        method:  'POST',
        headers: {
          'Authorization': 'Bearer ' + _session.access_token,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({ action: 'scan', categories: activeCategories })
      });

      const data = await res.json();

      if (!res.ok) {
        _showFeedMessage(data.error || 'Scan failed. Check your email connection in Settings.');
        return;
      }

      await _loadStoredEmails();

    } catch (e) {
      _showFeedMessage('Scan failed. Please try again.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Scan Now'; }
    }
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
      const messageUrl = card.dataset.messageUrl;
      const messageId  = card.dataset.id;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.ea-handled-btn')) return;
        if (messageUrl) window.open(messageUrl, '_blank');
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
        (hasLink ? "<span class=\"ea-open-hint\">Tap to open</span>" : "") +
      "</div>" +
    "</div>";
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
