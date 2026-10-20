/*
 * Hub service worker (loaded by the root /sw.js stub, so its scope is the whole site).
 * R16b: cache-first shell + "Update ready" notice.
 * Install (a new build = a new CACHE name): precache the shell (SHELL), every file fetched with
 * cache:'reload' so the browser's HTTP cache can't hand back an old copy. A new worker WAITS
 * (only the very first install activates at once); hub_update.js shows "Update ready · Reload"
 * and posts {type:'skip-waiting'} when Jor clicks Reload. Activate deletes old hub-shell-* caches.
 * Fetch (same-origin GET only; cross-origin — Google APIs / OAuth / Drive, PeerJS signalling,
 * CDNs — is never touched; no-store / reload requests and Range requests pass straight through):
 *   · shell files (SHELL, no ?v= or ?v= this build V): cache first, refreshed in the background
 *     (stale-while-revalidate), so a push shows on the next load.
 *   · shell files with a NEWER ?v= than V (a release arrived before its worker): network first.
 *   · *.csv and hub/version.txt: network first, cached copy when offline.
 *   · pages and files under apps/ (and other same-origin html/css/js): network first, stored in
 *     RUNTIME the first time they're opened, so they also open offline.
 *   · same-origin images: cached copy at once, refreshed in the background (R25, RUNTIME), so an
 *     edited icon / wallpaper shows on the next load; fonts: cache first (RUNTIME).
 *   · navigations not in a cache when offline: hub/update/hub_offline.html.
 * R16c: message {type:'refresh'} re-fetches every SHELL file (cache:'reload') and replaces the
 *   changed ones in place (the cache is never wiped); replies {type:'sw-refreshed', changed:[paths]}.
 * Release: bump V + CACHE here AND the ?v= in the root sw.js (so the browser sees a new worker).
 */
const V = '20261020j';
const CACHE = 'hub-shell-v53';  // 2026-10-20j: R31 hub/ in feature folders
const RUNTIME = 'hub-rt-1';     // app pages / images opened at least once (kept across releases)
const SHELL = [
  'hub.html',
  'manifest.webmanifest',
  'hub/core/hub_main.css', 'hub/controller/hub_controller.css', 'hub/viewer/hub_notification.css', 'hub/menu/hub_flyout.css', 'hub/wm/wm.css', 'hub/link/hub_chat.css', 'hub/drives/hub_drives.css', 'hub/update/hub_update.css',
  'hub/core/hub_role.js', 'hub/core/hub_config.js', 'hub/core/hub_apps.js', 'hub/menu/hub_tiles.js', 'hub/core/hub.js', 'hub/menu/hub_flyout.js', 'hub/core/hub_prefs.js', 'hub/drives/hub_wallpapers.js', 'hub/menu/hub_settings.js',
  'hub/wm/wm_mode.js', 'hub/wm/wm_windows.js', 'hub/wm/wm_taskbar.js', 'hub/wm/wm_snap.js', 'hub/wm/wm_workspaces.js',
  'hub/menu/hub_ctx.js', 'hub/menu/hub_ctx_menus.js', 'hub/drives/hub_traymeter.js', 'hub/controller/hub_controller_config.js', 'hub/viewer/hub_notify.js', 'hub/viewer/hub_viewer.js', 'hub/viewer/hub_viewer_pdf.js',
  'hub/link/hub_pointer.js', 'hub/link/hub_receive.js', 'hub/link/hub_remote.js', 'hub/controller/hub-controller.js', 'hub/controller/hub_textedit.js', 'hub/link/hub_link.js', 'hub/link/hub_linkstate.js',
  'hub/link/hub_chat.js', 'hub/link/hub-gamebar.js', 'hub/drives/hub_drives.js', 'hub/link/hub_phonekey.js', 'hub/update/hub_update.js', 'hub/core/hub_loader.js',
  'hub/controller/kb_common.js', 'hub/osk/osk_layout.js', 'hub/osk/osk_board.js', 'hub/osk/osk_drag.js', 'hub/osk/osk.js', 'hub/osk/osk.css',
  'shared/style/no-scrollbar.css', 'shared/wallpaper/wallpapers.js', 'shared/perf/busy_meter.js', 'shared/vendor/qrcode.js',
  'shared/fs/fs_drives.js', 'shared/fs/fs_ops.js', 'shared/fs/fs_ref.js', 'shared/fs/filetypes.js', 'shared/fs/thumbs_store.js',
  'shared/google/google_config.js', 'shared/google/google_auth.js', 'shared/google/gdrive_fs.js', 'shared/google/gdrive_connect.js', 'shared/google/google_gis.js', 'shared/google/phonekey.js', 'shared/google/google.css',
  'shared/ctxmenu/ctxmenu.js', 'shared/ctxmenu/ctxmenu.css', 'shared/ctxmenu/ctx_in_app.js', 'shared/dialog/dialog.js', 'shared/dialog/dialog.css',
  'shared/tiles/tiles.js', 'shared/tiles/tiles.css', 'shared/favorites/favorites.js',
  'shared/link/link_core.js', 'shared/link/link_devices.js', 'shared/link/link_files.js', 'shared/link/link_ui.js', 'shared/link/link_chat.js', 'shared/link/link_scan.js', 'shared/link/link.css',
  'shared/image/hub_icon_192.png', 'shared/image/hub_icon_512.png',
  // Start menu / taskbar / home icons and the app lists, so a first visit also works offline
  'apps/favorite/favorite_icon.png', 'apps/games/games_icon.png', 'apps/media/media_icon.png', 'apps/office/office_icon.png',
  'apps/connectivity/connectivity_icon.png', 'apps/tools/tools_icon.png', 'apps/lab/lab_icon.png', 'apps/settings/settings_icon.png',
  'apps/tools/files/files_icon.png', 'apps/connectivity/qr-scanner/qr-scanner_icon.png', 'hub/controller/controller_icon.png', 'hub/controller/controller_qr_icon.png',
  'apps/favorite/favorite-apps.csv', 'apps/games/games-apps.csv', 'apps/media/media-apps.csv', 'apps/office/office-apps.csv',
  'apps/connectivity/connectivity-apps.csv', 'apps/tools/tools-apps.csv', 'apps/lab/lab-apps.csv', 'hub/version.txt',
  'hub/update/hub_offline.html',
];
const OFFLINE = 'hub/update/hub_offline.html';
const abs = (p) => new URL(p, self.registration.scope).href;
const SHELL_SET = new Set(SHELL.map(abs));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((p) => fetch(new Request(abs(p), { cache: 'reload' }))   // bypass the HTTP cache
      .then((res) => (res.ok ? c.put(abs(p), res) : null)).catch(() => {}))))   // one missing file must not break install
    .then(() => { if (!self.registration.active) return self.skipWaiting(); }));   // first install only; updates wait for "Reload"
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('hub-shell-') && k !== CACHE) || (k.startsWith('hub-rt-') && k !== RUNTIME) || k === META).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// R16c: shell files that changed since the page that loaded them (the background refresh above
// already stored the new copy) — kept in a tiny 'hub-meta' cache so the 09:00 refresh can report them.
const META = 'hub-meta', DIRTY = abs('__hub_dirty__');
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
async function dirty(add) {
  const m = await caches.open(META);
  const hit = await m.match(DIRTY);
  const list = hit ? await hit.json() : [];
  if (add === null) { await m.delete(DIRTY); return list; }
  if (add && list.indexOf(add) < 0) { list.push(add); await m.put(DIRTY, new Response(JSON.stringify(list))); }
  return list;
}
async function putIfChanged(key, res) {
  try {
    const c = await caches.open(CACHE);
    const old = await c.match(key);
    const a = new Uint8Array(await res.clone().arrayBuffer());
    if (old && same(a, new Uint8Array(await old.arrayBuffer()))) return;
    await c.put(key, res);
    if (old) await dirty(key);
  } catch (_) { /* ignore */ }
}

/** R16c daily refresh: re-fetch every shell file, replace the ones that changed (cache kept, never wiped). */
async function refreshShell() {
  const c = await caches.open(CACHE);
  const changed = [];
  await Promise.all(SHELL.map(async (p) => {
    try {
      const res = await fetch(new Request(abs(p), { cache: 'reload' }));
      if (!ok(res)) return;
      const old = await c.match(abs(p));
      const a = new Uint8Array(await res.clone().arrayBuffer());
      const b = old ? new Uint8Array(await old.arrayBuffer()) : null;
      if (b && same(a, b)) return;
      await c.put(abs(p), res);
      changed.push(p);
    } catch (_) { /* offline: keep the cached copy */ }
  }));
  const seen = await dirty(null);   // changed earlier by a background refresh
  return changed.concat(seen.filter((k) => changed.indexOf(k) < 0));
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
  if (e.data && e.data.type === 'refresh') {
    e.waitUntil(refreshShell().then((changed) => { if (e.source) e.source.postMessage({ type: 'sw-refreshed', changed }); }));
  }
  if (e.data && e.data.type === 'version') e.source && e.source.postMessage({ type: 'sw-version', v: V, cache: CACHE });
});

const ok = (res) => res && res.status === 200 && res.type === 'basic';
function put(name, key, res) { const copy = res.clone(); caches.open(name).then((c) => c.put(key, copy)).catch(() => {}); }

/** Network first; store in `name` under `key`; offline → cached copy (→ offline page for navigations). */
function networkFirst(req, name, key, nav) {
  return fetch(req, { cache: 'no-cache' }).then((res) => { if (ok(res)) put(name, key, res); return res; })
    .catch(() => caches.match(key, { ignoreSearch: true }).then((hit) => hit || (nav ? caches.match(abs(OFFLINE)) : Response.error())));
}
/** Cache first, refresh in the background (the next load gets the new copy). */
function staleWhileRevalidate(e, req, key) {
  const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (ok(res)) putIfChanged(key, res.clone()); return res; });
  e.waitUntil(net.catch(() => {}));
  return caches.open(CACHE).then((c) => c.match(key)).then((hit) => hit || net)
    .catch(() => net);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                    // Google / OAuth / Drive / PeerJS / CDNs: never cached
  if (req.cache === 'no-store' || req.cache === 'reload' || req.headers.has('range')) return;   // update checks, media ranges
  const bare = url.origin + url.pathname;
  const nav = req.mode === 'navigate';
  const v = url.searchParams.get('v');
  const path = url.pathname;

  if (/\.csv$/i.test(path) || path.endsWith('/hub/version.txt')) {
    e.respondWith(networkFirst(req, RUNTIME, bare, false)); return;
  }
  // hub.html (also opened as / or /hub.html?join=…): the shell copy, keyed without the query
  const shellKey = nav && /\/hub\.html$/.test(path) ? bare : (SHELL_SET.has(bare) ? bare : '');
  if (shellKey && (!v || v === V)) { e.respondWith(staleWhileRevalidate(e, req, shellKey)); return; }
  if (shellKey) { e.respondWith(networkFirst(req, CACHE, shellKey, nav)); return; }   // newer ?v= than this worker
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(path)) {   // R25: stale-while-revalidate in RUNTIME
    const net = fetch(req).then((res) => { if (ok(res)) put(RUNTIME, bare, res); return res; });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || net));
    return;
  }
  if (/\.(woff2?|ttf|otf)$/i.test(path)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (ok(res)) put(RUNTIME, bare, res); return res; })));
    return;
  }
  if (nav || path.includes('/apps/') || /\.(html?|css|m?js|json|txt|md|webmanifest)$/i.test(path) || path.endsWith('/')) {
    e.respondWith(networkFirst(req, RUNTIME, nav ? bare : req.url, nav)); return;
  }
});
