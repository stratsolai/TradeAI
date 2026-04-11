  async function loadStats() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  const [libResult, queueResult, publishedResult] = await Promise.all([
    supabaseClient.from('content_library').select('status', { count: 'exact' }).eq('user_id', user.id).neq('source', 'tool'),
    supabaseClient.from('publishing_queue').select('status', { count: 'exact' }).eq('user_id', user.id).in('status', ['pending_approval','approved','scheduled']),
    supabaseClient.from('publishing_queue').select('id', { count: 'exact' }).eq('user_id', user.id).eq('status', 'posted')
  ]);

  const items = libResult.data || [];
  const total = items.length;
  const pending = items.filter(i => i.status === 'pending').length;
  const approved = items.filter(i => i.status === 'approved').length;
  const archived = items.filter(i => i.status === 'archived').length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-approved').textContent = approved;
  document.getElementById('stat-rejected').textContent = publishedResult.count || 0;
  var archivedEl = document.getElementById('stat-archived');
  if (archivedEl) archivedEl.textContent = archived;
}

  // Shared utilities - exposed on window for tab JS files
  function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
  window.escHtml = escHtml;

  function getTypeIcon(type) {
  return { image:'📸', document:'📄', testimonial:'💬', project:'✅', text:'📝', word:'📝', pdf:'📑', powerpoint:'📊', excel:'📊' }[type] || '📦';
}
  window.getTypeIcon = getTypeIcon;

  function getDocIcon(type) {
  return { pdf:'📑', word:'📝', powerpoint:'📊', excel:'📊', document:'📄', content:'✍️', text:'📝' }[type] || '📄';
}
  window.getDocIcon = getDocIcon;

  function getFileType(name) {
  const ext = name.toLowerCase().split('.').pop();
  return { pdf:'pdf',doc:'word',docx:'word',ppt:'powerpoint',pptx:'powerpoint',xls:'excel',xlsx:'excel',txt:'text',jpg:'image',jpeg:'image',png:'image',webp:'image',heic:'image' }[ext] || 'unknown';
}

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
  loadStats();

  // Check for OAuth callbacks
  const params = new URLSearchParams(window.location.search);
  if (params.get('gdrive_connected') === 'true') {
    alert('✅ Google Drive connected');
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
  window.getFileType = getFileType;

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
  }
  window.catBadge = catBadge;

  // Dynamic loader - tab JS files with cache-busting
  (function() {
    var s = window.supabaseClient;
    function loadScript(src, cb) {
      var el = document.createElement("script");
      el.src = src + "?v=" + Date.now();
      el.onload = cb;
      document.body.appendChild(el);
    }
    loadScript("cl-upload.js", function() { if (window.CL_UPLOAD) window.CL_UPLOAD.init(s); });
    loadScript("cl-review.js", function() { if (window.CL_REVIEW) window.CL_REVIEW.init(s); });
    loadScript("cl-profile.js", function() { if (window.CL_PROFILE) window.CL_PROFILE.init(s); });
    loadScript("cl-outputs.js", function() { if (window.CL_OUTPUTS) window.CL_OUTPUTS.init(s); });
  })();


    var _nb = document.getElementById("notification-bar"); if (_nb) _nb.addEventListener("click", function(e) { if (e.target.classList.contains("notif-dismiss")) e.target.closest(".notif-item").remove(); });
function switchPTab(tab) {
  document.querySelectorAll('.ptab-content').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.ptab').forEach(function(el) { el.classList.remove('active'); });
  var panel = document.getElementById('cl-tab-' + tab);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.ptab').forEach(function(el) {
    if (el.dataset.tab === tab) {
      el.classList.add('active');
    }
  });
}

document.querySelectorAll('.ptab[data-tab]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    switchPTab(btn.dataset.tab);
  });
});

window.addEventListener('pageshow', function(e) {
  if (!e.persisted) return;
  var s = window.supabaseClient;
  setTimeout(function() {
    loadStats();
    if (window.CL_UPLOAD)  window.CL_UPLOAD.init(s);
    if (window.CL_REVIEW)  window.CL_REVIEW.init(s);
    if (window.CL_PROFILE) window.CL_PROFILE.init(s);
    if (window.CL_OUTPUTS) window.CL_OUTPUTS.init(s);
  }, 400);
});
