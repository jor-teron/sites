/*
 * Hub on-screen keyboard — moving it (hub/osk/osk_drag.js). Used by osk.js.
 * H23: always floating (docked mode removed). Drag the grip anywhere; near the left / right screen
 *   edge it snaps to that edge; a translucent preview (#osk-snap-pv) shows where it lands.
 *   Edge snapping follows Settings → Windows "Snap windows to screen edges" (html.hub-snap-off).
 *   It also sticks flush to the screen edges within the magnet distance (window.HubMagnet from
 *   hub/wm/wm_snap.js; "Magnetic edges", html.hub-magnet-off; Alt / Shift held = off).
 * - Nothing is saved: reset() puts it at bottom centre, just above the taskbar (osk.js calls it on every open).
 * - Dragging never takes focus from the app: pointerdown / mousedown are cancelled, pointer capture.
 * API: OSK_DRAG.attach({ panel, grip }) → { reset() }
 */
(function () {
  'use strict';
  const EDGE_X = 14;    // px from the left / right screen edge

  function attach(o) {
    const panel = o.panel, grip = o.grip;
    let x = 0, y = 0;
    const GAP = 8;   // px above the taskbar / screen bottom at bottom centre

    const pv = document.createElement('div');
    pv.id = 'osk-snap-pv';
    pv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pv);

    const snapOn = () => !document.documentElement.classList.contains('hub-snap-off');
    const W = () => panel.offsetWidth || 600;
    const H = () => panel.offsetHeight || 240;
    /** The lowest y the keyboard may reach: the taskbar's top (bottom taskbar) or the screen bottom. */
    function bottomLimit() {
      const tb = document.getElementById('wm-taskbar');
      const r = tb && tb.offsetHeight ? tb.getBoundingClientRect() : null;
      return r && r.top > window.innerHeight / 2 ? r.top : window.innerHeight;
    }
    const clampX = (v) => Math.max(0, Math.min(v, window.innerWidth - W()));
    const clampY = (v) => Math.max(0, Math.min(v, bottomLimit() - H()));

    function paint() {
      panel.style.left = Math.round(x) + 'px';
      panel.style.top = Math.round(y) + 'px';
    }
    function reset() {
      x = clampX((window.innerWidth - W()) / 2);
      y = clampY(bottomLimit() - H() - GAP);
      paint();
    }

    // ---- snap zones (floating) ----
    let zone = '';
    function zoneAt(ev) {
      if (!snapOn()) return '';
      if (ev.clientX <= EDGE_X) return 'l';
      if (ev.clientX >= window.innerWidth - EDGE_X) return 'r';
      return '';
    }
    function showPv(z) {
      zone = z;
      pv.classList.toggle('on', !!z);
      if (!z) return;
      const w = W(), h = H();
      const left = z === 'l' ? 0 : z === 'r' ? window.innerWidth - w : clampX(x);
      const top = clampY(y);
      Object.assign(pv.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
    }

    // ---- drag by the grip ----
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target.closest && e.target.closest('button'))) return;
      e.preventDefault();
      e.stopPropagation();
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const ox = e.clientX - x, oy = e.clientY - y;
      document.body.classList.add('wm-dragging', 'osk-dragging');
      const move = (ev) => {
        x = clampX(ev.clientX - ox);
        y = clampY(ev.clientY - oy);
        const z = zoneAt(ev), M = window.HubMagnet;
        if (!z && M && M.on(ev)) {   // magnetic screen edges (R13, wm_snap.js), same setting as windows
          const r = M.stick({ x, y, w: W(), h: H() }, M.lines([], { w: window.innerWidth, h: bottomLimit() }));
          x = clampX(r.x); y = clampY(r.y);
        }
        paint();
        showPv(z);
      };
      const up = (ev) => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        document.body.classList.remove('wm-dragging', 'osk-dragging');
        const z = ev.type === 'pointerup' ? zone : '';
        showPv('');
        if (z === 'l') { x = 0; paint(); }
        else if (z === 'r') { x = window.innerWidth - W(); paint(); }
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });

    // keep it on screen when the window / taskbar changes
    window.addEventListener('resize', () => { x = clampX(x); y = clampY(y); paint(); });

    return { reset: reset };
  }

  window.OSK_DRAG = { attach: attach };
})();
