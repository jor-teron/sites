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
 *   sites-hub.theme      'dark' (default) | 'light'                           → html.hub-light
 *   sites-hub.homeBtn    '' = Home button goes to the Home screen (default) | 'apphub' = opens App Hub
 *                        (AH1-F1; hub.js __hubHome reads it per click)        → #home-btn title
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
 * Live: the 'storage' event (Settings runs in another document) and a
 * {type:'hub-prefs'} postMessage from a same-origin frame both re-apply everything.
 * API: window.HubPrefs.get(key), .apply()
 */
(function () {
  'use strict';
  const P = 'sites-hub.';
  const root = document.documentElement;
  const get = (k) => { try { return localStorage.getItem(P + k) || ''; } catch (_) { return ''; } };
  const num = (v, ok, d) => (ok.indexOf(+v) >= 0 ? +v : d);
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '');

  let lastBar = '', lastMine = '';
  function apply() {
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
    root.classList.toggle('hub-light', get('theme') === 'light');
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
    // AH1-F1: Home button target (hub.js __hubHome reads the key on every click)
    const hb = document.getElementById('home-btn');
    if (hb) { const t = get('homeBtn') === 'apphub' ? 'App Hub' : 'Home'; hb.title = t; hb.setAttribute('aria-label', t); }
    // screen mode chosen in Settings
    const m = get('wmMode') || 'auto';
    if (window.HubMode && window.HubMode.pref !== m) window.HubMode.setPref(m);
  }

  window.HubPrefs = { get, apply };
  apply();
  window.addEventListener('storage', (e) => { if (!e.key || e.key.indexOf(P) === 0) apply(); });
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'hub-prefs') return;
    apply();
  });
})();
