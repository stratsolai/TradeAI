window.CL_OUTPUTS = {
  _supabase: null,
  _status: 'approved',
  _toolFilters: [],
  _categoryFilter: [],
  _searchTerm: '',
  _items: [],
  _selected: new Set(),

  init: async function(supabase) {
    this._supabase = supabase;
    var style = getComputedStyle(document.documentElement);
    this._colors = {
      blueLight: style.getPropertyValue('--blue-light').trim(),
      greenLight: style.getPropertyValue('--green-light').trim(),
      archivedBg: style.getPropertyValue('--archived-bg').trim()
    };
    this._render();
    var self = this;
    try {
      var authResp = await supabase.auth.getUser();
      var user = authResp.data ? authResp.data.user : null;
      if (user) {
        var profResult = await supabase.from('profiles').select('activated_tools').eq('id', user.id).single();
        this._activatedTools = (profResult.data && !profResult.error && Array.isArray(profResult.data.activated_tools)) ? profResult.data.activated_tools : [];
      } else {
        this._activatedTools = [];
      }
    } catch (e) {
      console.error('[CL Outputs] init auth error:', e.message);
      this._activatedTools = [];
    }
    this._load();
  },

  _render: function() {
    var el = document.getElementById('cl-tab-outputs');
    if (!el) return;
    el.innerHTML = '<div class="review-wrap">'
      + '<div class="review-status-row">'
      + '<button class="status-btn outputs-status-btn active" data-status="approved">Approved</button>'
      + '<button class="status-btn outputs-status-btn" data-status="archived">Archived</button>'
      + '<input type="text" id="outputs-search" class="review-search-input" placeholder="Search outputs...">'
      + '</div>'
      + '<div class="review-filter-btns-row">'
      + '<button class="filter-btn filter-tools-btn outputs-filter-tools-btn">&#9783; Filter By Tools</button>'
      + '<button class="filter-btn filter-cat-btn outputs-filter-cat-btn">&#9776; Filter By Category</button>'
      + '<button class="clear-filters-btn outputs-clear-btn">&#10005; Clear All Filters</button>'
      + '</div>'
      + '<div id="outputs-filter-row" class="review-filter-row" style="display:none">'
      + '<div id="outputs-tool-pills-wrap" style="display:none"><div class="filter-section-label">Tools</div><div id="outputs-tool-pills" class="review-pill-row"></div></div>'
      + '<div id="outputs-cat-pills-wrap" style="display:none"><div class="filter-section-label">Categories</div><div id="outputs-cat-pills" class="review-pill-row"></div></div>'
      + '</div>'
      + '<div id="outputs-list" class="review-list"></div>'
      + '</div>';
    this._bindControls();
  },

  _bindControls: function() {
    var self = this;
    var statusColors = { approved: self._colors.greenLight, archived: self._colors.archivedBg };
    var container = document.getElementById('cl-tab-outputs');
    if (!container) return;
    container.querySelectorAll('.outputs-status-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.outputs-status-btn').forEach(function(b) { b.classList.remove('active'); b.style.background = ''; });
        btn.classList.add('active');
        btn.style.background = statusColors[btn.dataset.status] || '';
        self._status = btn.dataset.status;
        self._toolFilters = [];
        self._categoryFilter = [];
        self._searchTerm = '';
        var searchEl = document.getElementById('outputs-search');
        if (searchEl) searchEl.value = '';
        self._closeFilterDropdowns();
        self._load();
      });
      btn.addEventListener('mouseenter', function() { btn.style.background = statusColors[btn.dataset.status] || ''; });
      btn.addEventListener('mouseleave', function() { if (!btn.classList.contains('active')) btn.style.background = ''; });
      if (btn.classList.contains('active')) btn.style.background = statusColors[btn.dataset.status] || '';
    });
    var searchEl = document.getElementById('outputs-search');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        self._searchTerm = this.value.toLowerCase();
        self._renderList();
      });
    }
    var filterToolsBtn = container.querySelector('.outputs-filter-tools-btn');
    var filterCatBtn = container.querySelector('.outputs-filter-cat-btn');
    var clearBtn = container.querySelector('.outputs-clear-btn');
    function updateFilterRow() {
      var filterRow = document.getElementById('outputs-filter-row');
      var toolsOpen = filterToolsBtn && filterToolsBtn.classList.contains('active');
      var catsOpen = filterCatBtn && filterCatBtn.classList.contains('active');
      var toolWrap = document.getElementById('outputs-tool-pills-wrap');
      var catWrap = document.getElementById('outputs-cat-pills-wrap');
      if (toolWrap) toolWrap.style.display = toolsOpen ? '' : 'none';
      if (catWrap) catWrap.style.display = catsOpen ? '' : 'none';
      if (filterRow) filterRow.style.display = (toolsOpen || catsOpen) ? 'block' : 'none';
    }
    if (filterToolsBtn) {
      filterToolsBtn.addEventListener('click', function() {
        var isOpen = filterToolsBtn.classList.contains('active');
        filterToolsBtn.classList.toggle('active', !isOpen);
        filterToolsBtn.style.background = !isOpen ? self._colors.blueLight : '';
        if (!isOpen) self._renderFilterRow();
        updateFilterRow();
        self._updateFilterBtnIndicators();
      });
    }
    if (filterCatBtn) {
      filterCatBtn.addEventListener('click', function() {
        var isOpen = filterCatBtn.classList.contains('active');
        filterCatBtn.classList.toggle('active', !isOpen);
        filterCatBtn.style.background = !isOpen ? self._colors.blueLight : '';
        if (!isOpen) self._renderFilterRow();
        updateFilterRow();
        self._updateFilterBtnIndicators();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        self._toolFilters = [];
        self._categoryFilter = [];
        if (filterToolsBtn) { filterToolsBtn.classList.remove('active'); filterToolsBtn.style.background = ''; }
        if (filterCatBtn) { filterCatBtn.classList.remove('active'); filterCatBtn.style.background = ''; }
        updateFilterRow();
        self._renderFilterRow();
        self._renderList();
      });
    }
  },

  _closeFilterDropdowns: function() {
    var container = document.getElementById('cl-tab-outputs');
    if (!container) return;
    var ftb = container.querySelector('.outputs-filter-tools-btn');
    var fcb = container.querySelector('.outputs-filter-cat-btn');
    if (ftb) { ftb.classList.remove('active'); ftb.style.background = ''; }
    if (fcb) { fcb.classList.remove('active'); fcb.style.background = ''; }
    var filterRow = document.getElementById('outputs-filter-row');
    var toolWrap = document.getElementById('outputs-tool-pills-wrap');
    var catWrap = document.getElementById('outputs-cat-pills-wrap');
    if (toolWrap) toolWrap.style.display = 'none';
    if (catWrap) catWrap.style.display = 'none';
    if (filterRow) filterRow.style.display = 'none';
  },

  _updateFilterBtnIndicators: function() {
    var container = document.getElementById('cl-tab-outputs');
    if (!container) return;
    var ftb = container.querySelector('.outputs-filter-tools-btn');
    var fcb = container.querySelector('.outputs-filter-cat-btn');
    if (ftb && !ftb.classList.contains('active')) {
      ftb.style.background = this._toolFilters.length > 0 ? this._colors.blueLight : '';
    }
    if (fcb && !fcb.classList.contains('active')) {
      fcb.style.background = this._categoryFilter.length > 0 ? this._colors.blueLight : '';
    }
  },

  _load: async function() {
    var list = document.getElementById('outputs-list');
    if (list) list.innerHTML = '<div class="list-loading">Loading...</div>';
    if (!this._supabase) {
      if (list) list.innerHTML = '<div class="list-empty">Unable to load outputs. Please refresh the page.</div>';
      return;
    }
    var authResp;
    try { authResp = await this._supabase.auth.getUser(); } catch (e) { authResp = { data: null }; }
    var user = authResp.data ? authResp.data.user : null;
    if (!user) {
      if (list) list.innerHTML = '<div class="list-empty">Please sign in to view outputs.</div>';
      return;
    }
    var result = await this._supabase
      .from('content_library')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', this._status)
      .eq('source', 'tool')
      .order('created_at', { ascending: false });
    if (result.error) {
      if (list) list.innerHTML = '<div class="list-empty">Could not load outputs.</div>';
      return;
    }
    this._items = result.data || [];
    this._renderFilterRow();
    this._renderList();
  },

  _renderFilterRow: function() {
    var catPillsEl = document.getElementById('outputs-cat-pills');
    var toolPillsEl = document.getElementById('outputs-tool-pills');
    if (!catPillsEl || !toolPillsEl) return;
    var self = this;

    var FIXED_CATEGORIES = ['Products & Services', 'Pricing', 'Company Information', 'Jobs, Portfolio & Photos', 'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Industry News', 'Tender & Proposal Documents', 'Financial Documents', 'Compliance & Certificates', 'Safety & SWMS', 'Supplier Communications'];
    catPillsEl.innerHTML = FIXED_CATEGORIES.map(function(cat) {
      var isActive = self._categoryFilter.indexOf(cat) > -1;
      return '<button class="filter-pill' + (isActive ? ' active' : '') + '" data-cat="' + escHtml(cat) + '">' + escHtml(cat) + '</button>';
    }).join('');

    var tools = window.CORE_TOOLS || [];
    toolPillsEl.innerHTML = tools.map(function(tool) {
      var isActive = self._toolFilters.indexOf(tool.id) > -1;
      var toolLabel = Array.isArray(tool.title) ? tool.title.join(' ') : (tool.title || tool.id);
      return '<button class="filter-pill' + (isActive ? ' active' : '') + '" data-tool="' + escHtml(tool.id) + '">' + escHtml(toolLabel) + '</button>';
    }).join('');

    catPillsEl.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        var id = pill.dataset.cat;
        var idx = self._categoryFilter.indexOf(id);
        if (idx > -1) { self._categoryFilter.splice(idx, 1); } else { self._categoryFilter.push(id); }
        self._renderFilterRow();
        self._renderList();
      });
    });
    toolPillsEl.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        var id = pill.dataset.tool;
        var idx = self._toolFilters.indexOf(id);
        if (idx > -1) { self._toolFilters.splice(idx, 1); } else { self._toolFilters.push(id); }
        self._renderFilterRow();
        self._renderList();
      });
    });
    self._updateFilterBtnIndicators();
  },

  _filteredItems: function() {
    var self = this;
    return this._items.filter(function(item) {
      if (self._categoryFilter.length > 0) {
        var catTags = Array.isArray(item.category_tags) ? item.category_tags : [];
        var matchesCat = self._categoryFilter.indexOf(item.category) > -1;
        var matchesCatTags = self._categoryFilter.some(function(f) { return catTags.indexOf(f) > -1; });
        if (!matchesCat && !matchesCatTags) return false;
      }
      if (self._toolFilters.length > 0) {
        var tags = Array.isArray(item.tool_tags) ? item.tool_tags : [];
        if (!self._toolFilters.some(function(f) { return tags.indexOf(f) > -1; })) return false;
      }
      if (self._searchTerm) {
        if ((item.title || '').toLowerCase().indexOf(self._searchTerm) === -1) return false;
      }
      return true;
    });
  },

  _renderList: function() {
    var list = document.getElementById('outputs-list');
    if (!list) return;
    var items = this._filteredItems();
    if (items.length === 0) {
      list.innerHTML = '<div class="list-empty">No outputs found.</div>';
      return;
    }
    var self = this;
    list.innerHTML = items.map(function(item) { return self._cardHtml(item); }).join('');
    this._bindCardEvents();
  },

  _cardHtml: function(item) {
    var id = escHtml(item.id);
    var title = escHtml(item.title || 'Untitled');
    var uploadDate = item.created_at ? new Date(item.created_at).toLocaleDateString('en-AU') : '';
    var bodyPreview = escHtml(item.content_text || '');
    var tools = window.CORE_TOOLS || [];
    var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags : [];
    var toolBadges = toolTags.map(function(tid) {
      var tool = tools.find(function(t) { return t.id === tid; });
      var label = tool ? (Array.isArray(tool.title) ? tool.title.join(' ') : (tool.title || tool.id)) : tid;
      return '<span class="review-type-badge">' + escHtml(label) + '</span>';
    }).join('');
    var catTags = Array.isArray(item.category_tags) && item.category_tags.length > 0 ? item.category_tags : (item.category ? [item.category] : []);
    var catBadges = catTags.map(function(cat) {
      return '<span class="review-source-badge">' + escHtml(cat) + '</span>';
    }).join('');
    return '<div class="item-card" data-id="' + id + '">'
      + '<div class="item-card-header">'
      + '<span style="flex:1;min-width:140px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      + '<span class="item-card-title" style="flex:0 1 auto;min-width:0;">' + title + '</span>'
      + toolBadges + catBadges
      + '</span>'
      + '<div class="item-card-preview-row">'
      + '<button class="review-expand-btn outputs-expand-btn" data-id="' + id + '" title="Expand">&#9654;</button>'
      + '<span class="review-body-preview" id="outputs-preview-' + id + '">' + bodyPreview + '</span>'
      + '</div>'
      + '<div class="item-card-btns">'
      + '<span class="item-upload-date">' + uploadDate + '</span>'
      + '</div>'
      + '</div>'
      + '</div>';
  },

  _bindCardEvents: function() {
    document.querySelectorAll('.outputs-expand-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var card = btn.closest('.item-card');
        if (!card) return;
        var isExpanded = card.classList.contains('review-body-expanded');
        card.classList.toggle('review-body-expanded', !isExpanded);
        var span = document.getElementById('outputs-preview-' + btn.dataset.id);
        if (span) {
          span.style.whiteSpace = isExpanded ? '' : 'pre-wrap';
          span.style.overflow = isExpanded ? '' : 'visible';
        }
        btn.innerHTML = isExpanded ? '&#9654;' : '&#9660;';
      });
    });
  }
};
