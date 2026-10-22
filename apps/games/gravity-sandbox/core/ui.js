/* Gravity Sandbox — input: drag-to-fling, pan (right/middle drag, two-finger, or drag with Shift), wheel/pinch zoom, tap to follow. */
(function () {
  'use strict';
  const P = GS.P, R = GS.R, $ = id => document.getElementById(id);
  const U = GS.U = { paused: false, speeds: [0.125, 0.25, 0.5, 1, 2, 4, 8] };
  const VSCALE = 0.02; // drag px (world) -> velocity per sim unit
  let ptrs = new Map(), mode = null, start = null, pinch = null;
  function hit(w) {
    let best = null, bd = Infinity;
    for (const b of P.bodies) { const d = Math.hypot(b.x - w.x, b.y - w.y); if (d < Math.max(b.r * 1.5, 12 / R.cam.z) && d < bd) { bd = d; best = b; } }
    return best;
  }
  function velAt(w) { const s = U.flingRef(); return { vx: (start.w.x - w.x) * VSCALE * 10 / Math.sqrt(R.cam.z) + s.vx, vy: (start.w.y - w.y) * VSCALE * 10 / Math.sqrt(R.cam.z) + s.vy }; }
  U.flingRef = () => (R.follow && P.bodies.includes(R.follow)) ? R.follow : { vx: 0, vy: 0 };
  U.init = function (cv) {
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: R.cam.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; R.aim = null; mode = 'pinch'; return; }
      const w = R.toWorld(e.clientX, e.clientY);
      start = { sx: e.clientX, sy: e.clientY, w, cam: { x: R.cam.x, y: R.cam.y }, t: performance.now() };
      mode = (e.button === 1 || e.button === 2 || e.shiftKey) ? 'pan' : 'fling';
    });
    cv.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === 'pinch' && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        R.cam.x -= (mx - pinch.cx) / R.cam.z; R.cam.y -= (my - pinch.cy) / R.cam.z; pinch.cx = mx; pinch.cy = my;
        R.cam.z = Math.min(20, Math.max(0.05, pinch.z * d / pinch.d)); return;
      }
      if (mode === 'pan') { R.follow = null; R.cam.x = start.cam.x - (e.clientX - start.sx) / R.cam.z; R.cam.y = start.cam.y - (e.clientY - start.sy) / R.cam.z; }
      if (mode === 'fling' && Math.hypot(e.clientX - start.sx, e.clientY - start.sy) > 6) {
        const w = R.toWorld(e.clientX, e.clientY), v = velAt(w), t = P.TYPES[$('btype').value], dt = U.dt();
        R.aim = { x: start.w.x, y: start.w.y, ex: 2 * start.w.x - w.x, ey: 2 * start.w.y - w.y, t, path: P.predict(start.w.x, start.w.y, v.vx, v.vy, 600, dt) };
      }
    });
    const up = e => {
      if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
      if (mode === 'pinch') { if (ptrs.size === 0) mode = null; return; }
      if (mode === 'fling') {
        const moved = Math.hypot(e.clientX - start.sx, e.clientY - start.sy);
        if (moved <= 6) { const b = hit(start.w); R.follow = b || null; }
        else U.fling(start.w, velAt(R.toWorld(e.clientX, e.clientY)));
      }
      R.aim = null; mode = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => {
      e.preventDefault(); const before = R.toWorld(e.clientX, e.clientY);
      R.cam.z = Math.min(20, Math.max(0.05, R.cam.z * Math.exp(-e.deltaY * 0.0015)));
      if (!R.follow) { const after = R.toWorld(e.clientX, e.clientY); R.cam.x += before.x - after.x; R.cam.y += before.y - after.y; }
    }, { passive: false });
    $('pause').onclick = () => { U.paused = !U.paused; $('pause').textContent = U.paused ? 'Play' : 'Pause'; };
    $('reset').onclick = () => GS.load($('preset').value);
    $('preset').onchange = () => GS.load($('preset').value);
    $('trails').onchange = () => { R.trails = $('trails').checked; };
    addEventListener('keydown', e => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); $('pause').click(); } });
  };
  U.speed = () => U.speeds[+$('speed').value];
  U.dt = () => GS.cur.dt;
  const names = { moon: 'Moon', planet: 'Planet', giant: 'Gas giant', star: 'Star', hole: 'Black hole' };
  let cnt = 0;
  U.fling = function (w, v) {
    const k = $('btype').value, t = P.TYPES[k];
    return P.add({ name: names[k] + ' ' + (++cnt), m: t.m, r: t.r, col: t.col, hole: !!t.hole, star: k === 'star', x: w.x, y: w.y, vx: v.vx, vy: v.vy });
  };
})();
