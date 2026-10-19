/*
 * Window snapping (hub/wm_snap.js) — Desktop mode only. Uses HubWM (wm_windows.js).
 * - Drag a window by its title bar to the left / right screen edge → it fills that half;
 *   to the top edge → maximised. A translucent preview (#wm-snap-pv, wm.css) shows where
 *   it will land while dragging; letting go elsewhere just moves it.
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
  const EDGE = 8;   // px from the desk edge (the screen edge, or the taskbar edge at the top)
  const isDesk = () => !!(window.HubMode && window.HubMode.isDesktop());

  const pv = document.createElement('div');
  pv.id = 'wm-snap-pv';
  pv.setAttribute('aria-hidden', 'true');
  desk.appendChild(pv);

  /** Where would the window land with the pointer at ev? 'l' | 'r' | 'max' | '' */
  function zoneAt(ev) {
    if (document.documentElement.classList.contains('hub-snap-off')) return '';   // Settings → Windows
    const d = desk.getBoundingClientRect();
    if (ev.clientY <= d.top + EDGE) return 'max';
    if (ev.clientX <= d.left + EDGE) return 'l';
    if (ev.clientX >= d.right - EDGE) return 'r';
    return '';
  }
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
    move(w, ev) { showPv(w, ev ? zoneAt(ev) : ''); },
    end(w, ev) {
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
