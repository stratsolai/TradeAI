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
  _period: '12m',

  _isActivated: false,

  init: async function(supabase, user) {
    this._supabase = supabase;
    this._user = user;
    this._bindEvents();

    var pr = await supabase.from('profiles').select('activated_tools').eq('id', user.id).single();
    if (pr.error) console.error('[BI] Profile check error:', pr.error.message);
    if (pr.data && Array.isArray(pr.data.activated_tools) && pr.data.activated_tools.indexOf('bi') !== -1) {
      this._isActivated = true;
      this._loadAllModules();
    } else {
      this._renderSampleMode();
    }
  },

  _calcDateRange: function() {
    var now = new Date();
    var from, to;
    to = now.toISOString().split('T')[0];

    switch (this._period) {
      case '30d':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        break;
      case '90d':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
        break;
      case 'this-quarter':
        var qm = Math.floor(now.getMonth() / 3) * 3;
        from = new Date(now.getFullYear(), qm, 1);
        break;
      case 'last-quarter':
        var lqm = Math.floor(now.getMonth() / 3) * 3 - 3;
        var lqy = now.getFullYear();
        if (lqm < 0) { lqm += 12; lqy--; }
        from = new Date(lqy, lqm, 1);
        to = new Date(lqy, lqm + 3, 0).toISOString().split('T')[0];
        break;
      case 'this-fy':
        from = now.getMonth() >= 6 ? new Date(now.getFullYear(), 6, 1) : new Date(now.getFullYear() - 1, 6, 1);
        break;
      case '12m':
      default:
        from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
    }
    if (from instanceof Date) from = from.toISOString().split('T')[0];
    return { fromDate: from, toDate: to };
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

    var periodBtn = document.getElementById('bi-period-btn');
    var periodMenu = document.getElementById('bi-period-menu');
    if (periodBtn && periodMenu) {
      periodBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        periodMenu.classList.toggle('open');
        periodBtn.classList.toggle('active');
      });
      periodMenu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var period = item.getAttribute('data-period');
          self._period = period;
          periodBtn.textContent = item.textContent;
          periodMenu.querySelectorAll('.lookback-dropdown-item').forEach(function(el) { el.classList.remove('active'); });
          item.classList.add('active');
          periodMenu.classList.remove('open');
          periodBtn.classList.remove('active');
          self._loadAllModules(true);
        });
      });
      document.addEventListener('click', function() {
        periodMenu.classList.remove('open');
        periodBtn.classList.remove('active');
      });
    }

    document.querySelectorAll('.bi-history-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var mod = btn.getAttribute('data-module');
        self._toggleHistory(mod);
      });
    });
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

    var dateRange = self._calcDateRange();

    Promise.all([
      self._loadCachedInsights(forceRefresh),
      M.fetchFinancial(self._supabase, dateRange).then(function(d) { self._financialData = d; }).catch(function(e) { console.error('[BI] Financial:', e.message); }),
      M.fetchCustomers(self._supabase, dateRange).then(function(d) { self._customerData = d; }).catch(function(e) { console.error('[BI] Customers:', e.message); }),
      M.fetchOperations(self._supabase, dateRange).then(function(d) { self._operationsData = d; }).catch(function(e) { console.error('[BI] Operations:', e.message); }),
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

    var result = await sb.from('bi_insights').select('*').eq('user_id', userId).eq('is_dismissed', false);
    var hasCache = !result.error && result.data && result.data.length > 0;

    if (hasCache) {
      this._insights = {};
      for (var i = 0; i < result.data.length; i++) {
        var row = result.data[i];
        if (!this._insights[row.module]) this._insights[row.module] = [];
        this._insights[row.module].push(row);
      }

      var now = new Date().toISOString();
      var allValid = result.data.every(function(r) { return !r.expires_at || r.expires_at > now; });
      if (!forceRefresh && allValid) return;

      this._refreshInsightsInBackground();
      return;
    }

    this._insights = {};
    await this._callInsightsAPI();
  },

  _refreshInsightsInBackground: function() {
    var self = this;
    var indicator = document.getElementById('bi-last-refreshed');
    var origText = indicator ? indicator.textContent : '';
    if (indicator) indicator.textContent = 'Updating insights...';

    self._callInsightsAPI().then(function() {
      self._renderAlertsModule();
      if (indicator) {
        var now = new Date();
        var h = now.getHours(); var m = now.getMinutes();
        var ampm = h >= 12 ? 'pm' : 'am';
        h = h % 12 || 12;
        indicator.textContent = 'Last refreshed: ' + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
      }
    }).catch(function() {
      if (indicator) indicator.textContent = origText;
    });
  },

  _callInsightsAPI: async function() {
    try {
      var sb = this._supabase;
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
        this._insights = {};
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

    var html = '<div class="bi-alerts-body">';
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

  _renderSampleMode: function() {
    var refreshRow = document.querySelector('.bi-refresh-row');
    if (refreshRow) refreshRow.classList.add('bi-hidden');

    var badge = document.createElement('div');
    badge.className = 'bi-sample-banner';
    badge.innerHTML = '<span class="bi-sample-label">SAMPLE DATA</span>' +
      '<span class="bi-sample-text">This is a preview with sample data. Activate BI to see insights from your real business data.</span>' +
      '<a href="/panel-auth.html?tool=bi" class="bi-sample-cta">Activate</a>';

    var grid = document.querySelector('.bi-module-grid');
    if (grid) grid.parentElement.insertBefore(badge, grid);

    var sample = this._getSampleData();
    var M = window.BI_MODULES;

    M.renderFinancial(sample.financial, this._charts);
    M.renderCustomers(sample.customers, this._charts);
    M.renderOperations(sample.operations, this._charts);
    M.renderMarket(sample.market);
    M.renderStrategic(sample.strategic, this._charts);

    var alertsEl = document.getElementById('bi-mod-alerts-content');
    if (alertsEl) {
      alertsEl.innerHTML = '<div class="bi-alerts-body">' +
        '<div class="bi-alert-card severity-amber"><div class="bi-alert-header"><span class="bi-alert-type-icon">&#9888;</span><span class="bi-alert-headline">Cash flow may be tight in 3 weeks based on upcoming bills</span></div></div>' +
        '<div class="bi-alert-card severity-red"><div class="bi-alert-header"><span class="bi-alert-type-icon">&#128176;</span><span class="bi-alert-headline">Top customer has not ordered in 60 days — unusual pattern</span></div></div>' +
        '<div class="bi-alert-card severity-green"><div class="bi-alert-header"><span class="bi-alert-type-icon">&#128200;</span><span class="bi-alert-headline">Quote requests up 40% this month — capacity check needed</span></div></div>' +
        '</div>';
    }

    document.querySelectorAll('.bi-module-card').forEach(function(card) {
      card.classList.add('bi-sample-disabled');
    });
  },

  _getSampleData: function() {
    return {
      financial: {
        connected: true,
        data: {
          summary: { total_revenue: 245000, total_expenses: 189000, net_profit: 56000, profit_margin: 23, cash_balance: 42000, accounts_receivable: 38000, accounts_payable: 15000, overdue_receivable: 12000, invoice_count: 87, bill_count: 134, quote_count: 24 },
          pl_summary: { income: 245000, expenses: 189000, net_profit: 56000 },
          trend: [
            { month: '2025-11', revenue: 18000, expenses: 14500, profit: 3500, margin: 19 },
            { month: '2025-12', revenue: 16500, expenses: 13200, profit: 3300, margin: 20 },
            { month: '2026-01', revenue: 21000, expenses: 15800, profit: 5200, margin: 25 },
            { month: '2026-02', revenue: 22500, expenses: 17100, profit: 5400, margin: 24 },
            { month: '2026-03', revenue: 24000, expenses: 18200, profit: 5800, margin: 24 },
            { month: '2026-04', revenue: 19500, expenses: 16000, profit: 3500, margin: 18 }
          ],
          receivable_aging: { current: 18000, days_30: 8000, days_60: 6000, days_90_plus: 6000 },
          payable_aging: { current: 10000, days_30: 3000, days_60: 1500, days_90_plus: 500 }
        }
      },
      customers: {
        connected: true,
        data: {
          summary: { total_customers: 34, total_revenue: 245000, avg_invoice_value: 2816, concentration_pct: 48, quote_count: 24, accepted_quotes: 11, conversion_rate: 46, inactive_count: 3 },
          top_customers: [
            { name: 'Metro Constructions', revenue: 52000, percentage: 21, invoice_count: 12 },
            { name: 'Harbour Property Group', revenue: 38000, percentage: 16, invoice_count: 8 },
            { name: 'Eastside Developments', revenue: 27000, percentage: 11, invoice_count: 6 },
            { name: 'Summit Building Co', revenue: 19000, percentage: 8, invoice_count: 5 },
            { name: 'Coastal Living Homes', revenue: 15000, percentage: 6, invoice_count: 4 }
          ],
          new_vs_repeat: [
            { month: '2026-01', new_customers: 3, repeat_customers: 12 },
            { month: '2026-02', new_customers: 2, repeat_customers: 14 },
            { month: '2026-03', new_customers: 4, repeat_customers: 13 },
            { month: '2026-04', new_customers: 1, repeat_customers: 11 }
          ],
          inactive_customers: [{ name: 'Greenfield Homes', revenue: 8500, last_invoice: '2026-02-10' }]
        }
      },
      operations: {
        connected: true,
        data: {
          summary: { total_jobs: 42, completed_jobs: 35, avg_duration_days: 4.2, avg_job_value: 5800, over_quote_count: 8, under_quote_count: 3, on_quote_count: 24, form_completion_rate: 78, total_forms: 33, total_quotes: 24 },
          status_breakdown: { Completed: 35, 'In Progress': 4, Quoted: 3 },
          monthly_jobs: [
            { month: '2026-01', count: 9 },
            { month: '2026-02', count: 11 },
            { month: '2026-03', count: 12 },
            { month: '2026-04', count: 10 }
          ]
        }
      },
      market: { briefings: [], tenders: [], hasNewsDigest: false },
      strategic: { plan: null, tasks: [] }
    };
  },

  _toggleHistory: async function(mod) {
    var panel = document.getElementById('bi-history-' + mod);
    if (!panel) return;

    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      return;
    }

    panel.innerHTML = '<div class="bi-history-empty">Loading history...</div>';
    panel.classList.add('open');

    try {
      var sb = this._supabase;
      var userId = this._user.id;
      var oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      var cutoff = oneYearAgo.toISOString();

      var dismissed = await sb.from('bi_insights').select('id, insight_data, module, updated_at').eq('user_id', userId).eq('module', mod).eq('is_dismissed', true).gte('created_at', cutoff).order('updated_at', { ascending: false }).limit(50);
      if (dismissed.error) console.error('[BI] History dismissed query error:', dismissed.error.message);

      var acted = await sb.from('bi_decisions').select('id, bi_insight_id, decision, decision_date, initiative_id').eq('user_id', userId).gte('created_at', cutoff);
      if (acted.error) console.error('[BI] History acted query error:', acted.error.message);

      var actedMap = {};
      if (acted.data) {
        acted.data.forEach(function(d) { actedMap[d.bi_insight_id] = d; });
      }

      var allActedInsightIds = Object.keys(actedMap);
      var actedInsights = [];
      if (allActedInsightIds.length > 0) {
        var aiRes = await sb.from('bi_insights').select('id, insight_data, module, updated_at').eq('module', mod).in('id', allActedInsightIds);
        if (aiRes.data) actedInsights = aiRes.data;
      }

      var items = [];
      if (dismissed.data) {
        dismissed.data.forEach(function(row) {
          var d = row.insight_data || {};
          items.push({
            headline: d.headline || d.text || 'Insight',
            date: (row.updated_at || '').substring(0, 10),
            status: 'dismissed',
            initiativeId: null
          });
        });
      }
      actedInsights.forEach(function(row) {
        var d = row.insight_data || {};
        var decision = actedMap[row.id];
        items.push({
          headline: d.headline || d.text || 'Insight',
          date: (decision.decision_date || row.updated_at || '').substring(0, 10),
          status: 'acted',
          initiativeId: decision.initiative_id || null
        });
      });

      items.sort(function(a, b) { return b.date.localeCompare(a.date); });

      if (items.length === 0) {
        panel.innerHTML = '<div class="bi-history-empty">No history for this module yet.</div>';
        return;
      }

      var html = '';
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        html += '<div class="bi-history-item">';
        html += '<span class="bi-history-headline">' + escHtml(it.headline) + '</span>';
        html += '<span class="bi-history-date">' + escHtml(it.date) + '</span>';
        if (it.status === 'acted') {
          if (it.initiativeId) {
            html += '<a href="/strategic-plan.html#tracker" class="bi-history-status acted">Acted on</a>';
          } else {
            html += '<span class="bi-history-status acted">Acted on</span>';
          }
        } else {
          html += '<span class="bi-history-status dismissed">Dismissed</span>';
        }
        html += '</div>';
      }
      panel.innerHTML = html;
    } catch (err) {
      console.error('[BI] History error:', err.message || err);
      panel.innerHTML = '<div class="bi-history-empty">Could not load history.</div>';
    }
  },

  _SUGGESTED_QUESTIONS: {
    'cash flow': ['How urgent is this?', 'What are my options?', 'Should I chase invoices or cut costs first?'],
    'concentration': ['Is this normal for my industry?', 'What is a safe concentration level?', 'How do I diversify my customer base?'],
    'opportunity': ['Am I qualified for this?', 'What would I need to apply?', 'Is this worth pursuing?'],
    'margin': ['What is causing this?', 'How do I fix it?', 'What margin should I be targeting?'],
    'growth': ['How do I capitalise on this?', 'Do I have capacity?', 'What resources do I need?'],
    'digital': ['Where do I start?', 'What is the typical cost?', 'How long does this usually take?'],
    'overdue': ['How urgent is this?', 'What are my options?', 'Should I chase invoices or cut costs first?'],
    'compliance': ['What is the risk if I ignore this?', 'How do I fix it quickly?', 'Is there a legal obligation?'],
    '_default': ['What does this mean for my business?', 'What should I do about this?', 'How serious is this?']
  },

  _getSuggestedQuestions: function(insightData) {
    if (!insightData) return this._SUGGESTED_QUESTIONS._default;
    var text = ((insightData.headline || '') + ' ' + (insightData.text || '') + ' ' + (insightData.detail || '')).toLowerCase();
    var keys = Object.keys(this._SUGGESTED_QUESTIONS);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== '_default' && text.indexOf(keys[i]) !== -1) return this._SUGGESTED_QUESTIONS[keys[i]];
    }
    return this._SUGGESTED_QUESTIONS._default;
  },

  _getInsightData: function(insightId, mod) {
    var allInsights = this._insights[mod] || [];
    for (var i = 0; i < allInsights.length; i++) {
      if (allInsights[i].id === insightId) return allInsights[i].insight_data || {};
    }
    return null;
  },

  _openChat: function(insightId, mod) {
    var self = this;
    var existing = document.getElementById('bi-chat-active');
    if (existing) existing.remove();

    var insightData = this._getInsightData(insightId, mod);
    var chatKey = insightId + '-' + mod;
    if (!this._chatState[chatKey]) {
      this._chatState[chatKey] = { history: [], turns: 0 };
    }
    var state = this._chatState[chatKey];

    var suggested = this._getSuggestedQuestions(insightData);
    var maxTurns = 4;

    var topic = '';
    if (insightData) topic = insightData.headline || insightData.text || 'this insight';
    if (topic.length > 60) topic = topic.substring(0, 57) + '...';

    var panel = document.createElement('div');
    panel.className = 'bi-chat-panel open';
    panel.id = 'bi-chat-active';

    var html = '<div class="bi-chat-header">';
    html += '<span class="bi-chat-title">Ask about: ' + escHtml(topic) + '</span>';
    html += '<button class="bi-chat-close" id="bi-chat-close-btn">&times;</button>';
    html += '</div>';
    html += '<div class="bi-chat-messages" id="bi-chat-messages">';
    for (var h = 0; h < state.history.length; h++) {
      var msg = state.history[h];
      html += '<div class="bi-chat-msg ' + escHtml(msg.role) + '">' + escHtml(msg.content) + '</div>';
    }
    html += '</div>';

    if (state.turns < maxTurns) {
      html += '<div class="bi-chat-suggestions" id="bi-chat-suggestions">';
      for (var s = 0; s < suggested.length; s++) {
        html += '<button class="bi-chat-suggestion" data-q="' + escHtml(suggested[s]) + '">' + escHtml(suggested[s]) + '</button>';
      }
      html += '</div>';
      html += '<div class="bi-chat-input-row">';
      html += '<input class="bi-chat-input" id="bi-chat-input" type="text" placeholder="Ask a question...">';
      html += '<button class="bi-chat-send" id="bi-chat-send-btn">Send</button>';
      html += '</div>';
    } else {
      html += '<div class="bi-chat-msg assistant">To explore this further, consider acting on this insight or consulting your advisor.</div>';
    }

    panel.innerHTML = html;

    var targetCard = null;
    if (insightId) {
      targetCard = document.querySelector('[data-insight-id="' + insightId + '"]');
      if (!targetCard) {
        var modCard = document.getElementById('bi-mod-' + mod);
        if (modCard) targetCard = modCard;
      }
    }
    if (!targetCard) targetCard = document.getElementById('bi-mod-alerts');
    if (targetCard) {
      var moduleCard = targetCard.closest('.bi-module-card');
      if (moduleCard) moduleCard.appendChild(panel);
      else targetCard.parentElement.appendChild(panel);
    }

    var closeBtn = document.getElementById('bi-chat-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() { panel.remove(); });
    }

    if (state.turns < maxTurns) {
      var sendBtn = document.getElementById('bi-chat-send-btn');
      var input = document.getElementById('bi-chat-input');

      var sendFn = function() {
        var q = input ? input.value.trim() : '';
        if (!q) return;
        self._sendChatMessage(chatKey, q, insightData, mod, panel);
      };

      if (sendBtn) sendBtn.addEventListener('click', sendFn);
      if (input) {
        input.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendFn(); });
        input.focus();
      }

      panel.querySelectorAll('.bi-chat-suggestion').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var q = btn.getAttribute('data-q');
          if (input) input.value = q;
          self._sendChatMessage(chatKey, q, insightData, mod, panel);
        });
      });
    }
  },

  _sendChatMessage: async function(chatKey, question, insightData, mod, panel) {
    var state = this._chatState[chatKey];
    if (!state) return;

    var messagesEl = document.getElementById('bi-chat-messages');
    var input = document.getElementById('bi-chat-input');
    var sendBtn = document.getElementById('bi-chat-send-btn');
    var suggestionsEl = document.getElementById('bi-chat-suggestions');

    if (suggestionsEl) suggestionsEl.classList.add('bi-hidden');

    var userMsg = document.createElement('div');
    userMsg.className = 'bi-chat-msg user';
    userMsg.textContent = question;
    if (messagesEl) { messagesEl.appendChild(userMsg); messagesEl.scrollTop = messagesEl.scrollHeight; }

    state.history.push({ role: 'user', content: question });
    state.turns++;

    if (input) { input.value = ''; input.disabled = true; }
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; }

    try {
      var sb = this._supabase;
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session && session.data.session.access_token;

      var resp = await fetch('/api/bi-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          insightData: insightData,
          question: question,
          history: state.history.slice(0, -1),
          module: mod
        })
      });

      if (!resp.ok) throw new Error('Chat request failed');

      var json = await resp.json();
      var reply = (json.success && json.reply) ? json.reply : 'Sorry, I could not generate a response. Please try again.';

      state.history.push({ role: 'assistant', content: reply });

      var assistantMsg = document.createElement('div');
      assistantMsg.className = 'bi-chat-msg assistant';
      assistantMsg.textContent = reply;
      if (messagesEl) { messagesEl.appendChild(assistantMsg); messagesEl.scrollTop = messagesEl.scrollHeight; }

    } catch (err) {
      console.error('[BI] Chat error:', err.message || err);
      var errMsg = document.createElement('div');
      errMsg.className = 'bi-chat-msg assistant';
      errMsg.textContent = 'Something went wrong. Please try again.';
      if (messagesEl) messagesEl.appendChild(errMsg);
    }

    if (state.turns >= 4) {
      if (input) input.parentElement.remove();
      var limitMsg = document.createElement('div');
      limitMsg.className = 'bi-chat-msg assistant';
      limitMsg.textContent = 'To explore this further, consider acting on this insight or consulting your advisor.';
      if (messagesEl) { messagesEl.appendChild(limitMsg); messagesEl.scrollTop = messagesEl.scrollHeight; }
    } else {
      if (input) input.disabled = false;
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
      if (input) input.focus();
    }
  },

  _CONTRADICTION_MAP: {
    'hire': { field: 'hiringPlans', contra: 'no-hiring', label: 'hiring' },
    'staff': { field: 'hiringPlans', contra: 'no-hiring', label: 'hiring' },
    'employee': { field: 'hiringPlans', contra: 'no-hiring', label: 'hiring' },
    'apprentice': { field: 'hiringPlans', contra: 'no-hiring', label: 'hiring' },
    'job management software': { field: 'technology', contra: 'none', label: 'digital transformation' },
    'implement software': { field: 'technology', contra: 'none', label: 'digital transformation' },
    'digital': { field: 'technology', contra: 'none', label: 'digital transformation' },
    'tender': { field: 'goals1yr', contra: null, label: 'government tendering' },
    'expand': { field: 'goals1yr', contra: null, label: 'geographic expansion' },
    'new region': { field: 'goals1yr', contra: null, label: 'geographic expansion' }
  },

  _checkContradiction: function(insightData) {
    if (!this._strategicData || !this._strategicData.plan) return null;

    var plan = this._strategicData.plan;
    var sb = this._supabase;
    var text = ((insightData.headline || '') + ' ' + (insightData.detail || '') + ' ' + (insightData.suggestion || '') + ' ' + (insightData.text || '')).toLowerCase();

    var keys = Object.keys(this._CONTRADICTION_MAP);
    for (var i = 0; i < keys.length; i++) {
      if (text.indexOf(keys[i]) === -1) continue;
      var rule = this._CONTRADICTION_MAP[keys[i]];
      if (!rule.contra) continue;

      var interviewData = plan.interview_data || plan.swot_data || {};
      var fieldVal = interviewData[rule.field];
      if (!fieldVal) continue;

      if (Array.isArray(fieldVal) && fieldVal.indexOf(rule.contra) !== -1) {
        return rule.label;
      }
      if (typeof fieldVal === 'string' && fieldVal === rule.contra) {
        return rule.label;
      }
    }
    return null;
  },

  _actOnInsight: async function(insightId) {
    var self = this;

    var insightData = null;
    var allModules = ['alerts', 'financial', 'customers', 'operations', 'market', 'strategic'];
    for (var m = 0; m < allModules.length; m++) {
      var modInsights = this._insights[allModules[m]] || [];
      for (var j = 0; j < modInsights.length; j++) {
        if (modInsights[j].id === insightId) { insightData = modInsights[j].insight_data || {}; break; }
      }
      if (insightData) break;
    }
    if (!insightData) {
      this._showError('Could not find insight data.');
      return;
    }

    var contradiction = this._checkContradiction(insightData);

    if (contradiction) {
      self._showContradictionModal(insightId, insightData, contradiction);
      return;
    }

    await self._executeAct(insightId, insightData, false);
  },

  _showContradictionModal: function(insightId, insightData, contradictionLabel) {
    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'save-msg open';
    overlay.innerHTML = '<div class="save-msg-card">' +
      '<div class="save-msg-text bi-modal-body">' +
      '<strong>This changes your strategic direction</strong><br><br>' +
      'Acting on this recommendation contradicts your current Strategic Plan position on <strong>' + escHtml(contradictionLabel) + '</strong>. Your plan will need to be updated to reflect this new direction.' +
      '</div>' +
      '<div class="bi-modal-actions">' +
      '<button class="btn-outline btn-sm" id="bi-contra-cancel">Cancel</button>' +
      '<button class="btn-primary btn-sm" id="bi-contra-update">Update Plan</button>' +
      '</div></div>';

    document.body.appendChild(overlay);

    document.getElementById('bi-contra-cancel').addEventListener('click', function() {
      overlay.remove();
    });

    document.getElementById('bi-contra-update').addEventListener('click', async function() {
      overlay.remove();
      await self._executeAct(insightId, insightData, true);
      window.location.href = '/strategic-plan.html#update';
    });
  },

  _executeAct: async function(insightId, insightData, spRewriteTriggered) {
    var self = this;
    try {
      var sb = this._supabase;
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session && session.data.session.access_token;

      var actBtn = document.querySelector('.bi-act-btn[data-insight-id="' + insightId + '"]');
      if (actBtn) { actBtn.textContent = 'Adding...'; actBtn.disabled = true; }

      var resp = await fetch('/api/bi-act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          insightId: insightId,
          insightData: insightData,
          spRewriteTriggered: spRewriteTriggered
        })
      });

      var json = await resp.json();

      if (json.success) {
        if (actBtn) {
          actBtn.textContent = 'Added';
          actBtn.disabled = true;
        }

        if (json.spRewriteRequired && json.contradiction) {
          var rewriteNotification = document.createElement('div');
          rewriteNotification.className = 'bi-toast orange';
          rewriteNotification.innerHTML = escHtml(json.contradiction.message) + ' <a href="/strategic-plan.html?rewrite=true&decision=' + encodeURIComponent(json.contradiction.decisionId || '') + '">Update Plan</a>';
          document.body.appendChild(rewriteNotification);
          setTimeout(function() { if (rewriteNotification.parentNode) rewriteNotification.parentNode.removeChild(rewriteNotification); }, 10000);
        } else {
          var notification = document.createElement('div');
          notification.className = 'bi-toast';
          notification.innerHTML = 'Added to your Operational Plan (' + (json.tasksCreated || 0) + ' tasks) <a href="/strategic-plan.html">View</a>';
          document.body.appendChild(notification);
          setTimeout(function() { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 5000);
        }
      } else {
        if (actBtn) { actBtn.textContent = 'Act on this'; actBtn.disabled = false; }
        self._showError(json.error || 'Could not add to Operational Plan.');
      }
    } catch (err) {
      console.error('[BI] Act error:', err.message || err);
      self._showError('Could not process action. Please try again.');
    }
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
