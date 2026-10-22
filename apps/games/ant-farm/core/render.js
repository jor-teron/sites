// Rendering: sky, soil (cached offscreen), mounds, food, trails, brood, ants, glass.
(function () {
  var W = AF.W, H = AF.H, S = AF.SURF, CP = 4, soil = document.createElement('canvas'), sc = soil.getContext('2d');
  soil.width = W * CP; soil.height = H * CP;
  var cols = [[156, 112, 70], [128, 86, 50], [104, 68, 40], [84, 56, 36], [70, 48, 34]];
  function cellCol(w, i) {
    var x = i % W, y = i / W | 0, g = w.g[i];
    if (y < S) return null;
    if (g === 0) return 'rgb(42,28,18)';
    var t = w.tone[i], e = 0.82 + t * 0.3;
    if (g === 2) { var v = 110 + t * 40 | 0; return 'rgb(' + v + ',' + v + ',' + (v + 8) + ')'; }
    var L = Math.max(0, Math.min(4, ((y - S + w.layer[x]) / 18) | 0)), c = cols[L], k = e * (1 - w.wet[i] * 0.35);
    return 'rgb(' + (c[0] * k | 0) + ',' + (c[1] * k | 0) + ',' + (c[2] * k | 0) + ')';
  }
  function paint(w, i) { var c = cellCol(w, i); if (!c) return; sc.fillStyle = c; sc.fillRect((i % W) * CP, (i / W | 0) * CP, CP, CP); }
  AF.render = function (cv, w, opt) {
    var c = cv.getContext('2d'), cw = cv.width, ch = cv.height, top = opt.top, bot = opt.bot;
    if (w.full) { sc.clearRect(0, 0, soil.width, soil.height); for (var i = S * W; i < W * H; i++) paint(w, i); w.full = false; w.dirty.length = 0; }
    else { for (var j = 0; j < w.dirty.length; j++) paint(w, w.dirty[j]); w.dirty.length = 0; }
    var k = Math.min(cw / (W + 2), (ch - top - bot) / (H + 2)), ox = (cw - W * k) / 2, oy = top + (ch - top - bot - H * k) / 2;
    AF.view = { k: k, ox: ox, oy: oy };
    c.fillStyle = '#1a130c'; c.fillRect(0, 0, cw, ch);
    var sky = c.createLinearGradient(0, oy, 0, oy + S * k); sky.addColorStop(0, '#7fb8e6'); sky.addColorStop(1, '#cfe7f5');
    c.fillStyle = sky; c.fillRect(ox, oy, W * k, S * k);
    c.imageSmoothingEnabled = false; c.drawImage(soil, ox, oy, W * k, H * k);
    // mounds
    c.fillStyle = '#a87a4a'; c.beginPath(); c.moveTo(ox, oy + S * k);
    for (var x = 0; x < W; x++) { var m = (w.mound[Math.max(0, x - 1)] + w.mound[x] * 2 + w.mound[Math.min(W - 1, x + 1)]) / 4; c.lineTo(ox + (x + .5) * k, oy + (S - m) * k); }
    c.lineTo(ox + W * k, oy + S * k); c.fill();
    // grass
    c.strokeStyle = '#4f9a3a'; c.lineWidth = Math.max(1, k * 0.25); c.beginPath();
    for (x = 0; x < W; x++) { if (w.g[S * W + x] === 0) continue; for (var b = 0; b < 2; b++) { var gx = ox + (x + b * .5 + .2) * k, sway = Math.sin(w.t * 1.5 + x) * k * 0.2;
      c.moveTo(gx, oy + S * k); c.lineTo(gx + sway, oy + (S - 0.7 - w.tone[S * W + x] * 0.8) * k); } }
    c.stroke(); c.fillStyle = '#5aa843'; c.fillRect(ox, oy + S * k, W * k, k * 0.35);
    // trails
    if (opt.trails) { c.fillStyle = 'rgba(255,220,90,1)';
      for (i = (S - 1) * W; i < W * H; i++) { var p = w.ph[i]; if (p > 0.03) { c.globalAlpha = Math.min(0.45, p * 0.5); c.fillRect(ox + (i % W) * k, oy + (i / W | 0) * k, k, k); } }
      c.globalAlpha = 1; }
    // stored food in store chamber
    c.fillStyle = '#8fd14f'; var n = Math.min(45, w.stored | 0);
    for (i = 0; i < n; i++) { var fx = w.sx - 4 + (i % 9), fy = w.sy + 1.6 - (i / 9 | 0) * 0.35; c.fillRect(ox + (fx + (i * 7 % 3) * .2) * k, oy + fy * k, k * .5, k * .4); }
    // surface food piles
    for (i = 0; i < w.food.length; i++) { var f = w.food[i], r = Math.sqrt(f.amt) * 0.35 + 0.6;
      c.fillStyle = '#7cc246'; c.beginPath(); c.ellipse(ox + (f.x + .5) * k, oy + (S - 0.2) * k, r * k, r * 0.6 * k, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#e45'; c.beginPath(); c.arc(ox + (f.x + .3) * k, oy + (S - r * .4) * k, k * .35, 0, 7); c.fill(); }
    // brood
    for (i = 0; i < w.brood.length; i++) { var bd = w.brood[i]; c.fillStyle = bd.stage === 'egg' ? '#fffbea' : '#f1dfae';
      c.beginPath(); c.ellipse(ox + bd.x * k, oy + bd.y * k, (bd.stage === 'egg' ? .3 : .55) * k, (bd.stage === 'egg' ? .2 : .3) * k, 0.3, 0, 7); c.fill(); }
    // queen
    AF.drawAnt(c, ox + (w.qx + .5) * k, oy + (w.qy + .6) * k, Math.sin(w.t * .3) * 0.2, k * 1.3, w.t * 4, '#6b1f12', 0, false);
    // ants
    var ac = ['#1b0d07', '#2a130a'];
    for (i = 0; i < w.ants.length; i++) { var a = w.ants[i], ax = a.cx + (a.nx - a.cx) * a.p + .5, ay = a.cy + (a.ny - a.cy) * a.p + .5;
      AF.drawAnt(c, ox + ax * k, oy + ay * k, a.ang, k * 0.55, a.ph, ac[i & 1], a.load, a.nx !== a.cx || a.ny !== a.cy || a.dig > 0); }
    // water drops + splash
    c.fillStyle = '#5ab4ff'; for (i = 0; i < w.drops.length; i++) { c.beginPath(); c.arc(ox + w.drops[i].x * k, oy + w.drops[i].y * k, k * .6, 0, 7); c.fill(); }
    // glass frame
    c.strokeStyle = '#c9b48a'; c.lineWidth = Math.max(3, k * .8); c.strokeRect(ox - c.lineWidth / 2, oy - c.lineWidth / 2, W * k + c.lineWidth, H * k + c.lineWidth);
    var gl = c.createLinearGradient(ox, oy, ox + W * k, oy + H * k); gl.addColorStop(0, 'rgba(255,255,255,.10)'); gl.addColorStop(.3, 'rgba(255,255,255,0)'); gl.addColorStop(.55, 'rgba(255,255,255,.05)'); gl.addColorStop(.6, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(ox, oy, W * k, H * k);
  };
})();
