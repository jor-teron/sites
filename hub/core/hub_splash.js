/*
 * H159 Boot splash (hub/core/hub_splash.js) — covers the Hub desktop while stage 1 boots.
 * (before H174) It waited for restored windows, the Start menu, Connect, or a wallpaper photo.
 * H174: it no longer waits for restored windows, the Start menu, Connect, or a wallpaper photo.
 * H178: ready is stage 1 (taskbar) AND the Start menu batch (Start usable) AND the static
 *   fallback wallpaper (default colour / gradient). It does not wait for restored app windows
 *   or the selected wallpaper photo / live engine (those load after the splash).
 * It does not fetch or prefetch any apps itself.
 *
 * Shown only on the desktop shell (desktop/desktop.html). Not inside apps, not on ?join=
 * (phone-link) pages, and not on phone/. A tiny inline <head> script (like html.hub-locked)
 * adds html.hub-splash and an empty #hub-splash before the first paint, so the desk does
 * not flash. This file fills the layer, tracks real restore progress, and dismisses it.
 *
 * Progress may still show windows restored N of M plus stage-1 ready, but ready itself
 * (before H178, H174) is only stage 1 (the working taskbar).
 * H178: ready is stage 1 AND menu ready AND fallback ready. The first 10 seconds cannot be skipped
 * while not ready. When ready the splash fades out once SHOW_MIN_MS has elapsed
 * (even before 10 s). After 10 s, if still not ready, the splash stays on, shows
 * "Still loading… press any key to continue", and a key or click dismisses it; loading
 * continues in the background. No auto-dismiss while not ready.
 *
 * #hub-splash sits on <html> (same pattern as #hub-lock) and stays the last child so it
 * covers the PIN lock until it fades; the lock then shows underneath.
 *
 * Pref: sites-hub.bootSplash, on by default; '0' = off (Settings › Look › Show boot splash).
 *
 * API: window.HubSplash (also module.exports in Node): shouldShow, canDismiss,
 *   showStillLoading, progressFraction, isReady, prefEnabled, sessionTotal, isAppDocument,
 *   MIN_MS, SHOW_MIN_MS, STILL_MSG, onDesktopStarted, onStage1Ready, onMenuReady,
 *   onFallbackReady, state.
 * H159a: a window counts only once its iframe has the app document (not about:blank).
 *   (before H174) The splash stayed at least 3 s even if ready earlier.
 * (before H178) H174: the splash stays at least 5 s, and lifts when 5 s have elapsed AND stage 1 is ready.
 * H178: the splash stays at least 5 s, and lifts when 5 s have elapsed AND stage 1, the
 *   Start menu, and the static fallback wallpaper are ready.
 */
(function (global) {
  'use strict';

  const MIN_MS = 10000;
  // const SHOW_MIN_MS = 3000; // H159a: never fade before 3 s, even if ready earlier   (before H174)
  const SHOW_MIN_MS = 5000; // H174: never fade before 5 s, even if stage 1 is ready earlier
  const STILL_MSG = 'Still loading\u2026 press any key to continue';

  function prefEnabled(v) {
    return v !== '0';
  }

  /** Decide whether the desktop boot splash should show. */
  function shouldShow(opts) {
    const o = opts || {};
    if (!prefEnabled(o.pref)) return false;
    if (o.isJoin) return false;
    if (o.isTop === false) return false;
    return true;
  }

  /**
   * Ready → auto fade only after showMinMs (H174: 5 s; H159a: 3 s; was immediate before H159a).
   * Not ready → only after minMs (10 s, user key/click); never auto.
   */
  // function canDismiss(elapsedMs, ready, minMs) {
  //   const min = minMs == null ? MIN_MS : minMs;
  //   if (ready) return true;
  //   return elapsedMs >= min;
  // }   (before H159a)
  function canDismiss(elapsedMs, ready, minMs, showMinMs) {
    const skip = minMs == null ? MIN_MS : minMs;
    const show = showMinMs == null ? SHOW_MIN_MS : showMinMs;
    if (ready) return elapsedMs >= show;
    return elapsedMs >= skip;
  }

  /** href of the iframe document: about:blank is not the app. crossOrigin (load event, unreadable) = loaded. */
  function isAppDocument(href, crossOrigin) {
    if (crossOrigin) return true;
    if (!href) return false;
    const h = String(href);
    return h !== 'about:blank' && h !== 'about:srcdoc' && h.indexOf('about:blank') !== 0;
  }

  function showStillLoading(elapsedMs, ready, minMs) {
    const min = minMs == null ? MIN_MS : minMs;
    return !ready && elapsedMs >= min;
  }

  /** Core ready counts as one step, plus N of M restored windows. */
  function progressFraction(coreReady, restored, total) {
    const m = Math.max(0, total | 0);
    const n = Math.max(0, Math.min(m, restored | 0));
    return ((coreReady ? 1 : 0) + n) / (1 + m);
  }

  // function isReady(coreReady, restored, total) {
  //   // (before H174) if (!coreReady) return false;
  //   // (before H174) return (restored | 0) >= Math.max(0, total | 0);
  //   // H174: ready once stage 1 (taskbar) is in; do not wait for restored windows.
  //   return !!coreReady;
  // }   (before H178)
  function isReady(coreReady, menuReady, fallbackReady) {
    // H178: ready once stage 1, the Start menu batch, and the static fallback wallpaper are in.
    // Restored app windows are not part of ready (they load after the splash).
    return !!coreReady && !!menuReady && !!fallbackReady;
  }

  function sessionTotal(data) {
    if (!data || !Array.isArray(data.wins)) return 0;
    let n = 0;
    for (let i = 0; i < data.wins.length; i++) {
      if (data.wins[i] && data.wins[i].key) n++;
    }
    return n;
  }

  const api = {
    MIN_MS: MIN_MS,
    SHOW_MIN_MS: SHOW_MIN_MS,
    STILL_MSG: STILL_MSG,
    isAppDocument: isAppDocument,
    prefEnabled: prefEnabled,
    shouldShow: shouldShow,
    canDismiss: canDismiss,
    showStillLoading: showStillLoading,
    progressFraction: progressFraction,
    isReady: isReady,
    sessionTotal: sessionTotal
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  window.HubSplash = api;
  // H174: hub_loader.js may signal stage 1 before boot() binds the real handler (DOMContentLoaded).
  // H178: the same pending-flag pattern for menu ready and the static fallback wallpaper.
  let stage1Pending = false;
  let menuPending = false;
  let fallbackPending = false;
  api.onStage1Ready = function () { stage1Pending = true; };
  api.onMenuReady = function () { menuPending = true; };
  api.onFallbackReady = function () { fallbackPending = true; };

  function readPref() {
    try { return localStorage.getItem('sites-hub.bootSplash'); } catch (_) { return ''; }
  }

  function readSession() {
    try { return JSON.parse(localStorage.getItem('sites-hub.wmSession') || 'null'); } catch (_) { return null; }
  }

  function noMotion() {
    const root = document.documentElement;
    if (root.classList.contains('hub-motion-off') || root.classList.contains('hub-motion-reduced')) return true;
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) { return false; }
  }

  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    const show = shouldShow({
      pref: readPref(),
      isJoin: /[?&]join=/.test(location.search || ''),
      isTop: window === top
    });
    if (!show) {
      document.documentElement.classList.remove('hub-splash', 'hub-splash-light');
      const stale = document.getElementById('hub-splash');
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
      // H178: connect waits for this so a pref-off / ?join= boot is not stuck
      try { window.dispatchEvent(new CustomEvent('hub-splash-gone')); } catch (_) { /* old */ }
      return;
    }

    const root = document.documentElement;
    root.classList.add('hub-splash');
    let el = document.getElementById('hub-splash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hub-splash';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Hub');
      el.setAttribute('aria-busy', 'true');
      root.appendChild(el);
    }
    if (el.parentNode !== root) root.appendChild(el);

    if (!el.querySelector('.hub-splash-mark')) {
      const img = document.createElement('img');
      img.className = 'hub-splash-mark';
      img.src = 'shared/image/hub_icon_192.png';
      img.alt = '';
      img.width = 96;
      img.height = 96;
      const name = document.createElement('div');
      name.className = 'hub-splash-name';
      name.textContent = 'Hub';
      const bar = document.createElement('div');
      bar.className = 'hub-splash-bar';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.appendChild(document.createElement('i'));
      const count = document.createElement('div');
      count.className = 'hub-splash-count';
      const hint = document.createElement('div');
      hint.className = 'hub-splash-hint';
      hint.hidden = true;
      hint.textContent = STILL_MSG;
      el.append(img, name, bar, count, hint);
    }

    const barEl = el.querySelector('.hub-splash-bar');
    const fillEl = el.querySelector('.hub-splash-bar > i');
    const countEl = el.querySelector('.hub-splash-count');
    const hintEl = el.querySelector('.hub-splash-hint');

    const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let coreReady = false;
    let menuReady = false;
    let fallbackReady = false;
    let total = sessionTotal(readSession());
    const loaded = new Set();
    let gone = false;
    let ticking = 0;
    let markedReady = false;   // H166: one hub-boot-ready mark

    function now() {
      return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    function elapsed() { return now() - startedAt; }

    function restoredCount() { return loaded.size; }

    // (before H178) function readyNow() { return isReady(coreReady, restoredCount(), total); }
    function readyNow() { return isReady(coreReady, menuReady, fallbackReady); }

    function raise() {
      if (gone || !el) return;
      if (el.parentNode !== root || root.lastElementChild !== el) root.appendChild(el);
    }

    function paint() {
      if (gone) return;
      const n = restoredCount();
      const ready = readyNow();
      const frac = progressFraction(coreReady, n, total);
      if (fillEl) fillEl.style.transform = 'scaleX(' + frac + ')';
      if (barEl) barEl.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
      if (countEl) countEl.textContent = total > 0 ? (n + ' of ' + total) : '';
      if (hintEl) hintEl.hidden = !showStillLoading(elapsed(), ready);
      if (ready && !markedReady) { markedReady = true; try { performance.mark('hub-boot-ready'); } catch (_) { /* H166 */ } }
      if (ready && canDismiss(elapsed(), true)) fadeOut();
    }

    function finish() {
      if (!el) return;
      root.classList.remove('hub-splash', 'hub-splash-light');
      if (el.parentNode) el.parentNode.removeChild(el);
      el = null;
    }

    function fadeOut() {
      if (gone) return;
      gone = true;
      try { window.dispatchEvent(new CustomEvent('hub-splash-gone')); } catch (_) { /* H178 */ }
      try { performance.mark('hub-boot-shown'); } catch (_) { /* H166 */ }
      unbind();
      if (hintEl) hintEl.hidden = true;
      if (noMotion()) { finish(); return; }
      if (el) el.classList.add('hub-splash-out');
      setTimeout(finish, 280);
    }

    function tryUserDismiss(e) {
      if (gone) return;
      const ready = readyNow();
      if (!canDismiss(elapsed(), ready)) {
        if (e) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
        return;
      }
      if (!ready) {
        if (e) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
        fadeOut();
      }
    }

    const evs = ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'];
    function bind() {
      evs.forEach((t) => window.addEventListener(t, tryUserDismiss, true));
    }
    function unbind() {
      evs.forEach((t) => window.removeEventListener(t, tryUserDismiss, true));
      if (ticking) { clearInterval(ticking); ticking = 0; }
      if (mo) mo.disconnect();
    }

    function noteLoaded(id) {
      if (id == null || gone) return;
      loaded.add(id);
      paint();
    }

    function watchFrames() {
      if (!window.HubWM || typeof window.HubWM.list !== 'function') return;
      const wins = window.HubWM.list();
      if (coreReady) total = wins.length;
      for (let i = 0; i < wins.length; i++) {
        const w = wins[i];
        if (!w || w.id == null) continue;
        if (loaded.has(w.id)) continue;
        const f = w.frame;
        if (!f) continue;
        // let complete = false;
        // try {
        //   complete = !!(f.src && f.src !== 'about:blank' && f.contentDocument && f.contentDocument.readyState === 'complete');
        // } catch (_) { complete = false; }
        // if (complete) { noteLoaded(w.id); continue; }
        // f.addEventListener('load', function () { noteLoaded(w.id); }, { once: true });   (before H159a)
        // H159a: the initial about:blank document is already complete; only the app document counts.
        // A cross-origin load event means it is loaded (we cannot read location.href).
        let hasApp = false;
        try {
          const href = (f.contentWindow && f.contentWindow.location && f.contentWindow.location.href) || '';
          hasApp = isAppDocument(href, false);
        } catch (_) { hasApp = false; }   // not yet a load event — do not count CORS until 'load'
        if (hasApp) { noteLoaded(w.id); continue; }
        if (f.getAttribute && f.getAttribute('data-hub-splash-watch') === '1') continue;
        if (f.setAttribute) f.setAttribute('data-hub-splash-watch', '1');
        f.addEventListener('load', function onLoad() {
          let ok = false;
          try {
            const href = (f.contentWindow && f.contentWindow.location && f.contentWindow.location.href) || '';
            ok = isAppDocument(href, false);
          } catch (_) { ok = isAppDocument('', true); }   // cross-origin load event = loaded
          if (ok) { f.removeEventListener('load', onLoad); noteLoaded(w.id); }
        });
      }
      // A window closed mid-restore (gone app) must not hold the bar open
      if (coreReady) {
        const ids = new Set(wins.map((w) => w && w.id));
        loaded.forEach((id) => { if (!ids.has(id)) loaded.delete(id); });
      }
      paint();
    }

    function onDesktopStarted(detail) {
      coreReady = true;
      if (detail && typeof detail.total === 'number') total = detail.total;
      else if (window.HubWM && typeof window.HubWM.list === 'function') total = window.HubWM.list().length;
      else total = 0;
      watchFrames();
      paint();
    }
    // (before H178) H174: stage 1 (working taskbar) is enough for ready; restoreWm may still run later (menu batch).
    // H178: stage 1 is one of three ready signals (with menu + fallback). restoreWm still runs in the menu batch,
    // and Connect waits for those windows after the splash is gone.
    function onStage1Ready() {
      coreReady = true;
      paint();
    }
    function onMenuReady() {
      menuReady = true;
      paint();
    }
    function onFallbackReady() {
      fallbackReady = true;
      paint();
    }

    const mo = new MutationObserver(raise);
    try { mo.observe(root, { childList: true }); } catch (_) { /* old */ }
    raise();
    bind();
    ticking = setInterval(function () { if (gone) { clearInterval(ticking); ticking = 0; return; } paint(); }, 200);

    window.addEventListener('hub-desktop-started', function (e) { onDesktopStarted(e.detail || {}); });
    window.addEventListener('hub-stage1-ready', function () { onStage1Ready(); });
    window.addEventListener('hub-menu-ready', function () { onMenuReady(); });
    window.addEventListener('hub-fallback-ready', function () { onFallbackReady(); });
    window.addEventListener('hub-wm-session-restored', function (e) {
      if (e && e.detail && typeof e.detail.count === 'number' && !coreReady) total = e.detail.count;
      watchFrames();
    });
    window.addEventListener('hub-wm-frame-load', watchFrames);
    window.addEventListener('hub-wm-change', watchFrames);

    api.onDesktopStarted = onDesktopStarted;
    api.onStage1Ready = onStage1Ready;
    api.onMenuReady = onMenuReady;
    api.onFallbackReady = onFallbackReady;
    if (stage1Pending || document.getElementById('wm-taskbar')) onStage1Ready();
    if (menuPending) onMenuReady();
    if (fallbackPending || (typeof window !== 'undefined' && window.__hubFallbackReady)) onFallbackReady();
    api.state = function () {
      return {
        coreReady: coreReady,
        menuReady: menuReady,
        fallbackReady: fallbackReady,
        restored: restoredCount(),
        total: total,
        elapsed: elapsed(),
        ready: readyNow(),
        gone: gone,
        visible: !gone && !!document.getElementById('hub-splash')
      };
    };
    api.dismiss = function () { tryUserDismiss(null); };

    paint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
    // The overlay is already in <html> from the head script; fill it as soon as this file runs too
    if (document.getElementById('hub-splash') || document.documentElement.classList.contains('hub-splash')) boot();
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
