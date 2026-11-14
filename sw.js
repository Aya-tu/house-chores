// خدمة التخزين المؤقت: التطبيق يفتح حتى من غير نت، ويجيب آخر نسخة لما النت يرجع
const CACHE = 'kitchen-week-v7';
const ASSETS = [
  './', 'index.html', 'style.css', 'script.js', 'recipes.js',
  'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kitchen-week') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // Firebase والخطوط بره
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});

self.addEventListener('push', (e) => e.waitUntil((async () => {
  let m = { title: 'أسبوع المطبخ', body: 'فيه تحديث جديد 🍳' };
  try {
    const cfg = await (await (await caches.open('kitchen-cfg')).match('cfg')).json();
    const sub = await self.registration.pushManager.getSubscription();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint));
    const id = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const r = await fetch(`${cfg.wk}/msg?id=${id}`);
    if (r.ok) m = await r.json();
  } catch (_) { /* نستخدم الرسالة الافتراضية */ }
  await self.registration.showNotification(m.title, { body: m.body, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar' });
})()));
