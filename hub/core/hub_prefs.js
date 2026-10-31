/*
 * Hub preferences (hub/core/hub_prefs.js) — applies the Settings app's choices (apps/system/settings) to
 * the Hub, live. Loaded right after hub_config.js / hub_wallpapers.js.
 *
 * localStorage keys (all optional; empty = default):
 *   sites-hub.wallpaper  wallpaper id, 'pic:<file>' (picture, image URL used directly),
 *                        'mine…' (Your picture, Local drive) or '#rrggbb' (hub_wallpapers.js)
 *                                                                              → #empty background
 *   sites-hub.taskH      taskbar height 32 | 40 | 48 px (default 40)          → --wm-task-h
 *   sites-hub.titleH     window title bar 24 | 28 | 34 px (default 28)        → --wm-title-h
 *   sites-hub.taskPos    taskbar 'bottom' (default) | 'top'                    → html.hub-task-top
 *   sites-hub.accent     accent colour '#rrggbb' (default #6ea8fe)            → --accent
 *   (legacy) sites-hub.theme 'dark' (default) | 'light'                       → html.hub-light
 *   sites-hub.theme      H60a: 'light' (default, also '') | 'dark'            → html.hub-light
 *                        (the Hub is the theme source, so it has no Auto; Settings now saves 'dark'.
 *                        Before H60 Dark was saved as '' = missing, so those older picks read as Light.)
 *   sites-hub.glass      H61: '1' = Glass (Settings › Look saves it with theme 'light', so apps that read
 *                        sites-hub.theme still see Light; a theme of 'glass' is read as Glass too) → html.hub-glass
 *                        (+ html.hub-light; CSS in hub/core/hub_glass.css). Ignored when theme is 'dark'.
 *   sites-hub.themeAuto  H64: '1' = Auto theme (Light by day, Dark by night; hub/core/hub_autotheme.js, loaded
 *                        before this file). While on, apply() first calls HubAutoTheme.sync(), which writes the
 *                        effective 'light' / 'dark' into sites-hub.theme (so every app reading it follows) and
 *                        clears sites-hub.glass. Times: themeSunrise / themeSunset / themeOffset (hub_autotheme.js).
 *   sites-hub.glassSolid H61: '1' = Reduce transparency (Glass without blur, solid colours) → html.hub-glass-solid
 *   sites-hub.homeBtn    '' = Home button goes to the Home screen (default) | 'apphub' = opens App Hub
 *                        (AH1-F1; hub.js __hubHome reads it per click)        → #home-btn title
 *   sites-hub.showFiles  '0' = no Files icons on the Desktop home (H7; default on) → html.hub-files-off, HubDrives.sync()
 *   sites-hub.showTiles  '1' = QR / link tiles on the home (H72; default off, Desktop + Phone) → html.hub-tiles-off
 *   sites-hub.motion     'on' (default) | 'reduced' (no jelly) | 'off'        → html.hub-motion-*
 *   sites-hub.hoverFocus '1' = Focus window on hover (default off)       → html.hub-hover-focus
 *   sites-hub.snapEdges  '0' = no snapping to screen edges (default on)  → html.hub-snap-off
 *                        (window drag to edge: wm_snap.js; floating keyboard: hub/osk/osk_drag.js)
 *   sites-hub.snapMagnet '0' = no magnetic edges (default on)           → html.hub-magnet-off
 *                        (wm_snap.js HubMagnet: windows + the floating keyboard; R13)
 *   sites-hub.workspaces '1' = one workspace (default 2): read by wm_workspaces.js
 *                        (wm_windows.js reads the class; Settings → Windows)
 *   sites-hub.wmMode / sites-hub.startHover: read by wm_mode.js / wm_taskbar.js; a change made
 *   in Settings is passed to HubMode here.
 *   H52 Hub bar (Settings → Hub bar, Desktop-mode taskbar only; Start is always shown):
 *   (H52b: one set for both modes: pooh / devices / update also hide in Phone mode's top bar, and the
 *   Update dot goes on Home ▾ there (H52c: no dot); the other items only exist in the Desktop taskbar. CSS in wm.css)
 *   sites-hub.barShowDesk / barSearch / barTasks / barWorkspaces / barOsk / barDevices / barClock
 *                        '0' = hidden (default shown)                    → html.hub-bar-off-<item>
 *   sites-hub.barPooh / barUpdate  '1' = shown (default HIDDEN)          → html.hub-bar-off-pooh / -update
 *                        (Pooh: only the icon; Pooh Chat keeps running. Update hidden + a build waiting →
 *                        dot on Start, html.hub-upd-ready set by hub_update.js; CSS in wm.css; H52c: dot removed)
 *   sites-hub.barEye     H63: '1' = shown (default HIDDEN), the Eye comfort 🌙, both modes → html.hub-bar-off-eye
 *   sites-hub.barNotif   H66: '0' = hidden (default SHOWN), the Notification Centre 🔔, both modes → html.hub-bar-off-notif
 *   H63 Eye comfort keys eyeWarm / eyeMode / eyeFrom / eyeTo / eyeNow: read by hub/core/hub_eye.js (apply() calls HubEye.apply())
 *   (the busy meter keeps its own key sites-hub.trayMeter, hub_traymeter.js; Settings shows it in Hub bar)
 * Live: the 'storage' event (Settings runs in another document) and a
 * {type:'hub-prefs'} postMessage from a same-origin frame both re-apply everything.
 * API: window.HubPrefs.get(key), .apply(), .BAR (H52: [{ key, item, def }] the Hub bar switches), .barOn(key)
 */
(function () {
  'use strict';
  const P = 'sites-hub.';
  const root = document.documentElement;
  const get = (k) => { try { return localStorage.getItem(P + k) || ''; } catch (_) { return ''; } };
  const num = (v, ok, d) => (ok.indexOf(+v) >= 0 ? +v : d);
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '');

  /* H52: Hub bar items. def true = shown unless the key is '0'; def false = hidden unless the key is '1'. */
  const BAR = [
    { key: 'barShowDesk', item: 'showdesk', def: true },
    { key: 'barSearch', item: 'search', def: true },
    { key: 'barTasks', item: 'tasks', def: true },
    { key: 'barWorkspaces', item: 'ws', def: true },
    { key: 'barOsk', item: 'osk', def: true },
    { key: 'barPooh', item: 'pooh', def: false },
    { key: 'barDevices', item: 'devices', def: true },
    { key: 'barUpdate', item: 'update', def: false },
    { key: 'barClock', item: 'clock', def: true },
    // { key: 'barEye', item: 'eye', def: false }   // H63: Eye comfort 🌙 (both modes, like Pooh / Devices / Update)   (before H66: last item)
    { key: 'barEye', item: 'eye', def: false },   // H63: Eye comfort 🌙 (both modes, like Pooh / Devices / Update)
    { key: 'barNotif', item: 'notif', def: true }   // H66: Notification Centre 🔔 (both modes, default shown)
  ];
  const barOn = (key) => { const b = BAR.find((x) => x.key === key); if (!b) return true; const v = get(key); return b.def ? v !== '0' : v === '1'; };

  let lastBar = '', lastMine = '';
  function apply() {
    // H52: Hub bar switches (classes only; wm.css hides the items inside #wm-taskbar, so Phone mode is untouched)
    // H52b: same classes; wm.css now also hides Pooh / Devices / Update in Phone mode's top bar
    BAR.forEach((b) => root.classList.toggle('hub-bar-off-' + b.item, !barOn(b.key)));
    // sizes + taskbar position (a change re-clamps the windows: wm_windows.js listens to resize)
    const top = get('taskPos') === 'top';
    root.classList.toggle('hub-task-top', top);
    const bar = (top ? 't' : 'b') + get('taskH');
    if (lastBar && bar !== lastBar) setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    lastBar = bar;
    // sizes + accent
    root.style.setProperty('--wm-task-h', num(get('taskH'), [32, 40, 48], 40) + 'px');
    root.style.setProperty('--wm-title-h', num(get('titleH'), [24, 28, 34], 28) + 'px');
    const acc = hex(get('accent'));
    if (acc) root.style.setProperty('--accent', acc); else root.style.removeProperty('--accent');
    // theme + motion
    // H64: Auto theme first: keeps sites-hub.theme = the effective light / dark (writes only on a change)
    if (window.HubAutoTheme) window.HubAutoTheme.sync();
    // root.classList.toggle('hub-light', get('theme') === 'light');   // legacy: unset = Dark
    root.classList.toggle('hub-light', get('theme') !== 'dark');   // H60a: unset = Light
    // H61: Glass = a light theme with frosted bars / menus / pop-ups (hub_glass.css)
    // const glass = get('theme') === 'glass' || (get('glass') === '1' && get('theme') !== 'dark');   (before H64)
    const glass = get('themeAuto') !== '1' && (get('theme') === 'glass' || (get('glass') === '1' && get('theme') !== 'dark'));   // H64: Auto is never Glass
    root.classList.toggle('hub-glass', glass);
    root.classList.toggle('hub-glass-solid', glass && get('glassSolid') === '1');
    root.classList.toggle('hub-hover-focus', get('hoverFocus') === '1');
    root.classList.toggle('hub-snap-off', get('snapEdges') === '0');
    root.classList.toggle('hub-magnet-off', get('snapMagnet') === '0');
    const mo = get('motion');
    root.classList.toggle('hub-motion-reduced', mo === 'reduced');
    root.classList.toggle('hub-motion-off', mo === 'off');
    // wallpaper
    const empty = document.getElementById('empty');
    if (empty && window.hubWallpaper) {
      const v = get('wallpaper'), w = window.hubWallpaper(v);
      const s = empty.style;
      s.backgroundColor = w.color || '#000';
      s.backgroundImage = w.image || 'none';
      if (w.mine && window.hubWallpaperMine) {   // Your picture: Local drive file → object URL
        window.hubWallpaperMine(v !== lastMine).then((u) => {
          if (get('wallpaper') === v && u) { s.backgroundImage = 'url("' + u + '")'; s.backgroundSize = 'cover'; }
        });
      }
      lastMine = w.mine ? v : '';
      s.backgroundSize = w.slide ? '100% 300%' : (w.image ? 'cover' : '');
      s.backgroundPosition = w.slide ? '' : 'center';
      s.animationName = w.slide ? '' : 'none';
      empty.classList.toggle('wp-light', !!w.light);
    }
    // AH1-F1: Phone mode Home button target (hub.js __hubHome reads the key on every click; H6-B1: not the Desktop Show desktop button)
    const hb = document.getElementById('home-btn');
    if (hb) { const t = get('homeBtn') === 'apphub' ? 'App Hub' : 'Home'; hb.title = t; hb.setAttribute('aria-label', t); }
    // H7: Files icons on the Desktop home (hub_drives.js redraws / empties its pane; it may not be loaded yet = it reads the key itself)
    const filesOff = get('showFiles') === '0';
    const wasOff = root.classList.contains('hub-files-off');
    root.classList.toggle('hub-files-off', filesOff);
    if (filesOff !== wasOff && window.HubDrives) window.HubDrives.sync();
    // H72: QR / link tiles on the home (Desktop + Phone; default off)
    root.classList.toggle('hub-tiles-off', get('showTiles') !== '1');
    // screen mode chosen in Settings
    const m = get('wmMode') || 'auto';
    if (window.HubMode && window.HubMode.pref !== m) window.HubMode.setPref(m);
    // H63: Eye comfort (hub_eye.js, loaded after this file; it also checks its schedule every minute)
    if (window.HubEye) window.HubEye.apply();
  }

  window.HubPrefs = { get, apply, BAR, barOn };   // H52: + BAR, barOn
  apply();
  window.addEventListener('storage', (e) => { if (!e.key || e.key.indexOf(P) === 0) apply(); });
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'hub-prefs') return;
    apply();
  });
})();
