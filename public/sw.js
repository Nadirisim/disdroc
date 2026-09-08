const CACHE = 'disdroc-v3';
const SHELL = [
  '/app',
  '/css/style.css',
  '/js/app.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

// Install: cache the app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: drop old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - API calls: always network, never cache
// - App shell (HTML): network-first, fall back to cache so app loads offline
// - Static assets (CSS/JS/images): stale-while-revalidate
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // API: network only
  if (url.pathname.startsWith('/api/')) return;

  // Any page navigation (the app shell, but also the static marketing/auth
  // pages — /signup, /login, /invite/:code, etc.): network-first with cache
  // fallback. These used to only be matched by pathname === '/app'/'/app.html',
  // so every other page fell through to the stale-while-revalidate bucket
  // below and, once cached once, would never update again for a returning
  // visitor even after a redeploy.
  if (e.request.mode === 'navigate' || url.pathname === '/app' || url.pathname === '/app.html') {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('/app') || caches.match('/app.html')))
    );
    return;
  }

  // JS/CSS: network-first. Stale-while-revalidate kept serving the OLD bundle
  // on every load (the refresh only landed in cache for next time), which is
  // why mobile never updated without wiping app data. URLs are version-stamped
  // now, so the network copy is always right; cache is just the offline fallback.
  if (/\.(js|css)$/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Images/fonts/audio: stale-while-revalidate (immutable-ish, speed wins)
  e.respondWith(
    caches.open(CACHE).then(async c => {
      const cached = await c.match(e.request);
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) c.put(e.request, res.clone());
        return res;
      }).catch(() => null);
      return cached || networkFetch;
    })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'disdroc', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'disdroc';
  const options = {
    body: data.body || '',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    data: { url: data.url || '/app' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if (w.url.includes('/app')) { w.focus(); return w.navigate(url); }
    return clients.openWindow(url);
  }));
});
