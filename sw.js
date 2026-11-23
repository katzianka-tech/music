// Service Worker: speichert die App, damit sie auch offline startet.
// Bei Änderungen an den Dateien VERSION erhöhen, sonst sehen Nutzer die alte Version.
const VERSION = 'klangfeld-v3';
const FILES = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'js/engine.js', 'js/visuals.js', 'js/drums.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Netzwerk zuerst (damit Updates sofort ankommen), Cache als Rückfall für offline.
// cache: 'no-cache' zwingt den Browser, beim Server nachzufragen, ob es eine neuere Version gibt,
// statt bis zu 10 Minuten eine alte Kopie aus dem HTTP-Zwischenspeicher zu verwenden.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    fetch(e.request, sameOrigin ? { cache: 'no-cache' } : undefined)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
