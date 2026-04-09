/**
 * pwa.js — Service worker registration and install prompt
 * Include in every HTML page: <script src="/pwa.js"></script>
 */

// ─── SERVICE WORKER REGISTRATION ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js')
      .then(function (reg) {
        console.log('[PWA] Service worker registered:', reg.scope);
      })
      .catch(function (err) {
        console.log('[PWA] Service worker registration failed:', err);
      });
  });
}

// ─── INSTALL PROMPT ──────────────────────────────────────────────────────────
var deferredPrompt = null;
var BANNER_PAGES = ['/dashboard.html', '/content-library.html'];

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredPrompt = e;
  maybeShowInstallBanner();
});

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

function isAllowedPage() {
  return BANNER_PAGES.indexOf(window.location.pathname) !== -1;
}

function wasDismissed() {
  return localStorage.getItem('pwa-install-dismissed') === '1';
}

function isLoggedIn() {
  return typeof window._supabase !== 'undefined' &&
    window._supabase.auth &&
    typeof window._supabase.auth.getSession === 'function';
}

async function checkSessionAndShow() {
  try {
    var result = await window._supabase.auth.getSession();
    if (result && result.data && result.data.session) {
      showInstallBanner();
    }
  } catch (e) {
    // No session — do not show banner
  }
}

function maybeShowInstallBanner() {
  if (isStandalone()) return;
  if (!isAllowedPage()) return;
  if (wasDismissed()) return;

  if (isLoggedIn()) {
    setTimeout(function () { checkSessionAndShow(); }, 3000);
  }
}

function showInstallBanner() {
  if (document.getElementById('pwa-install-banner')) return;

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  var banner = document.createElement('div');
  banner.id = 'pwa-install-banner';

  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;bottom:20px;left:16px;right:16px;background:#fff3ee;border-left:4px solid #c4622a;border-radius:8px;padding:14px 16px;display:flex;align-items:center;gap:14px;z-index:9999;max-width:480px;margin:0 auto;font-family:"DM Sans",sans-serif;font-size:13px;color:#333333;line-height:1.6;box-shadow:0 2px 8px rgba(0,0,0,0.07);';

  if (isIOS) {
    wrapper.innerHTML = '<div style="flex:1">Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to add StaxAI to your device.</div>';

    var dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Got it';
    dismissBtn.style.cssText = 'padding:6px 14px;background:none;color:#c4622a;border:1px solid #c4622a;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:"DM Sans",sans-serif;';
    dismissBtn.addEventListener('click', dismissBanner);
    wrapper.appendChild(dismissBtn);
  } else {
    wrapper.innerHTML = '<div style="flex:1"><strong style="color:#c4622a">Add StaxAI to your device</strong><br>Get quick access to your tools from your home screen.</div>';

    var btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex-shrink:0;';

    var installBtn = document.createElement('button');
    installBtn.textContent = 'Add App';
    installBtn.style.cssText = 'padding:8px 16px;background:#c4622a;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:"DM Sans",sans-serif;';
    installBtn.addEventListener('click', installPWA);

    var notNowBtn = document.createElement('button');
    notNowBtn.textContent = 'Not now';
    notNowBtn.style.cssText = 'padding:6px 16px;background:none;color:#888888;border:none;font-size:12px;cursor:pointer;font-family:"DM Sans",sans-serif;';
    notNowBtn.addEventListener('click', dismissBanner);

    btnGroup.appendChild(installBtn);
    btnGroup.appendChild(notNowBtn);
    wrapper.appendChild(btnGroup);
  }

  banner.appendChild(wrapper);
  document.body.appendChild(banner);
}

async function installPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  var choice = await deferredPrompt.userChoice;
  console.log('[PWA] Install outcome:', choice.outcome);
  deferredPrompt = null;
  removeBanner();
}

function dismissBanner() {
  localStorage.setItem('pwa-install-dismissed', '1');
  removeBanner();
}

function removeBanner() {
  var banner = document.getElementById('pwa-install-banner');
  if (banner) banner.remove();
}

// ─── iOS STANDALONE CHECK ────────────────────────────────────────────────────
// On iOS Safari, beforeinstallprompt never fires — show instructions on load
window.addEventListener('load', function () {
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !isStandalone() && !wasDismissed() && isAllowedPage()) {
    if (isLoggedIn()) {
      setTimeout(function () { checkSessionAndShow(); }, 5000);
    }
  }
});
