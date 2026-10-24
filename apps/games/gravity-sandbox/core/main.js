/* Gravity Sandbox — main loop: fixed timestep, sub-stepped by speed. */
(function () {
  'use strict';
  const P = GS.P, R = GS.R, U = GS.U, $ = id => document.getElementById(id);
  GS.load = function (name) {
    const pr = GS.PRESETS[name] || GS.PRESETS.solar; GS.cur = pr; P.clear(); P.soft = pr.soft || 0.3;
    pr.build(P); P.accel(P.bodies); R.follow = null; R.cam.x = 0; R.cam.y = 0;
    let far = 50; for (const b of P.bodies) far = Math.max(far, Math.hypot(b.x, b.y));
    R.cam.z = Math.min(2, Math.min(innerWidth, innerHeight - 50) / (2.3 * far));
    $('note').textContent = pr.label; $('preset').value = name;
  };
  const cv = $('c'); R.init(cv); U.init(cv); GS.load('solar');
  let acc = 0, last = performance.now(), fps = 60, tick = 0;
  const BASE = 6; // physics steps per frame at 1x
  function frame(now) {
    const w0 = performance.now(), ft = Math.min(100, now - last); last = now; fps = fps * 0.95 + (1000 / Math.max(ft, 1)) * 0.05;
    if (!U.paused) {
      acc += BASE * U.speed() * ft / (1000 / 60);
      let n = Math.min(Math.floor(acc), 60); acc -= Math.floor(acc); if (acc > 5) acc = 0;
      for (let i = 0; i < n; i++) P.step(GS.cur.dt);
      if (n > 0 && (++tick & 1)) R.pushTrails();
    }
    if (R.follow && P.bodies.includes(R.follow)) { R.cam.x = R.follow.x; R.cam.y = R.follow.y; }
    R.draw(); GS.L.tick(performance.now() - w0);
    $('info').textContent = `bodies ${P.bodies.length}  ×${U.speed()}  t ${P.time.toFixed(0)}  ${fps.toFixed(0)} fps` + (GS.L.level < 2 && P.bodies.some(b => b.hole) ? `  lensing ${GS.L.level ? 'reduced' : 'off'} (slow)` : '') + (R.follow ? `\nfollowing ${R.follow.name || 'body'} (tap empty space to stop)` : '\ndrag to fling · tap body to follow · right/shift-drag pan · wheel/pinch zoom');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
