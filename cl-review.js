window.CL_REVIEW = {
  _supabase: null,
  _status: 'pending',
  _categoryFilter: 'all',
  _toolFilters: [],
  _searchTerm: '',
  _items: [],
  _selected: new Set(),

  init: function(supabase) {
    this._supabase = supabase;
    this._render();
    this._load();
    this._bindStatTiles();
  },

  setStatus: function(status) {
    this._status = status;
    this._categoryFilter = 'all';
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
        if (status === 'all') {
          self.setStatus('pending');
        } else {
          self.setStatus(status);
        }
      });
    });
  },

  _render: function() {
    const el = document.getElementById('cl-tab-review');
    if (!el) return;
    el.innerHTML = `
      <div class="review-inner">
        <div class="review-status-bar">
          <button class="review-status-btn review-status-pending active" data-status="pending">Pending</button>
          <button class="review-status-btn review-status-approved" data-status="approved">Approved</button>
          <button class="review-status-btn review-status-rejected" data-status="rejected">Rejected</button>
        </div>
        <div id="review-filter-row" class="review-filter-row" style="display:none">
          <div id="review-cat-pills" class="review-pill-row"></div>
          <div id="review-tool-pills" class="review-pill-row"></div>
        </div>
        <div class="review-search-row">
          <input type="text" id="review-search" class="review-search-input" placeholder="Search items...">
        </div>
        <div id="review-bulk-bar" class="review-bulk-bar" style="display:none">
          <span id="review-bulk-count" class="review-bulk-count-label"></span>
          <button class="btn-outline review-bulk-approve-btn" id="review-bulk-approve-btn">&#10003; Approve All</button>
          <button class="btn-outline review-bulk-reject-btn" id="review-bulk-reject-btn">&#10007; Reject All</button>
          <button class="btn-link" id="review-bulk-deselect-btn">Deselect All</button>
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
        self._categoryFilter = 'all';
        self._toolFilters = [];
        self._selected = new Set();
        self._load();
      });
    });
    document.getElementById('review-search').addEventListener('input', function() {
      self._searchTerm = this.value.toLowerCase();
      self._renderList();
    });
    document.getElementById('review-bulk-approve-btn').addEventListener('click', function() {
      self._bulkAction('approved');
    });
    document.getElementById('review-bulk-reject-btn').addEventListener('click', function() {
      self._bulkAction('rejected');
    });
    document.getElementById('review-bulk-deselect-btn').addEventListener('click', function() {
      self._selected = new Set();
      self._updateBulkBar();
      document.querySelectorAll('.review-item-checkbox').forEach(function(cb) { cb.checked = false; });
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
  },

  _renderFilterRow: function() {
    const filterRow = document.getElementById('review-filter-row');
    const catPills = document.getElementById('review-cat-pills');
    const toolPills = document.getElementById('review-tool-pills');
    if (!filterRow || !catPills || !toolPills) return;
    if (this._status === 'pending') {
      filterRow.style.display = 'none';
      return;
    }
    filterRow.style.display = '';
    const categories = ['all'].concat(
      [...new Set(this._items.map(function(i) { return i.type; }).filter(Boolean))]
    );
    catPills.innerHTML = categories.map(function(cat) {
      const active = cat === (this._categoryFilter || 'all') ? ' active' : '';
      const label = cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1);
      return '<button class="review-pill cat-pill' + active + '" data-cat="' + escHtml(cat) + '">' + escHtml(label) + '</button>';
    }, this).join('');
    const allToolIds = new Set();
    this._items.forEach(function(item) {
      if (Array.isArray(item.tool_tags)) {
        item.tool_tags.forEach(function(t) { allToolIds.add(t); });
      }
    });
    const tools = window.CORE_TOOLS || [];
    const relevantTools = tools.filter(function(t) { return allToolIds.has(t.id); });
    toolPills.innerHTML = relevantTools.map(function(tool) {
      const active = this._toolFilters.indexOf(tool.id) > -1 ? ' active' : '';
      return '<button class="review-pill tool-pill' + active + '" data-tool="' + escHtml(tool.id) + '">' + escHtml(tool.name) + '</button>';
    }, this).join('');
    const self = this;
    document.querySelectorAll('.cat-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        self._categoryFilter = pill.dataset.cat;
        self._renderFilterRow();
        self._renderList();
      });
    });
    document.querySelectorAll('.tool-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        const id = pill.dataset.tool;
        const idx = self._toolFilters.indexOf(id);
        if (idx > -1) {
          self._toolFilters.splice(idx, 1);
        } else {
          self._toolFilters.push(id);
        }
        self._renderFilterRow();
        self._renderList();
      });
    });
  },

  _filteredItems: function() {
    const self = this;
    return this._items.filter(function(item) {
      if (self._categoryFilter && self._categoryFilter !== 'all' && item.type !== self._categoryFilter) return false;
      if (self._toolFilters.length > 0) {
        const tags = Array.isArray(item.tool_tags) ? item.tool_tags : [];
        const match = self._toolFilters.some(function(f) { return tags.indexOf(f) > -1; });
        if (!match) return false;
      }
      if (self._searchTerm) {
        const title = (item.title || '').toLowerCase();
        if (title.indexOf(self._searchTerm) === -1) return false;
      }
      return true;
    });
  },

  _renderList: function() {
    const list = document.getElementById('review-list');
    if (!list) return;
    const items = this._filteredItems();
    if (items.length === 0) {
      list.innerHTML = '<div class="review-empty">No items to review.</div>';
      return;
    }
    list.innerHTML = items.map(function(item) {
      return this._renderCard(item);
    }, this).join('');
    this._bindCardEvents();
  },

  _renderCard: function(item) {
    const self = this;
    const id = escHtml(item.id);
    const title = escHtml(item.title || '');
    const typeLabel = item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : '';
    const sourceLabel = self._sourceLabel(item);
    const body = escHtml(item.body || '');
    const tools = window.CORE_TOOLS || [];
    const activatedTools = window._activatedTools || [];
    const toolTags = Array.isArray(item.tool_tags) ? item.tool_tags : [];
    const toolPillsHtml = tools.map(function(tool) {
      const isTagged = toolTags.indexOf(tool.id) > -1;
      const isActive = activatedTools.indexOf(tool.id) > -1;
      if (!isActive) {
        return '<span class="review-tool-pill review-tool-pill-inactive" title="Activate ' + escHtml(tool.name) + '">' +
          escHtml(tool.name) +
          '<a href="dashboard.html" class="review-tool-activate-link">Activate</a>' +
          '</span>';
      }
      const taggedClass = isTagged ? ' review-tool-pill-tagged' : '';
      return '<button class="review-tool-pill' + taggedClass + '" data-item-id="' + id + '" data-tool-id="' + escHtml(tool.id) + '">' +
        escHtml(tool.name) +
        '</button>';
    }).join('');
    const sourceDetailHtml = self._sourceDetailHtml(item);
    const checked = this._selected.has(item.id) ? ' checked' : '';
    return `
      <div class="review-card" data-id="${id}">
        <div class="review-card-header">
          <input type="checkbox" class="review-item-checkbox" data-id="${id}"${checked}>
          <span class="review-card-title" contenteditable="true" data-id="${id}">${title}</span>
          <span class="review-cat-badge">${escHtml(typeLabel)}</span>
          <span class="review-source-badge">${sourceLabel}</span>
          <div class="review-card-actions">
            <button class="btn-outline review-expand-btn" data-id="${id}" data-section="body" title="View content">&#8964;</button>
            <button class="btn-outline review-approve-btn" data-id="${id}" title="Approve">&#10003;</button>
            <button class="btn-outline review-reject-btn" data-id="${id}" title="Reject">&#10007;</button>
          </div>
        </div>
        <div class="review-card-section review-section-body" id="review-body-${id}" style="display:none">
          <div class="review-section-toggle-row">
            <span class="review-section-label">Content</span>
            <button class="btn-link review-section-close" data-id="${id}" data-section="body">Close</button>
          </div>
          <div class="review-body-text" contenteditable="true" data-id="${id}">${body}</div>
        </div>
        <div class="review-card-section review-section-tags" id="review-tags-${id}" style="display:none">
          <div class="review-section-toggle-row">
            <span class="review-section-label">Tagged Tools</span>
            <button class="btn-link review-section-close" data-id="${id}" data-section="tags">Close</button>
          </div>
          <div class="review-tool-pills-row">${toolPillsHtml}</div>
        </div>
        <div class="review-card-section review-section-source" id="review-source-${id}" style="display:none">
          <div class="review-section-toggle-row">
            <span class="review-section-label">Source</span>
            <button class="btn-link review-section-close" data-id="${id}" data-section="source">Close</button>
          </div>
          ${sourceDetailHtml}
        </div>
        <div class="review-card-footer">
          <button class="btn-link review-toggle-btn" data-id="${id}" data-section="body">Content</button>
          <button class="btn-link review-toggle-btn" data-id="${id}" data-section="tags">Tools</button>
          <button class="btn-link review-toggle-btn" data-id="${id}" data-section="source">Source</button>
        </div>
      </div>
    `;
  },

  _sourceLabel: function(item) {
    const source = item.source || '';
    const detail = item.source_detail || {};
    let date = '';
    if (detail.uploaded_at) date = new Date(detail.uploaded_at).toLocaleDateString('en-AU');
    else if (detail.received_at) date = new Date(detail.received_at).toLocaleDateString('en-AU');
    else if (detail.scanned_at) date = new Date(detail.scanned_at).toLocaleDateString('en-AU');
    else if (item.created_at) date = new Date(item.created_at).toLocaleDateString('en-AU');
    const label = source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Unknown';
    return escHtml(label + (date ? ' — ' + date : ''));
  },

  _sourceDetailHtml: function(item) {
    const detail = item.source_detail || {};
    const parts = [];
    if (detail.filename) parts.push('<div><strong>File:</strong> ' + escHtml(detail.filename) + '</div>');
    if (detail.account_email) parts.push('<div><strong>Email account:</strong> ' + escHtml(detail.account_email) + '</div>');
    if (detail.sender) parts.push('<div><strong>From:</strong> ' + escHtml(detail.sender) + '</div>');
    if (detail.subject) parts.push('<div><strong>Subject:</strong> ' + escHtml(detail.subject) + '</div>');
    if (detail.url) parts.push('<div><strong>URL:</strong> ' + escHtml(detail.url) + '</div>');
    if (detail.folder_name) parts.push('<div><strong>Drive folder:</strong> ' + escHtml(detail.folder_name) + '</div>');
    if (item.source_item_id && detail.file_url) {
      parts.push('<div><a href="' + escHtml(detail.file_url) + '" target="_blank" class="btn-link">View Source Document</a></div>');
    }
    return parts.length > 0 ? parts.join('') : '<div class="review-empty-source">No source detail available.</div>';
  },

  _bindCardEvents: function() {
    const self = this;
    document.querySelectorAll('.review-item-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        const id = cb.dataset.id;
        if (cb.checked) { self._selected.add(id); } else { self._selected.delete(id); }
        self._updateBulkBar();
      });
    });
    document.querySelectorAll('.review-approve-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatus(btn.dataset.id, 'approved'); });
    });
    document.querySelectorAll('.review-reject-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatus(btn.dataset.id, 'rejected'); });
    });
    document.querySelectorAll('.review-toggle-btn, .review-expand-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const id = btn.dataset.id;
        const section = btn.dataset.section;
        const el = document.getElementById('review-' + section + '-' + id);
        if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
      });
    });
    document.querySelectorAll('.review-section-close').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const id = btn.dataset.id;
        const section = btn.dataset.section;
        const el = document.getElementById('review-' + section + '-' + id);
        if (el) el.style.display = 'none';
      });
    });
    document.querySelectorAll('.review-card-title[contenteditable]').forEach(function(el) {
      el.addEventListener('blur', function() { self._saveField(el.dataset.id, 'title', el.innerText.trim()); });
    });
    document.querySelectorAll('.review-body-text[contenteditable]').forEach(function(el) {
      el.addEventListener('blur', function() { self._saveField(el.dataset.id, 'body', el.innerText.trim()); });
    });
    document.querySelectorAll('.review-tool-pill[data-item-id]').forEach(function(pill) {
      pill.addEventListener('click', function() {
        const itemId = pill.dataset.itemId;
        const toolId = pill.dataset.toolId;
        self._toggleToolTag(itemId, toolId, pill);
      });
    });
  },

  _changeStatus: async function(id, newStatus) {
    await this._supabase.from('content_library').update({ status: newStatus }).eq('id', id);
    this._items = this._items.filter(function(i) { return i.id !== id; });
    const card = document.querySelector('.review-card[data-id="' + id + '"]');
    if (card) card.remove();
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
    pill.classList.toggle('review-tool-pill-tagged', tags.indexOf(toolId) > -1);
  },

  _updateBulkBar: function() {
    const bar = document.getElementById('review-bulk-bar');
    const count = document.getElementById('review-bulk-count');
    if (!bar || !count) return;
    const n = this._selected.size;
    if (n > 0) {
      bar.style.display = '';
      count.textContent = n + ' selected';
    } else {
      bar.style.display = 'none';
    }
  },

  _updateStatTiles: function() {
    if (window.loadStats) window.loadStats();
  }
};