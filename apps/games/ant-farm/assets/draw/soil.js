// AFV1 soil + tunnels, painted into a cached offscreen canvas.
// Only cells listed in w.dirty (plus their 4 neighbours, because tunnel rims
// depend on neighbours) are repainted, so per-frame cost stays near zero.
(function () {
  var W = AF.W, H = AF.H, S = AF.SURF, CP = 6;           // CP = pixels per cell in the cache
  var cv = document.createElement('canvas'), c = cv.getContext('2d');
  cv.width = W * CP; cv.height = H * CP;
  // Soil layer colours, top to bottom; blended smoothly between bands.
  var cols = [[156, 112, 70], [128, 86, 50], [104, 68, 40], [84, 56, 36], [70, 48, 34]];
  // Cheap deterministic per-cell hash in [0,1) (same look after every repaint).
  function hash(i, n) { var h = Math.imul(i ^ (n * 374761393), 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
  function rgb(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }
  function isSoil(w, x, y) { return x >= 0 && x < W && y < H && (y >= S ? w.g[y * W + x] !== 0 : false); }

  function soilBase(w, i, x, y) {
    var f = Math.max(0, Math.min(3.999, (y - S + w.layer[x]) / 18)), L = f | 0, t = f - L;
    t = t < 0.7 ? 0 : (t - 0.7) / 0.3;                      // soft blend only near band edges
    var a = cols[L], b = cols[L + 1], k = (0.86 + w.tone[i] * 0.22) * (1 - w.wet[i] * 0.35);
    return [(a[0] + (b[0] - a[0]) * t) * k, (a[1] + (b[1] - a[1]) * t) * k, (a[2] + (b[2] - a[2]) * t) * k];
  }

  function paintSoil(w, i, x, y, px, py) {
    var col = soilBase(w, i, x, y);
    c.fillStyle = rgb(col[0], col[1], col[2]); c.fillRect(px, py, CP, CP);
    // speckles: 3 tiny light/dark grains
    for (var s = 0; s < 3; s++) {
      var h = hash(i, s + 1), d = h < 0.6 ? 0.78 : 1.12;
      c.fillStyle = rgb(col[0] * d, col[1] * d, col[2] * d);
      c.fillRect(px + (hash(i, s + 7) * (CP - 1) | 0), py + (hash(i, s + 13) * (CP - 1) | 0), 1, 1);
    }
    // occasional pebble (kept inside the cell so dirty repaints stay clean)
    if (hash(i, 31) < 0.035) {
      var r = CP * (0.22 + hash(i, 32) * 0.12), cx = px + CP / 2, cy = py + CP / 2, g = 120 + hash(i, 33) * 50;
      c.fillStyle = rgb(g, g * 0.92, g * 0.82); c.beginPath(); c.ellipse(cx, cy, r * 1.25, r, hash(i, 34) * 3, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(cx - r * 0.6, cy - r * 0.6, 1.2, 1.2);
    }
  }

  function paintStone(w, i, px, py) {
    var v = 105 + w.tone[i] * 40;
    c.fillStyle = rgb(v, v, v + 8); c.fillRect(px, py, CP, CP);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(px, py, CP, 1);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px + (hash(i, 3) * CP | 0), py + (hash(i, 4) * CP | 0), 1, 1);
  }

  // Tunnel cell: dark shadowed interior, lighter dug lip where it meets soil,
  // with a shadow band just inside the lip (deeper on the upper wall).
  function paintTunnel(w, x, y, px, py) {
    c.fillStyle = '#2e1f14'; c.fillRect(px, py, CP, CP);
    var up = isSoil(w, x, y - 1), dn = isSoil(w, x, y + 1), lf = isSoil(w, x - 1, y), rt = isSoil(w, x + 1, y);
    c.fillStyle = 'rgba(0,0,0,.35)';
    if (up) c.fillRect(px, py, CP, 3); if (lf) c.fillRect(px, py, 2, CP); if (rt) c.fillRect(px + CP - 2, py, 2, CP);
    c.fillStyle = 'rgba(214,170,118,.55)';
    if (up) c.fillRect(px, py, CP, 1); if (dn) c.fillRect(px, py + CP - 1, CP, 1);
    if (lf) c.fillRect(px, py, 1, CP); if (rt) c.fillRect(px + CP - 1, py, 1, CP);
    if (dn) { c.fillStyle = 'rgba(120,84,52,.5)'; c.fillRect(px, py + CP - 2, CP, 1); }   // loose floor dirt
  }

  function paint(w, i) {
    var x = i % W, y = i / W | 0; if (y < S || y >= H) return;
    var px = x * CP, py = y * CP, g = w.g[i];
    if (g === 0) paintTunnel(w, x, y, px, py); else if (g === 2) paintStone(w, i, px, py); else paintSoil(w, i, x, y, px, py);
  }

  // Bring the cache up to date and return it.
  AF.soilCache = function (w) {
    var i, j;
    if (w.full) { c.clearRect(0, 0, cv.width, cv.height); for (i = S * W; i < W * H; i++) paint(w, i); w.full = false; w.dirty.length = 0; }
    else if (w.dirty.length) {
      for (j = 0; j < w.dirty.length; j++) { i = w.dirty[j]; paint(w, i); var x = i % W;
        if (x > 0) paint(w, i - 1); if (x < W - 1) paint(w, i + 1); paint(w, i - W); paint(w, i + W); }
      w.dirty.length = 0;
    }
    return cv;
  };
})();
