// ProjectX — service worker
// Strategy: network-first for HTML (always get latest), cache-first for icons.
// Supabase, CDNs, and cross-origin requests are never intercepted.

const CACHE = 'projectx-app-v10';
const ICONS = [
  '/projectx-app/icon-192.png',
  '/projectx-app/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ICONS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // Never intercept: Supabase, CDNs, cross-origin
  if (
    url.includes('supabase.co') ||
    url.includes('supabase.io') ||
    url.includes('jsdelivr.net') ||
    url.includes('cdn.tailwindcss.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) return;

  // Cache-first for icons
  if (url.endsWith('.png') || url.endsWith('.ico')) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      }))
    );
    return;
  }

  // Network-first for HTML / JS / everything else (so deploys always win)
  e.respondWith(
    fetch(e.request).then(resp => {
      // Optionally cache HTML responses for offline fallback
      if (resp && resp.status === 200 && e.request.destination === 'document') {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
