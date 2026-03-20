// cl-upload.js — Upload & Import tab logic
// Part of Content Library split architecture
// Rebuilt per CL New Features Spec v1.2 Section 5

window.CL_UPLOAD = {

  _supabase: null,

  init: function(supabase) {
    this._supabase = supabase;
    this._render();
    this._bindEvents();
    this._loadConnectionStatus();
  },

  // ── RENDER ────────────────────────────────────────────────────────────────────────────

  _render: function() {
    var container = document.getElementById('cl-tab-upload');
    if (!container) return;
    container.innerHTML = [
      '<div class="upload-tab-inner">',

      '<!-- PRIMARY UPLOAD BUTTONS -->',
      '<div class="upload-primary-actions">',
        '<button id="cl-photo-btn" class="upload-primary-btn">',
          '<span class="upload-btn-icon">📷</span>',
          '<span class="upload-btn-label">Take Photo / Add Photo</span>',
          '<span class="upload-btn-sub">Tap to add a photo from your device or camera</span>',
        '</button>',
        '<div class="upload-primary-btn upload-drop-zone" id="cl-doc-drop">',
          '<span class="upload-btn-icon">📄</span>',
          '<span class="upload-btn-label">Upload Document or File</span>',
          '<span class="upload-btn-sub">PDF, Word, PPT, Excel, images — drag and drop or browse</span>',
          '<button class="btn-browse" id="cl-doc-browse-btn">Browse Files</button>',
        '</div>',
      '</div>',

      '<!-- HIDDEN FILE INPUTS -->',
      '<input type="file" id="cl-photo-input" accept="image/*" capture="environment" style="display:none" multiple>',
      '<input type="file" id="cl-doc-input" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*" style="display:none" multiple>',

      '<!-- OFFLINE BANNER -->',
      '<div id="cl-offline-banner" class="offline-banner" style="display:none">',
        '<span>📶 You appear to be offline. Files will be queued and uploaded when you reconnect.</span>',
        '<button class="btn-dismiss" id="cl-offline-dismiss">✕</button>',
      '</div>',

      '<!-- UPLOAD CONFIRMATION -->',
      '<div id="cl-upload-confirm" class="upload-confirm" style="display:none">',
        '<span id="cl-upload-confirm-msg"></span>',
        '<a href="#" id="cl-goto-review" class="btn-link">Go to Review tab →</a>',
      '</div>',

      '<!-- IMPORT FROM WEBSITE -->',
      '<div class="upload-section">',
        '<div class="upload-section-title">Import from Website</div>',
        '<div class="website-import-row">',
          '<input type="url" id="website-url-input" class="input-url" placeholder="https://yourwebsite.com.au" />',
          '<button id="website-scan-btn" class="btn-primary">Scan Website</button>',
        '</div>',
        '<div id="website-scan-status" class="scan-status" style="display:none"></div>',
      '</div>',

      '<!-- SOURCES SECTION -->',
      '<div class="upload-section">',
        '<div class="upload-section-title">Sources</div>',
        '<div class="sources-tiles">',

          '<!-- Business Email tile -->',
          '<div id="email-source-tile" class="source-tile">',
            '<div class="source-tile-icon">📧</div>',
            '<div class="source-tile-body">',
              '<div class="source-tile-name">Business Email</div>',
              '<div class="source-tile-desc">Scans your business inbox for supplier updates, industry news and business content.</div>',
            '</div>',
            '<div class="source-tile-right">',
              '<span id="email-status-badge" class="status-badge status-checking">Checking...</span>',
              '<div id="email-tile-action" class="source-tile-action"></div>',
            '</div>',
          '</div>',

          '<!-- Google Drive tile -->',
          '<div id="gdrive-source-tile" class="source-tile">',
            '<div class="source-tile-icon">📂</div>',
            '<div class="source-tile-body">',
              '<div class="source-tile-name">Google Drive</div>',
              '<div class="source-tile-desc">Imports photos and documents from your Drive folders.</div>',
            '</div>',
            '<div class="source-tile-right">',
              '<span id="gdrive-status-badge" class="status-badge status-checking">Checking...</span>',
              '<div id="gdrive-tile-action" class="source-tile-action"></div>',
            '</div>',
          '</div>',

          '<!-- Website tile -->',
          '<div id="website-source-tile" class="source-tile">',
            '<div class="source-tile-icon">🌐</div>',
            '<div class="source-tile-body">',
              '<div class="source-tile-name">Website</div>',
              '<div class="source-tile-desc">Scans your website pages for service descriptions, team info and other business content.</div>',
            '</div>',
            '<div class="source-tile-right">',
              '<span id="website-status-badge" class="status-badge status-checking">Checking...</span>',
              '<div id="website-tile-action" class="source-tile-action"></div>',
            '</div>',
          '</div>',

        '</div>',
      '</div>',

      '</div>'
    ].join('\n');
  },

  // ── BIND EVENTS ───────────────────────────────────────────────────────────────────────

  _bindEvents: function() {
    var self = this;

    // Photo button
    var photoBtn = document.getElementById('cl-photo-btn');
    var photoInput = document.getElementById('cl-photo-input');
    if (photoBtn && photoInput) {
      photoBtn.addEventListener('click', function() { photoInput.click(); });
      photoInput.addEventListener('change', function(e) {
        var files = Array.from(e.target.files || []);
        if (files.length) self._handlePhotoUpload(files);
        photoInput.value = '';
      });
    }

    // Document browse button
    var docBrowseBtn = document.getElementById('cl-doc-browse-btn');
    var docInput = document.getElementById('cl-doc-input');
    if (docBrowseBtn && docInput) {
      docBrowseBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        docInput.click();
      });
      docInput.addEventListener('change', function(e) {
        var files = Array.from(e.target.files || []);
        if (files.length) self._handleDocUpload(files);
        docInput.value = '';
      });
    }

    // Drag and drop on doc zone
    var dropZone = document.getElementById('cl-doc-drop');
    if (dropZone) {
      dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', function() {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var files = Array.from(e.dataTransfer.files || []);
        if (files.length) self._handleDocUpload(files);
      });
    }

    // Offline banner dismiss
    var dismissBtn = document.getElementById('cl-offline-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function() {
        var banner = document.getElementById('cl-offline-banner');
        if (banner) banner.style.display = 'none';
      });
    }

    // Go to Review tab link
    var reviewLink = document.getElementById('cl-goto-review');
    if (reviewLink) {
      reviewLink.addEventListener('click', function(e) {
        e.preventDefault();
        if (typeof window.switchPTab === 'function') window.switchPTab('review');
      });
    }

    // Website scan
    var scanBtn = document.getElementById('website-scan-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', function() { self._handleWebsiteScan(); });
    }

    // Offline detection
    if (!navigator.onLine) {
      var banner = document.getElementById('cl-offline-banner');
      if (banner) banner.style.display = 'flex';
    }
    window.addEventListener('offline', function() {
      var banner = document.getElementById('cl-offline-banner');
      if (banner) banner.style.display = 'flex';
    });
    window.addEventListener('online', function() {
      var banner = document.getElementById('cl-offline-banner');
      if (banner) banner.style.display = 'none';
    });
  },

  // ── CONNECTION STATUS ────────────────────────────────────────────────────────────────────

  _loadConnectionStatus: async function() {
    var supabase = this._supabase;
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) return;

      var resp = await supabase
        .from('profiles')
        .select('gdrive_connected, business_email_gmail, business_email_outlook, website_urls')
        .eq('user_id', user.id)
        .single();

      var profile = resp.data || {};
      var gdriveConnected = !!profile.gdrive_connected;
      var emailConnected = !!(profile.business_email_gmail || profile.business_email_outlook);
      var websiteConfigured = !!(profile.website_urls && profile.website_urls.length > 0);

      this._setTileStatus('email', emailConnected);
      this._setTileStatus('gdrive', gdriveConnected);
      this._setTileStatus('website', websiteConfigured);
    } catch (err) {
      this._setTileStatus('email', false);
      this._setTileStatus('gdrive', false);
      this._setTileStatus('website', false);
    }
  },

  _setTileStatus: function(source, connected) {
    var self = this;
    var badge = document.getElementById(source + '-status-badge');
    var actionDiv = document.getElementById(source + '-tile-action');
    if (!badge || !actionDiv) return;

    if (connected) {
      badge.className = 'status-badge status-connected';
      badge.textContent = 'Connected';
      var scanBtn = document.createElement('button');
      scanBtn.className = 'btn-primary btn-sm';
      scanBtn.textContent = 'Scan Now';
      scanBtn.addEventListener('click', function() { self._handleScanNow(source, scanBtn); });
      actionDiv.innerHTML = '';
      actionDiv.appendChild(scanBtn);
    } else {
      badge.className = 'status-badge status-disconnected';
      badge.textContent = 'Not connected';
      actionDiv.innerHTML = '<a href="cl-settings.html" class="btn-settings-link">Connect in CL Settings →</a>';
    }
  },

  // ── SCAN NOW ─────────────────────────────────────────────────────────────────────────────

  _handleScanNow: function(source, btn) {
    var original = btn.textContent;
    btn.textContent = 'Scanning… check Review tab shortly';
    btn.disabled = true;
    setTimeout(function() {
      btn.textContent = original;
      btn.disabled = false;
    }, 4000);
  },

  // ── WEBSITE SCAN ───────────────────────────────────────────────────────────────────────────

  _handleWebsiteScan: async function() {
    var urlInput = document.getElementById('website-url-input');
    var statusDiv = document.getElementById('website-scan-status');
    if (!urlInput || !statusDiv) return;

    var url = (urlInput.value || '').trim();
    if (!url) {
      statusDiv.style.display = 'block';
      statusDiv.textContent = 'Please enter a website URL.';
      statusDiv.className = 'scan-status scan-error';
      return;
    }

    statusDiv.style.display = 'block';
    statusDiv.textContent = 'Scanning website… this may take a moment.';
    statusDiv.className = 'scan-status scan-info';

    try {
      var supabase = this._supabase;
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) throw new Error('Not authenticated');

      var resp = await fetch('/api/process-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'website',
          url: url,
          user_id: user.id
        })
      });

      if (!resp.ok) throw new Error('Scan request failed');

      statusDiv.textContent = 'Website scan started. Items will appear in the Review tab shortly.';
      statusDiv.className = 'scan-status scan-success';
      urlInput.value = '';
    } catch (err) {
      statusDiv.textContent = 'Something went wrong with the scan. Please try again.';
      statusDiv.className = 'scan-status scan-error';
    }
  },

  // ── PHOTO UPLOAD ───────────────────────────────────────────────────────────────────────────

  _handlePhotoUpload: async function(files) {
    var supabase = this._supabase;
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) return;

      var count = 0;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var err = await supabase.from('content_library').insert({
          user_id: user.id,
          title: file.name.replace(/\.[^.]+$/, ''),
          body: '',
          type: 'photo',
          source: 'photo',
          status: 'pending',
          tool_tags: []
        }).then(function(r) { return r.error; });
        if (!err) count++;
      }
      if (count > 0) this._showUploadConfirmation(count);
    } catch (err) {
      console.error('Photo upload error:', err);
    }
  },

  // ── DOCUMENT UPLOAD ──────────────────────────────────────────────────────────────────────────

  _handleDocUpload: async function(files) {
    var supabase = this._supabase;
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) return;

      var count = 0;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var err = await supabase.from('content_library').insert({
          user_id: user.id,
          title: file.name.replace(/\.[^.]+$/, ''),
          body: '',
          type: 'document',
          source: 'document',
          status: 'pending',
          tool_tags: []
        }).then(function(r) { return r.error; });
        if (!err) count++;
      }
      if (count > 0) this._showUploadConfirmation(count);
    } catch (err) {
      console.error('Document upload error:', err);
    }
  },

  // ── UPLOAD CONFIRMATION ───────────────────────────────────────────────────────────────────────

  _showUploadConfirmation: function(count) {
    var confirmDiv = document.getElementById('cl-upload-confirm');
    var msgSpan = document.getElementById('cl-upload-confirm-msg');
    if (!confirmDiv || !msgSpan) return;
    msgSpan.textContent = count + (count === 1 ? ' item' : ' items') + ' added to Review. ';
    confirmDiv.style.display = 'flex';
    setTimeout(function() { confirmDiv.style.display = 'none'; }, 8000);
  }

};
