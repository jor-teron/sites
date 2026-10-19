/*
 * Hub window manager (hub/wm_windows.js) — Desktop mode only (wm_mode.js). Apps open in
 * windows on #wm-desk instead of the single Hub frame (hub.js calls HubWM.open).
 *
 * Window = title bar (app icon + name, – ▢ × buttons) + its own iframe of the app.
 * - Drag the title bar to move; drag an edge / corner to resize; double-click the bar to
 *   maximise / restore; pointer down anywhere (also inside a same-origin app) brings it to front.
 * - Instances: key = ENTRY_URL. Opening an app again focuses its window; open({newInstance:true})
 *   (Shift+click / middle-click in the menu, flyout, category tiles, or the taskbar's
 *   "New window") adds another window numbered in its title / taskbar ("Notely 2"; w.inst,
 *   lowest free number). Each instance is saved in the session on its own.
 * - Minimised windows keep running (iframe stays loaded, only hidden); the taskbar
 *   (wm_taskbar.js) lists every window.
 * - Jelly open animation (none with prefers-reduced-motion). Look in wm.css.
 *
 * API window.HubWM: open({key, name, icon, url, app, newInstance}), focus(w), minimise(w), restore(w),
 *   toggleMax(w), close(w), closeAll(), minimiseAll(), focusActive(), list(), active,
 *   onActive (set by hub.js: called with the focused window or null).
 * Fires 'hub-wm-change' on window after every change (taskbar redraws) and 'hub-wm-focus'
 * when the focused window changes.
 * App bar: the title/stats/buttons an app sends (hub-gamebar.js protocol) show in its own
 * title bar (__hubGamebarAttach).
 * Target frame for the rest of the Hub (phone gamepad keys, SharedLink, …):
 *   window.__hubAppFrame()  → the focused window's iframe in Desktop mode (null when none),
 *                             else the Hub frame #app-frame.
 *   window.__hubAppFrames() → every app iframe (Hub frame + all windows).
 * Session: the open windows (key, url, x, y, w, h, maximised, minimised, z-order, focused) are
 * saved in localStorage 'sites-hub.wmSession' after every change (debounced, Desktop mode
 * only, so a trip through Phone mode keeps it). A window's url keeps the app's current #hash
 * (same page only, e.g. Files' #drive=…&path=…); apps can ask for a save with a same-origin
 * postMessage {type:'hub-wm-save'}; the Hub also saves when the page is hidden / closed. hub.js calls HubWM.restoreSession(resolve)
 * on start-up / when Desktop mode comes back; windows are clamped into the current screen.
 */
(function () {
  'use strict';
  const wrap = document.getElementById('frame-wrap');
  const appFrame = document.getElementById('app-frame');
  if (!wrap) return;

  const MIN_W = 320, MIN_H = 200;
  const desk = document.createElement('div');
  desk.id = 'wm-desk';
  wrap.appendChild(desk);

  const wins = [];          // open windows, in open order (taskbar order)
  let active = null;
  let zTop = 10;
  let seq = 0;

  const SKEY = 'sites-hub.wmSession';
  let restoring = false, saveT = 0;
  const isDesk = () => !!(window.HubMode && window.HubMode.isDesktop());
  /** The window's url + the app's current #hash when it is still on the page it opened. */
  function curUrl(w) {
    try {
      const l = w.frame.contentWindow.location, base = new URL(w.url, location.href);
      if (l.origin === base.origin && l.pathname === base.pathname) return w.url.split('#')[0] + (l.hash || '');
    } catch (_) { /* cross-origin / not loaded */ }
    return w.url;
  }
  function saveNow() {
    if (!isDesk() || restoring) return;
    const list = wins.map((w) => ({
      key: w.key, inst: w.inst, url: curUrl(w), name: w.baseName,
      x: Math.round(w.rect.x), y: Math.round(w.rect.y), w: Math.round(w.rect.w), h: Math.round(w.rect.h),
      max: !!w.max, min: !!w.min, z: +w.el.style.zIndex || 0
    }));
    try { localStorage.setItem(SKEY, JSON.stringify({ v: 1, wins: list, focused: active ? active.key : '', focusedInst: active ? active.inst : 0 })); } catch (_) { /* full / blocked */ }
  }
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 250); };
  const changed = () => { window.dispatchEvent(new CustomEvent('hub-wm-change')); saveSoon(); };
  const deskRect = () => desk.getBoundingClientRect();

  function setActive(w) {
    if (active === w) { changed(); return; }
    active = w;
    wins.forEach((x) => x.el.classList.toggle('wm-active', x === w));
    if (typeof HubWM.onActive === 'function') HubWM.onActive(w);
    window.dispatchEvent(new CustomEvent('hub-wm-focus', { detail: { win: w } }));
    changed();
  }

  function focusFrameOf(w) {
    try { w.frame.focus(); if (w.frame.contentWindow) w.frame.contentWindow.focus(); } catch (_) { /* ignore */ }
  }

  function focus(w, noFrameFocus) {
    if (!w) return;
    if (w.min) { w.min = false; w.el.classList.remove('wm-min'); }
    if (w.el.style.zIndex !== String(zTop)) w.el.style.zIndex = String(++zTop);
    setActive(w);
    if (!noFrameFocus) focusFrameOf(w);
  }

  /** Topmost visible window (for focus after minimise / close). */
  function topVisible(except) {
    let best = null;
    wins.forEach((x) => {
      if (x === except || x.min) return;
      if (!best || +x.el.style.zIndex > +best.el.style.zIndex) best = x;
    });
    return best;
  }

  function minimise(w) {
    if (!w || w.min) return;
    w.min = true;
    w.el.classList.add('wm-min');
    if (active === w) setActive(topVisible(w)); else changed();
  }

  function restore(w) { focus(w); }

  function toggleMax(w) {
    w.max = !w.max;
    w.el.classList.toggle('wm-max', w.max);
    w.maxBtn.title = w.max ? 'Restore' : 'Maximise';
    w.maxBtn.setAttribute('aria-label', w.maxBtn.title);
    focus(w);
  }

  function close(w) {
    const i = wins.indexOf(w);
    if (i < 0) return;
    wins.splice(i, 1);
    if (w.gb) w.gb.destroy();
    try { w.frame.src = 'about:blank'; } catch (_) { /* ignore */ }
    w.el.remove();
    if (active === w) setActive(topVisible()); else changed();
  }

  function btn(cls, label, text) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wm-btn ' + cls;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.textContent = text;
    return b;
  }

  /** Same-origin app: a pointer down inside it brings the window to front; hide scrollbars like the Hub frame. */
  function hookFrame(w) {
    let doc;
    try { doc = w.frame.contentDocument; } catch (_) { return; }
    if (!doc || !doc.documentElement) return;
    doc.addEventListener('pointerdown', () => { if (active !== w) focus(w, true); }, true);
    if (doc.head && !doc.getElementById('hub-noscrollbar')) {
      const st = doc.createElement('style');
      st.id = 'hub-noscrollbar';
      st.textContent = 'html,body{scrollbar-width:none;-ms-overflow-style:none} ::-webkit-scrollbar{width:0;height:0;display:none}';
      doc.head.appendChild(st);
    }
  }

  /** Drag helper: pointer capture on el; onMove(dx, dy) from the start point. */
  function dragOn(el, onStart, onMove) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.wm-btn, .gb-btn')) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      if (onStart(e) === false) return;
      el.setPointerCapture(e.pointerId);
      document.body.classList.add('wm-dragging');
      const move = (ev) => onMove(ev.clientX - sx, ev.clientY - sy, ev);
      const up = () => {
        document.body.classList.remove('wm-dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  /** fit: keep the whole window on screen (restored sessions), else just a grab-able part. */
  function setRect(w, x, y, wd, ht, fit) {
    const d = deskRect();
    wd = Math.max(MIN_W, Math.min(wd, d.width));
    ht = Math.max(MIN_H, Math.min(ht, d.height));
    if (fit) {
      x = Math.max(0, Math.min(x, d.width - wd));
      y = Math.max(0, Math.min(y, d.height - ht));
    } else {
      x = Math.max(80 - wd, Math.min(x, d.width - 80));   // keep a grab-able part on screen
      y = Math.max(0, Math.min(y, d.height - 36));
    }
    Object.assign(w.rect, { x, y, w: wd, h: ht });
    saveSoon();
    const s = w.el.style;
    s.left = x + 'px'; s.top = y + 'px'; s.width = wd + 'px'; s.height = ht + 'px';
  }

  function open(o) {
    const same = wins.filter((x) => x.key === o.key);
    if (o.restore) {
      const dup = same.find((x) => x.inst === (o.inst || 1));
      if (dup) return dup;
    } else if (same.length && !o.newInstance) {
      // focus the app's window: the active one, else the topmost
      const found = same.indexOf(active) >= 0 ? active : same.slice().sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex)[0];
      focus(found);
      return found;
    }
    let inst = o.restore ? (o.inst || 1) : 1;
    if (!o.restore) while (same.some((x) => x.inst === inst)) inst++;
    const d = deskRect();
    const nm = inst > 1 ? o.name + ' ' + inst : o.name;
    const w = { key: o.key, inst, baseName: o.name, name: nm, icon: o.icon, url: o.url, app: o.app, min: false, max: false, rect: {}, id: ++seq };

    const el = document.createElement('section');
    el.className = 'wm-win wm-pop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', nm);
    const bar = document.createElement('div');
    bar.className = 'wm-bar';
    const img = document.createElement('img');
    img.className = 'wm-icon'; img.alt = ''; img.src = o.icon || '';
    img.addEventListener('error', () => img.classList.add('missing'));
    const title = document.createElement('span');
    title.className = 'wm-title'; title.textContent = nm;
    const btns = document.createElement('div');
    btns.className = 'wm-btns';
    const minB = btn('wm-min-btn', 'Minimise', '\u2013');
    const maxB = btn('wm-max-btn', 'Maximise', '\u25A2');
    const closeB = btn('wm-close-btn', 'Close', '\u00D7');
    btns.append(minB, maxB, closeB);
    const gbSlot = document.createElement('div');   // app bar (stats / buttons) from hub-gamebar.js
    gbSlot.className = 'wm-gb';
    gbSlot.hidden = true;
    bar.append(img, title, gbSlot, btns);
    const body = document.createElement('div');
    body.className = 'wm-body';
    const frame = document.createElement('iframe');
    frame.title = nm;
    frame.setAttribute('allow', (appFrame && appFrame.getAttribute('allow')) || 'fullscreen');
    frame.setAttribute('allowfullscreen', '');
    body.appendChild(frame);
    el.append(bar, body);
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((dir) => {
      const h = document.createElement('div');
      h.className = 'wm-rz wm-rz-' + dir;
      h.dataset.dir = dir;
      el.appendChild(h);
    });
    Object.assign(w, { el, frame, maxBtn: maxB, titleEl: title });

    minB.addEventListener('click', () => minimise(w));
    maxB.addEventListener('click', () => toggleMax(w));
    closeB.addEventListener('click', () => close(w));
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.wm-btn, .gb-btn')) toggleMax(w); });
    // (hub-gamebar.js loads after hub.js; a window restored at start-up attaches once the page is parsed)
    const attachGb = () => { if (!w.gb && window.__hubGamebarAttach && wins.includes(w)) w.gb = window.__hubGamebarAttach(frame, gbSlot); };
    if (window.__hubGamebarAttach) setTimeout(attachGb, 0);
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachGb, { once: true });
    el.addEventListener('pointerdown', () => { if (active !== w) focus(w); }, true);
    el.addEventListener('animationend', () => el.classList.remove('wm-pop'));
    frame.addEventListener('load', () => hookFrame(w));

    // Move by the title bar (a maximised window un-maximises under the pointer first)
    let start = null;
    dragOn(bar, (e) => {
      if (w.max) {
        const dr = deskRect(), ratio = (e.clientX - dr.left) / dr.width;
        w.max = false; el.classList.remove('wm-max');
        maxB.title = 'Maximise'; maxB.setAttribute('aria-label', 'Maximise');
        setRect(w, e.clientX - dr.left - w.rect.w * ratio, 0, w.rect.w, w.rect.h);
      }
      start = Object.assign({}, w.rect);
    }, (dx, dy) => setRect(w, start.x + dx, start.y + dy, start.w, start.h));

    // Resize by edges / corners
    el.querySelectorAll('.wm-rz').forEach((h) => {
      const dir = h.dataset.dir;
      let r0 = null;
      dragOn(h, () => { if (w.max) return false; r0 = Object.assign({}, w.rect); }, (dx, dy) => {
        let { x, y, w: wd, h: ht } = r0;
        if (dir.includes('e')) wd = r0.w + dx;
        if (dir.includes('s')) ht = r0.h + dy;
        if (dir.includes('w')) { wd = Math.max(MIN_W, r0.w - dx); x = r0.x + r0.w - wd; }
        if (dir.includes('n')) { ht = Math.max(MIN_H, r0.h - dy); y = Math.max(0, r0.y + r0.h - ht); ht = r0.y + r0.h - y; }
        setRect(w, x, y, wd, ht);
      });
    });

    // Cascade new windows from the top-left
    const wd = Math.min(960, Math.round(d.width * 0.7)), ht = Math.min(640, Math.round(d.height * 0.8));
    const n = wins.length % 8;
    const r = o.rect;   // restored session rect (clamped by setRect)
    if (r) setRect(w, r.x, r.y, r.w, r.h, true);
    else setRect(w, 40 + n * 32, 16 + n * 28, wd, ht);
    if (o.restore) el.classList.remove('wm-pop');   // no jelly for a restored session
    if (o.max) { w.max = true; el.classList.add('wm-max'); maxB.title = 'Restore'; maxB.setAttribute('aria-label', 'Restore'); }
    desk.appendChild(el);
    wins.push(w);
    frame.src = o.url;
    if (o.restore) {
      el.style.zIndex = String(++zTop);
      if (o.min) { w.min = true; el.classList.add('wm-min'); }
      changed();
    } else focus(w);
    return w;
  }

  const HubWM = window.HubWM = {
    open, focus, minimise, restore, toggleMax, close,
    closeAll() { wins.slice().forEach(close); },
    minimiseAll() { wins.forEach((w) => { if (!w.min) { w.min = true; w.el.classList.add('wm-min'); } }); setActive(null); },
    focusActive() { if (active) focusFrameOf(active); },
    list() { return wins.slice(); },
    get active() { return active; },
    onActive: null,
    /** Re-open the saved windows. resolve(entry) → {name, icon, url, app} or null (app gone). */
    restoreSession(resolve) {
      let data = null;
      try { data = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (_) { data = null; }
      if (!data || !Array.isArray(data.wins) || !data.wins.length) return false;
      restoring = true;
      try {
        data.wins.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((e) => {
          const inst = Math.max(1, Math.min(99, +(e && e.inst) || 1));
          if (!e || !e.key || wins.find((x) => x.key === e.key && x.inst === inst)) return;
          const o = resolve(e);
          if (!o) return;
          open(Object.assign({}, o, { key: e.key, inst, restore: true, rect: { x: +e.x || 0, y: +e.y || 0, w: +e.w || 640, h: +e.h || 480 }, max: !!e.max, min: !!e.min }));
        });
      } finally { restoring = false; }
      const f = wins.find((x) => x.key === data.focused && x.inst === (+data.focusedInst || 1) && !x.min);
      if (f) focus(f); else setActive(null);
      saveNow();
      return wins.length > 0;
    }
  };

  window.__hubAppFrame = () => (isDesk() ? (active ? active.frame : null) : appFrame);
  window.__hubAppFrames = () => [appFrame].concat(wins.map((w) => w.frame)).filter(Boolean);

  // Click on the empty desk (home wallpaper) = no window focused
  desk.addEventListener('pointerdown', (e) => { if (e.target === desk) setActive(null); });
  // Fallback for cross-origin apps: the Hub page loses focus to a window's iframe
  window.addEventListener('blur', () => setTimeout(() => {
    const ae = document.activeElement;
    const w = ae && ae.tagName === 'IFRAME' && wins.find((x) => x.frame === ae);
    if (w && active !== w) focus(w, true);
  }, 0));
  // Apps ask for a session save (e.g. Files after changing folder); and save on leaving
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'hub-wm-save' && (e.origin === location.origin || location.protocol === 'file:')) saveSoon();
  });
  window.addEventListener('pagehide', () => { clearTimeout(saveT); saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(saveT); saveNow(); } });
  // Keep windows reachable after the screen shrinks
  window.addEventListener('resize', () => wins.forEach((w) => setRect(w, w.rect.x, w.rect.y, w.rect.w, w.rect.h)));
})();
