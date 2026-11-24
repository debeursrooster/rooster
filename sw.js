// Service worker: pushmeldingen tonen, de app installeerbaar maken en nieuwe versies melden.
// Er wordt bewust niets gecachet, zodat je altijd de nieuwste versie ziet.
//
// NIEUWE VERSIE UITBRENGEN: verhoog VERSIE hieronder én "versie" in versie.json.
// Wie de app open heeft, krijgt dan bovenin "Nieuwe versie beschikbaar" met een knop Bijwerken.
const VERSIE = '1.0';

// Pas overnemen als er op "Bijwerken" getikt wordt
self.addEventListener('install', () => {});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'GET_VERSION' && e.ports[0]) e.ports[0].postMessage(VERSIE);
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Supabase e.d. ongemoeid
  if (req.headers.has('range')) return;
  // Altijd bij GitHub controleren of er iets nieuws is (geen verouderde bestanden uit de browsercache)
  e.respondWith(fetch(req, { cache: 'no-cache' }).catch(() => fetch(req)));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Rooster', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || 'index.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const doel = new URL((e.notification.data && e.notification.data.url) || 'index.html', self.registration.scope).href;
  const pagina = doel.split('#')[0];
  e.waitUntil((async () => {
    const lijst = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lijst) {
      if (c.url.split('#')[0] === pagina && 'focus' in c) {
        await c.focus();
        try { await c.navigate(doel); } catch (x) { }
        return;
      }
    }
    await self.clients.openWindow(doel);
  })());
});
