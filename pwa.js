/**
 * pwa.js — PWA registration and install prompt
 * Include in every HTML page: <script src="/pwa.js"></script>
 */

// ─── SERVICE WORKER REGISTRATION ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('[PWA] Service worker registered:', reg.scope);

      // Listen for upload sync messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'UPLOAD_SYNCED') {
          showSyncNotification(event.data.fileName);
        }
      });

      // Check for pending queue items on load
      checkOfflineQueue();

    } catch (err) {
      console.log('[PWA] Service worker registration failed:', err);
    }
  });
}

// ─── INSTALL PROMPT ───────────────────────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Show install banner if not already installed and not dismissed recently
  const dismissed = localStorage.getItem('pwa-install-dismissed');
  const lastDismissed = dismissed ? new Date(dismissed) : null;
  const daysSinceDismissed = lastDismissed
    ? (Date.now() - lastDismissed.getTime()) / (1000 * 60 * 60 * 24)
    : 999;

  if (daysSinceDismissed > 7) {
    setTimeout(showInstallBanner, 3000); // Show after 3s on page
  }
});

function showInstallBanner() {
  if (!deferredPrompt || document.getElementById('pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.innerHTML = `
    <div style="
      position: fixed; bottom: 20px; left: 16px; right: 16px;
      background: white; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      padding: 16px 20px; display: flex; align-items: center; gap: 14px;
      z-index: 9999; max-width: 480px; margin: 0 auto;
      animation: slideUp 0.3s ease;
    ">
      <div style="font-size: 36px; flex-shrink:0;">📱</div>
      <div style="flex: 1;">
        <div style="font-weight: 700; font-size: 15px; color: #1a5490; margin-bottom: 3px;">
          Add TradeAI to your phone
        </div>
        <div style="font-size: 13px; color: #666; line-height: 1.4;">
          Get quick access to your tools, email summary and job photos from your home screen.
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px; flex-shrink:0;">
        <button onclick="installPWA()" style="
          padding: 8px 16px; background: #1a5490; color: white;
          border: none; border-radius: 8px; font-size: 13px;
          font-weight: 600; cursor: pointer; white-space: nowrap;
        ">Add App</button>
        <button onclick="dismissInstallBanner()" style="
          padding: 6px 16px; background: none; color: #999;
          border: none; font-size: 12px; cursor: pointer;
        ">Not now</button>
      </div>
    </div>
    <style>
      @keyframes slideUp {
        from { transform: translateY(100px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    </style>
  `;
  document.body.appendChild(banner);
}

window.installPWA = async function() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log('[PWA] Install outcome:', outcome);
  deferredPrompt = null;
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.remove();
};

window.dismissInstallBanner = function() {
  localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.remove();
};

// iOS install instructions (Safari doesn't support beforeinstallprompt)
window.addEventListener('load', () => {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandaloneMode = window.navigator.standalone;
  const dismissed = localStorage.getItem('ios-install-dismissed');

  if (isIOS && !isInStandaloneMode && !dismissed) {
    setTimeout(() => {
      if (document.getElementById('pwa-install-banner')) return; // Don't show both
      const banner = document.createElement('div');
      banner.id = 'pwa-install-banner';
      banner.innerHTML = `
        <div style="
          position: fixed; bottom: 20px; left: 16px; right: 16px;
          background: white; border-radius: 14px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18);
          padding: 16px 20px; z-index: 9999;
          animation: slideUp 0.3s ease;
        ">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div style="font-weight: 700; font-size: 15px; color: #1a5490;">📱 Add TradeAI to your home screen</div>
            <button onclick="this.closest('#pwa-install-banner').remove(); localStorage.setItem('ios-install-dismissed','1')"
              style="background:none;border:none;font-size:20px;color:#999;cursor:pointer;padding:0 0 0 10px;">×</button>
          </div>
          <div style="font-size: 13px; color: #555; line-height: 1.6;">
            Tap <strong>Share</strong> <span style="font-size:16px;">⎋</span> at the bottom of Safari,
            then tap <strong>"Add to Home Screen"</strong> for quick access to your tools and email summary.
          </div>
          <div style="margin-top:10px; text-align:center;">
            <span style="font-size:24px;">⬇️</span>
          </div>
        </div>
      `;
      document.body.appendChild(banner);
    }, 5000);
  }
});

// ─── OFFLINE QUEUE STATUS ─────────────────────────────────────────────────────
async function checkOfflineQueue() {
  try {
    const db = await openIndexedDB();
    const items = await getAllItems(db);
    if (items.length > 0) {
      showQueueBanner(items.length);
    }
  } catch (e) {}
}

function showQueueBanner(count) {
  if (document.getElementById('pwa-queue-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-queue-banner';
  banner.innerHTML = `
    <div style="
      position: fixed; top: 0; left: 0; right: 0;
      background: #e8500a; color: white;
      padding: 10px 16px; text-align: center;
      font-size: 14px; font-weight: 500; z-index: 9998;
    ">
      📤 ${count} photo${count > 1 ? 's' : ''} queued for upload — waiting for connection
      <button onclick="document.getElementById('pwa-queue-banner').remove()"
        style="background:none;border:none;color:white;margin-left:12px;font-size:18px;cursor:pointer;">×</button>
    </div>
  `;
  document.body.appendChild(banner);
}

function showSyncNotification(fileName) {
  const note = document.createElement('div');
  note.innerHTML = `
    <div style="
      position: fixed; bottom: 20px; right: 20px;
      background: #28a745; color: white; border-radius: 10px;
      padding: 12px 18px; font-size: 14px; font-weight: 500;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2); z-index: 9999;
      animation: slideUp 0.3s ease;
    ">
      ✅ Photo synced: ${fileName || 'Upload complete'}
    </div>
  `;
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 4000);
}

// ─── INDEXEDDB HELPERS (client side) ─────────────────────────────────────────
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tradeai-queue', 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('uploads', { keyPath: 'id' });
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllItems(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction('uploads', 'readonly').objectStore('uploads').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── ONLINE / OFFLINE INDICATOR ──────────────────────────────────────────────
window.addEventListener('online', () => {
  const banner = document.getElementById('pwa-queue-banner');
  if (banner) banner.remove();
  // Trigger background sync
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      if ('sync' in reg) reg.sync.register('photo-upload-queue');
    });
  }
});

window.addEventListener('offline', () => {
  if (!document.getElementById('pwa-offline-bar')) {
    const bar = document.createElement('div');
    bar.id = 'pwa-offline-bar';
    bar.innerHTML = `
      <div style="
        position: fixed; top: 0; left: 0; right: 0;
        background: #6c757d; color: white;
        padding: 8px 16px; text-align: center;
        font-size: 13px; z-index: 9998;
      ">
        📵 You're offline — photos will queue automatically
      </div>
    `;
    document.body.appendChild(bar);
  }
});
