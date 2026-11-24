// Service Worker: App offline verfügbar machen (stale-while-revalidate)
const CACHE = 'gymlog-v3.7.1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/actions.js',
  'js/ai.js',
  'js/app.js',
  'js/boot.js',
  'js/avatar.js',
  'js/balance.js',
  'js/body.js',
  'js/bodymap.js',
  'js/bwEditor.js',
  'js/challengeEditor.js',
  'js/compete.js',
  'js/charts.js',
  'js/components.js',
  'js/csv.js',
  'js/demo.js',
  'js/db.js',
  'js/fighter.js',
  'js/fight.js',
  'js/fx.js',
  'js/gamification.js',
  'js/goals.js',
  'js/intro.js',
  'js/group.js',
  'js/groupcalc.js',
  'js/guided.js',
  'js/cardioBuilder.js',
  'js/library.js',
  'js/look.js',
  'js/nav.js',
  'js/picker.js',
  'js/onboarding.js',
  'js/poses.js',
  'js/master.js',
  'js/programs.js',
  'js/showdown.js',
  'js/stats.js',
  'js/sanitize.js',
  'js/sync.js',
  'js/store.js',
  'js/theme.js',
  'js/tickets.js',
  'js/ui.js',
  'js/update.js',
  'js/utils.js',
  'js/version.js',
  'js/workout.js',
  'js/views/badges.js',
  'js/views/exercises.js',
  'js/views/home.js',
  'js/views/join.js',
  'js/views/league.js',
  'js/views/profile.js',
  'js/views/plan.js',
  'js/coach/core.js',
  'js/coach/similar.js',
  'js/coach/splits.js',
  'js/coach/assess.js',
  'js/coach/plan.js',
  'js/coach/review.js',
  'js/coach/nutrition.js',
  'js/coach/setup.js',
  'js/views/stats.js',
  'js/views/training.js',
  'js/views/workoutDetail.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/icon-maskable-512.png',
  'sounds/rekord.m4a',
  'sounds/arena.m4a',
];

// Beim Update immer frisch vom Server laden (nicht aus dem Browser-Cache, GitHub Pages cacht 10 Minuten)
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
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
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  const isNav = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(isNav ? 'index.html' : req, { ignoreSearch: true });
    const network = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res && res.ok) cache.put(isNav ? 'index.html' : req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    return (await network) || new Response('Offline', { status: 503 });
  })());
});
