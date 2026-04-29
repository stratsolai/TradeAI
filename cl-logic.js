// ─── INIT ──────────────────────────────────────
setTimeout(() => {
  window.loadStats();

  // Check for OAuth callbacks
  const params = new URLSearchParams(window.location.search);
  if (params.get('gdrive_connected') === 'true') {
    alert('Google Drive connected');
    window.history.replaceState({}, '', window.location.pathname);
  }
  if (params.get('error')) {
    alert('Connection error: ' + params.get('details'));
    window.history.replaceState({}, '', window.location.pathname);
  }
}, 400);

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
    loadScript("cl-profile-marketing.js", function() {
      loadScript("cl-profile.js", function() { if (window.CL_PROFILE) window.CL_PROFILE.init(s); });
    });
    loadScript("cl-outputs.js", function() { if (window.CL_OUTPUTS) window.CL_OUTPUTS.init(s); });
    if (window.CL_PROJECTS) window.CL_PROJECTS.init(s);
  })();


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

(function() {
  var key = 'tab_state:/content-library.html';
  var saved = null;
  try { saved = sessionStorage.getItem(key); } catch (e) {}
  if (!saved) {
    var hash = window.location.hash.replace('#', '');
    if (hash) saved = hash;
  }
  if (saved) {
    switchPTab(saved);
    try { sessionStorage.removeItem(key); } catch (e) {}
  }
})();

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
