// ============================================================================
// APEX HORIZON — service worker: NETWORK-FIRST for every same-origin GET.
// Guarantees players always run the latest deployed build (GitHub Pages
// sends max-age=600 and browsers happily reuse stale JS otherwise).
// Cache is only used when the network is unavailable (offline fallback).
// ============================================================================
const CACHE = 'apex-horizon-v1';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: 'no-store' });
      if (fresh && (fresh.ok || fresh.status === 304)) {
        try {
          const c = await caches.open(CACHE);
          c.put(req, fresh.clone());
        } catch (_) {}
      }
      return fresh;
    } catch (_) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const home = await caches.match('index.html');
        if (home) return home;
      }
      return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
