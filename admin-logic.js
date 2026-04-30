window.ADMIN_LOGIC = {

  _supabase: null,
  _user: null,
  _session: null,
  _loaded: {},

  // ── INIT ───────────────────────────────────────────────────────
  init: async function(supabase) {
    var self = this;
    self._supabase = supabase;

    console.log('[admin] init started');

    // Auth gate — redirects to /login if no session.
    if (typeof window.requireAuth === 'function') {
      var ok = await window.requireAuth();
      if (!ok) {
        console.log('[admin] requireAuth returned false — redirected to /login');
        return;
      }
    }

    var sess = await supabase.auth.getSession();
    self._session = sess.data && sess.data.session;
    self._user = self._session && self._session.user;
    if (!self._user) {
      console.error('[admin] No user in session — redirecting to /login');
      window.location.href = '/login';
      return;
    }
    console.log('[admin] Authenticated user:', self._user.id, self._user.email);

    // is_admin check — first thing after auth, per spec.
    // Use .maybeSingle() so we can tell apart "no row" (returns null data,
    // null error — usually RLS blocking) from "row exists, has admin flag".
    var profileRes = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', self._user.id)
      .maybeSingle();

    console.log('[admin] Profile lookup result:', profileRes);

    if (profileRes.error) {
      console.error('[admin] Profile lookup error:', profileRes.error);
      self._showError('Could not verify admin access. ' + (profileRes.error.message || '') +
        ' Check the browser console for details.');
      return;
    }
    if (!profileRes.data) {
      // Row exists in profiles for this id (since the user is signed in
      // and has a profile somewhere) but RLS is hiding it from a SELECT,
      // OR the profiles row genuinely is missing.
      console.error('[admin] No profile row returned for user', self._user.id,
        '— most likely an RLS policy is blocking the read. Check that ' +
        '"users can read own profile" SELECT policy exists on profiles.');
      self._showError('Your profile row is not readable. Most likely an RLS ' +
        'policy is blocking SELECT on profiles for your user. Check the ' +
        'browser console for the user ID.');
      return;
    }

    console.log('[admin] is_admin value:', profileRes.data.is_admin,
      '(type: ' + typeof profileRes.data.is_admin + ')');

    if (profileRes.data.is_admin !== true) {
      console.warn('[admin] is_admin is not strictly true — redirecting to /dashboard.html');
      window.location.href = '/dashboard.html';
      return;
    }

    console.log('[admin] is_admin check passed — revealing page');
    document.getElementById('page-wrap').style.display = 'block';

    self._wireTabs();
    self._wireCustomerDetailClose();
    self._loadSection('overview');
  },

  // ── HELPERS ────────────────────────────────────────────────────
  _esc: function(s) {
    // shared-utils.escHtml does s.replace() without coercing first, so
    // numbers, booleans, etc. throw. Always hand it a string.
    var str = (s == null) ? '' : String(s);
    if (typeof window.escHtml === 'function') return window.escHtml(str);
    return str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _toolName: function(id) {
    var tools = window.CORE_TOOLS || [];
    var t = tools.find(function(x) { return x.id === id; });
    if (!t) return id;
    return Array.isArray(t.title) ? t.title.join(' ') : (t.title || id);
  },

  _formatMoney: function(dollars) {
    if (typeof dollars !== 'number' || isNaN(dollars)) return '—';
    return '$' + dollars.toLocaleString('en-AU');
  },

  _formatDate: function(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return '—'; }
  },

  _explainEmptyToolRevenue: function(diag) {
    if (!diag) return 'No tool revenue mapped.';
    if (diag.error) return 'Could not read tool_prices: ' + diag.error;
    if (diag.tool_prices_rows === 0) return 'tool_prices table is empty — populate it to map Stripe priceIds to tools.';
    if (diag.tool_prices_with_tool_id === 0) return 'tool_prices has rows but none have tool_id set (only bundle_tier). Individual-tool revenue cannot be mapped without tool_id values.';
    if (diag.stripe_price_ids === 0) return 'No active Stripe subscriptions. Once subscriptions exist they will appear here if their priceIds match tool_prices.';
    // We have rows on both sides but nothing matched — the priceIds in
    // active subscriptions are not present in tool_prices. Most often
    // this means all current subscriptions are bundle subscriptions
    // (their priceIds map to bundle_tier rows, which have no tool_id),
    // OR Stripe price IDs were rotated without updating tool_prices.
    if (diag.mapped_count === 0 && diag.unmatched_price_ids && diag.unmatched_price_ids.length > 0) {
      return 'No Stripe subscription priceIds match a tool_prices row with a tool_id set. ' +
             'If all current subscriptions are bundles, this is expected — bundle revenue is shown above. ' +
             'Otherwise the priceIds in tool_prices need to match the live Stripe priceIds.';
    }
    return 'No tool revenue mapped.';
  },

  _showError: function(msg) {
    if (typeof window.showModalError === 'function') {
      window.showModalError(msg);
    } else {
      alert(msg);
    }
  },

  _fetchAdmin: function(path) {
    var token = this._session && this._session.access_token;
    return fetch('/api/' + path, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) {
      if (!r.ok) {
        return r.json().then(function(d) { throw new Error(d && d.error ? d.error : 'Request failed'); });
      }
      return r.json();
    });
  },

  _postAdmin: function(path, body) {
    var token = this._session && this._session.access_token;
    return fetch('/api/' + path, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r) {
      if (!r.ok) {
        return r.json().then(function(d) { throw new Error(d && d.error ? d.error : 'Request failed'); });
      }
      return r.json();
    });
  },

  // ── TAB SWITCHING ──────────────────────────────────────────────
  _wireTabs: function() {
    var self = this;
    document.querySelectorAll('.ptab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.ptab').forEach(function(b) { b.classList.remove('settings-active'); });
        document.querySelectorAll('.ptab-content').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('settings-active');
        var tab = btn.getAttribute('data-tab');
        var panel = document.getElementById('tab-' + tab);
        if (panel) panel.classList.add('active');
        self._loadSection(tab);
      });
    });
  },

  _loadSection: function(tab) {
    if (this._loaded[tab]) return; // cache — refresh requires reload
    this._loaded[tab] = true;
    switch (tab) {
      case 'overview': return this._renderOverview();
      case 'api-costs': return this._renderApiCosts();
      case 'customers': return this._renderCustomers();
      case 'revenue': return this._renderRevenue();
      case 'usage': return this._renderUsage();
      case 'errors': return this._renderErrors();
      case 'infrastructure': return this._renderInfrastructure();
    }
  },

  // ── SECTION 1: DASHBOARD OVERVIEW ──────────────────────────────
  _renderOverview: function() {
    var self = this;
    var container = document.getElementById('section-overview');
    container.innerHTML = '<div class="admin-loading">Loading overview…</div>';

    self._fetchAdmin('admin-overview').then(function(d) {
      var m = d.metrics || {};
      var html = '<div class="admin-metric-grid">'
        + self._statCard('Total Customers', m.total_customers, '')
        + self._statCard('Active Subscriptions', m.active_subscriptions, '')
        + self._statCard('MRR', self._formatMoney(m.mrr), '/mth', 'green')
        + self._statCard('Churn This Month', (m.churn_count || 0) + ' (' + (m.churn_rate || 0) + '%)', '', m.churn_count > 0 ? 'red' : '')
        + self._statCard('New Signups (7 days)', m.new_signups_7d, '', 'orange')
        + self._statCard('Trial Users', m.trial_users, '', 'orange')
        + '</div>';

      // Quick lists: Recent Signups, Top Tools, Industry Breakdown
      html += '<div class="admin-list-grid">';
      html += self._listCard('Recent Signups', (d.recent_signups || []).map(function(p) {
        return {
          label: self._esc(p.business_name || p.email || p.id),
          value: self._formatDate(p.created_at)
        };
      }));
      html += self._listCard('Top Tools', (d.top_tools || []).map(function(t) {
        return { label: self._esc(self._toolName(t.id)), value: t.count + ' active' };
      }));
      html += self._listCard('Industry Breakdown', (d.industry_breakdown || []).map(function(i) {
        return { label: self._esc(i.industry), value: i.count };
      }));
      html += '</div>';

      container.innerHTML = html;
    }).catch(function(err) {
      container.innerHTML = '<div class="admin-empty">' + self._esc('Could not load overview: ' + err.message) + '</div>';
    });
  },

  _statCard: function(label, value, suffix, modifier) {
    var cls = 'stat-card' + (modifier ? ' ' + modifier : '');
    return '<div class="' + cls + '">'
      + '<div class="stat-value">' + this._esc(value == null ? '—' : value) + (suffix ? '<span style="font-size:14px;color:var(--text-muted);"> ' + this._esc(suffix) + '</span>' : '') + '</div>'
      + '<div class="stat-label">' + this._esc(label) + '</div>'
      + '</div>';
  },

  _listCard: function(title, items) {
    var html = '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">' + this._esc(title) + '</div></div>';
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

  // ── SECTION 2: API COST TRACKER ────────────────────────────────
  // Pulls automated cost data from /api/admin-costs (Anthropic +
  // Vercel + Serper) and manual entries from /api/admin-api-usage
  // (Predis + REimagine). Renders a per-customer summary, the
  // automated cost table with month-over-month trend, and a
  // Manual Tracking card with form + history filtered to the
  // providers without usage APIs.
  _renderApiCosts: function() {
    var self = this;
    var container = document.getElementById('section-api-costs');
    container.innerHTML = '<div class="admin-loading">Loading API usage…</div>';

    Promise.all([
      self._fetchAdmin('admin-costs'),
      self._fetchAdmin('admin-api-usage')
    ]).then(function(results) {
      var costs = results[0] || {};
      var manual = results[1] || {};
      self._renderApiCostsContent(container, costs, manual);
    }).catch(function(err) {
      container.innerHTML = '<div class="admin-empty">' + self._esc('Could not load API costs: ' + err.message) + '</div>';
    });
  },

  _renderApiCostsContent: function(container, costs, manual) {
    var self = this;
    var html = '';

    // Per-customer summary — automated total ÷ active paying customers.
    // Health indicator: <$10 green, $10-30 orange, >$30 red. Spec asked
    // for "% of average subscription" but that needs an extra Stripe
    // pagination call; the dollar thresholds are a reasonable proxy
    // until we wire ARPC through.
    var totalCurrent = (costs.totals && costs.totals.current_month_usd) || 0;
    var totalPrev = (costs.totals && costs.totals.previous_month_usd) || 0;
    var activeCustomers = manual.active_customers || 0;
    var costPerCustomer = activeCustomers > 0 ? +(totalCurrent / activeCustomers).toFixed(2) : 0;
    var modifier = costPerCustomer > 30 ? 'red' : (costPerCustomer > 10 ? 'orange' : 'green');
    var periodLabel = (costs.periods && costs.periods.current_month) || '';

    html += '<div class="admin-metric-grid">'
      + self._statCard('Total Spend (' + periodLabel + ')', self._formatMoney(totalCurrent))
      + self._statCard('Active Customers', activeCustomers)
      + self._statCard('Cost / Customer', self._formatMoney(costPerCustomer), '/mth', modifier)
      + self._statCard('vs Last Month', self._formatTrendText(costs.totals && costs.totals.trend_percent))
      + '</div>';

    // Automated Costs table
    var lastRefresh = self._timeAgo(costs.cached_at);
    html += '<div class="settings-card"><div class="settings-card-header">'
      + '<div class="settings-card-title">Automated Costs</div>'
      + '<div class="settings-card-hint">Refreshed every 5 minutes' + (lastRefresh ? ' — last refresh ' + self._esc(lastRefresh) : '') + '</div>'
      + '</div>';
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Provider</th><th>This Month</th><th>Last Month</th><th>Trend</th>'
      + '</tr></thead><tbody>';
    html += self._costRow('Anthropic Claude', costs.anthropic, false);
    html += self._costRow('Vercel', costs.vercel, false);
    html += self._costRow('Serper.dev', costs.serper, true);
    if (costs.totals) {
      html += '<tr style="font-weight:var(--font-weight-semibold);background:var(--bg-subtle);">'
        + '<td>Total</td>'
        + '<td>' + self._formatMoney(costs.totals.current_month_usd || 0) + '</td>'
        + '<td>' + self._formatMoney(costs.totals.previous_month_usd || 0) + '</td>'
        + '<td>' + self._formatTrend(costs.totals.trend_percent) + '</td>'
        + '</tr>';
    }
    html += '</tbody></table></div></div>';

    // Manual Tracking — Predis.ai and REimagine Home only.
    var manualProviders = [
      { id: 'predis', name: 'Predis.ai' },
      { id: 'reimagine', name: 'REimagine Home' }
    ];
    var manualEntries = (manual.entries || []).filter(function(e) {
      return e.provider === 'predis' || e.provider === 'reimagine';
    });

    html += '<div class="settings-card"><div class="settings-card-header">'
      + '<div class="settings-card-title">Manual Tracking</div>'
      + '<div class="settings-card-hint">These providers do not expose usage APIs — enter monthly figures manually from each provider\'s dashboard.</div>'
      + '</div>';
    html += '<div class="admin-entry-form" id="api-usage-form">'
      + '<span class="lookback-dropdown-wrap api-provider-wrap">'
      + '<button type="button" class="lookback-dropdown lookback-dropdown-field" id="api-usage-provider" data-value="' + self._esc(manualProviders[0].id) + '">' + self._esc(manualProviders[0].name) + '</button>'
      + '<div class="lookback-dropdown-menu" id="api-usage-provider-menu">'
      + manualProviders.map(function(p, i) {
        return '<button type="button" class="lookback-dropdown-item' + (i === 0 ? ' active' : '') + '" data-value="' + self._esc(p.id) + '">' + self._esc(p.name) + '</button>';
      }).join('')
      + '</div>'
      + '</span>'
      + '<input type="text" class="form-input" id="api-usage-period" placeholder="YYYY-MM" value="' + self._esc(manual.period || '') + '">'
      + '<input type="text" class="form-input" id="api-usage-value" placeholder="Usage">'
      + '<input type="number" step="0.01" class="form-input" id="api-usage-cost" placeholder="Cost AUD">'
      + '<input type="text" class="form-input" id="api-usage-notes" placeholder="Notes (optional)">'
      + '<button class="btn-add-connection" id="api-usage-submit">+ Add Entry</button>'
      + '</div>';

    if (manual.note) {
      html += '<div class="admin-note" style="margin:0 16px 16px;">' + self._esc(manual.note) + '</div>';
    }
    html += '</div>';

    // Manual entries history — filtered to manual providers only.
    html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Manual Entries — History</div></div>';
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Provider</th><th>Period</th><th>Usage</th><th>Cost</th><th>Notes</th><th>Entered</th>'
      + '</tr></thead><tbody>';
    if (manualEntries.length === 0) {
      html += '<tr><td colspan="6" class="admin-empty">No manual entries yet.</td></tr>';
    } else {
      manualEntries.forEach(function(e) {
        html += '<tr>'
          + '<td>' + self._esc(e.provider || '') + '</td>'
          + '<td>' + self._esc(e.period || '') + '</td>'
          + '<td>' + self._esc(e.usage_value || '—') + '</td>'
          + '<td>' + (typeof e.cost_estimate === 'number' ? self._formatMoney(e.cost_estimate) : '—') + '</td>'
          + '<td>' + self._esc(e.notes || '') + '</td>'
          + '<td>' + self._formatDate(e.entered_at) + '</td>'
          + '</tr>';
      });
    }
    html += '</tbody></table></div></div>';

    container.innerHTML = html;
    self._wireApiUsageForm();
    self._wireApiProviderDropdown();
  },

  _costRow: function(name, data, includeSearches) {
    var self = this;
    if (!data) {
      return '<tr><td>' + self._esc(name) + '</td><td colspan="3" class="admin-empty">No data</td></tr>';
    }
    if (data.error) {
      return '<tr><td>' + self._esc(name) + '</td><td colspan="3" class="admin-empty">' + self._esc(data.error) + '</td></tr>';
    }
    var current = data.current_month;
    var prev = data.previous_month;
    var currentCost = current && typeof current.cost_usd === 'number' ? current.cost_usd : 0;
    var prevCost = prev && typeof prev.cost_usd === 'number' ? prev.cost_usd : 0;
    var currentLabel = self._formatMoney(currentCost);
    if (includeSearches && current && typeof current.searches === 'number') {
      currentLabel += ' <span style="color:var(--text-muted);font-size:var(--badge-font-size);">(' + current.searches.toLocaleString('en-AU') + ' searches)</span>';
    }
    return '<tr>'
      + '<td>' + self._esc(name) + '</td>'
      + '<td>' + currentLabel + '</td>'
      + '<td>' + self._formatMoney(prevCost) + '</td>'
      + '<td>' + self._formatTrend(data.trend_percent) + '</td>'
      + '</tr>';
  },

  _formatTrend: function(pct) {
    if (pct == null || isNaN(pct)) return '<span style="color:var(--text-muted);">—</span>';
    var arrow = pct > 0 ? '↑' : (pct < 0 ? '↓' : '→');
    var color = pct > 0 ? 'var(--red)' : (pct < 0 ? 'var(--green)' : 'var(--text-muted)');
    return '<span style="color:' + color + ';">' + arrow + ' ' + Math.abs(pct).toFixed(1) + '%</span>';
  },

  _formatTrendText: function(pct) {
    if (pct == null || isNaN(pct)) return '—';
    var arrow = pct > 0 ? '↑' : (pct < 0 ? '↓' : '→');
    return arrow + ' ' + Math.abs(pct).toFixed(1) + '%';
  },

  _timeAgo: function(iso) {
    if (!iso) return '';
    var diffMs = Date.now() - new Date(iso).getTime();
    if (isNaN(diffMs) || diffMs < 0) return '';
    var minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return minutes + ' minutes ago';
    var hours = Math.floor(minutes / 60);
    return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
  },

  _wireApiProviderDropdown: function() {
    var btn = document.getElementById('api-usage-provider');
    var menu = document.getElementById('api-usage-provider-menu');
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
  },

  _wireApiUsageForm: function() {
    var self = this;
    var btn = document.getElementById('api-usage-submit');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var providerBtn = document.getElementById('api-usage-provider');
      var provider = providerBtn ? providerBtn.getAttribute('data-value') : '';
      var period = document.getElementById('api-usage-period').value.trim();
      var usage = document.getElementById('api-usage-value').value.trim();
      var cost = document.getElementById('api-usage-cost').value.trim();
      var notes = document.getElementById('api-usage-notes').value.trim();
      if (!provider || !period) { self._showError('Provider and period are required.'); return; }
      btn.disabled = true; btn.textContent = 'Saving…';
      self._postAdmin('admin-api-usage', {
        provider: provider,
        period: period,
        usage_value: usage || null,
        cost_estimate: cost ? parseFloat(cost) : null,
        notes: notes || null
      }).then(function() {
        // Reload section to reflect new entry.
        self._loaded['api-costs'] = false;
        self._renderApiCosts();
        self._loaded['api-costs'] = true;
      }).catch(function(err) {
        self._showError('Could not save entry: ' + err.message);
      }).finally(function() {
        btn.disabled = false; btn.textContent = '+ Add Entry';
      });
    });
  },

  // ── SECTION 3: CUSTOMERS ───────────────────────────────────────
  _renderCustomers: function() {
    var self = this;
    var container = document.getElementById('section-customers');

    // Filter bar — gather industries from existing CORE_TOOLS data
    var industries = ['pool','plumber','electrician','builder','hvac','fabricator','cleaner','landscaper','manufacturer','concreter','handyman'];
    var industryOptions = [{ value: '', label: 'Any' }].concat(industries.map(function(i) {
      return { value: i, label: i };
    }));
    var bundleOptions = [
      { value: '', label: 'Any' },
      { value: 'stax3', label: 'STAX3' },
      { value: 'stax6', label: 'STAX6' },
      { value: 'stax-all', label: 'STAX All' }
    ];
    var trialOptions = [
      { value: '', label: 'Any' },
      { value: 'true', label: 'Trial' },
      { value: 'false', label: 'Paid' }
    ];

    var html = '<div class="admin-filters">'
      + '<span class="admin-filter-label">Search</span>'
      + '<input type="text" class="form-input" id="cust-search" placeholder="Email or business name">'
      + '<span class="admin-filter-label">Industry</span>'
      + self._dropdownHtml('cust-industry', 'cust-industry-wrap', industryOptions)
      + '<span class="admin-filter-label">Plan</span>'
      + self._dropdownHtml('cust-bundle', 'cust-bundle-wrap', bundleOptions)
      + '<span class="admin-filter-label">Trial</span>'
      + self._dropdownHtml('cust-trial', 'cust-trial-wrap', trialOptions)
      + '<span class="admin-filter-label">Signup after</span>'
      + '<input type="date" class="form-input" id="cust-after">'
      + '<span class="admin-filter-label">Min tools</span>'
      + '<input type="number" min="0" class="form-input" id="cust-min-tools" style="min-width:80px;">'
      + '<button class="btn-add-connection" id="cust-apply">Apply</button>'
      + '</div>';

    html += '<div id="cust-table-wrap"><div class="admin-loading">Loading customers…</div></div>';
    container.innerHTML = html;

    self._wireCustomerFilters();
    self._fetchCustomers();
  },

  _wireCustomerFilters: function() {
    var self = this;
    var btn = document.getElementById('cust-apply');
    if (!btn) return;
    btn.addEventListener('click', function() { self._fetchCustomers(); });

    var search = document.getElementById('cust-search');
    if (search) {
      search.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') self._fetchCustomers();
      });
    }

    self._wireDropdown('cust-industry');
    self._wireDropdown('cust-bundle');
    self._wireDropdown('cust-trial');
  },

  // Render a .lookback-dropdown trigger + menu. options is
  // [{ value, label }, ...]. The first option is shown as the initial
  // label and stored in data-value on the trigger.
  _dropdownHtml: function(id, wrapClass, options) {
    var self = this;
    var first = options[0] || { value: '', label: '—' };
    var html = '<span class="lookback-dropdown-wrap ' + self._esc(wrapClass) + '">'
      + '<button type="button" class="lookback-dropdown lookback-dropdown-field" id="' + self._esc(id) + '" data-value="' + self._esc(first.value) + '">' + self._esc(first.label) + '</button>'
      + '<div class="lookback-dropdown-menu" id="' + self._esc(id) + '-menu">';
    options.forEach(function(opt, i) {
      html += '<button type="button" class="lookback-dropdown-item' + (i === 0 ? ' active' : '') + '" data-value="' + self._esc(opt.value) + '">' + self._esc(opt.label) + '</button>';
    });
    html += '</div></span>';
    return html;
  },

  // Wire a .lookback-dropdown trigger by id. Picking an item updates
  // the trigger's data-value + visible label and closes the menu.
  _wireDropdown: function(btnId) {
    var btn = document.getElementById(btnId);
    var menu = document.getElementById(btnId + '-menu');
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
  },

  _fetchCustomers: function() {
    var self = this;
    var wrap = document.getElementById('cust-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="admin-loading">Loading customers…</div>';

    var params = new URLSearchParams();
    var search = document.getElementById('cust-search');
    var industry = document.getElementById('cust-industry');
    var bundle = document.getElementById('cust-bundle');
    var trial = document.getElementById('cust-trial');
    var after = document.getElementById('cust-after');
    var minTools = document.getElementById('cust-min-tools');

    var industryVal = industry ? industry.getAttribute('data-value') : '';
    var bundleVal = bundle ? bundle.getAttribute('data-value') : '';
    var trialVal = trial ? trial.getAttribute('data-value') : '';

    if (search && search.value.trim()) params.set('search', search.value.trim());
    if (industryVal) params.set('industry', industryVal);
    if (bundleVal) params.set('bundle', bundleVal);
    if (trialVal) params.set('trial', trialVal);
    if (after && after.value) params.set('signup_after', after.value);
    if (minTools && minTools.value) params.set('min_tools', minTools.value);

    self._fetchAdmin('admin-customers?' + params.toString()).then(function(d) {
      var rows = d.customers || [];
      self._customers = rows;
      var html = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Email</th><th>Business</th><th>Industry</th><th>Tools</th><th>Plan</th><th>Trial</th><th>MRR</th><th>Signed up</th>'
        + '</tr></thead><tbody>';
      if (rows.length === 0) {
        html += '<tr><td colspan="8" class="admin-empty">No customers match those filters.</td></tr>';
      } else {
        rows.forEach(function(c) {
          var inds = Array.isArray(c.industry) ? c.industry.join(', ') : (c.industry || '—');
          var tools = Array.isArray(c.activated_tools) ? c.activated_tools.length : 0;
          var mrr = self._customerMrr(c);
          html += '<tr class="clickable" data-id="' + self._esc(c.id) + '">'
            + '<td>' + self._esc(c.email || '') + '</td>'
            + '<td>' + self._esc(c.business_name || '—') + '</td>'
            + '<td>' + self._esc(inds) + '</td>'
            + '<td>' + tools + '</td>'
            + '<td>' + self._esc(c.bundle_tier || (tools > 0 ? 'individual' : '—')) + '</td>'
            + '<td>' + (c.is_trial ? 'Trial' : 'Paid') + '</td>'
            + '<td>' + (mrr != null ? self._formatMoney(mrr) : '—') + '</td>'
            + '<td>' + self._formatDate(c.created_at) + '</td>'
            + '</tr>';
        });
      }
      html += '</tbody></table></div>';
      html += '<div class="admin-note" style="margin-top:8px;">Showing ' + rows.length + ' customer' + (rows.length === 1 ? '' : 's') + '. Click a row for full detail.</div>';
      wrap.innerHTML = html;

      wrap.querySelectorAll('tr.clickable').forEach(function(tr) {
        tr.addEventListener('click', function() {
          self._showCustomerDetail(tr.getAttribute('data-id'));
        });
      });
    }).catch(function(err) {
      wrap.innerHTML = '<div class="admin-empty">' + self._esc('Could not load customers: ' + err.message) + '</div>';
    });
  },

  // Approximate MRR from activated tools using the live tool_prices map
  // would need an extra fetch; for now derive from CORE_TOOLS hardcoded prices.
  _customerMrr: function(c) {
    if (c.is_trial) return 0;
    var tools = window.CORE_TOOLS || [];
    var arr = Array.isArray(c.activated_tools) ? c.activated_tools : [];
    var sum = 0;
    arr.forEach(function(id) {
      var t = tools.find(function(x) { return x.id === id; });
      if (t && t.price) {
        var match = String(t.price).match(/\$\s*([\d.]+)/);
        if (match) sum += parseFloat(match[1]);
      }
    });
    return Math.round(sum);
  },

  _showCustomerDetail: function(id) {
    var self = this;
    var customer = (self._customers || []).find(function(c) { return c.id === id; });
    if (!customer) return;
    var titleEl = document.getElementById('customer-detail-title');
    var bodyEl = document.getElementById('customer-detail-body');
    titleEl.textContent = customer.business_name || customer.email || 'Customer';

    var rows = [
      ['Email', customer.email || '—'],
      ['Business name', customer.business_name || '—'],
      ['Industry', Array.isArray(customer.industry) ? customer.industry.join(', ') : (customer.industry || '—')],
      ['Bundle tier', customer.bundle_tier || (customer.is_trial ? 'Trial' : 'Individual tools')],
      ['Trial', customer.is_trial ? 'Yes' : 'No'],
      ['Trial expires', customer.trial_expires_at ? self._formatDate(customer.trial_expires_at) : '—'],
      ['Signed up', self._formatDate(customer.created_at)],
      ['Stripe customer', customer.stripe_customer_id || '—'],
      ['Activated tools', (Array.isArray(customer.activated_tools) ? customer.activated_tools : []).map(function(id) {
        return self._toolName(id);
      }).join(', ') || '—'],
      ['MRR contribution', self._formatMoney(self._customerMrr(customer))]
    ];
    var html = '';
    rows.forEach(function(r) {
      html += '<div class="admin-detail-row">'
        + '<span class="admin-detail-label">' + self._esc(r[0]) + '</span>'
        + '<span class="admin-detail-value">' + self._esc(r[1]) + '</span>'
        + '</div>';
    });
    bodyEl.innerHTML = html;
    document.getElementById('customer-detail-overlay').classList.add('open');
  },

  _wireCustomerDetailClose: function() {
    var self = this;
    var overlay = document.getElementById('customer-detail-overlay');
    var closeBtn = document.getElementById('customer-detail-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { self._closeCustomerDetail(); });
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) self._closeCustomerDetail();
      });
    }
  },

  _closeCustomerDetail: function() {
    var overlay = document.getElementById('customer-detail-overlay');
    if (overlay) overlay.classList.remove('open');
  },

  // ── SECTION 4: REVENUE ─────────────────────────────────────────
  _renderRevenue: function() {
    var self = this;
    var container = document.getElementById('section-revenue');
    container.innerHTML = '<div class="admin-loading">Loading revenue…</div>';

    self._fetchAdmin('admin-overview').then(function(d) {
      var m = d.metrics || {};
      var html = '<div class="admin-metric-grid">'
        + self._statCard('MRR', self._formatMoney(m.mrr), '/mth', 'green')
        + self._statCard('ARR', self._formatMoney(m.arr), '/yr', 'green')
        + self._statCard('Avg Revenue / Customer', self._formatMoney(m.arpc), '/mth')
        + self._statCard('Churn Rate', (m.churn_rate || 0) + '%', '', m.churn_rate > 5 ? 'red' : '')
        + self._statCard('Net Revenue Retention', '—', '', '')
        + '</div>';

      // Revenue by bundle
      var rb = d.revenue_by_bundle || {};
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Revenue by Bundle</div></div>';
      html += '<div class="settings-rows" style="padding:14px 20px;">';
      [
        ['STAX3', rb.stax3],
        ['STAX6', rb.stax6],
        ['STAX All', rb['stax-all']],
        ['Individual tools', rb.individual]
      ].forEach(function(r) {
        html += '<div class="admin-list-item"><span class="admin-list-item-label">' + self._esc(r[0]) + '</span><span class="admin-list-item-value">' + self._formatMoney(r[1] || 0) + '/mth</span></div>';
      });
      html += '</div></div>';

      // Revenue by tool
      var rt = d.revenue_by_tool || [];
      var diag = d.revenue_by_tool_diagnostic || {};
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Revenue by Tool</div></div>';
      html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Tool</th><th>MRR</th></tr></thead><tbody>';
      if (rt.length === 0) {
        html += '<tr><td colspan="2" class="admin-empty">' + self._esc(self._explainEmptyToolRevenue(diag)) + '</td></tr>';
      } else {
        rt.forEach(function(t) {
          html += '<tr><td>' + self._esc(self._toolName(t.tool_id)) + '</td><td>' + self._formatMoney(t.mrr) + '/mth</td></tr>';
        });
      }
      html += '</tbody></table></div></div>';

      // Diagnostic note when revenue_by_tool is empty but we have stripe data
      if (rt.length === 0 && diag && diag.unmatched_price_ids && diag.unmatched_price_ids.length > 0) {
        html += '<div class="admin-note" style="font-family:monospace;font-size:11px;">Stripe priceIds not matched in tool_prices: ' + self._esc(diag.unmatched_price_ids.join(', ')) + '</div>';
      }

      // Recent cancellations
      var rc = d.recent_cancellations || [];
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Recent Cancellations (this month)</div></div>';
      html += '<div class="settings-rows" style="padding:14px 20px;">';
      if (rc.length === 0) {
        html += '<div class="admin-empty">No cancellations this month.</div>';
      } else {
        rc.forEach(function(c) {
          var when = c.canceled_at ? new Date(c.canceled_at * 1000) : null;
          var label = c.metadata && c.metadata.tier ? c.metadata.tier : (c.metadata && c.metadata.toolId ? c.metadata.toolId : 'Subscription');
          // Prefer customer name → email → Stripe customer id, in that
          // order, so deleted customers (where the expand returns a
          // sentinel) still get something readable.
          var who = c.customer_name || c.customer_email || c.customer_id || '—';
          html += '<div class="admin-list-item"><span class="admin-list-item-label">' + self._esc(label) + ' &middot; ' + self._esc(who) + '</span><span class="admin-list-item-value">' + (when ? when.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—') + '</span></div>';
        });
      }
      html += '</div></div>';

      html += '<div class="admin-note">12-month MRR trend chart not yet implemented — add when a charting library is selected.</div>';

      container.innerHTML = html;
    }).catch(function(err) {
      container.innerHTML = '<div class="admin-empty">' + self._esc('Could not load revenue: ' + err.message) + '</div>';
    });
  },

  // ── SECTION 5: TOOL USAGE ──────────────────────────────────────
  _renderUsage: function() {
    var self = this;
    var container = document.getElementById('section-usage');
    container.innerHTML = '<div class="admin-loading">Loading tool usage…</div>';

    self._fetchAdmin('admin-data?section=usage').then(function(d) {
      var html = '';
      if (d.usage_note) {
        html += '<div class="admin-note">' + self._esc(d.usage_note) + '</div>';
      }
      html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Tool</th><th>Activations</th><th>Unique users (30d)</th><th>Total uses (30d)</th><th>Avg uses / user</th>'
        + '</tr></thead><tbody>';
      var tools = d.tools || [];
      if (tools.length === 0) {
        html += '<tr><td colspan="5" class="admin-empty">No tools activated yet.</td></tr>';
      } else {
        tools.forEach(function(t) {
          html += '<tr>'
            + '<td>' + self._esc(self._toolName(t.tool_id)) + '</td>'
            + '<td>' + t.activations + '</td>'
            + '<td>' + t.unique_users_30d + '</td>'
            + '<td>' + t.total_uses_30d + '</td>'
            + '<td>' + (t.avg_uses_per_user || 0) + '</td>'
            + '</tr>';
        });
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;
    }).catch(function(err) {
      container.innerHTML = '<div class="admin-empty">' + self._esc('Could not load tool usage: ' + err.message) + '</div>';
    });
  },

  // ── SECTION 6: ERROR MONITOR ───────────────────────────────────
  _renderErrors: function() {
    var self = this;
    var container = document.getElementById('section-errors');
    container.innerHTML = '<div class="admin-loading">Loading errors…</div>';

    self._fetchAdmin('admin-data?section=errors').then(function(d) {
      var html = '';
      if (d.note) {
        html += '<div class="admin-note">' + self._esc(d.note) + '</div>';
      }
      html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Time</th><th>Endpoint</th><th>User</th><th>Message</th><th>Details</th>'
        + '</tr></thead><tbody>';
      var errs = d.errors || [];
      if (errs.length === 0) {
        html += '<tr><td colspan="5" class="admin-empty">No errors recorded.</td></tr>';
      } else {
        errs.forEach(function(e) {
          var details = '';
          if (e.details) {
            try {
              details = typeof e.details === 'string' ? e.details : JSON.stringify(e.details);
            } catch (ex) { details = ''; }
          }
          html += '<tr>'
            + '<td>' + self._esc(e.created_at ? new Date(e.created_at).toLocaleString('en-AU') : '—') + '</td>'
            + '<td>' + self._esc(e.endpoint || '—') + '</td>'
            + '<td>' + self._esc(e.user_id || '—') + '</td>'
            + '<td>' + self._esc(e.message || '—') + '</td>'
            + '<td>' + (details ? '<details><summary>view</summary><pre style="font-size:11px;white-space:pre-wrap;word-break:break-word;">' + self._esc(details) + '</pre></details>' : '—') + '</td>'
            + '</tr>';
        });
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;
    }).catch(function(err) {
      container.innerHTML = '<div class="admin-empty">' + self._esc('Could not load errors: ' + err.message) + '</div>';
    });
  },

  // ── SECTION 7: INFRASTRUCTURE ──────────────────────────────────
  // Fetches row counts (via admin-data) and live external service
  // status (via admin-status) in parallel. Status maps the Atlassian
  // Statuspage indicator to platform dot classes (up/warn/down).
  _renderInfrastructure: function() {
    var self = this;
    var container = document.getElementById('section-infrastructure');
    container.innerHTML = '<div class="admin-loading">Loading infrastructure…</div>';

    Promise.all([
      self._fetchAdmin('admin-data?section=infrastructure'),
      self._fetchAdmin('admin-status')
    ]).then(function(results) {
      var infra = results[0] || {};
      var status = results[1] || {};
      self._renderInfrastructureContent(container, infra, status);
    }).catch(function(err) {
      container.innerHTML = '<div class="admin-empty">' + self._esc('Could not load infrastructure: ' + err.message) + '</div>';
    });
  },

  _renderInfrastructureContent: function(container, infra, status) {
    var self = this;
    var counts = infra.row_counts || {};
    var html = '';

    // Row counts
    html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Key Table Row Counts</div></div>';
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Table</th><th>Rows</th></tr></thead><tbody>';
    Object.keys(counts).forEach(function(t) {
      var n = counts[t];
      html += '<tr><td>' + self._esc(t) + '</td><td>' + (n == null ? '— (table missing)' : n.toLocaleString('en-AU')) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    // External services — live from each provider's Atlassian Statuspage
    var services = status.services || [];
    var lastChecked = self._timeAgo(status.checked_at);
    var statusUrls = {
      'Stripe': 'https://status.stripe.com/',
      'Supabase': 'https://status.supabase.com/',
      'Anthropic': 'https://status.anthropic.com/',
      'Vercel': 'https://www.vercel-status.com/'
    };

    html += '<div class="settings-card"><div class="settings-card-header">'
      + '<div class="settings-card-title">External Services</div>'
      + '<div class="settings-card-hint">Live status from each provider\'s status page'
      + (lastChecked ? ' — last checked ' + self._esc(lastChecked) : '')
      + '. <button id="status-refresh" style="background:none;border:none;color:var(--blue);cursor:pointer;font-size:var(--note-font-size);padding:0;font-family:inherit;text-decoration:underline;">Refresh</button></div>'
      + '</div>';
    html += '<div class="settings-rows" style="padding:14px 20px;">';
    if (services.length === 0) {
      html += '<div class="admin-empty">Status not available.</div>';
    } else {
      services.forEach(function(s) {
        var dotClass = '';
        var label = '';
        if (s.status === 'operational') { dotClass = 'up'; label = 'Operational'; }
        else if (s.status === 'degraded') { dotClass = 'warn'; label = 'Degraded performance'; }
        else if (s.status === 'major') { dotClass = 'down'; label = 'Major outage'; }
        else if (s.status === 'critical') { dotClass = 'down'; label = 'Critical outage'; }
        else { label = s.error ? 'Status unavailable' : 'Status unknown'; }

        var url = statusUrls[s.name] || '';
        html += '<div class="admin-status-row">'
          + '<span class="admin-status-dot ' + dotClass + '"></span>'
          + '<span class="admin-status-name">' + self._esc(s.name) + '</span>'
          + '<span style="color:var(--text-muted);font-size:var(--note-font-size);margin-right:12px;">' + self._esc(label) + '</span>'
          + (url ? '<a href="' + self._esc(url) + '" target="_blank" rel="noopener noreferrer" style="font-size:var(--note-font-size);color:var(--blue);">Status page</a>' : '')
          + '</div>';
      });
    }
    html += '</div></div>';

    html += '<div class="admin-note">Storage usage and database size are not exposed via the Supabase JS client. Check the Supabase dashboard directly until a server-side integration is added.</div>';

    container.innerHTML = html;

    var refreshBtn = document.getElementById('status-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        // Front-end cache invalidate + re-fetch. The server-side cache
        // (5 min) still applies, so a click within 5 min returns the
        // same payload — that's acceptable for an admin tool.
        refreshBtn.textContent = 'Refreshing…';
        refreshBtn.disabled = true;
        self._loaded['infrastructure'] = false;
        self._renderInfrastructure();
        self._loaded['infrastructure'] = true;
      });
    }
  }
};
