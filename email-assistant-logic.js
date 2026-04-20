/**
 * email-assistant-logic.js
 * All logic for the AI Email Assistant tool.
 * Loaded by email-assistant.html shell.
 * Follows CL platform patterns per LAYOUT-STANDARD.md.
 */

window.EA_LOGIC = {
  _supabase: null,
  _user: null,
  _settings: null,
  _connectedAccounts: [],
  _activeAccount: null,
  _activeCategory: 'all',
  _categoryFilter: '',
  _showFlagged: false,
  _searchTerm: '',
  _emails: [],
  _selected: new Set(),
  _pendingJobs: 0,
  _jobChannels: {},
  _dateFrom: null,
  _dateTo: null,
  _dateQuick: '30',
  _filterState: {},
  _showHandled: false,
  _categoryShortcuts: ['enquiries', 'projects'],

  DEFAULT_CATEGORIES: [
    { id: 'urgent',      label: 'Urgent',                  description: 'Emails requiring immediate attention or a same-day response', enabled: true },
    { id: 'enquiries',   label: 'Leads',                    description: 'New enquiries and expressions of interest from potential customers', enabled: true },
    { id: 'projects',    label: 'Projects',                description: 'Emails related to active or upcoming work, projects, and jobs', enabled: true },
    { id: 'financial',   label: 'Financial',               description: 'Invoices, statements, receipts, payments, and financial correspondence', enabled: true },
    { id: 'customers',   label: 'Customers',               description: 'Correspondence from existing customers including service requests, follow-ups, and feedback', enabled: true },
    { id: 'operations',  label: 'Operations',              description: 'Supplier, staff, compliance, and general business correspondence', enabled: true },
    { id: 'newsletters', label: 'Newsletters / Marketing', description: 'Promotional emails, newsletters, industry updates, and marketing material', enabled: true },
    { id: 'other',       label: 'Other',                   description: 'Emails that do not clearly fit any other category', enabled: true }
  ],

  init: async function(supabase, user) {
    this._supabase = supabase;
    this._user = user;
    var pw = document.getElementById('page-wrap');
    if (pw) pw.style.display = 'block';
    await this._loadSettings();
    await this._loadAccounts();
    this._initDateDefaults();
    this._buildAccountTabs();
    this._bindStatTiles();
    this._load();
  },

  // ── Settings ──────────────────────────────────────────────
  _loadSettings: async function() {
    try {
      var res = await this._supabase
        .from('email_assistant_settings')
        .select('*')
        .eq('user_id', this._user.id)
        .maybeSingle();
      if (res.data) {
        // Clean categories — rebuild defaults with correct labels and guaranteed enabled values
        var rawCats = (res.data.categories && res.data.categories.length > 0) ? res.data.categories : null;
        var cleanedCats = this.DEFAULT_CATEGORIES;
        if (rawCats) {
          var savedById = {};
          rawCats.forEach(function(c) { if (c && c.id) savedById[c.id] = c; });
          var defaultIds = this.DEFAULT_CATEGORIES.map(function(c) { return c.id; });
          cleanedCats = this.DEFAULT_CATEGORIES.map(function(def) {
            var saved = savedById[def.id];
            return { id: def.id, label: def.label, description: def.description, enabled: (saved && saved.enabled === false) ? false : def.enabled };
          });
          var custom = rawCats.filter(function(c) { return c && c.id && defaultIds.indexOf(c.id) === -1 && c.description; });
          cleanedCats = cleanedCats.concat(custom);
        }
        this._settings = {
          id: res.data.id,
          categories: cleanedCats,
          scan_cadence: res.data.scan_cadence || 'manual',
          show_handled: res.data.show_handled || false
        };
        // Load category shortcuts — normalise to IDs (database may contain labels)
        if (Array.isArray(res.data.category_shortcuts) && res.data.category_shortcuts.length > 0) {
          var scCats = cleanedCats;
          this._categoryShortcuts = res.data.category_shortcuts.map(function(val) {
            var byLabel = scCats.find(function(c) { return c.label === val; });
            return byLabel ? byLabel.id : val;
          });
        }
      }
    } catch (e) {
      console.error('[EA] Settings load error:', e);
    }
    if (!this._settings) {
      this._settings = { categories: this.DEFAULT_CATEGORIES, scan_cadence: 'manual', show_handled: false };
    }
    if (!this._settings.categories || this._settings.categories.length === 0) {
      this._settings.categories = this.DEFAULT_CATEGORIES;
    }
    console.log('[EA Debug] _loadSettings complete — categories count:', this._settings.categories.length, 'shortcuts before filter:', JSON.stringify(this._categoryShortcuts));
    console.log('[EA Debug] categories:', this._settings.categories.map(function(c) { return c.id + ':' + c.enabled; }).join(', '));
    // Filter out shortcuts for categories that are disabled
    var cats = this._settings.categories;
    this._categoryShortcuts = this._categoryShortcuts.filter(function(id) {
      var cat = cats.find(function(c) { return c.id === id; });
      return cat && cat.enabled;
    });
    console.log('[EA Debug] shortcuts after filter:', JSON.stringify(this._categoryShortcuts));
  },

  // ── Accounts ───────────────────────────────────────��──────
  _loadAccounts: async function() {
    var result = await this._supabase
      .from('profiles')
      .select('ea_connected_emails')
      .eq('id', this._user.id)
      .single();
    var emails = (result.data && Array.isArray(result.data.ea_connected_emails)) ? result.data.ea_connected_emails : [];
    this._connectedAccounts = emails;
    if (emails.length > 0 && !this._activeAccount) {
      this._activeAccount = emails[0].email;
    }
    // Initialise filter state per account
    var self = this;
    emails.forEach(function(e) {
      if (!self._filterState[e.email]) {
        self._filterState[e.email] = { category: 'all', search: '', dateQuick: '30', dateFrom: null, dateTo: null };
      }
    });
  },

  // ── Date defaults ─────────────────────────────────────────
  _initDateDefaults: function() {
    this._dateQuick = '';
    this._dateFrom = null;
    this._dateTo = null;
  },

  // ── Account tabs ──────────────────────────────────────────
  _buildAccountTabs: function() {
    var container = document.getElementById('ea-account-tabs');
    var panelsEl = document.getElementById('ea-account-panels');
    if (!container || !panelsEl) return;

    var accounts = this._connectedAccounts;
    if (accounts.length === 0) {
      container.innerHTML = '';
      panelsEl.innerHTML = '<div class="list-empty">Connect your email to get started. Use the <a href="/email/settings">Settings</a> page to connect Gmail or Outlook.</div>';
      return;
    }

    var self = this;
    if (accounts.length === 1) {
      var provLabel = this._providerLabel(accounts[0].provider);
      container.innerHTML = '<span class="ptab active" style="cursor:default;">' + window.escHtml(provLabel + ' — ' + accounts[0].email) + '</span>';
    } else {
      container.innerHTML = accounts.map(function(acct) {
        var label = self._providerLabel(acct.provider) + ' — ' + acct.email;
        var isActive = acct.email === self._activeAccount;
        return '<button class="ptab' + (isActive ? ' active' : '') + '" data-account="' + window.escHtml(acct.email) + '">' + window.escHtml(label) + '</button>';
      }).join('');

      container.querySelectorAll('.ptab[data-account]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          self._saveFilterState();
          self._activeAccount = btn.dataset.account;
          self._restoreFilterState();
          container.querySelectorAll('.ptab').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          self._selected = new Set();
          self._load();
        });
      });
    }

    panelsEl.innerHTML =
      '<div id="ea-category-tabs" class="ea-status-row"></div>' +
      '<div id="filter-btns-row" class="filter-btns-row"></div>' +
      '<div id="ea-filter-expand-row" class="ea-filter-expand-row" style="display:none"></div>' +
      '<div id="ea-bulk-bar" class="ea-bulk-bar" style="display:none">' +
        '<span id="ea-bulk-count" class="ea-bulk-label"></span>' +
        '<button class="btn-dismiss ea-handled-btn" id="ea-bulk-handle-btn">&#10007; Dismiss All Selected</button>' +
        '<button class="btn-outline" id="ea-deselect-btn">Deselect All</button>' +
      '</div>' +
      '<div id="ea-email-list" class="ea-list"></div>';

    this._renderCategoryPills();
    this._renderFilterRow();
    this._bindControls();
  },

  // ── Category pills (permanent: All, Urgent, Flagged, Dismissed + shortcuts + dropdown) ──
  _renderCategoryPills: function() {
    var container = document.getElementById('ea-category-tabs');
    if (!container) return;
    var self = this;
    var pills = [
      { id: 'all', label: 'All' },
      { id: 'urgent', label: 'Urgent' },
      { id: 'flagged', label: 'Flagged' },
      { id: 'handled', label: 'Dismissed' }
    ];

    // Build shortcut pills from settings
    var enabledCats = (this._settings.categories || this.DEFAULT_CATEGORIES)
      .filter(function(c) { return c.enabled && c.id !== 'urgent'; });
    var shortcutCats = [];
    this._categoryShortcuts.forEach(function(id) {
      var cat = enabledCats.find(function(c) { return c.id === id; });
      if (cat) shortcutCats.push(cat);
    });
    // Remaining categories for the dropdown (enabled, not urgent, not a shortcut)
    var dropdownCats = enabledCats.filter(function(c) {
      return self._categoryShortcuts.indexOf(c.id) === -1;
    });
    console.log('[EA Debug] _renderCategoryPills — enabledCats:', enabledCats.length, 'shortcutCats:', shortcutCats.length, 'dropdownCats:', dropdownCats.length, 'shortcuts:', JSON.stringify(self._categoryShortcuts));

    var html = pills.map(function(p) {
      var isActive = false;
      if (p.id === 'handled') isActive = self._showHandled;
      else if (p.id === 'flagged') isActive = self._showFlagged && !self._showHandled;
      else isActive = !self._showHandled && !self._showFlagged && self._activeCategory === p.id && !self._categoryFilter;
      return '<button class="status-btn' + (isActive ? ' active' : '') + '" data-pill="' + p.id + '">' + window.escHtml(p.label) + '</button>';
    }).join('');

    // Shortcut pills
    html += shortcutCats.map(function(c) {
      var isActive = !self._showHandled && !self._showFlagged && self._categoryFilter === c.id;
      return '<button class="status-btn' + (isActive ? ' active' : '') + '" data-shortcut="' + window.escHtml(c.id) + '">' + window.escHtml(c.label) + '</button>';
    }).join('');

    // Category dropdown (hidden if no remaining categories)
    if (dropdownCats.length > 0) {
      var dropdownActive = dropdownCats.some(function(c) { return self._categoryFilter === c.id; });
      var dropdownLabel = dropdownActive
        ? self._getCategoryLabel(self._categoryFilter)
        : 'All Categories';
      html += '<span class="lookback-dropdown-wrap" id="ea-cat-dropdown">' +
        '<button class="lookback-dropdown lookback-dropdown-field' + (dropdownActive ? ' active' : '') + '" id="ea-cat-dropdown-btn">' + window.escHtml(dropdownLabel) + '</button>' +
        '<div class="lookback-dropdown-menu" id="ea-cat-dropdown-menu">' +
        dropdownCats.map(function(c) {
          var isActive = self._categoryFilter === c.id;
          return '<button class="lookback-dropdown-item' + (isActive ? ' active' : '') + '" data-catdropdown="' + window.escHtml(c.id) + '">' + window.escHtml(c.label) + '</button>';
        }).join('') +
        '</div></span>';
    }

    html += '<input type="text" id="ea-search" class="ea-search-input" placeholder="Search emails..." value="' + window.escHtml(this._searchTerm) + '">';

    console.log('[EA Debug] _renderCategoryPills — html length:', html.length, 'container exists:', !!container);
    container.innerHTML = html;

    // Bind status pills
    container.querySelectorAll('.status-btn[data-pill]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._showHandled = false;
        self._showFlagged = false;
        self._activeCategory = 'all';
        self._categoryFilter = '';
        if (btn.dataset.pill === 'handled') {
          self._showHandled = true;
        } else if (btn.dataset.pill === 'flagged') {
          self._showFlagged = true;
        } else if (btn.dataset.pill === 'urgent') {
          self._activeCategory = 'urgent';
        }
        self._selected = new Set();
        self._renderCategoryPills();
        self._renderFilterRow();
        self._bindControls();
        self._renderExpandRow();
        self._updateFilterBtnIndicators();
        self._load();
      });
    });

    // Bind shortcut pills
    container.querySelectorAll('.status-btn[data-shortcut]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._showHandled = false;
        self._showFlagged = false;
        self._activeCategory = 'all';
        if (self._categoryFilter === btn.dataset.shortcut) {
          self._categoryFilter = '';
        } else {
          self._categoryFilter = btn.dataset.shortcut;
        }
        self._selected = new Set();
        self._renderCategoryPills();
        self._renderFilterRow();
        self._bindControls();
        self._renderExpandRow();
        self._updateFilterBtnIndicators();
        self._load();
      });
    });

    // Bind dropdown
    var dropdownBtn = document.getElementById('ea-cat-dropdown-btn');
    var dropdownMenu = document.getElementById('ea-cat-dropdown-menu');
    if (dropdownBtn && dropdownMenu) {
      dropdownBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdownMenu.classList.toggle('open');
      });
      dropdownMenu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          e.stopPropagation();
          self._showHandled = false;
          self._showFlagged = false;
          self._activeCategory = 'all';
          if (self._categoryFilter === item.dataset.catdropdown) {
            self._categoryFilter = '';
          } else {
            self._categoryFilter = item.dataset.catdropdown;
          }
          self._selected = new Set();
          self._renderCategoryPills();
          self._renderFilterRow();
          self._bindControls();
          self._renderExpandRow();
          self._updateFilterBtnIndicators();
          self._load();
        });
      });
      // Close dropdown on outside click
      document.addEventListener('click', function() {
        dropdownMenu.classList.remove('open');
      });
    }
  },

  // ── Filter row (matches CL .review-filter-btns-row layout) ────
  _renderFilterRow: function() {
    var container = document.getElementById('filter-btns-row');
    if (!container) return;
    container.innerHTML =
      '<button class="filter-btn" id="ea-days-btn">&#9783; Lookback Days</button>' +
      '<button class="filter-btn" id="ea-range-btn">&#9776; Date Range</button>' +
      '<button class="clear-filters-btn" id="clear-filters-btn">&#10005; Clear All Filters</button>' +
      '<span style="flex:1"></span>' +
      '<button class="btn-outline" id="ea-scan-btn">Scan Now</button>' +
      '<button class="btn-dismiss ea-handled-btn" id="ea-handle-all-btn">&#10007; Dismiss All</button>';
  },

  _renderExpandRow: function() {
    var container = document.getElementById('ea-filter-expand-row');
    if (!container) return;
    var daysBtn = document.getElementById('ea-days-btn');
    var rangeBtn = document.getElementById('ea-range-btn');
    var daysOpen = daysBtn && daysBtn.classList.contains('open');
    var rangeOpen = rangeBtn && rangeBtn.classList.contains('open');

    if (!daysOpen && !rangeOpen) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'block';

    if (daysOpen) {
      var self = this;
      container.innerHTML =
        '<div class="filter-section-label">Lookback Days</div>' +
        '<div class="ea-pill-row">' +
          '<button class="filter-pill' + (this._dateQuick === '30' ? ' active' : '') + '" data-days="30">30 days</button>' +
          '<button class="filter-pill' + (this._dateQuick === '60' ? ' active' : '') + '" data-days="60">60 days</button>' +
          '<button class="filter-pill' + (this._dateQuick === '90' ? ' active' : '') + '" data-days="90">90 days</button>' +
        '</div>';
      container.querySelectorAll('.filter-pill[data-days]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          if (self._dateQuick === pill.dataset.days) {
            // Deselect — query defaults to 90 days silently in _load
            self._dateQuick = '';
            self._dateFrom = null;
          } else {
            self._dateQuick = pill.dataset.days;
            var d = new Date();
            d.setDate(d.getDate() - parseInt(pill.dataset.days, 10));
            self._dateFrom = d.toISOString();
          }
          self._dateTo = null;
          self._selected = new Set();
          self._renderExpandRow();
          self._updateFilterBtnIndicators();
          self._load();
        });
      });
    }

    if (rangeOpen) {
      var self = this;
      var fromVal = (this._dateFrom && !this._dateQuick) ? this._dateFrom.substring(0, 10) : '';
      var toVal = this._dateTo ? this._dateTo.substring(0, 10) : '';
      container.innerHTML =
        '<div class="filter-section-label">Date Range</div>' +
        '<div class="ea-pill-row" style="align-items:center;">' +
          '<span class="ea-date-label">From</span>' +
          '<input type="date" class="ea-date-input" id="ea-date-from" value="' + fromVal + '">' +
          '<span class="ea-date-label">To</span>' +
          '<input type="date" class="ea-date-input" id="ea-date-to" value="' + toVal + '">' +
        '</div>';
      var dateFrom = document.getElementById('ea-date-from');
      var dateTo = document.getElementById('ea-date-to');
      if (dateFrom) {
        dateFrom.addEventListener('change', function() {
          self._dateQuick = '';
          self._dateFrom = dateFrom.value ? new Date(dateFrom.value).toISOString() : null;
          self._selected = new Set();
          self._updateFilterBtnIndicators();
          self._load();
        });
      }
      if (dateTo) {
        dateTo.addEventListener('change', function() {
          self._dateQuick = '';
          self._dateTo = dateTo.value ? new Date(dateTo.value + 'T23:59:59').toISOString() : null;
          self._selected = new Set();
          self._updateFilterBtnIndicators();
          self._load();
        });
      }
    }
  },

  _updateFilterBtnIndicators: function() {
    var daysBtn = document.getElementById('ea-days-btn');
    var rangeBtn = document.getElementById('ea-range-btn');
    if (daysBtn && !daysBtn.classList.contains('open')) {
      daysBtn.classList.toggle('active', !!this._dateQuick);
    }
    if (rangeBtn && !rangeBtn.classList.contains('open')) {
      var hasRange = !this._dateQuick && this._dateFrom;
      rangeBtn.classList.toggle('active', !!hasRange);
    }
  },

  // ── Bind controls (matches CL _bindControls pattern) ──────
  _bindControls: function() {
    var self = this;
    var scanBtn = document.getElementById('ea-scan-btn');
    var handleAllBtn = document.getElementById('ea-handle-all-btn');
    var clearBtn = document.getElementById('clear-filters-btn');
    var searchEl = document.getElementById('ea-search');
    var bulkHandleBtn = document.getElementById('ea-bulk-handle-btn');
    var deselectBtn = document.getElementById('ea-deselect-btn');

    if (scanBtn) scanBtn.addEventListener('click', function() { self._scan(); });
    if (handleAllBtn) handleAllBtn.addEventListener('click', function() { self._handleAll(); });
    if (clearBtn) clearBtn.addEventListener('click', function() {
      self._clearFilters();
    });
    if (searchEl) searchEl.addEventListener('input', function() {
      self._searchTerm = searchEl.value.toLowerCase();
      self._renderList();
    });
    if (bulkHandleBtn) bulkHandleBtn.addEventListener('click', function() { self._bulkHandle(); });
    if (deselectBtn) deselectBtn.addEventListener('click', function() {
      self._selected = new Set();
      self._updateBulkBar();
      document.querySelectorAll('.item-checkbox').forEach(function(cb) { cb.checked = false; });
    });

    // Filter button toggles — matches CL pattern
    var daysBtn = document.getElementById('ea-days-btn');
    var rangeBtn = document.getElementById('ea-range-btn');

    function closeOthers(except) {
      [daysBtn, rangeBtn].forEach(function(b) {
        if (b && b !== except) { b.classList.remove('open'); }
      });
    }

    if (daysBtn) {
      daysBtn.addEventListener('click', function() {
        var isOpen = daysBtn.classList.contains('open');
        daysBtn.classList.toggle('open', !isOpen);
        closeOthers(daysBtn);
        self._renderExpandRow();
        self._updateFilterBtnIndicators();
      });
    }
    if (rangeBtn) {
      rangeBtn.addEventListener('click', function() {
        var isOpen = rangeBtn.classList.contains('open');
        rangeBtn.classList.toggle('open', !isOpen);
        closeOthers(rangeBtn);
        self._renderExpandRow();
        self._updateFilterBtnIndicators();
      });
    }

    this._updateFilterBtnIndicators();
  },

  // ── Stat tiles ────────────────────────────────────────────
  _bindStatTiles: function() {
    var self = this;
    document.querySelectorAll('.stat-card[data-stat]').forEach(function(tile) {
      var stat = tile.dataset.stat;
      if (stat === 'total') {
        tile.style.cursor = 'default';
        return;
      }
      tile.addEventListener('click', function() {
        if (stat === 'unhandled') {
          self._showHandled = false;
          self._activeCategory = 'all';
        } else if (stat === 'urgent') {
          self._showHandled = false;
          self._activeCategory = 'urgent';
        }
        self._selected = new Set();
        self._renderCategoryPills();
        self._load();
      });
    });
  },

  _updateStats: function() {
    var emails = this._emails;
    var total = emails.length;
    var unhandled = emails.filter(function(e) { return !e.handled; }).length;
    var urgent = emails.filter(function(e) { return e.category === 'urgent' && !e.handled; }).length;
    var totalEl = document.getElementById('stat-total');
    var unhandledEl = document.getElementById('stat-unhandled');
    var urgentEl = document.getElementById('stat-urgent');
    if (totalEl) totalEl.textContent = total;
    if (unhandledEl) unhandledEl.textContent = unhandled;
    if (urgentEl) urgentEl.textContent = urgent;
  },

  // ── Filter state persistence ──────────────────────────────
  _saveFilterState: function() {
    if (!this._activeAccount) return;
    this._filterState[this._activeAccount] = {
      category: this._activeCategory,
      categoryFilter: this._categoryFilter,
      showFlagged: this._showFlagged,
      search: this._searchTerm,
      dateQuick: this._dateQuick,
      dateFrom: this._dateFrom,
      dateTo: this._dateTo,
      showHandled: this._showHandled
    };
  },

  _restoreFilterState: function() {
    var s = this._filterState[this._activeAccount];
    if (s) {
      this._activeCategory = s.category || 'all';
      this._categoryFilter = s.categoryFilter || '';
      this._showFlagged = s.showFlagged || false;
      this._searchTerm = s.search || '';
      this._dateQuick = s.dateQuick || '';
      this._dateFrom = s.dateFrom || null;
      this._dateTo = s.dateTo || null;
      this._showHandled = s.showHandled || false;
    } else {
      this._activeCategory = 'all';
      this._categoryFilter = '';
      this._showFlagged = false;
      this._searchTerm = '';
      this._initDateDefaults();
      this._showHandled = false;
    }
    this._renderCategoryPills();
    this._renderFilterRow();
    this._bindControls();
  },

  _clearFilters: function() {
    this._activeCategory = 'all';
    this._categoryFilter = '';
    this._showFlagged = false;
    this._searchTerm = '';
    this._showHandled = false;
    this._initDateDefaults();
    this._selected = new Set();
    var daysBtn = document.getElementById('ea-days-btn');
    var rangeBtn = document.getElementById('ea-range-btn');
    if (daysBtn) { daysBtn.classList.remove('open', 'active'); }
    if (rangeBtn) { rangeBtn.classList.remove('open', 'active'); }
    var expandRow = document.getElementById('ea-filter-expand-row');
    if (expandRow) { expandRow.style.display = 'none'; expandRow.innerHTML = ''; }
    this._renderCategoryPills();
    this._updateFilterBtnIndicators();
    this._load();
  },

  // ── Load emails ───────────────────────────────────────────
  _load: async function() {
    var listEl = document.getElementById('ea-email-list');
    if (listEl) listEl.innerHTML = '<div class="list-loading">Loading...</div>';

    var activeAcct = this._connectedAccounts.find(function(a) { return a.email === this._activeAccount; }.bind(this));
    var providerVal = activeAcct ? (activeAcct.provider === 'gmail' || activeAcct.provider === 'google' ? 'gmail' : 'outlook') : null;

    var query = this._supabase
      .from('email_summaries')
      .select('*')
      .eq('user_id', this._user.id)
      .order('received_at', { ascending: false })
      .limit(200);

    if (providerVal) {
      query = query.eq('provider', providerVal);
    }

    if (this._dateFrom) {
      query = query.gte('received_at', this._dateFrom);
    } else if (!this._dateQuick) {
      // Default to 90 days when no filter is selected
      var d90 = new Date();
      d90.setDate(d90.getDate() - 90);
      query = query.gte('received_at', d90.toISOString());
    }
    if (this._dateTo) {
      query = query.lte('received_at', this._dateTo);
    }

    var result = await query;
    if (result.error) {
      if (listEl) listEl.innerHTML = '<div class="list-empty">Could not load emails.</div>';
      return;
    }
    this._emails = result.data || [];
    this._selected = new Set();
    this._updateStats();
    this._updateBulkBar();
    this._renderList();
    this._updateHandleAllLabel();
  },

  // ── Filtered items ────────────────────────────────────────
  _filteredItems: function() {
    var self = this;
    return this._emails.filter(function(item) {
      // Handled/dismissed filter
      if (self._showHandled) {
        if (!item.handled) return false;
      } else {
        if (item.handled) return false;
      }
      // Flagged filter
      if (self._showFlagged && !item.is_flagged) return false;
      // Permanent pill category filter (urgent)
      if (self._activeCategory !== 'all' && item.category !== self._activeCategory) return false;
      // Dropdown category filter
      if (self._categoryFilter && item.category !== self._categoryFilter) return false;
      // Search
      if (self._searchTerm) {
        var haystack = ((item.sender || '') + ' ' + (item.sender_email || '') + ' ' + (item.subject || '') + ' ' + (item.summary || '')).toLowerCase();
        if (haystack.indexOf(self._searchTerm) === -1) return false;
      }
      return true;
    });
  },

  // ── Render list ───────────────────────────────────────────
  _renderList: function() {
    var listEl = document.getElementById('ea-email-list');
    if (!listEl) return;
    var items = this._filteredItems();
    if (items.length === 0) {
      listEl.innerHTML = '<div class="list-empty">No emails found.</div>';
      return;
    }
    var self = this;
    listEl.innerHTML = items.map(function(item) { return self._cardHtml(item); }).join('');
    this._bindCardEvents();
  },

  _cardHtml: function(email) {
    var id = window.escHtml(email.id || email.message_id);
    var sender = window.escHtml(email.sender || email.sender_email || 'Unknown');
    var subject = window.escHtml(email.subject || 'No subject');
    var summary = window.escHtml(email.summary || '');
    var providerLabel = email.provider === 'gmail' ? 'Gmail' : 'Outlook';
    var catLabel = this._getCategoryLabel(email.category);
    var dateStr = email.received_at ? new Date(email.received_at).toLocaleDateString('en-AU') : '';
    var checked = this._selected.has(email.id || email.message_id) ? ' checked' : '';
    var flagIcon = email.is_flagged ? '&#9733;' : '&#9734;';
    var flagTitle = email.is_flagged ? 'Unflag' : 'Flag';

    var actionBtn;
    if (this._showHandled) {
      actionBtn = '<button class="ea-unmark-btn" data-id="' + id + '">&#10003; Restore</button>' +
        '<button class="btn-dismiss ea-delete-btn" data-id="' + id + '">&#10007; Delete</button>';
    } else {
      actionBtn = '<button class="btn-dismiss ea-handled-btn" data-id="' + id + '">&#10007; Dismiss</button>';
    }

    var sourceDetailHtml =
      '<div><span class="source-detail-label">Connection:</span> ' + window.escHtml(providerLabel) + '</div>' +
      '<div><span class="source-detail-label">Account:</span> ' + window.escHtml(this._activeAccount || '') + '</div>' +
      '<div><span class="source-detail-label">From:</span> ' + sender + (email.sender_email ? ' &lt;' + window.escHtml(email.sender_email) + '&gt;' : '') + '</div>' +
      '<div><span class="source-detail-label">Subject:</span> ' + subject + '</div>';

    return '<div class="item-card" data-id="' + id + '">' +
      '<div class="item-card-header">' +
        '<input type="checkbox" class="item-checkbox" data-id="' + id + '"' + checked + '>' +
        '<button class="ea-flag-btn" data-id="' + id + '" data-flagged="' + (email.is_flagged ? '1' : '0') + '" title="' + flagTitle + '">' + flagIcon + '</button>' +
        '<span class="ea-sender-name">' + sender + '</span>' +
        '<div class="item-card-preview-row">' +
          '<span class="ea-subject-inline">' + subject + '</span>' +
        '</div>' +
        '<div class="item-card-preview-row">' +
          '<span class="text-preview">' + summary + '</span>' +
        '</div>' +
        '<div class="item-card-btns">' +
          '<span class="item-upload-date">' + dateStr + '</span>' +
          '<button class="source-btn" data-id="' + id + '" data-section="source" title="View source">&#128196; Source</button>' +
          actionBtn +
        '</div>' +
      '</div>' +
      '<div class="item-section" id="ea-source-' + id + '" style="display:none">' +
        '<div class="item-section-head"><span class="section-head-label">Source</span></div>' +
        '<div class="source-detail">' + sourceDetailHtml + '</div>' +
      '</div>' +
    '</div>';
  },

  _bindCardEvents: function() {
    var self = this;

    document.querySelectorAll('.item-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        if (cb.checked) { self._selected.add(cb.dataset.id); } else { self._selected.delete(cb.dataset.id); }
        self._updateBulkBar();
      });
    });

    document.querySelectorAll('.ea-handled-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._markHandled(btn.dataset.id); });
    });

    document.querySelectorAll('.ea-unmark-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._unmarkHandled(btn.dataset.id); });
    });

    document.querySelectorAll('.ea-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._deleteEmail(btn.dataset.id); });
    });

    var flagBtns = document.querySelectorAll('.ea-flag-btn');
    console.log('[EA Flag Debug] Binding flag buttons — count:', flagBtns.length);
    flagBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        console.log('[EA Flag Debug] Click fired — id:', btn.dataset.id, 'flagged:', btn.dataset.flagged);
        var isFlagged = btn.dataset.flagged === '1';
        self._toggleFlag(btn.dataset.id, !isFlagged, btn);
      });
    });

    // Source button toggle — matches CL pattern
    var listEl = document.getElementById('ea-email-list');
    if (listEl) listEl.querySelectorAll('.source-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var el = document.getElementById('ea-' + btn.dataset.section + '-' + btn.dataset.id);
        if (el) {
          var isOpen = el.style.display !== 'none';
          el.style.display = isOpen ? 'none' : '';
          btn.classList.toggle('open', !isOpen);
        }
      });
    });

    document.querySelectorAll('.item-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.item-checkbox') || e.target.closest('.ea-flag-btn') ||
            e.target.closest('.ea-handled-btn') || e.target.closest('.ea-unmark-btn') || e.target.closest('.ea-delete-btn') ||
            e.target.closest('.source-btn')) return;
        var email = self._emails.find(function(em) { return (em.id || em.message_id) === card.dataset.id; });
        if (email) self._showDetail(email);
      });
    });
  },

  // ── Bulk bar ──────────────────────────────────────────────
  _updateBulkBar: function() {
    var bar = document.getElementById('ea-bulk-bar');
    var count = document.getElementById('ea-bulk-count');
    if (!bar || !count) return;
    var n = this._selected.size;
    bar.style.display = n > 0 ? '' : 'none';
    count.textContent = n + ' selected';
  },

  // ── Actions ───────────────────────────────────────────────
  _markHandled: async function(id) {
    var result = await this._supabase.from('email_summaries').update({ handled: true }).eq('id', id);
    if (result.error) { console.error('[EA] markHandled error:', result.error); return; }
    this._emails = this._emails.map(function(e) {
      return (e.id || e.message_id) === id ? Object.assign({}, e, { handled: true }) : e;
    });
    this._selected.delete(id);
    this._updateStats();
    this._updateBulkBar();
    this._renderList();
  },

  _unmarkHandled: async function(id) {
    var result = await this._supabase.from('email_summaries').update({ handled: false }).eq('id', id);
    if (result.error) { console.error('[EA] unmarkHandled error:', result.error); return; }
    this._emails = this._emails.map(function(e) {
      return (e.id || e.message_id) === id ? Object.assign({}, e, { handled: false }) : e;
    });
    this._selected.delete(id);
    this._updateStats();
    this._updateBulkBar();
    this._renderList();
  },

  _bulkHandle: async function() {
    var ids = Array.from(this._selected);
    if (ids.length === 0) return;
    var newVal = !this._showHandled;
    var result = await this._supabase.from('email_summaries').update({ handled: newVal }).in('id', ids);
    if (result.error) { console.error('[EA] bulkHandle error:', result.error); return; }
    var self = this;
    this._emails = this._emails.map(function(e) {
      return self._selected.has(e.id || e.message_id) ? Object.assign({}, e, { handled: newVal }) : e;
    });
    this._selected = new Set();
    this._updateStats();
    this._updateBulkBar();
    this._renderList();
  },

  _handleAll: async function() {
    var filtered = this._filteredItems();
    if (filtered.length === 0) return;
    var ids = filtered.map(function(i) { return i.id || i.message_id; });
    var newVal = !this._showHandled;
    var result = await this._supabase.from('email_summaries').update({ handled: newVal }).in('id', ids);
    if (result.error) { console.error('[EA] handleAll error:', result.error); return; }
    this._emails = this._emails.map(function(e) {
      return ids.indexOf(e.id || e.message_id) > -1 ? Object.assign({}, e, { handled: newVal }) : e;
    });
    this._selected = new Set();
    this._updateStats();
    this._updateBulkBar();
    this._renderList();
  },

  _deleteEmail: async function(id) {
    var result = await this._supabase.from('email_summaries').delete().eq('id', id);
    if (result.error) { console.error('[EA] deleteEmail error:', result.error); return; }
    this._emails = this._emails.filter(function(e) { return (e.id || e.message_id) !== id; });
    this._selected.delete(id);
    this._updateStats();
    this._updateBulkBar();
    this._renderList();
  },

  _updateHandleAllLabel: function() {
    var btn = document.getElementById('ea-handle-all-btn');
    if (btn) {
      if (this._showHandled) {
        btn.innerHTML = '&#10003; Restore All';
        btn.classList.remove('btn-dismiss', 'ea-handled-btn');
        btn.classList.add('ea-unmark-btn');
      } else {
        btn.innerHTML = '&#10007; Dismiss All';
        btn.classList.remove('ea-unmark-btn');
        btn.classList.add('btn-dismiss', 'ea-handled-btn');
      }
    }

    var bulkBtn = document.getElementById('ea-bulk-handle-btn');
    if (bulkBtn) {
      if (this._showHandled) {
        bulkBtn.innerHTML = '&#10003; Restore All Selected';
        bulkBtn.classList.remove('btn-dismiss', 'ea-handled-btn');
        bulkBtn.classList.add('ea-unmark-btn');
      } else {
        bulkBtn.innerHTML = '&#10007; Dismiss All Selected';
        bulkBtn.classList.remove('ea-unmark-btn');
        bulkBtn.classList.add('btn-dismiss', 'ea-handled-btn');
      }
    }
  },

  // ── Flag ──────────────────────────────────────────────────
  _toggleFlag: async function(id, newState, btnEl) {
    console.log('[EA Flag Debug] _toggleFlag called — id:', id, 'newState:', newState, 'btnEl:', !!btnEl);
    var oldState = !newState;
    var self = this;
    // Optimistic UI update
    if (btnEl) {
      btnEl.innerHTML = newState ? '&#9733;' : '&#9734;';
      btnEl.dataset.flagged = newState ? '1' : '0';
      btnEl.title = newState ? 'Unflag' : 'Flag';
    }
    this._emails = this._emails.map(function(e) {
      return (e.id || e.message_id) === id ? Object.assign({}, e, { is_flagged: newState }) : e;
    });
    console.log('[EA Flag Debug] Optimistic update done');

    function revertFlag() {
      console.log('[EA Flag Debug] revertFlag called');
      if (btnEl) {
        btnEl.innerHTML = oldState ? '&#9733;' : '&#9734;';
        btnEl.dataset.flagged = oldState ? '1' : '0';
        btnEl.title = oldState ? 'Unflag' : 'Flag';
      }
      self._emails = self._emails.map(function(e) {
        return (e.id || e.message_id) === id ? Object.assign({}, e, { is_flagged: oldState }) : e;
      });
    }

    var email = this._emails.find(function(e) { return (e.id || e.message_id) === id; });
    console.log('[EA Flag Debug] Email found:', !!email, 'provider:', email ? email.provider : 'N/A');
    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      console.log('[EA Flag Debug] Session:', !!session, 'hasToken:', !!(session && session.access_token));
      if (!session || !session.access_token) {
        console.error('[EA] Flag error: no active session — please refresh the page');
        revertFlag();
        return;
      }
      var payload = {
        messageId: id,
        provider: email ? email.provider : 'gmail',
        flagState: newState
      };
      console.log('[EA Flag Debug] Calling /api/ea-flag with:', JSON.stringify(payload));
      var resp = await fetch('/api/ea-flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify(payload)
      });
      console.log('[EA Flag Debug] Response status:', resp.status);
      if (!resp.ok) {
        var errBody = await resp.text();
        console.error('[EA] Flag API error:', resp.status, errBody);
        revertFlag();
      } else {
        console.log('[EA Flag Debug] Flag toggle succeeded');
      }
    } catch (e) {
      console.error('[EA] Flag error:', e.message);
      revertFlag();
    }
  },

  // ── Scan ──────────────────────────────────────────────────
  _scan: async function() {
    var btn = document.getElementById('ea-scan-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }

    var listEl = document.getElementById('ea-email-list');
    if (listEl) listEl.innerHTML = '<div class="list-loading">Scanning your inbox...</div>';

    try {
      var session = (await this._supabase.auth.getSession()).data.session;
      var token = session.access_token;
      this._pendingJobs = 0;

      var activeAcct = this._connectedAccounts.find(function(a) { return a.email === this._activeAccount; }.bind(this));
      if (!activeAcct) {
        if (listEl) listEl.innerHTML = '<div class="list-empty">No account selected.</div>';
        this._finishScan();
        return;
      }

      var sourceType = (activeAcct.provider === 'gmail' || activeAcct.provider === 'google') ? 'ea-gmail' : 'ea-outlook';
      await this._queueAndWatch(sourceType, activeAcct.email, token);

      if (this._pendingJobs === 0) {
        if (listEl) listEl.innerHTML = '<div class="list-empty">Could not start scan.</div>';
        this._finishScan();
      }
    } catch (e) {
      if (listEl) listEl.innerHTML = '<div class="list-empty">Scan failed. Please try again.</div>';
      this._finishScan();
    }
  },

  _queueAndWatch: async function(sourceType, accountEmail, token) {
    try {
      var resp = await fetch('/api/scan-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ sourceType: sourceType, sourceAccount: accountEmail })
      });
      var result;
      try { result = await resp.json(); } catch (e) { result = { error: 'Server returned an invalid response' }; }
      if (!resp.ok || result.error) {
        console.error('[EA] Queue error for', accountEmail, ':', result.error || resp.status);
        return;
      }
      this._pendingJobs++;
      this._watchJob(result.jobId, accountEmail);
    } catch (e) {
      console.error('[EA] Queue exception for', accountEmail, ':', e.message);
    }
  },

  _watchJob: function(jobId, label) {
    var self = this;
    var channel = this._supabase
      .channel('ea-scan-job-' + jobId)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cl_scan_jobs', filter: 'id=eq.' + jobId },
        function(payload) {
          var row = payload.new;
          if (!row) return;
          var listEl = document.getElementById('ea-email-list');
          if (row.status === 'running') {
            if (listEl) listEl.innerHTML = '<div class="list-loading">Scanning ' + window.escHtml(label) + '...</div>';
          } else if (row.status === 'completed') {
            self._cleanupJob(jobId);
          } else if (row.status === 'failed') {
            if (listEl) listEl.innerHTML = '<div class="list-empty">Scan failed: ' + window.escHtml(row.error_text || 'Unknown error') + '</div>';
            self._cleanupJob(jobId);
          } else if (row.status === 'cancelled') {
            if (listEl) listEl.innerHTML = '<div class="list-empty">Scan cancelled.</div>';
            self._cleanupJob(jobId);
          }
        }
      )
      .subscribe();
    this._jobChannels[jobId] = channel;
  },

  _cleanupJob: function(jobId) {
    if (this._jobChannels[jobId]) {
      this._supabase.removeChannel(this._jobChannels[jobId]);
      delete this._jobChannels[jobId];
    }
    this._pendingJobs--;
    if (this._pendingJobs <= 0) {
      this._pendingJobs = 0;
      this._load();
      this._finishScan();
    }
  },

  _finishScan: function() {
    var btn = document.getElementById('ea-scan-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Scan Now'; }
  },

  // ── Detail view ───────────────────────────────────────────
  _showDetail: async function(email) {
    var listEl = document.getElementById('ea-email-list');
    if (!listEl) return;

    var catLabel = this._getCategoryLabel(email.category);
    var relTime = email.received_at ? new Date(email.received_at).toLocaleDateString('en-AU') : '';
    var providerLabel = email.provider === 'gmail' ? 'Gmail' : 'Outlook';
    var self = this;

    var openBtnHtml = email.message_url
      ? '<a href="' + window.escHtml(email.message_url) + '" target="_blank" class="btn-outline">Open In ' + providerLabel + ' →</a>'
      : '';

    var actionBtn = this._showHandled
      ? '<button class="ea-unmark-btn" id="ea-detail-action-btn" data-id="' + window.escHtml(email.id || email.message_id) + '">&#10003; Restore</button>'
      : '<button class="btn-dismiss ea-handled-btn" id="ea-detail-action-btn" data-id="' + window.escHtml(email.id || email.message_id) + '">&#10007; Dismiss</button>';

    listEl.innerHTML =
      '<div class="ea-detail">' +
        '<div class="ea-detail-topbar">' +
          '<button class="btn-back" id="ea-detail-back">← Back</button>' +
          openBtnHtml +
        '</div>' +
        '<div class="ea-detail-meta">' +
          '<span class="ea-sender-name">' + window.escHtml(email.sender || email.sender_email || '') + '</span>' +
          '<span class="ea-date">Imported: ' + relTime + '</span>' +
        '</div>' +
        '<div class="ea-detail-subject">' + window.escHtml(email.subject || '') + '</div>' +
        '<div class="ea-detail-summary"><strong>Summary:</strong> ' + window.escHtml(email.summary || '') + '</div>' +
        '<div class="ea-detail-body" id="ea-detail-body">Loading email body...</div>' +
        '<div class="ea-detail-footer">' + actionBtn + openBtnHtml + '</div>' +
      '</div>';

    document.getElementById('ea-detail-back').addEventListener('click', function() {
      self._renderList();
    });

    var detailActionBtn = document.getElementById('ea-detail-action-btn');
    if (detailActionBtn) {
      detailActionBtn.addEventListener('click', function() {
        if (self._showHandled) {
          self._unmarkHandled(detailActionBtn.dataset.id);
        } else {
          self._markHandled(detailActionBtn.dataset.id);
        }
      });
    }

    // Fetch body from cl-assets
    var bodyEl = document.getElementById('ea-detail-body');
    if (email.body_url) {
      try {
        var signedResult = await this._supabase.storage
          .from('cl-assets')
          .createSignedUrl(email.body_url, 3600);
        if (signedResult.data && signedResult.data.signedUrl) {
          var bodyRes = await fetch(signedResult.data.signedUrl);
          if (bodyRes.ok) {
            bodyEl.textContent = await bodyRes.text();
          } else {
            bodyEl.textContent = 'Could not load email body.';
          }
        } else {
          bodyEl.textContent = 'Could not load email body.';
        }
      } catch (fetchErr) {
        console.error('[EA] Body fetch error:', fetchErr.message);
        bodyEl.textContent = 'Could not load email body.';
      }
    } else {
      bodyEl.textContent = 'Email body not available. This email was scanned before body storage was enabled.';
    }
  },

  // ── Helpers ──────────────────────────────────────────��────
  _getCategoryLabel: function(id) {
    if (!id) return 'Unknown';
    // Check user settings first
    if (this._settings && this._settings.categories) {
      var cat = this._settings.categories.find(function(c) { return c.id === id; });
      if (cat) return cat.label;
    }
    // Fall back to defaults
    var def = this.DEFAULT_CATEGORIES.find(function(c) { return c.id === id; });
    if (def) return def.label;
    // Unknown ID — title-case it
    return id.charAt(0).toUpperCase() + id.slice(1);
  },

  _providerLabel: function(provider) {
    if (provider === 'gmail' || provider === 'google') return 'Gmail';
    if (provider === 'microsoft' || provider === 'outlook') return 'Outlook';
    return provider || 'Email';
  }
};

// ── Bootstrap ─────────────────────────────────────────────
(function() {
  var supabase = window.supabaseClient;
  if (!supabase) return;
  supabase.auth.getSession().then(function(result) {
    var session = result.data && result.data.session;
    if (!session) { window.location.href = '/login'; return; }
    if (window.EA_LOGIC && window.EA_LOGIC.init) {
      window.EA_LOGIC.init(supabase, session.user);
    }
  });
})();

window.addEventListener('pageshow', function(e) {
  if (!e.persisted) return;
  var supabase = window.supabaseClient;
  if (!supabase) return;
  supabase.auth.getSession().then(function(result) {
    var session = result.data && result.data.session;
    if (!session) return;
    if (window.EA_LOGIC && window.EA_LOGIC.init) {
      window.EA_LOGIC.init(supabase, session.user);
    }
  });
});
