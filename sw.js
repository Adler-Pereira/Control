// Service worker do Control Critic: deixa o app instalável e abre mais rápido.
// Arquivos do site: busca na rede e guarda cópia (funciona offline com a última versão).
// Dados (Supabase, IGDB, funções) nunca são guardados em cache.
const VERSAO = 'cc-v3';
const ESSENCIAIS = ['/', '/index.html', '/css/style.css', '/js/app.js', '/js/config.js', '/img/ControlHeader.png', '/img/Adelino.png', '/img/Control.png', '/img/perfilpadrao.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/.netlify/')) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
