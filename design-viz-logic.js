window.DV_LOGIC = {

  _supabase: null,
  _user: null,
  _userId: null,
  _projects: [],
  _renders: [],
  _currentProject: null,
  _uploadedPhotoUrl: null,
  _uploadedPhotoFile: null,
  _industries: [],
  _editingProjectId: null,

  RENDER_TYPES: {
    'building-construction': [
      { value: 'extension', label: 'Extension' },
      { value: 'facade', label: 'Facade' },
      { value: 'renovation', label: 'Renovation' },
      { value: 'structural', label: 'Structural Change' }
    ],
    'electrical-solar': [
      { value: 'lighting', label: 'Lighting Layout' },
      { value: 'fixtures', label: 'Fixture Placement' },
      { value: 'solar', label: 'Solar Panel Positioning' }
    ],
    'plumbing-gas': [
      { value: 'bathroom', label: 'Bathroom Layout' },
      { value: 'kitchen', label: 'Kitchen Layout' },
      { value: 'fixture-update', label: 'Fixture Update' }
    ],
    'hvac-refrigeration': [
      { value: 'unit-placement', label: 'Unit Placement' },
      { value: 'ducting', label: 'Ducting Layout' }
    ],
    'landscaping-outdoor': [
      { value: 'garden', label: 'Garden Design' },
      { value: 'deck', label: 'Decking' },
      { value: 'fence', label: 'Fencing' },
      { value: 'pool', label: 'Pool' },
      { value: 'outdoor-kitchen', label: 'Outdoor Kitchen' },
      { value: 'hardscape', label: 'Hardscaping' }
    ],
    'painting-finishing': [
      { value: 'room-recolour', label: 'Room Recolour' },
      { value: 'surface-finish', label: 'Surface Finish' },
      { value: 'material-change', label: 'Material Change' }
    ],
    'fabrication-manufacturing': [
      { value: 'metalwork', label: 'Custom Metalwork' },
      { value: 'product-viz', label: 'Product Visualisation' }
    ],
    'cleaning-maintenance': [
      { value: 'before-after', label: 'Before/After Cleaning' }
    ]
  },

  // ── INIT ────────��─────────────────────────────────────────────────────

  init: async function(supabase, user) {
    if (!supabase || !user) return;
    this._supabase = supabase;
    this._user = user;
    this._userId = user.id;

    await this._loadProfile();
    this._populateRenderTypes();
    this._bindEvents();
    await this._loadProjects();
    this._renderProjectList();
    this._updateStats();
  },

  _loadProfile: async function() {
    try {
      var res = await this._supabase
        .from('profiles')
        .select('industry, business_name')
        .eq('id', this._userId)
        .maybeSingle();
      if (res.data) {
        this._industries = Array.isArray(res.data.industry) ? res.data.industry : [];
        this._businessName = res.data.business_name || '';
      }
    } catch (e) {
      console.error('[DV] Profile load error:', e.message);
    }
  },

  _populateRenderTypes: function() {
    var select = document.getElementById('dv-render-type');
    if (!select) return;
    var self = this;
    var added = {};
    this._industries.forEach(function(ind) {
      var types = self.RENDER_TYPES[ind];
      if (!types) return;
      types.forEach(function(t) {
        if (added[t.value]) return;
        added[t.value] = true;
        var opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        select.appendChild(opt);
      });
    });
  },

  // ── EVENT BINDING ─────────────────────────────────────────────────────

  _bindEvents: function() {
    var self = this;

    // New project
    var newBtn = document.getElementById('dv-new-project-btn');
    if (newBtn) newBtn.addEventListener('click', function() { self._openProjectModal(); });

    // Modal actions
    var cancelBtn = document.getElementById('dv-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function() { self._closeProjectModal(); });
    var saveBtn = document.getElementById('dv-modal-save');
    if (saveBtn) saveBtn.addEventListener('click', function() { self._saveProject(); });

    // Modal overlay close
    var modalOverlay = document.getElementById('dv-project-modal');
    if (modalOverlay) modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) self._closeProjectModal();
    });

    // Back button
    var backBtn = document.getElementById('dv-back-btn');
    if (backBtn) backBtn.addEventListener('click', function() { self._showProjectList(); });

    // Edit button
    var editBtn = document.getElementById('dv-edit-btn');
    if (editBtn) editBtn.addEventListener('click', function() {
      if (self._currentProject) self._openProjectModal(self._currentProject);
    });

    // Status toggle
    var statusBtn = document.getElementById('dv-status-btn');
    if (statusBtn) statusBtn.addEventListener('click', function() { self._toggleProjectStatus(); });

    // Upload zone
    var zone = document.getElementById('dv-upload-zone');
    var fileInput = document.getElementById('dv-file-input');
    if (zone && fileInput) {
      zone.addEventListener('click', function(e) {
        if (e.target === fileInput) return;
        fileInput.click();
      });
      fileInput.addEventListener('click', function(e) { e.stopPropagation(); });
      zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
      zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('dragover');
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) self._handleFileSelect(files[0]);
      });
      fileInput.addEventListener('change', function() {
        if (fileInput.files && fileInput.files.length > 0) self._handleFileSelect(fileInput.files[0]);
      });
    }

    // Change photo
    var changeBtn = document.getElementById('dv-change-photo-btn');
    if (changeBtn) changeBtn.addEventListener('click', function() { self._resetUpload(); });

    // Generate
    var genBtn = document.getElementById('dv-generate-btn');
    if (genBtn) genBtn.addEventListener('click', function() { self._generateRender(); });

    // Refine
    var refineBtn = document.getElementById('dv-refine-btn');
    if (refineBtn) refineBtn.addEventListener('click', function() { self._refineRender(); });

    // Description input enables generate button
    var descInput = document.getElementById('dv-description');
    if (descInput) descInput.addEventListener('input', function() { self._updateGenerateBtn(); });

    // Lightbox
    var lightbox = document.getElementById('dv-lightbox');
    if (lightbox) lightbox.addEventListener('click', function() { lightbox.classList.remove('open'); });
  },

  // ── FILE UPLOAD ─────────���─────────────────────────────────────────────

  _handleFileSelect: function(file) {
    if (!file || !file.type.startsWith('image/')) {
      this._showError('Please select a valid image file (JPG or PNG).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this._showError('Photo must be under 10 MB.');
      return;
    }
    this._uploadedPhotoFile = file;
    var reader = new FileReader();
    var self = this;
    reader.onload = function(e) {
      var img = document.getElementById('dv-photo-img');
      if (img) img.src = e.target.result;
      document.getElementById('dv-upload-zone').style.display = 'none';
      document.getElementById('dv-photo-preview').style.display = '';
      self._updateGenerateBtn();
    };
    reader.readAsDataURL(file);
  },

  _resetUpload: function() {
    this._uploadedPhotoFile = null;
    this._uploadedPhotoUrl = null;
    document.getElementById('dv-upload-zone').style.display = '';
    document.getElementById('dv-photo-preview').style.display = 'none';
    var fileInput = document.getElementById('dv-file-input');
    if (fileInput) fileInput.value = '';
    this._updateGenerateBtn();
  },

  _uploadPhotoToStorage: async function() {
    if (this._uploadedPhotoUrl) return this._uploadedPhotoUrl;
    if (!this._uploadedPhotoFile) return null;

    var ext = this._uploadedPhotoFile.type.indexOf('png') !== -1 ? 'png' : 'jpg';
    var path = this._userId + '/dv-photos/' + Date.now() + '.' + ext;
    var arrayBuffer = await this._uploadedPhotoFile.arrayBuffer();

    var result = await this._supabase.storage
      .from('cl-assets')
      .upload(path, arrayBuffer, { contentType: this._uploadedPhotoFile.type, upsert: false });

    if (result.error) {
      throw new Error('Could not upload photo: ' + result.error.message);
    }

    var urlData = this._supabase.storage.from('cl-assets').getPublicUrl(path);
    this._uploadedPhotoUrl = urlData.data && urlData.data.publicUrl;
    return this._uploadedPhotoUrl;
  },

  _updateGenerateBtn: function() {
    var btn = document.getElementById('dv-generate-btn');
    var desc = document.getElementById('dv-description');
    if (btn) {
      btn.disabled = !(this._uploadedPhotoFile && desc && desc.value.trim().length > 5);
    }
  },

  // ── RENDER GENERATION ───────────────────��─────────────────────────────

  _generateRender: async function() {
    var btn = document.getElementById('dv-generate-btn');
    var msg = document.getElementById('dv-generating-msg');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
    if (msg) msg.style.display = 'inline';

    try {
      var photoUrl = await this._uploadPhotoToStorage();
      if (!photoUrl) throw new Error('Photo upload failed');

      var desc = document.getElementById('dv-description');
      var typeSelect = document.getElementById('dv-render-type');
      var description = desc ? desc.value.trim() : '';
      var renderType = typeSelect ? typeSelect.value : '';

      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) throw new Error('Session expired. Please refresh the page.');

      var res = await fetch('/api/design-visualiser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          photoUrl: photoUrl,
          description: description,
          renderType: renderType,
          projectId: this._currentProject ? this._currentProject.id : null,
          sourceContext: 'tool',
          industries: this._industries,
          businessName: this._businessName,
          mode: 'initial'
        })
      });

      var data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Render generation failed. Please try again.');
      }

      await this._loadRenders();
      this._renderGallery();
      this._updateStats();

      // Show refine section
      var refineSection = document.getElementById('dv-refine-section');
      if (refineSection) refineSection.style.display = '';

    } catch (e) {
      console.error('[DV] Generate error:', e.message);
      this._showError(e.message);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Generate Render'; }
    if (msg) msg.style.display = 'none';
    this._updateGenerateBtn();
  },

  _refineRender: async function() {
    var input = document.getElementById('dv-refine-input');
    var refinement = input ? input.value.trim() : '';
    if (!refinement) return;

    var latestRender = this._renders.length > 0 ? this._renders[0] : null;
    if (!latestRender) return;

    var btn = document.getElementById('dv-refine-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Refining...'; }

    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) throw new Error('Session expired. Please refresh the page.');

      var desc = document.getElementById('dv-description');
      var previousDescription = desc ? desc.value.trim() : '';

      var res = await fetch('/api/design-visualiser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          photoUrl: latestRender.render_url,
          description: refinement,
          renderType: latestRender.render_type || '',
          projectId: this._currentProject ? this._currentProject.id : null,
          sourceContext: 'tool',
          industries: this._industries,
          businessName: this._businessName,
          mode: 'refine',
          previousDescription: previousDescription
        })
      });

      var data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Refinement failed. Please try again.');
      }

      if (input) input.value = '';
      await this._loadRenders();
      this._renderGallery();
      this._updateStats();

    } catch (e) {
      console.error('[DV] Refine error:', e.message);
      this._showError(e.message);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Refine'; }
  },

  // ── SAVE TO CONTENT LIBRARY ────────────────���──────────────────────────

  _saveToContentLibrary: async function(render) {
    try {
      var sourceRef = 'dv-' + render.id;
      var contentText = 'Design render: ' + (render.prompt_used || '');
      var projectName = this._currentProject ? this._currentProject.project_name : '';

      await this._supabase.from('content_library').upsert({
        user_id: this._userId,
        source: 'tool',
        tool_source: 'design-viz',
        source_ref: sourceRef,
        status: 'approved',
        category: 'image',
        tool_tags: ['DV'],
        content_text: contentText,
        file_url: render.render_url,
        content_type: 'image',
        source_detail: {
          project_name: projectName,
          original_photo_url: render.original_photo_url,
          render_prompt: render.prompt_used,
          render_type: render.render_type,
          source_context: 'tool'
        },
        first_used_at: new Date().toISOString()
      }, { onConflict: 'source_ref', ignoreDuplicates: true });

      // Mark as final in dv_renders
      await this._supabase.from('dv_renders')
        .update({ is_final: true })
        .eq('id', render.id);

      render.is_final = true;
      this._renderGallery();

    } catch (e) {
      console.error('[DV] Save to CL error:', e.message);
      this._showError('Could not save to Content Library. Please try again.');
    }
  },

  // ── PROJECT CRUD ──────────────────────────────────────────────────────

  _loadProjects: async function() {
    try {
      var res = await this._supabase
        .from('dv_projects')
        .select('*, dv_renders(id)')
        .eq('user_id', this._userId)
        .order('updated_at', { ascending: false });

      if (res.error) {
        console.error('[DV] Load projects error:', res.error.message);
        this._projects = [];
        return;
      }
      this._projects = res.data || [];
    } catch (e) {
      console.error('[DV] Load projects exception:', e.message);
      this._projects = [];
    }
  },

  _loadRenders: async function() {
    if (!this._currentProject) { this._renders = []; return; }
    try {
      var res = await this._supabase
        .from('dv_renders')
        .select('*')
        .eq('project_id', this._currentProject.id)
        .order('created_at', { ascending: false });

      if (res.error) {
        console.error('[DV] Load renders error:', res.error.message);
        this._renders = [];
        return;
      }
      this._renders = res.data || [];
    } catch (e) {
      console.error('[DV] Load renders exception:', e.message);
      this._renders = [];
    }
  },

  _openProjectModal: function(project) {
    this._editingProjectId = project ? project.id : null;
    var title = document.getElementById('dv-modal-title');
    var saveBtn = document.getElementById('dv-modal-save');
    if (title) title.textContent = project ? 'Edit Project' : 'New Project';
    if (saveBtn) saveBtn.textContent = project ? 'Save Changes' : 'Create Project';

    document.getElementById('dv-modal-name').value = project ? (project.project_name || '') : '';
    document.getElementById('dv-modal-customer').value = project ? (project.customer_name || '') : '';
    document.getElementById('dv-modal-address').value = project ? (project.address || '') : '';
    document.getElementById('dv-modal-notes').value = project ? (project.notes || '') : '';

    document.getElementById('dv-project-modal').classList.add('open');
  },

  _closeProjectModal: function() {
    document.getElementById('dv-project-modal').classList.remove('open');
    this._editingProjectId = null;
  },

  _saveProject: async function() {
    var nameEl = document.getElementById('dv-modal-name');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      nameEl.classList.add('input-error');
      return;
    }
    nameEl.classList.remove('input-error');

    var payload = {
      project_name: name,
      customer_name: document.getElementById('dv-modal-customer').value.trim() || null,
      address: document.getElementById('dv-modal-address').value.trim() || null,
      notes: document.getElementById('dv-modal-notes').value.trim() || null,
      updated_at: new Date().toISOString()
    };

    try {
      if (this._editingProjectId) {
        var updateRes = await this._supabase
          .from('dv_projects')
          .update(payload)
          .eq('id', this._editingProjectId);
        if (updateRes.error) throw new Error(updateRes.error.message);

        if (this._currentProject && this._currentProject.id === this._editingProjectId) {
          Object.assign(this._currentProject, payload);
          this._renderProjectDetail();
        }
      } else {
        payload.user_id = this._userId;
        payload.status = 'active';
        var insertRes = await this._supabase
          .from('dv_projects')
          .insert(payload)
          .select()
          .single();
        if (insertRes.error) throw new Error(insertRes.error.message);

        this._openProject(insertRes.data);
      }

      this._closeProjectModal();
      await this._loadProjects();
      this._renderProjectList();
      this._updateStats();

    } catch (e) {
      console.error('[DV] Save project error:', e.message);
      this._showError('Could not save project. Please try again.');
    }
  },

  _toggleProjectStatus: async function() {
    if (!this._currentProject) return;
    var newStatus = this._currentProject.status === 'active' ? 'completed' : 'active';
    try {
      var res = await this._supabase
        .from('dv_projects')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', this._currentProject.id);
      if (res.error) throw new Error(res.error.message);

      this._currentProject.status = newStatus;
      this._renderProjectDetail();
      await this._loadProjects();
      this._renderProjectList();
      this._updateStats();
    } catch (e) {
      console.error('[DV] Status toggle error:', e.message);
      this._showError('Could not update project status.');
    }
  },

  // ── VIEWS ─────────────���────────────────���──────────────────────────��───

  _showProjectList: function() {
    this._currentProject = null;
    this._renders = [];
    this._resetUpload();
    document.getElementById('dv-projects-view').style.display = '';
    document.getElementById('dv-project-detail').style.display = 'none';
  },

  _openProject: async function(project) {
    this._currentProject = project;
    this._resetUpload();
    document.getElementById('dv-projects-view').style.display = 'none';
    document.getElementById('dv-project-detail').style.display = '';

    this._renderProjectDetail();
    await this._loadRenders();
    this._renderGallery();

    var refineSection = document.getElementById('dv-refine-section');
    if (refineSection) refineSection.style.display = this._renders.length > 0 ? '' : 'none';
  },

  // ── RENDERING ──────��──────────────────────────────────────────────────

  _updateStats: function() {
    var active = 0;
    var completed = 0;
    var totalRenders = 0;
    this._projects.forEach(function(p) {
      if (p.status === 'active') active++;
      else if (p.status === 'completed') completed++;
      totalRenders += Array.isArray(p.dv_renders) ? p.dv_renders.length : 0;
    });
    var el;
    el = document.getElementById('stat-active'); if (el) el.textContent = active;
    el = document.getElementById('stat-completed'); if (el) el.textContent = completed;
    el = document.getElementById('stat-renders'); if (el) el.textContent = totalRenders;
  },

  _renderProjectList: function() {
    var container = document.getElementById('dv-project-list');
    var empty = document.getElementById('dv-empty-projects');
    if (!container) return;

    if (this._projects.length === 0) {
      if (empty) empty.hidden = false;
      var existing = container.querySelectorAll('.dv-project-card');
      existing.forEach(function(el) { el.remove(); });
      return;
    }
    if (empty) empty.hidden = true;

    var self = this;
    var html = '';
    this._projects.forEach(function(p) {
      var renderCount = Array.isArray(p.dv_renders) ? p.dv_renders.length : 0;
      var statusClass = p.status === 'completed' ? 'badge-green' : 'badge-blue';
      var statusLabel = p.status === 'completed' ? 'Completed' : 'Active';
      var date = new Date(p.updated_at || p.created_at);
      var dateStr = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

      html += '<div class="item-card dv-project-card" data-id="' + p.id + '">'
        + '<div class="item-card-header">'
        + '<strong>' + escHtml(p.project_name) + '</strong>'
        + '<div class="item-card-btns">'
        + '<span class="badge ' + statusClass + '">' + statusLabel + '</span>'
        + '</div>'
        + '</div>'
        + '<div class="source-detail">'
        + '<div class="dv-project-meta">';
      if (p.customer_name) html += '<span>' + escHtml(p.customer_name) + '</span>';
      if (p.address) html += '<span class="text-muted">' + escHtml(p.address) + '</span>';
      html += '<span class="badge badge-grey">' + renderCount + ' render' + (renderCount !== 1 ? 's' : '') + '</span>'
        + '<span class="item-upload-date">' + dateStr + '</span>'
        + '</div>'
        + '</div>'
        + '</div>';
    });

    container.innerHTML = html + (empty ? empty.outerHTML : '');
    if (empty) {
      var newEmpty = document.getElementById('dv-empty-projects');
      if (newEmpty) newEmpty.hidden = true;
    }

    container.querySelectorAll('.dv-project-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var id = card.getAttribute('data-id');
        var project = self._projects.find(function(p) { return p.id === id; });
        if (project) self._openProject(project);
      });
    });
  },

  _renderProjectDetail: function() {
    var p = this._currentProject;
    if (!p) return;

    var titleEl = document.getElementById('dv-detail-title');
    if (titleEl) titleEl.textContent = p.project_name || '';

    var statusBadge = document.getElementById('dv-detail-status');
    if (statusBadge) {
      statusBadge.textContent = p.status === 'completed' ? 'Completed' : 'Active';
      statusBadge.className = 'badge ' + (p.status === 'completed' ? 'badge-green' : 'badge-blue');
    }

    var statusBtn = document.getElementById('dv-status-btn');
    if (statusBtn) {
      if (p.status === 'completed') {
        statusBtn.textContent = 'Reopen';
        statusBtn.classList.remove('review-approve-btn');
        statusBtn.classList.add('btn-outline');
      } else {
        statusBtn.textContent = 'Mark Complete';
        statusBtn.classList.remove('btn-outline');
        statusBtn.classList.add('review-approve-btn');
      }
    }

    var custEl = document.getElementById('dv-detail-customer');
    if (custEl) custEl.textContent = p.customer_name || '—';
    var addrEl = document.getElementById('dv-detail-address');
    if (addrEl) addrEl.textContent = p.address || '—';
    var notesEl = document.getElementById('dv-detail-notes');
    if (notesEl) notesEl.textContent = p.notes || '—';
  },

  _renderGallery: function() {
    var container = document.getElementById('dv-render-gallery');
    var empty = document.getElementById('dv-empty-renders');
    if (!container) return;

    if (this._renders.length === 0) {
      if (empty) empty.hidden = false;
      var existing = container.querySelectorAll('.dv-render-card');
      existing.forEach(function(el) { el.remove(); });
      return;
    }
    if (empty) empty.hidden = true;

    var self = this;
    var html = '';
    this._renders.forEach(function(r) {
      var date = new Date(r.created_at);
      var dateStr = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        + ' ' + date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });

      html += '<div class="dv-render-card" data-render-id="' + r.id + '">'
        + '<img src="' + escHtml(r.render_url) + '" alt="Design render" loading="lazy">'
        + '<div class="dv-render-meta">'
        + '<div class="dv-render-prompt">' + escHtml(r.prompt_used || '') + '</div>'
        + '<div class="dv-render-meta-row">'
        + '<span class="dv-render-date">' + dateStr + '</span>'
        + '<div class="action-row">';

      if (r.is_final) {
        html += '<span class="badge badge-green">Saved to Library</span>';
      } else {
        html += '<button class="btn-sm btn-outline dv-save-cl-btn" data-render-id="' + r.id + '">Save to Library</button>';
      }

      html += '</div></div></div></div>';
    });

    container.innerHTML = html + (empty ? '<div class="empty-state" id="dv-empty-renders" hidden style="grid-column:1/-1"><div class="empty-state-icon">🖼️</div><h3>No renders yet</h3><p>Upload a photo and describe your vision to generate your first render.</p></div>' : '');

    // Bind image click for lightbox
    container.querySelectorAll('.dv-render-card img').forEach(function(img) {
      img.addEventListener('click', function(e) {
        e.stopPropagation();
        var lightbox = document.getElementById('dv-lightbox');
        var lbImg = document.getElementById('dv-lightbox-img');
        if (lightbox && lbImg) {
          lbImg.src = img.src;
          lightbox.classList.add('open');
        }
      });
    });

    // Bind save to CL buttons
    container.querySelectorAll('.dv-save-cl-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var renderId = btn.getAttribute('data-render-id');
        var render = self._renders.find(function(r) { return r.id === renderId; });
        if (render) {
          btn.textContent = 'Saving...';
          btn.disabled = true;
          self._saveToContentLibrary(render);
        }
      });
    });
  },

  // ── ERROR DISPLAY ──────���──────────────────────────��───────────────────

  _showError: function(message) {
    var modal = document.getElementById('dv-error-msg');
    if (!modal) return;
    var textEl = modal.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = message;
    modal.classList.add('open');
    var okBtn = modal.querySelector('.save-msg-ok');
    if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
  }

};
