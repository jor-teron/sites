// Aquarium AQQ1a: procedural side-view fish drawing (nose towards +x) shared by every species.
(function () {
  'use strict';
  // Curved triangle fin from (x1,y1) over apex (xa,ya) back to (x2,y2).
  function fin(c, x1, y1, xa, ya, x2, y2) {
    c.moveTo(x1, y1); c.quadraticCurveTo((x1 + xa) / 2, ya * .8 + y1 * .2, xa, ya);
    c.quadraticCurveTo((xa + x2) / 2, y2 * .7 + ya * .3, x2, y2); c.closePath();
  }
  function render(c, s, L, ph, f) {
    if (s.draw) return s.draw(c, L, ph, f || {});   // AQQ1d: non-fish animals draw themselves
    var h = s.H * L, b = Math.sin(ph) * s.amp * L, e = s.eye;
    c.lineJoin = 'round'; c.lineWidth = Math.max(1, L * .018); c.strokeStyle = '#111';
    if (s.extra) s.extra(c, L, h, b);
    [s.dorsal, s.anal].forEach(function (f, i) {
      var sg = i ? 1 : -1; c.beginPath(); fin(c, f.x1 * L, sg * h * .38, f.xa * L, sg * h * (.45 + f.dh), f.x2 * L, sg * h * .28 + b * .3);
      c.fillStyle = f.col; c.fill(); if (f.edge) c.stroke();
      if (f.ribs) { c.save(); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.beginPath();
        for (var k = 1; k < 5; k++) { c.moveTo((f.x1 - k * .07) * L, -h * .38); c.lineTo((f.xa - k * .035) * L, -h * (.45 + f.dh * (1 - k * .08))); } c.stroke(); c.restore(); }
    });
    var t = s.tail, x0 = -.32 * L, tx = -(.34 + t.tl) * L, sp = t.ts * h;   // tail pivots at the peduncle
    c.beginPath(); c.moveTo(x0, b - .1 * h); c.quadraticCurveTo(-(.34 + t.tl * .6) * L, b * 1.3 - sp, tx, b * 1.6 - sp * 1.1);
    c.quadraticCurveTo(-(.34 + t.tl * (1 - t.fork)) * L, b * 1.6, tx, b * 1.6 + sp * 1.1);
    c.quadraticCurveTo(-(.34 + t.tl * .6) * L, b * 1.3 + sp, x0, b + .1 * h); c.closePath(); c.fillStyle = t.col; c.fill(); if (t.edge) c.stroke();
    c.beginPath(); c.moveTo(.5 * L, 0); c.bezierCurveTo(.34 * L, -.62 * h, -.1 * L, -.6 * h + b * .3, -.34 * L, -.14 * h + b);
    c.lineTo(-.34 * L, .14 * h + b); c.bezierCurveTo(-.1 * L, .6 * h + b * .3, .34 * L, .62 * h, .5 * L, 0); c.closePath();
    var g = c.createLinearGradient(0, -h * .5, 0, h * .5); g.addColorStop(0, s.top); g.addColorStop(1, s.bot); c.fillStyle = g; c.fill();
    c.save(); c.clip(); s.pat(c, L, h); c.restore();
    if (s.id === 'clownfish') c.stroke();
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(.16 * L, .12 * h, .09 * L, .04 * h + 1, .4 + Math.sin(ph * .7) * .3, 0, 6.3); c.fill();   // pectoral fin
    c.fillStyle = '#fff'; c.beginPath(); c.arc(e[0] * L, e[1] * h, e[2] * L * 1.25 + .5, 0, 6.3); c.fill();
    c.fillStyle = '#000'; c.beginPath(); c.arc(e[0] * L + e[2] * L * .2, e[1] * h, e[2] * L * .7 + .3, 0, 6.3); c.fill();
  }
  window.AQ.render = render;
})();
