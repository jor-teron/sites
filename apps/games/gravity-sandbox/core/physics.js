/* Gravity Sandbox — N-body physics: velocity Verlet, Plummer softening, fixed step, merging collisions. */
window.GS = window.GS || {};
(function () {
  'use strict';
  const P = GS.P = { G: 1, soft: 0.5, bodies: [], time: 0, nextId: 1 };
  P.TYPES = {
    moon:   { m: 0.02, r: 2,  col: '#bbb' },
    planet: { m: 1,    r: 4,  col: '#5af' },
    giant:  { m: 30,   r: 8,  col: '#da8' },
    star:   { m: 1000, r: 14, col: '#fd6' },
    hole:   { m: 5000, r: 6,  col: '#000', hole: true }
  };
  P.add = function (o) {
    const b = Object.assign({ x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, m: 1, r: 3, col: '#fff', name: '', trail: [] }, o);
    b.id = P.nextId++; P.bodies.push(b); return b;
  };
  P.clear = function () { P.bodies.length = 0; P.time = 0; };
  function accel(bs) {
    const n = bs.length, e2 = P.soft * P.soft;
    for (let i = 0; i < n; i++) { bs[i].ax = 0; bs[i].ay = 0; }
    for (let i = 0; i < n; i++) {
      const a = bs[i];
      for (let j = i + 1; j < n; j++) {
        const b = bs[j], dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + e2, inv = P.G / (d2 * Math.sqrt(d2));
        a.ax += dx * inv * b.m; a.ay += dy * inv * b.m;
        b.ax -= dx * inv * a.m; b.ay -= dy * inv * a.m;
      }
    }
  }
  P.accel = accel;
  P.step = function (dt, bs) {
    bs = bs || P.bodies;
    for (const b of bs) { b.vx += b.ax * dt / 2; b.vy += b.ay * dt / 2; b.x += b.vx * dt; b.y += b.vy * dt; }
    accel(bs);
    for (const b of bs) { b.vx += b.ax * dt / 2; b.vy += b.ay * dt / 2; }
    if (bs === P.bodies) { P.time += dt; return merge(); }
    return 0;
  };
  function merge() {
    const bs = P.bodies; let merged = 0;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j], dx = b.x - a.x, dy = b.y - a.y, rr = (a.r + b.r) * 0.6;
        if (dx * dx + dy * dy < rr * rr) {
          const big = a.m >= b.m ? a : b, sm = big === a ? b : a, M = a.m + b.m;
          big.x = (a.x * a.m + b.x * b.m) / M; big.y = (a.y * a.m + b.y * b.m) / M;
          big.vx = (a.vx * a.m + b.vx * b.m) / M; big.vy = (a.vy * a.m + b.vy * b.m) / M;
          if (!big.hole) big.r = Math.cbrt(Math.pow(big.r, 3) + Math.pow(sm.r, 3) * 0.5);
          big.m = M; bs.splice(bs.indexOf(sm), 1); merged++;
          if (P.onMerge) P.onMerge(sm, big);
          i = -1; break;
        }
      }
    }
    if (merged) accel(bs);
    return merged;
  }
  /* Predicted path for a test body (ignores its own pull on others). */
  P.predict = function (x, y, vx, vy, steps, dt) {
    const pts = [], e2 = P.soft * P.soft;
    for (let k = 0; k < steps; k++) {
      let ax = 0, ay = 0;
      for (const b of P.bodies) { const dx = b.x - x, dy = b.y - y, d2 = dx * dx + dy * dy + e2, inv = P.G * b.m / (d2 * Math.sqrt(d2)); ax += dx * inv; ay += dy * inv; }
      vx += ax * dt; vy += ay * dt; x += vx * dt; y += vy * dt;
      if (k % 2 === 0) pts.push(x, y);
    }
    return pts;
  };
  P.circV = function (M, r) { return Math.sqrt(P.G * M / r); };
})();
