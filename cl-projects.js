window.CL_PROJECTS = {

  _supabase: null,
  _userId: null,
  _projects: [],
  _page: 0,
  _pageSize: 12,
  _filter: 'all',
  _search: '',
  _editingId: null,

  init: function(supabase) {
    this._supabase = supabase;
    var self = this;
    supabase.auth.getSession().then(function(result) {
      var session = result.data && result.data.session;
      if (!session) return;
      self._userId = session.user.id;
      self._render();
      self._load();
    });
  },

  _render: function() {
    var container = document.getElementById('cl-tab-projects');
    if (!container) return;
    container.innerHTML =
      '<div class="review-wrap">' +
        '<div class="review-filter-btns-row">' +
          '<input type="text" class="review-search-input" id="clp-search" placeholder="Search projects...">' +
          '<div id="clp-filters" class="review-pill-row" style="margin-left:12px;margin-bottom:0"></div>' +
          '<button class="btn-save" id="clp-add-btn" style="margin-left:auto">Add Project</button>' +
        '</div>' +
        '<div id="clp-list" class="review-list"></div>' +
        '<div id="clp-empty" class="list-empty" style="display:none">' +
          '<div class="list-empty-detail">No projects yet. Add a project or connect a job management system to sync automatically.</div>' +
        '</div>' +
        '<div id="clp-pagination" class="sm-pagination" style="display:none"></div>' +
      '</div>' +
      '<div id="clp-form" style="display:none"></div>';

    var self = this;
    document.getElementById('clp-search').addEventListener('input', function() {
      self._search = this.value.toLowerCase();
      self._page = 0;
      self._renderList();
    });
    document.getElementById('clp-add-btn').addEventListener('click', function() {
      self._editingId = null;
      self._showForm({});
    });
  },

  _load: async function() {
    var result = await this._supabase
      .from('cl_projects')
      .select('*')
      .eq('user_id', this._userId)
      .order('updated_at', { ascending: false });

    if (result.error) {
      console.error('[CL Projects] load error:', result.error.message);
      this._projects = [];
    } else {
      this._projects = result.data || [];
    }
    this._renderFilters();
    this._renderList();
  },

  _renderFilters: function() {
    var self = this;
    var container = document.getElementById('clp-filters');
    if (!container) return;

    var statuses = ['all', 'active', 'completed', 'archived'];
    var html = '';
    statuses.forEach(function(s) {
      var active = self._filter === s ? ' active' : '';
      var label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
      html += '<button class="filter-pill' + active + '" data-filter="' + s + '">' + label + '</button>';
    });
    container.innerHTML = html;
    container.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        self._filter = pill.dataset.filter;
        self._page = 0;
        self._renderFilters();
        self._renderList();
      });
    });
  },

  _renderList: function() {
    var self = this;
    var items = this._projects.slice();

    if (this._filter !== 'all') {
      items = items.filter(function(p) { return p.project_status === self._filter; });
    }
    if (this._search) {
      var q = this._search;
      items = items.filter(function(p) {
        return (p.project_name || '').toLowerCase().indexOf(q) !== -1 ||
          (p.customer_name || '').toLowerCase().indexOf(q) !== -1 ||
          (p.services_provided || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    var listEl = document.getElementById('clp-list');
    var emptyEl = document.getElementById('clp-empty');

    if (items.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
      document.getElementById('clp-pagination').style.display = 'none';
      return;
    }
    emptyEl.style.display = 'none';

    var start = this._page * this._pageSize;
    var page = items.slice(start, start + this._pageSize);

    var html = '';
    page.forEach(function(p) {
      var statusCls = p.project_status === 'active' ? 'badge-green' :
                      p.project_status === 'completed' ? 'badge-blue' : 'badge-grey';
      var statusLabel = (p.project_status || 'active').charAt(0).toUpperCase() + (p.project_status || 'active').slice(1);
      var sourceLabel = p.source_system ? p.source_system.charAt(0).toUpperCase() + p.source_system.slice(1) : 'Manual';
      var dateStr = p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-AU') : '';

      html += '<div class="item-card" style="cursor:pointer" data-projid="' + p.id + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:200px">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
              '<strong>' + window.escHtml(p.project_name || p.customer_name || 'Untitled') + '</strong>' +
              '<span class="badge ' + statusCls + '">' + statusLabel + '</span>' +
              '<span class="review-source-badge">' + window.escHtml(sourceLabel) + '</span>' +
            '</div>' +
            '<div style="font-size:var(--note-font-size);color:var(--text-muted)">';
      if (p.customer_name && p.project_name) {
        html += 'Customer: ' + window.escHtml(p.customer_name);
      }
      if (p.services_provided) {
        html += (p.customer_name && p.project_name ? ' &mdash; ' : '') + window.escHtml(p.services_provided);
      }
      html += '</div>';
      if (p.testimonial_text) {
        html += '<div style="font-size:var(--badge-font-size);color:var(--text-secondary);margin-top:4px;font-style:italic">&ldquo;' +
          window.escHtml(p.testimonial_text.substring(0, 100)) + (p.testimonial_text.length > 100 ? '...' : '') + '&rdquo;</div>';
      }
      html += '</div>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<span style="font-size:var(--badge-font-size);color:var(--text-muted)">' + dateStr + '</span>' +
            '<button class="btn-outline btn-sm" data-edit="' + p.id + '">Edit</button>' +
            '<button class="btn-dismiss btn-sm" data-delete="' + p.id + '">Delete</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-edit]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var proj = self._projects.find(function(p) { return p.id === btn.dataset.edit; });
        if (proj) { self._editingId = proj.id; self._showForm(proj); }
      });
    });
    listEl.querySelectorAll('[data-delete]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        self._deleteProject(btn.dataset.delete);
      });
    });

    this._renderPagination(items.length);
  },

  _renderPagination: function(total) {
    var self = this;
    var totalPages = Math.ceil(total / this._pageSize);
    var container = document.getElementById('clp-pagination');
    if (!container) return;
    if (totalPages <= 1) { container.style.display = 'none'; return; }
    container.style.display = '';

    var html = '<button class="btn-outline btn-sm" id="clp-prev"' + (this._page === 0 ? ' disabled' : '') + '>Previous</button>';
    html += '<select class="form-input" id="clp-page-jump" style="width:auto;padding:6px 10px;font-size:var(--badge-font-size)">';
    for (var i = 0; i < totalPages; i++) {
      html += '<option value="' + i + '"' + (i === this._page ? ' selected' : '') + '>Page ' + (i + 1) + '</option>';
    }
    html += '</select>';
    html += '<span class="sm-pagination-info">of ' + totalPages + '</span>';
    html += '<button class="btn-outline btn-sm" id="clp-next"' + (this._page >= totalPages - 1 ? ' disabled' : '') + '>Next</button>';
    container.innerHTML = html;

    document.getElementById('clp-prev').addEventListener('click', function() {
      if (self._page > 0) { self._page--; self._renderList(); }
    });
    document.getElementById('clp-next').addEventListener('click', function() {
      if (self._page < totalPages - 1) { self._page++; self._renderList(); }
    });
    document.getElementById('clp-page-jump').addEventListener('change', function() {
      self._page = parseInt(this.value, 10);
      self._renderList();
    });
  },

  _showForm: function(project) {
    var self = this;
    var formEl = document.getElementById('clp-form');
    var listWrap = formEl.previousElementSibling;
    listWrap.style.display = 'none';
    formEl.style.display = 'block';

    var isEdit = !!this._editingId;
    var title = isEdit ? 'Edit Project' : 'Add Project';
    var p = project || {};

    formEl.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">' +
        '<button class="btn-back" id="clp-form-back">Back</button>' +
        '<div style="font-family:var(--heading-font);font-size:var(--heading-lg-size);font-weight:var(--heading-lg-weight)">' + title + '</div>' +
      '</div>' +
      '<div class="profile-fields">' +
        '<div class="profile-field"><label class="profile-label">Project name</label>' +
          '<input type="text" class="profile-input" id="clp-f-project-name" value="' + window.escHtml(p.project_name || '') + '" placeholder="e.g. Smith Kitchen Renovation"></div>' +
        '<div class="profile-field"><label class="profile-label">Customer name</label>' +
          '<input type="text" class="profile-input" id="clp-f-customer-name" value="' + window.escHtml(p.customer_name || '') + '"></div>' +
        '<div class="profile-field"><label class="profile-label">Customer email</label>' +
          '<input type="text" class="profile-input" id="clp-f-customer-email" value="' + window.escHtml(p.customer_email || '') + '"></div>' +
        '<div class="profile-field"><label class="profile-label">Customer phone</label>' +
          '<input type="text" class="profile-input" id="clp-f-customer-phone" value="' + window.escHtml(p.customer_phone || '') + '"></div>' +
        '<div class="profile-field"><label class="profile-label">Customer ABN</label>' +
          '<input type="text" class="profile-input" id="clp-f-customer-abn" value="' + window.escHtml(p.customer_abn || '') + '"></div>' +
        '<div class="profile-field"><label class="profile-label">Customer website</label>' +
          '<input type="text" class="profile-input" id="clp-f-customer-website" value="' + window.escHtml(p.customer_website || '') + '"></div>' +
        '<div class="profile-field-full"><label class="profile-label">Services provided</label>' +
          '<input type="text" class="profile-input" id="clp-f-services" value="' + window.escHtml(p.services_provided || '') + '" placeholder="What you did for them"></div>' +
        '<div class="profile-field"><label class="profile-label">Project status</label>' +
          '<select class="profile-input" id="clp-f-status">' +
            '<option value="active"' + (p.project_status === 'active' ? ' selected' : '') + '>Active</option>' +
            '<option value="completed"' + (p.project_status === 'completed' || !p.project_status ? ' selected' : '') + '>Completed</option>' +
            '<option value="archived"' + (p.project_status === 'archived' ? ' selected' : '') + '>Archived</option>' +
          '</select></div>' +
        '<div class="profile-field"><label class="profile-label">Project value</label>' +
          '<input type="text" class="profile-input" id="clp-f-value" value="' + window.escHtml(p.project_value || '') + '" placeholder="$"></div>' +
        '<div class="profile-field"><label class="profile-label">Completed date</label>' +
          '<input type="date" class="profile-input" id="clp-f-completed" value="' + window.escHtml(p.completed_at ? p.completed_at.substring(0, 10) : '') + '"></div>' +
        '<div class="profile-field"><label class="profile-label">Logo permission <span class="profile-optional">(optional)</span></label>' +
          '<label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-bottom:0">' +
            '<input type="checkbox" id="clp-f-logo-permission"' + (p.logo_permission ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--blue)">' +
            'I have permission to use this customer\'s logo</label></div>' +
        '<div class="profile-field-full"><label class="profile-label">Testimonial</label>' +
          '<textarea class="profile-textarea" id="clp-f-testimonial" rows="3" placeholder="Customer testimonial text (if available)">' + window.escHtml(p.testimonial_text || '') + '</textarea></div>' +
        '<div class="profile-field-full"><label class="profile-label">Notes <span class="profile-optional">(internal)</span></label>' +
          '<textarea class="profile-textarea" id="clp-f-notes" rows="2">' + window.escHtml(p.notes || '') + '</textarea></div>' +
      '</div>' +
      '<div class="profile-save-row">' +
        '<button class="btn-save" id="clp-f-save">' + (isEdit ? 'Save Changes' : 'Add Project') + '</button>' +
        '<button class="btn-outline" id="clp-f-cancel">Cancel</button>' +
      '</div>';

    document.getElementById('clp-form-back').addEventListener('click', function() { self._hideForm(); });
    document.getElementById('clp-f-cancel').addEventListener('click', function() { self._hideForm(); });
    document.getElementById('clp-f-save').addEventListener('click', function() { self._saveForm(); });
  },

  _hideForm: function() {
    var formEl = document.getElementById('clp-form');
    formEl.style.display = 'none';
    formEl.previousElementSibling.style.display = '';
    this._editingId = null;
  },

  _saveForm: async function() {
    var projectName = (document.getElementById('clp-f-project-name').value || '').trim();
    var customerName = (document.getElementById('clp-f-customer-name').value || '').trim();
    if (!projectName && !customerName) {
      window.showModalError('Project name or customer name is required.', 'prof-save-msg');
      return;
    }

    var record = {
      project_name: projectName || null,
      customer_name: customerName || null,
      customer_email: (document.getElementById('clp-f-customer-email').value || '').trim() || null,
      customer_phone: (document.getElementById('clp-f-customer-phone').value || '').trim() || null,
      customer_abn: (document.getElementById('clp-f-customer-abn').value || '').trim() || null,
      customer_website: (document.getElementById('clp-f-customer-website').value || '').trim() || null,
      services_provided: (document.getElementById('clp-f-services').value || '').trim() || null,
      project_status: document.getElementById('clp-f-status').value || 'completed',
      project_value: (document.getElementById('clp-f-value').value || '').trim() || null,
      completed_at: document.getElementById('clp-f-completed').value || null,
      logo_permission: document.getElementById('clp-f-logo-permission').checked,
      testimonial_text: (document.getElementById('clp-f-testimonial').value || '').trim() || null,
      notes: (document.getElementById('clp-f-notes').value || '').trim() || null,
      updated_at: new Date().toISOString()
    };

    if (this._editingId) {
      var updResult = await this._supabase
        .from('cl_projects')
        .update(record)
        .eq('id', this._editingId)
        .eq('user_id', this._userId);
      if (updResult.error) {
        window.showModalError('Could not update project. ' + (updResult.error.message || ''), 'prof-save-msg');
        return;
      }
    } else {
      record.user_id = this._userId;
      record.source_system = 'manual';
      record.created_at = new Date().toISOString();
      var insResult = await this._supabase.from('cl_projects').insert(record);
      if (insResult.error) {
        window.showModalError('Could not add project. ' + (insResult.error.message || ''), 'prof-save-msg');
        return;
      }
    }

    this._hideForm();
    await this._load();
  },

  _deleteProject: function(projectId) {
    var self = this;
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
    self._supabase.from('cl_projects').delete().eq('id', projectId).eq('user_id', self._userId).then(function(result) {
      if (result.error) {
        window.showModalError('Could not delete project.', 'prof-save-msg');
        return;
      }
      self._load();
    });
  }
};
