/**
 * sw.js — TradeAI Service Worker
 *
 * Responsibilities:
 * 1. Cache static assets for offline access
 * 2. Queue photo uploads when offline → sync when back online
 * 3. Cache API responses for key data (news digest, email summary)
 * 4. Show offline fallback page when network unavailable
 */

const CACHE_NAME     = 'tradeai-v1';
const OFFLINE_URL    = '/offline.html';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/supabase-client.js',
  '/auth.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Pages to cache when visited
const CACHEABLE_PAGES = [
  '/dashboard.html',
  '/social.html',
  '/content-library.html',
  '/email-assistant.html',
  '/news-digest.html',
  '/strategic-plan.html',
  '/social-settings.html'
];

// ─── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS.filter(url => !url.startsWith('http'))))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    Promise.all([
      // Clear old caches
      caches.keys().then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        )
      ),
      self.clients.claim()
    ])
  );
});

// ─── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't intercept non-GET requests except photo uploads
  if (event.request.method !== 'GET') {
    // Intercept photo upload requests when offline
    if (event.request.url.includes('/api/process-file') && event.request.method === 'POST') {
      event.respondWith(handleOfflineUpload(event.request));
    }
    return;
  }

  // Don't intercept Supabase API calls or external auth
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('accounts.google.com') ||
      url.hostname.includes('login.microsoftonline.com')) {
    return;
  }

  // HTML pages — network first, fall back to cache, then offline page
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful page loads
          if (response.ok && CACHEABLE_PAGES.some(p => url.pathname === p)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // API calls — network only, no caching (always fresh data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'You are offline. Please check your connection.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Static assets — cache first, network fallback
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => new Response('Asset unavailable offline', { status: 503 }))
  );
});

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
// When connectivity is restored, replay any queued photo uploads

self.addEventListener('sync', (event) => {
  if (event.tag === 'photo-upload-queue') {
    console.log('[SW] Background sync: processing photo upload queue...');
    event.waitUntil(processPhotoQueue());
  }
});

async function processPhotoQueue() {
  const db = await openQueueDB();
  const items = await getAllQueueItems(db);

  if (!items.length) {
    console.log('[SW] Photo queue empty');
    return;
  }

  console.log(`[SW] Processing ${items.length} queued uploads...`);

  for (const item of items) {
    try {
      const response = await fetch('/api/process-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });

      if (response.ok) {
        await deleteQueueItem(db, item.id);
        console.log(`[SW] Successfully synced queued upload: ${item.id}`);

        // Notify all open clients that an upload succeeded
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({
          type: 'UPLOAD_SYNCED',
          itemId: item.id,
          fileName: item.payload.fileName
        }));
      }
    } catch (err) {
      console.log(`[SW] Failed to sync ${item.id}, will retry:`, err.message);
    }
  }
}

// Handle offline photo upload — queue for later
async function handleOfflineUpload(request) {
  try {
    // Try the network first
    return await fetch(request.clone());
  } catch {
    // Offline — save to IndexedDB queue
    const body = await request.json();
    const db = await openQueueDB();
    await addQueueItem(db, {
      id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      payload: body,
      queuedAt: new Date().toISOString()
    });

    // Register background sync
    try {
      await self.registration.sync.register('photo-upload-queue');
    } catch {
      // Background sync not supported — will retry on next page load
    }

    return new Response(JSON.stringify({
      success: false,
      queued: true,
      message: 'You\'re offline. Your photo has been saved and will upload automatically when you\'re back online.'
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { data = { title: 'TradeAI', body: event.data.text() }; }

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.tag || 'tradeai-notification',
    data: { url: data.url || '/dashboard.html' },
    actions: data.actions || [],
    requireInteraction: data.urgent || false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'TradeAI', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const existing = clients.find(c => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// ─── INDEXEDDB HELPERS ────────────────────────────────────────────────────────

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tradeai-queue', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('uploads', { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllQueueItems(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('uploads', 'readonly');
    const req = tx.objectStore('uploads').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function addQueueItem(db, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('uploads', 'readwrite');
    const req = tx.objectStore('uploads').add(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function deleteQueueItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('uploads', 'readwrite');
    const req = tx.objectStore('uploads').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
