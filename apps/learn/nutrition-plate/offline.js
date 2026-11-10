/* App-scoped offline shell. Does not change or unregister the Hub service worker. */
const CACHE = 'nutrition-plate-1a';
const FILES = ['./', 'index.html', 'nutrition-plate.html', 'nutrition-plate_icon.png',
  'ui/nutrition.css', 'ui/app.js', 'ui/icons.js', 'core/foods.js', 'core/plate.js',
  '../shared/learn-hubbar.js', '../../../shared/theme/hub_theme.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('nutrition-plate-') && k !== CACHE)
    .map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request, { ignoreSearch: true })) || fetch(event.request)));
});
