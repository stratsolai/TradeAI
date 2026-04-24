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

    Promise.all([
      self._loadCachedInsights(forceRefresh),
      self._fetchFinancialData(),
      self._fetchCustomerData(),
      self._fetchOperationsData(),
      self._fetchMarketData(),
      self._fetchStrategicData()
    ]).then(function() {
      self._renderModule('alerts');
      self._renderFinancialModule();
      self._renderCustomerModule();
      self._renderOperationsModule();
      self._renderMarketModule();
      self._renderStrategicModule();
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

  _fetchFinancialData: async function() {
    try {
      var sb = this._supabase;
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session && session.data.session.access_token;
      if (!token) return;

      var resp = await fetch('/api/bi-financial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({})
      });
      if (!resp.ok) {
        console.error('[BI] Financial fetch failed:', resp.status);
        return;
      }
      var json = await resp.json();
      if (json.success) {
        this._financialData = json;
      }
    } catch (err) {
      console.error('[BI] Financial fetch error:', err.message || err);
    }
  },

  _renderFinancialModule: function() {
    var kpisEl = document.getElementById('bi-mod-financial-kpis');
    var chartArea = document.getElementById('bi-mod-financial-chart');
    var advisoryList = document.getElementById('bi-mod-financial-advisory-list');
    var updatedEl = document.getElementById('bi-mod-financial-updated');

    if (!this._financialData || !this._financialData.connected) {
      if (kpisEl) kpisEl.innerHTML = '';
      if (chartArea) chartArea.style.display = 'none';
      var advisorySection = document.getElementById('bi-mod-financial-advisory');
      if (advisorySection) {
        advisorySection.innerHTML = '<div class="bi-module-prompt">' +
          '<div class="bi-module-prompt-icon">&#128176;</div>' +
          '<h3>Financial Insights</h3>' +
          '<p>Connect your accounting software (Xero, QuickBooks, or MYOB) to see financial health insights, revenue trends, and cash flow analysis.</p>' +
          '</div>';
      }
      return;
    }

    var d = this._financialData.data;
    var s = d.summary;

    if (updatedEl) {
      var now = new Date();
      var h = now.getHours(); var m = now.getMinutes();
      var ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      updatedEl.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    this._renderFinancialKPIs(s, kpisEl);
    this._renderFinancialCharts(d, chartArea);
    this._renderFinancialAdvisory(d, advisoryList);
  },

  _renderFinancialKPIs: function(s, container) {
    if (!container) return;
    var margin = s.profit_margin || 0;
    var marginTrend = margin >= 20 ? 'up' : margin >= 10 ? 'flat' : 'down';

    var kpis = [
      { value: '$' + this._formatNum(s.total_revenue), label: 'Revenue', colour: '', trend: s.total_revenue > 0 ? 'up' : 'flat', trendText: s.invoice_count + ' invoices' },
      { value: '$' + this._formatNum(s.total_expenses), label: 'Expenses', colour: 'orange', trend: 'flat', trendText: s.bill_count + ' bills' },
      { value: margin + '%', label: 'Profit Margin', colour: margin >= 20 ? 'green' : margin >= 10 ? 'orange' : 'red', trend: marginTrend, trendText: '$' + this._formatNum(s.net_profit) + ' net' },
      { value: '$' + this._formatNum(s.cash_balance), label: 'Cash Position', colour: s.cash_balance > 0 ? 'green' : 'red', trend: s.cash_balance > 0 ? 'up' : 'down', trendText: '' }
    ];

    var html = '';
    for (var i = 0; i < kpis.length; i++) {
      var k = kpis[i];
      var colClass = k.colour ? ' ' + k.colour : '';
      var trendClass = k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : 'flat';
      var arrow = k.trend === 'up' ? '&#9650;' : k.trend === 'down' ? '&#9660;' : '&#8212;';
      html += '<div class="bi-kpi-card' + colClass + '">';
      html += '<div class="bi-kpi-value">' + escHtml(k.value) + '</div>';
      html += '<div class="bi-kpi-label">' + escHtml(k.label) + '</div>';
      if (k.trendText) {
        html += '<div class="bi-kpi-trend ' + trendClass + '">' + arrow + ' ' + escHtml(k.trendText) + '</div>';
      }
      html += '</div>';
    }
    container.innerHTML = html;
  },

  _renderFinancialCharts: function(d, chartArea) {
    if (!chartArea) return;
    chartArea.style.display = 'block';

    if (this._charts.financial) {
      this._charts.financial.destroy();
      this._charts.financial = null;
    }
    if (this._charts.financialAging) {
      this._charts.financialAging.destroy();
      this._charts.financialAging = null;
    }

    var canvas = document.getElementById('bi-chart-financial');
    if (!canvas) return;

    var trend = d.trend || [];
    if (trend.length === 0) {
      chartArea.innerHTML = '<div class="bi-module-loading">No trend data available yet.</div>';
      return;
    }

    var agingCanvas = document.createElement('canvas');
    agingCanvas.id = 'bi-chart-financial-aging';
    chartArea.innerHTML = '';
    chartArea.appendChild(canvas);
    chartArea.appendChild(agingCanvas);

    var labels = trend.map(function(t) {
      var parts = t.month.split('-');
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0].substring(2);
    });
    var revenueData = trend.map(function(t) { return t.revenue; });
    var expenseData = trend.map(function(t) { return t.expenses; });
    var profitData = trend.map(function(t) { return t.profit; });

    var rootStyle = getComputedStyle(document.documentElement);
    var blue = rootStyle.getPropertyValue('--blue').trim() || '#4A6D8C';
    var orange = rootStyle.getPropertyValue('--orange').trim() || '#c4622a';
    var green = rootStyle.getPropertyValue('--green').trim() || '#28a745';

    this._charts.financial = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Revenue',
            data: revenueData,
            borderColor: blue,
            backgroundColor: blue + '20',
            fill: false,
            tension: 0.3,
            pointRadius: 3
          },
          {
            label: 'Expenses',
            data: expenseData,
            borderColor: orange,
            backgroundColor: orange + '20',
            fill: false,
            tension: 0.3,
            pointRadius: 3
          },
          {
            label: 'Profit',
            data: profitData,
            borderColor: green,
            backgroundColor: green + '15',
            fill: true,
            tension: 0.3,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(val) { return '$' + (val >= 1000 ? Math.round(val / 1000) + 'K' : val); }
            }
          }
        }
      }
    });

    var aging = d.receivable_aging || {};
    var payAging = d.payable_aging || {};

    this._charts.financialAging = new Chart(agingCanvas, {
      type: 'bar',
      data: {
        labels: ['Current', '30 days', '60 days', '90+ days'],
        datasets: [
          {
            label: 'Receivable',
            data: [aging.current || 0, aging.days_30 || 0, aging.days_60 || 0, aging.days_90_plus || 0],
            backgroundColor: blue + 'AA'
          },
          {
            label: 'Payable',
            data: [payAging.current || 0, payAging.days_30 || 0, payAging.days_60 || 0, payAging.days_90_plus || 0],
            backgroundColor: orange + 'AA'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
          title: { display: true, text: 'Receivable & Payable Aging', font: { size: 13 }, color: '#888' }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(val) { return '$' + (val >= 1000 ? Math.round(val / 1000) + 'K' : val); }
            }
          }
        }
      }
    });
  },

  _renderFinancialAdvisory: function(d, container) {
    if (!container) return;
    var s = d.summary;
    var items = [];

    if (s.profit_margin < 15) {
      items.push({ icon: '&#9888;', text: 'Profit margin is ' + s.profit_margin + '% \u2014 consider reviewing pricing or reducing costs to improve margins.' });
    } else if (s.profit_margin >= 25) {
      items.push({ icon: '&#9989;', text: 'Healthy profit margin at ' + s.profit_margin + '%. Revenue and expenses are well balanced.' });
    }

    if (s.overdue_receivable > 0) {
      items.push({ icon: '&#128176;', text: 'You have $' + this._formatNum(s.overdue_receivable) + ' in overdue receivables. Consider following up on outstanding invoices.' });
    }

    if (s.cash_balance > 0 && s.total_expenses > 0) {
      var monthsRunway = Math.round(s.cash_balance / (s.total_expenses / Math.max(1, (d.trend || []).length)));
      if (monthsRunway < 3) {
        items.push({ icon: '&#9888;', text: 'Cash runway at current expense rate: approximately ' + monthsRunway + ' months. Monitor closely.' });
      } else {
        items.push({ icon: '&#9989;', text: 'Cash runway at current expense rate: approximately ' + monthsRunway + ' months.' });
      }
    }

    var trend = d.trend || [];
    if (trend.length >= 3) {
      var recent = trend.slice(-3);
      var prevRev = recent[0].revenue;
      var latestRev = recent[recent.length - 1].revenue;
      if (prevRev > 0) {
        var revChange = Math.round(((latestRev - prevRev) / prevRev) * 100);
        var prevExp = recent[0].expenses;
        var latestExp = recent[recent.length - 1].expenses;
        var expChange = prevExp > 0 ? Math.round(((latestExp - prevExp) / prevExp) * 100) : 0;
        if (revChange > 0 && expChange > revChange) {
          items.push({ icon: '&#9888;', text: 'Revenue is up ' + revChange + '% but expenses grew ' + expChange + '% \u2014 margin compression risk.' });
        } else if (revChange > 5) {
          items.push({ icon: '&#128200;', text: 'Revenue trending up ' + revChange + '% over the last 3 months.' });
        } else if (revChange < -5) {
          items.push({ icon: '&#128201;', text: 'Revenue trending down ' + Math.abs(revChange) + '% over the last 3 months. Review sales pipeline.' });
        }
      }
    }

    if (items.length === 0) {
      items.push({ icon: '&#128161;', text: 'Financial data loaded successfully. More insights will appear as data accumulates.' });
    }

    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="bi-advisory-item">';
      html += '<span class="bi-advisory-icon">' + items[i].icon + '</span>';
      html += '<span class="bi-advisory-text">' + escHtml(items[i].text) + '</span>';
      html += '<div class="bi-advisory-actions">';
      html += '<button class="bi-ask-btn" data-module="financial" data-insight-idx="' + i + '">Ask about this</button>';
      html += '</div>';
      html += '</div>';
    }
    container.innerHTML = html;

    var self = this;
    container.querySelectorAll('.bi-ask-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._openChat(btn.getAttribute('data-insight-idx'), 'financial');
      });
    });
  },

  _fetchCustomerData: async function() {
    try {
      var sb = this._supabase;
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session && session.data.session.access_token;
      if (!token) return;

      var resp = await fetch('/api/bi-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({})
      });
      if (!resp.ok) { console.error('[BI] Customer fetch failed:', resp.status); return; }
      var json = await resp.json();
      if (json.success) this._customerData = json;
    } catch (err) {
      console.error('[BI] Customer fetch error:', err.message || err);
    }
  },

  _renderCustomerModule: function() {
    var kpisEl = document.getElementById('bi-mod-customers-kpis');
    var chartArea = document.getElementById('bi-mod-customers-chart');
    var advisoryList = document.getElementById('bi-mod-customers-advisory-list');
    var updatedEl = document.getElementById('bi-mod-customers-updated');

    if (!this._customerData || !this._customerData.connected) {
      if (kpisEl) kpisEl.innerHTML = '';
      if (chartArea) chartArea.style.display = 'none';
      var advisorySection = document.getElementById('bi-mod-customers-advisory');
      if (advisorySection) {
        advisorySection.innerHTML = '<div class="bi-module-prompt">' +
          '<div class="bi-module-prompt-icon">&#128101;</div>' +
          '<h3>Customer Analysis</h3>' +
          '<p>Connect your accounting software to analyse your customer base, revenue concentration, and quote conversion rates.</p>' +
          '</div>';
      }
      return;
    }

    var d = this._customerData.data;
    var s = d.summary;

    if (updatedEl) {
      var now = new Date();
      var h = now.getHours(); var m = now.getMinutes();
      var ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      updatedEl.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    this._renderCustomerKPIs(s, kpisEl);
    this._renderCustomerCharts(d, chartArea);
    this._renderCustomerAdvisory(d, advisoryList);
  },

  _renderCustomerKPIs: function(s, container) {
    if (!container) return;
    var concRisk = s.concentration_pct >= 60 ? 'red' : s.concentration_pct >= 40 ? 'orange' : 'green';
    var convColour = s.conversion_rate >= 45 ? 'green' : s.conversion_rate >= 25 ? 'orange' : 'red';

    var kpis = [
      { value: '' + s.total_customers, label: 'Total Customers', colour: '', trend: 'flat', trendText: '$' + this._formatNum(s.total_revenue) + ' total revenue' },
      { value: '$' + this._formatNum(s.avg_invoice_value), label: 'Avg Invoice Value', colour: 'orange', trend: 'flat', trendText: '' },
      { value: s.concentration_pct + '%', label: 'Top 3 Concentration', colour: concRisk, trend: concRisk === 'red' ? 'down' : 'up', trendText: concRisk === 'red' ? 'High risk' : concRisk === 'orange' ? 'Moderate' : 'Healthy' },
      { value: s.conversion_rate + '%', label: 'Quote Conversion', colour: convColour, trend: s.conversion_rate >= 45 ? 'up' : 'down', trendText: s.accepted_quotes + ' of ' + s.quote_count + ' quotes' }
    ];

    var html = '';
    for (var i = 0; i < kpis.length; i++) {
      var k = kpis[i];
      var colClass = k.colour ? ' ' + k.colour : '';
      var trendClass = k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : 'flat';
      var arrow = k.trend === 'up' ? '&#9650;' : k.trend === 'down' ? '&#9660;' : '&#8212;';
      html += '<div class="bi-kpi-card' + colClass + '">';
      html += '<div class="bi-kpi-value">' + escHtml(k.value) + '</div>';
      html += '<div class="bi-kpi-label">' + escHtml(k.label) + '</div>';
      if (k.trendText) {
        html += '<div class="bi-kpi-trend ' + trendClass + '">' + arrow + ' ' + escHtml(k.trendText) + '</div>';
      }
      html += '</div>';
    }
    container.innerHTML = html;
  },

  _renderCustomerCharts: function(d, chartArea) {
    if (!chartArea) return;
    chartArea.style.display = 'block';

    if (this._charts.customers) { this._charts.customers.destroy(); this._charts.customers = null; }
    if (this._charts.customersNvR) { this._charts.customersNvR.destroy(); this._charts.customersNvR = null; }

    var topCanvas = document.getElementById('bi-chart-customers');
    if (!topCanvas) return;

    var top = d.top_customers || [];
    var nvr = d.new_vs_repeat || [];

    if (top.length === 0 && nvr.length === 0) {
      chartArea.innerHTML = '<div class="bi-module-loading">No customer data available yet.</div>';
      return;
    }

    var nvrCanvas = document.createElement('canvas');
    nvrCanvas.id = 'bi-chart-customers-nvr';
    chartArea.innerHTML = '';
    chartArea.appendChild(topCanvas);
    chartArea.appendChild(nvrCanvas);

    var rootStyle = getComputedStyle(document.documentElement);
    var blue = rootStyle.getPropertyValue('--blue').trim() || '#4A6D8C';
    var orange = rootStyle.getPropertyValue('--orange').trim() || '#c4622a';
    var green = rootStyle.getPropertyValue('--green').trim() || '#28a745';

    if (top.length > 0) {
      this._charts.customers = new Chart(topCanvas, {
        type: 'bar',
        data: {
          labels: top.map(function(c) { return c.name.length > 20 ? c.name.substring(0, 18) + '\u2026' : c.name; }),
          datasets: [{
            label: 'Revenue',
            data: top.map(function(c) { return c.revenue; }),
            backgroundColor: blue + 'CC'
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Top Customers by Revenue', font: { size: 13 }, color: '#888' }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { callback: function(val) { return '$' + (val >= 1000 ? Math.round(val / 1000) + 'K' : val); } }
            }
          }
        }
      });
    }

    if (nvr.length > 0) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      this._charts.customersNvR = new Chart(nvrCanvas, {
        type: 'bar',
        data: {
          labels: nvr.map(function(r) {
            var parts = r.month.split('-');
            return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0].substring(2);
          }),
          datasets: [
            { label: 'New Customers', data: nvr.map(function(r) { return r.new_customers; }), backgroundColor: green + 'AA' },
            { label: 'Repeat Customers', data: nvr.map(function(r) { return r.repeat_customers; }), backgroundColor: blue + 'AA' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
            title: { display: true, text: 'New vs Repeat Customers', font: { size: 13 }, color: '#888' }
          },
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
          }
        }
      });
    }
  },

  _renderCustomerAdvisory: function(d, container) {
    if (!container) return;
    var s = d.summary;
    var items = [];

    if (s.concentration_pct >= 50) {
      items.push({ icon: '&#9888;', text: s.concentration_pct + '% of revenue comes from your top 3 customers \u2014 high concentration risk. Consider diversifying your customer base.' });
    } else if (s.concentration_pct > 0) {
      items.push({ icon: '&#9989;', text: 'Customer concentration at ' + s.concentration_pct + '% across your top 3 \u2014 reasonably diversified.' });
    }

    if (s.conversion_rate > 0 && s.conversion_rate < 35) {
      items.push({ icon: '&#128200;', text: 'Quote conversion rate is ' + s.conversion_rate + '%. Industry benchmark is approximately 45% \u2014 review your quoting process.' });
    } else if (s.conversion_rate >= 45) {
      items.push({ icon: '&#9989;', text: 'Strong quote conversion at ' + s.conversion_rate + '% \u2014 above the typical 45% benchmark.' });
    }

    if (s.avg_invoice_value > 0) {
      items.push({ icon: '&#128176;', text: 'Average invoice value is $' + this._formatNum(s.avg_invoice_value) + ' across ' + s.total_customers + ' customers.' });
    }

    var inactive = d.inactive_customers || [];
    if (inactive.length > 0) {
      var topInactive = inactive.slice(0, 3).map(function(c) { return c.name; }).join(', ');
      items.push({ icon: '&#9888;', text: inactive.length + ' customer' + (inactive.length > 1 ? 's haven\'t' : ' hasn\'t') + ' placed an order in 60+ days: ' + topInactive + '.' });
    }

    if (items.length === 0) {
      items.push({ icon: '&#128161;', text: 'Customer data loaded. More insights will appear as invoice history grows.' });
    }

    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="bi-advisory-item">';
      html += '<span class="bi-advisory-icon">' + items[i].icon + '</span>';
      html += '<span class="bi-advisory-text">' + escHtml(items[i].text) + '</span>';
      html += '<div class="bi-advisory-actions">';
      html += '<button class="bi-ask-btn" data-module="customers" data-insight-idx="' + i + '">Ask about this</button>';
      html += '</div></div>';
    }
    container.innerHTML = html;

    var self = this;
    container.querySelectorAll('.bi-ask-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._openChat(btn.getAttribute('data-insight-idx'), 'customers');
      });
    });
  },

  _fetchOperationsData: async function() {
    try {
      var sb = this._supabase;
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session && session.data.session.access_token;
      if (!token) return;

      var resp = await fetch('/api/bi-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({})
      });
      if (!resp.ok) { console.error('[BI] Operations fetch failed:', resp.status); return; }
      var json = await resp.json();
      if (json.success) this._operationsData = json;
    } catch (err) {
      console.error('[BI] Operations fetch error:', err.message || err);
    }
  },

  _renderOperationsModule: function() {
    var kpisEl = document.getElementById('bi-mod-operations-kpis');
    var chartArea = document.getElementById('bi-mod-operations-chart');
    var advisoryList = document.getElementById('bi-mod-operations-advisory-list');
    var updatedEl = document.getElementById('bi-mod-operations-updated');

    if (!this._operationsData || !this._operationsData.connected) {
      if (kpisEl) kpisEl.innerHTML = '';
      if (chartArea) chartArea.style.display = 'none';
      var advisorySection = document.getElementById('bi-mod-operations-advisory');
      if (advisorySection) {
        advisorySection.innerHTML = '<div class="bi-module-prompt">' +
          '<div class="bi-module-prompt-icon">&#9881;</div>' +
          '<h3>Operational Insights</h3>' +
          '<p>Connect your job management system (ServiceM8, Buildxact, Fergus, or Tradify) to see operational insights, job profitability, and efficiency metrics.</p>' +
          '</div>';
      }
      return;
    }

    var d = this._operationsData.data;
    var s = d.summary;

    if (updatedEl) {
      var now = new Date();
      var h = now.getHours(); var m = now.getMinutes();
      var ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      updatedEl.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    this._renderOpsKPIs(s, kpisEl);
    this._renderOpsCharts(d, chartArea);
    this._renderOpsAdvisory(d, advisoryList);
  },

  _renderOpsKPIs: function(s, container) {
    if (!container) return;
    var formColour = s.form_completion_rate >= 90 ? 'green' : s.form_completion_rate >= 70 ? 'orange' : 'red';

    var kpis = [
      { value: '' + s.total_jobs, label: 'Total Jobs', colour: '', trend: 'flat', trendText: s.completed_jobs + ' completed' },
      { value: '$' + this._formatNum(s.avg_job_value), label: 'Avg Job Value', colour: 'orange', trend: 'flat', trendText: '' },
      { value: s.avg_duration_days + 'd', label: 'Avg Duration', colour: 'purple', trend: 'flat', trendText: '' },
      { value: s.form_completion_rate + '%', label: 'Form Completion', colour: formColour, trend: s.form_completion_rate >= 80 ? 'up' : 'down', trendText: s.total_forms + ' forms' }
    ];

    var html = '';
    for (var i = 0; i < kpis.length; i++) {
      var k = kpis[i];
      var colClass = k.colour ? ' ' + k.colour : '';
      var trendClass = k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : 'flat';
      var arrow = k.trend === 'up' ? '&#9650;' : k.trend === 'down' ? '&#9660;' : '&#8212;';
      html += '<div class="bi-kpi-card' + colClass + '">';
      html += '<div class="bi-kpi-value">' + escHtml(k.value) + '</div>';
      html += '<div class="bi-kpi-label">' + escHtml(k.label) + '</div>';
      if (k.trendText) {
        html += '<div class="bi-kpi-trend ' + trendClass + '">' + arrow + ' ' + escHtml(k.trendText) + '</div>';
      }
      html += '</div>';
    }
    container.innerHTML = html;
  },

  _renderOpsCharts: function(d, chartArea) {
    if (!chartArea) return;
    chartArea.style.display = 'block';

    if (this._charts.opsStatus) { this._charts.opsStatus.destroy(); this._charts.opsStatus = null; }
    if (this._charts.opsMonthly) { this._charts.opsMonthly.destroy(); this._charts.opsMonthly = null; }

    var statusCanvas = document.getElementById('bi-chart-operations');
    if (!statusCanvas) return;

    var statuses = d.status_breakdown || {};
    var monthly = d.monthly_jobs || [];
    var statusKeys = Object.keys(statuses);

    if (statusKeys.length === 0 && monthly.length === 0) {
      chartArea.innerHTML = '<div class="bi-module-loading">No operations data available yet.</div>';
      return;
    }

    var monthlyCanvas = document.createElement('canvas');
    monthlyCanvas.id = 'bi-chart-ops-monthly';
    chartArea.innerHTML = '';
    chartArea.appendChild(statusCanvas);
    chartArea.appendChild(monthlyCanvas);

    var rootStyle = getComputedStyle(document.documentElement);
    var blue = rootStyle.getPropertyValue('--blue').trim() || '#4A6D8C';
    var orange = rootStyle.getPropertyValue('--orange').trim() || '#c4622a';
    var green = rootStyle.getPropertyValue('--green').trim() || '#28a745';
    var grey = rootStyle.getPropertyValue('--grey').trim() || '#6c757d';
    var purple = rootStyle.getPropertyValue('--purple').trim() || '#7B5EA7';

    if (statusKeys.length > 0) {
      var statusColours = [blue, green, orange, purple, grey, '#0097A7', '#dc3545'];
      this._charts.opsStatus = new Chart(statusCanvas, {
        type: 'doughnut',
        data: {
          labels: statusKeys,
          datasets: [{
            data: statusKeys.map(function(k) { return statuses[k]; }),
            backgroundColor: statusKeys.map(function(k, i) { return statusColours[i % statusColours.length]; })
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } },
            title: { display: true, text: 'Jobs by Status', font: { size: 13 }, color: '#888' }
          }
        }
      });
    }

    if (monthly.length > 0) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      this._charts.opsMonthly = new Chart(monthlyCanvas, {
        type: 'bar',
        data: {
          labels: monthly.map(function(m) {
            var parts = m.month.split('-');
            return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0].substring(2);
          }),
          datasets: [{
            label: 'Jobs',
            data: monthly.map(function(m) { return m.count; }),
            backgroundColor: blue + 'AA'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Jobs by Month', font: { size: 13 }, color: '#888' }
          },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  },

  _renderOpsAdvisory: function(d, container) {
    if (!container) return;
    var s = d.summary;
    var items = [];

    var totalQuoted = s.over_quote_count + s.under_quote_count + s.on_quote_count;
    if (totalQuoted > 0 && s.over_quote_count > 0) {
      var overPct = Math.round((s.over_quote_count / totalQuoted) * 100);
      items.push({ icon: '&#9888;', text: overPct + '% of jobs ran over quoted price (' + s.over_quote_count + ' of ' + totalQuoted + ') \u2014 review your estimation process.' });
    }

    if (s.avg_duration_days > 0) {
      items.push({ icon: '&#128197;', text: 'Average job duration is ' + s.avg_duration_days + ' days across ' + s.completed_jobs + ' completed jobs.' });
    }

    if (s.form_completion_rate < 80 && s.total_jobs > 0) {
      items.push({ icon: '&#9888;', text: 'Forms completed on ' + s.form_completion_rate + '% of jobs \u2014 compliance gap identified.' });
    } else if (s.form_completion_rate >= 90) {
      items.push({ icon: '&#9989;', text: 'Strong form compliance at ' + s.form_completion_rate + '% across all jobs.' });
    }

    if (s.avg_job_value > 0) {
      items.push({ icon: '&#128176;', text: 'Average job value is $' + this._formatNum(s.avg_job_value) + '.' });
    }

    if (items.length === 0) {
      items.push({ icon: '&#128161;', text: 'Operations data loaded. More insights will appear as job history grows.' });
    }

    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="bi-advisory-item">';
      html += '<span class="bi-advisory-icon">' + items[i].icon + '</span>';
      html += '<span class="bi-advisory-text">' + escHtml(items[i].text) + '</span>';
      html += '<div class="bi-advisory-actions">';
      html += '<button class="bi-ask-btn" data-module="operations" data-insight-idx="' + i + '">Ask about this</button>';
      html += '</div></div>';
    }
    container.innerHTML = html;

    var self = this;
    container.querySelectorAll('.bi-ask-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._openChat(btn.getAttribute('data-insight-idx'), 'operations');
      });
    });
  },

  _fetchMarketData: async function() {
    try {
      var sb = this._supabase;
      var userId = this._user.id;
      var briefings = await sb.from('news_digest_briefings').select('id, title, summary, category, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
      var tenders = await sb.from('news_digest_tenders').select('id, title, location, close_date, value_text').eq('user_id', userId).order('close_date', { ascending: true }).limit(5);
      var hasID = false;
      var toolCheck = await sb.from('profiles').select('activated_tools').eq('id', userId).single();
      if (toolCheck.data && Array.isArray(toolCheck.data.activated_tools)) {
        hasID = toolCheck.data.activated_tools.indexOf('news-digest') !== -1;
      }
      this._marketData = {
        briefings: (briefings.data || []),
        tenders: (tenders.data || []),
        hasNewsDigest: hasID
      };
    } catch (err) {
      console.error('[BI] Market fetch error:', err.message || err);
    }
  },

  _renderMarketModule: function() {
    var kpisEl = document.getElementById('bi-mod-market-kpis');
    var chartArea = document.getElementById('bi-mod-market-chart');
    var advisoryList = document.getElementById('bi-mod-market-advisory-list');
    var updatedEl = document.getElementById('bi-mod-market-updated');

    if (!this._marketData) {
      this._renderModulePrompt('market', kpisEl, document.getElementById('bi-mod-market-advisory'));
      return;
    }

    var md = this._marketData;
    var briefings = md.briefings || [];
    var tenders = md.tenders || [];

    if (updatedEl) {
      var now = new Date();
      var h = now.getHours(); var m = now.getMinutes();
      var ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      updatedEl.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    if (kpisEl) {
      var kpis = [
        { value: '' + briefings.length, label: 'Recent Headlines', colour: '' },
        { value: '' + tenders.length, label: 'Open Tenders', colour: 'orange' }
      ];
      var html = '';
      for (var i = 0; i < kpis.length; i++) {
        var colClass = kpis[i].colour ? ' ' + kpis[i].colour : '';
        html += '<div class="bi-kpi-card' + colClass + '">';
        html += '<div class="bi-kpi-value">' + escHtml(kpis[i].value) + '</div>';
        html += '<div class="bi-kpi-label">' + escHtml(kpis[i].label) + '</div>';
        html += '</div>';
      }
      kpisEl.innerHTML = html;
    }

    if (chartArea) chartArea.style.display = 'none';

    if (advisoryList) {
      var items = [];

      for (var b = 0; b < Math.min(briefings.length, 3); b++) {
        var br = briefings[b];
        items.push({ icon: '&#128240;', text: escHtml(br.title || 'Industry update') + (br.summary ? ' \u2014 ' + escHtml(br.summary.substring(0, 120)) : '') });
      }

      var today = new Date().toISOString().split('T')[0];
      var closingSoon = tenders.filter(function(t) { return t.close_date && t.close_date >= today; }).slice(0, 2);
      for (var t = 0; t < closingSoon.length; t++) {
        var tn = closingSoon[t];
        items.push({ icon: '&#128203;', text: 'Tender: ' + escHtml(tn.title || 'Opportunity') + (tn.location ? ' in ' + escHtml(tn.location) : '') + (tn.close_date ? ' \u2014 closes ' + escHtml(tn.close_date) : '') });
      }

      if (items.length === 0) {
        items.push({ icon: '&#127758;', text: 'No recent market intelligence available. ' + (md.hasNewsDigest ? 'Check Industry News for full briefings.' : 'Activate Industry News & Updates for market insights.') });
      }

      var upsellHtml = '';
      if (!md.hasNewsDigest) {
        upsellHtml = '<div class="bi-upsell-box">This is a summary view. Activate Industry News &amp; Updates for full briefings, email scanning, supplier monitoring, and personalised industry intelligence.</div>';
      } else {
        upsellHtml = '<div class="bi-upsell-box">Powered by Industry News &amp; Updates \u2014 <a href="/news-digest.html">open full tool</a></div>';
      }

      var html = '';
      for (var a = 0; a < items.length; a++) {
        html += '<div class="bi-advisory-item">';
        html += '<span class="bi-advisory-icon">' + items[a].icon + '</span>';
        html += '<span class="bi-advisory-text">' + items[a].text + '</span>';
        html += '</div>';
      }
      html += upsellHtml;
      advisoryList.innerHTML = html;
    }
  },

  _fetchStrategicData: async function() {
    try {
      var sb = this._supabase;
      var userId = this._user.id;

      var planRes = await sb.from('strategic_plans').select('id, swot_data, cycle_end_date, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
      var plan = (planRes.data && planRes.data.length > 0) ? planRes.data[0] : null;

      var tasks = [];
      if (plan) {
        var taskRes = await sb.from('action_tracker').select('id, items, month_group, is_carried_forward').eq('user_id', userId).eq('plan_id', plan.id);
        tasks = (taskRes.data || []).map(function(row) {
          var it = row.items || {};
          return {
            id: row.id,
            title: it.title || '',
            due_date: it.due_date || '',
            status: it.status || 'pending',
            priority: it.priority || 'Medium',
            month_group: row.month_group || 0
          };
        });
      }

      this._strategicData = { plan: plan, tasks: tasks };
    } catch (err) {
      console.error('[BI] Strategic fetch error:', err.message || err);
    }
  },

  _renderStrategicModule: function() {
    var kpisEl = document.getElementById('bi-mod-strategic-kpis');
    var chartArea = document.getElementById('bi-mod-strategic-chart');
    var advisoryList = document.getElementById('bi-mod-strategic-advisory-list');
    var updatedEl = document.getElementById('bi-mod-strategic-updated');

    if (!this._strategicData || !this._strategicData.plan) {
      if (kpisEl) kpisEl.innerHTML = '';
      if (chartArea) chartArea.style.display = 'none';
      var advisorySection = document.getElementById('bi-mod-strategic-advisory');
      if (advisorySection) {
        advisorySection.innerHTML = '<div class="bi-module-prompt">' +
          '<div class="bi-module-prompt-icon">&#127919;</div>' +
          '<h3>Strategic Alignment</h3>' +
          '<p>Create your Strategic Plan to track progress against your goals, monitor action items, and align operations with strategy.</p>' +
          '</div>';
      }
      return;
    }

    var plan = this._strategicData.plan;
    var tasks = this._strategicData.tasks;

    if (updatedEl) {
      var now = new Date();
      var h = now.getHours(); var m = now.getMinutes();
      var ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      updatedEl.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    var today = new Date().toISOString().split('T')[0];
    var total = tasks.length;
    var completed = tasks.filter(function(t) { return t.status === 'completed' || t.status === 'done'; }).length;
    var overdue = tasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'completed' && t.status !== 'done'; }).length;
    var progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    var cycleEnd = plan.cycle_end_date || '';
    var daysLeft = 0;
    if (cycleEnd) {
      daysLeft = Math.max(0, Math.ceil((new Date(cycleEnd) - new Date()) / 86400000));
    }

    if (kpisEl) {
      var kpis = [
        { value: progressPct + '%', label: '90-Day Progress', colour: progressPct >= 70 ? 'green' : progressPct >= 40 ? 'orange' : 'red', trend: progressPct >= 50 ? 'up' : 'down', trendText: completed + ' of ' + total + ' tasks' },
        { value: '' + overdue, label: 'Overdue Tasks', colour: overdue > 0 ? 'red' : 'green', trend: overdue > 0 ? 'down' : 'up', trendText: overdue > 0 ? 'Action needed' : 'On track' },
        { value: daysLeft + 'd', label: 'Cycle Remaining', colour: daysLeft <= 14 ? 'orange' : 'purple', trend: 'flat', trendText: cycleEnd ? 'Ends ' + cycleEnd : '' }
      ];

      var html = '';
      for (var i = 0; i < kpis.length; i++) {
        var k = kpis[i];
        var colClass = k.colour ? ' ' + k.colour : '';
        var trendClass = k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : 'flat';
        var arrow = k.trend === 'up' ? '&#9650;' : k.trend === 'down' ? '&#9660;' : '&#8212;';
        html += '<div class="bi-kpi-card' + colClass + '">';
        html += '<div class="bi-kpi-value">' + escHtml(k.value) + '</div>';
        html += '<div class="bi-kpi-label">' + escHtml(k.label) + '</div>';
        if (k.trendText) {
          html += '<div class="bi-kpi-trend ' + trendClass + '">' + arrow + ' ' + escHtml(k.trendText) + '</div>';
        }
        html += '</div>';
      }
      kpisEl.innerHTML = html;
    }

    if (chartArea) {
      chartArea.style.display = 'block';
      if (this._charts.strategicStatus) { this._charts.strategicStatus.destroy(); this._charts.strategicStatus = null; }

      var canvas = document.getElementById('bi-chart-strategic');
      if (canvas && total > 0) {
        chartArea.innerHTML = '';
        chartArea.appendChild(canvas);

        var statusCounts = {};
        tasks.forEach(function(t) {
          var s = t.status || 'pending';
          statusCounts[s] = (statusCounts[s] || 0) + 1;
        });

        var rootStyle = getComputedStyle(document.documentElement);
        var green = rootStyle.getPropertyValue('--green').trim() || '#28a745';
        var blue = rootStyle.getPropertyValue('--blue').trim() || '#4A6D8C';
        var orange = rootStyle.getPropertyValue('--orange').trim() || '#c4622a';
        var red = rootStyle.getPropertyValue('--red').trim() || '#dc3545';
        var grey = rootStyle.getPropertyValue('--grey').trim() || '#6c757d';

        var statusLabels = Object.keys(statusCounts);
        var colourMap = { completed: green, done: green, 'in-progress': blue, 'in_progress': blue, pending: orange, overdue: red };
        var statusColours = statusLabels.map(function(s) { return colourMap[s.toLowerCase()] || grey; });

        this._charts.strategicStatus = new Chart(canvas, {
          type: 'doughnut',
          data: {
            labels: statusLabels.map(function(s) { return s.charAt(0).toUpperCase() + s.slice(1); }),
            datasets: [{ data: statusLabels.map(function(s) { return statusCounts[s]; }), backgroundColor: statusColours }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } },
              title: { display: true, text: 'Tasks by Status', font: { size: 13 }, color: '#888' }
            }
          }
        });
      } else {
        chartArea.style.display = 'none';
      }
    }

    if (advisoryList) {
      var items = [];

      if (overdue > 0) {
        items.push({ icon: '&#9888;', text: overdue + ' of ' + total + ' strategic actions are overdue \u2014 review priorities with your team.' });
      }

      if (daysLeft > 0 && daysLeft <= 21) {
        items.push({ icon: '&#128197;', text: '90-day cycle ends in ' + daysLeft + ' days \u2014 schedule a strategic review session.' });
      }

      if (progressPct < 30 && total > 0) {
        items.push({ icon: '&#9888;', text: 'Only ' + progressPct + '% of actions completed \u2014 consider reprioritising or delegating.' });
      } else if (progressPct >= 75) {
        items.push({ icon: '&#9989;', text: 'Strong progress at ' + progressPct + '% \u2014 on track to meet your 90-day goals.' });
      }

      var swot = plan.swot_data;
      if (swot) {
        var weaknesses = (swot.weaknesses || swot.Weaknesses || []);
        if (weaknesses.length > 0) {
          items.push({ icon: '&#128161;', text: 'SWOT: ' + weaknesses.length + ' weakness' + (weaknesses.length > 1 ? 'es' : '') + ' identified \u2014 review against current progress.' });
        }
      }

      if (items.length === 0) {
        items.push({ icon: '&#127919;', text: 'Strategic plan active. Progress tracking is live.' });
      }

      var advHtml = '';
      for (var a = 0; a < items.length; a++) {
        advHtml += '<div class="bi-advisory-item">';
        advHtml += '<span class="bi-advisory-icon">' + items[a].icon + '</span>';
        advHtml += '<span class="bi-advisory-text">' + escHtml(items[a].text) + '</span>';
        advHtml += '<div class="bi-advisory-actions">';
        advHtml += '<button class="bi-ask-btn" data-module="strategic" data-insight-idx="' + a + '">Ask about this</button>';
        advHtml += '</div></div>';
      }
      advisoryList.innerHTML = advHtml;

      var self = this;
      advisoryList.querySelectorAll('.bi-ask-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          self._openChat(btn.getAttribute('data-insight-idx'), 'strategic');
        });
      });
    }
  },

  _formatNum: function(n) {
    if (n == null) return '0';
    n = Math.round(n);
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString();
    return '' + n;
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
