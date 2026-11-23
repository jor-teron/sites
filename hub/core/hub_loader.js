/*
 * Hub deferred loader (hub/core/hub_loader.js) — R16a "minimal start".
 * desktop/desktop.html (H174) loads only stage 1 (taskbar, Start button, theme / lock / splash).
 * Everything else is loaded here, in this order:
 *   1. menu      Start menu, flyout, catalog, hub.js, workspaces, settings, dialogs
 *                — starts as soon as stage 1 is in (need('menu') if Start is used earlier)
 *   2. connect   HubCore link + mesh files, controller, panels, gamebar, pointer / receive /
 *                remote, scan, notify, dnd, attention, profile / api / keys and their CSS
 *   3. wallpaper wallpapers.js + hub_wallpapers.js (and hub_live_wallpaper.js only if the
 *                saved id is live:…); then HubPrefs.applyWallpaper()
 *   4. drives    Google sign-in + Drive (shared/google/*), fs_drives, hub_drives, hub_phonekey
 *                — first idle moment after the wallpaper batch
 *   5. snap      wm_snap.js (edge snap, magnet, Ctrl+Alt+arrows)          — ~1.5 s idle
 *   6. osk       hub/osk/* + kb_common (on-screen keyboard)                — next idle
 *   7. viewer    hub_viewer.js + hub_viewer_pdf.js                         — next idle
 *   8. saver     hub_saver.js (R49 clock screen saver, idle timer)         — next idle
 * H167 (faster boot): tray    shared/perf/busy_meter.js + hub/drives/hub_traymeter.js (taskbar busy
 *               meter, off by default) — first idle moment after wallpaper, ONLY when Settings has it on
 *               ('sites-hub.trayMeter' = '1'); off = never loaded. Turning it on later (Settings'
 *               {type:'hub-prefs'} message or the storage event) loads it at once; hub_traymeter.js then
 *               reads the pref itself, so it looks and works exactly as before, just after first paint.
 * H174 also loads clock + hub_update.css/js after the wallpaper batch, then registers the service
 * worker at idle (HubUpdate.register). SW install must not compete with stages 1–4.
 * On demand (loaded at once, then the action runs): ⌨ tray button and Ctrl+Alt+K (osk),
 * Ctrl+Alt+arrows (snap), HubViewer.open / pushAndShow (viewer), OSK saved as shown (osk),
 * Start click/hover before the menu batch is in (need('menu')).
 * API: window.HubLoader.load(name) → Promise; .need(name); .loaded(name); .failed(name) → files that did not load.
 * R27: the ⌨ stub leaves only once the osk batch is in AND window.HubOSK exists (else it stays: retry).
 * R28: a file that fails is recorded per batch; an on-demand action (⌨ / Ctrl+Alt+K, snap keys,
 *   HubViewer.open) on a batch with failures shows a small note "Couldn't load <feature>…".
 *   A batch with failures is not cached as done: the next on-demand use tries the missing files again.
 *   R58: a retry walks the WHOLE batch in its listed order and skips only the files that already
 *   loaded fine, so a script that depends on an earlier one never runs ahead of it.
 * R29: each key event is handled once — the loader replays a caught key once (WeakSet), and
 *   wm_snap's page listener no longer runs the __hubWmKey chain (each module has its own).
 * Keep V in step with the ?v= tags in desktop/desktop.html on every release.
 */
(function () {
  'use strict';
  const V = '20261123b';
  const DELAY = 1500;
  const BATCHES = {
    // H174: Start menu first, then Connect, wallpaper last among the visible stages
    menu: [
      'desktop/menu/hub_flyout.css', 'shared/ctxmenu/ctxmenu.css', 'shared/dialog/dialog.css',
      'shared/vendor/qrcode.js',
      'hub/core/hub_appindex.js', 'hub/core/hub_catalog.js',
      'hub/core/hub_apps.js', 'desktop/menu/hub_tiles.js',
      'hub/core/hub.js',
      'shared/tiles/tiles.js', 'shared/favorites/favorites.js',
      'desktop/menu/hub_flyout.js',
      'shared/ctxmenu/ctxmenu.js', 'shared/ctxmenu/ctx_in_app.js',
      'desktop/menu/hub_ctx.js', 'desktop/menu/hub_ctx_menus.js',
      'desktop/wm/wm_workspaces.js',
      'shared/dialog/dialog.js', 'hub/core/hub_dialog_bridge.js',
      'desktop/menu/hub_settings.js', 'desktop/mode/hub_osmode.js',
      'desktop/wm/wm_warm.js'
    ],
    connect: [
      'desktop/controller/hub_controller.css', 'desktop/notify/hub_notification.css',
      'shared/link/link.css', 'desktop/panels/hub_chat.css', 'desktop/panels/hub_panels.css',
      'desktop/notify/hub_notifcenter.css',
      'desktop/controller/hub_controller_config.js',
      'desktop/notify/hub_notify.js', 'hub/core/hub_dnd.js',
      'desktop/notify/hub_notifcenter.js', 'hub/core/hub_attention.js',
      'desktop/link/hub_pointer.js', 'desktop/link/hub_receive.js',
      // (before H174) HubCore.load('link') via document.write
      'hub/core/hub_credentials.js', 'hub/core/hub_keys.js', 'hub/core/hub_providers.js',
      'hub/core/hub_embeddings.js', 'hub/core/hub_api.js', 'hub/core/hub_profile.js',
      'shared/link/link_core.js', 'shared/link/link_devices.js', 'shared/link/link_files.js',
      'shared/link/link_ui.js', 'shared/link/link_chat.js',
      'desktop/controller/hub_textedit.js', 'desktop/controller/hub-controller.js',
      // (before H174) HubCore.load('mesh') via document.write
      'hub/link/hub_link.js', 'hub/link/hub_sync.js', 'shared/link/hub_mesh.js',
      'hub/link/hub_meshlog.js', 'hub/link/hub_meshlink.js', 'hub/link/hub_line.js',
      'hub/link/hub_trust.js', 'hub/link/hub_linkstate.js',
      'shared/link/link_scan.js', 'desktop/link/hub_remote.js',
      'desktop/panels/hub_chat.js', 'desktop/panels/hub_panels.js',
      'hub/core/hub_titlebar.js', 'desktop/gamebar/hub-gamebar.js'
    ],
    // live engine is appended in filesOf() only when the saved id is live:…
    wallpaper: ['shared/wallpaper/wallpapers.js', 'hub/drives/hub_wallpapers.js'],
    drives: ['shared/google/google.css', 'hub/drives/hub_drives.css',
      'shared/google/google_config.js', 'shared/google/google_auth.js', 'shared/google/gdrive_fs.js',
      'shared/google/google_gis.js', 'shared/google/phonekey.js', 'shared/google/gdrive_connect.js',
      // (before H119) 'shared/fs/webdav_fs.js', 'shared/fs/webdav_accounts.js', 'shared/fs/fs_drives.js', 'hub/drives/hub_drives.js', 'hub/link/hub_phonekey.js'],
      'shared/fs/webdav_fs.js', 'shared/fs/webdav_accounts.js', 'shared/fs/sftp_fs.js', 'shared/fs/sftp_accounts.js',   // H119: + SFTP drives
      'shared/fs/fs_drives.js', 'hub/drives/hub_drives.js', 'hub/link/hub_phonekey.js'],
    // (before H129b) snap: ['hub/wm/wm_snap.js'],
    snap: ['desktop/wm/wm_snap.js'],   // H129b: moved to desktop/wm/
    osk: ['hub/osk/osk.css', 'hub/controller/kb_common.js', 'hub/osk/osk_layout.js',
      'hub/osk/osk_board.js', 'hub/osk/osk_drag.js', 'hub/osk/osk.js'],
    viewer: ['hub/viewer/hub_viewer_pdf.js', 'hub/viewer/hub_viewer.js'],
    saver: ['hub/core/hub_saver.js'],   // R49
    tray: ['shared/perf/busy_meter.js', 'hub/drives/hub_traymeter.js'],   // H167: was in desktop.html before first paint
    // H174: clock + update were blocking tags in desktop.html; now after the wallpaper batch
    clock: ['hub/core/hub_clock.css', 'hub/core/hub_clock.js'],
    update: ['hub/update/hub_update.css', 'hub/update/hub_update.js'],
    // H175: optional theme / lock / break / eye — not in the staged chain; loaded at boot only when
    // already on, or later via ensure() when Settings turns them on (no reload).
    glass: ['hub/core/hub_glass.css'],
    xp: ['hub/core/hub_xp.css'],
    lock: ['hub/core/hub_lock.css', 'hub/core/hub_lock_core.js', 'hub/core/hub_lock.js'],
    break: ['hub/core/hub_break.css', 'hub/core/hub_break.js'],
    eye: ['hub/core/hub_eye.js']
  };
  const done = {}, busy = {}, fails = {}, good = new Set();   // R58: good = files that loaded
  // const LABEL = { saver: 'the screen saver', drives: 'the Files pane', snap: 'window snapping', osk: 'the on-screen keyboard', viewer: 'the viewer' };   (before H167)
  // const LABEL = { saver: 'the screen saver', drives: 'the Files pane', snap: 'window snapping', osk: 'the on-screen keyboard', viewer: 'the viewer', tray: 'the busy meter' };   (before H174)
  const LABEL = { saver: 'the screen saver', drives: 'the Files pane', snap: 'window snapping', osk: 'the on-screen keyboard', viewer: 'the viewer', tray: 'the busy meter', menu: 'the Start menu', connect: 'Connect', wallpaper: 'the wallpaper', clock: 'the clock', update: 'updates', glass: 'Glass', xp: 'XP', lock: 'the lock screen', break: 'Computer break', eye: 'Eye comfort' };

  /** H174: live wallpaper engine only when the saved id is live:… (no download otherwise). */
  function filesOf(name) {
    if (name === 'wallpaper') {
      const files = BATCHES.wallpaper.slice();
      let id = '';
      try { id = localStorage.getItem('sites-hub.wallpaper') || ''; } catch (_) { /* blocked */ }
      if (String(id).indexOf('live:') === 0) files.push('hub/drives/hub_live_wallpaper.js');
      return files;
    }
    return BATCHES[name];
  }

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
  /** H175: a file already written as a boot tag (conditional Glass / lock / …) counts as loaded. */
  function already(src) {
    if (good.has(src)) return true;
    const sel = /\.css$/.test(src)
      ? 'link[href*="' + src + '"]'
      : 'script[src*="' + src + '"]';
    try { if (document.querySelector(sel)) { good.add(src); return true; } } catch (_) { /* old */ }
    return false;
  }
  function load(name) {
    if (busy[name]) return busy[name];
    fails[name] = [];
    if (name === 'menu') window.__ctxInAppManual = true;   // (before H174) inline tag in desktop.html before ctx_in_app.js
    const files = filesOf(name).filter((f) => !already(f));   // R58: retry keeps the batch order; H175: skip boot tags
    busy[name] = files.reduce((p, f) => p.then(() => one(f, name)), Promise.resolve())
      .then(() => {
        if (fails[name] && fails[name].length) { busy[name] = null; return; }   // R28: next use retries
        done[name] = true;
        if (name === 'osk' && window.HubOSK) { const p = document.querySelector('.wm-osk-btn[data-stub]'); if (p) p.remove(); }   // R27
        if (name === 'wallpaper' && window.HubPrefs && typeof window.HubPrefs.applyWallpaper === 'function') window.HubPrefs.applyWallpaper();
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
  function ensure(name) { return load(name); }   // H175: on-demand theme / lock / break / eye (no failure note)
  window.HubLoader = { load, need, ensure, loaded: (n) => !!done[n], failed: (n) => (fails[n] || []).slice() };

  // H175: Settings › Screen lock talks to window.HubLock (parent). If the lock files were not
  // part of stage 1 (feature off at boot), a stub loads them on demand, then forwards the call.
  // Auto-lock on script load still only happens when __hubLockBoot is set (a real page boot).
  function lockStub() {
    if (window.HubLock && !window.HubLock._stub) return;
    const fwd = (name) => function () {
      const a = arguments;
      return ensure('lock').then(() => {
        const L = window.HubLock;
        if (!L || L._stub || typeof L[name] !== 'function') return;
        return L[name].apply(L, a);
      });
    };
    window.HubLock = { _stub: true, isOn: () => false, hasPin: () => false, locked: () => false,
      lockNow: fwd('lockNow'), apply: fwd('apply'), setOn: fwd('setOn'), setPin: fwd('setPin'),
      removePin: fwd('removePin'), verify: fwd('verify'), keys: () => [], method: () => 'pin',
      methodReady: () => false, setMethod: fwd('setMethod'), addKey: fwd('addKey'),
      removeKey: fwd('removeKey'), state: () => ({ on: false, hasPin: false, locked: false }) };
  }
  function wantLock() { try { return localStorage.getItem('hub-lock.on') === '1' && !!localStorage.getItem('hub-lock.pin'); } catch (_) { return false; } }
  function wantBreak() {
    try {
      if (localStorage.getItem('sites-hub.breakOn') === '1') return true;
      const end = +localStorage.getItem('hub-break.breakEnd') || 0;
      return end > Date.now();
    } catch (_) { return false; }
  }
  function wantEye() { try { const m = localStorage.getItem('sites-hub.eyeMode') || ''; return m === 'always' || m === 'sched'; } catch (_) { return false; } }
  function wantXp() { try { const t = localStorage.getItem('sites-hub.theme') || ''; return t === 'xp' || localStorage.getItem('sites-hub.xp') === '1'; } catch (_) { return false; } }
  function wantGlass() { try { const t = localStorage.getItem('sites-hub.theme') || ''; return !wantXp() && (t === 'glass' || localStorage.getItem('sites-hub.glass') === '1'); } catch (_) { return false; } }
  function syncOptional() {
    if (wantXp()) ensure('xp');
    else if (wantGlass()) ensure('glass');
    if (wantLock()) ensure('lock');
    if (wantBreak()) ensure('break').then(() => { if (window.HubBreak) window.HubBreak.apply(); });
    if (wantEye()) ensure('eye').then(() => { if (window.HubEye) window.HubEye.apply(); });
  }
  lockStub();
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key.indexOf('sites-hub.') === 0 || e.key.indexOf('hub-lock.') === 0 || e.key.indexOf('hub-break.') === 0) syncOptional();
  });
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.type === 'hub-prefs') syncOptional();
  });

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

  // ---- H167: taskbar busy meter only when it is on (was always parsed before the first paint) ----
  const meterOn = () => { try { return localStorage.getItem('sites-hub.trayMeter') === '1'; } catch (_) { return false; } };
  const tryTray = () => { if (!done.tray && meterOn() && document.getElementById('wm-taskbar')) load('tray'); };
  window.addEventListener('storage', (e) => { if (!e.key || e.key === 'sites-hub.trayMeter') tryTray(); });
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'hub-prefs') setTimeout(tryTray, 0); });

  // ---- background batches ----
  const idle = (fn, t) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: t || 2000 }) : setTimeout(fn, 50));
  let saved = false;
  try { saved = localStorage.getItem('sites-hub.osk') === '1'; } catch (_) { /* ignore */ }
  if (saved) load('osk');   // keyboard was left open: bring it back at once
  // (before H174) start after the page 'load' event, so the background batches never hold up first paint
  // function start() {
  //   idle(() => load('drives'), 500);
  //   idle(tryTray, 500);   // H167
  //   setTimeout(() => idle(() => load('snap')
  //     .then(() => new Promise((r) => idle(r))).then(() => load('osk'))
  //     .then(() => new Promise((r) => idle(r))).then(() => load('viewer'))
  //     .then(() => new Promise((r) => idle(r))).then(() => load('saver'))), DELAY);   // R49
  // }
  // if (document.readyState === 'complete') start();
  // else window.addEventListener('load', start, { once: true });
  // H174: stage 1 is already in (this file is the last stage-1 tag). Start menu → connect →
  // wallpaper at once (do not wait for window 'load'). Existing idle batches follow wallpaper.
  function signalStage1() {
    if (!document.getElementById('wm-taskbar')) return;
    if (window.HubSplash && typeof window.HubSplash.onStage1Ready === 'function') window.HubSplash.onStage1Ready();
    try { window.dispatchEvent(new CustomEvent('hub-stage1-ready')); } catch (_) { /* old */ }
  }
  function afterWallpaper() {
    idle(() => load('drives'), 500);
    idle(tryTray, 500);   // H167
    idle(() => load('clock').then(() => load('update')).then(() => {
      if (window.HubUpdate && typeof window.HubUpdate.register === 'function') return window.HubUpdate.register();
    }), 500);
    setTimeout(() => idle(() => load('snap')
      .then(() => new Promise((r) => idle(r))).then(() => load('osk'))
      .then(() => new Promise((r) => idle(r))).then(() => load('viewer'))
      .then(() => new Promise((r) => idle(r))).then(() => load('saver'))), DELAY);   // R49
  }
  function startStaged() {
    signalStage1();
    load('menu').then(() => load('connect')).then(() => load('wallpaper')).then(afterWallpaper);
  }
  startStaged();
})();
