/* Gravity Sandbox — gravitational lensing of the background stars near black holes (display only, no physics).
   Point-lens model in screen space: a star at distance b from a hole shows as a brightened outer image at
   (b + sqrt(b^2 + 4E^2)) / 2 and a faint inner image on the far side (E = Einstein radius), plus a soft
   Einstein ring. Levels: 2 full, 1 outer image only, 0 off; steps down when frame work time stays > 12ms. */
(function () {
  'use strict';
  const L = GS.L = { level: 2, auto: true, avg: 0, slow: 0, fast: 0, REACH: 8 };
  L.prep = function (holes, toScreen, z) {
    if (!L.level || !holes.length) return [];
    return holes.map(h => { const p = toScreen(h.x, h.y), sh = h.r * z, re = Math.max(6, sh * 3.2);
      return { x: p.x, y: p.y, sh, re, far: re * L.REACH }; });
  };
  /* Draw one background star bent by the nearest hole in reach; false = not lensed, draw it normally. */
  L.star = function (cx, lens, x, y, s, a) {
    let h = null, b = Infinity;
    for (const o of lens) { const d = Math.hypot(x - o.x, y - o.y); if (d < o.far && d < b) { b = d; h = o; } }
    if (!h) return false;
    b = Math.max(b, 0.01);
    const w = Math.min(1, (h.far - b) / (h.far * 0.4)), e2 = h.re * h.re * w * w, ux = (x - h.x) / b, uy = (y - h.y) / b; // fade out at the edge: no jumps
    const root = Math.sqrt(b * b + 4 * e2), u2 = b * b / Math.max(e2, 1e-6), mu = (u2 + 2) / Math.sqrt(u2 * (u2 + 4));
    dot(cx, h, h.x + ux * (b + root) / 2, h.y + uy * (b + root) / 2, s, a, (mu + 1) / 2);
    if (L.level > 1) dot(cx, h, h.x + ux * (b - root) / 2, h.y + uy * (b - root) / 2, s, a, (mu - 1) / 2);
    return true;
  };
  function dot(cx, h, x, y, s, a, m) {
    const al = Math.min(1, a * Math.min(m, 3)); if (al < 0.03) return;
    if ((x - h.x) ** 2 + (y - h.y) ** 2 < h.sh * h.sh * 1.25) return; // behind the black core
    const k = Math.min(2.2, Math.sqrt(m)) * s;
    cx.fillStyle = `rgba(200,215,255,${al})`; cx.fillRect(x - (k - s) / 2, y - (k - s) / 2, k, k);
  }
  /* Faint Einstein ring around each hole (full level only). */
  L.rings = function (cx, lens) {
    if (L.level < 2) return;
    for (const h of lens) {
      cx.strokeStyle = 'rgba(200,215,255,0.07)'; cx.lineWidth = Math.max(2, h.re * 0.35); cx.beginPath(); cx.arc(h.x, h.y, h.re, 0, 7); cx.stroke();
      cx.strokeStyle = 'rgba(225,232,255,0.16)'; cx.lineWidth = 1; cx.beginPath(); cx.arc(h.x, h.y, h.re, 0, 7); cx.stroke();
    }
  };
  /* Called once per frame with the frame's work time (physics + draw). Steps down after ~1s slow, back up after ~10s fast. */
  L.tick = function (ms) {
    L.avg = L.avg * 0.95 + ms * 0.05; if (!L.auto) return;
    if (L.avg > 12 && L.level > 0) { if (++L.slow > 60) { L.level--; L.slow = 0; } } else L.slow = 0;
    if (L.avg < 6 && L.level < 2) { if (++L.fast > 600) { L.level++; L.fast = 0; } } else L.fast = 0;
  };
})();
