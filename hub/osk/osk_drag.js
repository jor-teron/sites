/*
 * Hub on-screen keyboard — moving it (hub/osk/osk_drag.js). Used by osk.js.
 * - Docked (default): stuck to the bottom (above the taskbar, or the screen bottom when the
 *   taskbar is at the top). Dragging the grip slides it left / right only.
 * - Undock button → floating: drag the grip anywhere. While dragging near the bottom edge it
 *   docks again, near the left / right screen edge it snaps to that edge; a translucent preview
 *   (#osk-snap-pv, same look as window snapping) shows where it lands, applied on release.
 *   Edge snapping follows Settings → Windows "Snap windows to screen edges" (html.hub-snap-off).
 *   Floating, it also sticks flush to the screen edges within the magnet distance (Magnet strength) (window.HubMagnet from
 *   hub/wm_snap.js; "Magnetic edges", html.hub-magnet-off; Alt / Shift held = off).
 * - Dock button → back to the bottom.
 * - Nothing is saved: reset() puts it docked at bottom centre (osk.js calls it on every open).
 * - Dragging never takes focus from the app: pointerdown / mousedown are cancelled, pointer capture.
 * API: OSK_DRAG.attach({ panel, grip, dockBtn, onDock(docked) }) → { reset(), setDocked(on), get docked }
 */
(function () {
  'use strict';
  const EDGE_X = 14;    // px from the left / right screen edge
  const EDGE_Y = 28;    // px above the bottom limit

  function attach(o) {
    const panel = o.panel, grip = o.grip, dockBtn = o.dockBtn;
    let docked = true, x = 0, y = 0;

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
      panel.classList.toggle('osk-float', !docked);
      panel.style.left = Math.round(x) + 'px';
      panel.style.top = docked ? '' : Math.round(y) + 'px';
      if (dockBtn) {
        dockBtn.textContent = docked ? '⇱' : '⇲';
        dockBtn.title = docked ? 'Undock (float the keyboard)' : 'Dock at the bottom';
        dockBtn.setAttribute('aria-label', dockBtn.title);
      }
    }
    function setDocked(on) {
      const was = docked;
      docked = !!on;
      if (!docked && was) y = clampY(bottomLimit() - H() - 60);   // lift it a little so it shows as floating
      x = clampX(x);
      paint();
      if (was !== docked && o.onDock) o.onDock(docked);
    }
    function reset() {
      const was = docked;
      docked = true;
      x = clampX((window.innerWidth - W()) / 2);
      paint();
      if (!was && o.onDock) o.onDock(true);
    }

    // ---- snap zones (floating) ----
    let zone = '';
    function zoneAt(ev) {
      if (docked || !snapOn()) return '';
      if (ev.clientY >= bottomLimit() - EDGE_Y) return 'dock';
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
      const top = z === 'dock' ? bottomLimit() - h : clampY(y);
      Object.assign(pv.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
    }

    // ---- drag by the grip ----
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target.closest && e.target.closest('button'))) return;
      e.preventDefault();
      e.stopPropagation();
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const ox = e.clientX - x, oy = e.clientY - (docked ? panel.getBoundingClientRect().top : y);
      document.body.classList.add('wm-dragging', 'osk-dragging');
      const move = (ev) => {
        x = clampX(ev.clientX - ox);
        if (!docked) y = clampY(ev.clientY - oy);
        const z = zoneAt(ev), M = window.HubMagnet;
        if (!docked && !z && M && M.on(ev)) {   // magnetic screen edges (R13, wm_snap.js), same setting as windows
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
        if (z === 'dock') setDocked(true);
        else if (z === 'l') { x = 0; paint(); }
        else if (z === 'r') { x = window.innerWidth - W(); paint(); }
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });

    // ---- Dock / Undock button (pointerup: touchstart is cancelled on the panel, so no click) ----
    if (dockBtn) {
      let downOn = false;
      dockBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); downOn = true; });
      dockBtn.addEventListener('pointerup', (e) => {
        if (!downOn) return;
        downOn = false;
        e.stopPropagation();
        setDocked(!docked);
      });
      dockBtn.addEventListener('pointerleave', () => { downOn = false; });
    }

    // keep it on screen when the window / taskbar changes
    window.addEventListener('resize', () => { x = clampX(x); if (!docked) y = clampY(y); paint(); });

    return { reset: reset, setDocked: setDocked, get docked() { return docked; } };
  }

  window.OSK_DRAG = { attach: attach };
})();
