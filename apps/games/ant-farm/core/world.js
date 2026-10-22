// Ant Farm world: grid of cells (0 air, 1 soil, 2 stone), surface, fields.
var AF = window.AF = {};
AF.W = 160; AF.H = 100; AF.SURF = 14; // first soil row
AF.rng = function (s) { return function () { s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
AF.N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

AF.newWorld = function (seed) {
  var W = AF.W, H = AF.H, S = AF.SURF, r = AF.rng(seed), i, x, y;
  var w = { seed: seed, r: r, g: new Uint8Array(W * H), wet: new Float32Array(W * H), ph: new Float32Array(W * H),
    mound: new Float32Array(W), food: [], drops: [], ants: [], brood: [], stored: 30, t: 0, dug: 0,
    dirty: [], full: true, fieldT: 0, laidT: 0, phT: 0 };
  for (y = S; y < H; y++) for (x = 0; x < W; x++) w.g[y * W + x] = 1;
  for (i = 0; i < 14; i++) { // stones
    var cx = 3 + r() * (W - 6) | 0, cy = S + 8 + r() * (H - S - 10) | 0, rad = 1 + r() * 2.5;
    for (y = -3; y <= 3; y++) for (x = -4; x <= 4; x++) if (x * x / 1.4 + y * y <= rad * rad) AF.set(w, cx + x, cy + y, 2);
  }
  w.qx = 40 + r() * 80 | 0; w.qy = S + 26 + r() * 12 | 0;
  w.sx = w.qx + (r() < 0.5 ? -13 : 13); w.sy = w.qy + 1;
  AF.carveEll(w, w.qx, w.qy, 5, 2.6); AF.carveEll(w, w.sx, w.sy, 4.5, 2.2);
  for (x = Math.min(w.qx, w.sx); x <= Math.max(w.qx, w.sx); x++) AF.set(w, x, w.qy + 1, 0);
  // meandering entrance shaft
  x = w.qx + (r() * 16 - 8 | 0); w.ex = x;
  for (y = S; y < w.qy; y++) { AF.set(w, x, y, 0); if (r() < 0.25) { var nx = x + (x < w.qx ? 1 : x > w.qx ? -1 : (r() < .5 ? 1 : -1)); AF.set(w, nx, y, 0); x = nx; } }
  while (x !== w.qx) { x += x < w.qx ? 1 : -1; AF.set(w, x, w.qy - 1, 0); }
  // soil colour noise per cell
  w.tone = new Float32Array(W * H); for (i = 0; i < W * H; i++) w.tone[i] = r();
  w.layer = []; var a = r() * 6, b = r() * 6;
  for (x = 0; x < W; x++) w.layer[x] = Math.sin(x * 0.05 + a) * 2 + Math.sin(x * 0.13 + b) * 1.2;
  AF.fields(w);
  return w;
};
AF.set = function (w, x, y, v) { if (x >= 0 && y >= 0 && x < AF.W && y < AF.H) { w.g[y * AF.W + x] = v; w.dirty.push(y * AF.W + x); } };
AF.carveEll = function (w, cx, cy, rx, ry) {
  for (var y = -ry - 1 | 0; y <= ry + 1; y++) for (var x = -rx - 1 | 0; x <= rx + 1; x++)
    if (x * x / (rx * rx) + y * y / (ry * ry) <= 1) AF.set(w, cx + x, cy + y, 0);
};
AF.walk = function (w, x, y) { return x >= 0 && x < AF.W && y >= AF.SURF - 1 && y < AF.H && w.g[y * AF.W + x] === 0; };
AF.bfs = function (w, seeds) {
  var W = AF.W, H = AF.H, d = new Int16Array(W * H).fill(-1), q = new Int32Array(W * H), h = 0, t = 0;
  for (var i = 0; i < seeds.length; i++) { d[seeds[i]] = 0; q[t++] = seeds[i]; }
  while (h < t) {
    var c = q[h++], x = c % W, y = c / W | 0;
    for (var k = 0; k < 4; k++) { var nx = x + AF.N4[k][0], ny = y + AF.N4[k][1];
      if (AF.walk(w, nx, ny)) { var n = ny * W + nx; if (d[n] < 0) { d[n] = d[c] + 1; q[t++] = n; } } }
  }
  return d;
};
AF.fields = function (w) {
  w.distN = AF.bfs(w, [w.sy * AF.W + w.sx]);
  var s = []; for (var x = 0; x < AF.W; x++) s.push((AF.SURF - 1) * AF.W + x);
  w.distS = AF.bfs(w, s);
};
