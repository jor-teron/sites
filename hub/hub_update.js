/*
 * Hub updates (hub/hub_update.js) — keeps a stale cached Hub from lingering. Loaded last by
 * hub.html (replaces the old inline service worker registration).
 * - Registers the root sw.js with updateViaCache:'none' (the browser never uses its HTTP cache
 *   for sw.js / hub/hub_sw.js), checks for a new worker every 30 min and whenever the tab is
 *   shown again. hub_sw.js skips waiting + claims clients, and when a NEW worker takes control
 *   of a page that already had one, the Hub reloads once (the desktop session restores).
 * - Stale-shell guard: ~4 s after start it reads the live hub.html (no-store) and compares its
 *   build tag (?v= of hub/hub.js) with the running one; when newer it clears the 'hub-shell-*'
 *   caches, updates the worker and reloads (once per build, sessionStorage guard against loops).
 * API window.HubUpdate: build (running ?v= tag), check({manual}) → Promise<{state:'updated' |
 *   'current' | 'error', version, build}> (Settings → About "Check for update" uses it; the
 *   reload then follows after ~1.2 s).
 */
(function () {
  'use strict';
  const me = document.currentScript;
  const tag = (src) => ((String(src || '').match(/\?v=([\w.-]+)/) || [])[1] || '');
  const hubJs = document.querySelector('script[src*="hub/hub.js?v="]');
  const BUILD = tag(hubJs && hubJs.getAttribute('src')) || tag(me && me.src);
  const SW_OK = 'serviceWorker' in navigator && location.protocol.startsWith('http');
  const GUARD = 'sites-hub.updTried';
  let regP = Promise.resolve(null);

  if (SW_OK) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;   // first install: nothing stale to replace
      reloading = true;
      location.reload();
    });
    regP = navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => null);
    const poke = () => regP.then((r) => r && r.update()).catch(() => {});
    setInterval(poke, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poke(); });
  }

  async function latest() {
    const html = await fetch('hub.html', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
    const build = (html.match(/hub\/hub\.js\?v=([\w.-]+)/) || [])[1] || '';
    let version = '';
    try {
      const cfg = await fetch('hub/hub_config.js?v=' + build + '&t=' + Date.now(), { cache: 'no-store' }).then((r) => r.text());
      version = (cfg.match(/HUB_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || '';
    } catch (_) { /* blank */ }
    return { build, version };
  }

  async function check(opts) {
    opts = opts || {};
    try {
      const nw = await latest();
      try { const r = await regP; if (r) await r.update(); } catch (_) { /* offline */ }
      if (nw.build && BUILD && nw.build !== BUILD) {
        let tried = '';
        try { tried = sessionStorage.getItem(GUARD) || ''; } catch (_) { /* blocked */ }
        if (!opts.manual && tried === nw.build) return { state: 'current', version: window.HUB_VERSION || '', build: BUILD };
        try { sessionStorage.setItem(GUARD, nw.build); } catch (_) { /* blocked */ }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.indexOf('hub-shell-') === 0).map((k) => caches.delete(k)));
        }
        setTimeout(() => location.reload(), opts.manual ? 1200 : 0);
        return { state: 'updated', version: nw.version, build: nw.build };
      }
      return { state: 'current', version: nw.version || window.HUB_VERSION || '', build: nw.build || BUILD };
    } catch (_) {
      return { state: 'error', version: window.HUB_VERSION || '', build: BUILD };
    }
  }

  window.HubUpdate = { build: BUILD, check };
  if (location.protocol.startsWith('http')) setTimeout(() => { check({}); }, 4000);
})();
