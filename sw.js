// Service Worker: App offline verfügbar machen (stale-while-revalidate)
const CACHE = 'gymlog-v2.1.0';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/actions.js',
  'js/ai.js',
  'js/app.js',
  'js/balance.js',
  'js/bodymap.js',
  'js/charts.js',
  'js/components.js',
  'js/csv.js',
  'js/db.js',
  'js/fighter.js',
  'js/fx.js',
  'js/gamification.js',
  'js/guided.js',
  'js/library.js',
  'js/nav.js',
  'js/picker.js',
  'js/programs.js',
  'js/stats.js',
  'js/store.js',
  'js/theme.js',
  'js/ui.js',
  'js/utils.js',
  'js/version.js',
  'js/workout.js',
  'js/views/badges.js',
  'js/views/exercises.js',
  'js/views/home.js',
  'js/views/profile.js',
  'js/views/stats.js',
  'js/views/training.js',
  'js/views/workoutDetail.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isNav = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(isNav ? 'index.html' : req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(isNav ? 'index.html' : req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    return (await network) || new Response('Offline', { status: 503 });
  })());
});
