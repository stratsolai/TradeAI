(function() {
  window.CL_UPLOAD = {
    init: function(supabase) {
      var panel = document.getElementById("cl-tab-upload");
      if (!panel) return;
      panel.innerHTML = "<div class=\"ptab-content active\" id=\"tab-upload\">\n\n    <div class=\"info-box\">\n      <strong>💡 Quick Start:</strong> Upload your existing marketing materials — photos, documents, testimonials — and AI will automatically categorise everything. This content then feeds all your AI tools.\n    </div>\n\n    <!-- Offline queue banner -->\n    <div id=\"offline-queue-banner\" style=\"display:none;background:#fff3cd;border:1px solid #ffc107;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px;\">\n      <span style=\"font-size:20px\">📶</span>\n      <div>\n        <strong style=\"color:#856404\">Photos queued for upload</strong>\n        <p style=\"margin:0;font-size:13px;color:#856404\">You're offline. <span id=\"queue-count\">0</span> photo(s) will upload automatically when you reconnect.</p>\n      </div>\n    </div>\n\n    <!-- 📷 JOB SITE PHOTO UPLOAD — PROMINENT PRIMARY CARD -->\n    <div class=\"card\" style=\"border:2px solid var(--primary);margin-bottom:16px;\">\n      <div class=\"card-header\" style=\"background:var(--primary);\">\n        <div class=\"card-title\" style=\"color:white;\">📷 Add Job Site Photos</div>\n        <span style=\"color:rgba(255,255,255,0.8);font-size:13px;\">AI analyses and creates social posts automatically</span>\n      </div>\n      <div class=\"card-body\">\n\n        <!-- Camera / Photo inputs (hidden) -->\n        <input type=\"file\" id=\"camera-input\" accept=\"image/*\" capture=\"environment\" multiple style=\"display:none\">\n        <input type=\"file\" id=\"photo-library-input\" accept=\"image/*,.heic\" multiple style=\"display:none\">\n\n        <!-- Big action buttons for mobile -->\n        <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;\">\n          <button onclick=\"document.getElementById('camera-input').click()\"\n            style=\"padding:20px;background:var(--primary);color:white;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;\">\n            <span style=\"font-size:32px\">📸</span>\n            Take Photo Now\n            <span style=\"font-size:11px;opacity:0.8;font-weight:400\">Opens camera directly</span>\n          </button>\n          <button onclick=\"document.getElementById('photo-library-input').click()\"\n            style=\"padding:20px;background:#f8f9fa;color:var(--text);border:2px solid var(--border);border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;\">\n            <span style=\"font-size:32px\">🖼️</span>\n            Choose from Library\n            <span style=\"font-size:11px;color:var(--text-muted);font-weight:400\">Select multiple photos</span>\n          </button>\n        </div>\n\n        <!-- Photo preview grid -->\n        <div id=\"photo-preview-grid\" style=\"display:none;margin-bottom:16px;\">\n          <div style=\"font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px;\">\n            Selected photos: <span id=\"photo-count\">0</span>\n          </div>\n          <div id=\"photo-thumbnails\" style=\"display:flex;gap:8px;flex-wrap:wrap;\"></div>\n        </div>\n\n        <!-- Job context fields -->\n        <div id=\"photo-context-form\" style=\"display:none;\">\n          <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;\">\n            <div>\n              <label style=\"font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;\">Job Type</label>\n              <select id=\"photo-job-type\" style=\"width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:white;\">\n                <option value=\"\">Select job type...</option>\n                <option>Completed installation</option>\n                <option>Before & after</option>\n                <option>Work in progress</option>\n                <option>Team on site</option>\n                <option>Equipment/materials</option>\n                <option>Finished project</option>\n              </select>\n            </div>\n            <div>\n              <label style=\"font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;\">Location (optional)</label>\n              <input id=\"photo-location\" type=\"text\" placeholder=\"e.g. Paddington, Sydney\"\n                style=\"width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;\">\n            </div>\n          </div>\n          <div style=\"margin-bottom:16px;\">\n            <label style=\"font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;\">Quick note (optional)</label>\n            <input id=\"photo-note\" type=\"text\" placeholder=\"e.g. Pool renovation, new pump system installed\"\n              style=\"width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;\">\n          </div>\n          <button onclick=\"uploadJobPhotos()\" id=\"upload-photos-btn\"\n            style=\"width:100%;padding:14px;background:var(--accent);color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;\">\n            ⚡ Upload & Generate Social Post\n          </button>\n        </div>\n\n        <p style=\"text-align:center;font-size:12px;color:var(--text-muted);margin-top:12px;\">\n          📶 Works offline — photos queue automatically and upload when you reconnect\n        </p>\n      </div>\n    </div>\n\n    <!-- AI Post suggestion banner (shown after upload) -->\n    <div id=\"post-suggestion-banner\" style=\"display:none;background:linear-gradient(135deg,#e8f5e9,#f1f8e9);border:1px solid #4caf50;border-radius:12px;padding:20px;margin-bottom:16px;\">\n      <div style=\"font-size:15px;font-weight:700;color:#2e7d32;margin-bottom:8px;\">🎉 Photos uploaded! AI has created a draft post.</div>\n      <p id=\"suggested-post-text\" style=\"font-size:14px;color:#388e3c;margin-bottom:16px;line-height:1.6;\"></p>\n      <div style=\"display:flex;gap:10px;flex-wrap:wrap;\">\n        <button onclick=\"useGeneratedPost()\" style=\"padding:10px 20px;background:#4caf50;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;\">✏️ Edit & Post</button>\n        <button onclick=\"document.getElementById('post-suggestion-banner').style.display='none'\" style=\"padding:10px 20px;background:white;color:#555;border:1px solid #ccc;border-radius:8px;font-size:14px;cursor:pointer;\">Dismiss</button>\n      </div>\n    </div>\n\n    <div class=\"card\">\n      <div class=\"card-header\"><div class=\"card-title\">Other Content Sources</div></div>\n      <div class=\"card-body\">\n        <div class=\"upload-grid\">\n\n          <!-- General File Upload -->\n          <div class=\"upload-card\" id=\"file-drop-zone\">\n            <input type=\"file\" id=\"file-input\" accept=\".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.txt,.jpg,.jpeg,.png,.webp,.heic\" multiple style=\"display:none\">\n            <span class=\"upload-icon\">📁</span>\n            <div class=\"upload-title\">Documents & Files</div>\n            <div class=\"upload-desc\"><strong>Documents:</strong> PDF, Word, PowerPoint, Excel<br><strong>Images:</strong> JPG, PNG, WEBP, HEIC<br>AI extracts and categorises automatically</div>\n          </div>\n\n          <!-- Website Scraper -->\n          <div class=\"upload-card\" id=\"website-scraper-card\">\n            <span class=\"upload-icon\">🌐</span>\n            <div class=\"upload-title\">Import from Website</div>\n            <div class=\"upload-desc\">Enter your website URL and AI extracts content, images, and testimonials automatically</div>\n          </div>\n\n          <!-- Google Drive -->\n          <div class=\"upload-card\" id=\"gdrive-card\">\n            <span class=\"upload-icon\">📂</span>\n            <div class=\"upload-title\" id=\"gdrive-title\">Connect Google Drive</div>\n            <div class=\"upload-desc\" id=\"gdrive-desc\">Import project photos from your Drive folders automatically</div>\n          </div>\n\n          <!-- Email Import -->\n          <div class=\"upload-card\" id=\"email-import-card\">\n            <span class=\"upload-icon\">📧</span>\n            <div class=\"upload-title\" id=\"email-title\">Import from Email</div>\n            <div class=\"upload-desc\" id=\"email-desc\">Scan email attachments for images and extract testimonials</div>\n          </div>\n\n        </div>\n      </div>\n    </div>\n\n    <!-- Loading -->\n    <div class=\"loading\" id=\"upload-loading\">\n      <div class=\"spinner\"></div>\n      <p id=\"upload-loading-text\">Processing your content...</p>\n    </div>\n\n  </div>";
      initUpload();
    }
  };

  // Upload & Import functions
  function initUpload() {
  const dropZone = document.getElementById('file-drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', e => { e.preventDefault(); fileInput.click(); });
  fileInput.addEventListener('change', e => handleFiles(e.target.files));

  ['dragenter','dragover'].forEach(ev => {
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.style.borderColor = 'var(--blue)'; dropZone.style.background = 'var(--blue-light)'; });
  });
  ['dragleave','drop'].forEach(ev => {
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.style.borderColor = ''; dropZone.style.background = ''; });
  });
  dropZone.addEventListener('drop', e => { e.preventDefault(); handleFiles(e.dataTransfer.files); });

  document.getElementById('website-scraper-card').addEventListener('click', () => {
    document.getElementById('modal-website').classList.add('show');
  });

  document.getElementById('gdrive-card').addEventListener('click', async () => {
    const profile = await getUserProfile();
    if (profile?.gdrive_connected) showDriveFolders();
    else connectGoogleDrive();
  });

  document.getElementById('email-import-card').addEventListener('click', async () => {
    const profile = await getUserProfile();
    if (!profile?.gmail_access_token && !profile?.outlook_access_token) {
      alert('⚠️ No email connected.\n\nPlease connect Gmail or Outlook in Chatbot Settings first.');
      return;
    }
    if (confirm('Scan your recent emails for images and testimonials?')) importEmailContent();
  });

  loadConnectionStatus();
}

async function loadConnectionStatus() {
  const profile = await getUserProfile();
  if (profile?.gdrive_connected) {
    document.getElementById('gdrive-title').textContent = '✓ Drive Connected';
    document.getElementById('gdrive-desc').textContent = 'Click to import photos from Drive';
    document.getElementById('gdrive-card').classList.add('connected');
  }
  if (profile?.gmail_access_token || profile?.outlook_access_token) {
    const provider = profile.gmail_access_token ? 'Gmail' : 'Outlook';
    document.getElementById('email-title').textContent = `✓ ${provider} Connected`;
    document.getElementById('email-desc').textContent = 'Click to import images and testimonials from emails';
    document.getElementById('email-import-card').classList.add('connected');
  }
}

async function handleFiles(files) {
  if (!files?.length) return;
  const loading = document.getElementById('upload-loading');
  const loadingText = document.getElementById('upload-loading-text');
  loading.classList.add('show');
  loadingText.textContent = `Processing ${files.length} file(s)...`;

  const { data: { user } } = await supabaseClient.auth.getUser();
  let success = 0, total = 0;

  for (const file of files) {
    const fileType = getFileType(file.name);
    try {
      const base64 = fileType === 'image' ? await compressImage(file) : await fileToBase64(file);
      const res = await fetch('/api/process-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, fileName: file.name, fileType, fileData: base64 })
      });
      const data = await res.json();
      if (data.success) { success++; total += data.itemsCount || 0; }
    } catch(e) { console.error(file.name, e); }
  }

  loading.classList.remove('show');
  document.getElementById('file-input').value = '';

  if (success > 0) {
    alert(`✅ Done!\n\nProcessed: ${success} file(s)\nExtracted: ${total} items\n\nCheck Source Material Review to approve them.`);
    loadStats();
    switchPTab('review');
  } else {
    alert('❌ Failed to process files. Please try again.');
  }
}

async function scrapeWebsite() {
  const url = document.getElementById('website-url').value;
  if (!url) { alert('Please enter a URL'); return; }
  closeModal('modal-website');
  const loading = document.getElementById('upload-loading');
  loading.classList.add('show');
  document.getElementById('upload-loading-text').textContent = 'Scanning website...';

  const { data: { user } } = await supabaseClient.auth.getUser();
  try {
    const res = await fetch('/api/scrape-website', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, url })
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Found ${data.itemsCount} items from your website!`);
      loadStats();
      switchPTab('review');
    } else {
      alert('❌ Error: ' + data.error);
    }
  } catch(e) { alert('❌ Error: ' + e.message); }
  loading.classList.remove('show');
}

function connectGoogleDrive() {
  // Trigger Google Drive OAuth
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent('368140587749-isq0imjs2n70snmceqnb9s5coqjleak8.apps.googleusercontent.com')}&redirect_uri=${encodeURIComponent(window.location.origin + '/api/auth/google-drive/callback')}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.readonly')}&state=${encodeURIComponent((async() => { const { data:{user}} = await supabaseClient.auth.getUser(); return user?.id; })())}&access_type=offline&prompt=consent`;
}

async function showDriveFolders() {
  document.getElementById('modal-drive').classList.add('show');
  const { data: { user } } = await supabaseClient.auth.getUser();
  try {
    const res = await fetch('/api/drive-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-folders', userId: user.id })
    });
    const data = await res.json();
    const list = document.getElementById('drive-folders-list');
    if (!data.folders?.length) { list.innerHTML = '<p style="text-align:center;color:#888;padding:20px">No folders found</p>'; return; }
    list.innerHTML = data.folders.map(f => `
      <div class="drive-folder-item" onclick="importFromFolder('${f.id}','${escHtml(f.name)}')">
        <span style="font-size:28px">📁</span>
        <div><div style="font-weight:600">${escHtml(f.name)}</div><div style="font-size:12px;color:#888">Click to import images</div></div>
      </div>
    `).join('');
  } catch(e) { alert('Error loading folders: ' + e.message); }
}

async function importFromFolder(folderId, folderName) {
  if (!confirm(`Import all images from "${folderName}"?`)) return;
  closeModal('modal-drive');
  document.getElementById('upload-loading').classList.add('show');
  document.getElementById('upload-loading-text').textContent = 'Importing from Drive...';
  const { data: { user } } = await supabaseClient.auth.getUser();
  try {
    const res = await fetch('/api/drive-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import-images', userId: user.id, folderId, folderName })
    });
    const data = await res.json();
    if (data.success) { alert(`✅ Imported ${data.count} images!`); loadStats(); switchPTab('review'); }
    else alert('❌ ' + data.error);
  } catch(e) { alert('❌ ' + e.message); }
  document.getElementById('upload-loading').classList.remove('show');
}

async function importEmailContent() {
  document.getElementById('upload-loading').classList.add('show');
  document.getElementById('upload-loading-text').textContent = 'Scanning emails...';
  const { data: { user } } = await supabaseClient.auth.getUser();
  try {
    const res = await fetch('/api/drive-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import-email', userId: user.id })
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Import complete!\nImages: ${data.images}\nTestimonials: ${data.testimonials}`);
      loadStats(); switchPTab('review');
    } else alert('❌ ' + data.error);
  } catch(e) { alert('❌ ' + e.message); }
  document.getElementById('upload-loading').classList.remove('show');
}

// ═══════════════════════════════════════════════
// TAB 2: SOURCE MATERIAL REVIEW
// ═══════════════════════════════════════════════

window.switchReviewTab = function(status) {
  currentReviewStatus = status;
  selectedItems.clear();
  document.getElementById('bulk-bar').classList.remove('show');

  document.querySelectorAll('#tab-review .stab').forEach((t,i) => {
    t.classList.toggle('active', ['pending','approved','rejected'][i] === status);
  });

  const infoBox = document.getElementById('review-info-box');
  const msgs = {
    pending: '<strong>📋 Pending Review:</strong> AI has extracted these items from your uploads. Approve items to make them available to all your AI tools.',
    approved: '<strong>✅ Approved Items:</strong> These are available to all your AI tools.',
    rejected: '<strong>❌ Rejected Items:</strong> Hidden from AI tools. You can restore or delete them.'
  };
  infoBox.textContent = '';
  infoBox.innerHTML = msgs[status];
  infoBox.className = `info-box${status === 'approved' ? ' green' : status === 'rejected' ? ' red' : ''}`;

  loadReviewItems();
};

  // Photo upload, offline queue, post suggestion
  function fileToBase64(file) {
  return new Promise((res,rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function compressImage(file) {
  return new Promise((res,rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let [w,h] = [img.width, img.height];
        const max = 1920;
        if (w > max || h > max) { if (w>h) { h=h/w*max; w=max; } else { w=w/h*max; h=max; } }
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        res(canvas.toDataURL('image/jpeg',0.8).split(',')[1]);
      };
      img.onerror = rej;
      img.src = e.target.result;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ─── INIT ──────────────────────────────────────
setTimeout(() => {
  initUpload();
  loadStats();

  // Check for OAuth callbacks
  const params = new URLSearchParams(window.location.search);
  if (params.get('gdrive_connected') === 'true') {
    alert('✅ Google Drive connected!');
    loadConnectionStatus();
    window.history.replaceState({}, '', window.location.pathname);
  }
  if (params.get('error')) {
    alert('❌ Connection error: ' + params.get('details'));
    window.history.replaceState({}, '', window.location.pathname);
  }
}, 400);

// ── ENHANCED PHOTO UPLOAD ─────────────────────────────────────────────────────

let selectedPhotoFiles = [];
let generatedPostText = '';

['camera-input', 'photo-library-input'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', handlePhotoSelection);
});

function handlePhotoSelection(e) {
  const newFiles = Array.from(e.target.files);
  if (!newFiles.length) return;
  selectedPhotoFiles = [...selectedPhotoFiles, ...newFiles];
  renderPhotoThumbnails();
  document.getElementById('photo-preview-grid').style.display = 'block';
  document.getElementById('photo-context-form').style.display = 'block';
  document.getElementById('photo-count').textContent = selectedPhotoFiles.length;
  e.target.value = '';
}

function renderPhotoThumbnails() {
  const container = document.getElementById('photo-thumbnails');
  container.innerHTML = '';
  selectedPhotoFiles.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative;width:70px;height:70px;border-radius:8px;overflow:hidden;flex-shrink:0;';
      wrapper.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;"><button onclick="removePhoto(${i})" style="position:absolute;top:2px;right:2px;width:18px;height:18px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;font-size:10px;cursor:pointer;line-height:1;">×</button>`;
      container.appendChild(wrapper);
    };
    reader.readAsDataURL(file);
  });
}

function removePhoto(index) {
  selectedPhotoFiles.splice(index, 1);
  document.getElementById('photo-count').textContent = selectedPhotoFiles.length;
  if (selectedPhotoFiles.length === 0) {
    document.getElementById('photo-preview-grid').style.display = 'none';
    document.getElementById('photo-context-form').style.display = 'none';
  } else { renderPhotoThumbnails(); }
}

async function uploadJobPhotos() {
  if (!selectedPhotoFiles.length) return alert('Please select at least one photo.');
  const btn = document.getElementById('upload-photos-btn');
  btn.disabled = true; btn.textContent = '⏳ Uploading...';
  const jobType  = document.getElementById('photo-job-type').value;
  const location = document.getElementById('photo-location').value;
  const note     = document.getElementById('photo-note').value;
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!navigator.onLine) {
    await queuePhotosOffline(selectedPhotoFiles, { jobType, location, note, userId: user.id });
    btn.disabled = false; btn.textContent = '⚡ Upload & Generate Social Post';
    document.getElementById('offline-queue-banner').style.display = 'flex';
    alert(`📶 You're offline. ${selectedPhotoFiles.length} photo(s) queued — will upload when reconnected.`);
    return;
  }

  try {
    let uploadedUrls = [];
    for (const file of selectedPhotoFiles) {
      const ext      = file.name.split('.').pop() || 'jpg';
      const filename = `jobs/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const base64   = await fileToBase64(file);
      const blob     = base64ToBlob(base64, file.type || 'image/jpeg');
      const { data, error } = await supabaseClient.storage.from('content-library').upload(filename, blob, { contentType: file.type || 'image/jpeg' });
      if (!error && data) {
        const { data: urlData } = supabaseClient.storage.from('content-library').getPublicUrl(filename);
        uploadedUrls.push(urlData.publicUrl);
        await supabaseClient.from('content_library').insert({ user_id: user.id, title: note || jobType || `Job photo ${new Date().toLocaleDateString('en-AU')}`, content_type: 'image', file_url: urlData.publicUrl, source: 'camera-upload', tool_source: 'photo-upload', category: 'completed-jobs', status: 'approved', metadata: JSON.stringify({ jobType, location, note }) });
      }
    }
    if (uploadedUrls.length > 0) await generatePostSuggestion(user.id, uploadedUrls[0], { jobType, location, note });
    selectedPhotoFiles = [];
    document.getElementById('photo-preview-grid').style.display = 'none';
    document.getElementById('photo-context-form').style.display = 'none';
    ['photo-job-type','photo-location','photo-note'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    loadStats(); switchPTab('review');
  } catch(err) { alert('Upload failed: ' + err.message); }
  btn.disabled = false; btn.textContent = '⚡ Upload & Generate Social Post';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.onerror = reject; r.readAsDataURL(file); });
}
function base64ToBlob(base64, mimeType) {
  const bytes = atob(base64); const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

async function generatePostSuggestion(userId, imageUrl, context) {
  try {
    const response = await fetch('/api/generate-social-content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, category: 'completed-jobs', context: `Job type: ${context.jobType || 'completed job'}. Location: ${context.location || 'local area'}. Note: ${context.note || ''}`, imageUrl, platform: 'instagram', tone: 'professional', generateCount: 1 }) });
    const data = await response.json();
    if (data.captions?.[0]) {
      generatedPostText = data.captions[0];
      document.getElementById('suggested-post-text').textContent = generatedPostText;
      document.getElementById('post-suggestion-banner').style.display = 'block';
    }
  } catch(e) { console.log('Post suggestion failed:', e.message); }
}

function useGeneratedPost() { localStorage.setItem('prefill-post', generatedPostText); window.location.href = '/social.html?prefill=1'; }

async function queuePhotosOffline(files, context) {
  if (!('indexedDB' in window)) return;
  const db = await openQueueDB();
  const tx = db.transaction('photo-queue', 'readwrite');
  const store = tx.objectStore('photo-queue');
  for (const file of files) { const base64 = await fileToBase64(file); store.add({ base64, mimeType: file.type, name: file.name, context, timestamp: Date.now() }); }
  updateQueueBanner();
}

function openQueueDB() {
  return new Promise((resolve, reject) => { const req = indexedDB.open('StaxAI-photo-queue', 1); req.onupgradeneeded = e => e.target.result.createObjectStore('photo-queue', { autoIncrement: true }); req.onsuccess = e => resolve(e.target.result); req.onerror = reject; });
}

async function updateQueueBanner() {
  try {
    const db = await openQueueDB(); const tx = db.transaction('photo-queue', 'readonly');
    const count = await new Promise(r => { const req = tx.objectStore('photo-queue').count(); req.onsuccess = () => r(req.result); });
    const banner = document.getElementById('offline-queue-banner');
    if (count > 0) { document.getElementById('queue-count').textContent = count; banner.style.display = 'flex'; } else { banner.style.display = 'none'; }
  } catch(e) {}
}

window.addEventListener('online', async () => { await processOfflineQueue(); updateQueueBanner(); });

async function processOfflineQueue() {
  try {
    const db = await openQueueDB();
    const items = await new Promise(r => { const tx = db.transaction('photo-queue','readonly'); const req = tx.objectStore('photo-queue').getAll(); req.onsuccess = () => r(req.result); });
    const keys  = await new Promise(r => { const tx = db.transaction('photo-queue','readonly'); const req = tx.objectStore('photo-queue').getAllKeys(); req.onsuccess = () => r(req.result); });
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const blob = base64ToBlob(item.base64, item.mimeType);
        const ext  = item.name.split('.').pop() || 'jpg';
        const filename = `jobs/${item.context.userId}/${Date.now()}-${i}.${ext}`;
        await supabaseClient.storage.from('content-library').upload(filename, blob, { contentType: item.mimeType });
        const { data: urlData } = supabaseClient.storage.from('content-library').getPublicUrl(filename);
        await supabaseClient.from('content_library').insert({ user_id: item.context.userId, title: item.context.note || item.context.jobType || 'Job photo', content_type: 'image', file_url: urlData.publicUrl, source: 'camera-upload-offline', tool_source: 'photo-upload', category: 'completed-jobs', status: 'approved', metadata: JSON.stringify(item.context) });
        const delTx = db.transaction('photo-queue','readwrite'); delTx.objectStore('photo-queue').delete(keys[i]);
      } catch(e) { console.log('Queue item failed:', e.message); }
    }
  } catch(e) { console.log('Queue processing error:', e.message); }
}

})();