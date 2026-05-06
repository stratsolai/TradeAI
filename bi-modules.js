window.BI_MODULES = {

  _formatNum: function(n) {
    if (n == null) return '0';
    n = Math.round(n);
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString();
    return '' + n;
  },

  _setTimestamp: function(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    var now = new Date();
    var h = now.getHours(); var m = now.getMinutes();
    var ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    el.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  },

  _renderKPIRow: function(container, kpis) {
    if (!container) return;
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

  _renderAdvisoryList: function(container, items, mod) {
    if (!container) return;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="bi-advisory-item">';
      html += '<span class="bi-advisory-icon">' + items[i].icon + '</span>';
      html += '<span class="bi-advisory-text">' + escHtml(items[i].text) + '</span>';
      html += '<div class="bi-advisory-actions">';
      html += '<button class="btn-outline btn-sm bi-ask-btn" data-module="' + escHtml(mod) + '" data-insight-idx="' + i + '">Chat with AI</button>';
      html += '</div></div>';
    }
    container.innerHTML = html;
    container.querySelectorAll('.bi-ask-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BI_LOGIC._openChat(btn.getAttribute('data-insight-idx'), mod);
      });
    });
  },

  _getCSS: function() {
    var s = getComputedStyle(document.documentElement);
    return {
      blue: s.getPropertyValue('--blue').trim() || '#4A6D8C',
      orange: s.getPropertyValue('--orange').trim() || '#c4622a',
      green: s.getPropertyValue('--green').trim() || '#28a745',
      red: s.getPropertyValue('--red').trim() || '#dc3545',
      grey: s.getPropertyValue('--grey').trim() || '#6c757d',
      purple: s.getPropertyValue('--purple').trim() || '#7B5EA7',
      teal: s.getPropertyValue('--teal').trim() || '#0097A7',
      textMuted: s.getPropertyValue('--text-muted').trim() || '#888888'
    };
  },

  fetchFinancial: async function(sb, dateRange, forceRefresh) {
    var session = await sb.auth.getSession();
    var token = session.data && session.data.session && session.data.session.access_token;
    if (!token) return null;
    var body = dateRange ? { fromDate: dateRange.fromDate, toDate: dateRange.toDate } : {};
    if (forceRefresh) body.forceRefresh = true;
    var resp = await fetch('/api/bi-financial', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
    if (!resp.ok) return null;
    var json = await resp.json();
    return json.success ? json : null;
  },

  renderFinancial: function(data, charts) {
    var kpisEl = document.getElementById('bi-mod-financial-kpis');
    var chartArea = document.getElementById('bi-mod-financial-chart');
    var advisoryList = document.getElementById('bi-mod-financial-advisory-list');
    this._setTimestamp('bi-mod-financial-updated');

    if (!data || !data.connected) {
      if (kpisEl) kpisEl.innerHTML = '';
      if (chartArea) chartArea.style.display = 'none';
      var sec = document.getElementById('bi-mod-financial-advisory');
      if (sec) sec.innerHTML = '<div class="bi-module-prompt"><div class="bi-module-prompt-icon">&#128176;</div><h3>Financial Insights</h3><p>Connect your accounting software (Xero, QuickBooks, or MYOB) to see financial health insights, revenue trends, and cash flow analysis.</p></div>';
      return;
    }

    if (!advisoryList) {
      var secRestore = document.getElementById('bi-mod-financial-advisory');
      if (secRestore) {
        secRestore.innerHTML = '<div class="bi-advisory-label">AI Advisory</div><div id="bi-mod-financial-advisory-list"></div>';
        advisoryList = document.getElementById('bi-mod-financial-advisory-list');
      }
    }

    var d = data.data; var s = d.summary;
    var margin = s.profit_margin || 0;
    this._renderKPIRow(kpisEl, [
      { value: '$' + this._formatNum(s.total_revenue), label: 'Revenue', colour: '', trend: s.total_revenue > 0 ? 'up' : 'flat', trendText: s.invoice_count + ' invoices' },
      { value: '$' + this._formatNum(s.total_expenses), label: 'Expenses', colour: 'orange', trend: 'flat', trendText: s.bill_count + ' bills' },
      { value: margin + '%', label: 'Profit Margin', colour: margin >= 20 ? 'green' : margin >= 10 ? 'orange' : 'red', trend: margin >= 20 ? 'up' : margin >= 10 ? 'flat' : 'down', trendText: '$' + this._formatNum(s.net_profit) + ' net' },
      { value: '$' + this._formatNum(s.cash_balance), label: 'Cash Position', colour: s.cash_balance > 0 ? 'green' : 'red', trend: s.cash_balance > 0 ? 'up' : 'down', trendText: '' }
    ]);

    this._renderFinancialCharts(d, chartArea, charts);

    var items = [];
    if (s.profit_margin < 15) items.push({ icon: '&#9888;', text: 'Profit margin is ' + s.profit_margin + '% \u2014 consider reviewing pricing or reducing costs.' });
    else if (s.profit_margin >= 25) items.push({ icon: '&#9989;', text: 'Healthy profit margin at ' + s.profit_margin + '%.' });
    if (s.overdue_receivable > 0) items.push({ icon: '&#128176;', text: '$' + this._formatNum(s.overdue_receivable) + ' in overdue receivables. Follow up on outstanding invoices.' });
    if (s.cash_balance > 0 && s.total_expenses > 0) {
      var runway = Math.round(s.cash_balance / (s.total_expenses / Math.max(1, (d.trend || []).length)));
      items.push({ icon: runway < 3 ? '&#9888;' : '&#9989;', text: 'Cash runway: approximately ' + runway + ' months.' });
    }
    var trend = d.trend || [];
    if (trend.length >= 3) {
      var r0 = trend[trend.length - 3].revenue, r1 = trend[trend.length - 1].revenue;
      if (r0 > 0) {
        var rc = Math.round(((r1 - r0) / r0) * 100);
        var e0 = trend[trend.length - 3].expenses, e1 = trend[trend.length - 1].expenses;
        var ec = e0 > 0 ? Math.round(((e1 - e0) / e0) * 100) : 0;
        if (rc > 0 && ec > rc) items.push({ icon: '&#9888;', text: 'Revenue up ' + rc + '% but expenses grew ' + ec + '% \u2014 margin compression risk.' });
        else if (rc > 5) items.push({ icon: '&#128200;', text: 'Revenue trending up ' + rc + '% over 3 months.' });
        else if (rc < -5) items.push({ icon: '&#128201;', text: 'Revenue down ' + Math.abs(rc) + '% over 3 months.' });
      }
    }
    if (items.length === 0) items.push({ icon: '&#128161;', text: 'Financial data loaded. More insights as data accumulates.' });
    this._renderAdvisoryList(advisoryList, items, 'financial');
  },

  _renderFinancialCharts: function(d, chartArea, charts) {
    if (!chartArea) return;
    chartArea.style.display = 'block';
    if (charts.financial) { charts.financial.destroy(); charts.financial = null; }
    if (charts.financialAging) { charts.financialAging.destroy(); charts.financialAging = null; }
    var canvas = document.getElementById('bi-chart-financial');
    var trend = d.trend || [];
    if (!canvas || trend.length === 0) { chartArea.innerHTML = '<div class="bi-module-loading">No trend data yet.</div>'; return; }
    var agingCanvas = document.createElement('canvas');
    chartArea.innerHTML = ''; chartArea.appendChild(canvas); chartArea.appendChild(agingCanvas);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var labels = trend.map(function(t) { var p = t.month.split('-'); return months[parseInt(p[1],10)-1] + ' ' + p[0].substring(2); });
    var c = this._getCSS();
    charts.financial = new Chart(canvas, { type: 'line', data: { labels: labels, datasets: [
      { label: 'Revenue', data: trend.map(function(t){return t.revenue;}), borderColor: c.blue, backgroundColor: c.blue+'20', fill: false, tension: 0.3, pointRadius: 3 },
      { label: 'Expenses', data: trend.map(function(t){return t.expenses;}), borderColor: c.orange, backgroundColor: c.orange+'20', fill: false, tension: 0.3, pointRadius: 3 },
      { label: 'Profit', data: trend.map(function(t){return t.profit;}), borderColor: c.green, backgroundColor: c.green+'15', fill: true, tension: 0.3, pointRadius: 3 }
    ]}, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } } }, scales: { y: { beginAtZero: true, ticks: { callback: function(v){return '$'+(v>=1000?Math.round(v/1000)+'K':v);} } } } } });
    var ag = d.receivable_aging||{}, pa = d.payable_aging||{};
    charts.financialAging = new Chart(agingCanvas, { type: 'bar', data: { labels: ['Current','30 days','60 days','90+ days'], datasets: [
      { label: 'Receivable', data: [ag.current||0,ag.days_30||0,ag.days_60||0,ag.days_90_plus||0], backgroundColor: c.blue+'AA' },
      { label: 'Payable', data: [pa.current||0,pa.days_30||0,pa.days_60||0,pa.days_90_plus||0], backgroundColor: c.orange+'AA' }
    ]}, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } }, title: { display: true, text: 'Receivable & Payable Aging', font: { size: 13 }, color: c.textMuted } }, scales: { y: { beginAtZero: true, ticks: { callback: function(v){return '$'+(v>=1000?Math.round(v/1000)+'K':v);} } } } } });
  },

  fetchCustomers: async function(sb, dateRange, forceRefresh) {
    var session = await sb.auth.getSession();
    var token = session.data && session.data.session && session.data.session.access_token;
    if (!token) return null;
    var body = dateRange ? { fromDate: dateRange.fromDate, toDate: dateRange.toDate } : {};
    if (forceRefresh) body.forceRefresh = true;
    var resp = await fetch('/api/bi-customers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
    if (!resp.ok) return null;
    var json = await resp.json();
    return json.success ? json : null;
  },

  renderCustomers: function(data, charts) {
    var kpisEl = document.getElementById('bi-mod-customers-kpis');
    var chartArea = document.getElementById('bi-mod-customers-chart');
    var advisoryList = document.getElementById('bi-mod-customers-advisory-list');
    this._setTimestamp('bi-mod-customers-updated');

    if (!data || !data.connected) {
      if (kpisEl) kpisEl.innerHTML = '';
      if (chartArea) chartArea.style.display = 'none';
      var sec = document.getElementById('bi-mod-customers-advisory');
      if (sec) sec.innerHTML = '<div class="bi-module-prompt"><div class="bi-module-prompt-icon">&#128101;</div><h3>Customer Analysis</h3><p>Connect your accounting software to analyse your customer base, revenue concentration, and quote conversion rates.</p></div>';
      return;
    }

    if (!advisoryList) {
      var secRestore = document.getElementById('bi-mod-customers-advisory');
      if (secRestore) {
        secRestore.innerHTML = '<div class="bi-advisory-label">AI Advisory</div><div id="bi-mod-customers-advisory-list"></div>';
        advisoryList = document.getElementById('bi-mod-customers-advisory-list');
      }
    }

    var d = data.data; var s = d.summary;
    var cr = s.concentration_pct >= 60 ? 'red' : s.concentration_pct >= 40 ? 'orange' : 'green';
    var cv = s.conversion_rate >= 45 ? 'green' : s.conversion_rate >= 25 ? 'orange' : 'red';
    this._renderKPIRow(kpisEl, [
      { value: ''+s.total_customers, label: 'Total Customers', colour: '', trend: 'flat', trendText: '$'+this._formatNum(s.total_revenue)+' revenue' },
      { value: '$'+this._formatNum(s.avg_invoice_value), label: 'Avg Invoice Value', colour: 'orange', trend: 'flat', trendText: '' },
      { value: s.concentration_pct+'%', label: 'Top 3 Concentration', colour: cr, trend: cr==='red'?'down':'up', trendText: cr==='red'?'High risk':cr==='orange'?'Moderate':'Healthy' },
      { value: s.conversion_rate+'%', label: 'Quote Conversion', colour: cv, trend: s.conversion_rate>=45?'up':'down', trendText: s.accepted_quotes+' of '+s.quote_count+' quotes' }
    ]);

    this._renderCustomerCharts(d, chartArea, charts);

    var items = [];
    if (s.concentration_pct >= 50) items.push({ icon: '&#9888;', text: s.concentration_pct+'% of revenue from top 3 customers \u2014 high concentration risk.' });
    else if (s.concentration_pct > 0) items.push({ icon: '&#9989;', text: 'Customer concentration at '+s.concentration_pct+'% \u2014 reasonably diversified.' });
    if (s.conversion_rate > 0 && s.conversion_rate < 35) items.push({ icon: '&#128200;', text: 'Quote conversion '+s.conversion_rate+'%. Benchmark is ~45%.' });
    else if (s.conversion_rate >= 45) items.push({ icon: '&#9989;', text: 'Strong conversion at '+s.conversion_rate+'%.' });
    if (s.avg_invoice_value > 0) items.push({ icon: '&#128176;', text: 'Average invoice $'+this._formatNum(s.avg_invoice_value)+' across '+s.total_customers+' customers.' });
    var inactive = d.inactive_customers || [];
    if (inactive.length > 0) items.push({ icon: '&#9888;', text: inactive.length+' customer'+(inactive.length>1?'s':'')+' inactive 60+ days: '+inactive.slice(0,3).map(function(c){return c.name;}).join(', ')+'.' });
    if (items.length === 0) items.push({ icon: '&#128161;', text: 'Customer data loaded.' });
    this._renderAdvisoryList(advisoryList, items, 'customers');
  },

  _renderCustomerCharts: function(d, chartArea, charts) {
    if (!chartArea) return;
    chartArea.style.display = 'block';
    if (charts.customers) { charts.customers.destroy(); charts.customers = null; }
    if (charts.customersNvR) { charts.customersNvR.destroy(); charts.customersNvR = null; }
    var topCanvas = document.getElementById('bi-chart-customers');
    if (!topCanvas) return;
    var top = d.top_customers||[], nvr = d.new_vs_repeat||[];
    if (top.length === 0 && nvr.length === 0) { chartArea.innerHTML = '<div class="bi-module-loading">No customer data yet.</div>'; return; }
    var nvrCanvas = document.createElement('canvas');
    chartArea.innerHTML = ''; chartArea.appendChild(topCanvas); chartArea.appendChild(nvrCanvas);
    var c = this._getCSS();
    if (top.length > 0) {
      charts.customers = new Chart(topCanvas, { type: 'bar', data: { labels: top.map(function(x){return x.name.length>20?x.name.substring(0,18)+'\u2026':x.name;}), datasets: [{ label: 'Revenue', data: top.map(function(x){return x.revenue;}), backgroundColor: c.blue+'CC' }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, title: { display: true, text: 'Top Customers by Revenue', font: { size: 13 }, color: c.textMuted } }, scales: { x: { beginAtZero: true, ticks: { callback: function(v){return '$'+(v>=1000?Math.round(v/1000)+'K':v);} } } } } });
    }
    if (nvr.length > 0) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      charts.customersNvR = new Chart(nvrCanvas, { type: 'bar', data: { labels: nvr.map(function(r){var p=r.month.split('-');return months[parseInt(p[1],10)-1]+' '+p[0].substring(2);}), datasets: [ { label: 'New', data: nvr.map(function(r){return r.new_customers;}), backgroundColor: c.green+'AA' }, { label: 'Repeat', data: nvr.map(function(r){return r.repeat_customers;}), backgroundColor: c.blue+'AA' } ] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } }, title: { display: true, text: 'New vs Repeat Customers', font: { size: 13 }, color: c.textMuted } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } });
    }
  },

  fetchOperations: async function(sb, dateRange, forceRefresh) {
    var session = await sb.auth.getSession();
    var token = session.data && session.data.session && session.data.session.access_token;
    if (!token) return null;
    var body = dateRange ? { fromDate: dateRange.fromDate, toDate: dateRange.toDate } : {};
    if (forceRefresh) body.forceRefresh = true;
    var resp = await fetch('/api/bi-operations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
    if (!resp.ok) return null;
    var json = await resp.json();
    return json.success ? json : null;
  },

  renderOperations: function(data, charts) {
    var kpisEl = document.getElementById('bi-mod-operations-kpis');
    var chartArea = document.getElementById('bi-mod-operations-chart');
    var advisoryList = document.getElementById('bi-mod-operations-advisory-list');
    this._setTimestamp('bi-mod-operations-updated');

    if (!data || !data.connected) {
      if (kpisEl) kpisEl.innerHTML = '';
      if (chartArea) chartArea.style.display = 'none';
      var sec = document.getElementById('bi-mod-operations-advisory');
      if (sec) sec.innerHTML = '<div class="bi-module-prompt"><div class="bi-module-prompt-icon">&#9881;</div><h3>Operational Performance</h3><p>Connect your accounting software (Xero, QuickBooks, or MYOB) to see expense and cost analysis \u2014 spend by category, supplier concentration, labour cost ratio, and overhead trends.</p></div>';
      return;
    }

    if (!advisoryList) {
      var secRestore = document.getElementById('bi-mod-operations-advisory');
      if (secRestore) {
        secRestore.innerHTML = '<div class="bi-advisory-label">AI Advisory</div><div id="bi-mod-operations-advisory-list"></div>';
        advisoryList = document.getElementById('bi-mod-operations-advisory-list');
      }
    }

    var d = data.data; var s = d.summary;
    var supplierColour = s.supplier_concentration_pct >= 60 ? 'red' : s.supplier_concentration_pct >= 40 ? 'orange' : 'green';
    var labourColour = s.labour_pct_revenue >= 50 ? 'red' : s.labour_pct_revenue >= 35 ? 'orange' : 'green';
    var largestPct = s.largest_category_pct || 0;
    var largestColour = largestPct >= 40 ? 'orange' : largestPct >= 25 ? '' : 'green';

    this._renderKPIRow(kpisEl, [
      { value: '$' + this._formatNum(s.total_expenses), label: 'Total Expenses', colour: 'orange', trend: 'flat', trendText: s.expense_category_count + ' categories' },
      { value: (s.largest_category || '\u2014'), label: 'Largest Cost Centre', colour: largestColour, trend: 'flat', trendText: largestPct + '% of expenses' },
      { value: s.labour_pct_revenue + '%', label: 'Labour % of Revenue', colour: labourColour, trend: s.labour_pct_revenue >= 50 ? 'down' : 'flat', trendText: '$' + this._formatNum(s.labour_total) + ' labour' },
      { value: s.supplier_concentration_pct + '%', label: 'Supplier Concentration', colour: supplierColour, trend: supplierColour === 'red' ? 'down' : 'up', trendText: 'Top 3 of ' + s.supplier_count + ' suppliers' }
    ]);

    this._renderOpsCharts(d, chartArea, charts);

    var items = [];
    if (largestPct >= 40) items.push({ icon: '&#9888;', text: (s.largest_category || 'One category') + ' is ' + largestPct + '% of total expenses \u2014 worth scrutinising for savings.' });
    if (s.labour_pct_revenue >= 50) items.push({ icon: '&#9888;', text: 'Labour at ' + s.labour_pct_revenue + '% of revenue \u2014 high relative to typical SME benchmarks. Review productivity and pricing.' });
    else if (s.labour_pct_revenue > 0 && s.labour_pct_revenue < 25) items.push({ icon: '&#9989;', text: 'Labour cost at ' + s.labour_pct_revenue + '% of revenue \u2014 healthy ratio.' });
    if (s.supplier_concentration_pct >= 60) items.push({ icon: '&#9888;', text: 'Top 3 suppliers absorb ' + s.supplier_concentration_pct + '% of bill spend \u2014 supply chain risk if one fails.' });
    else if (s.supplier_concentration_pct > 0 && s.supplier_concentration_pct < 40 && s.supplier_count >= 5) items.push({ icon: '&#9989;', text: 'Supplier base diversified at ' + s.supplier_concentration_pct + '% top-3 concentration.' });
    var topOverheads = d.top_overheads || [];
    if (topOverheads.length > 0) {
      items.push({ icon: '&#127970;', text: 'Top overhead: ' + topOverheads[0].name + ' at $' + this._formatNum(topOverheads[0].total) + '.' });
    }
    if (items.length === 0) items.push({ icon: '&#128161;', text: 'Operations data loaded.' });
    this._renderAdvisoryList(advisoryList, items, 'operations');
  },

  _renderOpsCharts: function(d, chartArea, charts) {
    if (!chartArea) return;
    chartArea.style.display = 'block';
    if (charts.opsCategories) { charts.opsCategories.destroy(); charts.opsCategories = null; }
    if (charts.opsMonthly) { charts.opsMonthly.destroy(); charts.opsMonthly = null; }
    var primaryCanvas = document.getElementById('bi-chart-operations');
    if (!primaryCanvas) return;
    var topCats = d.top_expense_categories || [];
    var monthly = d.monthly_expenses || [];
    if (topCats.length === 0 && monthly.length === 0) {
      chartArea.innerHTML = '<div class="bi-module-loading">No expense data yet.</div>';
      return;
    }
    var trendCanvas = document.createElement('canvas');
    chartArea.innerHTML = ''; chartArea.appendChild(primaryCanvas); chartArea.appendChild(trendCanvas);
    var c = this._getCSS();
    if (topCats.length > 0) {
      charts.opsCategories = new Chart(primaryCanvas, {
        type: 'bar',
        data: {
          labels: topCats.map(function (cat) { return cat.name; }),
          datasets: [{
            label: 'Spend',
            data: topCats.map(function (cat) { return cat.total; }),
            backgroundColor: c.blue + 'AA'
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Top Expense Categories', font: { size: 13 }, color: c.textMuted }
          },
          scales: { x: { beginAtZero: true, ticks: { callback: function (v) { return '$' + (v >= 1000 ? Math.round(v / 1000) + 'K' : v); } } } }
        }
      });
    }
    if (monthly.length > 1) {
      var monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var formatMonth = function (raw) {
        if (!raw) return '';
        var d = new Date(raw);
        if (!isNaN(d.getTime())) return monthShort[d.getMonth()] + ' ' + String(d.getFullYear()).substring(2);
        return raw;
      };
      charts.opsMonthly = new Chart(trendCanvas, {
        type: 'line',
        data: {
          labels: monthly.map(function (m) { return formatMonth(m.month); }),
          datasets: [{
            label: 'Monthly Expenses',
            data: monthly.map(function (m) { return m.total; }),
            borderColor: c.orange,
            backgroundColor: c.orange + '20',
            fill: true,
            tension: 0.3,
            pointRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Rolling 11mth Expense Trend', font: { size: 13 }, color: c.textMuted }
          },
          scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return '$' + (v >= 1000 ? Math.round(v / 1000) + 'K' : v); } } } }
        }
      });
    }
  },

  fetchProjects: async function(sb, dateRange, forceRefresh) {
    var session = await sb.auth.getSession();
    var token = session.data && session.data.session && session.data.session.access_token;
    if (!token) return null;
    var body = dateRange ? { fromDate: dateRange.fromDate, toDate: dateRange.toDate } : {};
    if (forceRefresh) body.forceRefresh = true;
    var resp = await fetch('/api/bi-projects', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
    if (!resp.ok) return null;
    var json = await resp.json();
    return json.success ? json : null;
  },

  renderProjects: function(data, charts) {
    var kpisEl = document.getElementById('bi-mod-projects-kpis');
    var chartArea = document.getElementById('bi-mod-projects-chart');
    var advisoryList = document.getElementById('bi-mod-projects-advisory-list');
    this._setTimestamp('bi-mod-projects-updated');

    if (!data || !data.connected) {
      if (kpisEl) kpisEl.innerHTML = '';
      if (chartArea) chartArea.style.display = 'none';
      var sec = document.getElementById('bi-mod-projects-advisory');
      if (sec) sec.innerHTML = '<div class="bi-module-prompt">' +
        '<div class="bi-module-prompt-icon">&#128736;</div>' +
        '<h3>Project Performance</h3>' +
        '<p>Connect a project source to see job profitability, quote vs actual variance, completion rates, and durations. Supported today: ServiceM8, Fergus, and Xero Projects (job-tracking enabled). Coming soon: Buildxact and MYOB Jobs.</p>' +
        '</div>';
      return;
    }

    if (!advisoryList) {
      var secRestore = document.getElementById('bi-mod-projects-advisory');
      if (secRestore) {
        secRestore.innerHTML = '<div class="bi-advisory-label">AI Advisory</div><div id="bi-mod-projects-advisory-list"></div>';
        advisoryList = document.getElementById('bi-mod-projects-advisory-list');
      }
    }

    var d = data.data; var s = d.summary;
    var marginColour = s.avg_margin_pct >= 25 ? 'green' : s.avg_margin_pct >= 10 ? 'orange' : (s.avg_margin_pct > 0 ? 'red' : '');
    var completionColour = s.completion_rate >= 75 ? 'green' : s.completion_rate >= 50 ? 'orange' : (s.completion_rate > 0 ? 'red' : '');
    var totalQuotedAgainstActual = s.over_quote_count + s.under_quote_count + s.on_quote_count;
    var overPct = totalQuotedAgainstActual > 0 ? Math.round((s.over_quote_count / totalQuotedAgainstActual) * 100) : 0;

    this._renderKPIRow(kpisEl, [
      { value: '' + s.total_jobs, label: 'Total Jobs', colour: '', trend: 'flat', trendText: s.completed_count + ' completed' },
      { value: s.completion_rate + '%', label: 'Completion Rate', colour: completionColour, trend: completionColour === 'green' ? 'up' : 'flat', trendText: s.in_progress_count + ' in progress' },
      { value: '$' + this._formatNum(s.avg_job_value), label: 'Avg Job Value', colour: 'orange', trend: 'flat', trendText: s.avg_duration_days + 'd avg duration' },
      { value: s.avg_margin_pct + '%', label: 'Avg Margin', colour: marginColour, trend: marginColour === 'green' ? 'up' : marginColour === 'red' ? 'down' : 'flat', trendText: '$' + this._formatNum(s.total_profit) + ' total profit' }
    ]);

    this._renderProjectCharts(d, chartArea, charts);

    var items = [];
    if (s.avg_margin_pct >= 25) items.push({ icon: '&#9989;', text: 'Healthy average margin at ' + s.avg_margin_pct + '% across ' + s.total_jobs + ' jobs.' });
    else if (s.avg_margin_pct > 0 && s.avg_margin_pct < 10) items.push({ icon: '&#9888;', text: 'Average margin only ' + s.avg_margin_pct + '% — review pricing or cost control.' });
    if (s.completion_rate > 0 && s.completion_rate < 50) items.push({ icon: '&#9888;', text: 'Completion rate ' + s.completion_rate + '% — many jobs sitting open.' });
    if (totalQuotedAgainstActual > 0 && overPct >= 30) items.push({ icon: '&#128201;', text: overPct + '% of quoted jobs ran over — quoting is consistently optimistic.' });
    if (s.avg_duration_days > 0) items.push({ icon: '&#128197;', text: 'Average job duration ' + s.avg_duration_days + ' days.' });
    var top = (d.top_by_profit || [])[0];
    if (top && top.profit > 0) items.push({ icon: '&#128176;', text: 'Top job by profit: ' + top.job_name + ' — $' + this._formatNum(top.profit) + ' (' + top.margin_pct + '% margin).' });
    if (items.length === 0) items.push({ icon: '&#128161;', text: 'Project data loaded.' });
    this._renderAdvisoryList(advisoryList, items, 'projects');
  },

  _formatStatusLabel: function(s) {
    if (!s) return 'Unknown';
    var raw = String(s);
    var specials = { INPROGRESS: 'In Progress', NOTSTARTED: 'Not Started', ONHOLD: 'On Hold' };
    if (specials[raw]) return specials[raw];
    // Default: lower-case then title-case each word
    return raw.toLowerCase().replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
  },

  _renderProjectCharts: function(d, chartArea, charts) {
    if (!chartArea) return;
    chartArea.style.display = 'block';
    if (charts.projectsStatus) { charts.projectsStatus.destroy(); charts.projectsStatus = null; }
    if (charts.projectsTopProfit) { charts.projectsTopProfit.destroy(); charts.projectsTopProfit = null; }
    var primary = document.getElementById('bi-chart-projects');
    if (!primary) return;
    var statuses = d.status_breakdown || {};
    var topByProfit = d.top_by_profit || [];
    var statusKeys = Object.keys(statuses);
    if (statusKeys.length === 0 && topByProfit.length === 0) {
      chartArea.innerHTML = '<div class="bi-module-loading">No project data yet.</div>';
      return;
    }
    var secondary = document.createElement('canvas');
    chartArea.innerHTML = ''; chartArea.appendChild(primary); chartArea.appendChild(secondary);
    var c = this._getCSS();
    var self = this;

    if (statusKeys.length > 0) {
      var palette = [c.blue, c.green, c.orange, c.purple, c.grey, c.teal, c.red];
      charts.projectsStatus = new Chart(primary, {
        type: 'doughnut',
        data: {
          labels: statusKeys.map(function (k) { return self._formatStatusLabel(k); }),
          datasets: [{
            data: statusKeys.map(function (k) { return statuses[k]; }),
            backgroundColor: statusKeys.map(function (_, i) { return palette[i % palette.length]; })
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2,
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } },
            title: { display: true, text: 'Jobs by Status', font: { size: 13 }, color: c.textMuted }
          }
        }
      });
    }

    if (topByProfit.length > 0) {
      charts.projectsTopProfit = new Chart(secondary, {
        type: 'bar',
        data: {
          labels: topByProfit.map(function (j) { return (j.job_name || j.job_number || '').substring(0, 28); }),
          datasets: [{
            label: 'Profit',
            data: topByProfit.map(function (j) { return j.profit; }),
            backgroundColor: c.green + 'AA'
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Top Jobs by Profit', font: { size: 13 }, color: c.textMuted }
          },
          scales: { x: { beginAtZero: true, ticks: { callback: function (v) { return '$' + (v >= 1000 ? Math.round(v / 1000) + 'K' : v); } } } }
        }
      });
    }
  },

  fetchMarket: async function(sb, userId) {
    // Source: Content Library rows produced by the Industry News Digest tool.
    // tool_source = 'news-digest' marks an item as ID output. We pull the
    // most recent approved entries; absence of any rows is what drives the
    // value-prop prompt on the tile.
    var resp = await sb.from('content_library')
      .select('id, title, content_text, source_detail, created_at')
      .eq('user_id', userId)
      .eq('tool_source', 'news-digest')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(8);
    if (resp.error) console.error('[BI] Market query error:', resp.error.message);
    return { briefings: resp.data || [] };
  },

  renderMarket: function(data) {
    var kpisEl = document.getElementById('bi-mod-market-kpis');
    var chartArea = document.getElementById('bi-mod-market-chart');
    var advisoryList = document.getElementById('bi-mod-market-advisory-list');
    this._setTimestamp('bi-mod-market-updated');
    if (chartArea) chartArea.style.display = 'none';

    var briefings = (data && data.briefings) || [];

    // No-content state: show the value-prop prompt explaining what the
    // Industry News Digest tool offers, with an Activate CTA.
    if (briefings.length === 0) {
      if (kpisEl) kpisEl.innerHTML = '';
      var sec = document.getElementById('bi-mod-market-advisory');
      if (sec) sec.innerHTML = '<div class="bi-module-prompt">' +
        '<div class="bi-module-prompt-icon">&#127758;</div>' +
        '<h3>Industry News &amp; Updates</h3>' +
        '<p>Activate the full Industry News &amp; Updates tool to get:</p>' +
        '<ul class="bi-module-prompt-list">' +
        '<li>Full industry briefings</li>' +
        '<li>Sector-wide and regionally specific news</li>' +
        '<li>Comprehensive coverage beyond what BI surfaces here</li>' +
        '</ul>' +
        '<a class="btn-outline btn-sm bi-module-prompt-cta" href="/panel-auth.html?tool=news-digest">Activate Industry News &amp; Updates</a>' +
        '</div>';
      return;
    }

    // Restore advisory section structure if a previous render replaced it
    // with the prompt above.
    if (!advisoryList) {
      var secRestore = document.getElementById('bi-mod-market-advisory');
      if (secRestore) {
        secRestore.innerHTML = '<div class="bi-advisory-label">AI Advisory</div><div id="bi-mod-market-advisory-list"></div>';
        advisoryList = document.getElementById('bi-mod-market-advisory-list');
      }
    }

    // KPIs: number of recent briefings and the date of the most recent one.
    var monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var latest = briefings[0].created_at ? new Date(briefings[0].created_at) : null;
    var latestLabel = (latest && !isNaN(latest.getTime())) ? (latest.getDate() + ' ' + monthShort[latest.getMonth()]) : '\u2014';
    this._renderKPIRow(kpisEl, [
      { value: '' + briefings.length, label: 'Recent Briefings', colour: '', trend: 'flat', trendText: '' },
      { value: latestLabel, label: 'Last Update', colour: '', trend: 'flat', trendText: '' }
    ]);

    // Render top 5 briefings as advisory rows (title + snippet of summary).
    var items = briefings.slice(0, 5).map(function (b) {
      var snippet = String(b.content_text || '').substring(0, 160).trim();
      if (b.content_text && b.content_text.length > 160) snippet += '\u2026';
      return {
        icon: '&#128240;',
        text: (b.title || 'Update') + (snippet ? ' \u2014 ' + snippet : '')
      };
    });
    this._renderAdvisoryList(advisoryList, items, 'market');

    // Append a small "open full tool" link beneath the items. Replace any
    // existing upsell box first so re-renders don't stack copies.
    var advisorySec = advisoryList.parentElement;
    if (advisorySec) {
      var existing = advisorySec.querySelector('.bi-upsell-box');
      if (existing) existing.remove();
      var upsell = document.createElement('div');
      upsell.className = 'bi-upsell-box';
      upsell.innerHTML = 'Powered by Industry News &amp; Updates \u2014 <a href="/news">open full tool</a>';
      advisorySec.appendChild(upsell);
    }
  },

  fetchStrategic: async function(sb, userId) {
    var pr = await sb.from('strategic_plans').select('id, swot_data, cycle_end_date, interview_data, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
    var plan = (pr.data && pr.data.length > 0) ? pr.data[0] : null;
    var tasks = [];
    if (plan) {
      var tr = await sb.from('action_tracker').select('id, items, month_group, is_carried_forward').eq('user_id', userId).eq('plan_id', plan.id);
      tasks = (tr.data||[]).map(function(row) { var it = row.items||{}; return { id: row.id, title: it.title||'', due_date: it.due_date||'', status: it.status||'pending', priority: it.priority||'Medium', month_group: row.month_group||0 }; });
    }
    return { plan: plan, tasks: tasks };
  },

  renderStrategic: function(data, charts) {
    var kpisEl = document.getElementById('bi-mod-strategic-kpis');
    var chartArea = document.getElementById('bi-mod-strategic-chart');
    var advisoryList = document.getElementById('bi-mod-strategic-advisory-list');
    this._setTimestamp('bi-mod-strategic-updated');

    if (!data || !data.plan) {
      if (kpisEl) kpisEl.innerHTML = '';
      if (chartArea) chartArea.style.display = 'none';
      var sec = document.getElementById('bi-mod-strategic-advisory');
      if (sec) sec.innerHTML = '<div class="bi-module-prompt"><div class="bi-module-prompt-icon">&#127919;</div><h3>Strategic Alignment</h3><p>Create your Strategic Plan to track progress against your goals, monitor action items, and align operations with strategy.</p></div>';
      return;
    }

    var plan = data.plan, tasks = data.tasks;
    var today = new Date().toISOString().split('T')[0];
    var total = tasks.length;
    var completed = tasks.filter(function(t){return t.status==='completed'||t.status==='done';}).length;
    var overdue = tasks.filter(function(t){return t.due_date&&t.due_date<today&&t.status!=='completed'&&t.status!=='done';}).length;
    var pct = total > 0 ? Math.round(completed/total*100) : 0;
    var cycleEnd = plan.cycle_end_date||'';
    var daysLeft = cycleEnd ? Math.max(0, Math.ceil((new Date(cycleEnd)-new Date())/86400000)) : 0;

    this._renderKPIRow(kpisEl, [
      { value: pct+'%', label: '90-Day Progress', colour: pct>=70?'green':pct>=40?'orange':'red', trend: pct>=50?'up':'down', trendText: completed+' of '+total+' tasks' },
      { value: ''+overdue, label: 'Overdue Tasks', colour: overdue>0?'red':'green', trend: overdue>0?'down':'up', trendText: overdue>0?'Action needed':'On track' },
      { value: daysLeft+'d', label: 'Cycle Remaining', colour: daysLeft<=14?'orange':'purple', trend: 'flat', trendText: cycleEnd?'Ends '+cycleEnd:'' }
    ]);

    if (chartArea) {
      chartArea.style.display = 'block';
      if (charts.strategicStatus) { charts.strategicStatus.destroy(); charts.strategicStatus = null; }
      var canvas = document.getElementById('bi-chart-strategic');
      if (canvas && total > 0) {
        chartArea.innerHTML = ''; chartArea.appendChild(canvas);
        var sc = {}; tasks.forEach(function(t){var s=t.status||'pending';sc[s]=(sc[s]||0)+1;});
        var c = this._getCSS();
        var cm = {completed:c.green,done:c.green,'in-progress':c.blue,in_progress:c.blue,pending:c.orange,overdue:c.red};
        var sl = Object.keys(sc);
        charts.strategicStatus = new Chart(canvas, { type: 'doughnut', data: { labels: sl.map(function(s){return s.charAt(0).toUpperCase()+s.slice(1);}), datasets: [{ data: sl.map(function(s){return sc[s];}), backgroundColor: sl.map(function(s){return cm[s.toLowerCase()]||c.grey;}) }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } }, title: { display: true, text: 'Tasks by Status', font: { size: 13 }, color: c.textMuted } } } });
      } else { chartArea.style.display = 'none'; }
    }

    var items = [];
    if (overdue > 0) items.push({ icon: '&#9888;', text: overdue+' of '+total+' strategic actions are overdue.' });
    if (daysLeft > 0 && daysLeft <= 21) items.push({ icon: '&#128197;', text: '90-day cycle ends in '+daysLeft+' days \u2014 schedule a review.' });
    if (pct < 30 && total > 0) items.push({ icon: '&#9888;', text: 'Only '+pct+'% completed \u2014 consider reprioritising.' });
    else if (pct >= 75) items.push({ icon: '&#9989;', text: 'Strong progress at '+pct+'%.' });
    var swot = plan.swot_data;
    if (swot) { var w = swot.weaknesses||swot.Weaknesses||[]; if (w.length > 0) items.push({ icon: '&#128161;', text: 'SWOT: '+w.length+' weakness'+(w.length>1?'es':'')+' identified.' }); }
    if (items.length === 0) items.push({ icon: '&#127919;', text: 'Strategic plan active.' });
    this._renderAdvisoryList(advisoryList, items, 'strategic');
  }
};
