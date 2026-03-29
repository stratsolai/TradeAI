// StaxAI Service Worker — disabled
// This stub unregisters any previously installed service worker.
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) { return caches.delete(key); }));
    }).then(function() { return self.clients.claim(); })
  );
  self.registration.unregister();
});
