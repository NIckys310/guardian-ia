/* =========================================================
   GUARDIÁN · Service worker
   - Hace que la app sea instalable en PC y celular.
   - Guarda la app, las librerías y los modelos de IA para que
     funcione sin internet después de la primera vez.
   Cuando cambies el código, sube el número de versión.
   ========================================================= */
const VERSION = 'guardian-v3';
const SHELL = ['./', './index.html', './manifest.json', './assets/guardian.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png', './css/animations.css', './css/base.css', './css/components.css', './css/layout.css', './css/views/auth.css', './css/views/chat.css', './css/views/devices.css', './css/views/map.css', './css/views/panel.css', './css/views/records.css', './css/views/reports.css', './css/views/scanner.css', './css/views/settings.css', './css/views/stats.css', './js/app.js', './js/config.js', './js/core/bus.js', './js/core/dom.js', './js/core/local-db.js', './js/data/groups.js', './js/data/species-colombia.js', './js/data/species.js', './js/services/ai-cloud.js', './js/services/ai-local.js', './js/services/auth.js', './js/services/cloud.js', './js/services/events.js', './js/services/geo.js', './js/services/notify.js', './js/services/repo.js', './js/services/settings.js', './js/ui/charts.js', './js/ui/icons.js', './js/ui/lightbox.js', './js/ui/modal.js', './js/ui/species-ui.js', './js/ui/toast.js', './js/views/alerts.js', './js/views/auth.js', './js/views/chat.js', './js/views/devices.js', './js/views/map.js', './js/views/pair.js', './js/views/panel.js', './js/views/records.js', './js/views/reports.js', './js/views/scanner.js', './js/views/settings.js', './js/views/stats.js', './js/views/trash.js'];
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
  if (req.method !== 'GET') return;            // nube, IA y webhooks pasan directo
  const url = new URL(req.url);
  if (url.pathname.startsWith('/.netlify/')) return;

  // Archivos de la propia app: primero internet (para recibir actualizaciones), si no hay, la copia guardada
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
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
  // Todo lo demás (Supabase, mapas, Wikipedia) va directo a internet
});

/* Al tocar una notificación, abre Guardián en Alertas */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    const w = list.find((c) => 'focus' in c);
    if (w) { w.navigate('./#/alertas'); return w.focus(); }
    return self.clients.openWindow('./#/alertas');
  }));
});
