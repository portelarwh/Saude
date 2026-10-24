/* Service worker do Meu Equilíbrio: permite instalar e abrir sem internet.
 * Páginas: rede primeiro (cai para a cópia salva). Arquivos do app: cópia salva
 * primeiro, atualizada em segundo plano. Nada de dados pessoais passa por aqui:
 * eles ficam no armazenamento do navegador ou no Supabase. */
const CACHE = 'meu-equilibrio-v1';
const SCOPE = self.registration.scope;
const SHELL = ['', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'].map((p) => new URL(p, SCOPE).toString());

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SCOPE, copy));
          return res;
        })
        .catch(() => caches.match(SCOPE)),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
