const CACHE_VERSION = 'v3';
const CACHE_NAME = `workout-pwa-${CACHE_VERSION}`;
const FILES_TO_CACHE = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.json',
  'icon.svg', 'icon-192.png', 'icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Remove old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Prefer network for navigation requests so index.html updates promptly
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(resp => {
        // Update the cache with the latest navigation response
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(req, resp.clone());
          return resp;
        });
      }).catch(() => caches.match('index.html'))
    );
    return;
  }

  // For other requests, try cache first, then network and cache new responses
  e.respondWith(
    caches.match(req).then(res => {
      if (res) return res;
      return fetch(req).then(resp => {
        // Only cache GET requests from same origin
        if (req.method === 'GET' && req.url.startsWith(self.location.origin)) {
          caches.open(CACHE_NAME).then(cache => cache.put(req, resp.clone()));
        }
        return resp;
      });
    })
  );
});
