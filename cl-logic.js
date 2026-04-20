  // Shared utilities - exposed on window for tab JS files
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

// ─── INIT ──────────────────────────────────────
setTimeout(() => {
  window.loadStats();

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
    window.loadStats();
    if (window.CL_UPLOAD)  window.CL_UPLOAD.init(s);
    if (window.CL_REVIEW)  window.CL_REVIEW.init(s);
    if (window.CL_PROFILE) window.CL_PROFILE.init(s);
    if (window.CL_OUTPUTS) window.CL_OUTPUTS.init(s);
  }, 400);
});
