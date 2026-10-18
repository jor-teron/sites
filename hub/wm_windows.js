/*
 * Hub window manager (hub/wm_windows.js) — Desktop mode only (wm_mode.js). Apps open in
 * windows on #wm-desk instead of the single Hub frame (hub.js calls HubWM.open).
 *
 * Window = title bar (app icon + name, – ▢ × buttons) + its own iframe of the app.
 * - Drag the title bar to move; drag an edge / corner to resize; double-click the bar to
 *   maximise / restore; pointer down anywhere (also inside a same-origin app) brings it to front.
 * - One window per app (key = ENTRY_URL): opening it again restores + focuses it.
 * - Minimised windows keep running (iframe stays loaded, only hidden); the taskbar
 *   (wm_taskbar.js) lists every window.
 * - Jelly open animation (none with prefers-reduced-motion). Look in wm.css.
 *
 * API window.HubWM: open({key, name, icon, url, app}), focus(w), minimise(w), restore(w),
 *   toggleMax(w), close(w), closeAll(), minimiseAll(), focusActive(), list(), active,
 *   onActive (set by hub.js: called with the focused window or null).
 * Fires 'hub-wm-change' on window after every change (taskbar redraws).
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

  const changed = () => window.dispatchEvent(new CustomEvent('hub-wm-change'));
  const deskRect = () => desk.getBoundingClientRect();

  function setActive(w) {
    if (active === w) { changed(); return; }
    active = w;
    wins.forEach((x) => x.el.classList.toggle('wm-active', x === w));
    if (typeof HubWM.onActive === 'function') HubWM.onActive(w);
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
      if (e.button !== 0 || e.target.closest('.wm-btn')) return;
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

  function setRect(w, x, y, wd, ht) {
    const d = deskRect();
    wd = Math.max(MIN_W, Math.min(wd, d.width));
    ht = Math.max(MIN_H, Math.min(ht, d.height));
    x = Math.max(80 - wd, Math.min(x, d.width - 80));   // keep a grab-able part on screen
    y = Math.max(0, Math.min(y, d.height - 36));
    Object.assign(w.rect, { x, y, w: wd, h: ht });
    const s = w.el.style;
    s.left = x + 'px'; s.top = y + 'px'; s.width = wd + 'px'; s.height = ht + 'px';
  }

  function open(o) {
    const found = wins.find((x) => x.key === o.key);
    if (found) { focus(found); return found; }
    const d = deskRect();
    const w = { key: o.key, name: o.name, icon: o.icon, url: o.url, app: o.app, min: false, max: false, rect: {}, id: ++seq };

    const el = document.createElement('section');
    el.className = 'wm-win wm-pop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', o.name);
    const bar = document.createElement('div');
    bar.className = 'wm-bar';
    const img = document.createElement('img');
    img.className = 'wm-icon'; img.alt = ''; img.src = o.icon || '';
    img.addEventListener('error', () => img.classList.add('missing'));
    const title = document.createElement('span');
    title.className = 'wm-title'; title.textContent = o.name;
    const btns = document.createElement('div');
    btns.className = 'wm-btns';
    const minB = btn('wm-min-btn', 'Minimise', '\u2013');
    const maxB = btn('wm-max-btn', 'Maximise', '\u25A2');
    const closeB = btn('wm-close-btn', 'Close', '\u00D7');
    btns.append(minB, maxB, closeB);
    bar.append(img, title, btns);
    const body = document.createElement('div');
    body.className = 'wm-body';
    const frame = document.createElement('iframe');
    frame.title = o.name;
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
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.wm-btn')) toggleMax(w); });
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
    setRect(w, 40 + n * 32, 16 + n * 28, wd, ht);
    desk.appendChild(el);
    wins.push(w);
    frame.src = o.url;
    focus(w);
    return w;
  }

  const HubWM = window.HubWM = {
    open, focus, minimise, restore, toggleMax, close,
    closeAll() { wins.slice().forEach(close); },
    minimiseAll() { wins.forEach((w) => { if (!w.min) { w.min = true; w.el.classList.add('wm-min'); } }); setActive(null); },
    focusActive() { if (active) focusFrameOf(active); },
    list() { return wins.slice(); },
    get active() { return active; },
    onActive: null
  };

  // Click on the empty desk (home wallpaper) = no window focused
  desk.addEventListener('pointerdown', (e) => { if (e.target === desk) setActive(null); });
  // Fallback for cross-origin apps: the Hub page loses focus to a window's iframe
  window.addEventListener('blur', () => setTimeout(() => {
    const ae = document.activeElement;
    const w = ae && ae.tagName === 'IFRAME' && wins.find((x) => x.frame === ae);
    if (w && active !== w) focus(w, true);
  }, 0));
  // Keep windows reachable after the screen shrinks
  window.addEventListener('resize', () => wins.forEach((w) => setRect(w, w.rect.x, w.rect.y, w.rect.w, w.rect.h)));
})();
