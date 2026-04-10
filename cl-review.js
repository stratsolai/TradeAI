window.CL_REVIEW = {
  _supabase: null,
  _status: 'pending',
  _categoryFilter: [],
  _toolFilters: [],
  _searchTerm: '',
  _items: [],
  _selected: new Set(),
  _filterState: { pending: { tools: [], cats: [] }, approved: { tools: [], cats: [] }, rejected: { tools: [], cats: [] }, archived: { tools: [], cats: [] } },

  init: async function(supabase) {
    this._supabase = supabase;
    this._render();
    this._bindStatTiles();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profResult = await supabase.from('profiles').select('activated_tools').eq('id', user.id).single();
      window._activatedTools = (profResult.data && Array.isArray(profResult.data.activated_tools)) ? profResult.data.activated_tools : [];
      window._clCategories = (profResult.data && Array.isArray(profResult.data.cl_active_categories)) ? profResult.data.cl_active_categories : [];
    }
    this._load();
  },

  setStatus: function(status) {
    this._saveFilterState();
    this._status = status;
    this._restoreFilterState(status);
    this._searchTerm = '';
    this._selected = new Set();
    if (typeof window.switchPTab === 'function') window.switchPTab('review');
    var sClr = { pending: '#e8f4fd', approved: '#edfaf1', rejected: '#fdecea', archived: '#ECEFF1' };
    document.querySelectorAll('.review-status-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.status === status);
      b.style.background = b.dataset.status === status ? (sClr[status] || '') : '';
    });
    if (document.getElementById('review-search')) {
      document.getElementById('review-search').value = '';
    }
    this._closeFilterDropdowns();
    this._load();
  },

  _closeFilterDropdowns: function() {
    var ftb = document.querySelector('.review-filter-tools-btn');
    var fcb = document.querySelector('.review-filter-cat-btn');
    if (ftb) ftb.classList.remove('active');
    if (fcb) fcb.classList.remove('active');
    var filterRow = document.getElementById('review-filter-row');
    var toolWrap = document.getElementById('review-tool-pills-wrap');
    var catWrap = document.getElementById('review-cat-pills-wrap');
    if (toolWrap) toolWrap.style.display = 'none';
    if (catWrap) catWrap.style.display = 'none';
    if (filterRow) filterRow.style.display = 'none';
    this._updateFilterBtnIndicators();
  },

  _saveFilterState: function() {
    this._filterState[this._status] = { tools: this._toolFilters.slice(), cats: this._categoryFilter.slice() };
  },

  _restoreFilterState: function(status) {
    var s = this._filterState[status];
    this._toolFilters = s ? s.tools.slice() : [];
    this._categoryFilter = s ? s.cats.slice() : [];
  },

  _updateFilterBtnIndicators: function() {
    var ftb = document.querySelector('.review-filter-tools-btn');
    var fcb = document.querySelector('.review-filter-cat-btn');
    if (ftb && !ftb.classList.contains('active')) {
      ftb.style.background = this._toolFilters.length > 0 ? '#e8f4fd' : '';
    }
    if (fcb && !fcb.classList.contains('active')) {
      fcb.style.background = this._categoryFilter.length > 0 ? '#e8f4fd' : '';
    }
  },

  _bindStatTiles: function() {
    const self = this;
    document.querySelectorAll('.stat-card[data-status]').forEach(function(tile) {
      var status = tile.dataset.status;
      if (status === 'all') {
        tile.style.cursor = 'default';
        return;
      }
      tile.addEventListener('click', function() {
        self.setStatus(status);
      });
    });
  },

  _render: function() {
    const el = document.getElementById('cl-tab-review');
    if (!el) return;
    el.innerHTML = `
      <div class="review-wrap">
        <div class="review-status-row">
          <button class="review-status-btn active" data-status="pending">Pending</button>
          <button class="review-status-btn" data-status="approved">Approved</button>
          <button class="review-status-btn" data-status="rejected">Rejected</button>
          <button class="review-status-btn" data-status="archived">Archived</button>
          <input type="text" id="review-search" class="review-search-input" placeholder="Search items...">
        </div>
        <div class="review-filter-btns-row">
          <button class="review-filter-tools-btn">&#9783; Filter By Tools</button>
          <button class="review-filter-cat-btn">&#9776; Filter By Category</button>
          <button class="review-clear-filters-btn">&#10005; Clear All Filters</button>
          <span style="flex:1"></span>
          <button class="btn-outline review-approve-all-btn" id="review-approve-all-btn" style="border-color:#2e7d32;color:#2e7d32;">&#10003; Approve All</button>
          <button class="btn-outline review-reject-all-btn" id="review-reject-all-btn" style="border-color:#8B2500;color:#8B2500;">&#10007; Reject All</button>
        </div>
        <div id="review-filter-row" class="review-filter-row" style="display:none">
          <div id="review-tool-pills-wrap" style="display:none"><div style="font-size:12px;font-weight:600;color:#888;margin-bottom:6px;">Tools</div><div id="review-tool-pills" class="review-pill-row"></div></div>
          <div id="review-cat-pills-wrap" style="display:none"><div style="font-size:12px;font-weight:600;color:#888;margin-bottom:6px;">Categories</div><div id="review-cat-pills" class="review-pill-row"></div></div>
        </div>
        <div id="review-bulk-bar" class="review-bulk-bar" style="display:none">
          <span id="review-bulk-count" class="review-bulk-label"></span>
          <button class="btn-outline review-bulk-approve-btn" id="review-bulk-approve-btn" style="border-color:#2e7d32;color:#2e7d32;">&#10003; Approve All Selected</button>
          <button class="btn-outline review-bulk-reject-btn" id="review-bulk-reject-btn" style="border-color:#8B2500;color:#8B2500;">&#10007; Reject All Selected</button>
          <button class="btn-outline" id="review-deselect-btn" style="border-color:#4A6D8C;color:#4A6D8C;">Deselect All</button>
        </div>
        <div id="review-list" class="review-list"></div>
      </div>
    `;
    this._bindControls();
  },

  _bindControls: function() {
    const self = this;
    var statusColors = { pending: '#e8f4fd', approved: '#edfaf1', rejected: '#fdecea', archived: '#ECEFF1' };
    document.querySelectorAll('.review-status-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.review-status-btn').forEach(function(b) { b.classList.remove('active'); b.style.background = ''; });
        btn.classList.add('active');
        btn.style.background = statusColors[btn.dataset.status] || '';
        self._saveFilterState();
        self._status = btn.dataset.status;
        self._restoreFilterState(btn.dataset.status);
        self._selected = new Set();
        self._closeFilterDropdowns();
        self._load();
      });
      btn.addEventListener('mouseenter', function() { btn.style.background = statusColors[btn.dataset.status] || ''; });
      btn.addEventListener('mouseleave', function() { if (!btn.classList.contains('active')) btn.style.background = ''; });
      if (btn.classList.contains('active')) btn.style.background = statusColors[btn.dataset.status] || '';
    });
    document.getElementById('review-search').addEventListener('input', function() {
      self._searchTerm = this.value.toLowerCase();
      self._renderList();
    });
    document.getElementById('review-bulk-approve-btn').addEventListener('click', function() { self._bulkAction('approved'); });
    document.getElementById('review-bulk-reject-btn').addEventListener('click', function() {
      if (self._status === 'rejected') { self._bulkDelete(); } else { self._bulkAction('rejected'); }
    });
    document.getElementById('review-deselect-btn').addEventListener('click', function() {
      self._selected = new Set();
      self._updateBulkBar();
      document.querySelectorAll('.review-checkbox').forEach(function(cb) { cb.checked = false; });
    });
    document.getElementById('review-approve-all-btn').addEventListener('click', function() { self._bulkActionAll('approved'); });
    document.getElementById('review-reject-all-btn').addEventListener('click', function() {
      if (self._status === 'rejected') { self._bulkDeleteAll(); } else { self._bulkActionAll('rejected'); }
    });
    self._bindBtnHover('review-approve-all-btn', '#edfaf1');
    self._bindBtnHover('review-reject-all-btn', '#fef2f2');
    self._bindBtnHover('review-bulk-approve-btn', '#edfaf1');
    self._bindBtnHover('review-bulk-reject-btn', '#fef2f2');
    self._bindBtnHover('review-deselect-btn', '#e8f4fd');
    var filterToolsBtn = document.querySelector('.review-filter-tools-btn');
    var filterCatBtn = document.querySelector('.review-filter-cat-btn');
    var clearBtn = document.querySelector('.review-clear-filters-btn');
    function updateFilterRow() {
      var filterRow = document.getElementById('review-filter-row');
      var toolsOpen = filterToolsBtn && filterToolsBtn.classList.contains('active');
      var catsOpen = filterCatBtn && filterCatBtn.classList.contains('active');
      var toolWrap = document.getElementById('review-tool-pills-wrap');
      var catWrap = document.getElementById('review-cat-pills-wrap');
      if (toolWrap) toolWrap.style.display = toolsOpen ? '' : 'none';
      if (catWrap) catWrap.style.display = catsOpen ? '' : 'none';
      if (filterRow) filterRow.style.display = (toolsOpen || catsOpen) ? 'block' : 'none';
    }
    if (filterToolsBtn) {
      filterToolsBtn.addEventListener('click', function() {
        var isOpen = filterToolsBtn.classList.contains('active');
        filterToolsBtn.classList.toggle('active', !isOpen);
        filterToolsBtn.style.background = !isOpen ? '#e8f4fd' : '';
        if (!isOpen) self._renderFilterRow();
        updateFilterRow();
        self._updateFilterBtnIndicators();
      });
    }
    if (filterCatBtn) {
      filterCatBtn.addEventListener('click', function() {
        var isOpen = filterCatBtn.classList.contains('active');
        filterCatBtn.classList.toggle('active', !isOpen);
        filterCatBtn.style.background = !isOpen ? '#e8f4fd' : '';
        if (!isOpen) self._renderFilterRow();
        updateFilterRow();
        self._updateFilterBtnIndicators();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        self._toolFilters = [];
        self._categoryFilter = [];
        self._saveFilterState();
        if (filterToolsBtn) { filterToolsBtn.classList.remove('active'); filterToolsBtn.style.background = ''; }
        if (filterCatBtn) { filterCatBtn.classList.remove('active'); filterCatBtn.style.background = ''; }
        updateFilterRow();
        self._renderFilterRow();
        self._renderList();
      });
    }
  },

  _bindBtnHover: function(id, hoverBg) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('mouseenter', function() { btn.style.background = hoverBg; });
    btn.addEventListener('mouseleave', function() { btn.style.background = ''; });
  },

  _updateRejectButtons: function() {
    var isRejected = this._status === 'rejected';
    var isApproved = this._status === 'approved';
    var allBtn = document.getElementById('review-reject-all-btn');
    var selBtn = document.getElementById('review-bulk-reject-btn');
    if (allBtn) {
      allBtn.innerHTML = isRejected ? '&#10007; Delete All' : '&#10007; Reject All';
    }
    if (selBtn) {
      selBtn.innerHTML = isRejected ? '&#10007; Delete All Selected' : '&#10007; Reject All Selected';
    }
    var approveAllBtn = document.getElementById('review-approve-all-btn');
    var bulkApproveBtn = document.getElementById('review-bulk-approve-btn');
    if (approveAllBtn) approveAllBtn.style.display = isApproved ? 'none' : '';
    if (bulkApproveBtn) bulkApproveBtn.style.display = isApproved ? 'none' : '';
  },

  _load: async function() {
    const list = document.getElementById('review-list');
    if (list) list.innerHTML = '<div class="review-loading">Loading...</div>';
    const result = await this._supabase
      .from('content_library')
      .select('*')
      .eq('status', this._status)
      .order('created_at', { ascending: false });
    if (result.error) {
      if (list) list.innerHTML = '<div class="review-empty">Could not load items.</div>';
      return;
    }
    this._items = result.data || [];
    this._selected = new Set();
    // Approved tab: load archived items linking back via version_archived_by
    this._archivedLinks = {};
    if (this._status === 'approved' && this._items.length > 0) {
      var ids = this._items.map(function(i) { return i.id; });
      var linkResult = await this._supabase
        .from('content_library')
        .select('id, version_archived_by')
        .eq('status', 'archived')
        .in('version_archived_by', ids);
      if (linkResult.data) {
        var self = this;
        linkResult.data.forEach(function(r) {
          if (r.version_archived_by) self._archivedLinks[r.version_archived_by] = r.id;
        });
      }
    }
    // Load image thumbnail URLs for photo items
    this._imageUrls = {};
    var photoItemIds = this._items
      .filter(function(i) {
        var sd = i.source_detail || {};
        return sd.file_type === 'image' && i.source_item_id;
      })
      .map(function(i) { return i.source_item_id; });
    if (photoItemIds.length > 0) {
      var siResult = await this._supabase
        .from('cl_source_items')
        .select('id, file_url')
        .in('id', photoItemIds);
      if (siResult.data) {
        var selfImg = this;
        siResult.data.forEach(function(si) {
          if (si.file_url) {
            var pubUrl = selfImg._supabase.storage.from('cl-assets').getPublicUrl(si.file_url);
            if (pubUrl.data && pubUrl.data.publicUrl) selfImg._imageUrls[si.id] = pubUrl.data.publicUrl;
          }
        });
      }
    }
    this._updateBulkBar();
    this._renderFilterRow();
    this._renderList();
    this._updateRejectButtons();
  },

  _renderFilterRow: function() {
    const filterRow = document.getElementById('review-filter-row');
    const catPillsEl = document.getElementById('review-cat-pills');
    const toolPillsEl = document.getElementById('review-tool-pills');
    if (!filterRow || !catPillsEl || !toolPillsEl) return;
    var _toolsActive = document.querySelector('.review-filter-tools-btn.active');
    var _catActive = document.querySelector('.review-filter-cat-btn.active');
    filterRow.style.display = (_toolsActive || _catActive) ? 'block' : 'none';
    const self = this;

    const cats = (window._clCategories && window._clCategories.length > 0)
      ? window._clCategories
      : [...new Set(this._items.map(function(i) { return i.category; }).filter(Boolean))];
    catPillsEl.innerHTML = cats.map(function(cat) {
      const isActive = self._categoryFilter.indexOf(cat) > -1;
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      return '<button class="filter-pill' + (isActive ? ' active' : '') + '" data-cat="' + escHtml(cat) + '">' + escHtml(label) + '</button>';
    }).join('');

    const tools = window.CORE_TOOLS || [];
    const relevantTools = tools;
    toolPillsEl.innerHTML = relevantTools.map(function(tool) {
      const isActive = self._toolFilters.indexOf(tool.id) > -1;
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
        const id = pill.dataset.tool;
        const idx = self._toolFilters.indexOf(id);
        if (idx > -1) { self._toolFilters.splice(idx, 1); } else { self._toolFilters.push(id); }
        self._renderFilterRow();
        self._renderList();
      });
    });
    self._saveFilterState();
    self._updateFilterBtnIndicators();
  },

  _filteredItems: function() {
    const self = this;
    return this._items.filter(function(item) {
      if (self._categoryFilter.length > 0) {
        var catTags = Array.isArray(item.category_tags) ? item.category_tags : [];
        var matchesCat = self._categoryFilter.indexOf(item.category) > -1;
        var matchesCatTags = self._categoryFilter.some(function(f) { return catTags.indexOf(f) > -1; });
        if (!matchesCat && !matchesCatTags) return false;
      }
      if (self._toolFilters.length > 0) {
        const tags = Array.isArray(item.tool_tags) ? item.tool_tags : [];
        if (!self._toolFilters.some(function(f) { return tags.indexOf(f) > -1; })) return false;
      }
      if (self._searchTerm) {
        if ((item.title || '').toLowerCase().indexOf(self._searchTerm) === -1) return false;
      }
      return true;
    });
  },

  _renderList: function() {
    const list = document.getElementById('review-list');
    if (!list) return;
    var items = this._filteredItems();
    // Pending tab: reorder so version-paired items sit adjacent to each other
    if (this._status === 'pending') {
      var pairMap = {};
      items.forEach(function(it) {
        if (it.version_pair_id) {
          if (!pairMap[it.version_pair_id]) pairMap[it.version_pair_id] = [];
          pairMap[it.version_pair_id].push(it);
        }
      });
      var seen = {};
      var ordered = [];
      items.forEach(function(it) {
        if (seen[it.id]) return;
        ordered.push(it);
        seen[it.id] = true;
        if (it.version_pair_id && pairMap[it.version_pair_id]) {
          pairMap[it.version_pair_id].forEach(function(partner) {
            if (!seen[partner.id]) { ordered.push(partner); seen[partner.id] = true; }
          });
        }
      });
      items = ordered;
    }
    if (items.length === 0) {
      list.innerHTML = '<div class="review-empty">No items found.</div>';
      return;
    }
    const self = this;
    list.innerHTML = items.map(function(item) { return self._cardHtml(item); }).join('');
    this._bindCardEvents();
    // Scroll to a specific item if requested by an Archived Item Link click
    if (this._scrollToId) {
      var target = document.querySelector('.review-card[data-id="' + this._scrollToId + '"]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.outline = '2px solid var(--blue)';
        setTimeout(function() { target.style.outline = ''; }, 2000);
      }
      this._scrollToId = null;
    }
  },

  // Friendly connection-type label derived from item.source (top-level
  // column on content_library). The 'email' value is shared by Gmail and
  // Outlook imports, so item.tool_source is used to distinguish them.
  // Returns '' for items with no source set so callers can choose their
  // own fallback.
  _connectionLabel: function(item) {
    if (!item) return '';
    var srcVal = item.source || '';
    if (srcVal === 'google-drive') return 'Google Drive';
    if (srcVal === 'onedrive') return 'OneDrive';
    if (srcVal === 'sharepoint') return 'SharePoint';
    if (srcVal === 'dropbox') return 'Dropbox';
    if (srcVal === 'website') return 'Website';
    if (srcVal === 'email') {
      var toolSrc = item.tool_source || '';
      if (toolSrc === 'cl-outlook-scan') return 'Outlook';
      if (toolSrc === 'cl-email-scan') return 'Gmail';
      return 'Email';
    }
    if (srcVal) return srcVal.charAt(0).toUpperCase() + srcVal.slice(1);
    return '';
  },

  _cardHtml: function(item) {
    const id = escHtml(item.id);
    const title = escHtml(item.title || 'Untitled');
    const typeLabel = item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'Unknown';
    const uploadDate = item.created_at ? new Date(item.created_at).toLocaleDateString('en-AU') : '';
    const sourceParts = [this._connectionLabel(item) || 'Unknown'];
    if (item.source_detail) {
      const d = typeof item.source_detail === 'string' ? JSON.parse(item.source_detail) : item.source_detail;
      if (d.filename) sourceParts.push(d.filename);
      else if (d.url) sourceParts.push(d.url);
    }
    const sourceLabel = escHtml(sourceParts.join(' — '));
    const bodyPreview = escHtml(item.content_text || '');
    const isUsed = !!item.first_used_at;
    const checked = this._selected.has(item.id) ? ' checked' : '';
    const tools = window.CORE_TOOLS || [];
    const activatedTools = window._activatedTools || [];
    const toolTags = Array.isArray(item.tool_tags) ? item.tool_tags : [];
    const toolPillsHtml = tools.map(function(tool) {
      const isTagged = toolTags.indexOf(tool.id) > -1;
      const isActivated = activatedTools.indexOf(tool.id) > -1;
      if (!isActivated) {
        var tLabel = Array.isArray(tool.title) ? tool.title.join(' ') : (tool.title || tool.id);
        var inactiveStyle = isTagged ? ' style="background:#E0F7FA;border-color:#0097A7;color:#000;"' : '';
        return '<a href="/activate?tool=' + escHtml(tool.id) + '" class="tool-pill tool-pill-inactive' + (isTagged ? ' tool-pill-tagged' : '') + '" title="Learn more about this tool"' + inactiveStyle + '>' + escHtml(tLabel) + ' <span class="tool-pill-add-stax">+ Learn More</span></a>';
      }
      var tLabel = Array.isArray(tool.title) ? tool.title.join(' ') : (tool.title || tool.id);
      return '<button class="tool-pill' + (isTagged ? ' tool-pill-tagged' : '') + '" data-item-id="' + id + '" data-tool-id="' + escHtml(tool.id) + '" style="border-color:#0097A7;' + (isTagged ? 'background:#E0F7FA;color:#000;' : 'background:#fff;color:#000;') + '">' + escHtml(tLabel) + '</button>';
    }).join('');
    const DEFAULT_CATEGORIES = (window._clCategories && window._clCategories.length > 0) ? window._clCategories : ['Products & Services', 'Pricing', 'Company Information', 'Jobs, Portfolio & Photos', 'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Industry News', 'Tender & Proposal Documents', 'Financial Documents', 'Compliance & Certificates', 'Safety & SWMS', 'Supplier Communications', 'Manual Upload'];
    const catTags = Array.isArray(item.category_tags) && item.category_tags.length > 0 ? item.category_tags : (item.category ? [item.category] : []);
    const catPillsHtml = DEFAULT_CATEGORIES.map(function(cat) {
      const isTagged = catTags.indexOf(cat) > -1;
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      return '<button class="tool-pill' + (isTagged ? ' tool-pill-tagged' : '') + '" data-item-id="' + id + '" data-cat-id="' + escHtml(cat) + '" style="border-color:#7B5EA7;' + (isTagged ? 'background:#F3EEF9;color:#000;' : 'background:#fff;color:#000;') + '">' + escHtml(label) + '</button>';
    }).join('');
    const detail = item.source_detail || {};
    const sourceDetailParts = [];
    var connectionLabel = this._connectionLabel(item);
    if (connectionLabel) sourceDetailParts.push('<div><span class="source-detail-label">Connection:</span> ' + escHtml(connectionLabel) + '</div>');
    if (detail.filename) sourceDetailParts.push('<div><span class="source-detail-label">File:</span> ' + escHtml(detail.filename) + '</div>');
    if (detail.account_email) sourceDetailParts.push('<div><span class="source-detail-label">Email account:</span> ' + escHtml(detail.account_email) + '</div>');
    if (detail.sender) sourceDetailParts.push('<div><span class="source-detail-label">From:</span> ' + escHtml(detail.sender) + '</div>');
    if (detail.subject) sourceDetailParts.push('<div><span class="source-detail-label">Subject:</span> ' + escHtml(detail.subject) + '</div>');
    if (detail.url) sourceDetailParts.push('<div><span class="source-detail-label">URL:</span> ' + escHtml(detail.url) + '</div>');
    if (detail.folder_name) sourceDetailParts.push('<div><span class="source-detail-label">Drive folder:</span> ' + escHtml(detail.folder_name) + '</div>');
    if (item.source_item_id && detail.file_url) {
      sourceDetailParts.push('<div><a href="' + escHtml(detail.file_url) + '" target="_blank" class="btn-link">View Source Document &rarr;</a></div>');
    }
    const sourceDetailHtml = sourceDetailParts.length > 0 ? sourceDetailParts.join('') : '<div class="review-empty-detail">No source detail available.</div>';
    const aiRejectedPill = (this._status === 'rejected' && detail.rejection_source === 'auto')
      ? '<span class="review-ai-rejected-pill" style="display:inline-block;padding:2px 10px;border:1px solid var(--red);border-radius:8px;background:#fdecea;color:var(--text);font-size:11px;font-weight:600;flex-shrink:0;">AI Rejected Item</span>'
      : '';
    const archivedLinkId = (this._status === 'approved' && this._archivedLinks && this._archivedLinks[item.id]) ? this._archivedLinks[item.id] : null;
    const archivedLinkPill = archivedLinkId
      ? '<a href="#" class="review-archived-link-pill" data-archived-id="' + escHtml(archivedLinkId) + '" style="display:inline-block;padding:2px 10px;border:1px solid var(--blue);border-radius:8px;background:var(--blue-light);color:var(--text);font-size:11px;font-weight:600;flex-shrink:0;text-decoration:none;cursor:pointer;">Archived Item Link</a>'
      : '';
    var hasPairPartner = false;
    if (this._status === 'pending' && item.version_pair_id && item.category === 'Financial Documents') {
      var pairId = item.version_pair_id;
      var partnerCount = 0;
      for (var ix = 0; ix < this._items.length; ix++) {
        if (this._items[ix].version_pair_id === pairId) partnerCount++;
      }
      if (partnerCount > 1) hasPairPartner = true;
    }
    const pairCardStyle = hasPairPartner
      ? ' style="border-left:4px solid var(--blue);background:var(--blue-light);"'
      : '';
    var usedNoticeHtml = '';
    if (isUsed) {
      if (item.source === 'manual') {
        usedNoticeHtml = '<div class="review-used-notice" style="margin:6px 0;padding:6px 10px;background:#FFF8E1;border:1px solid #FFC107;border-radius:6px;font-size:12px;color:#333;">This item has been used by a tool and cannot be edited. <button class="review-copy-btn" data-id="' + id + '" style="margin-left:8px;padding:2px 10px;border:1px solid var(--blue);border-radius:6px;background:var(--blue-light);color:var(--text);font-size:11px;cursor:pointer;">Copy to New Manual Item</button></div>';
      } else {
        usedNoticeHtml = '<div class="review-used-notice" style="margin:6px 0;padding:6px 10px;background:#FFF8E1;border:1px solid #FFC107;border-radius:6px;font-size:12px;color:#333;">This item has been used by a tool and cannot be edited. You can archive it and re-import or create a new Manual Item.</div>';
      }
    }
    var thumbHtml = '';
    var itemSd = item.source_detail || {};
    if (itemSd.file_type === 'image' && item.source_item_id && this._imageUrls[item.source_item_id]) {
      thumbHtml = '<img src="' + escHtml(this._imageUrls[item.source_item_id]) + '" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;">';
    }
    return `<div class="review-card" data-id="${id}"${pairCardStyle}>
  <div class="review-card-header">
    <input type="checkbox" class="review-checkbox" data-id="${id}"${checked}>
    <span style="flex:1;min-width:140px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      ${thumbHtml}<span class="review-card-title"${isUsed ? '' : ' contenteditable="true"'} data-id="${id}"${isUsed ? '' : ' title="Click to edit"'} style="flex:0 1 auto;min-width:0;">${title}</span>${aiRejectedPill}${archivedLinkPill}
    </span>
    <div class="review-card-preview-row">
      <button class="review-expand-btn" data-id="${id}" title="Expand">&#9654;</button>
      <span class="review-body-preview" id="review-preview-${id}">${bodyPreview}</span>
    </div>${usedNoticeHtml}
    <button class="review-tools-btn" data-id="${id}" data-section="tags">&#9741; Tagged Tools</button>
    <button class="review-cats-btn" data-id="${id}" data-section="cats">&#9776; Tagged Categories</button>
    <div class="review-card-btns">
      <span class="review-upload-date">Upload Date: ${uploadDate}</span><button class="review-source-btn" data-id="${id}" data-section="source" title="View source document">&#128196; Source</button>
          ${this._status !== 'approved' ? '<button class="btn-outline review-approve-btn" data-id="' + id + '" title="Approve" style="border-color:#2e7d32;color:#2e7d32;">&#10003; Approve</button>' : ''}
      <button class="btn-outline review-reject-btn" data-id="${id}" data-used="${isUsed ? '1' : ''}" title="${this._status === 'rejected' ? (isUsed ? 'Archive' : 'Delete') : 'Reject'}" style="border-color:#8B2500;color:#8B2500;">&#10007; ${this._status === 'rejected' ? (isUsed ? 'Archive' : 'Delete') : 'Reject'}</button>
    </div>
      </div>
  
  <div class="review-section" id="review-tags-${id}" style="display:none">
    <div class="review-section-head"><span>Tagged Tools</span></div>
    <div class="review-tool-pills">${toolPillsHtml}</div>
  </div>
  <div class="review-section" id="review-cats-${id}" style="display:none">
    <div class="review-section-head"><span>Tagged Categories</span></div>
    <div class="review-tool-pills">${catPillsHtml}</div>
  </div>
  <div class="review-section" id="review-source-${id}" style="display:none">
    <div class="review-section-head"><span>Source</span></div>
    <div class="review-source-detail">${sourceDetailHtml}</div>
  </div>
</div>`;
  },

  _bindCardEvents: function() {
    const self = this;
    document.querySelectorAll('.review-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        if (cb.checked) { self._selected.add(cb.dataset.id); } else { self._selected.delete(cb.dataset.id); }
        self._updateBulkBar();
      });
    });
    document.querySelectorAll('.review-expand-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const card = btn.closest('.review-card');
        if (!card) return;
        const isExpanded = card.classList.contains('review-body-expanded');
        card.classList.toggle('review-body-expanded', !isExpanded);
        var span = document.getElementById('review-preview-' + btn.dataset.id);
        if (span) {
          span.style.whiteSpace = isExpanded ? '' : 'pre-wrap';
          span.style.overflow = isExpanded ? '' : 'visible';
        }
        btn.innerHTML = isExpanded ? '&#9654;' : '&#9660;';
      });
    });
    document.querySelectorAll('.review-approve-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatus(btn.dataset.id, 'approved'); });
    });
    document.querySelectorAll('.review-reject-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (self._status === 'rejected') {
          if (btn.dataset.used === '1') { self._changeStatus(btn.dataset.id, 'archived'); } else { self._deleteItem(btn.dataset.id); }
        } else { self._changeStatus(btn.dataset.id, 'rejected'); }
      });
    });
    document.querySelectorAll('.review-archived-link-pill').forEach(function(pill) {
      pill.addEventListener('click', function(e) {
        e.preventDefault();
        self._scrollToId = pill.dataset.archivedId;
        self.setStatus('archived');
      });
    });
    document.querySelectorAll('.review-copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var item = self._items.find(function(i) { return i.id === btn.dataset.id; });
        if (item && window.CL_UPLOAD) {
          window.CL_UPLOAD.openManualAdd({ title: item.title || '', description: item.content_text || '', tool_tags: item.tool_tags || [] });
          var uploadTab = document.querySelector('[data-tab="upload"]');
          if (uploadTab) uploadTab.click();
        }
      });
    });
    var listEl = document.getElementById('review-list');
    if (listEl) listEl.querySelectorAll('.review-tools-btn, .review-cats-btn, .review-source-btn').forEach(function(btn) {
      var sectionBg = btn.classList.contains('review-source-btn') ? '#fff3ee' : btn.classList.contains('review-cats-btn') ? '#F3EEF9' : '#E0F7FA';
      btn.addEventListener('click', function() {
        var el = document.getElementById('review-' + btn.dataset.section + '-' + btn.dataset.id);
        if (el) {
          var isOpen = el.style.display !== 'none';
          el.style.display = isOpen ? 'none' : '';
          btn.style.background = isOpen ? '' : sectionBg;
        }
      });
      btn.addEventListener('mouseenter', function() { btn.style.background = sectionBg; });
      btn.addEventListener('mouseleave', function() {
        var el = document.getElementById('review-' + btn.dataset.section + '-' + btn.dataset.id);
        if (el && el.style.display !== 'none') return;
        btn.style.background = '';
      });
    });
    document.querySelectorAll('.review-approve-btn').forEach(function(btn) {
      btn.addEventListener('mouseenter', function() { btn.style.background = '#edfaf1'; });
      btn.addEventListener('mouseleave', function() { btn.style.background = ''; });
    });
    document.querySelectorAll('.review-reject-btn').forEach(function(btn) {
      btn.addEventListener('mouseenter', function() { btn.style.background = '#fef2f2'; });
      btn.addEventListener('mouseleave', function() { btn.style.background = ''; });
    });
    document.querySelectorAll('.review-card-title[contenteditable]').forEach(function(el) {
      el.addEventListener('blur', function() { self._saveField(el.dataset.id, 'title', el.innerText.trim()); });
      el.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });
    document.querySelectorAll('.review-body-text[contenteditable]').forEach(function(el) {
      el.addEventListener('blur', function() { self._saveField(el.dataset.id, 'body', el.innerText.trim()); });
    });
    document.querySelectorAll('.tool-pill[data-tool-id]').forEach(function(pill) {
      pill.addEventListener('click', function() { self._toggleToolTag(pill.dataset.itemId, pill.dataset.toolId, pill); });
      pill.addEventListener('mouseenter', function() { pill.style.background = '#E0F7FA'; });
      pill.addEventListener('mouseleave', function() { pill.style.background = pill.classList.contains('tool-pill-tagged') ? '#E0F7FA' : '#fff'; });
    });
    document.querySelectorAll('.tool-pill[data-cat-id]').forEach(function(pill) {
      pill.addEventListener('click', function() { self._toggleCategoryTag(pill.dataset.itemId, pill.dataset.catId, pill); });
      pill.addEventListener('mouseenter', function() { pill.style.background = '#F3EEF9'; });
      pill.addEventListener('mouseleave', function() { pill.style.background = pill.classList.contains('tool-pill-tagged') ? '#F3EEF9' : '#fff'; });
    });
  },

  _changeStatus: async function(id, newStatus) {
    await this._supabase.from('content_library').update({ status: newStatus }).eq('id', id);
    this._items = this._items.filter(function(i) { return i.id !== id; });
    const card = document.querySelector('.review-card[data-id="' + id + '"]');
    if (card) card.remove();
    this._selected.delete(id);
    this._updateBulkBar();
    this._updateStatTiles();
  },

  _deleteItem: async function(id) {
    await this._supabase.from('content_library').delete().eq('id', id);
    this._items = this._items.filter(function(i) { return i.id !== id; });
    var card = document.querySelector('.review-card[data-id="' + id + '"]');
    if (card) card.remove();
    this._selected.delete(id);
    this._updateBulkBar();
    this._updateStatTiles();
  },

  _bulkAction: async function(newStatus) {
    const self = this;
    const ids = Array.from(this._selected);
    if (ids.length === 0) return;
    await this._supabase.from('content_library').update({ status: newStatus }).in('id', ids);
    this._items = this._items.filter(function(i) { return !self._selected.has(i.id); });
    this._selected = new Set();
    this._updateBulkBar();
    this._renderList();
    this._updateStatTiles();
  },

  _bulkActionAll: async function(newStatus) {
    var filtered = this._filteredItems();
    if (filtered.length === 0) return;
    var ids = filtered.map(function(i) { return i.id; });
    var self = this;
    await this._supabase.from('content_library').update({ status: newStatus }).in('id', ids);
    this._items = this._items.filter(function(i) { return ids.indexOf(i.id) === -1; });
    this._selected = new Set();
    this._updateBulkBar();
    this._renderList();
    this._updateStatTiles();
  },

  _bulkDelete: async function() {
    var self = this;
    var ids = Array.from(this._selected);
    if (ids.length === 0) return;
    await this._supabase.from('content_library').delete().in('id', ids);
    this._items = this._items.filter(function(i) { return !self._selected.has(i.id); });
    this._selected = new Set();
    this._updateBulkBar();
    this._renderList();
    this._updateStatTiles();
  },

  _bulkDeleteAll: async function() {
    var filtered = this._filteredItems();
    if (filtered.length === 0) return;
    var ids = filtered.map(function(i) { return i.id; });
    var self = this;
    await this._supabase.from('content_library').delete().in('id', ids);
    this._items = this._items.filter(function(i) { return ids.indexOf(i.id) === -1; });
    this._selected = new Set();
    this._updateBulkBar();
    this._renderList();
    this._updateStatTiles();
  },

  _saveField: async function(id, field, value) {
    const update = {};
    update[field] = value;
    await this._supabase.from('content_library').update(update).eq('id', id);
  },

  _toggleToolTag: async function(itemId, toolId, pill) {
    const item = this._items.find(function(i) { return i.id === itemId; });
    if (!item) return;
    const tags = Array.isArray(item.tool_tags) ? item.tool_tags.slice() : [];
    const idx = tags.indexOf(toolId);
    if (idx > -1) { tags.splice(idx, 1); } else { tags.push(toolId); }
    item.tool_tags = tags;
    await this._supabase.from('content_library').update({ tool_tags: tags }).eq('id', itemId);
    var isNowTagged = tags.indexOf(toolId) > -1;
    pill.classList.toggle('tool-pill-tagged', isNowTagged);
    pill.style.background = isNowTagged ? '#E0F7FA' : '#fff';
  },

  _toggleCategoryTag: async function(itemId, catId, pill) {
    const item = this._items.find(function(i) { return i.id === itemId; });
    if (!item) return;
    const tags = Array.isArray(item.category_tags) && item.category_tags.length > 0 ? item.category_tags.slice() : (item.category ? [item.category] : []);
    const idx = tags.indexOf(catId);
    if (idx > -1) { tags.splice(idx, 1); } else { tags.push(catId); }
    item.category_tags = tags;
    await this._supabase.from('content_library').update({ category_tags: tags }).eq('id', itemId);
    var isNowTagged = tags.indexOf(catId) > -1;
    pill.classList.toggle('tool-pill-tagged', isNowTagged);
    pill.style.background = isNowTagged ? '#F3EEF9' : '#fff';
  },

  _updateBulkBar: function() {
    const bar = document.getElementById('review-bulk-bar');
    const count = document.getElementById('review-bulk-count');
    if (!bar || !count) return;
    const n = this._selected.size;
    bar.style.display = n > 0 ? '' : 'none';
    count.textContent = n + ' selected';
  },

  _updateStatTiles: function() {
    if (window.loadStats) window.loadStats();
  }
};
