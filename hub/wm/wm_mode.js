/*
 * Hub screen mode (hub/wm/wm_mode.js) — decides Desktop (windows + taskbar) or Phone (today's
 * single-frame Hub). Loaded before the other wm_* files and hub.js.
 *
 * Auto: Desktop when the main pointer is a real mouse — (hover: hover) and (pointer: fine) —
 *       AND the viewport is at least MIN_WIDTH px wide. Rechecked on resize and media change.
 * Manual override 'auto' | 'desktop' | 'phone' (Hub settings, hub_settings.js), saved in
 * localStorage 'sites-hub.wmMode'.
 *
 * Desktop mode puts class "wm-desktop" on <body> and fires a 'hub-wm-mode' event on window
 * ({detail:{mode}}) whenever the mode changes. API: window.HubMode
 *   .mode ('desktop' | 'phone'), .pref, .setPref(p), .isDesktop(), .autoMode()
 */
(function () {
  'use strict';
  const KEY = 'sites-hub.wmMode';
  const MIN_WIDTH = 1024;
  const PREFS = { auto: 1, desktop: 1, phone: 1 };
  const mq = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;

  let pref = 'auto';
  try { const p = localStorage.getItem(KEY); if (PREFS[p]) pref = p; } catch (_) { /* blocked */ }

  /** What Auto would pick right now. */
  function autoMode() {
    return mq && mq.matches && window.innerWidth >= MIN_WIDTH ? 'desktop' : 'phone';
  }
  function compute() {
    if (window.__hubRemote) return 'phone';   // phone remote Hub (hub_role.js) is always Phone
    return pref === 'auto' ? autoMode() : pref;
  }

  let mode = compute();
  document.body.classList.toggle('wm-desktop', mode === 'desktop');

  function apply() {
    const m = compute();
    if (m === mode) return;
    mode = m;
    document.body.classList.toggle('wm-desktop', mode === 'desktop');
    window.dispatchEvent(new CustomEvent('hub-wm-mode', { detail: { mode } }));
  }

  window.HubMode = {
    get mode() { return mode; },
    get pref() { return pref; },
    isDesktop() { return mode === 'desktop'; },
    autoMode,
    minWidth: MIN_WIDTH,
    setPref(p) {
      if (!PREFS[p]) return;
      pref = p;
      try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch (_) { /* blocked */ }
      apply();
      window.dispatchEvent(new CustomEvent('hub-wm-pref', { detail: { pref } }));
    }
  };

  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(apply, 200); });
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
  }
})();
