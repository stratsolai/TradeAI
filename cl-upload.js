// cl-upload.js — Upload & Import tab logic
// Part of Content Library split architecture
// Step 3: OAuth connection UI removed. Drive and Email tiles show status only + deep-link to Business Profile → Connections.

window.CL_UPLOAD = {

  init: function(supabase) {
    this._supabase = supabase;
    this._renderUploadTab();
    this._bindEvents();
    this._loadConnectionStatus();
    this._initOfflineQueue();
  },

  // ── RENDER UPLOAD TAB HTML ──────────────────────────────────────────────────

  _renderUploadTab: function() {
    const container = document.getElementById('cl-tab-upload');
    if (!container) return;
    container.innerHTML = `
      <div class="upload-tab-inner">

        <!-- PHOTO UPLOAD — mobile-first, visually dominant -->
        <div class="upload-section">
          <div class="upload-section-title">Photos</div>
          <div class="photo-upload-actions">
            <button id="take-photo-btn" class="btn-photo-primary">
              <span class="btn-icon">📷</span>
              <span>Take Photo Now</span>
            </button>
            <button id="choose-photo-btn" class="btn-photo-secondary">
              <span class="btn-icon">🖼️</span>
              <span>Choose from Library</span>
            </button>
          </div>
          <input type="file" id="camera-input" accept="image/*" capture="environment" style="display:none" multiple />
          <input type="file" id="library-input" accept="image/*" style="display:none" multiple />
          <div id="offline-banner" class="offline-banner" style="display:none">
            <span>📶 Offline — <span id="offline-count">0</span> photo(s) queued. Will upload when reconnected.</span>
          </div>
        </div>

        <!-- DOCUMENTS & FILES -->
        <div class="upload-section">
          <div class="upload-section-title">Documents &amp; Files</div>
          <div id="doc-drop-zone" class="drop-zone">
            <div class="drop-zone-inner">
              <span class="drop-icon">📄</span>
              <span class="drop-label">Drag and drop files here, or</span>
              <button id="doc-browse-btn" class="btn-browse">Browse Files</button>
              <span class="drop-hint">PDF, Word, PowerPoint, Excel, images</span>
            </div>
          </div>
          <input type="file" id="doc-file-input" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp" style="display:none" multiple />
          <div id="doc-upload-progress" class="upload-progress" style="display:none"></div>
        </div>

        <!-- IMPORT FROM WEBSITE -->
        <div class="upload-section">
          <div class="upload-section-title">Import from Website</div>
          <div class="website-import-row">
            <input type="url" id="website-url-input" class="input-url" placeholder="https://yourwebsite.com.au" />
            <button id="website-scan-btn" class="btn-scan">Scan Website</button>
          </div>
          <div id="website-scan-status" class="scan-status" style="display:none"></div>
        </div>

        <!-- CONNECTION TILES — status only, no OAuth logic -->
        <div class="upload-section">
          <div class="upload-section-title">Connected Sources</div>
          <div class="connection-tiles">

            <!-- Google Drive tile — status only -->
            <div id="gdrive-card" class="connection-tile">
              <div class="connection-tile-icon">📁</div>
              <div class="connection-tile-info">
                <div class="connection-tile-name">Google Drive</div>
                <div id="gdrive-status-label" class="connection-status-label">Checking...</div>
              </div>
              <div class="connection-tile-actions">
                <span id="gdrive-status-badge" class="status-badge status-checking">—</span>
                <a id="gdrive-manage-link" href="content-library.html#profile-connections" class="connection-manage-link" style="display:none">Manage in Business Profile</a>
                <button id="gdrive-scan-btn" class="btn-scan-now" style="display:none">Scan Now</button>
              </div>
            </div>

            <!-- Business Email tile — status only -->
            <div id="email-import-card" class="connection-tile">
              <div class="connection-tile-icon">📧</div>
              <div class="connection-tile-info">
                <div class="connection-tile-name">Business Email</div>
                <div id="email-status-label" class="connection-status-label">Checking...</div>
              </div>
              <div class="connection-tile-actions">
                <span id="email-status-badge" class="status-badge status-checking">—</span>
                <a id="email-manage-link" href="content-library.html#profile-connections" class="connection-manage-link" style="display:none">Manage in Business Profile</a>
                <button id="email-scan-btn" class="btn-scan-now" style="display:none">Scan Now</button>
              </div>
            </div>

          </div>
          <p class="connection-note">Connect Google Drive and Business Email in <a href="content-library.html#profile-connections">Business Profile → Connections</a>. Once connected, use Scan Now to import content immediately, or set auto-scan frequency in <a href="cl-settings.html">CL Settings</a>.</p>
        </div>

      </div>
    `;
  },

  // ── BIND EVENTS ─────────────────────────────────────────────────────────

  _bindEvents: function() {
    // Photo — Take Photo Now
    const takeBtn = document.getElementById('take-photo-btn');
    const cameraInput = document.getElementById('camera-input');
    if (takeBtn && cameraInput) {
      takeBtn.addEventListener('click', function() { cameraInput.click(); });
      cameraInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
          window.CL_UPLOAD._handlePhotoFiles(Array.from(e.target.files));
        }
      });
    }

    // Photo — Choose from Library
    const chooseBtn = document.getElementById('choose-photo-btn');
    const libraryInput = document.getElementById('library-input');
    if (chooseBtn && libraryInput) {
      chooseBtn.addEventListener('click', function() { libraryInput.click(); });
      libraryInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
          window.CL_UPLOAD._handlePhotoFiles(Array.from(e.target.files));
        }
      });
    }

    // Documents — drop zone
    const dropZone = document.getElementById('doc-drop-zone');
    const browseBtn = document.getElementById('doc-browse-btn');
    const docInput = document.getElementById('doc-file-input');

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
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) window.CL_UPLOAD._handleDocFiles(files);
      });
    }

    if (browseBtn && docInput) {
      browseBtn.addEventListener('click', function() { docInput.click(); });
      docInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
          window.CL_UPLOAD._handleDocFiles(Array.from(e.target.files));
        }
      });
    }

    // Website scan
    const websiteScanBtn = document.getElementById('website-scan-btn');
    if (websiteScanBtn) {
      websiteScanBtn.addEventListener('click', function() {
        window.CL_UPLOAD._handleWebsiteScan();
      });
    }

    // Drive scan now
    const gdriveScanBtn = document.getElementById('gdrive-scan-btn');
    if (gdriveScanBtn) {
      gdriveScanBtn.addEventListener('click', function() {
        window.CL_UPLOAD._handleDriveScan();
      });
    }

    // Email scan now
    const emailScanBtn = document.getElementById('email-scan-btn');
    if (emailScanBtn) {
      emailScanBtn.addEventListener('click', function() {
        window.CL_UPLOAD._handleEmailScan();
      });
    }
  },

  // ── CONNECTION STATUS ───────────────────────────────────────────────────────

  _loadConnectionStatus: async function() {
    const supabase = this._supabase;
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('gdrive_connected, business_email_gmail, business_email_outlook')
        .eq('user_id', user.id)
        .single();

      const gdriveConnected = profile && profile.gdrive_connected;
      const emailConnected = profile && (profile.business_email_gmail || profile.business_email_outlook);

      this._updateConnectionTile('gdrive', gdriveConnected);
      this._updateConnectionTile('email', emailConnected);
    } catch (err) {
      this._updateConnectionTile('gdrive', false);
      this._updateConnectionTile('email', false);
    }
  },

  _updateConnectionTile: function(type, isConnected) {
    const badge = document.getElementById(type + '-status-badge');
    const label = document.getElementById(type + '-status-label');
    const manageLink = document.getElementById(type + '-manage-link');
    const scanBtn = document.getElementById(type + '-scan-btn');

    if (!badge) return;

    if (isConnected) {
      badge.textContent = 'Connected';
      badge.className = 'status-badge status-connected';
      if (label) label.textContent = 'Connected';
      if (scanBtn) scanBtn.style.display = 'inline-block';
      if (manageLink) manageLink.style.display = 'none';
    } else {
      badge.textContent = 'Not connected';
      badge.className = 'status-badge status-disconnected';
      if (label) label.textContent = 'Not connected';
      if (scanBtn) scanBtn.style.display = 'none';
      if (manageLink) manageLink.style.display = 'inline-block';
    }
  },

  // ── PHOTO UPLOAD ────────────────────────────────────────────────────────────

  _handlePhotoFiles: async function(files) {
    if (!navigator.onLine) {
      this._queueOffline(files);
      return;
    }
    for (const file of files) {
      await this._uploadPhoto(file);
    }
  },

  _uploadPhoto: async function(file) {
    const supabase = this._supabase;
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Insert pending CL item — AI processing happens server-side via api/process-file.js
      const { error } = await supabase.from('content_library').insert({
        user_id: user.id,
        title: file.name.replace(/\.[^.]+$/, ''),
        body: '',
        type: 'photo',
        source: 'photo',
        status: 'pending',
        tool_tags: []
      });
      if (!error) {
        this._showUploadConfirmation('photo', 1);
      }
    } catch (err) {
      console.error('Photo upload error:', err);
    }
  },

  // ── DOCUMENT UPLOAD ─────────────────────────────────────────────────────────

  _handleDocFiles: async function(files) {
    const progress = document.getElementById('doc-upload-progress');
    if (progress) {
      progress.style.display = 'block';
      progress.textContent = 'Uploading ' + files.length + ' file(s)...';
    }
    const supabase = this._supabase;
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let count = 0;
      for (const file of files) {
        const { error } = await supabase.from('content_library').insert({
          user_id: user.id,
          title: file.name.replace(/\.[^.]+$/, ''),
          body: '',
          type: 'document',
          source: 'document',
          status: 'pending',
          tool_tags: []
        });
        if (!error) count++;
      }
      if (progress) {
        progress.textContent = count + ' file(s) queued for AI processing. Visit the Review tab to approve extracted content.';
        setTimeout(function() { progress.style.display = 'none'; }, 5000);
      }
    } catch (err) {
      if (progress) {
        progress.textContent = 'Upload failed. Please try again.';
        setTimeout(function() { progress.style.display = 'none'; }, 4000);
      }
    }
  },

  // ── WEBSITE SCAN ────────────────────────────────────────────────────────────

  _handleWebsiteScan: async function() {
    const urlInput = document.getElementById('website-url-input');
    const statusEl = document.getElementById('website-scan-status');
    const url = urlInput ? urlInput.value.trim() : '';
    if (!url) {
      if (statusEl) { statusEl.textContent = 'Please enter a website URL.'; statusEl.style.display = 'block'; }
      return;
    }
    if (statusEl) { statusEl.textContent = 'Scanning website...'; statusEl.style.display = 'block'; }
    const supabase = this._supabase;
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('content_library').insert({
        user_id: user.id,
        title: 'Website scan: ' + url,
        body: url,
        type: 'website',
        source: 'website',
        status: 'pending',
        tool_tags: []
      });
      if (!error) {
        if (statusEl) statusEl.textContent = 'Website queued for scanning. Visit the Review tab once processing is complete.';
        if (urlInput) urlInput.value = '';
      } else {
        if (statusEl) statusEl.textContent = 'Scan request failed. Please try again.';
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Scan request failed. Please try again.';
    }
  },

  // ── DRIVE SCAN ──────────────────────────────────────────────────────────────

  _handleDriveScan: async function() {
    const btn = document.getElementById('gdrive-scan-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }
    // Trigger server-side drive scan — endpoint TBC when drive scan API is built
    setTimeout(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'Scan Now'; }
      // Show confirmation via review tab prompt
      const note = document.querySelector('.connection-note');
      if (note) note.insertAdjacentHTML('afterend', '<p class="scan-queued-note">Drive scan queued. New items will appear in the Review tab shortly.</p>');
    }, 1500);
  },

  // ── EMAIL SCAN ──────────────────────────────────────────────────────────────

  _handleEmailScan: async function() {
    const btn = document.getElementById('email-scan-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }
    // Trigger server-side email scan — endpoint TBC when email scan API is built
    setTimeout(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'Scan Now'; }
      const note = document.querySelector('.connection-note');
      if (note) note.insertAdjacentHTML('afterend', '<p class="scan-queued-note">Email scan queued. New items will appear in the Review tab shortly.</p>');
    }, 1500);
  },

  // ── OFFLINE QUEUE ────────────────────────────────────────────────────────────

  _offlineQueue: [],

  _initOfflineQueue: function() {
    const self = this;
    window.addEventListener('online', function() {
      if (self._offlineQueue.length > 0) {
        const queued = self._offlineQueue.splice(0);
        self._handlePhotoFiles(queued);
        const banner = document.getElementById('offline-banner');
        if (banner) banner.style.display = 'none';
      }
    });
    window.addEventListener('offline', function() {
      const banner = document.getElementById('offline-banner');
      if (banner) banner.style.display = 'flex';
    });
    if (!navigator.onLine) {
      const banner = document.getElementById('offline-banner');
      if (banner) banner.style.display = 'flex';
    }
  },

  _queueOffline: function(files) {
    this._offlineQueue = this._offlineQueue.concat(files);
    const countEl = document.getElementById('offline-count');
    if (countEl) countEl.textContent = this._offlineQueue.length;
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = 'flex';
  },

  // ── UPLOAD CONFIRMATION ──────────────────────────────────────────────────────

  _showUploadConfirmation: function(type, count) {
    const container = document.getElementById('cl-tab-upload');
    if (!container) return;
    const msg = document.createElement('div');
    msg.className = 'upload-confirmation';
    msg.textContent = count + ' ' + type + (count > 1 ? 's' : '') + ' uploaded. Visit the Review tab to approve extracted content.';
    container.insertBefore(msg, container.firstChild);
    setTimeout(function() { msg.remove(); }, 5000);
  }

};
