/* Gravity Sandbox — rendering: star field, trails, bodies, fling preview. */
(function () {
  'use strict';
  const P = GS.P;
  const R = GS.R = { cam: { x: 0, y: 0, z: 1 }, trails: true, follow: null, aim: null };
  let cv, cx, W, H, dpr, stars = [];
  R.init = function (c) { cv = c; cx = c.getContext('2d'); R.resize(); addEventListener('resize', R.resize); };
  R.resize = function () {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    stars = []; for (let i = 0; i < 300; i++) stars.push([rnd() * W, rnd() * H, rnd() * 1.3 + 0.2, rnd() * 0.6 + 0.2, rnd() * 0.3 + 0.05]);
  };
  R.toWorld = (sx, sy) => ({ x: (sx - W / 2) / R.cam.z + R.cam.x, y: (sy - H / 2) / R.cam.z + R.cam.y });
  R.toScreen = (x, y) => ({ x: (x - R.cam.x) * R.cam.z + W / 2, y: (y - R.cam.y) * R.cam.z + H / 2 });
  R.pushTrails = function () {
    for (const b of P.bodies) { b.trail.push(b.x, b.y); if (b.trail.length > 240) b.trail.splice(0, 2); }
  };
  R.draw = function () {
    const z = R.cam.z;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = '#02030a'; cx.fillRect(0, 0, W, H);
    for (const s of stars) { // parallax star field
      const x = ((s[0] - R.cam.x * s[4] * z) % W + W) % W, y = ((s[1] - R.cam.y * s[4] * z) % H + H) % H;
      cx.fillStyle = `rgba(200,215,255,${s[3]})`; cx.fillRect(x, y, s[2], s[2]);
    }
    cx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - R.cam.x * z), dpr * (H / 2 - R.cam.y * z));
    if (R.trails) {
      cx.lineWidth = 1 / z;
      for (const b of P.bodies) {
        const t = b.trail, n = t.length / 2; if (n < 2) continue;
        for (let seg = 0; seg < 4; seg++) { // fade in 4 bands
          const a = Math.floor(seg * n / 4), e = Math.min(n - 1, Math.floor((seg + 1) * n / 4));
          cx.globalAlpha = 0.12 + seg * 0.15; cx.strokeStyle = b.hole ? '#a6f' : b.col; cx.beginPath();
          cx.moveTo(t[a * 2], t[a * 2 + 1]); for (let k = a + 1; k <= e; k++) cx.lineTo(t[k * 2], t[k * 2 + 1]); cx.stroke();
        }
      }
      cx.globalAlpha = 1;
    }
    for (const b of P.bodies) {
      const r = Math.max(b.r, 1.5 / z);
      if (b.star) {
        const g = cx.createRadialGradient(b.x, b.y, r * 0.3, b.x, b.y, r * 3);
        g.addColorStop(0, b.col); g.addColorStop(1, 'rgba(255,200,80,0)'); cx.fillStyle = g;
        cx.beginPath(); cx.arc(b.x, b.y, r * 3, 0, 7); cx.fill();
      }
      if (b.hole) {
        cx.strokeStyle = '#b07cff'; cx.lineWidth = 2 / z; cx.beginPath(); cx.arc(b.x, b.y, r * 1.6, 0, 7); cx.stroke();
        cx.fillStyle = '#000'; cx.beginPath(); cx.arc(b.x, b.y, r, 0, 7); cx.fill(); continue;
      }
      cx.fillStyle = b.col; cx.beginPath(); cx.arc(b.x, b.y, r, 0, 7); cx.fill();
      if (!b.star && r * z > 3) { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.arc(b.x + r * 0.35, b.y + r * 0.35, r * 0.85, 0, 7); cx.fill(); }
      if (b.ring) { cx.strokeStyle = 'rgba(230,210,150,.7)'; cx.lineWidth = 1.2 / z; cx.beginPath(); cx.ellipse(b.x, b.y, r * 1.9, r * 0.6, -0.4, 0, 7); cx.stroke(); }
      if (b.name && z * 1 > 0.35 && (b.m > 0.01 || z > 2)) { cx.fillStyle = 'rgba(180,200,230,.7)'; cx.font = 11 / z + 'px system-ui'; cx.fillText(b.name, b.x + r + 3 / z, b.y - r - 2 / z); }
    }
    if (R.follow && P.bodies.includes(R.follow)) { const b = R.follow; cx.strokeStyle = '#6f6'; cx.lineWidth = 1 / z; cx.beginPath(); cx.arc(b.x, b.y, b.r + 5 / z, 0, 7); cx.stroke(); }
    const A = R.aim;
    if (A) {
      cx.strokeStyle = 'rgba(120,255,160,.5)'; cx.lineWidth = 1 / z; cx.setLineDash([4 / z, 4 / z]); cx.beginPath();
      const p = A.path; if (p.length) { cx.moveTo(A.x, A.y); for (let k = 0; k < p.length; k += 2) cx.lineTo(p[k], p[k + 1]); } cx.stroke(); cx.setLineDash([]);
      cx.strokeStyle = '#7f7'; cx.lineWidth = 2 / z; cx.beginPath(); cx.moveTo(A.x, A.y); cx.lineTo(A.ex, A.ey); cx.stroke();
      cx.fillStyle = A.t.col === '#000' ? '#a6f' : A.t.col; cx.beginPath(); cx.arc(A.x, A.y, A.t.r, 0, 7); cx.fill();
    }
  };
})();
