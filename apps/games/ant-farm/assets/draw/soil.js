// AF-4a soil + tunnels, painted into a cached offscreen canvas.
// Smooth burrows: air cells are punched as overlapping capsules (circles +
// 8-neighbour links) so diagonal shafts lose the one-cell stair-step, with a
// rounded dug lip along the soil edge. Chamber floors get a packed-earth tint
// by room kind. Soil has richer grains, roots, clay streaks and stones.
// Only a padded dirty rectangle is repainted, so per-frame cost stays low.
(function () {
  var W = AF.W, H = AF.H, S = AF.SURF, CP = 10;           // CP = pixels per cell in the cache
  var cv = document.createElement('canvas'), c = cv.getContext('2d');
  cv.width = W * CP; cv.height = H * CP;
  var cols = [[166, 122, 76], [138, 94, 56], [110, 74, 44], [88, 58, 38], [70, 48, 34], [58, 40, 30]];
  var FLOOR = { queen: [118, 78, 44], brood: [96, 66, 40], store: [108, 72, 42], side: [90, 62, 40] };
  function hash(i, n) { var h = Math.imul(i ^ (n * 374761393), 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
  function rgb(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }
  function rgba(r, g, b, a) { return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a + ')'; }
  function solid(w, x, y) { return x >= 0 && x < W && y >= S && y < H && w.g[y * W + x] !== 0; }
  function isAir(w, x, y) { return x >= 0 && x < W && y >= S && y < H && w.g[y * W + x] === 0; }

  function soilBase(w, i, x, y) {
    var f = Math.max(0, Math.min(4.999, (y - S + w.layer[x]) / 16)), L = f | 0, t = f - L;
    t = t < 0.65 ? 0 : (t - 0.65) / 0.35;
    var a = cols[L], b = cols[Math.min(cols.length - 1, L + 1)], k = (0.86 + w.tone[i] * 0.22) * (1 - w.wet[i] * 0.38);
    return [(a[0] + (b[0] - a[0]) * t) * k, (a[1] + (b[1] - a[1]) * t) * k, (a[2] + (b[2] - a[2]) * t) * k];
  }

  function paintSoil(w, i, x, y, px, py) {
    var col = soilBase(w, i, x, y);
    c.fillStyle = rgb(col[0], col[1], col[2]); c.fillRect(px, py, CP, CP);
    // fine grains
    var s, h, d;
    for (s = 0; s < 5; s++) {
      h = hash(i, s + 1); d = h < 0.55 ? 0.74 : (h < 0.85 ? 1.14 : 1.28);
      c.fillStyle = rgb(col[0] * d, col[1] * d, col[2] * d);
      c.fillRect(px + (hash(i, s + 7) * (CP - 1) | 0), py + (hash(i, s + 13) * (CP - 1) | 0), 1 + (h > 0.92 ? 1 : 0), 1);
    }
    // clay streak (horizontal, slightly wavy) on some rows
    if (hash(i, 41) < 0.12) {
      c.fillStyle = rgba(col[0] * 0.82, col[1] * 0.7, col[2] * 0.6, 0.45);
      c.fillRect(px, py + (hash(i, 42) * (CP - 2) | 0), CP, 1 + (hash(i, 43) < 0.4 ? 1 : 0));
    }
    // short root hair, clipped to the cell
    if (hash(i, 51) < 0.045) {
      c.strokeStyle = rgba(50, 32, 18, 0.45); c.lineWidth = 1; c.beginPath();
      var rx = px + hash(i, 52) * CP, ry = py + hash(i, 53) * 3;
      c.moveTo(rx, ry); c.quadraticCurveTo(rx + (hash(i, 54) - 0.5) * CP, py + CP * 0.55, rx + (hash(i, 55) - 0.5) * 4, py + CP);
      c.stroke();
    }
    // occasional pebble sitting in the soil
    if (hash(i, 31) < 0.04) {
      var r = CP * (0.16 + hash(i, 32) * 0.16), cx = px + 2 + hash(i, 35) * (CP - 4), cy = py + 2 + hash(i, 36) * (CP - 4);
      var g = 110 + hash(i, 33) * 60, moss = hash(i, 37) < 0.25;
      c.fillStyle = moss ? rgb(g * 0.7, g * 0.85, g * 0.6) : rgb(g, g * 0.94, g * 0.86);
      c.beginPath(); c.ellipse(cx, cy, r * (1.15 + hash(i, 38) * 0.3), r, hash(i, 34) * 3, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(cx - r * 0.5, cy - r * 0.55, 1.3, 1.3);
    }
  }

  function paintBoulders(w, x0, y0, x1, y1) {
    var seen = {}, x, y, i, k, q, cells, min, p, nx, ny, cx, cy, n, a, ang, rr, v, j, seed;
    function addComp(sx, sy) {
      q = [[sx, sy]]; cells = []; min = sy * W + sx; seen[min] = 1;
      while (q.length) {
        p = q.pop(); cells.push(p);
        for (k = 0; k < 4; k++) {
          nx = p[0] + AF.N4[k][0]; ny = p[1] + AF.N4[k][1];
          if (nx < 0 || nx >= W || ny < S || ny >= H || w.g[ny * W + nx] !== 2) continue;
          i = ny * W + nx; if (seen[i]) continue; seen[i] = 1; q.push([nx, ny]); if (i < min) min = i;
        }
      }
      return cells;
    }
    for (y = Math.max(S, y0 - 5); y < Math.min(H, y1 + 5); y++) for (x = Math.max(0, x0 - 5); x < Math.min(W, x1 + 5); x++) {
      if (w.g[y * W + x] !== 2 || seen[y * W + x]) continue;
      cells = addComp(x, y);
      cx = 0; cy = 0;
      for (j = 0; j < cells.length; j++) { cx += cells[j][0]; cy += cells[j][1]; }
      cx = (cx / cells.length + 0.5) * CP; cy = (cy / cells.length + 0.5) * CP;
      seed = min; n = 8 + (hash(seed, 2) * 4 | 0); v = 100 + hash(seed, 3) * 45;
      c.beginPath();
      for (a = 0; a < n; a++) {
        ang = a / n * Math.PI * 2 + hash(seed, 4) * 0.4;
        // radius reaches the furthest cell in this direction, plus a little
        rr = CP * 0.55;
        for (j = 0; j < cells.length; j++) {
          var dx = (cells[j][0] + 0.5) * CP - cx, dy = (cells[j][1] + 0.5) * CP - cy;
          var proj = dx * Math.cos(ang) + dy * Math.sin(ang);
          if (proj > 0) rr = Math.max(rr, proj + CP * (0.42 + hash(seed, 10 + j) * 0.18));
        }
        (a ? c.lineTo : c.moveTo).call(c, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.86);
      }
      c.closePath();
      c.fillStyle = rgb(v, v * 0.97, v * 0.9); c.fill();
      c.strokeStyle = 'rgba(40,30,22,.5)'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath();
      c.ellipse(cx - rr * 0.15, cy - rr * 0.2, Math.max(3, cells.length * 1.2), Math.max(2, cells.length * 0.6), -0.5, 0, 7); c.fill();
      c.strokeStyle = 'rgba(30,24,18,.4)'; c.lineWidth = 0.9; c.beginPath();
      c.moveTo(cx - CP * 0.6, cy - CP * 0.2); c.quadraticCurveTo(cx, cy + CP * 0.3, cx + CP * 0.7, cy + CP * 0.15); c.stroke();
      if (hash(seed, 8) < 0.35) {
        c.fillStyle = 'rgba(70,100,50,.25)'; c.beginPath();
        c.ellipse(cx + CP * 0.3, cy + CP * 0.2, CP * 0.5, CP * 0.3, 0.4, 0, 7); c.fill();
      }
    }
  }

  function roomAt(w, x, y) {
    var i, r, u, v;
    for (i = 0; i < w.rooms.length; i++) {
      r = w.rooms[i]; u = (x - r.x) / (r.rx || 3); v = (y - r.y) / (r.ry || 2);
      if (u * u + v * v <= 1.08) return r;
    }
    return null;
  }

  // Smooth burrows: thick round-capped strokes along the tunnel centre-line,
  // plus a smooth ellipse for each chamber (no per-cell scallops).
  function punchTunnels(w, x0, y0, x1, y1) {
    var half = CP * 0.56, x, y, i, r, cx, cy, rx, ry, n;
    function inRoom(x, y) { return !!roomAt(w, x, y); }
    function strokeLinks(width, color, mode) {
      // mode: 'shaft' = neither end in a room; 'door' = exactly one end in a room
      c.strokeStyle = color; c.lineWidth = width * 2; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      for (y = y0 - 1; y < y1 + 1; y++) for (x = x0 - 1; x < x1 + 1; x++) {
        if (!isAir(w, x, y)) continue;
        cx = x * CP + CP / 2; cy = y * CP + CP / 2;
        var a = inRoom(x, y), b, ok;
        if (isAir(w, x + 1, y)) {
          b = inRoom(x + 1, y); ok = mode === 'door' ? (a !== b) : (!a && !b);
          if (ok) { c.moveTo(cx, cy); c.lineTo((x + 1) * CP + CP / 2, cy); }
        }
        if (isAir(w, x, y + 1)) {
          b = inRoom(x, y + 1); ok = mode === 'door' ? (a !== b) : (!a && !b);
          if (ok) { c.moveTo(cx, cy); c.lineTo(cx, (y + 1) * CP + CP / 2); }
        }
        n = (isAir(w, x + 1, y) ? 1 : 0) + (isAir(w, x - 1, y) ? 1 : 0) + (isAir(w, x, y + 1) ? 1 : 0) + (isAir(w, x, y - 1) ? 1 : 0);
        if (mode === 'shaft' && n === 0 && !a) { c.moveTo(cx, cy); c.lineTo(cx, cy); }
      }
      c.stroke();
    }
    strokeLinks(half + 1.7, 'rgba(214,170,118,.88)', 'shaft');
    strokeLinks(half, '#2a1c12', 'shaft');
    for (i = 0; i < w.rooms.length; i++) {
      r = w.rooms[i];
      cx = r.x * CP + CP / 2; cy = r.y * CP + CP / 2;
      rx = (r.rx + 0.48) * CP; ry = (r.ry + 0.42) * CP;
      if (cx + rx < x0 * CP - 4 || cx - rx > x1 * CP + 4 || cy + ry < y0 * CP - 4 || cy - ry > y1 * CP + 4) continue;
      c.beginPath(); c.ellipse(cx, cy, rx + 1.7, ry + 1.7, 0, 0, 7);
      c.strokeStyle = 'rgba(214,170,118,.88)'; c.lineWidth = 2.6; c.stroke();
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 7); c.fillStyle = '#2a1c12'; c.fill();
      c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 7); c.clip();
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(cx, cy - ry * 0.5, rx * 0.95, ry * 0.55, 0, 0, 7); c.fill();
      c.restore();
    }
    strokeLinks(half, '#2a1c12', 'door');
  }

  function paintFloors(w, x0, y0, x1, y1) {
    var i, r, col, cx, cy, rx, ry, g;
    for (i = 0; i < w.rooms.length; i++) {
      r = w.rooms[i]; col = FLOOR[r.kind] || FLOOR.side;
      cx = r.x * CP + CP / 2; cy = r.y * CP + CP / 2;
      rx = (r.rx + 0.48) * CP; ry = (r.ry + 0.42) * CP;
      if (cx + rx < x0 * CP - 4 || cx - rx > x1 * CP + 4 || cy + ry < y0 * CP - 4 || cy - ry > y1 * CP + 4) continue;
      c.save();
      c.beginPath(); c.ellipse(cx, cy, rx - 0.6, ry - 0.6, 0, 0, 7); c.clip();
      c.fillStyle = rgba(col[0], col[1], col[2], 0.16);
      c.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      g = c.createLinearGradient(0, cy, 0, cy + ry);
      g.addColorStop(0, rgba(col[0], col[1], col[2], 0));
      g.addColorStop(0.35, rgba(col[0], col[1], col[2], 0.15));
      g.addColorStop(1, rgba(col[0], col[1], col[2], 0.7));
      c.fillStyle = g; c.fillRect(cx - rx, cy, rx * 2, ry + 2);
      if (r.kind === 'brood') {
        c.fillStyle = 'rgba(230,210,170,.28)';
        c.fillRect(cx - rx * 0.5, cy + ry * 0.45, rx, 2);
      }
      c.restore();
    }
  }

  function paintRegion(w, x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(S - 1, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
    if (x0 >= x1 || y0 >= y1) return;
    c.save();
    c.beginPath(); c.rect(x0 * CP, y0 * CP, (x1 - x0) * CP, (y1 - y0) * CP); c.clip();
    c.clearRect(x0 * CP, y0 * CP, (x1 - x0) * CP, (y1 - y0) * CP);
    var x, y, i;
    for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) {
      if (y < S) continue;
      i = y * W + x;
      if (w.g[i] !== 0) paintSoil(w, i, x, y, x * CP, y * CP);
    }
    paintBoulders(w, x0, y0, x1, y1);
    punchTunnels(w, x0, y0, x1, y1);
    paintFloors(w, x0, y0, x1, y1);
    c.restore();
  }

  AF.soilCache = function (w) {
    var i, x0, y0, x1, y1, j, x, y;
    if (w.full) { c.clearRect(0, 0, cv.width, cv.height); paintRegion(w, 0, 0, W, H); w.full = false; w.dirty.length = 0; }
    else if (w.dirty.length) {
      x0 = W; y0 = H; x1 = 0; y1 = 0;
      for (j = 0; j < w.dirty.length; j++) {
        i = w.dirty[j]; x = i % W; y = i / W | 0;
        if (x < x0) x0 = x; if (x >= x1) x1 = x + 1;
        if (y < y0) y0 = y; if (y >= y1) y1 = y + 1;
      }
      paintRegion(w, x0 - 2, y0 - 2, x1 + 2, y1 + 2);
      w.dirty.length = 0;
    }
    return cv;
  };
})();
