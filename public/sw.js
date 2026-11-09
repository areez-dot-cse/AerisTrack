// Service worker for the supervisor app (scope /s/). A classic script with no
// imports, so it runs on older phones. It precaches the single shell page and
// serves it offline, keeps the last copy of /api/s/today, and never caches POSTs.
// Shell files are served from the cache and refreshed in the background, so a
// new release reaches the phone on the next open. Bump CACHE on every release.
const CACHE = 'tna-supervisor-v4';
const SHELL = [
  '/s/', '/css/tokens.css', '/css/supervisor.css',
  '/js/supervisor.js', '/js/i18n.js', '/js/outbox.js', '/js/photo.js', '/js/recorder.js',
  '/locales/en.json', '/locales/ta.json', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
];
const NETWORK_FIRST = ['/api/s/today', '/api/s/me'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (NETWORK_FIRST.includes(url.pathname)) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => caches.match(request)),
    );
    return;
  }

  // Any navigation inside /s/ gets the shell; its views are chosen by the hash.
  // A redirect means "not logged in": that reply is the login page, never cache it.
  if (request.mode === 'navigate' && url.pathname.startsWith('/s')) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && !response.redirected) caches.open(CACHE).then((cache) => cache.put('/s/', response.clone()));
        return response;
      }).catch(() => caches.match('/s/')),
    );
    return;
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const refresh = fetch(request).then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        }).catch(() => cached);
        return cached ?? refresh;
      }),
    );
  }
});
