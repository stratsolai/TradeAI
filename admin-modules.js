/* admin-modules.js — Dashboard Overview & Profitability section.
   Split out of admin-logic.js to keep that file under the platform 60K
   character limit. Methods are merged into window.ADMIN_LOGIC at load
   time, so they share the same `this` context as the methods that
   remain in admin-logic.js. Loaded after admin-logic.js in admin.html. */
(function() {
  if (!window.ADMIN_LOGIC) return;

  var modules = {

    // ── SECTION 1: DASHBOARD OVERVIEW ──────────────────────────────
    // Renders core platform metrics, the Profitability & Costs section
    // (per spec v1.0), and the existing quick-list cards.
    _renderOverview: function() {
      var self = this;
      var container = document.getElementById('section-overview');
      container.innerHTML = '<div class="admin-loading">Loading overview…</div>';

      Promise.all([
        self._fetchAdmin('admin-overview'),
        self._fetchAdmin('admin-profitability').catch(function(e) {
          console.error('[admin] profitability fetch failed:', e && e.message);
          return { _error: e && e.message };
        }),
        self._fetchAdmin('admin-api-usage').catch(function(e) {
          console.error('[admin] admin-api-usage fetch failed:', e && e.message);
          return {};
        })
      ]).then(function(results) {
        var d = results[0] || {};
        var prof = results[1] || {};
        var manual = results[2] || {};
        self._renderOverviewContent(container, d, prof, manual);
      }).catch(function(err) {
        container.innerHTML = '<div class="admin-empty">' + window.escHtml('Could not load overview: ' + err.message) + '</div>';
      });
    },

    _renderOverviewContent: function(container, d, prof, manual) {
      var self = this;
      var m = d.metrics || {};
      var html = '<div class="admin-metric-grid">'
        + self._statCard('Total Customers', m.total_customers, '')
        + self._statCard('Active Subscriptions', m.active_subscriptions, '')
        + self._statCard('MRR', self._formatMoney(m.mrr), '/mth', 'green')
        + self._statCard('Churn This Month', (m.churn_count || 0) + ' (' + (m.churn_rate || 0) + '%)', '', m.churn_count > 0 ? 'red' : '')
        + self._statCard('New Signups (7 days)', m.new_signups_7d, '', 'orange')
        + self._statCard('Trial Users', m.trial_users, '', 'orange')
        + '</div>';

      // ── Profitability & Costs ──────────────────────────────────
      html += self._buildProfitabilitySection(prof, manual);

      // ── Quick lists ────────────────────────────────────────────
      html += '<div class="admin-list-grid">';
      html += self._listCard('Recent Signups', (d.recent_signups || []).map(function(p) {
        return {
          label: window.escHtml(p.business_name || p.email || p.id),
          value: self._formatDate(p.created_at)
        };
      }));
      html += self._listCard('Top Tools', (d.top_tools || []).map(function(t) {
        return { label: window.escHtml(self._toolName(t.id)), value: t.count + ' active' };
      }));
      html += self._listCard('Industry Breakdown', (d.industry_breakdown || []).map(function(i) {
        return { label: window.escHtml(i.industry), value: i.count };
      }));
      html += '</div>';

      container.innerHTML = html;

      // Wire interactivity for the profitability section after the
      // DOM exists. _profData is stashed so the chart toggle handler
      // and the manual-entry submit can read it back.
      self._profData = prof;
      self._wireProfitabilityChart();
      self._wireProfManualForm();
      self._wireProfManualDropdown();
    },

    _statCard: function(label, value, suffix, modifier) {
      var cls = 'stat-card' + (modifier ? ' ' + modifier : '');
      return '<div class="' + cls + '">'
        + '<div class="stat-value">' + window.escHtml(value == null ? '—' : value) + (suffix ? '<span style="font-size:14px;color:var(--text-muted);"> ' + window.escHtml(suffix) + '</span>' : '') + '</div>'
        + '<div class="stat-label">' + window.escHtml(label) + '</div>'
        + '</div>';
    },

    _listCard: function(title, items) {
      var html = '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">' + window.escHtml(title) + '</div></div>';
      html += '<div class="settings-rows" style="padding:14px 20px;">';
      if (!items || items.length === 0) {
        html += '<div class="admin-empty">No data.</div>';
      } else {
        items.forEach(function(it) {
          html += '<div class="admin-list-item"><span class="admin-list-item-label">' + (it.label || '—') + '</span><span class="admin-list-item-value">' + (it.value == null ? '—' : it.value) + '</span></div>';
        });
      }
      html += '</div></div>';
      return html;
    },

    // ── PROFITABILITY & COSTS — Dashboard Overview section ─────────
    // Spec v1.0 — summary tiles, supplier status row, tool & customer
    // profitability tables, 6-month margin trend chart (toggle Overall
    // / By Tool / By Customer), and manual entry for providers without
    // public usage APIs (Predis, REimagine).
    _buildProfitabilitySection: function(prof, manual) {
      var self = this;
      if (prof && prof._error) {
        return '<div class="admin-section-placeholder">'
          + window.escHtml('Profitability data unavailable: ' + prof._error)
          + '</div>';
      }
      if (!prof || !prof.summary) {
        return '<div class="admin-section-placeholder">No profitability data yet — once api_usage rows exist for the current period this section will populate.</div>';
      }

      var s = prof.summary || {};
      var marginPct = s.overall_margin_percent;
      var marginColour = marginPct == null ? '' : (marginPct >= 80 ? 'green' : (marginPct >= 60 ? 'orange' : 'red'));
      var alertsCount = s.alerts_count || 0;

      var html = '<div class="settings-card-header" style="margin-top:24px;"><div class="settings-card-title">Profitability &amp; Costs</div><div class="settings-card-hint">Real-time margin and supplier health for ' + window.escHtml(prof.period || '') + '.</div></div>';

      // Summary tiles
      html += '<div class="prof-summary-grid">'
        + self._statCard('Total Revenue', self._formatMoney(s.total_revenue), '/mth', 'green')
        + self._statCard('Total Costs', self._formatMoney(s.total_costs), '/mth', s.total_costs > 0 ? 'orange' : '')
        + self._statCard('Overall Margin', marginPct == null ? '—' : (marginPct + '%'), '', marginColour)
        + self._statCard('Alerts', alertsCount, '', alertsCount > 0 ? 'red' : '')
        + '</div>';

      // Alert list — collapsed when zero, expanded when there are items.
      if ((prof.alerts || []).length > 0) {
        html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Alerts</div></div>';
        html += '<div class="settings-rows" style="padding:14px 20px;">';
        prof.alerts.forEach(function(a) {
          var dotCls = a.severity === 'red' ? 'red' : (a.severity === 'amber' ? 'amber' : '');
          html += '<div class="admin-list-item"><span class="admin-list-item-label"><span class="prof-status-dot ' + dotCls + '"></span>' + window.escHtml(a.message) + '</span><span class="admin-list-item-value">' + window.escHtml(a.kind.replace(/_/g, ' ')) + '</span></div>';
        });
        html += '</div></div>';
      }

      // Supplier status row
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Supplier Status</div><div class="settings-card-hint">Live spend and limit usage. Refreshed every 5 minutes.</div></div>';
      html += '<div class="settings-rows" style="padding:14px 20px;"><div class="prof-supplier-row">';
      (prof.suppliers || []).forEach(function(p) {
        html += self._supplierCardHtml(p);
      });
      html += '</div></div></div>';

      // Tool profitability
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Tool Profitability</div></div>';
      html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Tool</th><th>Revenue</th><th>Cost</th><th>Margin</th><th>Target</th><th>Status</th>'
        + '</tr></thead><tbody>';
      var tools = prof.tools || [];
      if (tools.length === 0) {
        html += '<tr><td colspan="6" class="admin-empty">No tool spend logged yet for this period.</td></tr>';
      } else {
        tools.forEach(function(t) {
          html += '<tr>'
            + '<td>' + window.escHtml(self._toolName(t.tool_id)) + '</td>'
            + '<td>' + self._formatMoney(t.revenue) + '</td>'
            + '<td>' + self._formatMoney(t.cost) + '</td>'
            + '<td>' + (t.margin_percent == null ? '—' : t.margin_percent + '%') + '</td>'
            + '<td>' + (t.target_percent != null ? t.target_percent + '%' : '—') + '</td>'
            + '<td><span class="prof-status-dot ' + window.escHtml(t.status) + '"></span></td>'
            + '</tr>';
        });
      }
      html += '</tbody></table></div></div>';

      // Customer profitability — top 10 by margin (worst first).
      var customers = (prof.customers || []).slice(0, 10);
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Customer Profitability</div><div class="settings-card-hint">Worst margins first. Top 10 shown.</div></div>';
      html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Customer</th><th>MRR</th><th>Cost</th><th>Margin</th><th>Threshold</th><th>Status</th>'
        + '</tr></thead><tbody>';
      if (customers.length === 0) {
        html += '<tr><td colspan="6" class="admin-empty">No customer cost data yet.</td></tr>';
      } else {
        customers.forEach(function(c) {
          var who = c.business_name || c.email || c.user_id;
          html += '<tr>'
            + '<td>' + window.escHtml(who) + '</td>'
            + '<td>' + self._formatMoney(c.revenue) + '</td>'
            + '<td>' + self._formatMoney(c.cost) + '</td>'
            + '<td>' + (c.margin_percent == null ? '—' : c.margin_percent + '%') + '</td>'
            + '<td>' + c.threshold_percent + '%</td>'
            + '<td><span class="prof-status-dot ' + window.escHtml(c.status) + '"></span></td>'
            + '</tr>';
        });
      }
      html += '</tbody></table></div></div>';

      // Trend chart
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Margin Trend (6 months)</div></div>';
      html += '<div class="prof-chart-toggle-row">'
        + '<button class="prof-chart-toggle active" data-mode="overall">Overall</button>'
        + '<button class="prof-chart-toggle" data-mode="by_tool">By Tool</button>'
        + '</div>';
      html += '<div class="prof-chart-wrap"><canvas id="prof-trend-chart"></canvas></div>';
      html += '</div>';

      // Manual tracking — Predis & REimagine. Spec section 4.4 / 4.6.
      var manualProviders = [
        { id: 'predis', name: 'Predis.ai' },
        { id: 'reimagine', name: 'REimagine Home' }
      ];
      var manualEntries = (manual.entries || []).filter(function(e) {
        return e.provider === 'predis' || e.provider === 'reimagine';
      });

      html += '<div class="settings-card prof-manual-card"><div class="settings-card-header"><div class="settings-card-title">Manual Tracking</div><div class="settings-card-hint">Providers without usage APIs. Enter monthly figures from each provider\'s dashboard.</div></div>';
      html += '<div class="prof-manual-form" id="prof-manual-form">'
        + '<span class="lookback-dropdown-wrap prof-manual-wrap">'
        + '<button type="button" class="lookback-dropdown lookback-dropdown-field" id="prof-manual-provider" data-value="' + window.escHtml(manualProviders[0].id) + '">' + window.escHtml(manualProviders[0].name) + '</button>'
        + '<div class="lookback-dropdown-menu" id="prof-manual-provider-menu">'
        + manualProviders.map(function(p, i) {
          return '<button type="button" class="lookback-dropdown-item' + (i === 0 ? ' active' : '') + '" data-value="' + window.escHtml(p.id) + '">' + window.escHtml(p.name) + '</button>';
        }).join('')
        + '</div>'
        + '</span>'
        + '<input type="text" class="form-input" id="prof-manual-period" placeholder="YYYY-MM" value="' + window.escHtml(prof.period || '') + '">'
        + '<input type="text" class="form-input" id="prof-manual-value" placeholder="Usage">'
        + '<input type="number" step="0.01" class="form-input" id="prof-manual-cost" placeholder="Cost AUD">'
        + '<input type="text" class="form-input" id="prof-manual-notes" placeholder="Notes (optional)">'
        + '<button class="btn-add-connection" id="prof-manual-submit">+ Add Entry</button>'
        + '</div>';
      html += '<div class="admin-table-wrap" style="margin-top:12px;"><table class="admin-table"><thead><tr>'
        + '<th>Provider</th><th>Period</th><th>Usage</th><th>Cost</th><th>Notes</th><th>Entered</th>'
        + '</tr></thead><tbody>';
      if (manualEntries.length === 0) {
        html += '<tr><td colspan="6" class="admin-empty">No manual entries yet.</td></tr>';
      } else {
        manualEntries.forEach(function(e) {
          html += '<tr>'
            + '<td>' + window.escHtml(e.provider || '') + '</td>'
            + '<td>' + window.escHtml(e.period || '') + '</td>'
            + '<td>' + window.escHtml(e.usage_value || '—') + '</td>'
            + '<td>' + (typeof e.cost_estimate === 'number' ? self._formatMoney(e.cost_estimate) : '—') + '</td>'
            + '<td>' + window.escHtml(e.notes || '') + '</td>'
            + '<td>' + self._formatDate(e.entered_at) + '</td>'
            + '</tr>';
        });
      }
      html += '</tbody></table></div></div>';

      return html;
    },

    // Render a supplier card. Picks the limit with the highest used %
    // to drive the bar — that's the limit the owner actually needs to
    // see. Cards turn amber when any limit hits its alert threshold and
    // red when any limit is at 95%+.
    _supplierCardHtml: function(p) {
      var self = this;
      var topLimit = null;
      (p.limits || []).forEach(function(l) {
        if (!topLimit || (l.used_percent != null && l.used_percent > (topLimit.used_percent || -1))) topLimit = l;
      });
      var pct = topLimit && topLimit.used_percent != null ? topLimit.used_percent : null;
      var cls = '';
      var barCls = '';
      if (pct != null && pct >= 95) { cls = 'alert'; barCls = 'alert'; }
      else if (pct != null && topLimit && pct >= (topLimit.alert_at_percent || 80)) { cls = 'warn'; barCls = 'warn'; }

      var costLine = self._formatMoney(p.cost_this_month || 0);
      var trendLine = '';
      if (typeof p.cost_last_month === 'number' && p.cost_last_month > 0) {
        var diff = ((p.cost_this_month || 0) - p.cost_last_month) / p.cost_last_month * 100;
        var arrow = diff > 0 ? '↑' : (diff < 0 ? '↓' : '→');
        trendLine = arrow + ' ' + Math.abs(Math.round(diff * 10) / 10) + '% vs last month';
      }

      var html = '<div class="prof-supplier-card ' + cls + '">'
        + '<div class="prof-supplier-name">' + window.escHtml(p.name) + '</div>'
        + '<div class="prof-supplier-cost">' + costLine + '</div>'
        + '<div class="prof-supplier-trend">' + window.escHtml(trendLine) + '</div>';

      if (topLimit) {
        var pctDisplay = pct == null ? '—' : pct + '%';
        html += '<div class="prof-supplier-bar-wrap"><div class="prof-supplier-bar ' + barCls + '" style="width:' + (pct != null ? Math.min(100, pct) : 0) + '%;"></div></div>';
        html += '<div class="prof-supplier-limit-line">' + window.escHtml(topLimit.limit_type) + ': ' + (topLimit.current_usage || 0) + ' / ' + (topLimit.limit_value || 0) + ' (' + pctDisplay + ')</div>';
      } else if (p.name === 'vercel' && p.cost_this_month === 0) {
        html += '<div class="prof-supplier-limit-line">No public dollar API — estimate from /v1/usage if VERCEL_API_TOKEN configured.</div>';
      }

      html += '</div>';
      return html;
    },

    // Build / rebuild the trend chart. Mode is 'overall' or 'by_tool'.
    // Chart.js is loaded globally in admin.html so we reference it via
    // window.Chart. The chart instance is stashed on self so toggling
    // mode destroys the previous chart cleanly.
    _wireProfitabilityChart: function() {
      var self = this;
      var canvas = document.getElementById('prof-trend-chart');
      if (!canvas) return;
      if (typeof window.Chart === 'undefined') {
        canvas.parentElement.innerHTML = '<div class="admin-empty">Chart library not loaded.</div>';
        return;
      }

      function render(mode) {
        if (self._profChart) { self._profChart.destroy(); self._profChart = null; }
        var trend = (self._profData && self._profData.trend) || {};
        var periods = trend.periods || [];
        var datasets;
        if (mode === 'by_tool') {
          var byTool = trend.by_tool || {};
          var palette = ['#4A6D8C','#E07A5F','#3D5A80','#81B29A','#F2CC8F','#B56576','#6D6875','#B5838D'];
          var keys = Object.keys(byTool).slice(0, 8);
          datasets = keys.map(function(tid, i) {
            return {
              label: self._toolName(tid),
              data: byTool[tid].map(function(p) { return p.margin_percent; }),
              borderColor: palette[i % palette.length],
              backgroundColor: 'transparent',
              tension: 0.2
            };
          });
          if (datasets.length === 0) {
            datasets = [{ label: 'No per-tool data', data: periods.map(function() { return null; }), borderColor: '#999' }];
          }
        } else {
          var overall = trend.overall || [];
          datasets = [{
            label: 'Overall margin %',
            data: overall.map(function(p) { return p.margin_percent; }),
            borderColor: '#4A6D8C',
            backgroundColor: 'rgba(74, 109, 140, 0.1)',
            fill: true,
            tension: 0.2
          }];
        }

        self._profChart = new window.Chart(canvas.getContext('2d'), {
          type: 'line',
          data: { labels: periods, datasets: datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: datasets.length > 1, position: 'bottom' } },
            scales: {
              y: { beginAtZero: false, ticks: { callback: function(v) { return v + '%'; } } }
            }
          }
        });
      }

      render('overall');

      document.querySelectorAll('.prof-chart-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.prof-chart-toggle').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          render(btn.getAttribute('data-mode'));
        });
      });
    },

    _wireProfManualForm: function() {
      var self = this;
      var btn = document.getElementById('prof-manual-submit');
      if (!btn) return;
      btn.addEventListener('click', function() {
        var providerBtn = document.getElementById('prof-manual-provider');
        var provider = providerBtn ? providerBtn.getAttribute('data-value') : '';
        var period = document.getElementById('prof-manual-period').value.trim();
        var usage = document.getElementById('prof-manual-value').value.trim();
        var cost = document.getElementById('prof-manual-cost').value.trim();
        var notes = document.getElementById('prof-manual-notes').value.trim();
        if (!provider || !period) { self._showError('Provider and period are required.'); return; }
        btn.disabled = true; btn.textContent = 'Saving…';
        self._postAdmin('admin-api-usage', {
          provider: provider,
          period: period,
          usage_value: usage || null,
          cost_estimate: cost ? parseFloat(cost) : null,
          notes: notes || null
        }).then(function() {
          // Reload the overview so the entry shows in history.
          self._renderOverview();
        }).catch(function(err) {
          self._showError('Could not save entry: ' + err.message);
        }).finally(function() {
          btn.disabled = false; btn.textContent = '+ Add Entry';
        });
      });
    },

    _wireProfManualDropdown: function() {
      var btn = document.getElementById('prof-manual-provider');
      var menu = document.getElementById('prof-manual-provider-menu');
      if (!btn || !menu) return;
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        menu.classList.toggle('open');
      });
      menu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function() {
          menu.querySelectorAll('.lookback-dropdown-item').forEach(function(i) { i.classList.remove('active'); });
          item.classList.add('active');
          btn.setAttribute('data-value', item.getAttribute('data-value'));
          btn.textContent = item.textContent;
          menu.classList.remove('open');
        });
      });
      document.addEventListener('click', function() { menu.classList.remove('open'); });
    }
  };

  Object.keys(modules).forEach(function(key) {
    window.ADMIN_LOGIC[key] = modules[key];
  });
})();
