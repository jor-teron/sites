/*
 * Hub updates (hub/update/hub_update.js) — keeps a stale cached Hub from lingering. Loaded last by
 * hub.html (replaces the old inline service worker registration).
 * - Registers the root sw.js with updateViaCache:'none' (the browser never uses its HTTP cache
 *   for sw.js / hub/update/hub_sw.js; it also looks for a new worker on its own when the Hub loads).
 *   R50: the note below is replaced by the #upd-btn indicator (tray / top bar) that opens Settings > About.
 *   R16b: a new hub_sw.js WAITS; a small "Update ready · Reload" note (bottom centre, hub_update.css)
 *   appears; Reload posts skip-waiting and the page reloads once the new worker takes over
 *   (the desktop session restores). × hides the note; the update then applies on the next start.
 * - H52: AUTO UPDATE EVERY N DAYS (replaces the R16c 09:00 rule below; that code is kept as comments).
 *   N = Settings → About "Auto update every" (localStorage 'sites-hub.updEvery' = 7 | 15 | 30, empty = 1 day).
 *   The auto update (refresh() below) runs when EITHER comes first:
 *     a) the last auto update ('sites-hub.lastRefresh', ms) is N × 24 h old or more (checked on load too), or
 *     b) 6 AM local time once the interval has (nearly) passed: during 06:00–06:59 of any morning at least
 *        N − 1 days after the last run (N = 1: every morning; N = 7: the morning of day 7). Only while the Hub
 *        is open in that hour; a missed 6 AM (Hub closed / asleep) falls back to rule a).
 *   Never run (no lastRefresh) = due now. Checked 5 s after load, then on a timer (≤ 1 h steps, so a sleeping
 *   computer catches up), when the tab becomes visible again, and re-planned live when N changes. A failed run
 *   retries after 1 h. Busy-safe (unchanged, R16c / R23 / R56): it reloads ONLY when idleNow() (Desktop: no
 *   windows; Phone: no app open); otherwise the Update indicator shows (Hub bar Update off → a dot on Start).
 *   Last build change: 'sites-hub.lastBuild' (running ?v= tag) and 'sites-hub.lastUpdated' (ms when this device
 *   first ran it); About shows them. API: HubUpdate.every(), dueAt(last, n, now) (next run, ms), due(now), sixAfter(t).
 * - (R16c, before H52) Daily refresh at 09:00 browser local time, or on the next open after a missed 09:00:
 *   reg.update() + the worker re-fetches the shell and replaces changed files (cache kept).
 *   Changed → quiet reload when no app / window is open, else the "Update ready" note.
 *   R23: a new worker still installing is awaited first, then skip-waiting → reload on takeover.
 *   Last run in localStorage 'sites-hub.lastRefresh' (ms). (The old 23:00 check is gone.)
 * - check({manual}) — Settings → About "Check for update": compares the live hub.html build tag
 *   with the running one; when newer: R24 a waiting new worker takes over (skip-waiting →
 *   reload, caches kept); with no new worker it clears the 'hub-shell-*' caches and reloads.
 *   R58: only a MANUAL check may clear caches / reload; an automatic one never does (with no worker
 *   it just reports 'ready'). Every check also asks the worker to retry shell files its install
 *   missed ({type:'retry-failed'}, hub_sw.js).
 * - clearCache() — Settings → About "Clear cache now": deletes hub-shell-* / hub-rt-* caches and
 *   the cached Start list (sites-hub.startList), unregisters the worker, reloads.
 * Version: hub/version.txt is the single source (line 1 'v0.299', line 2 release date
 *   'YYYY-MM-DD'). Read with cache:'no-cache' at start (R58: not on file://, where fetch fails); fills #hub-ver (bar / taskbar tray),
 *   sets window.HUB_VERSION ('0.299'); '—' when it can't be read.
 * API window.HubUpdate: build (running ?v= tag), version() → Promise<{version:'v0.299' | '',
 *   date:'2026-10-19' | ''}> (running copy), check({manual}) → Promise<{state:'updated' |
 *   'current' | 'ready' | 'error' | 'file' (R59: opened as a file, nothing checked), version, build}> (Settings → About "Check for update" uses it; the
 *   reload then follows after ~1.2 s), refresh(), clearCache(), lastRefresh() → ms (0 = never), last9 / next9(now), nextRefresh.
 */
(function () {
  'use strict';
  const me = document.currentScript;
  const tag = (src) => ((String(src || '').match(/\?v=([\w.-]+)/) || [])[1] || '');
  const hubJs = document.querySelector('script[src*="hub/core/hub.js?v="]');
  const BUILD = tag(hubJs && hubJs.getAttribute('src')) || tag(me && me.src);
  const SW_OK = 'serviceWorker' in navigator && location.protocol.startsWith('http');
  const GUARD = 'sites-hub.updTried';
  let regP = Promise.resolve(null);

  // R16b: a new worker waits; "Update ready · Reload" lets Jor choose when (no forced reload)
  let wanted = false;   // true once Reload (or a manual Check for update) asked for the new worker
  /* R50: the bottom-centre "Update ready · Reload" toast is retired (kept below, commented out).
     Now a small indicator #upd-btn (hub.html, in .header-right: the taskbar tray in Desktop mode,
     the top bar in Phone mode) shows while a new build waits. Click / tap → Settings > About, where
     the existing Update button applies it. Never reloads by itself, never covers anything. */
  const updBtn = document.getElementById('upd-btn');
  if (updBtn) updBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.__hubOpenApp) window.__hubOpenApp('apps/system/settings/', { hash: 'about' });
  });
  function showNote(reg) {   // R50: name kept (callers + HubUpdate.showNote); shows the indicator
    if (reg) lastReg = reg;
    if (updBtn) updBtn.hidden = false;
    document.documentElement.classList.add('hub-upd-ready');   // H52: the dot on Start when the Hub bar hides Update
  }
  /* R50 legacy (R16b toast), not used any more:
  // let note = null;
  // function showNote(reg) {
  //   if (note) { note.hidden = false; return; }
  //   note = document.createElement('div');
  //   note.id = 'hub-upd-note';
  //   note.setAttribute('role', 'status');
  //   const t = document.createElement('span');
  //   t.textContent = 'Update ready';
  //   const b = document.createElement('button');
  //   b.type = 'button';
  //   b.textContent = 'Reload';
  //   b.addEventListener('click', () => apply(reg));
  //   const x = document.createElement('button');
  //   x.type = 'button';
  //   x.className = 'hub-upd-x';
  //   x.textContent = '\u00d7';
  //   x.title = 'Later';
  //   x.setAttribute('aria-label', 'Later');
  //   x.addEventListener('click', () => { note.hidden = true; });
  //   note.append(t, b, x);
  //   document.body.appendChild(note);
  // }
  */
  function apply(reg) {
    wanted = true;
    reg = reg || lastReg;
    if (reg && reg.waiting) reg.waiting.postMessage({ type: 'skip-waiting' });
    else location.reload();
  }
  let lastReg = null;
  /** R23: a worker still installing → wait until it is installed (or failed); resolves reg. */
  function settle(reg) {
    const w = reg && reg.installing;
    if (!w) return Promise.resolve(reg);
    return new Promise((res) => {
      const t = setTimeout(() => res(reg), 30000);
      w.addEventListener('statechange', () => { if (w.state !== 'installing') { clearTimeout(t); res(reg); } });
    });
  }
  function watch(reg) {
    if (!reg) return reg;
    lastReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) showNote(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { if (wanted || (refreshing && idleNow())) apply(reg); else showNote(reg); }
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
  const readVersion = (mode) => (location.protocol === 'file:' ? Promise.resolve({ version: '', date: '' }) : fetch('hub/version.txt', { cache: mode })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(parseVersion).catch(() => ({ version: '', date: '' })));   // R58: file:// skips the fetch
  const running = readVersion('no-cache');
  running.then((v) => {
    if (v.version) window.HUB_VERSION = v.version.slice(1);
    // R41: #hub-ver was removed from hub.html (no version on screen); kept null-safe in case Jor puts it back.
    const el = document.getElementById('hub-ver');
    if (el) el.textContent = v.version || '\u2014';
  });

  async function latest() {
    const html = await fetch('hub.html', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
    const build = (html.match(/hub\/core\/hub\.js\?v=([\w.-]+)/) || [])[1] || '';
    const v = await readVersion('no-store');
    return { build, version: v.version, date: v.date };
  }

  async function check(opts) {
    opts = opts || {};
    if (location.protocol === 'file:') return { state: 'file', version: '', build: BUILD };   // R59: nothing to fetch on file://
    try {
      const nw = await latest();
      try { const r = await regP; if (r) await r.update(); } catch (_) { /* offline */ }
      try { const c = SW_OK && navigator.serviceWorker.controller; if (c) c.postMessage({ type: 'retry-failed' }); } catch (_) { /* none */ }   // R58
      if (nw.build && BUILD && nw.build !== BUILD) {
        let tried = '';
        try { tried = sessionStorage.getItem(GUARD) || ''; } catch (_) { /* blocked */ }
        if (!opts.manual && tried === nw.build) return { state: 'current', version: nw.version, build: BUILD };
        try { sessionStorage.setItem(GUARD, nw.build); } catch (_) { /* blocked */ }
        if (!opts.manual) {   // automatic check: the new worker installs, the note asks (no reload)
          const r = await regP;
          if (r && r.waiting) showNote(r);
          return { state: 'ready', version: nw.version, build: nw.build };   // R58: never clears caches / reloads
        }
        const r = await regP;   // R24: a new worker is in → let it take over (shell caches kept)
        if (r && (await settle(r)).waiting) { setTimeout(() => apply(r), 1200); return { state: 'updated', version: nw.version, build: nw.build }; }
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

  /* ---------- R16c: daily refresh at 09:00 (browser local time) ---------- */
  // The shell files are re-fetched in the background and replaced in the cache (never wiped).
  // Missed 09:00 (Hub closed)? → done on the next open after it. Last run: localStorage
  // 'sites-hub.lastRefresh' (ms). Something changed (new worker or files) → no windows open:
  // quiet reload; windows open: the "Update ready" note.
  const LAST = 'sites-hub.lastRefresh', STEP = 3600 * 1000, AT_HOUR = 9;
  const lastRefresh = () => { try { return +localStorage.getItem(LAST) || 0; } catch (_) { return 0; } };
  /* ---------- H52: auto update every N days, or at 06:00 when the interval ends ---------- */
  const DAY = 24 * 3600 * 1000, AT6 = 6, EVERY_KEY = 'sites-hub.updEvery', EVERY_OK = [1, 7, 15, 30];
  /** Settings → About "Auto update every": 1 (default) | 7 | 15 | 30 days */
  const every = () => { let n = 1; try { n = +localStorage.getItem(EVERY_KEY) || 1; } catch (_) { /* blocked */ } return EVERY_OK.indexOf(n) >= 0 ? n : 1; };
  /** The first 06:00 (local) strictly after t (ms) → ms. */
  function sixAfter(t) {
    const d = new Date(t);
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), AT6, 0, 0, 0);
    if (x.getTime() <= t) x.setDate(x.getDate() + 1);
    return x.getTime();
  }
  const SIX_WIN = 3600 * 1000;   // the 6 AM rule's window: 06:00–06:59
  const normN = (n) => (EVERY_OK.indexOf(+n) >= 0 ? +n : 1);
  /** Start of the 6 AM window that counts now: the first 06:00 after max(last + (n − 1) days, now − 1 h). */
  const sixStart = (last, n, now) => sixAfter(Math.max(last + (normN(n) - 1) * DAY, now - SIX_WIN));
  /** When the next auto update is due (ms): last + n days, or the next 6 AM window, whichever is first (0 = now). */
  function dueAt(last, n, now) {
    if (!last) return 0;   // never ran → now
    now = now || Date.now();
    return Math.min(last + normN(n) * DAY, sixStart(last, n, now));
  }
  /** H52 rule at `now` for (last, n): never ran, or n days old, or inside the 6 AM window. */
  function dueRule(last, n, now) {
    if (!last) return true;
    if (now - last >= normN(n) * DAY) return true;
    const s6 = sixStart(last, n, now);
    return now >= s6 && now < s6 + SIX_WIN;
  }
  /** The latest 09:00 at or before `now`. */
  function last9(now) {
    const d = new Date(now || Date.now());
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), AT_HOUR, 0, 0, 0);
    if (t > d) t.setDate(t.getDate() - 1);
    return t;
  }
  const next9 = (now) => { const t = last9(now); t.setDate(t.getDate() + 1); return t; };
  // const due = (now) => lastRefresh() < last9(now).getTime();   // R16c (before H52): daily at 09:00
  const due = (now) => dueRule(lastRefresh(), every(), now || Date.now());   // H52
  /** No app open: Desktop → no windows; Phone → no app in the frame.
   *  R56: Phone mode asks hub.js (window.__hubCurrentEntry). The frame's src attribute is NOT a signal:
   *  hub.js navigates it with contentWindow.location.replace, so src stayed empty and the 09:00 refresh
   *  could reload the Hub over an open app / game. Fallbacks: the home screen (#empty) is hidden while
   *  an app is open; frame.dataset.app is the last url hub.js navigated to ('about:blank#…' = home). */
  function idleNow() {
    if (window.HubWM && window.HubMode && HubMode.isDesktop()) return HubWM.list().length === 0;
    if (typeof window.__hubCurrentEntry === 'function') return !window.__hubCurrentEntry();
    const empty = document.getElementById('empty');
    if (empty) return !empty.classList.contains('hidden');
    const f = document.getElementById('app-frame');
    const u = f ? f.dataset.app || f.getAttribute('src') || '' : '';
    return !u || /^about:blank/.test(u);
  }
  let refreshing = false;
  function askWorker() {
    return new Promise((res) => {
      const c = SW_OK && navigator.serviceWorker.controller;
      if (!c) { res([]); return; }
      const done = (e) => { if (e.data && e.data.type === 'sw-refreshed') { navigator.serviceWorker.removeEventListener('message', done); res(e.data.changed || []); } };
      navigator.serviceWorker.addEventListener('message', done);
      c.postMessage({ type: 'refresh' });
      setTimeout(() => { navigator.serviceWorker.removeEventListener('message', done); res(null); }, 60000);   // H12: null = no answer
    });
  }
  let refreshAt = 0;   // H12: when the current run started (a stuck run stops blocking after 90 s)
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  async function refresh() {
    if (refreshing && Date.now() - refreshAt < 90000) return { changed: [] };
    refreshing = true;
    refreshAt = Date.now();
    try {
      let reg = null, ok = true;
      try { reg = await regP; if (reg) await withTimeout(reg.update(), 60000); } catch (_) { ok = false; /* offline / hung */ }
      const answer = await askWorker();
      if (answer === null) ok = false;
      const changed = answer || [];
      if (ok) { try { localStorage.setItem(LAST, String(Date.now())); } catch (_) { /* blocked */ } }   // H12: only on success
      const newWorker = !!(reg && (reg.waiting || reg.installing));
      if (changed.length || newWorker) {
        if (!idleNow()) showNote(reg);
        else { await settle(reg); if (idleNow()) apply(reg); else showNote(reg); }   // R23: never reload onto the old worker
      }
      return { changed, newWorker };
    } finally {
      refreshing = false;
    }
  }
  let timer = 0;
  /* R16c (before H52): the 09:00 timer
  function schedule() {
    clearTimeout(timer);
    const target = next9();
    api.nextRefresh = target;
    const wait = () => {
      if (Date.now() >= target.getTime()) { refresh(); schedule(); return; }
      if (due() && !refreshing) refresh();   // H12: a failed refresh retries at the next hourly check
      timer = setTimeout(wait, Math.min(target - Date.now(), STEP));   // ≤ 1 h steps: a sleeping computer catches up
    };
    timer = setTimeout(wait, Math.min(target - Date.now(), STEP));
  }
  */
  // H52: one timer; tick() runs the auto update when due (a failed run retries after STEP), then re-plans.
  let lastTry = 0;
  function schedule(first) {
    clearTimeout(timer);
    const now = Date.now(), isDue = due(now), at = dueAt(lastRefresh(), every(), now);
    api.nextRefresh = new Date(isDue ? now : at);
    const ms = isDue ? lastTry + STEP - now : at - now;
    timer = setTimeout(tick, Math.max(first || 1000, Math.min(ms, STEP)));   // ≤ 1 h steps: a sleeping computer catches up
  }
  function tick() {
    const now = Date.now();
    if (due(now) && !refreshing && now - lastTry >= STEP) {
      lastTry = now;
      Promise.resolve().then(() => api.refresh()).catch(() => null).then(() => schedule());
      return;
    }
    schedule();
  }
  // H52: remember when this device first ran each build ('Last updated' in Settings → About)
  try {
    if (BUILD && localStorage.getItem('sites-hub.lastBuild') !== BUILD) {
      localStorage.setItem('sites-hub.lastBuild', BUILD);
      localStorage.setItem('sites-hub.lastUpdated', String(Date.now()));
    }
  } catch (_) { /* blocked */ }

  /** Settings → About "Clear cache now": Hub caches + cached Start list, then reload. */
  async function clearCache() {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => /^hub-(shell|rt)-/.test(k)).map((k) => caches.delete(k)));
    }
    try { localStorage.removeItem('sites-hub.startList'); localStorage.removeItem(LAST); } catch (_) { /* blocked */ }
    try { const r = await regP; if (r) await r.unregister(); } catch (_) { /* none */ }
    location.reload();
  }

  const api = window.HubUpdate = { build: BUILD, check, version: () => running, refresh, clearCache,
    lastRefresh, last9, next9, nextRefresh: null, showNote: () => showNote(lastReg),
    every, dueAt, due, dueRule, sixAfter, tick, schedule };   // H52
  if (location.protocol.startsWith('http')) {
    // if (due()) setTimeout(() => { if (due()) refresh(); }, 5000);   // missed 09:00 → on this open (R16c, before H52)
    // schedule();
    schedule(5000);   // H52: first check 5 s after load (due → auto update), then the timer
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
    // the interval changed in Settings → About (other tab: storage event; Settings frame: its hub-prefs message)
    window.addEventListener('storage', (e) => { if (e.key === EVERY_KEY || e.key === LAST) schedule(); });
    window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'hub-prefs' && e.data.key === 'updEvery') schedule(); });
  }
})();
