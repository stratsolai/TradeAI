(function() {
  window.CL_REVIEW = {
    init: function(supabase) {
      var panel = document.getElementById("cl-tab-review");
      if (!panel) return;
      panel.innerHTML = "<div class=\"ptab-content\" id=\"tab-review\">\n\n    <!-- Secondary tabs: Pending / Approved / Rejected -->\n    <div class=\"secondary-tabs\">\n      <button class=\"stab active\" onclick=\"switchReviewTab('pending')\">⏳ Pending Review <span class=\"tab-badge\" id=\"stab-pending-count\">0</span></button>\n      <button class=\"stab\" onclick=\"switchReviewTab('approved')\">✅ Approved <span class=\"tab-badge green\" id=\"stab-approved-count\">0</span></button>\n      <button class=\"stab\" onclick=\"switchReviewTab('rejected')\">❌ Rejected <span class=\"tab-badge grey\" id=\"stab-rejected-count\">0</span></button>\n    </div>\n\n    <div class=\"info-box\" id=\"review-info-box\">\n      <strong>📋 Review Extracted Content:</strong> AI has extracted content from your uploads. Review and approve items to make them available to all your AI tools.\n    </div>\n\n    <!-- Category filter -->\n    <div class=\"filter-bar\" id=\"review-filter-bar\">\n      <button class=\"filter-btn active\" onclick=\"filterReview('all', this)\">All</button>\n      <button class=\"filter-btn\" onclick=\"filterReview('completed-jobs', this)\">✅ Completed Jobs</button>\n      <button class=\"filter-btn\" onclick=\"filterReview('marketing', this)\">🎯 Marketing</button>\n      <button class=\"filter-btn\" onclick=\"filterReview('testimonial', this)\">💬 Testimonials</button>\n      <button class=\"filter-btn\" onclick=\"filterReview('tips', this)\">💡 Tips & Advice</button>\n      <button class=\"filter-btn\" onclick=\"filterReview('team-culture', this)\">👥 Team & Culture</button>\n      <button class=\"filter-btn\" onclick=\"filterReview('company', this)\">🏢 Company Info</button>\n      <button class=\"filter-btn\" onclick=\"filterReview('service', this)\">⚙️ Services</button>\n      <input type=\"text\" class=\"search-input\" placeholder=\"Search...\" onkeyup=\"searchReview(this.value)\">\n    </div>\n\n    <!-- Bulk actions bar -->\n    <div class=\"bulk-bar\" id=\"bulk-bar\">\n      <span class=\"bulk-bar-label\"><span id=\"bulk-count\">0</span> selected</span>\n      <div class=\"bulk-bar-actions\">\n        <button class=\"btn btn-green btn-sm\" onclick=\"bulkAction('approved')\">✅ Approve All</button>\n        <button class=\"btn btn-red btn-sm\" onclick=\"bulkAction('rejected')\">❌ Reject All</button>\n        <button class=\"btn btn-grey btn-sm\" onclick=\"clearBulkSelection()\">Clear</button>\n      </div>\n    </div>\n\n    <!-- Items list -->\n    <div id=\"review-items-list\"></div>\n    <div class=\"empty-state\" id=\"review-empty\" style=\"display:none\">\n      <div class=\"empty-state-icon\">✅</div>\n      <h3>All caught up!</h3>\n      <p>No items to review in this category</p>\n    </div>\n\n  </div>";
      loadReviewItems();
    }
  };

  // Review tab functions
  async function loadReviewItems() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data } = await supabaseClient
    .from('content_library')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', currentReviewStatus)
    .order('created_at', { ascending: false });

  allReviewItems = data || [];

  // Update counts
  document.getElementById('stab-pending-count').textContent = currentReviewStatus === 'pending' ? allReviewItems.length : document.getElementById('stab-pending-count').textContent;

  renderReviewItems(filterItemsByCategory(allReviewItems, currentReviewFilter));
}

function filterItemsByCategory(items, cat) {
  if (cat === 'all') return items;
  return items.filter(i => i.category === cat);
}

window.filterReview = function(cat, btn) {
  currentReviewFilter = cat;
  document.querySelectorAll('#review-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderReviewItems(filterItemsByCategory(allReviewItems, cat));
};

window.searchReview = function(query) {
  const filtered = query
    ? allReviewItems.filter(i =>
        i.title?.toLowerCase().includes(query.toLowerCase()) ||
        i.description?.toLowerCase().includes(query.toLowerCase()))
    : allReviewItems;
  renderReviewItems(filterItemsByCategory(filtered, currentReviewFilter));
};

function renderReviewItems(items) {
  const list = document.getElementById('review-items-list');
  const empty = document.getElementById('review-empty');

  if (!items.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const catBadge = (cat) => {
    const map = {
      'completed-jobs': ['green','✅ Completed Job'],
      'marketing': ['orange','🎯 Marketing'],
      'testimonial': ['purple','💬 Testimonial'],
      'tips': ['','💡 Tips'],
      'team-culture': ['','👥 Team'],
      'company': ['','🏢 Company'],
      'service': ['','⚙️ Service'],
    };
    const [cls, label] = map[cat] || ['', cat];
    return `<span class="cat-badge ${cls}">${label || cat}</span>`;
  };

  list.innerHTML = items.map(item => `
    <div class="review-item ${selectedItems.has(item.id) ? 'selected' : ''}" id="ri-${item.id}">
      <div class="review-item-header" onclick="toggleSelect('${item.id}')">
        <input type="checkbox" class="review-checkbox" ${selectedItems.has(item.id) ? 'checked' : ''}
          onchange="toggleSelect('${item.id}')" onclick="event.stopPropagation()">
        <div class="review-item-thumb">
          ${item.image_url ? `<img src="${item.image_url}" onerror="this.parentNode.textContent='${getTypeIcon(item.content_type)}'">` : getTypeIcon(item.content_type)}
        </div>
        <div class="review-item-info">
          <div class="review-item-title">${escHtml(item.title || 'Untitled')}</div>
          <div class="review-item-meta">
            ${catBadge(item.category)}
            <span>${item.content_type || 'unknown'}</span>
            <span>${new Date(item.created_at).toLocaleDateString('en-AU')}</span>
          </div>
        </div>
      </div>
      ${item.description ? `<div style="padding: 0 18px 12px; font-size:13px; color:#555; line-height:1.5;">${escHtml(item.description.substring(0,200))}${item.description.length > 200 ? '...' : ''}</div>` : ''}
      <div class="review-item-actions">
        ${currentReviewStatus === 'pending' ? `
          <button class="btn btn-green btn-sm" onclick="updateItemStatus('${item.id}','approved')">✅ Approve</button>
          <button class="btn btn-red btn-sm" onclick="updateItemStatus('${item.id}','rejected')">❌ Reject</button>
        ` : currentReviewStatus === 'rejected' ? `
          <button class="btn btn-green btn-sm" onclick="updateItemStatus('${item.id}','approved')">↩ Restore</button>
          <button class="btn btn-red btn-sm" onclick="deleteItem('${item.id}')">🗑 Delete</button>
        ` : `
          <button class="btn btn-grey btn-sm" onclick="updateItemStatus('${item.id}','rejected')">↩ Reject</button>
        `}
        <button class="btn btn-outline btn-sm" onclick="showDetail('${item.id}')">✏️ Edit</button>
      </div>
    </div>
  `).join('');
}

window.toggleSelect = function(id) {
  if (selectedItems.has(id)) selectedItems.delete(id);
  else selectedItems.add(id);
  updateBulkBar();
  const el = document.getElementById(`ri-${id}`);
  if (el) {
    el.classList.toggle('selected', selectedItems.has(id));
    const cb = el.querySelector('.review-checkbox');
    if (cb) cb.checked = selectedItems.has(id);
  }
};

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (selectedItems.size > 0) {
    bar.classList.add('show');
    document.getElementById('bulk-count').textContent = selectedItems.size;
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
  const ids = [...selectedItems];
  await supabaseClient.from('content_library').update({ status }).in('id', ids);
  selectedItems.clear();
  loadReviewItems();
  loadStats();
};

async function updateItemStatus(id, status) {
  await supabaseClient.from('content_library').update({ status }).eq('id', id);
  const el = document.getElementById(`ri-${id}`);
  if (el) el.style.opacity = '0.4';
  setTimeout(() => loadReviewItems(), 400);
  loadStats();
}

async function deleteItem(id) {
  if (!confirm('Permanently delete this item?')) return;
  await supabaseClient.from('content_library').delete().eq('id', id);
  loadReviewItems();
  loadStats();
}

window.showDetail = function(id) {
  const item = allReviewItems.find(i => i.id === id);
  if (!item) return;
  currentDetailItem = item;

  document.getElementById('modal-detail-body').innerHTML = `
    <div style="display:grid; grid-template-columns: ${item.image_url ? '1fr 1fr' : '1fr'}; gap:20px; margin-bottom:20px;">
      ${item.image_url ? `<div><img src="${item.image_url}" style="width:100%; border-radius:10px; max-height:280px; object-fit:cover;"></div>` : ''}
      <div>
        <div class="form-group">
          <label>Title</label>
          <input type="text" id="detail-title" value="${escHtml(item.title||'')}">
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="detail-category">
            ${['completed-jobs','marketing','testimonial','tips','team-culture','company','service','general'].map(c =>
              `<option value="${c}" ${item.category===c?'selected':''}>${c}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Tags (comma separated)</label>
          <input type="text" id="detail-tags" value="${(item.tags||[]).join(', ')}">
        </div>
      </div>
    </div>
    <div class="form-group">
      <label>Description / Content</label>
      <textarea id="detail-desc" rows="5">${escHtml(item.description||'')}</textarea>
    </div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn btn-primary" onclick="saveDetail()" style="flex:1">💾 Save Changes</button>
      <button class="btn btn-green" onclick="saveAndApprove()" style="flex:1">✅ Save & Approve</button>
      <button class="btn btn-grey" onclick="closeModal('modal-detail')" style="flex:1">Cancel</button>
    </div>
  `;
  document.getElementById('modal-detail').classList.add('show');
};

window.saveDetail = async function() {
  if (!currentDetailItem) return;
  const updates = {
    title: document.getElementById('detail-title').value,
    category: document.getElementById('detail-category').value,
    description: document.getElementById('detail-desc').value,
    tags: document.getElementById('detail-tags').value.split(',').map(t=>t.trim()).filter(Boolean)
  };
  await supabaseClient.from('content_library').update(updates).eq('id', currentDetailItem.id);
  closeModal('modal-detail');
  loadReviewItems();
};

window.saveAndApprove = async function() {
  if (!currentDetailItem) return;
  const updates = {
    title: document.getElementById('detail-title').value,
    category: document.getElementById('detail-category').value,
    description: document.getElementById('detail-desc').value,
    tags: document.getElementById('detail-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    status: 'approved'
  };
  await supabaseClient.from('content_library').update(updates).eq('id', currentDetailItem.id);
  closeModal('modal-detail');
  loadReviewItems();
  loadStats();
};

// ═══════════════════════════════════════════════
// TAB 3: PUBLISHING QUEUE
// ═══════════════════════════════════════════════

window.switchQueueTab = function(status) {
  currentQueueStatus = status;
  document.querySelectorAll('#tab-queue .stab').forEach((t,i) => {
    t.classList.toggle('active', ['pending_approval','approved','rejected'][i] === status);
  });
  loadQueueItems();
};

})();