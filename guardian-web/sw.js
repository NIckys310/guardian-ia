/* =========================================================
   GUARDIÁN · Service worker
   - Hace que la app sea instalable en PC y celular.
   - Guarda la app, las librerías y los modelos de IA para que
     funcione sin internet después de la primera vez.
   Cuando cambies el código, sube el número de versión.
   ========================================================= */
const VERSION = 'guardian-v1';
const SHELL = [
  './', './index.html', './manifest.json',
  './css/styles.css', './js/app.js', './js/species.js',
  './assets/guardian.svg', './assets/icon-192.png', './assets/icon-512.png'
];
// Librerías, fuentes y pesos de los modelos de IA: se guardan la primera vez
const CACHE_FIRST_HOSTS = [
  'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
  'tfhub.dev', 'www.kaggle.com', 'storage.googleapis.com'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;            // alertas a webhooks, API de Claude: pasan directo
  const url = new URL(req.url);

  // Archivos de la propia app: primero internet (para recibir actualizaciones), si no hay, la copia guardada
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Librerías y modelos: primero la copia guardada (carga instantánea y sin internet)
  if (CACHE_FIRST_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
  // Todo lo demás (mapas, Wikipedia) va directo a internet
});
