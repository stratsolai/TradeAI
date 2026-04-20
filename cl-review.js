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
    try {
      var authResp = await supabase.auth.getUser();
      var user = authResp.data && authResp.data.user;
      if (user) {
        const profResult = await supabase.from('profiles').select('activated_tools').eq('id', user.id).single();
        window._activatedTools = (profResult.data && Array.isArray(profResult.data.activated_tools)) ? profResult.data.activated_tools : [];
        window._clCategories = (profResult.data && Array.isArray(profResult.data.cl_active_categories)) ? profResult.data.cl_active_categories : [];
      }
    } catch (e) {
      console.error('[CL Review] init auth error:', e.message);
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
    document.querySelectorAll('.status-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.status === status);
    });
    if (document.getElementById('review-search')) {
      document.getElementById('review-search').value = '';
    }
    this._closeFilterDropdowns();
    this._load();
  },

  _closeFilterDropdowns: function() {
    var ftb = document.querySelector('.filter-tools-btn');
    var fcb = document.querySelector('.filter-cat-btn');
    if (ftb) ftb.classList.remove('open');
    if (fcb) fcb.classList.remove('open');
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
    var ftb = document.querySelector('.filter-tools-btn');
    var fcb = document.querySelector('.filter-cat-btn');
    if (ftb && !ftb.classList.contains('open')) {
      ftb.classList.toggle('active', this._toolFilters.length > 0);
    }
    if (fcb && !fcb.classList.contains('open')) {
      fcb.classList.toggle('active', this._categoryFilter.length > 0);
    }
  },

  _bindStatTiles: function() {
    const self = this;
    document.querySelectorAll('.stat-card[data-status]').forEach(function(tile) {
      var status = tile.dataset.status;
      if (status === 'all') return;
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
          <button class="status-btn active" data-status="pending">Pending</button>
          <button class="status-btn" data-status="approved">Approved</button>
          <button class="status-btn" data-status="rejected">Rejected</button>
          <button class="status-btn" data-status="archived">Archived</button>
          <input type="text" id="review-search" class="review-search-input" placeholder="Search items...">
        </div>
        <div class="review-filter-btns-row">
          <button class="filter-btn filter-tools-btn">&#9783; Filter By Tools</button>
          <button class="filter-btn filter-cat-btn">&#9776; Filter By Category</button>
          <button class="clear-filters-btn">&#10005; Clear All Filters</button>
          <span class="review-filter-spacer"></span>
          <button class="btn-outline review-approve-all-btn" id="review-approve-all-btn">&#10003; Approve All</button>
          <button class="btn-outline review-reject-all-btn" id="review-reject-all-btn">&#10007; Reject All</button>
        </div>
        <div id="review-filter-row" class="review-filter-row" style="display:none">
          <div id="review-tool-pills-wrap" style="display:none"><div class="filter-section-label">Tools</div><div id="review-tool-pills" class="review-pill-row"></div></div>
          <div id="review-cat-pills-wrap" style="display:none"><div class="filter-section-label">Categories</div><div id="review-cat-pills" class="review-pill-row"></div></div>
        </div>
        <div id="review-bulk-bar" class="review-bulk-bar" style="display:none">
          <span id="review-bulk-count" class="review-bulk-label"></span>
          <button class="btn-outline review-bulk-approve-btn" id="review-bulk-approve-btn">&#10003; Approve All Selected</button>
          <button class="btn-outline review-bulk-reject-btn" id="review-bulk-reject-btn">&#10007; Reject All Selected</button>
          <button class="btn-outline" id="review-deselect-btn">Deselect All</button>
        </div>
        <div id="review-list" class="review-list"></div>
      </div>
    `;
    this._bindControls();
  },

  _bindControls: function() {
    const self = this;
    document.querySelectorAll('.status-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.status-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self._saveFilterState();
        self._status = btn.dataset.status;
        self._restoreFilterState(btn.dataset.status);
        self._selected = new Set();
        self._closeFilterDropdowns();
        self._load();
      });
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
      document.querySelectorAll('.item-checkbox').forEach(function(cb) { cb.checked = false; });
    });
    document.getElementById('review-approve-all-btn').addEventListener('click', function() { self._bulkActionAll('approved'); });
    document.getElementById('review-reject-all-btn').addEventListener('click', function() {
      if (self._status === 'rejected') { self._bulkDeleteAll(); } else { self._bulkActionAll('rejected'); }
    });
    var filterToolsBtn = document.querySelector('.filter-tools-btn');
    var filterCatBtn = document.querySelector('.filter-cat-btn');
    var clearBtn = document.querySelector('.clear-filters-btn');
    function updateFilterRow() {
      var filterRow = document.getElementById('review-filter-row');
      var toolsOpen = filterToolsBtn && filterToolsBtn.classList.contains('open');
      var catsOpen = filterCatBtn && filterCatBtn.classList.contains('open');
      var toolWrap = document.getElementById('review-tool-pills-wrap');
      var catWrap = document.getElementById('review-cat-pills-wrap');
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
        self._saveFilterState();
        if (filterToolsBtn) { filterToolsBtn.classList.remove('open', 'active'); }
        if (filterCatBtn) { filterCatBtn.classList.remove('open', 'active'); }
        updateFilterRow();
        self._renderFilterRow();
        self._renderList();
      });
    }
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
    if (list) list.innerHTML = '<div class="list-loading">Loading...</div>';
    const result = await this._supabase
      .from('content_library')
      .select('*')
      .eq('status', this._status)
      .neq('source', 'tool')
      .order('created_at', { ascending: false });
    if (result.error) {
      if (list) list.innerHTML = '<div class="list-empty">Could not load items.</div>';
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
      if (!linkResult.error && linkResult.data) {
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
        var isImg = i.content_type === 'image' || sd.file_type === 'image' || (sd.mime_type && sd.mime_type.indexOf('image/') === 0);
        return isImg && i.source_item_id;
      })
      .map(function(i) { return i.source_item_id; });
    if (photoItemIds.length > 0) {
      var siResult = await this._supabase
        .from('cl_source_items')
        .select('id, file_url')
        .in('id', photoItemIds);
      if (!siResult.error && siResult.data) {
        for (var si_idx = 0; si_idx < siResult.data.length; si_idx++) {
          var si = siResult.data[si_idx];
          if (si.file_url) {
            var signedResult = await this._supabase.storage.from('cl-assets').createSignedUrl(si.file_url, 3600);
            if (signedResult.data && signedResult.data.signedUrl) this._imageUrls[si.id] = signedResult.data.signedUrl;
          }
        }
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
    var _toolsActive = document.querySelector('.filter-tools-btn.open');
    var _catActive = document.querySelector('.filter-cat-btn.open');
    filterRow.style.display = (_toolsActive || _catActive) ? 'block' : 'none';
    const self = this;

    var FIXED_CATEGORIES = ['Products & Services', 'Pricing', 'Company Information', 'Jobs, Portfolio & Photos', 'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Industry News', 'Tender & Proposal Documents', 'Financial Documents', 'Compliance & Certificates', 'Safety & SWMS', 'Supplier Communications'];
    const cats = FIXED_CATEGORIES;
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
      list.innerHTML = '<div class="list-empty">No items found.</div>';
      return;
    }
    const self = this;
    list.innerHTML = items.map(function(item) { return self._cardHtml(item); }).join('');
    this._bindCardEvents();
    // Scroll to a specific item if requested by an Archived Item Link click
    if (this._scrollToId) {
      var target = document.querySelector('.item-card[data-id="' + this._scrollToId + '"]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('review-scroll-highlight');
        setTimeout(function() { target.classList.remove('review-scroll-highlight'); }, 2000);
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
      var d;
      try { d = typeof item.source_detail === 'string' ? JSON.parse(item.source_detail) : item.source_detail; } catch (e) { d = {}; }
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
        return '<a href="/activate?tool=' + escHtml(tool.id) + '" class="tool-pill tool-pill-inactive tool-pill-teal' + (isTagged ? ' tool-pill-tagged tagged' : '') + '" title="Learn more about this tool">' + escHtml(tLabel) + ' <span class="tool-pill-add-stax">+ Learn More</span></a>';
      }
      var tLabel = Array.isArray(tool.title) ? tool.title.join(' ') : (tool.title || tool.id);
      return '<button class="tool-pill tool-pill-teal' + (isTagged ? ' tool-pill-tagged tagged' : '') + '" data-item-id="' + id + '" data-tool-id="' + escHtml(tool.id) + '">' + escHtml(tLabel) + '</button>';
    }).join('');
    const DEFAULT_CATEGORIES = ['Products & Services', 'Pricing', 'Company Information', 'Jobs, Portfolio & Photos', 'Promotions & Offers', 'Customer Testimonials', 'Tips & How-To', 'Industry News', 'Tender & Proposal Documents', 'Financial Documents', 'Compliance & Certificates', 'Safety & SWMS', 'Supplier Communications'];
    const catTags = Array.isArray(item.category_tags) && item.category_tags.length > 0 ? item.category_tags : (item.category ? [item.category] : []);
    const catPillsHtml = DEFAULT_CATEGORIES.map(function(cat) {
      const isTagged = catTags.indexOf(cat) > -1;
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      return '<button class="cat-pill tool-pill tool-pill-purple' + (isTagged ? ' cat-pill-tagged tagged' : '') + '" data-item-id="' + id + '" data-cat-id="' + escHtml(cat) + '">' + escHtml(label) + '</button>';
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
    const sourceDetailHtml = sourceDetailParts.length > 0 ? sourceDetailParts.join('') : '<div class="list-empty-detail">No source detail available.</div>';
    const aiRejectedPill = (this._status === 'rejected' && detail.rejection_source === 'auto')
      ? '<span class="review-ai-rejected-pill">AI Rejected Item</span>'
      : '';
    const archivedLinkId = (this._status === 'approved' && this._archivedLinks && this._archivedLinks[item.id]) ? this._archivedLinks[item.id] : null;
    const archivedLinkPill = archivedLinkId
      ? '<a href="#" class="review-archived-link-pill" data-archived-id="' + escHtml(archivedLinkId) + '">Archived Item Link</a>'
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
    const pairCardClass = hasPairPartner ? ' item-card-paired' : '';
    var usedNoticeHtml = '';
    if (isUsed) {
      if (item.source === 'manual') {
        usedNoticeHtml = '<div class="review-used-notice">This item has been used by a tool and cannot be edited. <button class="review-copy-btn" data-id="' + id + '">Copy to New Manual Item</button></div>';
      } else {
        usedNoticeHtml = '<div class="review-used-notice">This item has been used by a tool and cannot be edited. You can archive it and re-import or create a new Manual Item.</div>';
      }
    }
    var thumbHtml = '';
    var itemSd = item.source_detail || {};
    var isImgItem = item.content_type === 'image' || itemSd.file_type === 'image' || (itemSd.mime_type && itemSd.mime_type.indexOf('image/') === 0);
    if (isImgItem && item.source_item_id && this._imageUrls[item.source_item_id]) {
      thumbHtml = '<img src="' + escHtml(this._imageUrls[item.source_item_id]) + '" alt="" class="review-thumb">';
    }
    return `<div class="item-card${pairCardClass}" data-id="${id}">
  <div class="item-card-header">
    <input type="checkbox" class="item-checkbox" data-id="${id}"${checked}>
    <span class="review-title-wrap">
      ${thumbHtml}<span class="item-card-title"${isUsed ? '' : ' contenteditable="true"'} data-id="${id}"${isUsed ? '' : ' title="Click to edit"'}>${title}</span>${aiRejectedPill}${archivedLinkPill}
    </span>
    <div class="item-card-preview-row">
      <button class="expand-btn" data-id="${id}" title="Expand">&#9654;</button>
      <span class="text-preview" id="review-preview-${id}">${bodyPreview}</span>
    </div>${usedNoticeHtml}
    <button class="review-tools-btn" data-id="${id}" data-section="tags">&#9741; Tagged Tools</button>
    <button class="review-cats-btn" data-id="${id}" data-section="cats">&#9776; Tagged Categories</button>
    <div class="item-card-btns">
      <span class="item-upload-date">Upload Date: ${uploadDate}</span><button class="source-btn" data-id="${id}" data-section="source" title="View source document">&#128196; Source</button>
          ${this._status !== 'approved' ? '<button class="review-approve-btn" data-id="' + id + '" title="Approve">&#10003; Approve</button>' : ''}
      <button class="review-reject-btn" data-id="${id}" data-used="${isUsed ? '1' : ''}" title="${this._status === 'rejected' ? (isUsed ? 'Archive' : 'Delete') : 'Reject'}" >&#10007; ${this._status === 'rejected' ? (isUsed ? 'Archive' : 'Delete') : 'Reject'}</button>
    </div>
      </div>
  
  <div class="item-section" id="review-tags-${id}" style="display:none">
    <div class="item-section-head"><span class="section-head-label">Tagged Tools</span></div>
    <div class="review-tool-pills">${toolPillsHtml}</div>
  </div>
  <div class="item-section" id="review-cats-${id}" style="display:none">
    <div class="item-section-head"><span class="section-head-label">Tagged Categories</span></div>
    <div class="review-tool-pills">${catPillsHtml}</div>
  </div>
  <div class="item-section" id="review-source-${id}" style="display:none">
    <div class="item-section-head"><span class="section-head-label">Source</span></div>
    <div class="source-detail">${sourceDetailHtml}</div>
  </div>
</div>`;
  },

  _bindCardEvents: function() {
    const self = this;
    var listEl = document.getElementById('review-list');
    if (!listEl) return;
    listEl.querySelectorAll('.item-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        if (cb.checked) { self._selected.add(cb.dataset.id); } else { self._selected.delete(cb.dataset.id); }
        self._updateBulkBar();
      });
    });
    listEl.querySelectorAll('.expand-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var card = btn.closest('.item-card');
        if (!card) return;
        var isExpanded = card.classList.contains('content-expanded');
        card.classList.toggle('content-expanded', !isExpanded);
        btn.innerHTML = isExpanded ? '&#9654;' : '&#9660;';
      });
    });
    listEl.querySelectorAll('.review-approve-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatus(btn.dataset.id, 'approved'); });
    });
    listEl.querySelectorAll('.review-reject-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (self._status === 'rejected') {
          if (btn.dataset.used === '1') { self._changeStatus(btn.dataset.id, 'archived'); } else { self._deleteItem(btn.dataset.id); }
        } else { self._changeStatus(btn.dataset.id, 'rejected'); }
      });
    });
    listEl.querySelectorAll('.review-archived-link-pill').forEach(function(pill) {
      pill.addEventListener('click', function(e) {
        e.preventDefault();
        self._scrollToId = pill.dataset.archivedId;
        self.setStatus('archived');
      });
    });
    listEl.querySelectorAll('.review-copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var item = self._items.find(function(i) { return i.id === btn.dataset.id; });
        if (item && window.CL_UPLOAD) {
          window.CL_UPLOAD.openManualAdd({ title: item.title || '', description: item.content_text || '', tool_tags: item.tool_tags || [] });
          var uploadTab = document.querySelector('[data-tab="upload"]');
          if (uploadTab) uploadTab.click();
        }
      });
    });
    listEl.querySelectorAll('.review-tools-btn, .review-cats-btn, .source-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var el = document.getElementById('review-' + btn.dataset.section + '-' + btn.dataset.id);
        if (el) {
          var isOpen = el.style.display !== 'none';
          el.style.display = isOpen ? 'none' : '';
          btn.classList.toggle('open', !isOpen);
        }
      });
    });
    listEl.querySelectorAll('.item-card-title[contenteditable]').forEach(function(el) {
      el.addEventListener('blur', function() { self._saveField(el.dataset.id, 'title', el.innerText.trim()); });
      el.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });
    listEl.querySelectorAll('.review-body-text[contenteditable]').forEach(function(el) {
      el.addEventListener('blur', function() { self._saveField(el.dataset.id, 'body', el.innerText.trim()); });
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
    if (result.error) { console.error('[CL Review] _changeStatus error:', result.error.message); return; }
    this._items = this._items.filter(function(i) { return i.id !== id; });
    const card = document.querySelector('.item-card[data-id="' + id + '"]');
    if (card) card.remove();
    this._selected.delete(id);
    this._updateBulkBar();
    this._updateStatTiles();
  },

  _deleteItem: async function(id) {
    var result = await this._supabase.from('content_library').delete().eq('id', id);
    if (result.error) { console.error('[CL Review] _deleteItem error:', result.error.message); return; }
    this._items = this._items.filter(function(i) { return i.id !== id; });
    var card = document.querySelector('.item-card[data-id="' + id + '"]');
    if (card) card.remove();
    this._selected.delete(id);
    this._updateBulkBar();
    this._updateStatTiles();
  },

  _bulkAction: async function(newStatus) {
    const self = this;
    const ids = Array.from(this._selected);
    if (ids.length === 0) return;
    var result = await this._supabase.from('content_library').update({ status: newStatus }).in('id', ids);
    if (result.error) { console.error('[CL Review] _bulkAction error:', result.error.message); return; }
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
    var result = await this._supabase.from('content_library').update({ status: newStatus }).in('id', ids);
    if (result.error) { console.error('[CL Review] _bulkActionAll error:', result.error.message); return; }
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
    var result = await this._supabase.from('content_library').delete().in('id', ids);
    if (result.error) { console.error('[CL Review] _bulkDelete error:', result.error.message); return; }
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
    var result = await this._supabase.from('content_library').delete().in('id', ids);
    if (result.error) { console.error('[CL Review] _bulkDeleteAll error:', result.error.message); return; }
    this._items = this._items.filter(function(i) { return ids.indexOf(i.id) === -1; });
    this._selected = new Set();
    this._updateBulkBar();
    this._renderList();
    this._updateStatTiles();
  },

  _saveField: async function(id, field, value) {
    const update = {};
    update[field] = value;
    var result = await this._supabase.from('content_library').update(update).eq('id', id);
    if (result.error) { console.error('[CL Review] _saveField error:', result.error.message); }
  },

  _toggleToolTag: async function(itemId, toolId, pill) {
    const item = this._items.find(function(i) { return i.id === itemId; });
    if (!item) return;
    const tags = Array.isArray(item.tool_tags) ? item.tool_tags.slice() : [];
    const idx = tags.indexOf(toolId);
    if (idx > -1) { tags.splice(idx, 1); } else { tags.push(toolId); }
    var result = await this._supabase.from('content_library').update({ tool_tags: tags }).eq('id', itemId);
    if (result.error) { console.error('[CL Review] _toggleToolTag error:', result.error.message); return; }
    item.tool_tags = tags;
    var isNowTagged = tags.indexOf(toolId) > -1;
    pill.classList.toggle('tool-pill-tagged', isNowTagged);
    pill.classList.toggle('tagged', isNowTagged);
  },

  _toggleCategoryTag: async function(itemId, catId, pill) {
    const item = this._items.find(function(i) { return i.id === itemId; });
    if (!item) return;
    const tags = Array.isArray(item.category_tags) && item.category_tags.length > 0 ? item.category_tags.slice() : (item.category ? [item.category] : []);
    const idx = tags.indexOf(catId);
    if (idx > -1) { tags.splice(idx, 1); } else { tags.push(catId); }
    var result = await this._supabase.from('content_library').update({ category_tags: tags }).eq('id', itemId);
    if (result.error) { console.error('[CL Review] _toggleCategoryTag error:', result.error.message); return; }
    item.category_tags = tags;
    var isNowTagged = tags.indexOf(catId) > -1;
    pill.classList.toggle('cat-pill-tagged', isNowTagged);
    pill.classList.toggle('tagged', isNowTagged);
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
