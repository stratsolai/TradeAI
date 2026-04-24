window.BI_LOGIC = {
  _supabase: null,
  _user: null,
  _insights: {},
  _charts: {},
  _chatState: {},
  _financialData: null,
  _customerData: null,
  _operationsData: null,
  _marketData: null,
  _strategicData: null,

  init: function(supabase, user) {
    this._supabase = supabase;
    this._user = user;
    this._bindEvents();
    this._loadAllModules();
  },

  _bindEvents: function() {
    var self = this;
    var refreshBtn = document.getElementById('bi-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() { self._loadAllModules(true); });
    }
    var errorOk = document.querySelector('#bi-error-msg .save-msg-ok');
    if (errorOk) {
      errorOk.addEventListener('click', function() { document.getElementById('bi-error-msg').classList.remove('open'); });
    }
    var errorOverlay = document.getElementById('bi-error-msg');
    if (errorOverlay) {
      errorOverlay.addEventListener('click', function(e) { if (e.target === errorOverlay) errorOverlay.classList.remove('open'); });
    }
  },

  _showError: function(msg) {
    var el = document.getElementById('bi-error-msg');
    var textEl = el ? el.querySelector('.save-msg-text') : null;
    if (textEl) textEl.textContent = msg;
    if (el) el.classList.add('open');
  },

  _loadAllModules: function(forceRefresh) {
    var self = this;
    var M = window.BI_MODULES;
    self._setRefreshState(true);

    Promise.all([
      self._loadCachedInsights(forceRefresh),
      M.fetchFinancial(self._supabase).then(function(d) { self._financialData = d; }).catch(function(e) { console.error('[BI] Financial:', e.message); }),
      M.fetchCustomers(self._supabase).then(function(d) { self._customerData = d; }).catch(function(e) { console.error('[BI] Customers:', e.message); }),
      M.fetchOperations(self._supabase).then(function(d) { self._operationsData = d; }).catch(function(e) { console.error('[BI] Operations:', e.message); }),
      M.fetchMarket(self._supabase, self._user.id).then(function(d) { self._marketData = d; }).catch(function(e) { console.error('[BI] Market:', e.message); }),
      M.fetchStrategic(self._supabase, self._user.id).then(function(d) { self._strategicData = d; }).catch(function(e) { console.error('[BI] Strategic:', e.message); })
    ]).then(function() {
      self._renderAlertsModule();
      M.renderFinancial(self._financialData, self._charts);
      M.renderCustomers(self._customerData, self._charts);
      M.renderOperations(self._operationsData, self._charts);
      M.renderMarket(self._marketData);
      M.renderStrategic(self._strategicData, self._charts);
      self._updateLastRefreshed();
      self._setRefreshState(false);
    }).catch(function(err) {
      console.error('[BI] Load error:', err.message || err);
      self._showError('Could not load insights. Please try again.');
      self._setRefreshState(false);
    });
  },

  _setRefreshState: function(loading) {
    var btn = document.getElementById('bi-refresh-btn');
    if (!btn) return;
    btn.textContent = loading ? 'Refreshing...' : 'Refresh Insights';
    btn.disabled = loading;
  },

  _updateLastRefreshed: function() {
    var el = document.getElementById('bi-last-refreshed');
    if (!el) return;
    var now = new Date();
    var h = now.getHours(); var m = now.getMinutes();
    var ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    el.textContent = 'Last refreshed: ' + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  },

  _loadCachedInsights: async function(forceRefresh) {
    var sb = this._supabase;
    var userId = this._user.id;

    if (!forceRefresh) {
      var result = await sb.from('bi_insights').select('*').eq('user_id', userId).eq('is_dismissed', false);
      if (!result.error && result.data && result.data.length > 0) {
        var now = new Date().toISOString();
        var valid = result.data.filter(function(r) { return !r.expires_at || r.expires_at > now; });
        if (valid.length > 0) {
          this._insights = {};
          for (var i = 0; i < valid.length; i++) {
            var row = valid[i];
            if (!this._insights[row.module]) this._insights[row.module] = [];
            this._insights[row.module].push(row);
          }
          return;
        }
      }
    }

    this._insights = {};
    try {
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session && session.data.session.access_token;
      if (!token) return;

      var resp = await fetch('/api/bi-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: '{}'
      });
      if (!resp.ok) {
        console.error('[BI] Insights API failed:', resp.status);
        return;
      }
      var json = await resp.json();
      if (json.success && json.data) {
        for (var j = 0; j < json.data.length; j++) {
          var row = json.data[j];
          if (!this._insights[row.module]) this._insights[row.module] = [];
          this._insights[row.module].push(row);
        }
      }
    } catch (err) {
      console.error('[BI] Insights fetch error:', err.message || err);
    }
  },

  _renderAlertsModule: function() {
    var contentEl = document.getElementById('bi-mod-alerts-content');
    var updatedEl = document.getElementById('bi-mod-alerts-updated');
    if (!contentEl) return;

    var data = this._insights['alerts'] || [];

    if (updatedEl) {
      var now = new Date();
      var h = now.getHours(); var m = now.getMinutes();
      var ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      updatedEl.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    if (data.length === 0) {
      contentEl.innerHTML = '<div class="bi-module-prompt">' +
        '<div class="bi-module-prompt-icon">&#9888;</div>' +
        '<h3>Risk &amp; Opportunity Alerts</h3>' +
        '<p>Alerts are based on available data. Connect more sources for richer, cross-referenced insights.</p>' +
        '</div>';
      return;
    }

    var html = '<div style="padding:16px 20px">';
    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      var d = item.insight_data || {};
      var severity = d.severity || 'blue';
      var sevClass = severity === 'red' ? 'severity-red' : severity === 'amber' ? 'severity-amber' : severity === 'green' ? 'severity-green' : '';

      html += '<div class="bi-alert-card ' + sevClass + '" data-insight-id="' + escHtml(item.id) + '">';
      html += '<div class="bi-alert-header">';
      html += '<span class="bi-alert-type-icon">' + (d.icon || '&#9888;') + '</span>';
      html += '<span class="bi-alert-headline">' + escHtml(d.headline || 'Alert') + '</span>';
      html += '<button class="bi-alert-expand-btn" data-insight-id="' + escHtml(item.id) + '">&#9660;</button>';
      html += '</div>';
      html += '<div class="bi-alert-detail" id="bi-alert-detail-' + escHtml(item.id) + '">' + escHtml(d.detail || '') + '</div>';
      if (d.suggestion) {
        html += '<div class="bi-alert-suggestion">' + escHtml(d.suggestion) + '</div>';
      }
      html += '<div class="bi-alert-actions">';
      html += '<button class="bi-ask-btn" data-insight-id="' + escHtml(item.id) + '" data-module="alerts">Ask about this</button>';
      html += '<button class="bi-act-btn" data-insight-id="' + escHtml(item.id) + '">Act on this</button>';
      html += '<button class="bi-dismiss-btn" data-insight-id="' + escHtml(item.id) + '">Dismiss</button>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';
    contentEl.innerHTML = html;

    this._bindAlertEvents(contentEl);
  },

  _bindAlertEvents: function(container) {
    var self = this;
    container.querySelectorAll('.bi-alert-expand-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-insight-id');
        var detail = document.getElementById('bi-alert-detail-' + id);
        if (detail) detail.classList.toggle('open');
      });
    });
    container.querySelectorAll('.bi-ask-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._openChat(btn.getAttribute('data-insight-id'), btn.getAttribute('data-module'));
      });
    });
    container.querySelectorAll('.bi-act-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._actOnInsight(btn.getAttribute('data-insight-id')); });
    });
    container.querySelectorAll('.bi-dismiss-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._dismissInsight(btn.getAttribute('data-insight-id'), btn); });
    });
  },

  _openChat: function(insightId, mod) {
    // Mini-chat will be fully implemented in Steps 17-18
  },

  _actOnInsight: function(insightId) {
    // Act on this flow will be implemented in Step 19
  },

  _dismissInsight: async function(insightId, btn) {
    var sb = this._supabase;
    var result = await sb.from('bi_insights').update({ is_dismissed: true, updated_at: new Date().toISOString() }).eq('id', insightId).eq('user_id', this._user.id);
    if (result.error) {
      console.error('[BI] Dismiss error:', result.error);
      this._showError('Could not dismiss this alert. Please try again.');
      return;
    }
    var card = btn ? btn.closest('.bi-alert-card, .bi-advisory-item') : null;
    if (card) card.remove();
  }
};
