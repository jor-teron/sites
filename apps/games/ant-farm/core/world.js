// Ant Farm world: grid of cells (0 air, 1 soil, 2 stone), surface, fields.
// AF2: 2-4 thin (1-cell) entrance shafts, dig tips (w.tips) and rooms (w.rooms).
// AF3: brood room beside the queen (w.bx, w.by), day clock (AF.dayPhase / AF.nightAmt).
// Uses nothing but the browser; no shared settings are read here.
var AF = window.AF = {};
AF.W = 160; AF.H = 100; AF.SURF = 14; // first soil row
AF.rng = function (s) { return function () { s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
AF.N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

AF.newWorld = function (seed) {
  var W = AF.W, H = AF.H, S = AF.SURF, r = AF.rng(seed), i, x, y;
  var w = { seed: seed, r: r, g: new Uint8Array(W * H), wet: new Float32Array(W * H), ph: new Float32Array(W * H),
    mound: new Float32Array(W), food: [], drops: [], ants: [], brood: [], stored: 30, t: 0, dug: 0,
    dirty: [], full: true, fieldT: 0, laidT: 0, phT: 0, tips: [], tun: [], rooms: [], ents: [], tipT: 2, falls: [], natT: 8 };
  for (y = S; y < H; y++) for (x = 0; x < W; x++) w.g[y * W + x] = 1;
  for (i = 0; i < 14; i++) { // stones
    var cx = 3 + r() * (W - 6) | 0, cy = S + 8 + r() * (H - S - 10) | 0, rad = 1 + r() * 2.5;
    for (y = -3; y <= 3; y++) for (x = -4; x <= 4; x++) if (x * x / 1.4 + y * y <= rad * rad) AF.set(w, cx + x, cy + y, 2);
  }
  w.qx = 40 + r() * 80 | 0; w.qy = S + 26 + r() * 12 | 0;
  var side = r() < 0.5 ? -1 : 1; w.sx = w.qx + side * 13; w.sy = w.qy + 1; w.bx = w.qx - side * 12; w.by = w.qy + 1;
  AF.carveEll(w, w.qx, w.qy, 5, 2.6); AF.carveEll(w, w.sx, w.sy, 4.5, 2.2); AF.carveEll(w, w.bx, w.by, 4, 1.8);
  w.rooms.push({ x: w.bx, y: w.by, rx: 4, ry: 1.8, kind: 'brood' });
  w.rooms.push({ x: w.qx, y: w.qy, rx: 5, ry: 2.6, kind: 'queen' }, { x: w.sx, y: w.sy, rx: 4.5, ry: 2.2, kind: 'store' });
  for (x = Math.min(w.bx, w.sx); x <= Math.max(w.bx, w.sx); x++) { AF.set(w, x, w.qy + 1, 0); w.tun.push((w.qy + 1) * W + x); }
  // AF2: main shaft from the surface down to the queen room, then 1-3 extra entrances joining the tunnels
  x = w.qx + (r() * 16 - 8 | 0); w.ex = x; w.ents.push(x);
  AF.path(w, x, S, w.qx, w.qy - 3, r);
  var ne = 2 + (r() * 3 | 0), tries = 0;
  while (w.ents.length < ne && tries++ < 40) {
    var ex = 8 + r() * (W - 16) | 0, ok = true;
    for (i = 0; i < w.ents.length; i++) if (Math.abs(w.ents[i] - ex) < 22) ok = false;
    if (!ok) continue;
    var tc = 0, td = 1e9; // join the nearest tunnel cell that is a little below the surface
    for (i = 0; i < w.tun.length; i++) { var c = w.tun[i], cx2 = c % W, cy2 = c / W | 0, d = Math.abs(cx2 - ex) + Math.abs(cy2 - S - 10);
      if (cy2 > S + 5 && d < td) { td = d; tc = c; } }
    w.ents.push(ex); AF.path(w, ex, S, tc % W, tc / W | 0, r);
  }
  // first dig jobs: out of the far side of each room and down from the queen room
  AF.addTip(w, w.bx - side * 4, w.by, -side, 0, 14 + r() * 12);
  AF.addTip(w, w.sx + side * 4, w.sy, side, 0, 10 + r() * 12);
  AF.addTip(w, w.qx, w.qy + 2, 0, 1, 10 + r() * 10);
  // soil colour noise per cell
  w.tone = new Float32Array(W * H); for (i = 0; i < W * H; i++) w.tone[i] = r();
  w.layer = []; var a = r() * 6, b = r() * 6;
  for (x = 0; x < W; x++) w.layer[x] = Math.sin(x * 0.05 + a) * 2 + Math.sin(x * 0.13 + b) * 1.2;
  AF.fields(w);
  return w;
};
// AF3 day clock: 0..1 through one colony day (AF.DAY sim seconds), 0 = midnight; a new colony starts at ~7am.
AF.dayPhase = function (w) { return ((w.t / (AF.DAY || 60)) + 0.3) % 1; };
AF.nightAmt = function (w) { return Math.min(1, Math.max(0, (Math.abs(AF.dayPhase(w) - 0.5) * 4 - 1.2) / 0.6)); };   // 0 day .. 1 midnight
AF.set = function (w, x, y, v) { if (x >= 0 && y >= 0 && x < AF.W && y < AF.H) { w.g[y * AF.W + x] = v; w.dirty.push(y * AF.W + x); } };
AF.carveEll = function (w, cx, cy, rx, ry) {
  for (var y = -ry - 1 | 0; y <= ry + 1; y++) for (var x = -rx - 1 | 0; x <= rx + 1; x++)
    if (x * x / (rx * rx) + y * y / (ry * ry) <= 1) AF.set(w, cx + x, cy + y, 0);
};
// Thin 1-cell tunnel from (x,y) to (tx,ty) with 4-connected, slightly random steps
// (straight down for the first 4 rows so entrances do not trench along the surface).
AF.path = function (w, x, y, tx, ty, r) {
  var W = AF.W, n = 0;
  AF.set(w, x, y, 0); w.tun.push(y * W + x);
  while ((x !== tx || y !== ty) && n++ < 400) {
    var dx = tx - x, dy = ty - y, ay = Math.abs(dy), ax = Math.abs(dx);
    if (ax && (!ay || (y > AF.SURF + 3 && r() < (ax / (ax + ay)) * 0.8))) x += dx > 0 ? 1 : -1; else y += dy > 0 ? 1 : -1;
    if (w.g[y * W + x] === 0) continue;
    AF.set(w, x, y, 0); w.tun.push(y * W + x);
  }
};
// A dig job: an air cell (x,y) at a tunnel end, heading (mx,my), cells left to dig.
AF.addTip = function (w, x, y, mx, my, len) {
  var t = { x: x, y: y, mx: mx, my: my, left: len | 0, len: 0, room: null, busy: false, perp: false };
  w.tips.push(t); w.needField = true; return t;
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
  var t = []; for (var i = 0; i < w.tips.length; i++) if (AF.walk(w, w.tips[i].x, w.tips[i].y)) t.push(w.tips[i].y * AF.W + w.tips[i].x);
  w.distT = t.length ? AF.bfs(w, t) : null;
  w.distQ = AF.bfs(w, [w.qy * AF.W + w.qx]); w.distB = AF.bfs(w, [w.by * AF.W + w.bx]);   // AF3: queen + brood rooms      // AF2: diggers walk down this to the nearest dig job
};
