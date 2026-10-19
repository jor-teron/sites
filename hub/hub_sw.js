/*
 * Hub service worker (loaded by the root /sw.js stub, so its scope is the whole site).
 * Install (a new build = a new CACHE name): precache a tiny shell, every file fetched with
 * cache:'reload' so the browser's HTTP cache can't hand back an old copy.
 * Fetch: same-origin GET only, always network-first (so a push shows at once); the cache is only
 * a fallback when offline. Navigations fall back to the cached page, then hub/hub_offline.html.
 * Only navigations and the shell files are (re)stored, so ordinary app files are not cached.
 * Cross-origin (PeerJS, CDNs) is not touched.
 * Freshness without ?v=: pages, everything under apps/, and every same-origin html / css / js /
 * csv / json / txt / md WITHOUT a ?v= tag skip the browser HTTP cache (cache:'no-cache'
 * revalidates via ETag, a cheap 304 when unchanged) — so plain links (the category pages,
 * shared/tiles/*) never stay stuck on GitHub Pages' 10-minute cache. Files WITH ?v= are
 * versioned by their url and fetched normally.
 * Bump CACHE when the shell list changes; old caches are deleted on activate. A new worker
 * skips waiting and claims open pages; hub_update.js then reloads them once (no stale shell).
 * Release: bump CACHE here AND the ?v= in the root sw.js (so the browser sees a new worker).
 */
const CACHE = 'hub-shell-v37';  // 2026-10-19m: R9b phone as a key / popup Google sign-in, Drive hub folder
const SHELL = [
  'hub.html',
  'manifest.webmanifest',
  'hub/hub_main.css', 'hub/hub_controller.css', 'hub/hub_notification.css', 'shared/style/no-scrollbar.css',
  'hub/hub_config.js', 'hub/hub_apps.js', 'hub/hub_tiles.js', 'hub/hub.js', 'hub/hub_flyout.js', 'hub/hub_flyout.css', 'hub/wm_mode.js', 'hub/wm_windows.js', 'hub/wm_taskbar.js', 'hub/wm_snap.js', 'hub/wm_workspaces.js', 'shared/wallpaper/wallpapers.js', 'hub/hub_settings.js', 'hub/wm.css', 'hub/hub_wallpapers.js', 'hub/hub_prefs.js', 'hub/hub_update.js', 'hub/version.txt', 'hub/hub_drives.js', 'hub/hub_drives.css', 'shared/fs/fs_drives.js', 'shared/google/google_config.js', 'shared/google/google_auth.js', 'shared/google/gdrive_fs.js', 'shared/google/gdrive_connect.js', 'shared/google/google_gis.js', 'shared/google/phonekey.js', 'hub/hub_phonekey.js', 'shared/google/google.css', 'shared/dialog/dialog.js', 'shared/dialog/dialog.css',
  'shared/ctxmenu/ctxmenu.js', 'shared/ctxmenu/ctxmenu.css', 'shared/ctxmenu/ctx_in_app.js', 'hub/hub_ctx.js', 'hub/hub_ctx_menus.js', 'shared/perf/busy_meter.js', 'hub/hub_traymeter.js', 'shared/tiles/tiles.js', 'shared/tiles/tiles.css', 'hub/hub_controller_config.js',
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
    .then((c) => Promise.all(SHELL.map((p) => fetch(new Request(abs(p), { cache: 'reload' }))   // bypass the HTTP cache
      .then((res) => (res.ok ? c.put(abs(p), res) : null)).catch(() => {}))))   // one missing file must not break install
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hub-shell-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data && e.data.type === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);
  const bare = url.origin + url.pathname;                 // shell files are kept without ?v=
  const keep = req.mode === 'navigate' || SHELL_SET.has(bare);   // don't fill the cache with every app file
  const plain = !url.searchParams.has('v') && /\.(html?|css|m?js|csv|json|txt|md|webmanifest)$/i.test(url.pathname);
  const fresh = req.mode === 'navigate' || url.pathname.includes('/apps/') || plain || url.pathname.endsWith('/');   // revalidate, never a stale HTTP-cache copy
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
