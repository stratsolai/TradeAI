window.ADMIN_LOGIC = {

  _supabase: null,
  _user: null,
  _session: null,
  _loaded: {},

  // ── INIT ───────────────────────────────────────────────────────
  init: async function(supabase) {
    var self = this;
    self._supabase = supabase;

    // Auth gate — redirects to /login if no session.
    if (typeof window.requireAuth === 'function') {
      var ok = await window.requireAuth();
      if (!ok) return;
    }

    var sess = await supabase.auth.getSession();
    self._session = sess.data && sess.data.session;
    self._user = self._session && self._session.user;
    if (!self._user) { window.location.href = '/login'; return; }

    // is_admin check — first thing after auth, per spec.
    var profileRes = await supabase
      .from('profiles')
      .select('is_admin, email')
      .eq('id', self._user.id)
      .single();

    if (profileRes.error || !profileRes.data || !profileRes.data.is_admin) {
      window.location.href = '/dashboard.html';
      return;
    }

    document.getElementById('page-wrap').style.display = 'block';

    self._wireTabs();
    self._wireCustomerDetailClose();
    self._loadSection('overview');
  },

  // ── HELPERS ────────────────────────────────────────────────────
  _esc: function(s) {
    if (typeof window.escHtml === 'function') return window.escHtml(s);
    return String(s == null ? '' : s)
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
  _renderApiCosts: function() {
    var self = this;
    var container = document.getElementById('section-api-costs');
    container.innerHTML = '<div class="admin-loading">Loading API usage…</div>';

    self._fetchAdmin('admin-api-usage').then(function(d) {
      var html = '';

      // Per-customer cost summary
      html += '<div class="admin-metric-grid">'
        + self._statCard('Total Spend (' + (d.period || '') + ')', self._formatMoney(d.total_this_month || 0))
        + self._statCard('Active Customers', d.active_customers || 0)
        + self._statCard('Cost / Customer', self._formatMoney(d.cost_per_customer || 0), '', d.cost_per_customer > 50 ? 'red' : 'green')
        + '</div>';

      // Provider cards — one per known provider
      var providers = [
        { id: 'anthropic', name: 'Anthropic Claude', purpose: 'All AI generation (chatbot, email, SP, BI, content)' },
        { id: 'serper', name: 'Serper.dev', purpose: 'News Digest search' },
        { id: 'predis', name: 'Predis.ai', purpose: 'Social Media graphics and video' },
        { id: 'reimagine', name: 'REimagine Home', purpose: 'Design Visualiser renders' },
        { id: 'meta', name: 'Meta Graph API', purpose: 'Social posting and metrics' },
        { id: 'google_oauth', name: 'Google OAuth', purpose: 'Gmail / Drive connections' },
        { id: 'microsoft_oauth', name: 'Microsoft OAuth', purpose: 'Outlook / OneDrive connections' }
      ];
      var entriesByProvider = {};
      (d.entries || []).forEach(function(e) {
        if (!entriesByProvider[e.provider]) entriesByProvider[e.provider] = [];
        entriesByProvider[e.provider].push(e);
      });

      html += '<div class="admin-provider-grid">';
      providers.forEach(function(p) {
        var entries = entriesByProvider[p.id] || [];
        var latest = entries[0];
        html += '<div class="admin-provider-card">'
          + '<div class="admin-provider-name">' + self._esc(p.name) + '</div>'
          + '<div class="admin-provider-purpose">' + self._esc(p.purpose) + '</div>'
          + '<div class="admin-provider-row"><span class="label">Latest period</span><span>' + self._esc(latest ? latest.period : '—') + '</span></div>'
          + '<div class="admin-provider-row"><span class="label">Usage</span><span>' + self._esc(latest && latest.usage_value ? latest.usage_value : '—') + '</span></div>'
          + '<div class="admin-provider-row"><span class="label">Estimated cost</span><span>' + (latest && typeof latest.cost_estimate === 'number' ? self._formatMoney(latest.cost_estimate) : '—') + '</span></div>'
          + '</div>';
      });
      html += '</div>';

      // Manual entry form
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Add Usage Entry</div></div>';
      html += '<div class="admin-entry-form" id="api-usage-form">'
        + '<select class="form-input" id="api-usage-provider">'
        + providers.map(function(p) {
          return '<option value="' + self._esc(p.id) + '">' + self._esc(p.name) + '</option>';
        }).join('')
        + '</select>'
        + '<input type="text" class="form-input" id="api-usage-period" placeholder="YYYY-MM" value="' + self._esc(d.period || '') + '">'
        + '<input type="text" class="form-input" id="api-usage-value" placeholder="Usage (e.g. 250000 tokens)">'
        + '<input type="number" step="0.01" class="form-input" id="api-usage-cost" placeholder="Cost AUD">'
        + '<input type="text" class="form-input" id="api-usage-notes" placeholder="Notes (optional)">'
        + '<button class="btn-primary" id="api-usage-submit">Add Entry</button>'
        + '</div></div>';

      // Note if api_usage table missing
      if (d.note) {
        html += '<div class="admin-note">' + self._esc(d.note) + '</div>';
      }

      // History table
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Recent Entries</div></div>';
      html += '<div class="admin-table-wrap">';
      html += '<table class="admin-table"><thead><tr>'
        + '<th>Provider</th><th>Period</th><th>Usage</th><th>Cost</th><th>Notes</th><th>Entered</th>'
        + '</tr></thead><tbody>';
      if (!d.entries || d.entries.length === 0) {
        html += '<tr><td colspan="6" class="admin-empty">No entries yet.</td></tr>';
      } else {
        d.entries.forEach(function(e) {
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
    }).catch(function(err) {
      container.innerHTML = '<div class="admin-empty">' + self._esc('Could not load API usage: ' + err.message) + '</div>';
    });
  },

  _wireApiUsageForm: function() {
    var self = this;
    var btn = document.getElementById('api-usage-submit');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var provider = document.getElementById('api-usage-provider').value;
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
        btn.disabled = false; btn.textContent = 'Add Entry';
      });
    });
  },

  // ── SECTION 3: CUSTOMERS ───────────────────────────────────────
  _renderCustomers: function() {
    var self = this;
    var container = document.getElementById('section-customers');

    // Filter bar — gather industries from existing CORE_TOOLS data
    var industries = ['pool','plumber','electrician','builder','hvac','fabricator','cleaner','landscaper','manufacturer','concreter','handyman'];
    var html = '<div class="admin-filters">'
      + '<span class="admin-filter-label">Search</span>'
      + '<input type="text" class="form-input" id="cust-search" placeholder="Email or business name">'
      + '<span class="admin-filter-label">Industry</span>'
      + '<select class="form-input" id="cust-industry"><option value="">Any</option>'
      + industries.map(function(i) { return '<option value="' + i + '">' + self._esc(i) + '</option>'; }).join('')
      + '</select>'
      + '<span class="admin-filter-label">Plan</span>'
      + '<select class="form-input" id="cust-bundle">'
      + '<option value="">Any</option>'
      + '<option value="stax3">STAX3</option>'
      + '<option value="stax6">STAX6</option>'
      + '<option value="stax-all">STAX All</option>'
      + '</select>'
      + '<span class="admin-filter-label">Trial</span>'
      + '<select class="form-input" id="cust-trial">'
      + '<option value="">Any</option><option value="true">Trial</option><option value="false">Paid</option>'
      + '</select>'
      + '<span class="admin-filter-label">Signup after</span>'
      + '<input type="date" class="form-input" id="cust-after">'
      + '<span class="admin-filter-label">Min tools</span>'
      + '<input type="number" min="0" class="form-input" id="cust-min-tools" style="min-width:80px;">'
      + '<button class="btn-primary" id="cust-apply">Apply</button>'
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

    if (search && search.value.trim()) params.set('search', search.value.trim());
    if (industry && industry.value) params.set('industry', industry.value);
    if (bundle && bundle.value) params.set('bundle', bundle.value);
    if (trial && trial.value) params.set('trial', trial.value);
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
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Revenue by Tool</div></div>';
      html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Tool</th><th>MRR</th></tr></thead><tbody>';
      if (rt.length === 0) {
        html += '<tr><td colspan="2" class="admin-empty">No tool revenue mapped. Ensure tool_prices.tool_id is populated for each Stripe price.</td></tr>';
      } else {
        rt.forEach(function(t) {
          html += '<tr><td>' + self._esc(self._toolName(t.tool_id)) + '</td><td>' + self._formatMoney(t.mrr) + '/mth</td></tr>';
        });
      }
      html += '</tbody></table></div></div>';

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
          html += '<div class="admin-list-item"><span class="admin-list-item-label">' + self._esc(label) + ' &middot; ' + self._esc(c.customer || '—') + '</span><span class="admin-list-item-value">' + (when ? when.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—') + '</span></div>';
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
  _renderInfrastructure: function() {
    var self = this;
    var container = document.getElementById('section-infrastructure');
    container.innerHTML = '<div class="admin-loading">Loading infrastructure…</div>';

    self._fetchAdmin('admin-data?section=infrastructure').then(function(d) {
      var counts = d.row_counts || {};
      var html = '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">Key Table Row Counts</div></div>';
      html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Table</th><th>Rows</th></tr></thead><tbody>';
      Object.keys(counts).forEach(function(t) {
        var n = counts[t];
        html += '<tr><td>' + self._esc(t) + '</td><td>' + (n == null ? '— (table missing)' : n.toLocaleString('en-AU')) + '</td></tr>';
      });
      html += '</tbody></table></div></div>';

      // External services — manual indicators
      html += '<div class="settings-card"><div class="settings-card-header"><div class="settings-card-title">External Services</div><div class="settings-card-hint">Status indicators are manual placeholders. Update when a status-page integration is added.</div></div>';
      html += '<div class="settings-rows" style="padding:14px 20px;">';
      var services = [
        { name: 'Stripe', dot: 'up', url: 'https://status.stripe.com/' },
        { name: 'Supabase', dot: 'up', url: 'https://status.supabase.com/' },
        { name: 'Anthropic', dot: 'up', url: 'https://status.anthropic.com/' },
        { name: 'Vercel', dot: 'up', url: 'https://www.vercel-status.com/' }
      ];
      services.forEach(function(s) {
        html += '<div class="admin-status-row">'
          + '<span class="admin-status-dot ' + s.dot + '"></span>'
          + '<span class="admin-status-name">' + self._esc(s.name) + '</span>'
          + '<a href="' + self._esc(s.url) + '" target="_blank" rel="noopener noreferrer" class="topbar-link" style="font-size:var(--note-font-size);">Status page</a>'
          + '</div>';
      });
      html += '</div></div>';

      html += '<div class="admin-note">Storage usage and database size are not exposed via the Supabase JS client. Check the Supabase dashboard directly until a server-side integration is added.</div>';

      container.innerHTML = html;
    }).catch(function(err) {
      container.innerHTML = '<div class="admin-empty">' + self._esc('Could not load infrastructure: ' + err.message) + '</div>';
    });
  }
};
