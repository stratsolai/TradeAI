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
    var container = document.getElementById('cl-tab-outputs');
    if (!container) return;
    container.querySelectorAll('.outputs-status-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.outputs-status-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self._status = btn.dataset.status;
        self._toolFilters = [];
        self._categoryFilter = [];
        self._searchTerm = '';
        var searchEl = document.getElementById('outputs-search');
        if (searchEl) searchEl.value = '';
        self._closeFilterDropdowns();
        self._load();
      });
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
      var toolsOpen = filterToolsBtn && filterToolsBtn.classList.contains('open');
      var catsOpen = filterCatBtn && filterCatBtn.classList.contains('open');
      var toolWrap = document.getElementById('outputs-tool-pills-wrap');
      var catWrap = document.getElementById('outputs-cat-pills-wrap');
      if (toolWrap) toolWrap.style.display = toolsOpen ? '' : 'none';
      if (catWrap) catWrap.style.display = catsOpen ? '' : 'none';
      if (filterRow) filterRow.style.display = (toolsOpen || catsOpen) ? 'block' : 'none';
    }
    if (filterToolsBtn) {
      filterToolsBtn.addEventListener('click', function() {
        var isOpen = filterToolsBtn.classList.contains('open');
        filterToolsBtn.classList.toggle('open', !isOpen);
        if (!isOpen) self._renderFilterRow();
        updateFilterRow();
        self._updateFilterBtnIndicators();
      });
    }
    if (filterCatBtn) {
      filterCatBtn.addEventListener('click', function() {
        var isOpen = filterCatBtn.classList.contains('open');
        filterCatBtn.classList.toggle('open', !isOpen);
        if (!isOpen) self._renderFilterRow();
        updateFilterRow();
        self._updateFilterBtnIndicators();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        self._toolFilters = [];
        self._categoryFilter = [];
        if (filterToolsBtn) { filterToolsBtn.classList.remove('open', 'active'); }
        if (filterCatBtn) { filterCatBtn.classList.remove('open', 'active'); }
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
    if (ftb) { ftb.classList.remove('open', 'active'); }
    if (fcb) { fcb.classList.remove('open', 'active'); }
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
    if (ftb && !ftb.classList.contains('open')) {
      ftb.classList.toggle('active', this._toolFilters.length > 0);
    }
    if (fcb && !fcb.classList.contains('open')) {
      fcb.classList.toggle('active', this._categoryFilter.length > 0);
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

  _connectionLabel: function(item) {
    if (!item) return '';
    var srcVal = item.source || '';
    if (srcVal === 'tool') {
      var ts = item.tool_source || '';
      var tools = window.CORE_TOOLS || [];
      var match = tools.find(function(t) { return t.id === ts; });
      if (match) return Array.isArray(match.title) ? match.title.join(' ') : (match.title || ts);
      if (ts) return ts.charAt(0).toUpperCase() + ts.slice(1);
      return 'Tool';
    }
    return '';
  },

  _cardHtml: function(item) {
    var id = escHtml(item.id);
    var title = escHtml(item.title || 'Untitled');
    var uploadDate = item.created_at ? new Date(item.created_at).toLocaleDateString('en-AU') : '';
    var bodyPreview = escHtml(item.content_text || '');
    var checked = this._selected.has(item.id) ? ' checked' : '';
    var tools = window.CORE_TOOLS || [];
    var activatedTools = this._activatedTools || [];
    var toolTags = Array.isArray(item.tool_tags) ? item.tool_tags : [];
    var toolPillsHtml = tools.map(function(tool) {
      var isTagged = toolTags.indexOf(tool.id) > -1;
      var isActivated = activatedTools.indexOf(tool.id) > -1;
      var tLabel = Array.isArray(tool.title) ? tool.title.join(' ') : (tool.title || tool.id);
      if (!isActivated) {
        return '<a href="/activate?tool=' + escHtml(tool.id) + '" class="tool-pill tool-pill-inactive tool-pill-teal' + (isTagged ? ' tool-pill-tagged tagged' : '') + '" title="Learn more about this tool">' + escHtml(tLabel) + ' <span class="tool-pill-add-stax">+ Learn More</span></a>';
      }
      return '<button class="tool-pill tool-pill-teal' + (isTagged ? ' tool-pill-tagged tagged' : '') + '" data-item-id="' + id + '" data-tool-id="' + escHtml(tool.id) + '">' + escHtml(tLabel) + '</button>';
    }).join('');
    var DEFAULT_CATEGORIES = ['Products & Services', 'Pricing', 'Company Information', 'Jobs, Portfolio & Photos', 'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Industry News', 'Tender & Proposal Documents', 'Financial Documents', 'Compliance & Certificates', 'Safety & SWMS', 'Supplier Communications'];
    var catTags = Array.isArray(item.category_tags) && item.category_tags.length > 0 ? item.category_tags : (item.category ? [item.category] : []);
    var catPillsHtml = DEFAULT_CATEGORIES.map(function(cat) {
      var isTagged = catTags.indexOf(cat) > -1;
      var label = cat.charAt(0).toUpperCase() + cat.slice(1);
      return '<button class="cat-pill tool-pill tool-pill-purple' + (isTagged ? ' cat-pill-tagged tagged' : '') + '" data-item-id="' + id + '" data-cat-id="' + escHtml(cat) + '">' + escHtml(label) + '</button>';
    }).join('');
    var detail = item.source_detail || {};
    var sourceDetailParts = [];
    var connectionLabel = this._connectionLabel(item);
    if (connectionLabel) sourceDetailParts.push('<div><span class="source-detail-label">Tool:</span> ' + escHtml(connectionLabel) + '</div>');
    if (detail.filename) sourceDetailParts.push('<div><span class="source-detail-label">File:</span> ' + escHtml(detail.filename) + '</div>');
    if (detail.url) sourceDetailParts.push('<div><span class="source-detail-label">URL:</span> ' + escHtml(detail.url) + '</div>');
    var sourceDetailHtml = sourceDetailParts.length > 0 ? sourceDetailParts.join('') : '<div class="review-empty-detail">No source detail available.</div>';
    var isArchived = this._status === 'archived';
    var archiveBtnLabel = isArchived ? '&#8634; Restore' : '&#128451; Archive';
    var archiveBtnTitle = isArchived ? 'Restore to approved' : 'Archive';
    return '<div class="item-card" data-id="' + id + '">'
      + '<div class="item-card-header">'
      + '<input type="checkbox" class="item-checkbox outputs-checkbox" data-id="' + id + '"' + checked + '>'
      + '<span class="item-card-title"><span>' + title + '</span></span>'
      + '<div class="item-card-preview-row">'
      + '<button class="review-expand-btn outputs-expand-btn" data-id="' + id + '" title="Expand">&#9654;</button>'
      + '<span class="review-body-preview" id="outputs-preview-' + id + '">' + bodyPreview + '</span>'
      + '</div>'
      + '<button class="review-tools-btn outputs-tools-btn" data-id="' + id + '" data-section="tags">&#9741; Tagged Tools</button>'
      + '<button class="review-cats-btn outputs-cats-btn" data-id="' + id + '" data-section="cats">&#9776; Tagged Categories</button>'
      + '<div class="item-card-btns">'
      + '<span class="item-upload-date">Upload Date: ' + uploadDate + '</span>'
      + '<button class="source-btn outputs-source-btn" data-id="' + id + '" data-section="source" title="View source">&#128196; Source</button>'
      + '<button class="review-reject-btn outputs-archive-btn" data-id="' + id + '" title="' + archiveBtnTitle + '">' + archiveBtnLabel + '</button>'
      + '</div>'
      + '</div>'
      + '<div class="item-section" id="outputs-tags-' + id + '" style="display:none">'
      + '<div class="item-section-head"><span class="section-head-label">Tagged Tools</span></div>'
      + '<div class="review-tool-pills">' + toolPillsHtml + '</div>'
      + '</div>'
      + '<div class="item-section" id="outputs-cats-' + id + '" style="display:none">'
      + '<div class="item-section-head"><span class="section-head-label">Tagged Categories</span></div>'
      + '<div class="review-tool-pills">' + catPillsHtml + '</div>'
      + '</div>'
      + '<div class="item-section" id="outputs-source-' + id + '" style="display:none">'
      + '<div class="item-section-head"><span class="section-head-label">Source</span></div>'
      + '<div class="source-detail">' + sourceDetailHtml + '</div>'
      + '</div>'
      + '</div>';
  },

  _bindCardEvents: function() {
    var self = this;
    var listEl = document.getElementById('outputs-list');
    if (!listEl) return;
    listEl.querySelectorAll('.outputs-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        if (cb.checked) { self._selected.add(cb.dataset.id); } else { self._selected.delete(cb.dataset.id); }
      });
    });
    listEl.querySelectorAll('.outputs-expand-btn').forEach(function(btn) {
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
    listEl.querySelectorAll('.outputs-tools-btn, .outputs-cats-btn, .outputs-source-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var el = document.getElementById('outputs-' + btn.dataset.section + '-' + btn.dataset.id);
        if (el) {
          var isOpen = el.style.display !== 'none';
          el.style.display = isOpen ? 'none' : '';
          btn.classList.toggle('open', !isOpen);
        }
      });
    });
    listEl.querySelectorAll('.outputs-archive-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var newStatus = self._status === 'archived' ? 'approved' : 'archived';
        self._changeStatus(btn.dataset.id, newStatus);
      });
    });
    listEl.querySelectorAll('.tool-pill[data-tool-id]').forEach(function(pill) {
      pill.addEventListener('click', function() { self._toggleToolTag(pill.dataset.itemId, pill.dataset.toolId, pill); });
    });
    listEl.querySelectorAll('.cat-pill[data-cat-id]').forEach(function(pill) {
      pill.addEventListener('click', function() { self._toggleCategoryTag(pill.dataset.itemId, pill.dataset.catId, pill); });
    });
  },

  _changeStatus: async function(id, newStatus) {
    var result = await this._supabase.from('content_library').update({ status: newStatus }).eq('id', id);
    if (result.error) {
      console.error('[CL Outputs] Status update failed:', result.error.message);
      return;
    }
    this._items = this._items.filter(function(i) { return i.id !== id; });
    var card = document.querySelector('.item-card[data-id="' + id + '"]');
    if (card) card.remove();
    this._selected.delete(id);
    if (this._filteredItems().length === 0) {
      var list = document.getElementById('outputs-list');
      if (list) list.innerHTML = '<div class="list-empty">No outputs found.</div>';
    }
  },

  _toggleToolTag: async function(itemId, toolId, pill) {
    var item = this._items.find(function(i) { return i.id === itemId; });
    if (!item) return;
    var tags = Array.isArray(item.tool_tags) ? item.tool_tags.slice() : [];
    var idx = tags.indexOf(toolId);
    if (idx > -1) { tags.splice(idx, 1); } else { tags.push(toolId); }
    item.tool_tags = tags;
    var result = await this._supabase.from('content_library').update({ tool_tags: tags }).eq('id', itemId);
    if (result.error) {
      console.error('[CL Outputs] Tool tag update failed:', result.error.message);
      return;
    }
    var isNowTagged = tags.indexOf(toolId) > -1;
    pill.classList.toggle('tool-pill-tagged', isNowTagged);
    pill.classList.toggle('tagged', isNowTagged);
  },

  _toggleCategoryTag: async function(itemId, catId, pill) {
    var item = this._items.find(function(i) { return i.id === itemId; });
    if (!item) return;
    var tags = Array.isArray(item.category_tags) && item.category_tags.length > 0 ? item.category_tags.slice() : (item.category ? [item.category] : []);
    var idx = tags.indexOf(catId);
    if (idx > -1) { tags.splice(idx, 1); } else { tags.push(catId); }
    item.category_tags = tags;
    var result = await this._supabase.from('content_library').update({ category_tags: tags }).eq('id', itemId);
    if (result.error) {
      console.error('[CL Outputs] Category tag update failed:', result.error.message);
      return;
    }
    var isNowTagged = tags.indexOf(catId) > -1;
    pill.classList.toggle('cat-pill-tagged', isNowTagged);
    pill.classList.toggle('tagged', isNowTagged);
  }
};
