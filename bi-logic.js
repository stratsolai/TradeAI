window.BI_LOGIC = {
  _supabase: null,
  _user: null,
  _insights: {},
  _charts: {},
  _chatState: {},

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
      refreshBtn.addEventListener('click', function() {
        self._loadAllModules(true);
      });
    }

    var errorOk = document.querySelector('#bi-error-msg .save-msg-ok');
    if (errorOk) {
      errorOk.addEventListener('click', function() {
        document.getElementById('bi-error-msg').classList.remove('open');
      });
    }
    var errorOverlay = document.getElementById('bi-error-msg');
    if (errorOverlay) {
      errorOverlay.addEventListener('click', function(e) {
        if (e.target === errorOverlay) errorOverlay.classList.remove('open');
      });
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
    self._setRefreshState(true);

    self._loadCachedInsights(forceRefresh).then(function() {
      self._renderModule('alerts');
      self._renderModule('financial');
      self._renderModule('customers');
      self._renderModule('operations');
      self._renderModule('market');
      self._renderModule('strategic');
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
    if (loading) {
      btn.textContent = 'Refreshing...';
      btn.disabled = true;
    } else {
      btn.textContent = 'Refresh Insights';
      btn.disabled = false;
    }
  },

  _updateLastRefreshed: function() {
    var el = document.getElementById('bi-last-refreshed');
    if (!el) return;
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    var mStr = m < 10 ? '0' + m : '' + m;
    el.textContent = 'Last refreshed: ' + h + ':' + mStr + ' ' + ampm;
  },

  _loadCachedInsights: async function(forceRefresh) {
    var sb = this._supabase;
    var userId = this._user.id;
    var modules = ['financial', 'customers', 'operations', 'market', 'strategic', 'alerts'];

    if (!forceRefresh) {
      var result = await sb
        .from('bi_insights')
        .select('*')
        .eq('user_id', userId)
        .eq('is_dismissed', false);

      if (result.error) {
        console.error('[BI] Cache fetch error:', result.error);
      } else if (result.data && result.data.length > 0) {
        var now = new Date().toISOString();
        var valid = result.data.filter(function(r) {
          return !r.expires_at || r.expires_at > now;
        });
        if (valid.length > 0) {
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
    for (var m = 0; m < modules.length; m++) {
      this._setModuleLoading(modules[m]);
    }
  },

  _setModuleLoading: function(mod) {
    var contentEl = document.getElementById('bi-mod-' + mod + '-content');
    var advisoryList = document.getElementById('bi-mod-' + mod + '-advisory-list');
    if (contentEl) contentEl.innerHTML = '<div class="bi-module-loading">Loading alerts...</div>';
    if (advisoryList) advisoryList.innerHTML = '<div class="bi-module-loading">Loading insights...</div>';
  },

  _renderModule: function(mod) {
    var data = this._insights[mod] || [];
    var kpisEl = document.getElementById('bi-mod-' + mod + '-kpis');
    var advisoryList = document.getElementById('bi-mod-' + mod + '-advisory-list');
    var contentEl = document.getElementById('bi-mod-' + mod + '-content');

    if (mod === 'alerts') {
      this._renderAlertsModule(data, contentEl);
      return;
    }

    if (data.length === 0) {
      this._renderModulePrompt(mod, kpisEl, advisoryList);
      return;
    }

    this._renderKPIs(mod, data, kpisEl);
    this._renderAdvisory(mod, data, advisoryList);
  },

  _renderModulePrompt: function(mod, kpisEl, advisoryList) {
    var prompts = {
      financial: {
        icon: '&#128176;',
        title: 'Financial Insights',
        text: 'Connect your accounting software (Xero, QuickBooks, or MYOB) to see financial health insights, revenue trends, and cash flow analysis.'
      },
      customers: {
        icon: '&#128101;',
        title: 'Customer Analysis',
        text: 'Connect your accounting software to analyse your customer base, revenue concentration, and quote conversion rates.'
      },
      operations: {
        icon: '&#9881;',
        title: 'Operational Insights',
        text: 'Connect your job management system (ServiceM8, Buildxact, Fergus, or Tradify) to see operational insights, job profitability, and efficiency metrics.'
      },
      market: {
        icon: '&#127758;',
        title: 'Market Intelligence',
        text: 'Basic market intelligence available. Activate Industry News &amp; Updates for deeper insights including supplier updates and personalised industry monitoring.'
      },
      strategic: {
        icon: '&#127919;',
        title: 'Strategic Alignment',
        text: 'Create your Strategic Plan to track progress against your goals, monitor action items, and align operations with strategy.'
      }
    };

    var p = prompts[mod];
    if (!p) return;

    var html = '<div class="bi-module-prompt">' +
      '<div class="bi-module-prompt-icon">' + p.icon + '</div>' +
      '<h3>' + escHtml(p.title) + '</h3>' +
      '<p>' + p.text + '</p>' +
      '</div>';

    if (kpisEl) kpisEl.innerHTML = '';
    if (advisoryList) advisoryList.parentElement.innerHTML = html;
  },

  _renderAlertsModule: function(data, contentEl) {
    if (!contentEl) return;

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
      html += '<span class="bi-alert-type-icon">' + escHtml(d.icon || '&#9888;') + '</span>';
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
        var id = btn.getAttribute('data-insight-id');
        var mod = btn.getAttribute('data-module');
        self._openChat(id, mod);
      });
    });

    container.querySelectorAll('.bi-act-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-insight-id');
        self._actOnInsight(id);
      });
    });

    container.querySelectorAll('.bi-dismiss-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-insight-id');
        self._dismissInsight(id, btn);
      });
    });
  },

  _renderKPIs: function(mod, data, container) {
    if (!container) return;
    var kpis = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].insight_type === 'metric' && data[i].insight_data) {
        kpis.push(data[i]);
      }
    }
    if (kpis.length === 0) {
      container.innerHTML = '';
      return;
    }

    var colours = ['', 'orange', 'green', 'purple', 'teal', 'red'];
    var html = '';
    for (var k = 0; k < kpis.length; k++) {
      var d = kpis[k].insight_data;
      var colourClass = colours[k % colours.length] ? ' ' + colours[k % colours.length] : '';
      var trendClass = d.trend === 'up' ? 'up' : d.trend === 'down' ? 'down' : 'flat';
      var trendArrow = d.trend === 'up' ? '&#9650;' : d.trend === 'down' ? '&#9660;' : '&#8212;';

      html += '<div class="bi-kpi-card' + colourClass + '">';
      html += '<div class="bi-kpi-value">' + escHtml(d.value || '-') + '</div>';
      html += '<div class="bi-kpi-label">' + escHtml(d.label || '') + '</div>';
      if (d.trend_text) {
        html += '<div class="bi-kpi-trend ' + trendClass + '">' + trendArrow + ' ' + escHtml(d.trend_text) + '</div>';
      }
      html += '</div>';
    }
    container.innerHTML = html;
  },

  _renderAdvisory: function(mod, data, container) {
    if (!container) return;
    var advisories = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].insight_type === 'advisory' && data[i].insight_data) {
        advisories.push(data[i]);
      }
    }
    if (advisories.length === 0) {
      container.innerHTML = '<div class="bi-module-loading">No advisory insights available yet.</div>';
      return;
    }

    var html = '';
    for (var a = 0; a < advisories.length; a++) {
      var d = advisories[a].insight_data;
      html += '<div class="bi-advisory-item">';
      html += '<span class="bi-advisory-icon">' + (d.icon || '&#128161;') + '</span>';
      html += '<span class="bi-advisory-text">' + escHtml(d.text || '') + '</span>';
      html += '<div class="bi-advisory-actions">';
      html += '<button class="bi-ask-btn" data-insight-id="' + escHtml(advisories[a].id) + '" data-module="' + escHtml(mod) + '">Ask about this</button>';
      html += '</div>';
      html += '</div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.bi-ask-btn').forEach(function(btn) {
      var self = window.BI_LOGIC;
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-insight-id');
        var m = btn.getAttribute('data-module');
        self._openChat(id, m);
      });
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
    var result = await sb
      .from('bi_insights')
      .update({ is_dismissed: true, updated_at: new Date().toISOString() })
      .eq('id', insightId)
      .eq('user_id', this._user.id);

    if (result.error) {
      console.error('[BI] Dismiss error:', result.error);
      this._showError('Could not dismiss this alert. Please try again.');
      return;
    }

    var card = btn ? btn.closest('.bi-alert-card, .bi-advisory-item') : null;
    if (card) card.remove();
  }
};
