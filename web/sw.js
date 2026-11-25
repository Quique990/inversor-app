// Service worker: la app funciona sin conexión con los últimos datos descargados.
// Estrategia: código -> caché primero; datos de mercado -> red primero. Nunca cachea la API de GitHub.
const VERSION = "inversor-v8";
const NUCLEO = [
  "./", "./index.html", "./css/app.css", "./manifest.webmanifest",
  "./vendor/chart.umd.min.js", "./vendor/hammer.min.js", "./vendor/chartjs-plugin-zoom.min.js",
  "./js/app.js", "./js/dom.js", "./js/store.js", "./js/cripto.js", "./js/finanzas.js", "./js/reco.js",
  "./js/diners.js", "./js/perfil.js", "./js/graficas.js", "./js/importar_excel.js", "./js/importar_tr.js", "./js/intradia.js",
  "./js/vistas/hoy.js", "./js/vistas/cartera.js", "./js/vistas/diners.js", "./js/vistas/mercado.js", "./js/vistas/ajustes.js", "./js/vistas/como.js", "./js/vistas/intradia.js",
  "./icons/icon-192.png", "./icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(NUCLEO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return; // GitHub API: siempre red
  if (url.pathname.includes("/data/")) {
    e.respondWith(fetch(e.request).then((r) => {
      const copia = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
