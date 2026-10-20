/*
 * Hub deferred loader (hub/hub_loader.js) — R16a "minimal start".
 * hub.html loads only the core (desktop, taskbar, Start menu, window manager, settings,
 * phone link). Everything else is loaded here, after the page is idle, in small batches:
 *   1. drives   Google sign-in + Drive (shared/google/*), fs_drives, hub_drives, hub_phonekey
 *               — first idle moment (the Drives panel is on the desktop home)
 *   2. snap     wm_snap.js (edge snap, magnet, Ctrl+Alt+arrows)          — ~1.5 s idle
 *   3. osk      hub/osk/* + kb_common (on-screen keyboard)                — next idle
 *   4. viewer   hub_viewer.js + hub_viewer_pdf.js                         — next idle
 * On demand (loaded at once, then the action runs): ⌨ tray button and Ctrl+Alt+K (osk),
 * Ctrl+Alt+arrows (snap), HubViewer.open / pushAndShow (viewer), OSK saved as shown (osk).
 * API: window.HubLoader.load(name) → Promise; .loaded(name).
 * Keep V in step with the ?v= tags in hub.html on every release.
 */
(function () {
  'use strict';
  const V = '20261020e';
  const DELAY = 1500;
  const BATCHES = {
    drives: ['shared/google/google.css', 'hub/hub_drives.css',
      'shared/google/google_config.js', 'shared/google/google_auth.js', 'shared/google/gdrive_fs.js',
      'shared/google/google_gis.js', 'shared/google/phonekey.js', 'shared/google/gdrive_connect.js',
      'shared/fs/fs_drives.js', 'hub/hub_drives.js', 'hub/hub_phonekey.js'],
    snap: ['hub/wm_snap.js'],
    osk: ['hub/osk/osk.css', 'hub/controller/kb_common.js', 'hub/osk/osk_layout.js',
      'hub/osk/osk_board.js', 'hub/osk/osk_drag.js', 'hub/osk/osk.js'],
    viewer: ['hub/hub_viewer_pdf.js', 'hub/hub_viewer.js'],
  };
  const done = {}, busy = {};

  /** One file; scripts run in order because each waits for the one before. */
  function one(src) {
    return new Promise((ok) => {
      const url = src + '?v=' + V;
      const css = /\.css$/.test(src);
      const el = document.createElement(css ? 'link' : 'script');
      if (css) { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; el.async = false; }
      el.onload = el.onerror = () => ok();   // a missing file must not stop the rest
      (css ? document.head : document.body).appendChild(el);
    });
  }
  function load(name) {
    if (busy[name]) return busy[name];
    if (name === 'osk') { const p = document.querySelector('.wm-osk-btn[data-stub]'); if (p) p.remove(); }
    busy[name] = BATCHES[name].reduce((p, f) => p.then(() => one(f)), Promise.resolve())
      .then(() => { done[name] = true; });
    return busy[name];
  }
  window.HubLoader = { load, loaded: (n) => !!done[n] };

  // ---- on demand: keys pressed before the module is in (Hub page + same-origin apps) ----
  function early(e) {
    if (!(e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey) || e.repeat) return false;
    let name = '';
    if (!done.osk && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) name = 'osk';
    else if (!done.snap && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) name = 'snap';
    if (!name) return false;
    e.preventDefault();
    e.stopPropagation();
    const copy = { key: e.key, code: e.code, ctrlKey: true, altKey: true, shiftKey: false, metaKey: false,
      repeat: false, preventDefault() {}, stopPropagation() {} };
    load(name).then(() => { if (window.__hubWmKey) window.__hubWmKey(copy); });
    return true;
  }
  const prev = window.__hubWmKey;
  window.__hubWmKey = (e) => { if (!early(e) && prev) prev(e); };
  document.addEventListener('keydown', early, true);

  // ---- on demand: ⌨ tray stub (osk.js adds the real button) ----
  const tray = document.querySelector('#wm-taskbar .wm-tray');
  if (tray) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wm-osk-btn';
    b.dataset.stub = '1';
    b.tabIndex = -1;
    b.textContent = '⌨';
    b.title = 'On-screen keyboard (Ctrl+Alt+K)';
    b.setAttribute('aria-label', 'On-screen keyboard');
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => load('osk').then(() => { if (window.HubOSK) HubOSK.show(); }));
    tray.prepend(b);
  }

  // ---- on demand: Viewer stub (hub_viewer.js replaces window.HubViewer) ----
  if (!window.HubViewer) {
    const later = (fn) => function () {
      const a = arguments;
      return load('viewer').then(() => window.HubViewer && window.HubViewer[fn] && window.HubViewer[fn].apply(null, a));
    };
    window.HubViewer = { stub: true, open: later('open'), pushAndShow: later('pushAndShow') };
  }

  // ---- background batches ----
  const idle = (fn, t) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: t || 2000 }) : setTimeout(fn, 50));
  let saved = false;
  try { saved = localStorage.getItem('sites-hub.osk') === '1'; } catch (_) { /* ignore */ }
  if (saved) load('osk');   // keyboard was left open: bring it back at once
  // start after the page 'load' event, so the background batches never hold up first paint
  function start() {
    idle(() => load('drives'), 500);
    setTimeout(() => idle(() => load('snap')
      .then(() => new Promise((r) => idle(r))).then(() => load('osk'))
      .then(() => new Promise((r) => idle(r))).then(() => load('viewer'))), DELAY);
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
