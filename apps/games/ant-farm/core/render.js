// Ant Farm renderer (AF-4a). Orchestrates the draw modules in assets/draw/:
//   sky + clouds -> cached soil/tunnels -> surface (mounds, grass, food)
//   -> trails -> store pile -> brood glow -> queen + ants -> water -> glass + frame.
// Camera: fill-the-view by default (no letterbox), pinch / wheel zoom, pan.
// Purely visual: reads the world, never changes simulation state.
// AF3: falling food, and a blue night tint over the farm (AF.nightAmt).
(function () {
  var W = AF.W, H = AF.H;
  var phGlow = document.createElement('canvas'); phGlow.width = phGlow.height = 32;
  (function () { var g = phGlow.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,220,110,.7)'); r.addColorStop(0.45, 'rgba(255,200,80,.28)'); r.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32); })();

  AF.resetCam = function (w) {
    AF.cam = { cx: w && w.qx != null ? w.qx : W / 2, cy: w ? (AF.SURF + (w.qy || 40)) * 0.52 : H * 0.4, z: 1 };
  };
  AF.panBy = function (dx, dy) {
    var cam = AF.cam; if (!cam || !cam.k) return;
    cam.cx -= dx / cam.k; cam.cy -= dy / cam.k;
  };
  AF.zoomAt = function (wx, wy, factor) {
    var cam = AF.cam; if (!cam || !cam.kFill) return;
    var z2 = Math.max(cam.kMin / cam.kFill, Math.min(cam.kMax / cam.kFill, cam.z * factor));
    if (z2 === cam.z) return;
    cam.cx = wx - (wx - cam.cx) * (cam.z / z2);
    cam.cy = wy - (wy - cam.cy) * (cam.z / z2);
    cam.z = z2;
  };
  AF.fitCam = function () { if (AF.cam && AF.cam.kFill) { AF.cam.z = AF.cam.kFit / AF.cam.kFill; AF.cam.cx = W / 2; AF.cam.cy = H / 2; } };
  AF.fillCam = function (w) { AF.resetCam(w); };
  // Visual y: surface ants walk on dirt mounds instead of through them.
  AF.antDrawY = function (w, ax, ay) {
    if (ay >= AF.SURF + 0.55) return ay;
    var x = Math.max(0, Math.min(W - 1, ax)), i = x | 0, f = x - i;
    var m = (w.mound[i] || 0) * (1 - f) + (w.mound[Math.min(W - 1, i + 1)] || 0) * f;
    return Math.min(ay, AF.SURF - m);
  };

  AF.viewRect = function (cw, ch, top, bot) {
    if (!AF.cam) AF.resetCam(AF.w);
    var cam = AF.cam, availW = cw, availH = Math.max(20, ch - top - bot);
    var kFit = Math.min(availW / (W + 2), availH / (H + 2));
    var kFill = Math.max(availW / W, availH / (H * 0.98));
    cam.kFit = kFit; cam.kFill = kFill;
    cam.kMin = kFit * 0.85;
    cam.kMax = Math.max(kFill * 4.5, kFit * 6);
    var k = Math.max(cam.kMin, Math.min(cam.kMax, kFill * (cam.z || 1)));
    cam.z = k / kFill; cam.k = k;
    var halfW = availW / k / 2, halfH = availH / k / 2;
    if (halfW >= W / 2) cam.cx = W / 2;
    else cam.cx = Math.max(halfW, Math.min(W - halfW, cam.cx));
    if (halfH >= H / 2) cam.cy = H / 2;
    else cam.cy = Math.max(halfH, Math.min(H - halfH, cam.cy));
    var ox = availW / 2 - cam.cx * k, oy = top + availH / 2 - cam.cy * k;
    AF.view = { k: k, ox: ox, oy: oy, top: top, bot: bot, availW: availW, availH: availH };
    return AF.view;
  };

  AF.render = function (cv, w, opt) {
    var c = cv.getContext('2d'), cw = cv.width, ch = cv.height, top = opt.top, bot = opt.bot, i;
    var light = !!opt.light, soil = AF.soilCache(w);
    var v = AF.viewRect(cw, ch, top, bot), k = v.k, ox = v.ox, oy = v.oy;
    c.fillStyle = light ? '#d9c4a4' : '#1a130c'; c.fillRect(0, 0, cw, ch);
    c.save();
    c.beginPath(); c.rect(0, top, cw, Math.max(0, ch - top - bot)); c.clip();
    AF.drawSky(c, w, ox, oy, k, opt.low);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(soil, ox, oy, W * k, H * k);
    AF.drawSurface(c, w, ox, oy, k);
    // soft glowing pheromone paths (skipped in lowGraphics)
    if (opt.trails) {
      var glowR = Math.max(6, k * 1.35);
      for (i = (AF.SURF - 1) * W; i < W * H; i++) {
        var pv = w.ph[i]; if (pv < 0.04) continue;
        var px = ox + (i % W + .5) * k, py = oy + AF.antDrawY(w, i % W + .5, (i / W | 0) + .5) * k;
        c.globalAlpha = Math.min(0.7, pv * 0.85);
        c.drawImage(phGlow, px - glowR, py - glowR, glowR * 2, glowR * 2);
      }
      c.globalAlpha = 1;
    }
    AF.drawStore(c, w, ox, oy, k);
    AF.drawBrood(c, w, ox, oy, k);
    var lowA = !!opt.low || w.ants.length > 180, qang = Math.sin(w.t * .3) * 0.15;
    AF.drawAnt(c, ox + (w.qx + .5) * k, oy + (w.qy + 1.35) * k, qang, k * 1.45, w.t * 3, '#7a1c10', 0, false, true, 'rest', !!opt.low);
    var ac = ['#1b0d07', '#2a130a'];
    for (i = 0; i < w.ants.length; i++) {
      var a = w.ants[i], ax = a.cx + (a.nx - a.cx) * a.p + .5, ay = AF.antDrawY(w, ax, a.cy + (a.ny - a.cy) * a.p + .5);
      var moving = a.nx !== a.cx || a.ny !== a.cy, act = a.dig > 0 ? 'dig' : (a.load ? 'carry' : (moving ? 'walk' : 'rest'));
      var ang = a.dig > 0 ? Math.atan2(a.dy - a.cy, a.dx - a.cx) : a.ang;
      AF.drawAnt(c, ox + ax * k, oy + ay * k, ang, k * (act === 'dig' ? 0.62 : 0.58), a.ph, ac[i & 1], a.load, moving || a.dig > 0, false, act, lowA);
    }
    // water drops with a small shine
    for (i = 0; i < w.drops.length; i++) { var dx = ox + w.drops[i].x * k, dy = oy + w.drops[i].y * k;
      c.fillStyle = '#5ab4ff'; c.beginPath(); c.arc(dx, dy, k * .6, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(dx - k * .2, dy - k * .2, k * .18, 0, 7); c.fill(); }
    for (i = 0; i < w.falls.length; i++) { var f = w.falls[i], fx = ox + (f.x + .5) * k, fy = oy + f.y * k;   // falling food
      c.fillStyle = '#d63a3a'; c.beginPath(); c.arc(fx, fy, k * .5, 0, 7); c.fill();
      c.fillStyle = '#5fae3a'; c.beginPath(); c.ellipse(fx + Math.cos(f.spin) * k * .6, fy - k * .4, k * .5, k * .22, f.spin, 0, 7); c.fill(); }
    if (w.splash && w.splash.t > 0) {
      var st = w.splash.t / 0.5, sx = ox + (w.splash.x + .5) * k, sy = oy + AF.SURF * k, sr = (1.4 + (1 - st) * 4) * k;
      c.fillStyle = 'rgba(90,170,230,' + (0.35 * st).toFixed(3) + ')';
      c.beginPath(); c.ellipse(sx, sy, sr * 0.9, k * 0.35, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(190,230,255,' + (0.9 * st).toFixed(3) + ')'; c.lineWidth = Math.max(1.5, k * 0.22);
      c.beginPath(); c.arc(sx, sy, sr, Math.PI, 0); c.stroke();
      c.beginPath(); c.arc(sx, sy, sr * 0.55, Math.PI, 0); c.stroke();
      c.fillStyle = 'rgba(210,240,255,' + (0.85 * st).toFixed(3) + ')';
      for (i = 0; i < 8; i++) {
        var sa = (i * 0.85 + w.splash.x) % 3.4 - 1.7, sh = (0.8 + (i % 3) * 0.45) * (1 - st) * k * 2.8;
        c.beginPath(); c.ellipse(sx + sa * k, sy - sh, k * (0.22 + 0.1 * st), k * (0.28 + 0.08 * st), sa * 0.2, 0, 7); c.fill();
      }
    }
    var n = AF.nightAmt(w);
    if (n > 0) { c.fillStyle = 'rgba(8,14,40,' + (n * 0.32).toFixed(3) + ')'; c.fillRect(ox, oy, W * k, H * k); }
    AF.drawFrame(c, ox, oy, W * k, H * k, k, light);
    c.restore();
  };
})();
