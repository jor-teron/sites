/*
 * Hub window manager (hub/wm/wm_windows.js) — Desktop mode only (wm_mode.js). Apps open in
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
 * - Focus on hover (optional, Settings → Windows → html.hub-hover-focus via hub_prefs.js): resting
 *   the mouse ~350 ms on a window brings it to the front; not while dragging / resizing or with a
 *   menu / dialog open. Focus itself is instant (no animation, no timer) on click.
 * - Right-click / long-press on the title bar: New window, Move to workspace 1/2, Minimise,
 *   Maximise / Restore, Close (shared menu via hub_ctx.js); every same-origin app gets the
 *   in-app menu injected on load.
 * - H16 settings gear: an app posts {type:'hub-app-caps', settings:true|false} to the Hub; true
 *   shows a cogwheel left of – in its window's title bar (class has-settings), false hides it.
 *   A click posts {type:'hub-settings'} back to that iframe. Each iframe load hides the gear
 *   again until the app re-sends its caps.
 * - R35: opening a window or pressing its title bar loads the deferred snap batch at once.
 * - Snapping (R10): w.snap = 'l' | 'r' (left / right half, class wm-snap-l / -r in wm.css; w.rect
 *   keeps the size from before, like maximise). Edge detection, preview and the keys live in
 *   wm_snap.js through HubWM.dragHook {adjust(w, rect, ev, dir) (magnet, R13), move(w, ev),
 *   end(w, ev), done(w)} and HubWM.setSnap / setMax.
 *   Dragging a snapped / maximised window away restores its old size under the pointer.
 * - Workspaces (R10): w.ws = 1 | 2; only the current workspace's windows show (others get
 *   wm-off, still loaded and running). HubWM.ws, setWs(n), moveToWs(w, n), wsCount(), onWs(w).
 *   Switcher, keys and the setting: wm_workspaces.js. Focusing a window of the other workspace
 *   switches to it. Fires 'hub-wm-ws' when the workspace changes.
 * - Keys pressed inside a same-origin app are passed to window.__hubWmKey(e) (wm_snap.js /
 *   wm_workspaces.js) so the window shortcuts work while an app has focus.
 *
 * API window.HubWM: open({key, name, icon, url, app, newInstance}), focus(w), minimise(w), restore(w),
 *   toggleMax(w), close(w), closeAll(), minimiseAll(), focusActive(), list(), active,
 *   onActive (set by hub.js: called with the focused window or null).
 * Fires 'hub-wm-change' on window after every change (taskbar redraws) and 'hub-wm-focus'
 * when the focused window changes.
 * R51: new windows open maximised (localStorage 'sites-hub.openMax', '1' / missing = on, '0' = off).
 * App bar: the title/stats/buttons an app sends (hub-gamebar.js protocol) show in its own
 * title bar (__hubGamebarAttach).
 * Task list for apps (System Monitor): window.__hubTasks (list / focus / minimise / close / idOf /
 *   onChange), see below.
 * Target frame for the rest of the Hub (phone gamepad keys, SharedLink, …):
 *   window.__hubAppFrame()  → the focused window's iframe in Desktop mode (null when none),
 *                             else the Hub frame #app-frame.
 *   window.__hubAppFrames() → every app iframe (Hub frame + all windows).
 * Session: the open windows (key, url, x, y, w, h, maximised, minimised, z-order, focused) are
 * saved (plus snap side + workspace of each window and the current workspace)
 * in localStorage 'sites-hub.wmSession' after every change (debounced, Desktop mode
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
  let curWs = 1;            // current workspace (1 | 2)
  const WS_KEY = 'sites-hub.workspaces';
  const wsCount = () => { try { return localStorage.getItem(WS_KEY) === '1' ? 1 : 2; } catch (_) { return 2; } };
  const onWs = (w) => w.ws === curWs;

  // Focus on hover: off by default; never while dragging / resizing, a menu or dialog is open
  const HOVER_MS = 350;
  let hoverT = 0;
  const hoverFocusOn = () => document.documentElement.classList.contains('hub-hover-focus');
  function hoverBusy() {
    if (document.body.classList.contains('wm-dragging')) return true;
    if (window.CtxMenu && window.CtxMenu.isOpen()) return true;
    const m = document.getElementById('menu');
    if (m && m.classList.contains('open')) return true;
    return !!document.querySelector('.uid-back, #ctrl-popover:not([hidden])');
  }

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
      // R22: save the chosen size (w.pref), not the one squeezed to a small screen
      x: Math.round((w.pref || w.rect).x), y: Math.round((w.pref || w.rect).y), w: Math.round((w.pref || w.rect).w), h: Math.round((w.pref || w.rect).h),
      max: !!w.max, min: !!w.min, snap: w.snap || '', ws: w.ws, z: +w.el.style.zIndex || 0
    }));
    try { localStorage.setItem(SKEY, JSON.stringify({ v: 1, wins: list, ws: curWs, focused: active ? active.key : '', focusedInst: active ? active.inst : 0 })); } catch (_) { /* full / blocked */ }
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
    if (!onWs(w)) setWs(w.ws, true);
    if (w.min) { w.min = false; w.el.classList.remove('wm-min'); }
    if (w.el.style.zIndex !== String(zTop)) w.el.style.zIndex = String(++zTop);
    setActive(w);
    if (!noFrameFocus) focusFrameOf(w);
  }

  /** Topmost visible window (for focus after minimise / close). */
  function topVisible(except) {
    let best = null;
    wins.forEach((x) => {
      if (x === except || x.min || !onWs(x)) return;
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

  function setMaxBtn(w) {
    w.maxBtn.title = w.max || w.snap ? 'Restore' : 'Maximise';
    w.maxBtn.setAttribute('aria-label', w.maxBtn.title);
  }
  /** Maximise on / off (clears a snap: restoring goes back to the size from before). */
  function setMax(w, on) {
    w.max = !!on;
    w.snap = '';
    w.el.classList.toggle('wm-max', w.max);
    w.el.classList.remove('wm-snap-l', 'wm-snap-r');
    setMaxBtn(w);
    focus(w);
  }
  /** Snap to the left / right half ('l' | 'r'), or '' = back to the normal size. */
  function setSnap(w, side) {
    side = side === 'l' || side === 'r' ? side : '';
    w.snap = side;
    w.max = false;
    w.el.classList.remove('wm-max');
    w.el.classList.toggle('wm-snap-l', side === 'l');
    w.el.classList.toggle('wm-snap-r', side === 'r');
    setMaxBtn(w);
    focus(w);
  }
  /** The button / double-click: a maximised or snapped window goes back to normal. */
  function toggleMax(w) {
    if (w.snap) setSnap(w, ''); else setMax(w, !w.max);
  }

  // ---- workspaces ----
  function showWs(w) { w.el.classList.toggle('wm-off', !onWs(w)); }
  function setWs(n, keepFocus) {
    n = Math.max(1, Math.min(wsCount(), +n || 1));
    if (n === curWs) return;
    curWs = n;
    wins.forEach(showWs);
    window.dispatchEvent(new CustomEvent('hub-wm-ws', { detail: { ws: n } }));
    if (keepFocus) { changed(); return; }
    // focus the topmost window of the workspace (the last focused one there)
    const t = topVisible();
    setActive(t);
    if (t) focusFrameOf(t);
  }
  function moveToWs(w, n) {
    n = Math.max(1, Math.min(2, +n || 1));
    if (w.ws === n) return;
    w.ws = n;
    showWs(w);
    if (active === w && !onWs(w)) setActive(topVisible(w)); else changed();
  }
  /** Right-click menu items for a window: "Move to workspace N" (none with 1 workspace). */
  function wsItems(w) {
    if (wsCount() < 2) return [];
    const to = w.ws === 1 ? 2 : 1;
    return [{ label: 'Move to workspace ' + to, icon: to === 1 ? '\u2460' : '\u2461', action: () => moveToWs(w, to) }];
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

  // H16: cogwheel for the title bar settings button
  const GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

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
    doc.addEventListener('keydown', (e) => { if (window.__hubWmKey) window.__hubWmKey(e); }, true);
    if (doc.head && !doc.getElementById('hub-noscrollbar')) {
      const st = doc.createElement('style');
      st.id = 'hub-noscrollbar';
      st.textContent = 'html,body{scrollbar-width:none;-ms-overflow-style:none} ::-webkit-scrollbar{width:0;height:0;display:none}';
      doc.head.appendChild(st);
    }
  }

  /** Drag helper: pointer capture on el; onMove(dx, dy, ev) from the start point; onEnd(ev). */
  function dragOn(el, onStart, onMove, onEnd) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.wm-btn, .gb-btn, .gb-tab')) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      if (onStart(e) === false) return;
      el.setPointerCapture(e.pointerId);
      document.body.classList.add('wm-dragging');
      const move = (ev) => onMove(ev.clientX - sx, ev.clientY - sy, ev);
      const up = (ev) => {
        document.body.classList.remove('wm-dragging');
        if (onEnd) onEnd(ev);
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
  // R22: w.pref = the size / place the user (or the saved session) chose. Screen-resize clamps
  // only change w.rect (what is shown, keep=true), so windows grow back when room returns
  // instead of shrinking a little more on every browser resize. The session saves w.pref.
  function setRect(w, x, y, wd, ht, fit, keep) {
    const d = deskRect();
    const raw = { x, y, w: wd, h: ht };   // R22: a restored session keeps its full saved size
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
    if (!keep) w.pref = fit ? raw : { x, y, w: wd, h: ht };   // R22
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
    const ws = o.restore ? Math.max(1, Math.min(wsCount(), +o.ws || 1)) : curWs;
    const w = { key: o.key, inst, baseName: o.name, name: nm, icon: o.icon, url: o.url, app: o.app, min: false, max: false, snap: '', ws, rect: {}, id: ++seq };

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
    const gearB = btn('wm-gear', 'Settings', '');   // H16: shown only via hub-app-caps
    gearB.innerHTML = GEAR_SVG;
    const minB = btn('wm-min-btn', 'Minimise', '\u2013');
    const maxB = btn('wm-max-btn', 'Maximise', '\u25A2');
    const closeB = btn('wm-close-btn', 'Close', '\u00D7');
    btns.append(gearB, minB, maxB, closeB);
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

    gearB.addEventListener('click', () => {
      try { frame.contentWindow.postMessage({ type: 'hub-settings' }, location.protocol === 'file:' ? '*' : location.origin); } catch (_) { /* gone */ }
    });
    minB.addEventListener('click', () => minimise(w));
    maxB.addEventListener('click', () => toggleMax(w));
    closeB.addEventListener('click', () => close(w));
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.wm-btn, .gb-btn, .gb-tab')) toggleMax(w); });
    w.bar = bar;
    // (hub-gamebar.js loads after hub.js; a window restored at start-up attaches once the page is parsed)
    const attachGb = () => { if (!w.gb && window.__hubGamebarAttach && wins.includes(w)) w.gb = window.__hubGamebarAttach(frame, gbSlot); };
    if (window.__hubGamebarAttach) setTimeout(attachGb, 0);
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachGb, { once: true });
    el.addEventListener('pointerdown', () => { if (active !== w) focus(w); }, true);
    // Focus on hover (Settings → Windows, html.hub-hover-focus): a short rest over the window
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || !hoverFocusOn()) return;
      clearTimeout(hoverT);
      hoverT = setTimeout(() => {
        if (active !== w && !w.min && wins.includes(w) && el.matches(':hover') && !hoverBusy()) focus(w);
      }, HOVER_MS);
    });
    el.addEventListener('pointerleave', () => clearTimeout(hoverT));
    el.addEventListener('animationend', () => el.classList.remove('wm-pop'));
    frame.addEventListener('load', () => { el.classList.remove('has-settings'); hookFrame(w); if (window.__hubInjectCtx) window.__hubInjectCtx(frame); });

    // Move by the title bar. A maximised / snapped window gets its old size back under the
    // pointer once it really moves (a plain click on the bar keeps it as it is).
    let start = null, freed = true;
    const hook = (k, ev) => { const h = HubWM.dragHook; if (h && typeof h[k] === 'function') h[k](w, ev); };
    // R35: snapping (wm_snap.js) is a deferred batch (hub_loader.js, ~1.5 s idle, later on a slow
    // connection). Before it was in, HubWM.dragHook was null, so an early drag never snapped, showed
    // no preview and had no magnet. Ask for the batch as soon as it can be wanted: on the first
    // window open (below) and on a title-bar press. hook() reads HubWM.dragHook live, so a drag
    // that is already under way snaps once the file arrives mid-drag.
    const wantSnap = () => { if (!HubWM.dragHook && window.HubLoader) window.HubLoader.load('snap'); };
    dragOn(bar, () => {
      wantSnap();   // R35
      freed = !(w.max || w.snap);
      start = Object.assign({}, w.rect);
    }, (dx, dy, ev) => {
      if (!freed) {
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        freed = true;
        const dr = deskRect(), br = el.getBoundingClientRect(), ratio = (ev.clientX - br.left) / Math.max(1, br.width);
        w.max = false; w.snap = '';
        el.classList.remove('wm-max', 'wm-snap-l', 'wm-snap-r');
        setMaxBtn(w);
        // keep the grabbed point under the pointer: start so that start + d = pointer - ratio * w
        start = { x: ev.clientX - dr.left - w.rect.w * ratio - dx, y: ev.clientY - dr.top - 14 - dy, w: w.rect.w, h: w.rect.h };
        changed();
      }
      let r = { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h };
      const dh = HubWM.dragHook;
      if (dh && dh.adjust) r = dh.adjust(w, r, ev, '') || r;   // magnetic edges (wm_snap.js)
      setRect(w, r.x, r.y, r.w, r.h);
      hook('move', ev);
    }, (ev) => { if (freed) hook('end', ev); });

    // Resize by edges / corners
    el.querySelectorAll('.wm-rz').forEach((h) => {
      const dir = h.dataset.dir;
      let r0 = null;
      dragOn(h, () => {
        if (w.max) return false;
        if (w.snap) {   // resizing a snapped window: it keeps its snapped place as its new size
          const dr = deskRect(), br = el.getBoundingClientRect();
          w.snap = ''; el.classList.remove('wm-snap-l', 'wm-snap-r'); setMaxBtn(w);
          setRect(w, br.left - dr.left, br.top - dr.top, br.width, br.height);
          changed();
        }
        r0 = Object.assign({}, w.rect);
      }, (dx, dy, ev) => {
        let { x, y, w: wd, h: ht } = r0;
        if (dir.includes('e')) wd = r0.w + dx;
        if (dir.includes('s')) ht = r0.h + dy;
        if (dir.includes('w')) { wd = Math.max(MIN_W, r0.w - dx); x = r0.x + r0.w - wd; }
        if (dir.includes('n')) { ht = Math.max(MIN_H, r0.h - dy); y = Math.max(0, r0.y + r0.h - ht); ht = r0.y + r0.h - y; }
        const dh = HubWM.dragHook;
        if (dh && dh.adjust) {   // magnetic edges: only the dragged side(s) stick
          const r = dh.adjust(w, { x, y, w: wd, h: ht }, ev, dir);
          if (r && r.w >= MIN_W && r.h >= MIN_H) ({ x, y, w: wd, h: ht } = r);
        }
        setRect(w, x, y, wd, ht);
      }, () => { const dh = HubWM.dragHook; if (dh && dh.done) dh.done(w); });
    });

    // Cascade new windows from the top-left
    const wd = Math.min(960, Math.round(d.width * 0.7)), ht = Math.min(640, Math.round(d.height * 0.8));
    const n = wins.length % 8;
    const r = o.rect;   // restored session rect (clamped by setRect)
    if (r) setRect(w, r.x, r.y, r.w, r.h, true);
    else setRect(w, 40 + n * 32, 16 + n * 28, wd, ht);
    if (o.restore) el.classList.remove('wm-pop');   // no jelly for a restored session
    // R51: a NEW window opens maximised unless 'sites-hub.openMax' = '0' (read on every open, so a
    // Settings change applies to the next window at once); its normal rect / w.pref above is what
    // Restore goes back to. Restored session windows keep their saved state.
    const openMax = !o.restore && (() => { try { return localStorage.getItem('sites-hub.openMax') !== '0'; } catch (_) { return true; } })();
    if (o.max || openMax) { w.max = true; el.classList.add('wm-max'); }
    else if (o.snap === 'l' || o.snap === 'r') { w.snap = o.snap; el.classList.add('wm-snap-' + o.snap); }
    setMaxBtn(w);
    showWs(w);
    desk.appendChild(el);
    wins.push(w);
    frame.src = o.url;
    if (!o.restore || !o.min) wantSnap();   // R35: a visible window → bring snapping in now
    if (o.restore) {
      el.style.zIndex = String(++zTop);
      if (o.min) { w.min = true; el.classList.add('wm-min'); }
      changed();
    } else focus(w);
    return w;
  }

  const HubWM = window.HubWM = {
    open, focus, minimise, restore, toggleMax, close, setMax, setSnap,
    setWs, moveToWs, wsItems, onWs, wsCount,
    get ws() { return curWs; },
    dragHook: null,   // set by wm_snap.js
    deskRect,
    closeAll() { wins.slice().forEach(close); },
    /** Show Desktop: minimise the current workspace's windows. */
    minimiseAll() { wins.forEach((w) => { if (!w.min && onWs(w)) { w.min = true; w.el.classList.add('wm-min'); } }); setActive(null); },
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
      curWs = Math.max(1, Math.min(wsCount(), +data.ws || 1));
      window.dispatchEvent(new CustomEvent('hub-wm-ws', { detail: { ws: curWs } }));
      try {
        data.wins.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((e) => {
          const inst = Math.max(1, Math.min(99, +(e && e.inst) || 1));
          if (!e || !e.key || wins.find((x) => x.key === e.key && x.inst === inst)) return;
          const o = resolve(e);   // may return o.key: the app's current key (an old saved key renamed)
          if (!o || wins.find((x) => x.key === (o.key || e.key) && x.inst === inst)) return;
          open(Object.assign({}, o, { key: o.key || e.key, inst, restore: true, rect: { x: +e.x || 0, y: +e.y || 0, w: +e.w || 640, h: +e.h || 480 }, max: !!e.max, min: !!e.min, snap: e.snap, ws: e.ws }));
        });
      } finally { restoring = false; }
      const f = wins.find((x) => x.key === data.focused && x.inst === (+data.focusedInst || 1) && !x.min && onWs(x));
      if (f) focus(f); else setActive(null);
      saveNow();
      return wins.length > 0;
    }
  };

  // Right-click / long-press on a title bar (hub_ctx.js): New window, Minimise, Maximise / Restore, Close
  if (window.HubCtx) {
    window.HubCtx.add('.wm-bar', (bar) => {
      const w = wins.find((x) => x.bar === bar);
      if (!w) return null;
      return [
        { label: 'New window', icon: '\u29C9', action: () => open({ key: w.key, name: w.baseName || w.name, icon: w.icon, url: w.url, app: w.app, newInstance: true }) },
        ...wsItems(w),
        { sep: true },
        { label: 'Minimise', icon: '\u2013', action: () => minimise(w) },
        { label: w.max || w.snap ? 'Restore' : 'Maximise', icon: w.max || w.snap ? '\u2750' : '\u25A2', action: () => toggleMax(w) },
        { sep: true },
        { label: 'Close', icon: '\u00D7', danger: true, action: () => close(w) }
      ];
    }, { touch: true });
  }

  // Task list for apps (apps/system/sysmon): plain data + actions by window id, same origin only.
  //   list() → [{ id, key, inst, name, icon, url, min, max, snap, ws, wsCount, hidden (other
  //   workspace), active, z, sameOrigin, nodes, title }]
  //   focus(id), minimise(id), close(id), idOf(win) → the id of the window showing that window object
  //   (an app finds its own window), onChange(fn) → off()   (fires on every 'hub-wm-change')
  window.__hubTasks = {
    list() {
      return wins.map((w) => {
        let doc = null;
        try { doc = w.frame.contentDocument; } catch (_) { doc = null; }
        return {
          id: w.id, key: w.key, inst: w.inst, name: w.name, icon: w.icon ? new URL(w.icon, location.href).href : '',
          url: curUrl(w), min: !!w.min, max: !!w.max, snap: w.snap || '', ws: w.ws, wsCount: wsCount(), hidden: !onWs(w), active: w === active, z: +w.el.style.zIndex || 0,
          sameOrigin: !!doc, nodes: doc ? doc.getElementsByTagName('*').length : null, title: doc ? doc.title : ''
        };
      });
    },
    focus(id) { const w = wins.find((x) => x.id === id); if (w) focus(w); return !!w; },
    minimise(id) { const w = wins.find((x) => x.id === id); if (w) minimise(w); return !!w; },
    close(id) { const w = wins.find((x) => x.id === id); if (w) close(w); return !!w; },
    idOf(win) { const w = wins.find((x) => { try { return x.frame.contentWindow === win; } catch (_) { return false; } }); return w ? w.id : 0; },
    onChange(fn) {
      const h = () => { try { fn(); } catch (_) { window.removeEventListener('hub-wm-change', h); } };
      window.addEventListener('hub-wm-change', h);
      return () => window.removeEventListener('hub-wm-change', h);
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
    // H16: an app says whether it has a settings panel → show / hide its window's gear
    if (e.data && e.data.type === 'hub-app-caps' && (e.origin === location.origin || location.protocol === 'file:')) {
      const w = wins.find((x) => x.frame && x.frame.contentWindow === e.source);
      if (w) w.el.classList.toggle('has-settings', e.data.settings === true);
    }
  });
  window.addEventListener('pagehide', () => { clearTimeout(saveT); saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(saveT); saveNow(); } });
  // Keep windows reachable after the screen shrinks; R22: re-fit from w.pref (keep=true) so
  // they grow back to the chosen size when the screen grows again
  window.addEventListener('resize', () => wins.forEach((w) => { const p = w.pref || w.rect; setRect(w, p.x, p.y, p.w, p.h, false, true); }));
})();
