/*
 * Hub deferred loader (hub/core/hub_loader.js) — R16a "minimal start".
 * hub.html loads only the core (desktop, taskbar, Start menu, window manager, settings,
 * phone link). Everything else is loaded here, after the page is idle, in small batches:
 *   1. drives   Google sign-in + Drive (shared/google/*), fs_drives, hub_drives, hub_phonekey
 *               — first idle moment (the Drives panel is on the desktop home)
 *   2. snap     wm_snap.js (edge snap, magnet, Ctrl+Alt+arrows)          — ~1.5 s idle
 *   3. osk      hub/osk/* + kb_common (on-screen keyboard)                — next idle
 *   4. viewer   hub_viewer.js + hub_viewer_pdf.js                         — next idle
 *   5. saver    hub_saver.js (R49 clock screen saver, idle timer)         — next idle
 * On demand (loaded at once, then the action runs): ⌨ tray button and Ctrl+Alt+K (osk),
 * Ctrl+Alt+arrows (snap), HubViewer.open / pushAndShow (viewer), OSK saved as shown (osk).
 * API: window.HubLoader.load(name) → Promise; .loaded(name); .failed(name) → files that did not load.
 * R27: the ⌨ stub leaves only once the osk batch is in AND window.HubOSK exists (else it stays: retry).
 * R28: a file that fails is recorded per batch; an on-demand action (⌨ / Ctrl+Alt+K, snap keys,
 *   HubViewer.open) on a batch with failures shows a small note "Couldn't load <feature>…".
 *   A batch with failures is not cached as done: the next on-demand use tries the missing files again.
 *   R58: a retry walks the WHOLE batch in its listed order and skips only the files that already
 *   loaded fine, so a script that depends on an earlier one never runs ahead of it.
 * R29: each key event is handled once — the loader replays a caught key once (WeakSet), and
 *   wm_snap's page listener no longer runs the __hubWmKey chain (each module has its own).
 * Keep V in step with the ?v= tags in hub.html on every release.
 */
(function () {
  'use strict';
  const V = '20261023o';
  const DELAY = 1500;
  const BATCHES = {
    drives: ['shared/google/google.css', 'hub/drives/hub_drives.css',
      'shared/google/google_config.js', 'shared/google/google_auth.js', 'shared/google/gdrive_fs.js',
      'shared/google/google_gis.js', 'shared/google/phonekey.js', 'shared/google/gdrive_connect.js',
      'shared/fs/fs_drives.js', 'hub/drives/hub_drives.js', 'hub/link/hub_phonekey.js'],
    snap: ['hub/wm/wm_snap.js'],
    osk: ['hub/osk/osk.css', 'hub/controller/kb_common.js', 'hub/osk/osk_layout.js',
      'hub/osk/osk_board.js', 'hub/osk/osk_drag.js', 'hub/osk/osk.js'],
    viewer: ['hub/viewer/hub_viewer_pdf.js', 'hub/viewer/hub_viewer.js'],
    saver: ['hub/core/hub_saver.js'],   // R49
  };
  const done = {}, busy = {}, fails = {}, good = new Set();   // R58: good = files that loaded
  const LABEL = { saver: 'the screen saver', drives: 'the Files pane', snap: 'window snapping', osk: 'the on-screen keyboard', viewer: 'the viewer' };

  /** One file; scripts run in order because each waits for the one before. */
  function one(src, name) {
    return new Promise((ok) => {
      const url = src + '?v=' + V;
      const css = /\.css$/.test(src);
      const el = document.createElement(css ? 'link' : 'script');
      if (css) { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; el.async = false; }
      el.onload = () => { good.add(src); ok(); };
      el.onerror = () => { (fails[name] = fails[name] || []).push(src); el.remove(); ok(); };   // a missing file must not stop the rest
      (css ? document.head : document.body).appendChild(el);
    });
  }
  function load(name) {
    if (busy[name]) return busy[name];
    fails[name] = [];
    const files = BATCHES[name].filter((f) => !good.has(f));   // R58: retry keeps the batch order
    busy[name] = files.reduce((p, f) => p.then(() => one(f, name)), Promise.resolve())
      .then(() => {
        if (fails[name] && fails[name].length) { busy[name] = null; return; }   // R28: next use retries
        done[name] = true;
        if (name === 'osk' && window.HubOSK) { const p = document.querySelector('.wm-osk-btn[data-stub]'); if (p) p.remove(); }   // R27
      });
    return busy[name];
  }
  /** R28: on-demand load; a note when files of the batch did not load. Resolves true when all is in. */
  function need(name) {
    return load(name).then(() => {
      const bad = !done[name] || (name === 'osk' && !window.HubOSK);
      if (bad) note('Couldn\u2019t load ' + LABEL[name] + '. Check your connection and reload.');
      return !bad;
    });
  }
  let noteEl = null, noteT = 0;
  function note(text) {   // small non-blocking pill (styled with the update note, hub_update.css)
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.id = 'hub-load-note';
      noteEl.setAttribute('role', 'status');
      document.body.appendChild(noteEl);
    }
    noteEl.textContent = text;
    noteEl.hidden = false;
    clearTimeout(noteT);
    noteT = setTimeout(() => { noteEl.hidden = true; }, 6000);
  }
  window.HubLoader = { load, need, loaded: (n) => !!done[n], failed: (n) => (fails[n] || []).slice() };

  // ---- on demand: keys pressed before the module is in (Hub page + same-origin apps) ----
  const seen = new WeakSet();   // R29: one replay per key event
  function early(e) {
    if (typeof e === 'object' && seen.has(e)) return true;
    if (!(e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey) || e.repeat) return false;
    let name = '';
    if (!done.osk && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) name = 'osk';
    else if (!done.snap && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) name = 'snap';
    if (!name) return false;
    e.preventDefault();
    e.stopPropagation();
    seen.add(e);
    const copy = { key: e.key, code: e.code, ctrlKey: true, altKey: true, shiftKey: false, metaKey: false,
      repeat: false, preventDefault() {}, stopPropagation() {} };
    need(name).then((ok) => { if (ok && window.__hubWmKey) window.__hubWmKey(copy); });
    return true;
  }
  const prev = window.__hubWmKey;
  window.__hubWmKey = (e) => { if (!early(e) && prev) prev(e); };
  document.addEventListener('keydown', early, true);

  // ---- on demand: ⌨ taskbar stub, R41: beside workspaces (osk.js adds the real button) ----
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
    b.addEventListener('click', () => need('osk').then((ok) => { if (ok) HubOSK.show(); }));
    // R43: right side, after the workspace switcher = just before the tray (R41 put it after .wm-ws on the left)
    tray.before(b);
  }

  // ---- on demand: Viewer stub (hub_viewer.js replaces window.HubViewer) ----
  if (!window.HubViewer) {
    const later = (fn) => function () {
      const a = arguments;
      return need('viewer').then(() => window.HubViewer && !window.HubViewer.stub && window.HubViewer[fn] && window.HubViewer[fn].apply(null, a));
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
      .then(() => new Promise((r) => idle(r))).then(() => load('viewer'))
      .then(() => new Promise((r) => idle(r))).then(() => load('saver'))), DELAY);   // R49
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
