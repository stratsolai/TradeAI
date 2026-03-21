window.CL_REVIEW = {
  _supabase: null,
  _status: 'pending',
  _categoryFilter: [],
  _toolFilters: [],
  _searchTerm: '',
  _items: [],
  _selected: new Set(),

  init: async function(supabase) {
    this._supabase = supabase;
    this._render();
    this._bindStatTiles();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profResult = await supabase.from('profiles').select('activated_tools').eq('id', user.id).single();
      window._activatedTools = (profResult.data && Array.isArray(profResult.data.activated_tools)) ? profResult.data.activated_tools : [];
    }
    this._load();
  },

  setStatus: function(status) {
    this._status = status;
    this._categoryFilter = [];
    this._toolFilters = [];
    this._searchTerm = '';
    this._selected = new Set();
    const tab = document.querySelector('[data-tab="tab-review"]');
    if (tab) tab.click();
    document.querySelectorAll('.review-status-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.status === status);
    });
    if (document.getElementById('review-search')) {
      document.getElementById('review-search').value = '';
    }
    this._load();
  },

  _bindStatTiles: function() {
    const self = this;
    document.querySelectorAll('[data-status]').forEach(function(tile) {
      tile.addEventListener('click', function() {
        const status = tile.dataset.status;
        self.setStatus(status === 'all' ? 'pending' : status);
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
          <input type="text" id="review-search" class="review-search-input" placeholder="Search items...">
        </div>
        <div class="review-filter-btns-row">
          <button class="review-filter-tools-btn">&#9783; Filter by Tools</button>
          <button class="review-filter-cat-btn">&#9776; Filter by Category</button>
          <button class="review-clear-filters-btn">&#10005; Clear All Filters</button>
        </div>
        <div id="review-filter-row" class="review-filter-row" style="display:none">
          <div id="review-cat-pills" class="review-pill-row"></div>
          <div id="review-tool-pills" class="review-pill-row"></div>
        </div>
        <div id="review-bulk-bar" class="review-bulk-bar" style="display:none">
          <span id="review-bulk-count" class="review-bulk-label"></span>
          <button class="btn-outline review-bulk-approve-btn" id="review-bulk-approve-btn">&#10003; Approve All</button>
          <button class="btn-outline review-bulk-reject-btn" id="review-bulk-reject-btn">&#10007; Reject All</button>
          <button class="btn-link" id="review-deselect-btn">Deselect All</button>
        </div>
        <div id="review-list" class="review-list"></div>
      </div>
    `;
    this._bindControls();
  },

  _bindControls: function() {
    const self = this;
    document.querySelectorAll('.review-status-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.review-status-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self._status = btn.dataset.status;
        self._categoryFilter = [];
        self._toolFilters = [];
        self._selected = new Set();
        self._load();
      });
    });
    document.getElementById('review-search').addEventListener('input', function() {
      self._searchTerm = this.value.toLowerCase();
      self._renderList();
    });
    document.getElementById('review-bulk-approve-btn').addEventListener('click', function() { self._bulkAction('approved'); });
    document.getElementById('review-bulk-reject-btn').addEventListener('click', function() { self._bulkAction('rejected'); });
    document.getElementById('review-deselect-btn').addEventListener('click', function() {
      self._selected = new Set();
      self._updateBulkBar();
      document.querySelectorAll('.review-checkbox').forEach(function(cb) { cb.checked = false; });
    });
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
    this._updateBulkBar();
    this._renderFilterRow();
    this._renderList();
    const self2 = this;
    const filterToolsBtn = document.querySelector('.review-filter-tools-btn');
    const filterCatBtn = document.querySelector('.review-filter-cat-btn');
    if (filterToolsBtn) {
      filterToolsBtn.addEventListener('click', function() {
        const filterRow = document.getElementById('review-filter-row');
        const toolPills = document.getElementById('review-tool-pills');
        const catPills = document.getElementById('review-cat-pills');
        const isOpen = filterToolsBtn.classList.contains('active');
        if (isOpen) {
          filterToolsBtn.classList.remove('active');
          if (filterRow) filterRow.style.display = 'none';
        } else {
          filterToolsBtn.classList.add('active');
          if (filterCatBtn) filterCatBtn.classList.remove('active');
          if (catPills) catPills.style.display = 'none';
          if (toolPills) toolPills.style.display = 'flex';
          self2._renderFilterRow();
          if (filterRow) filterRow.style.display = 'block';
        }
      });
    }
    if (filterCatBtn) {
      filterCatBtn.addEventListener('click', function() {
        const filterRow = document.getElementById('review-filter-row');
        const toolPills = document.getElementById('review-tool-pills');
        const catPills = document.getElementById('review-cat-pills');
        const isOpen = filterCatBtn.classList.contains('active');
        if (isOpen) {
          filterCatBtn.classList.remove('active');
          if (filterRow) filterRow.style.display = 'none';
        } else {
          filterCatBtn.classList.add('active');
          if (filterToolsBtn) filterToolsBtn.classList.remove('active');
          if (toolPills) toolPills.style.display = 'none';
          if (catPills) catPills.style.display = 'flex';
          self2._renderFilterRow();
          if (filterRow) filterRow.style.display = 'block';
        }
      });
    }
    const clearBtn = document.querySelector('.review-clear-filters-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        self2._toolFilters = [];
        self2._categoryFilter = [];
        if (filterToolsBtn) filterToolsBtn.classList.remove('active');
        if (filterCatBtn) filterCatBtn.classList.remove('active');
        if (filterRow) filterRow.style.display = 'none';
        self2._renderFilterRow();
        self2._renderList();
      });
    }
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

    const cats = (window.CL_CATEGORIES && window.CL_CATEGORIES.length > 0)
      ? window.CL_CATEGORIES
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
      return '<button class="filter-pill' + (isActive ? ' active' : '') + '" data-tool="' + escHtml(tool.id) + '">' + escHtml(tool.name) + '</button>';
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
  },

  _filteredItems: function() {
    const self = this;
    return this._items.filter(function(item) {
      if (self._categoryFilter.length > 0 && self._categoryFilter.indexOf(item.category) === -1) return false;
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
    const items = this._filteredItems();
    if (items.length === 0) {
      list.innerHTML = '<div class="review-empty">No items found.</div>';
      return;
    }
    const self = this;
    list.innerHTML = items.map(function(item) { return self._cardHtml(item); }).join('');
    this._bindCardEvents();
  },

  _cardHtml: function(item) {
    const id = escHtml(item.id);
    const title = escHtml(item.title || 'Untitled');
    const typeLabel = item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'Unknown';
    const uploadDate = item.created_at ? new Date(item.created_at).toLocaleDateString('en-AU') : '';
    const sourceParts = [(item.source || 'unknown').slice(0,1).toUpperCase() + (item.source || 'unknown').slice(1)];
    if (item.source_detail) {
      const d = typeof item.source_detail === 'string' ? JSON.parse(item.source_detail) : item.source_detail;
      if (d.filename) sourceParts.push(d.filename);
      else if (d.url) sourceParts.push(d.url);
    }
    const sourceLabel = escHtml(sourceParts.join(' — '));
    const body = escHtml(item.content_text || '');
    const bodyRaw = (item.content_text || '').replace(/\n/g, ' ');
    const bodyPreview = escHtml(bodyRaw);
    const checked = this._selected.has(item.id) ? ' checked' : '';
    const tools = window.CORE_TOOLS || [];
    const activatedTools = window._activatedTools || [];
    const toolTags = Array.isArray(item.tool_tags) ? item.tool_tags : [];
    const toolPillsHtml = tools.map(function(tool) {
      const isTagged = toolTags.indexOf(tool.id) > -1;
      const isActivated = activatedTools.indexOf(tool.id) > -1;
      if (!isActivated) {
        return '<a href="panel-auth.html?tool=' + escHtml(tool.id) + '" class="tool-pill tool-pill-inactive" title="Add to your Stax to use this data">' + escHtml(tool.name) + ' <span class="tool-pill-add-stax">+ Add to Stax</span></a>';
      }
      return '<button class="tool-pill' + (isTagged ? ' tool-pill-tagged' : '') + '" data-item-id="' + id + '" data-tool-id="' + escHtml(tool.id) + '">' + escHtml(tool.name) + '</button>';
    }).join('');
    const detail = item.source_detail || {};
    const sourceDetailParts = [];
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
    return `<div class="review-card" data-id="${id}">
  <div class="review-card-header">
    <input type="checkbox" class="review-checkbox" data-id="${id}"${checked}>
    <span class="review-card-title" contenteditable="true" data-id="${id}" title="Click to edit">${title}</span>
    <div class="review-card-preview-row">
      <button class="review-expand-btn" data-id="${id}" title="Expand">&#9654;</button>
      <span class="review-body-preview" id="review-preview-${id}">${bodyPreview}</span>
    </div>
    <button class="review-tools-btn" data-id="${id}" data-section="tags">&#9741; Tagged Tools</button>
    <span class="review-type-badge">${escHtml(typeLabel)}</span>
    <div class="review-card-btns">
      <span class="review-upload-date">Upload Date: ${uploadDate}</span><button class="review-source-btn" data-id="${id}" title="View source document">&#128196; Source</button>
          <button class="btn-outline review-approve-btn" data-id="${id}" title="Approve">&#10003; Approve</button>
      <button class="btn-outline review-reject-btn" data-id="${id}" title="Reject">&#10007; Reject</button>
    </div>
      </div>
  
  <div class="review-section" id="review-tags-${id}" style="display:none">
    <div class="review-section-head"><span>Tagged Tools</span><button class="btn-link review-close" data-id="${id}" data-section="tags">Close</button></div>
    <div class="review-tool-pills">${toolPillsHtml}</div>
  </div>
  <div class="review-section" id="review-source-${id}" style="display:none">
    <div class="review-section-head"><span>Source</span><button class="btn-link review-close" data-id="${id}" data-section="source">Close</button></div>
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
        const span = document.getElementById('review-preview-' + btn.dataset.id);
        if (!span) return;
        const expanded = span.dataset.expanded === '1';
        if (expanded) {
          span.style.whiteSpace = 'nowrap';
          span.style.overflow = 'hidden';
          span.dataset.expanded = '0';
          btn.innerHTML = '&#9654;';
        } else {
          span.style.whiteSpace = 'normal';
          span.style.overflow = 'visible';
          span.dataset.expanded = '1';
          btn.innerHTML = '&#9660;';
        }
      });
    });
    document.querySelectorAll('.review-approve-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatus(btn.dataset.id, 'approved'); });
    });
    document.querySelectorAll('.review-reject-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatus(btn.dataset.id, 'rejected'); });
    });
    document.querySelectorAll('.review-toggle, .review-tools-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const el = document.getElementById('review-' + btn.dataset.section + '-' + btn.dataset.id);
        if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
      });
    });
    document.querySelectorAll('.review-close').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const el = document.getElementById('review-' + btn.dataset.section + '-' + btn.dataset.id);
        if (el) el.style.display = 'none';
      });
    });
    document.querySelectorAll('.review-card-title[contenteditable]').forEach(function(el) {
      el.addEventListener('blur', function() { self._saveField(el.dataset.id, 'title', el.innerText.trim()); });
      el.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });
    document.querySelectorAll('.review-body-text[contenteditable]').forEach(function(el) {
      el.addEventListener('blur', function() { self._saveField(el.dataset.id, 'body', el.innerText.trim()); });
    });
    document.querySelectorAll('.tool-pill[data-item-id]').forEach(function(pill) {
      pill.addEventListener('click', function() { self._toggleToolTag(pill.dataset.itemId, pill.dataset.toolId, pill); });
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
    pill.classList.toggle('tool-pill-tagged', tags.indexOf(toolId) > -1);
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
