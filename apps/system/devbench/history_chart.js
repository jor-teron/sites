/*
  File: history_chart.js
  Project: devbench
  Role: Hand-drawn canvas chart for the History tab (no library). Overall score line (thick
  gradient) plus optional CPU / GPU / Memory / AI lines, jelly draw-in animation (skipped when
  reduced motion is on), "best" marker, selected-point ring, date labels.
  Exposes window.DevbenchHistChart.draw(canvas, points, opts) and .hit(canvas, x) -> index or -1.
  points: [{ label, score, cats: {cpu, gpu, mem, ai} }] oldest first.
*/

var devbenchHcAnim = 0;

/* Elastic ease-out for the jelly draw-in. */
function devbenchHcEase(t) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * 9);
}

/* Geometry shared by draw and hit-test. */
function devbenchHcGeom(cv, n) {
  var w = cv.clientWidth || 320, h = cv.clientHeight || 240, L = 34, R = 16, T = 22, B = 30;
  return { w: w, h: h, L: L, R: R, T: T, B: B,
    x: function (i) { return n < 2 ? (L + w - R) / 2 : L + (w - L - R) * i / (n - 1); },
    y: function (v) { return T + (h - T - B) * (1 - v / 100); } };
}

/* One frame at draw-in progress p (0..1, may overshoot slightly). */
function devbenchHcFrame(cv, pts, opts, p) {
  var dpr = window.devicePixelRatio || 1, G = devbenchHcGeom(cv, pts.length);
  cv.width = Math.round(G.w * dpr); cv.height = Math.round(G.h * dpr);
  var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#1c1f26"; g.fillRect(0, 0, G.w, G.h);
  /* Grid + y labels */
  g.font = "11px system-ui, sans-serif"; g.fillStyle = "#7d8590"; g.strokeStyle = "#2c313a"; g.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach(function (v) { g.beginPath(); g.moveTo(G.L, G.y(v)); g.lineTo(G.w - G.R, G.y(v)); g.stroke(); g.fillText(String(v), 6, G.y(v) + 4); });
  if (!pts.length) { g.fillStyle = "#9aa0a6"; g.font = "14px system-ui, sans-serif"; g.fillText("No runs yet. Tap Run all to start your history.", G.L, G.h / 2); return; }
  /* X labels: first, middle, last */
  var idx = pts.length > 2 ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : pts.map(function (_, i) { return i; });
  g.fillStyle = "#9aa0a6";
  idx.forEach(function (i, k) { var t = pts[i].label, tw = g.measureText(t).width; g.fillText(t, Math.min(G.w - G.R - tw, Math.max(G.L, G.x(i) - (k ? tw / 2 : 0))), G.h - 10); });
  /* Clip to the drawn part, scale y around the bottom for the jelly squash. */
  var clipW = G.L + (G.w - G.L - G.R) * Math.min(1, Math.max(0, p)) + 8;
  g.save(); g.beginPath(); g.rect(0, 0, clipW, G.h); g.clip();
  var base = G.y(0), sy = 0.6 + 0.4 * p;
  var Y = function (v) { return base - (base - G.y(v)) * sy; };
  var line = function (get, color, width) {
    g.beginPath(); var started = false;
    pts.forEach(function (pt, i) { var v = get(pt); if (v == null) { return; } if (started) { g.lineTo(G.x(i), Y(v)); } else { g.moveTo(G.x(i), Y(v)); started = true; } });
    g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
  };
  var cats = window.DevbenchHistory.CATS;
  (opts.lines || []).forEach(function (k) { line(function (pt) { return pt.cats[k]; }, cats[k].color, 2.5); });
  var grad = g.createLinearGradient(0, 0, G.w, 0); grad.addColorStop(0, "#3dd6ff"); grad.addColorStop(0.5, "#7c5cff"); grad.addColorStop(1, "#ff5fa2");
  line(function (pt) { return pt.score; }, grad, 4.5);
  /* Dots on the overall line (skip when crowded). */
  if (pts.length <= 60) {
    g.fillStyle = "#fff";
    pts.forEach(function (pt, i) { g.beginPath(); g.arc(G.x(i), Y(pt.score), pts.length > 30 ? 2.5 : 4, 0, 7); g.fill(); });
  }
  g.restore();
  /* Best marker */
  if (opts.best >= 0 && p >= 0.95) {
    var bx = G.x(opts.best), by = Y(pts[opts.best].score);
    g.fillStyle = "#ffd84d"; g.beginPath();
    for (var k = 0; k < 10; k++) { var r = k % 2 ? 4 : 9, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(bx + r * Math.cos(a), by - 14 + r * Math.sin(a)); }
    g.closePath(); g.fill();
    g.font = "bold 11px system-ui, sans-serif"; g.fillText("best " + pts[opts.best].score, Math.min(G.w - 60, bx + 10), Math.max(12, by - 18));
  }
  /* Selected point ring */
  if (opts.sel >= 0 && opts.sel < pts.length) {
    var sx = G.x(opts.sel), syy = Y(pts[opts.sel].score);
    g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.arc(sx, syy, 9, 0, 7); g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, G.T); g.lineTo(sx, G.y(0)); g.stroke();
  }
}

/* Draw, with the jelly draw-in when opts.animate and motion is allowed. */
function devbenchHcDraw(cv, pts, opts) {
  cancelAnimationFrame(devbenchHcAnim);
  var still = !opts.animate || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (still) { devbenchHcFrame(cv, pts, opts, 1); return; }
  var t0 = performance.now();
  (function step(t) {
    var q = Math.min(1, (t - t0) / 1100);
    devbenchHcFrame(cv, pts, opts, devbenchHcEase(q));
    if (q < 1) { devbenchHcAnim = requestAnimationFrame(step); }
  })(t0);
}

/* Nearest point index to a tap at canvas x (CSS px), or -1. */
function devbenchHcHit(cv, n, x) {
  if (!n) { return -1; }
  var G = devbenchHcGeom(cv, n), best = -1, d = Infinity;
  for (var i = 0; i < n; i++) { var dx = Math.abs(G.x(i) - x); if (dx < d) { d = dx; best = i; } }
  return best;
}

window.DevbenchHistChart = { draw: devbenchHcDraw, hit: devbenchHcHit };
