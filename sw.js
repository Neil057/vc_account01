const CACHE_NAME = 'jrt-v4';
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

// Fetch: cache-first for local assets, network-first for API calls
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // API calls (Gemini) → always network
  if (url.includes('generativelanguage.googleapis.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Local assets → cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
