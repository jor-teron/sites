/*
 * Window snapping (hub/wm_snap.js) — Desktop mode only. Uses HubWM (wm_windows.js).
 * - Drag a window by its title bar with the pointer in the left / right edge zone (SIDE px
 *   wide, the whole height — so the corners give a half too) → it fills that half; in the
 *   top strip (TOP px) between the side zones → maximised. A translucent preview
 *   (#wm-snap-pv, wm.css) shows where it will land; letting go elsewhere just moves it.
 *   Touch / pen get slightly bigger zones. (R13: the top no longer wins in the corners.)
 * - Magnetic edges (R13): while moving (and resizing), a window edge within MAG px of a desk
 *   edge (the desk is the area left by the taskbar and the docked keyboard) or of another
 *   visible window's edge on this workspace (touching outer edges, or lined-up edges like
 *   top-to-top; only when the two overlap on the other axis) sticks flush; the size stays.
 *   Both axes at once = corners. Alt or Shift held = no magnet for that move. A pointer in a
 *   half / max zone wins on release. Candidate edges are read once per drag.
 *   Settings → Windows "Magnetic edges" (sites-hub.snapMagnet '0' = off → html.hub-magnet-off,
 *   hub_prefs.js); "Snap windows to screen edges" only switches the half / max zones.
 *   window.HubMagnet { on(ev), lines(others, bounds), stick(r, lines, edges?) } is shared with the
 *   floating on-screen keyboard (hub/osk/osk_drag.js).
 * - Dragging a snapped / maximised window away gives back its size from before (wm_windows.js).
 * - Settings → Windows "Snap windows to screen edges" (sites-hub.snapEdges '0' = off,
 *   html.hub-snap-off via hub_prefs.js) turns the edge snapping off; the keys below still work.
 * - The desk ends above the docked on-screen keyboard (hub/osk/), so its edge is the keyboard's top.
 * - Keys (also while a same-origin app has focus, via window.__hubWmKey):
 *     Ctrl+Alt+← / →  or  Super(Meta)+← / →   snap the focused window left / right
 *     Ctrl+Alt+↑      or  Super+↑             maximise
 *     Ctrl+Alt+↓      or  Super+↓             restore (back to its normal size)
 *   (Workspace keys are in wm_workspaces.js: Ctrl+Alt+PageUp / PageDown, Super+Ctrl+← / →.)
 *   Super+arrows are often taken by the operating system first; Ctrl+Alt always works.
 * The edges are the desk's (the area above / below the taskbar), so Top / Bottom taskbar is fine.
 * State (w.snap, w.max) is saved in the window session by wm_windows.js.
 */
(function () {
  'use strict';
  const WM = window.HubWM;
  const desk = document.getElementById('wm-desk');
  if (!WM || !desk) return;
  const SIDE = 28, TOP = 9;   // zones: px from the desk's side edges (full height) / top edge
  const MAG = 14;            // magnet distance in px
  const isDesk = () => !!(window.HubMode && window.HubMode.isDesktop());

  const pv = document.createElement('div');
  pv.id = 'wm-snap-pv';
  pv.setAttribute('aria-hidden', 'true');
  desk.appendChild(pv);

  /** Where would the window land with the pointer at ev? 'l' | 'r' | 'max' | '' */
  function zoneAt(ev) {
    if (document.documentElement.classList.contains('hub-snap-off')) return '';   // Settings → Windows
    const d = desk.getBoundingClientRect();
    const t = ev.pointerType === 'touch' || ev.pointerType === 'pen' ? 1.4 : 1;
    if (ev.clientX <= d.left + SIDE * t) return 'l';     // sides first: the corners give a half
    if (ev.clientX >= d.right - SIDE * t) return 'r';
    if (ev.clientY <= d.top + TOP * t) return 'max';     // the top strip between the side zones
    return '';
  }

  /* ---------- magnet ---------- */
  const HubMagnet = {
    /** Magnet wanted for this pointer event? (setting on, no Alt / Shift) */
    on(ev) { return !document.documentElement.classList.contains('hub-magnet-off') && !(ev && (ev.altKey || ev.shiftKey)); },
    /** Lines to stick to: bounds {w, h} (edges 0 / w and 0 / h) plus each other rect {x, y, w, h}
     *  (its edges, only used where it overlaps on the other axis). */
    lines(others, b) {
      const xs = [{ v: 0 }, { v: b.w }], ys = [{ v: 0 }, { v: b.h }];
      others.forEach((o) => {
        xs.push({ v: o.x, lo: o.y, hi: o.y + o.h }, { v: o.x + o.w, lo: o.y, hi: o.y + o.h });
        ys.push({ v: o.y, lo: o.x, hi: o.x + o.w }, { v: o.y + o.h, lo: o.x, hi: o.x + o.w });
      });
      return { xs, ys };
    },
    /** r {x, y, w, h} → stuck copy. edges: which edges may move ('lrtb' = all, a move; 'r' = only the
     *  right edge, a resize from the east side …). A move shifts the rect; a resize moves that edge. */
    stick(r, L, edges) {
      edges = edges || 'lrtb';
      const move = edges === 'lrtb';
      const near = (a0, a1, c) => c.lo == null || (a1 > c.lo - MAG && a0 < c.hi + MAG);
      function best(vals, lines, a0, a1) {
        let bd = 0, bi = -1, ba = MAG + 1;
        lines.forEach((c) => {
          if (!near(a0, a1, c)) return;
          vals.forEach((v, i) => { const d = c.v - v; if (Math.abs(d) < ba) { ba = Math.abs(d); bd = d; bi = i; } });
        });
        return ba <= MAG ? { d: bd, i: bi } : null;
      }
      const o = Object.assign({}, r);
      const xv = [], yv = [];
      if (edges.includes('l')) xv.push(['l', r.x]);
      if (edges.includes('r')) xv.push(['r', r.x + r.w]);
      if (edges.includes('t')) yv.push(['t', r.y]);
      if (edges.includes('b')) yv.push(['b', r.y + r.h]);
      const bx = xv.length && best(xv.map((e) => e[1]), L.xs, r.y, r.y + r.h);
      const by = yv.length && best(yv.map((e) => e[1]), L.ys, r.x, r.x + r.w);
      if (bx) { const e = xv[bx.i][0]; if (move) o.x += bx.d; else if (e === 'r') o.w += bx.d; else { o.x += bx.d; o.w -= bx.d; } }
      if (by) { const e = yv[by.i][0]; if (move) o.y += by.d; else if (e === 'b') o.h += by.d; else { o.y += by.d; o.h -= by.d; } }
      o.sx = !!bx; o.sy = !!by;
      return o;
    },
    MAG
  };
  window.HubMagnet = HubMagnet;

  /** Other visible windows of this workspace, desk-relative, read once per drag. */
  let lines = null;
  function linesFor(w) {
    if (lines && lines.w === w) return lines.L;
    const d = desk.getBoundingClientRect();
    const others = [];
    desk.querySelectorAll('.wm-win').forEach((el) => {
      if (el === w.el || el.classList.contains('wm-min') || el.classList.contains('wm-off') || el.classList.contains('wm-max') || !el.offsetWidth) return;
      const r = el.getBoundingClientRect();
      others.push({ x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height });
    });
    lines = { w, L: HubMagnet.lines(others, { w: d.width, h: d.height }) };
    return lines.L;
  }
  const RZ = { n: 't', s: 'b', e: 'r', w: 'l' };

  let zone = '';
  function showPv(w, z) {
    if (z === zone) return;
    zone = z;
    pv.className = z ? 'on ' + z : '';
    if (z) {   // just under the dragged window
      pv.style.zIndex = w.el.style.zIndex;
      desk.insertBefore(pv, w.el);
    }
  }

  WM.dragHook = {
    /** r = where the window would go ({x, y, w, h}, desk px); dir = resize side(s) ('' = a move). */
    adjust(w, r, ev, dir) {
      if (!ev || !HubMagnet.on(ev) || (!dir && zoneAt(ev))) return r;   // a zone wins over the magnet
      const edges = dir ? dir.split('').map((c) => RZ[c]).join('') : 'lrtb';
      return HubMagnet.stick(r, linesFor(w), edges);
    },
    done() { lines = null; },
    move(w, ev) { showPv(w, ev ? zoneAt(ev) : ''); },
    end(w, ev) {
      lines = null;
      const z = ev && ev.type === 'pointerup' ? zoneAt(ev) : '';
      showPv(w, '');
      if (z === 'max') WM.setMax(w, true);
      else if (z) WM.setSnap(w, z);
    }
  };

  /** Snap keys; returns true when handled. */
  function key(e) {
    if (!isDesk() || e.repeat) return false;
    const ca = e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey;
    const su = e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    if (!ca && !su) return false;
    const w = WM.active;
    if (!w || w.min) return false;
    switch (e.key) {
      case 'ArrowLeft': WM.setSnap(w, 'l'); break;
      case 'ArrowRight': WM.setSnap(w, 'r'); break;
      case 'ArrowUp': WM.setMax(w, true); break;
      case 'ArrowDown': if (w.max) WM.setMax(w, false); else WM.setSnap(w, ''); break;
      default: return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  // window.__hubWmKey: one entry point for window keys (same-origin apps forward theirs here)
  const prev = window.__hubWmKey;
  window.__hubWmKey = (e) => { if (!key(e) && prev) prev(e); };
  document.addEventListener('keydown', (e) => { if (!key(e) && prev) prev(e); }, true);
  window.addEventListener('hub-wm-mode', () => showPv(null, ''));
})();
