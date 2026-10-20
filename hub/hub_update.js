/*
 * Hub updates (hub/hub_update.js) — keeps a stale cached Hub from lingering. Loaded last by
 * hub.html (replaces the old inline service worker registration).
 * - Registers the root sw.js with updateViaCache:'none' (the browser never uses its HTTP cache
 *   for sw.js / hub/hub_sw.js; it also looks for a new worker on its own when the Hub loads).
 *   R16b: a new hub_sw.js WAITS; a small "Update ready · Reload" note (bottom centre, hub_update.css)
 *   appears; Reload posts skip-waiting and the page reloads once the new worker takes over
 *   (the desktop session restores). × hides the note; the update then applies on the next start.
 * - Automatic update check (check() below: reads the live hub.html (no-store), compares its build
 *   tag (?v= of hub/hub.js) with the running one; when newer it updates the worker and (R16b)
 *   shows the "Update ready · Reload" note — no forced reload; Settings → About "Check for
 *   update" (manual) still clears the 'hub-shell-*' caches and reloads; once per build guard):
 *     · once a day at 23:00 local time while the Hub is open (timer to the next 23:00, checked in
 *       steps of at most 1 h so a sleeping computer catches up when it wakes; then the next day);
 *     · on start ONLY when the last automatic check is more than 24 h ago (catch-up), ~4 s in.
 *   The last automatic check time is in localStorage 'sites-hub.updLastAuto' (ms). No more
 *   30-minute or tab-return checks. Settings → About "Check for update" still checks at once.
 * Version: hub/version.txt is the single source (line 1 'v0.299', line 2 release date
 *   'YYYY-MM-DD'). Read with cache:'no-cache' at start; fills #hub-ver (bar / taskbar tray),
 *   sets window.HUB_VERSION ('0.299'); '—' when it can't be read.
 * API window.HubUpdate: build (running ?v= tag), version() → Promise<{version:'v0.299' | '',
 *   date:'2026-10-19' | ''}> (running copy), check({manual}) → Promise<{state:'updated' |
 *   'current' | 'error', version, build}> (Settings → About "Check for update" uses it; the
 *   reload then follows after ~1.2 s), next23(now) → Date of the next 23:00, nextAuto (Date of
 *   the scheduled check), lastAuto() → ms of the last automatic check (0 = never).
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

  // R16b: a new worker waits; "Update ready · Reload" lets Jor choose when (no forced reload)
  let wanted = false;   // true once Reload (or a manual Check for update) asked for the new worker
  let note = null;
  function showNote(reg) {
    if (note || !reg || !reg.waiting) return;
    note = document.createElement('div');
    note.id = 'hub-upd-note';
    note.setAttribute('role', 'status');
    const t = document.createElement('span');
    t.textContent = 'Update ready';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Reload';
    b.addEventListener('click', () => apply(reg));
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'hub-upd-x';
    x.textContent = '\u00d7';
    x.title = 'Later';
    x.setAttribute('aria-label', 'Later');
    x.addEventListener('click', () => { note.hidden = true; });
    note.append(t, b, x);
    document.body.appendChild(note);
  }
  function apply(reg) {
    wanted = true;
    if (reg && reg.waiting) reg.waiting.postMessage({ type: 'skip-waiting' });
    else location.reload();
  }
  function watch(reg) {
    if (!reg) return reg;
    if (reg.waiting && navigator.serviceWorker.controller) showNote(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { if (wanted) apply(reg); else showNote(reg); }
      });
    });
    return reg;
  }
  if (SW_OK) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || !wanted || reloading) return;   // first install / not asked: no reload
      reloading = true;
      location.reload();
    });
    regP = navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(watch).catch(() => null);
  }

  /** hub/version.txt → { version: 'v0.299', date: '2026-10-19' } (blank fields if unreadable). */
  function parseVersion(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim());
    const v = /^v?\d[\w.-]*$/.test(lines[0] || '') ? (lines[0][0] === 'v' ? lines[0] : 'v' + lines[0]) : '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(lines[1] || '') ? lines[1] : '';
    return { version: v, date: d };
  }
  const readVersion = (mode) => fetch('hub/version.txt', { cache: mode })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(parseVersion).catch(() => ({ version: '', date: '' }));
  const running = readVersion('no-cache');
  running.then((v) => {
    if (v.version) window.HUB_VERSION = v.version.slice(1);
    const el = document.getElementById('hub-ver');
    if (el) el.textContent = v.version || '\u2014';
  });

  async function latest() {
    const html = await fetch('hub.html', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
    const build = (html.match(/hub\/hub\.js\?v=([\w.-]+)/) || [])[1] || '';
    const v = await readVersion('no-store');
    return { build, version: v.version, date: v.date };
  }

  async function check(opts) {
    opts = opts || {};
    try {
      const nw = await latest();
      try { const r = await regP; if (r) await r.update(); } catch (_) { /* offline */ }
      if (nw.build && BUILD && nw.build !== BUILD) {
        let tried = '';
        try { tried = sessionStorage.getItem(GUARD) || ''; } catch (_) { /* blocked */ }
        if (!opts.manual && tried === nw.build) return { state: 'current', version: nw.version, build: BUILD };
        try { sessionStorage.setItem(GUARD, nw.build); } catch (_) { /* blocked */ }
        if (!opts.manual) {   // automatic check: the new worker installs, the note asks (no reload)
          const r = await regP;
          if (r) { if (r.waiting) showNote(r); return { state: 'ready', version: nw.version, build: nw.build }; }
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.indexOf('hub-shell-') === 0).map((k) => caches.delete(k)));
        }
        setTimeout(() => location.reload(), opts.manual ? 1200 : 0);
        return { state: 'updated', version: nw.version, build: nw.build };
      }
      return { state: 'current', version: nw.version, build: nw.build || BUILD };
    } catch (_) {
      return { state: 'error', version: '', build: BUILD };
    }
  }

  /* ---------- schedule: daily at 23:00 + catch-up on start when > 24 h ---------- */
  const LAST = 'sites-hub.updLastAuto', DAY = 24 * 3600 * 1000, STEP = 3600 * 1000, AT_HOUR = 23;
  const lastAuto = () => { try { return +localStorage.getItem(LAST) || 0; } catch (_) { return 0; } };
  function next23(now) {
    const d = new Date(now || Date.now());
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), AT_HOUR, 0, 0, 0);
    if (t <= d) t.setDate(t.getDate() + 1);
    return t;
  }
  function auto() {
    try { localStorage.setItem(LAST, String(Date.now())); } catch (_) { /* blocked */ }
    return check({});
  }
  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    const target = next23();
    api.nextAuto = target;
    const wait = () => {
      const left = target - Date.now();
      if (left <= 0) { auto(); schedule(); return; }
      timer = setTimeout(wait, Math.min(left, STEP));
    };
    timer = setTimeout(wait, Math.min(target - Date.now(), STEP));
  }

  const api = window.HubUpdate = { build: BUILD, check, version: () => running, next23, nextAuto: null, lastAuto };
  if (location.protocol.startsWith('http')) {
    if (Date.now() - lastAuto() > DAY) setTimeout(auto, 4000);   // catch-up: missed for more than a day
    schedule();
  }
})();
