
requireAuth();

// ─── STATE ────────────────────────────────────
let currentReviewStatus = 'pending';
let currentReviewFilter = 'all';
let currentQueueStatus = 'pending_approval';
let selectedItems = new Set();
let allReviewItems = [];
let allLibraryItems = [];
let currentDetailItem = null;
let pendingActionItemId = null;
let currentToolId = null;

// All 16 core tools + expandable
const ALL_TOOLS = [
  { id: 'social',        icon: '📣', name: 'Marketing & Social Media Manager', price: 59,  link: '//social',   outputType: 'posts' },
  { id: 'chatbot',       icon: '💬', name: 'AI Website Chatbot',               price: 79,  link: '//chatbot',  outputType: 'conversations' },
  { id: 'email',         icon: '📧', name: 'Smart Email Assistant',            price: 69,  link: '//email',    outputType: 'emails' },
  { id: 'bi',            icon: '📊', name: 'Business Intelligence Dashboard',  price: 89,  link: '/bi.html',       outputType: 'reports' },
  { id: 'tender',        icon: '📑', name: 'Tender Response Generator',        price: 99,  link: '/tender.html',   outputType: 'documents' },
  { id: 'quote',         icon: '💰', name: 'Quote Generator',                  price: 69,  link: '/quote.html',    outputType: 'documents' },
  { id: 'scheduling',    icon: '📅', name: 'Smart Job Scheduling',             price: 59,  link: '/scheduling.html', outputType: 'schedules' },
  { id: 'progress',      icon: '🔔', name: 'Customer Progress Updates',        price: 49,  link: '/progress.html', outputType: 'messages' },
  { id: 'visualiser',    icon: '🎨', name: 'Design Visualiser',                price: 79,  link: '/visualiser.html', outputType: 'designs' },
  { id: 'swms',          icon: '🦺', name: 'SWMS & Safety Documents',          price: 69,  link: '/swms.html',     outputType: 'documents' },
  { id: 'invoice',       icon: '🧾', name: 'Invoice Automation',               price: 59,  link: '/invoice.html',  outputType: 'documents' },
  { id: 'website',       icon: '✍️', name: 'Website Content Writer',           price: 59,  link: '/website.html',  outputType: 'content' },
  { id: 'review',        icon: '⭐', name: 'Review & Referral Booster',        price: 49,  link: '/review.html',   outputType: 'messages' },
  { id: 'handover',      icon: '📋', name: 'Handover Documentation',           price: 59,  link: '/handover.html', outputType: 'documents' },
  { id: 'news',          icon: '📰', name: 'Industry News & Updates Digest',   price: 39,  link: '//news',     outputType: 'content' },
  { id: 'strategic',     icon: '🏗️', name: 'Strategic & Operational Plan Generator', price: 119, link: '//strategy', outputType: 'documents' },
];

// ─── PRIMARY TAB SWITCHING ────────────────────
window.switchPTab = function(tab) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.ptab-content').forEach(c => c.classList.remove('active'));

  const tabMap = { upload: 0, review: 1, outputs: 2, profile: 3 };
  document.querySelectorAll('.ptab')[tabMap[tab]].classList.add('active');
  document.getElementById(`cl-tab-${tab}`).classList.add('active');

  if (tab === 'upload' && window.CL_UPLOAD) window.CL_UPLOAD.init(window.supabaseClient);
  if (tab === 'review' && window.CL_REVIEW) window.CL_REVIEW.init(window.supabaseClient);
  if (tab === 'outputs' && window.CL_OUTPUTS) window.CL_OUTPUTS.init(window.supabaseClient);
  if (tab === 'profile' && window.CL_PROFILE) window.CL_PROFILE.init(window.supabaseClient);};

// ─── STATS ────────────────────────────────────

  async function loadStats() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  const [libResult, queueResult, publishedResult] = await Promise.all([
    supabaseClient.from('content_library').select('status', { count: 'exact' }).eq('user_id', user.id),
    supabaseClient.from('publishing_queue').select('status', { count: 'exact' }).eq('user_id', user.id).in('status', ['pending_approval','approved','scheduled']),
    supabaseClient.from('publishing_queue').select('id', { count: 'exact' }).eq('user_id', user.id).eq('status', 'posted')
  ]);

  const items = libResult.data || [];
  const total = items.length;
  const pending = items.filter(i => i.status === 'pending').length;
  const approved = items.filter(i => i.status === 'approved').length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-approved').textContent = approved;
  var _sq = document.getElementById('stat-queue'); if (_sq) _sq.textContent = queueResult.count || 0;
  document.getElementById('stat-rejected').textContent = publishedResult.count || 0;
  document.getElementById('badge-pending').textContent = pending;
  document.getElementById('badge-queue').textContent = queueResult.count || 0;
  document.getElementById('stab-pending-count').textContent = pending;
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


    var _ab = document.getElementById("account-btn"); if (_ab) _ab.addEventListener("click", function(e) { e.stopPropagation(); document.getElementById("account-dropdown").classList.toggle("open"); });
    document.addEventListener("click", function() { document.getElementById("account-dropdown").classList.remove("open"); });
    var _sb = document.getElementById("sign-out-btn"); if (_sb) _sb.addEventListener("click", async function() { await supabaseClient.auth.signOut(); window.location.href = "/login"; });
    var _nb = document.getElementById("notification-bar"); if (_nb) _nb.addEventListener("click", function(e) { if (e.target.classList.contains("notif-dismiss")) e.target.closest(".notif-item").remove(); });
    window.dashboardInit = async function() {
      const { data: { user }, error: _authErr } = await supabaseClient.auth.getUser();
      if (!user || _authErr) { window.location.href = "/login"; return; }
      const email = user.email || "";
      document.getElementById("account-email-short").textContent = "Account";
      const firstName = user.user_metadata?.first_name || user.user_metadata?.full_name?.split(" ")[0] || "";
      const ws = document.getElementById("welcome-strip");
      ws.innerHTML = firstName ? "Welcome back, <strong>" + firstName + "<\/strong>." : "Welcome back.";
      if (window.DASH_DATA && typeof window.DASH_DATA.init === "function") await window.DASH_DATA.init(user);
    };
    document.addEventListener("DOMContentLoaded", function() { window.dashboardInit(); });
  
window.CORE_TOOLS = [
  { id: "social", name: "Marketing & Social Media" },
  { id: "email", name: "AI Email Assistant" },
  { id: "chatbot", name: "AI Website Chatbot" },
  { id: "news-digest", name: "Industry News Digest" },
  { id: "bi", name: "Business Intelligence" },
  { id: "strategic-plan", name: "Strategic Plan" },
  { id: "tender", name: "Tender Response Generator" },
  { id: "quote-enhancer", name: "Quote Enhancer" },
  { id: "swms", name: "SWMS & Safety Docs" },
  { id: "customer-updates", name: "Customer Progress Updates" },
  { id: "handover-docs", name: "Handover Documentation" },
  { id: "review-booster", name: "Review & Referral Booster" },
  { id: "design-viz", name: "Design Visualiser" }
];
