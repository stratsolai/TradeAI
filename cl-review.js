(function() {

  var supabaseClient = window.supabaseClient;
  var allReviewItems = [];
  var currentReviewStatus = 'pending';
  var currentReviewFilter = 'all';
  var selectedItems = new Set();
  var currentDetailItem = null;

  window.CL_REVIEW = {

    init: function(supabase) {
      supabaseClient = supabase;
      var panel = document.getElementById('cl-tab-review');
      if (!panel) return;
      panel.innerHTML = '<div id="review-sub-tabs" class="sub-tab-bar">' +
        '<button class="stab active" onclick="window.CL_REVIEW.switchStatus(\'pending\')">⏳ Pending</button>' +
        '<button class="stab" onclick="window.CL_REVIEW.switchStatus(\'approved\')">✅ Approved</button>' +
        '<button class="stab" onclick="window.CL_REVIEW.switchStatus(\'rejected\')">❌ Rejected</button>' +
        '</div>' +
        '<div class="review-toolbar">' +
        '<div class="review-filters" id="review-filter-pills">' +
        '<button class="filter-pill active" onclick="window.filterReview(\'all\', this)">All</button>' +
        '<button class="filter-pill" onclick="window.filterReview(\'completed-jobs\', this)">Completed Jobs</button>' +
        '<button class="filter-pill" onclick="window.filterReview(\'marketing\', this)">Marketing</button>' +
        '<button class="filter-pill" onclick="window.filterReview(\'testimonial\', this)">Testimonials</button>' +
        '<button class="filter-pill" onclick="window.filterReview(\'tips\', this)">Tips</button>' +
        '<button class="filter-pill" onclick="window.filterReview(\'team-culture\', this)">Team</button>' +
        '<button class="filter-pill" onclick="window.filterReview(\'company\', this)">Company</button>' +
        '<button class="filter-pill" onclick="window.filterReview(\'service\', this)">Service</button>' +
        '</div>' +
        '<input type="text" class="review-search" placeholder="Search items..." oninput="window.searchReview(this.value)">' +
        '</div>' +
        '<div id="bulk-bar" class="bulk-bar">' +
        '<span id="bulk-count"></span>' +
        '<button class="btn btn-green btn-sm" onclick="window.bulkAction(\'approved\')">✅ Approve All</button>' +
        '<button class="btn btn-red btn-sm" onclick="window.bulkAction(\'rejected\')">❌ Reject All</button>' +
        '<button class="btn btn-grey btn-sm" onclick="window.clearBulkSelection()">Clear</button>' +
        '</div>' +
        '<div id="review-items-list" class="review-list"></div>' +
        '<div id="review-empty" class="empty-state" style="display:none">No items to review.</div>';
      loadReviewItems();
    },

    switchStatus: function(status) {
      currentReviewStatus = status;
      document.querySelectorAll('#review-sub-tabs .stab').forEach(function(t) {
        t.classList.remove('active');
      });
      event.target.classList.add('active');
      loadReviewItems();
    },

    renderTagPanel: function(item, activatedTools) {
      var list = document.getElementById('tag-panel-list');
      if (!list) return;
      var coreTools = (window.CORE_TOOLS || []);
      var currentTags = item.tool_tags || [];
      var html = '';
      coreTools.forEach(function(tool) {
        var toolId = tool.toolId || tool.id;
        var isActive = activatedTools.indexOf(toolId) !== -1;
        var isTagged = currentTags.indexOf(toolId) !== -1;
        if (isActive) {
          html += '<div class="tag-row">' +
            '<span class="tag-tool-name">' + (tool.name || toolId) + '</span>' +
            '<label class="tag-toggle">' +
            '<input type="checkbox" class="tag-checkbox" data-toolid="' + toolId + '"' + (isTagged ? ' checked' : '') + ' />' +
            '<span class="tag-toggle-slider"></span>' +
            '</label>' +
            '</div>';
        } else {
          html += '<div class="tag-row tag-row-inactive">' +
            '<span class="tag-tool-name">' + (tool.name || toolId) + '</span>' +
            '<span class="tag-inactive-label">Not activated</span>' +
            '</div>';
        }
      });
      list.innerHTML = html;
      var checkboxes = list.querySelectorAll('.tag-checkbox');
      checkboxes.forEach(function(cb) {
        cb.addEventListener('change', function() {
          var selected = [];
          list.querySelectorAll('.tag-checkbox:checked').forEach(function(c) {
            selected.push(c.getAttribute('data-toolid'));
          });
          window.CL_REVIEW.saveItemTags(item.id, selected);
        });
      });
    },

    saveItemTags: async function(itemId, tags) {
      if (!supabaseClient) return;
      try {
        await supabaseClient
          .from('content_library')
          .update({ tool_tags: tags })
          .eq('id', itemId);
      } catch (err) {
        console.error('saveItemTags error:', err);
      }
    }

  };

  async function loadReviewItems() {
    var authResp = await supabaseClient.auth.getUser();
    var user = authResp.data ? authResp.data.user : null;
    if (!user) return;
    var resp = await supabaseClient
      .from('content_library')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', currentReviewStatus)
      .order('created_at', { ascending: false });
    var data = resp.data;
    allReviewItems = data || [];

    var pendingCount = document.getElementById('stab-pending-count');
    if (pendingCount && currentReviewStatus === 'pending') {
      pendingCount.textContent = allReviewItems.length || '';
    }

    renderReviewItems(filterItemsByCategory(allReviewItems, currentReviewFilter));
  }

  function filterItemsByCategory(items, cat) {
    if (cat === 'all') return items;
    return items.filter(function(i) { return i.category === cat; });
  }

  window.filterReview = function(cat, btn) {
    currentReviewFilter = cat;
    document.querySelectorAll('#review-filter-pills .filter-pill').forEach(function(b) {
      b.classList.remove('active');
    });
    btn.classList.add('active');
    renderReviewItems(filterItemsByCategory(allReviewItems, cat));
  };

  window.searchReview = function(query) {
    var filtered = query
      ? allReviewItems.filter(function(i) {
          return (i.title && i.title.toLowerCase().indexOf(query.toLowerCase()) !== -1) ||
                 (i.description && i.description.toLowerCase().indexOf(query.toLowerCase()) !== -1);
        })
      : allReviewItems;
    renderReviewItems(filterItemsByCategory(filtered, currentReviewFilter));
  };

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function getTypeIcon(type) {
    var icons = { photo: '🖼', document: '📄', email: '📧', website: '🌐', drive: '💾', tool: '🤖' };
    return icons[type] || '📄';
  }

  function renderReviewItems(items) {
    var list = document.getElementById('review-items-list');
    var empty = document.getElementById('review-empty');
    if (!list) return;

    if (!items.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    var catBadge = function(cat) {
      var map = {
        'completed-jobs': ['green', '✅ Completed Job'],
        'marketing': ['orange', '🎯 Marketing'],
        'testimonial': ['purple', '💬 Testimonial'],
        'tips': ['', '💡 Tips'],
        'team-culture': ['', '👥 Team'],
        'company': ['', '🏢 Company'],
        'service': ['', '⚙️ Service']
      };
      var entry = map[cat];
      if (!entry) return '<span class="cat-badge">' + escHtml(cat || 'general') + '</span>';
      return '<span class="cat-badge' + (entry[0] ? ' badge-' + entry[0] : '') + '">' + entry[1] + '</span>';
    };

    list.innerHTML = items.map(function(item) {
      var isSelected = selectedItems.has(item.id);
      var actionBtns = '';
      if (currentReviewStatus === 'pending') {
        actionBtns = '<button class="btn btn-green btn-sm" onclick="updateItemStatus(\'' + item.id + '\',\'approved\')">✅ Approve</button>' +
          '<button class="btn btn-red btn-sm" onclick="updateItemStatus(\'' + item.id + '\',\'rejected\')">❌ Reject</button>';
      } else if (currentReviewStatus === 'rejected') {
        actionBtns = '<button class="btn btn-green btn-sm" onclick="updateItemStatus(\'' + item.id + '\',\'approved\')">↩ Restore</button>' +
          '<button class="btn btn-red btn-sm" onclick="deleteItem(\'' + item.id + '\')">🗑 Delete</button>';
      } else {
        actionBtns = '<button class="btn btn-grey btn-sm" onclick="updateItemStatus(\'' + item.id + '\',\'rejected\')">↩ Reject</button>';
      }
      return '<div class="review-item' + (isSelected ? ' selected' : '') + '" id="ri-' + item.id + '">' +
        '<div class="review-item-header" onclick="window.toggleSelect(\'' + item.id + '\')">' +
        '<input type="checkbox" class="review-checkbox"' + (isSelected ? ' checked' : '') +
        ' onchange="window.toggleSelect(\'' + item.id + '\')" onclick="event.stopPropagation()">' +
        '<div class="review-item-thumb">' + getTypeIcon(item.content_type) + '</div>' +
        '<div class="review-item-info">' +
        '<div class="review-item-title">' + escHtml(item.title || 'Untitled') + '</div>' +
        '<div class="review-item-meta">' +
        catBadge(item.category) +
        '<span>' + escHtml(item.content_type || 'unknown') + '</span>' +
        '<span>' + new Date(item.created_at).toLocaleDateString('en-AU') + '</span>' +
        '</div></div></div>' +
        '<div class="review-item-actions">' + actionBtns +
        '<button class="btn btn-outline btn-sm" onclick="window.showDetail(\'' + item.id + '\')">✏️ Edit</button>' +
        '</div></div>';
    }).join('');
  }

  window.toggleSelect = function(id) {
    if (selectedItems.has(id)) selectedItems.delete(id);
    else selectedItems.add(id);
    updateBulkBar();
    var el = document.getElementById('ri-' + id);
    if (el) {
      el.classList.toggle('selected', selectedItems.has(id));
      var cb = el.querySelector('.review-checkbox');
      if (cb) cb.checked = selectedItems.has(id);
    }
  };

  function updateBulkBar() {
    var bar = document.getElementById('bulk-bar');
    var count = document.getElementById('bulk-count');
    if (!bar) return;
    if (selectedItems.size > 0) {
      bar.classList.add('show');
      if (count) count.textContent = selectedItems.size + ' selected';
    } else {
      bar.classList.remove('show');
    }
  }

  window.clearBulkSelection = function() {
    selectedItems.clear();
    updateBulkBar();
    loadReviewItems();
  };

  window.bulkAction = async function(status) {
    if (!selectedItems.size) return;
    var ids = Array.from(selectedItems);
    await supabaseClient.from('content_library').update({ status: status }).in('id', ids);
    selectedItems.clear();
    loadReviewItems();
    loadStats();
  };

  async function updateItemStatus(id, status) {
    await supabaseClient.from('content_library').update({ status: status }).eq('id', id);
    var el = document.getElementById('ri-' + id);
    if (el) el.remove();
    allReviewItems = allReviewItems.filter(function(i) { return i.id !== id; });
    loadStats();
  }

  async function deleteItem(id) {
    if (!confirm('Permanently delete this item?')) return;
    await supabaseClient.from('content_library').delete().eq('id', id);
    loadReviewItems();
    loadStats();
  }

  window.showDetail = function(id) {
    currentDetailItem = allReviewItems.find(function(i) { return i.id === id; });
    if (!currentDetailItem) return;
    var item = currentDetailItem;
    document.getElementById('modal-detail-body').innerHTML =
      '<div class="detail-grid">' +
      '<div>' +
      '<div class="form-group"><label>Title</label>' +
      '<input type="text" id="detail-title" value="' + escHtml(item.title || '') + '"></div>' +
      '<div class="form-group"><label>Category</label>' +
      '<select id="detail-category">' +
      ['completed-jobs','marketing','testimonial','tips','team-culture','company','service','general'].map(function(c) {
        return '<option value="' + c + '"' + (item.category === c ? ' selected' : '') + '>' + c + '</option>';
      }).join('') +
      '</select></div>' +
      '<div class="form-group"><label>Tags (comma separated)</label>' +
      '<input type="text" id="detail-tags" value="' + escHtml((item.tags || []).join(', ')) + '"></div>' +
      '</div></div>' +
      '<div class="form-group"><label>Description / Content</label>' +
      '<textarea id="detail-desc" rows="5">' + escHtml(item.description || '') + '</textarea></div>' +
      '<div id="tag-panel-list" class="tag-panel"></div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-primary" onclick="window.saveDetail()" style="flex:1">💾 Save Changes</button>' +
      '<button class="btn btn-green" onclick="window.saveAndApprove()" style="flex:1">✅ Save & Approve</button>' +
      '<button class="btn btn-grey" onclick="closeModal(\'modal-detail\')" style="flex:1">Cancel</button>' +
      '</div>';
    document.getElementById('modal-detail').classList.add('show');
    (async function() {
      try {
        var authResp = await supabaseClient.auth.getUser();
        var user = authResp.data ? authResp.data.user : null;
        var profileResp = user ? (await supabaseClient.from('profiles').select('activated_tools').eq('user_id', user.id).single()) : null;
        var activatedTools = (profileResp && profileResp.data && profileResp.data.activated_tools) ? profileResp.data.activated_tools : [];
        window.CL_REVIEW.renderTagPanel(item, activatedTools);
      } catch(e) {
        window.CL_REVIEW.renderTagPanel(item, []);
      }
    })();
  };

  window.saveDetail = async function() {
    if (!currentDetailItem) return;
    var updates = {
      title: document.getElementById('detail-title').value,
      category: document.getElementById('detail-category').value,
      description: document.getElementById('detail-desc').value,
      tags: document.getElementById('detail-tags').value.split(',').map(function(t){ return t.trim(); }).filter(Boolean)
    };
    await supabaseClient.from('content_library').update(updates).eq('id', currentDetailItem.id);
    closeModal('modal-detail');
    loadReviewItems();
  };

  window.saveAndApprove = async function() {
    if (!currentDetailItem) return;
    var updates = {
      title: document.getElementById('detail-title').value,
      category: document.getElementById('detail-category').value,
      description: document.getElementById('detail-desc').value,
      tags: document.getElementById('detail-tags').value.split(',').map(function(t){ return t.trim(); }).filter(Boolean),
      status: 'approved'
    };
    await supabaseClient.from('content_library').update(updates).eq('id', currentDetailItem.id);
    closeModal('modal-detail');
    loadReviewItems();
    loadStats();
  };

})();
