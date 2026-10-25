const CACHE = "wj-static-v1";
const ASSETS = [
  "./css/global.css", "./css/login.css", "./css/dashboard.css",
  "./css/financeiro.css", "./css/estoque.css", "./css/consumo.css",
  "./css/financas-pessoais.css", "./assets/logo.png",
  "./assets/icon-180.png", "./assets/icon-192.png",
  "./assets/icon-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE).map(key => caches.delete(key))
  )));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") return;
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
