/* ============================================================
 * File:        assets/fx.js
 * Project:     Osmos OSM1a
 * Purpose:     Soft background motes + short motion trails.
 * Depends on:  none (drawn by ui/render.js)
 * ============================================================ */
var OSMOS_FX = (function () {
  var motes = [];
  var trails = [];

  function init(w, h, count) {
    motes = [];
    for (var i = 0; i < (count || 42); i++) {
      motes.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.6 + Math.random() * 1.8,
        a: 0.08 + Math.random() * 0.18,
        s: 4 + Math.random() * 14
      });
    }
    trails = [];
  }

  function pushTrail(x, y, mass, color) {
    trails.push({ x: x, y: y, r: Math.sqrt(mass) * 1.6, a: 0.28, color: color });
    if (trails.length > 48) trails.shift();
  }

  function step(dt, w, h) {
    var i, m;
    for (i = 0; i < motes.length; i++) {
      m = motes[i];
      m.y -= m.s * dt * 0.15;
      m.x += Math.sin(m.y * 0.02 + i) * 6 * dt;
      if (m.y < -4) { m.y = h + 4; m.x = Math.random() * w; }
    }
    for (i = trails.length - 1; i >= 0; i--) {
      trails[i].a -= dt * 0.55;
      trails[i].r *= 0.985;
      if (trails[i].a <= 0.02) trails.splice(i, 1);
    }
  }

  function draw(ctx) {
    var i, m, t, g;
    for (i = 0; i < motes.length; i++) {
      m = motes[i];
      ctx.beginPath();
      ctx.fillStyle = 'rgba(180,220,255,' + m.a + ')';
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (i = 0; i < trails.length; i++) {
      t = trails[i];
      g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
      g.addColorStop(0, t.color.replace('ALP', String(t.a)));
      g.addColorStop(1, t.color.replace('ALP', '0'));
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { init: init, pushTrail: pushTrail, step: step, draw: draw };
})();
