/*
 * Hub service worker (loaded by the root /sw.js stub, so its scope is the whole site).
 * Install: precache a tiny shell. Fetch: same-origin GET only, always network-first (so a
 * push shows at once); the cache is only a fallback when offline. Navigations fall back to
 * the cached page, then hub/hub_offline.html. Only navigations and the shell files are
 * (re)stored, so ordinary app files are not cached. Cross-origin (PeerJS, CDNs) is not touched.
 * App pages and apps/* files skip the browser HTTP cache (cache:'no-cache' revalidates via ETag),
 * so a phone never gets a stale copy after a push.
 * Bump CACHE when the shell list changes; old caches are deleted on activate.
 */
const CACHE = 'hub-shell-v22';  // 2026-10-18c: menu category icons + desktop hover flyout
const SHELL = [
  'hub.html',
  'manifest.webmanifest',
  'hub/hub_main.css', 'hub/hub_controller.css', 'hub/hub_notification.css', 'shared/style/no-scrollbar.css',
  'hub/hub_config.js', 'hub/hub_apps.js', 'hub/hub_tiles.js', 'hub/hub.js', 'hub/hub_flyout.js', 'hub/hub_flyout.css', 'shared/tiles/tiles.js', 'hub/hub_controller_config.js',
  'hub/hub_notify.js', 'hub/hub_viewer.js', 'hub/hub_viewer_pdf.js', 'hub/hub_pointer.js', 'hub/hub_receive.js',
  'hub/hub_role.js', 'hub/hub_remote.js', 'shared/link/link_scan.js',
  'hub/hub-controller.js', 'hub/hub_link.js', 'hub/hub_linkstate.js', 'hub/hub_chat.js', 'hub/hub_chat.css', 'shared/link/link_chat.js', 'hub/hub-gamebar.js',
  'shared/link/link_core.js', 'shared/link/link_devices.js', 'shared/link/link_files.js', 'shared/link/link_ui.js', 'shared/link/link.css',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', 'shared/vendor/qrcode.js',
  'shared/image/hub_icon_192.png', 'shared/image/hub_icon_512.png',
  'hub/hub_offline.html',
];
const OFFLINE = 'hub/hub_offline.html';
const abs = (p) => new URL(p, self.registration.scope).href;
const SHELL_SET = new Set(SHELL.map(abs));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((p) => c.add(abs(p)).catch(() => {}))))   // one missing file must not break install
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hub-shell-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);
  const bare = url.origin + url.pathname;                 // shell files are kept without ?v=
  const keep = req.mode === 'navigate' || SHELL_SET.has(bare);   // don't fill the cache with every app file
  const fresh = req.mode === 'navigate' || url.pathname.includes('/apps/');   // revalidate, never a stale HTTP-cache copy
  e.respondWith((fresh ? fetch(req, { cache: 'no-cache' }) : fetch(req)).then((res) => {
    if (keep && res && res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? req : bare, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => {
    if (hit) return hit;
    if (req.mode === 'navigate') return caches.match(abs(OFFLINE));
    return Response.error();
  })));
});
