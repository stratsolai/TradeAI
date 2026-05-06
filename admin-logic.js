window.ADMIN_LOGIC = {

  _supabase: null,
  _user: null,
  _session: null,
  _toolPricesByTool: {},

  // ── INIT ───────────────────────────────────────────────────────
  init: async function(supabase, user) {
    var self = this;
    self._supabase = supabase;
    self._user = user || null;

    console.log('[admin] init started');

    var sess = await supabase.auth.getSession();
    self._session = sess.data && sess.data.session;
    if (!self._user) self._user = self._session && self._session.user;
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
    document.body.classList.add('admin-authenticated');

    self._wireTabs();
    self._wireCustomerDetailClose();
    self._loadSection('overview');
  },

  // ── HELPERS ────────────────────────────────────────────────────
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
    } catch (e) {
      console.error('[admin] _formatDate error:', e && e.message);
      return '—';
    }
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
  // Each click reloads the section data — no client-side caching, so the
  // owner sees fresh figures on every click.
  _wireTabs: function() {
    var self = this;
    document.querySelectorAll('.ptab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.ptab').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.ptab-content').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var tab = btn.getAttribute('data-tab');
        var panel = document.getElementById('tab-' + tab);
        if (panel) panel.classList.add('active');
        self._loadSection(tab);
      });
    });
  },

  _loadSection: function(tab) {
    switch (tab) {
      case 'overview': return this._renderOverview();
      case 'customers': return this._renderCustomers();
      case 'revenue': return this._renderRevenue();
      case 'usage': return this._renderUsage();
      case 'errors': return this._renderErrors();
      case 'infrastructure': return this._renderInfrastructure();
    }
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

  // ── SECTION 3: CUSTOMERS ───────────────────────────────────────
  // Filters use the cl-review.js pill-toggle pattern:
  //   - top row: search + signup-after + min-tools (free-text inputs)
  //   - filter-btns row: Filter By Industry / Plan / Trial / Clear All
  //   - hidden filter-row that reveals .filter-pill rows when a
  //     toggle button is open
  // All filters apply client-side against the loaded customer list,
  // so toggling a pill is instant — no API round-trip per click.
  _renderCustomers: function() {
    var self = this;
    var container = document.getElementById('section-customers');

    // Filter state — multi-select arrays per cl-review pattern.
    self._customerFilters = self._customerFilters || {
      industries: [],
      plans: [],
      trial: [],
      search: '',
      signupAfter: '',
      minTools: ''
    };

    var html = '<div class="admin-filter-search-row">'
      + '<input type="text" class="form-input" id="cust-search" placeholder="Search by email or business name">'
      + '<span class="filter-section-label">Signup after</span>'
      + '<input type="date" class="form-input" id="cust-after">'
      + '<span class="filter-section-label">Min tools</span>'
      + '<input type="number" min="0" class="form-input form-input-sm" id="cust-min-tools">'
      + '</div>'
      + '<div class="filter-btns-row">'
      + '<button class="filter-btn filter-industry-btn">&#9783; Filter By Industry</button>'
      + '<button class="filter-btn filter-plan-btn">&#9776; Filter By Plan</button>'
      + '<button class="filter-btn filter-trial-btn">&#9783; Filter By Trial</button>'
      + '<button class="clear-filters-btn">&#10005; Clear All Filters</button>'
      + '</div>'
      + '<div id="cust-filter-row" class="admin-filter-row" style="display:none">'
      + '<div id="cust-industry-pills-wrap" style="display:none"><div class="filter-section-label">Industry</div><div id="cust-industry-pills" class="review-pill-row"></div></div>'
      + '<div id="cust-plan-pills-wrap" style="display:none"><div class="filter-section-label">Plan</div><div id="cust-plan-pills" class="review-pill-row"></div></div>'
      + '<div id="cust-trial-pills-wrap" style="display:none"><div class="filter-section-label">Trial</div><div id="cust-trial-pills" class="review-pill-row"></div></div>'
      + '</div>'
      + '<div id="cust-table-wrap"><div class="list-loading">Loading customers…</div></div>';
    container.innerHTML = html;

    self._wireCustomerFilters();
    self._fetchCustomers();
  },

  _wireCustomerFilters: function() {
    var self = this;
    var search = document.getElementById('cust-search');
    if (search) {
      search.value = self._customerFilters.search || '';
      search.addEventListener('input', function() {
        self._customerFilters.search = this.value;
        self._renderCustomerList();
      });
    }
    var after = document.getElementById('cust-after');
    if (after) {
      after.value = self._customerFilters.signupAfter || '';
      after.addEventListener('change', function() {
        self._customerFilters.signupAfter = this.value;
        self._renderCustomerList();
      });
    }
    var minTools = document.getElementById('cust-min-tools');
    if (minTools) {
      minTools.value = self._customerFilters.minTools || '';
      minTools.addEventListener('input', function() {
        self._customerFilters.minTools = this.value;
        self._renderCustomerList();
      });
    }

    var btnIndustry = document.querySelector('.filter-industry-btn');
    var btnPlan = document.querySelector('.filter-plan-btn');
    var btnTrial = document.querySelector('.filter-trial-btn');
    var btnClear = document.querySelector('.clear-filters-btn');

    function refreshFilterRow() {
      var open = {
        industry: btnIndustry && btnIndustry.classList.contains('open'),
        plan: btnPlan && btnPlan.classList.contains('open'),
        trial: btnTrial && btnTrial.classList.contains('open')
      };
      var iWrap = document.getElementById('cust-industry-pills-wrap');
      var pWrap = document.getElementById('cust-plan-pills-wrap');
      var tWrap = document.getElementById('cust-trial-pills-wrap');
      if (iWrap) iWrap.style.display = open.industry ? '' : 'none';
      if (pWrap) pWrap.style.display = open.plan ? '' : 'none';
      if (tWrap) tWrap.style.display = open.trial ? '' : 'none';
      var row = document.getElementById('cust-filter-row');
      if (row) row.style.display = (open.industry || open.plan || open.trial) ? 'block' : 'none';
    }

    function makeToggle(btn, kind) {
      if (!btn) return;
      btn.addEventListener('click', function() {
        var isOpen = btn.classList.contains('open');
        btn.classList.toggle('open', !isOpen);
        if (!isOpen) self._renderCustomerFilterPills();
        refreshFilterRow();
        self._updateCustomerFilterIndicators();
      });
    }
    makeToggle(btnIndustry, 'industry');
    makeToggle(btnPlan, 'plan');
    makeToggle(btnTrial, 'trial');

    if (btnClear) {
      btnClear.addEventListener('click', function() {
        self._customerFilters.industries = [];
        self._customerFilters.plans = [];
        self._customerFilters.trial = [];
        self._customerFilters.search = '';
        self._customerFilters.signupAfter = '';
        self._customerFilters.minTools = '';
        if (search) search.value = '';
        if (after) after.value = '';
        if (minTools) minTools.value = '';
        if (btnIndustry) btnIndustry.classList.remove('open', 'active');
        if (btnPlan) btnPlan.classList.remove('open', 'active');
        if (btnTrial) btnTrial.classList.remove('open', 'active');
        refreshFilterRow();
        self._renderCustomerList();
      });
    }
  },

  // Industry options come from window.BP_INDUSTRY_DATA — the canonical
  // industry list used by signup, BP, and every tool. Avoids hardcoding a
  // separate list here and ensures filter values match what is stored on
  // profiles.industry (which is the group's display name).
  _renderCustomerFilterPills: function() {
    var self = this;
    var industryGroups = (window.BP_INDUSTRY_DATA && window.BP_INDUSTRY_DATA.groups) || [];
    var industries = industryGroups.map(function(g) { return g.name; });
    var plans = [
      { value: 'stax3', label: 'STAX3' },
      { value: 'stax6', label: 'STAX6' },
      { value: 'stax-all', label: 'STAX All' },
      { value: 'individual', label: 'Individual tools' }
    ];
    var trials = [
      { value: 'true', label: 'Trial' },
      { value: 'false', label: 'Paid' }
    ];

    function renderPills(containerId, items, getId, getLabel, activeArr) {
      var el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = items.map(function(it) {
        var id = getId(it);
        var isActive = activeArr.indexOf(id) > -1;
        return '<button class="filter-pill' + (isActive ? ' active' : '') + '" data-value="' + window.escHtml(id) + '">' + window.escHtml(getLabel(it)) + '</button>';
      }).join('');
      el.querySelectorAll('.filter-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
          var v = pill.getAttribute('data-value');
          var idx = activeArr.indexOf(v);
          if (idx > -1) activeArr.splice(idx, 1);
          else activeArr.push(v);
          self._renderCustomerFilterPills();
          self._renderCustomerList();
          self._updateCustomerFilterIndicators();
        });
      });
    }

    renderPills('cust-industry-pills', industries,
      function(i) { return i; },
      function(i) { return i; },
      self._customerFilters.industries);
    renderPills('cust-plan-pills', plans,
      function(p) { return p.value; },
      function(p) { return p.label; },
      self._customerFilters.plans);
    renderPills('cust-trial-pills', trials,
      function(t) { return t.value; },
      function(t) { return t.label; },
      self._customerFilters.trial);
  },

  _updateCustomerFilterIndicators: function() {
    var f = this._customerFilters;
    var btnI = document.querySelector('.filter-industry-btn');
    var btnP = document.querySelector('.filter-plan-btn');
    var btnT = document.querySelector('.filter-trial-btn');
    if (btnI && !btnI.classList.contains('open')) btnI.classList.toggle('active', f.industries.length > 0);
    if (btnP && !btnP.classList.contains('open')) btnP.classList.toggle('active', f.plans.length > 0);
    if (btnT && !btnT.classList.contains('open')) btnT.classList.toggle('active', f.trial.length > 0);
  },

  _fetchCustomers: function() {
    var self = this;
    var wrap = document.getElementById('cust-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="list-loading">Loading customers…</div>';

    // Fetch the full list once (no server-side filter params) — all
    // filter logic now runs client-side off self._customers, mirroring
    // cl-review which also loads once and filters on render.
    self._fetchAdmin('admin-customers').then(function(d) {
      self._customers = d.customers || [];
      // Tool prices map (tool_id → AUD/month) returned alongside the
      // customer list. Used by _customerMrr to derive each customer's
      // MRR contribution from their activated_tools array.
      self._toolPricesByTool = d.tool_prices_by_tool || {};
      self._renderCustomerList();
    }).catch(function(err) {
      console.error('[admin] _fetchCustomers error:', err && err.message);
      wrap.innerHTML = '<div class="list-empty">' + window.escHtml('Could not load customers: ' + err.message) + '</div>';
    });
  },

  _renderCustomerList: function() {
    var self = this;
    var wrap = document.getElementById('cust-table-wrap');
    if (!wrap) return;
    var rows = self._filterCustomers(self._customers || []);
    var html = '<div class="data-table-wrap"><table class="data-table"><thead><tr>'
      + '<th>Email</th><th>Business</th><th>Industry</th><th>Tools</th><th>Plan</th><th>Trial</th><th>MRR</th><th>Signed up</th>'
      + '</tr></thead><tbody>';
    if (rows.length === 0) {
      html += '<tr><td colspan="8" class="list-empty">No customers match those filters.</td></tr>';
    } else {
      rows.forEach(function(c) {
        var inds = Array.isArray(c.industry) ? c.industry.join(', ') : (c.industry || '—');
        var tools = Array.isArray(c.activated_tools) ? c.activated_tools.length : 0;
        var mrr = self._customerMrr(c);
        html += '<tr class="row-clickable" data-id="' + window.escHtml(c.id) + '">'
          + '<td>' + window.escHtml(c.email || '') + '</td>'
          + '<td>' + window.escHtml(c.business_name || '—') + '</td>'
          + '<td>' + window.escHtml(inds) + '</td>'
          + '<td>' + tools + '</td>'
          + '<td>' + window.escHtml(c.bundle_tier || (tools > 0 ? 'individual' : '—')) + '</td>'
          + '<td>' + (c.is_trial ? 'Trial' : 'Paid') + '</td>'
          + '<td>' + (mrr != null ? self._formatMoney(mrr) : '—') + '</td>'
          + '<td>' + self._formatDate(c.created_at) + '</td>'
          + '</tr>';
      });
    }
    html += '</tbody></table></div>';
    var totalAvailable = (self._customers || []).length;
    var showingNote = rows.length === totalAvailable
      ? 'Showing ' + rows.length + ' customer' + (rows.length === 1 ? '' : 's') + '.'
      : 'Showing ' + rows.length + ' of ' + totalAvailable + ' customers.';
    html += '<div class="note-box mt-sm">' + showingNote + ' Click a row for full detail.</div>';
    wrap.innerHTML = html;

    wrap.querySelectorAll('tr.row-clickable').forEach(function(tr) {
      tr.addEventListener('click', function() {
        self._showCustomerDetail(tr.getAttribute('data-id'));
      });
    });
  },

  _filterCustomers: function(rows) {
    var f = this._customerFilters || {};
    var search = (f.search || '').toLowerCase().trim();
    var signupAfter = f.signupAfter || '';
    var minTools = f.minTools !== '' && f.minTools != null ? parseInt(f.minTools, 10) : null;
    var industryFilters = f.industries || [];
    var planFilters = f.plans || [];
    var trialFilters = f.trial || [];

    return rows.filter(function(c) {
      // Search — email or business name, case-insensitive contains.
      if (search) {
        var email = (c.email || '').toLowerCase();
        var biz = (c.business_name || '').toLowerCase();
        if (email.indexOf(search) === -1 && biz.indexOf(search) === -1) return false;
      }
      // Signup after — created_at >= date.
      if (signupAfter) {
        if (!c.created_at || c.created_at < signupAfter) return false;
      }
      // Min tools.
      if (minTools != null && !isNaN(minTools)) {
        var tcount = Array.isArray(c.activated_tools) ? c.activated_tools.length : 0;
        if (tcount < minTools) return false;
      }
      // Industry — multi-select OR (any selected industry matches one
      // of the customer's industries).
      if (industryFilters.length > 0) {
        var inds = Array.isArray(c.industry) ? c.industry : (c.industry ? [c.industry] : []);
        var matches = industryFilters.some(function(i) { return inds.indexOf(i) > -1; });
        if (!matches) return false;
      }
      // Plan — multi-select OR. "individual" matches any customer with
      // activated_tools but no bundle_tier.
      if (planFilters.length > 0) {
        var plan = c.bundle_tier || (
          (Array.isArray(c.activated_tools) && c.activated_tools.length > 0) ? 'individual' : null
        );
        if (planFilters.indexOf(plan) === -1) return false;
      }
      // Trial — multi-select OR ('true' / 'false' as strings to match
      // the pill data-value).
      if (trialFilters.length > 0) {
        var v = c.is_trial ? 'true' : 'false';
        if (trialFilters.indexOf(v) === -1) return false;
      }
      return true;
    });
  },

  // Approximate MRR by summing the customer's activated tool prices.
  // Prices come from the tool_prices Supabase table via the admin-customers
  // response (server-side fetch) — never from CORE_TOOLS, which is a
  // hardcoded fallback only. Bundle-tier customers have their MRR
  // calculated separately via the bundle priceId pipeline (admin-overview).
  _customerMrr: function(c) {
    if (c.is_trial) return 0;
    var prices = this._toolPricesByTool || {};
    var arr = Array.isArray(c.activated_tools) ? c.activated_tools : [];
    var sum = 0;
    arr.forEach(function(id) {
      var p = prices[id];
      if (typeof p === 'number' && !isNaN(p)) sum += p;
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
      html += '<div class="settings-row settings-row-compact">'
        + '<span class="text-muted">' + window.escHtml(r[0]) + '</span>'
        + '<span class="admin-detail-value">' + window.escHtml(r[1]) + '</span>'
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
    container.innerHTML = '<div class="list-loading">Loading revenue…</div>';

    self._fetchAdmin('admin-overview').then(function(d) {
      var m = d.metrics || {};
      var html = '<div class="stats-bar">'
        + self._statCard('MRR', self._formatMoney(m.mrr), '/mth', 'green')
        + self._statCard('ARR', self._formatMoney(m.arr), '/yr', 'green')
        + self._statCard('Avg Revenue / Customer', self._formatMoney(m.arpc), '/mth')
        + self._statCard('Churn Rate', (m.churn_rate || 0) + '%', '', m.churn_rate > 5 ? 'red' : '')
        + self._statCard('Net Revenue Retention', '—', '', '')
        + '</div>';

      // Revenue by bundle
      var rb = d.revenue_by_bundle || {};
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Revenue by Bundle</div></div>';
      html += '<div class="settings-rows settings-row-padded">';
      [
        ['STAX3', rb.stax3],
        ['STAX6', rb.stax6],
        ['STAX All', rb['stax-all']],
        ['Individual tools', rb.individual]
      ].forEach(function(r) {
        html += '<div class="admin-list-item"><span class="admin-list-item-label">' + window.escHtml(r[0]) + '</span><span class="admin-list-item-value">' + self._formatMoney(r[1] || 0) + '/mth</span></div>';
      });
      html += '</div></div>';

      // Revenue by tool
      var rt = d.revenue_by_tool || [];
      var diag = d.revenue_by_tool_diagnostic || {};
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Revenue by Tool</div></div>';
      html += '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Tool</th><th>MRR</th></tr></thead><tbody>';
      if (rt.length === 0) {
        html += '<tr><td colspan="2" class="list-empty">' + window.escHtml(self._explainEmptyToolRevenue(diag)) + '</td></tr>';
      } else {
        rt.forEach(function(t) {
          html += '<tr><td>' + window.escHtml(self._toolName(t.tool_id)) + '</td><td>' + self._formatMoney(t.mrr) + '/mth</td></tr>';
        });
      }
      html += '</tbody></table></div></div>';

      // Diagnostic note when revenue_by_tool is empty but we have stripe data
      if (rt.length === 0 && diag && diag.unmatched_price_ids && diag.unmatched_price_ids.length > 0) {
        html += '<div class="note-box code-text">Stripe priceIds not matched in tool_prices: ' + window.escHtml(diag.unmatched_price_ids.join(', ')) + '</div>';
      }

      // Recent cancellations
      var rc = d.recent_cancellations || [];
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Recent Cancellations (this month)</div></div>';
      html += '<div class="settings-rows settings-row-padded">';
      if (rc.length === 0) {
        html += '<div class="list-empty">No cancellations this month.</div>';
      } else {
        rc.forEach(function(c) {
          var when = c.canceled_at ? new Date(c.canceled_at * 1000) : null;
          var label = c.metadata && c.metadata.tier ? c.metadata.tier : (c.metadata && c.metadata.toolId ? c.metadata.toolId : 'Subscription');
          // Prefer customer name → email → Stripe customer id, in that
          // order, so deleted customers (where the expand returns a
          // sentinel) still get something readable.
          var who = c.customer_name || c.customer_email || c.customer_id || '—';
          html += '<div class="admin-list-item"><span class="admin-list-item-label">' + window.escHtml(label) + ' &middot; ' + window.escHtml(who) + '</span><span class="admin-list-item-value">' + (when ? when.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—') + '</span></div>';
        });
      }
      html += '</div></div>';

      html += '<div class="note-box">12-month MRR trend chart not yet implemented — add when a charting library is selected.</div>';

      container.innerHTML = html;
    }).catch(function(err) {
      console.error('[admin] _renderRevenue error:', err && err.message);
      container.innerHTML = '<div class="list-empty">' + window.escHtml('Could not load revenue: ' + err.message) + '</div>';
    });
  },

  // ── SECTION 5: TOOL USAGE ──────────────────────────────────────
  _renderUsage: function() {
    var self = this;
    var container = document.getElementById('section-usage');
    container.innerHTML = '<div class="list-loading">Loading tool usage…</div>';

    self._fetchAdmin('admin-data?section=usage').then(function(d) {
      var html = '';
      if (d.usage_note) {
        html += '<div class="note-box">' + window.escHtml(d.usage_note) + '</div>';
      }
      html += '<div class="data-table-wrap"><table class="data-table"><thead><tr>'
        + '<th>Tool</th><th>Activations</th><th>Unique users (30d)</th><th>Total uses (30d)</th><th>Avg uses / user</th>'
        + '</tr></thead><tbody>';
      var tools = d.tools || [];
      if (tools.length === 0) {
        html += '<tr><td colspan="5" class="list-empty">No tools activated yet.</td></tr>';
      } else {
        tools.forEach(function(t) {
          html += '<tr>'
            + '<td>' + window.escHtml(self._toolName(t.tool_id)) + '</td>'
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
      console.error('[admin] _renderUsage error:', err && err.message);
      container.innerHTML = '<div class="list-empty">' + window.escHtml('Could not load tool usage: ' + err.message) + '</div>';
    });
  },

  // ── SECTION 6: ERROR MONITOR ───────────────────────────────────
  _renderErrors: function() {
    var self = this;
    var container = document.getElementById('section-errors');
    container.innerHTML = '<div class="list-loading">Loading errors…</div>';

    // Fetch ingestion health and the error log in parallel — the
    // ingestion-health endpoint surfaces source_row_failed counts from
    // cl_scan_jobs.skipped_reasons, set by the Ingestion Pipeline
    // Unification spec's ensureSourceItem flow.
    Promise.all([
      self._fetchAdmin('admin-data?section=ingestion-health').catch(function(err) {
        console.error('[admin] ingestion-health fetch failed:', err && err.message);
        return { fetch_error: err && err.message ? err.message : 'unknown' };
      }),
      self._fetchAdmin('admin-data?section=errors')
    ]).then(function(results) {
      var ingestion = results[0] || {};
      var d = results[1] || {};

      var html = '';
      html += self._renderIngestionHealthHtml(ingestion);

      if (d.note) {
        html += '<div class="note-box">' + window.escHtml(d.note) + '</div>';
      }
      html += '<div class="data-table-wrap"><table class="data-table"><thead><tr>'
        + '<th>Time</th><th>Endpoint</th><th>User</th><th>Message</th><th>Details</th>'
        + '</tr></thead><tbody>';
      var errs = d.errors || [];
      if (errs.length === 0) {
        html += '<tr><td colspan="5" class="list-empty">No errors recorded.</td></tr>';
      } else {
        errs.forEach(function(e) {
          var details = '';
          if (e.details) {
            try {
              details = typeof e.details === 'string' ? e.details : JSON.stringify(e.details);
            } catch (ex) {
              console.error('[admin] _renderErrors stringify failed:', ex && ex.message);
              details = '';
            }
          }
          html += '<tr>'
            + '<td>' + window.escHtml(e.created_at ? new Date(e.created_at).toLocaleString('en-AU') : '—') + '</td>'
            + '<td>' + window.escHtml(e.endpoint || '—') + '</td>'
            + '<td>' + window.escHtml(e.user_id || '—') + '</td>'
            + '<td>' + window.escHtml(e.message || '—') + '</td>'
            + '<td>' + (details ? '<details><summary>view</summary><pre class="error-pre">' + window.escHtml(details) + '</pre></details>' : '—') + '</td>'
            + '</tr>';
        });
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;
    }).catch(function(err) {
      console.error('[admin] _renderErrors error:', err && err.message);
      container.innerHTML = '<div class="list-empty">' + window.escHtml('Could not load errors: ' + err.message) + '</div>';
    });
  },

  // Build the Ingestion Health panel at the top of the Error Monitor tab.
  // Shows source_row_failed totals over a 7-day window (alerted in red
  // when non-zero) and a 30-day trend window. source_row_failed counts
  // come from the cl_scan_jobs.skipped_reasons jsonb column populated by
  // scan-worker after every batch.
  _renderIngestionHealthHtml: function(d) {
    if (d && d.fetch_error) {
      return '<div class="note-box">Ingestion Health unavailable — ' + window.escHtml(d.fetch_error) + '</div>';
    }
    var d7 = Number((d && d.source_row_failed_7d) || 0);
    var d30 = Number((d && d.source_row_failed_30d) || 0);
    var alertOn = !!(d && d.alert);
    var byType7 = (d && d.by_source_type_7d) || {};

    var heading = '<h3 class="section-title">Ingestion Health</h3>';
    var sub = '<p class="section-sub">Counts source rows that ingestion endpoints could not create — when this is non-zero, content is being skipped instead of orphaned.</p>';

    var tile7 = '<div class="stat-card ' + (alertOn ? 'red' : 'green') + '">'
      + '<div class="stat-value">' + window.escHtml(String(d7)) + '</div>'
      + '<div class="stat-label">source_row_failed (last 7 days)</div>'
      + '</div>';
    var tile30 = '<div class="stat-card grey">'
      + '<div class="stat-value">' + window.escHtml(String(d30)) + '</div>'
      + '<div class="stat-label">source_row_failed (last 30 days)</div>'
      + '</div>';
    var tile = '<div class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px;">' + tile7 + tile30 + '</div>';

    var breakdown = '';
    var keys = Object.keys(byType7);
    if (keys.length > 0) {
      breakdown += '<div class="data-table-wrap" style="margin-bottom:16px;"><table class="data-table"><thead><tr><th>Source type (last 7 days)</th><th>source_row_failed</th></tr></thead><tbody>';
      keys.sort().forEach(function(k) {
        breakdown += '<tr><td>' + window.escHtml(k) + '</td><td>' + window.escHtml(String(byType7[k])) + '</td></tr>';
      });
      breakdown += '</tbody></table></div>';
    }

    var noteHtml = '';
    if (d && d.note) noteHtml = '<div class="note-box">' + window.escHtml(d.note) + '</div>';

    return heading + sub + noteHtml + tile + breakdown;
  },

  // ── SECTION 7: INFRASTRUCTURE ──────────────────────────────────
  // Fetches row counts (via admin-data) and live external service
  // status (via admin-status) in parallel. Status maps the Atlassian
  // Statuspage indicator to platform dot classes (up/warn/down).
  _renderInfrastructure: function() {
    var self = this;
    var container = document.getElementById('section-infrastructure');
    container.innerHTML = '<div class="list-loading">Loading infrastructure…</div>';

    Promise.all([
      self._fetchAdmin('admin-data?section=infrastructure'),
      self._fetchAdmin('admin-status')
    ]).then(function(results) {
      var infra = results[0] || {};
      var status = results[1] || {};
      self._renderInfrastructureContent(container, infra, status);
    }).catch(function(err) {
      console.error('[admin] _renderInfrastructure error:', err && err.message);
      container.innerHTML = '<div class="list-empty">' + window.escHtml('Could not load infrastructure: ' + err.message) + '</div>';
    });
  },

  _renderInfrastructureContent: function(container, infra, status) {
    var self = this;
    var counts = infra.row_counts || {};
    var html = '';

    // Row counts
    html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Key Table Row Counts</div></div>';
    html += '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Table</th><th>Rows</th></tr></thead><tbody>';
    Object.keys(counts).forEach(function(t) {
      var n = counts[t];
      html += '<tr><td>' + window.escHtml(t) + '</td><td>' + (n == null ? '— (table missing)' : n.toLocaleString('en-AU')) + '</td></tr>';
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
      + (lastChecked ? ' — last checked ' + window.escHtml(lastChecked) : '')
      + '. <button id="status-refresh" class="btn-link">Refresh</button></div>'
      + '</div>';
    html += '<div class="settings-rows settings-row-padded">';
    if (services.length === 0) {
      html += '<div class="list-empty">Status not available.</div>';
    } else {
      services.forEach(function(s) {
        var url = (s.page_url) || statusUrls[s.name] || '';

        // Manual providers (Stripe) — no JSON endpoint exists, so
        // render a "Check status" link instead of a dot + label.
        if (s.status === 'manual') {
          html += '<div class="status-row">'
            + '<span class="status-row-name">' + window.escHtml(s.name) + '</span>'
            + '<span class="status-row-meta">No public status API</span>'
            + (url ? '<a href="' + window.escHtml(url) + '" target="_blank" rel="noopener noreferrer" class="btn-link">Check status &rarr;</a>' : '')
            + '</div>';
          return;
        }

        var dotClass = '';
        var label = '';
        if (s.status === 'operational') { dotClass = 'up'; label = 'Operational'; }
        else if (s.status === 'degraded') { dotClass = 'warn'; label = 'Degraded performance'; }
        else if (s.status === 'major') { dotClass = 'down'; label = 'Major outage'; }
        else if (s.status === 'critical') { dotClass = 'down'; label = 'Critical outage'; }
        else { label = s.error ? 'Status unavailable' : 'Status unknown'; }

        html += '<div class="status-row">'
          + '<span class="status-dot ' + dotClass + '"></span>'
          + '<span class="status-row-name">' + window.escHtml(s.name) + '</span>'
          + '<span class="status-row-meta">' + window.escHtml(label) + '</span>'
          + (url ? '<a href="' + window.escHtml(url) + '" target="_blank" rel="noopener noreferrer" class="btn-link">Status page</a>' : '')
          + '</div>';
      });
    }
    html += '</div></div>';

    html += '<div class="note-box">Storage usage and database size are not exposed via the Supabase JS client. Check the Supabase dashboard directly until a server-side integration is added.</div>';

    container.innerHTML = html;

    var refreshBtn = document.getElementById('status-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        refreshBtn.textContent = 'Refreshing…';
        refreshBtn.disabled = true;
        self._renderInfrastructure();
      });
    }
  }
};
