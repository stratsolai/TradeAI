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
      html += '<button class="bi-ask-btn" data-module="' + escHtml(mod) + '" data-insight-idx="' + i + '">Ask about this</button>';
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

  fetchFinancial: async function(sb, dateRange) {
    var session = await sb.auth.getSession();
    var token = session.data && session.data.session && session.data.session.access_token;
    if (!token) return null;
    var body = dateRange ? { fromDate: dateRange.fromDate, toDate: dateRange.toDate } : {};
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

  fetchCustomers: async function(sb, dateRange) {
    var session = await sb.auth.getSession();
    var token = session.data && session.data.session && session.data.session.access_token;
    if (!token) return null;
    var body = dateRange ? { fromDate: dateRange.fromDate, toDate: dateRange.toDate } : {};
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

  fetchOperations: async function(sb, dateRange) {
    var session = await sb.auth.getSession();
    var token = session.data && session.data.session && session.data.session.access_token;
    if (!token) return null;
    var body = dateRange ? { fromDate: dateRange.fromDate, toDate: dateRange.toDate } : {};
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
      if (sec) sec.innerHTML = '<div class="bi-module-prompt"><div class="bi-module-prompt-icon">&#9881;</div><h3>Operational Insights</h3><p>Connect your job management system (ServiceM8, Buildxact, Fergus, or Tradify) to see operational insights, job profitability, and efficiency metrics.</p></div>';
      return;
    }

    var d = data.data; var s = d.summary;
    var fc = s.form_completion_rate >= 90 ? 'green' : s.form_completion_rate >= 70 ? 'orange' : 'red';
    this._renderKPIRow(kpisEl, [
      { value: ''+s.total_jobs, label: 'Total Jobs', colour: '', trend: 'flat', trendText: s.completed_jobs+' completed' },
      { value: '$'+this._formatNum(s.avg_job_value), label: 'Avg Job Value', colour: 'orange', trend: 'flat', trendText: '' },
      { value: s.avg_duration_days+'d', label: 'Avg Duration', colour: 'purple', trend: 'flat', trendText: '' },
      { value: s.form_completion_rate+'%', label: 'Form Completion', colour: fc, trend: s.form_completion_rate>=80?'up':'down', trendText: s.total_forms+' forms' }
    ]);

    this._renderOpsCharts(d, chartArea, charts);

    var items = [];
    var tq = s.over_quote_count+s.under_quote_count+s.on_quote_count;
    if (tq > 0 && s.over_quote_count > 0) items.push({ icon: '&#9888;', text: Math.round(s.over_quote_count/tq*100)+'% of jobs over quoted price \u2014 review estimation.' });
    if (s.avg_duration_days > 0) items.push({ icon: '&#128197;', text: 'Average duration '+s.avg_duration_days+' days across '+s.completed_jobs+' completed jobs.' });
    if (s.form_completion_rate < 80 && s.total_jobs > 0) items.push({ icon: '&#9888;', text: 'Forms on '+s.form_completion_rate+'% of jobs \u2014 compliance gap.' });
    else if (s.form_completion_rate >= 90) items.push({ icon: '&#9989;', text: 'Strong form compliance at '+s.form_completion_rate+'%.' });
    if (s.avg_job_value > 0) items.push({ icon: '&#128176;', text: 'Average job value $'+this._formatNum(s.avg_job_value)+'.' });
    if (items.length === 0) items.push({ icon: '&#128161;', text: 'Operations data loaded.' });
    this._renderAdvisoryList(advisoryList, items, 'operations');
  },

  _renderOpsCharts: function(d, chartArea, charts) {
    if (!chartArea) return;
    chartArea.style.display = 'block';
    if (charts.opsStatus) { charts.opsStatus.destroy(); charts.opsStatus = null; }
    if (charts.opsMonthly) { charts.opsMonthly.destroy(); charts.opsMonthly = null; }
    var statusCanvas = document.getElementById('bi-chart-operations');
    if (!statusCanvas) return;
    var statuses = d.status_breakdown||{}, monthly = d.monthly_jobs||[];
    var sk = Object.keys(statuses);
    if (sk.length === 0 && monthly.length === 0) { chartArea.innerHTML = '<div class="bi-module-loading">No operations data yet.</div>'; return; }
    var monthlyCanvas = document.createElement('canvas');
    chartArea.innerHTML = ''; chartArea.appendChild(statusCanvas); chartArea.appendChild(monthlyCanvas);
    var c = this._getCSS();
    if (sk.length > 0) {
      var cols = [c.blue, c.green, c.orange, c.purple, c.grey, c.teal, c.red];
      charts.opsStatus = new Chart(statusCanvas, { type: 'doughnut', data: { labels: sk, datasets: [{ data: sk.map(function(k){return statuses[k];}), backgroundColor: sk.map(function(k,i){return cols[i%cols.length];}) }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } }, title: { display: true, text: 'Jobs by Status', font: { size: 13 }, color: c.textMuted } } } });
    }
    if (monthly.length > 0) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      charts.opsMonthly = new Chart(monthlyCanvas, { type: 'bar', data: { labels: monthly.map(function(m){var p=m.month.split('-');return months[parseInt(p[1],10)-1]+' '+p[0].substring(2);}), datasets: [{ label: 'Jobs', data: monthly.map(function(m){return m.count;}), backgroundColor: c.blue+'AA' }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, title: { display: true, text: 'Jobs by Month', font: { size: 13 }, color: c.textMuted } }, scales: { y: { beginAtZero: true } } } });
    }
  },

  fetchMarket: async function(sb, userId) {
    var briefings = await sb.from('news_digest_briefings').select('id, title, summary, category, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
    if (briefings.error) console.error('[BI] Market briefings query error:', briefings.error.message);
    var tenders = await sb.from('news_digest_tenders').select('id, title, location, close_date, value_text').eq('user_id', userId).order('close_date', { ascending: true }).limit(5);
    if (tenders.error) console.error('[BI] Market tenders query error:', tenders.error.message);
    var hasID = false;
    var tc = await sb.from('profiles').select('activated_tools').eq('id', userId).single();
    if (tc.error) console.error('[BI] Market profile query error:', tc.error.message);
    if (tc.data && Array.isArray(tc.data.activated_tools)) hasID = tc.data.activated_tools.indexOf('news-digest') !== -1;
    return { briefings: briefings.data||[], tenders: tenders.data||[], hasNewsDigest: hasID };
  },

  renderMarket: function(data) {
    var kpisEl = document.getElementById('bi-mod-market-kpis');
    var chartArea = document.getElementById('bi-mod-market-chart');
    var advisoryList = document.getElementById('bi-mod-market-advisory-list');
    this._setTimestamp('bi-mod-market-updated');
    if (!data) { if (kpisEl) kpisEl.innerHTML = ''; if (chartArea) chartArea.style.display = 'none'; return; }
    var br = data.briefings||[], tn = data.tenders||[];
    this._renderKPIRow(kpisEl, [
      { value: ''+br.length, label: 'Recent Headlines', colour: '' },
      { value: ''+tn.length, label: 'Open Tenders', colour: 'orange' }
    ]);
    if (chartArea) chartArea.style.display = 'none';
    if (!advisoryList) return;
    var items = [];
    for (var b = 0; b < Math.min(br.length, 3); b++) items.push({ icon: '&#128240;', text: (br[b].title||'Update')+(br[b].summary?' \u2014 '+br[b].summary.substring(0,120):'') });
    var today = new Date().toISOString().split('T')[0];
    var closing = tn.filter(function(t){return t.close_date&&t.close_date>=today;}).slice(0,2);
    for (var t = 0; t < closing.length; t++) items.push({ icon: '&#128203;', text: 'Tender: '+(closing[t].title||'Opportunity')+(closing[t].location?' in '+closing[t].location:'')+(closing[t].close_date?' \u2014 closes '+closing[t].close_date:'') });
    if (items.length === 0) items.push({ icon: '&#127758;', text: data.hasNewsDigest?'Check Industry News for full briefings.':'Activate Industry News & Updates for market insights.' });
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="bi-advisory-item"><span class="bi-advisory-icon">'+items[i].icon+'</span><span class="bi-advisory-text">'+escHtml(items[i].text)+'</span></div>';
    }
    html += data.hasNewsDigest ? '<div class="bi-upsell-box">Powered by Industry News &amp; Updates \u2014 <a href="/news-digest.html">open full tool</a></div>' : '<div class="bi-upsell-box">This is a summary view. Activate Industry News &amp; Updates for full briefings, email scanning, supplier monitoring, and personalised industry intelligence.</div>';
    advisoryList.innerHTML = html;
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
