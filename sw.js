const CACHE_NAME = 'jrt-v9';
const ASSETS = [
  './',
  './index.html',
  './scan.html',
  './confirm.html',
  './add.html',
  './history.html',
  './stats.html',
  './settings.html',
  './style.css',
  './js/app.js',
  './js/storage.js',
  './js/gemini.js',
  './manifest.json',
];

// Install: cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for local assets (always serve the latest code when
// online; no need to remember bumping CACHE_NAME for updates to show up),
// falling back to cache only when offline. API calls always go to network.
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // API calls (Gemini) → always network
  if (url.includes('generativelanguage.googleapis.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Local assets → network first, update cache, fallback to cache when offline
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
