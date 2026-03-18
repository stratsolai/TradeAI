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
    _renderAccountDropdown();
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



  // -------------------------------------------------------------------------
  // Connection status
  // -------------------------------------------------------------------------
  async function _renderConnectionStatus() {
    const { data: profile } = await window.supabaseClient
      .from('profiles')
      .select('gmail_connected, outlook_connected')
      .eq('id', _session.user.id)
      .single();

    const gmailConnected   = profile && profile.gmail_connected;
    const outlookConnected = profile && profile.outlook_connected;

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
