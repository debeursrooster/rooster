// Service worker: pushmeldingen tonen en de app installeerbaar maken.
// Er wordt bewust niets gecachet, zodat je altijd de nieuwste versie ziet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request));
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
