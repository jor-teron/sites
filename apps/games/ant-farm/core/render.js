// Ant Farm renderer (AFV1). Orchestrates the draw modules in assets/draw/:
//   sky + clouds -> cached soil/tunnels -> surface (mounds, grass, food)
//   -> trails -> store pile -> brood glow -> queen + ants -> water -> glass + frame.
// Purely visual: reads the world, never changes simulation state.
// AF3: falling food, and a blue night tint over the farm (AF.nightAmt).
(function () {
  var W = AF.W, H = AF.H;
  AF.render = function (cv, w, opt) {
    var c = cv.getContext('2d'), cw = cv.width, ch = cv.height, top = opt.top, bot = opt.bot, i;
    var soil = AF.soilCache(w);                       // repaints only dirty cells
    var k = Math.min(cw / (W + 4), (ch - top - bot) / (H + 4)), ox = (cw - W * k) / 2, oy = top + (ch - top - bot - H * k) / 2;
    AF.view = { k: k, ox: ox, oy: oy };              // used by ui.js for tap mapping
    c.fillStyle = '#1a130c'; c.fillRect(0, 0, cw, ch);
    AF.drawSky(c, w, ox, oy, k, opt.low);
    c.imageSmoothingEnabled = false; c.drawImage(soil, ox, oy, W * k, H * k); c.imageSmoothingEnabled = true;
    AF.drawSurface(c, w, ox, oy, k);
    // pheromone trails
    if (opt.trails) { c.fillStyle = 'rgb(255,220,90)';
      for (i = (AF.SURF - 1) * W; i < W * H; i++) { var p = w.ph[i]; if (p > 0.03) { c.globalAlpha = Math.min(0.4, p * 0.45); c.fillRect(ox + (i % W) * k, oy + (i / W | 0) * k, k, k); } }
      c.globalAlpha = 1; }
    AF.drawStore(c, w, ox, oy, k);
    AF.drawBrood(c, w, ox, oy, k);
    AF.drawAnt(c, ox + (w.qx + .5) * k, oy + (w.qy + .6) * k, Math.sin(w.t * .3) * 0.2, k * 1.3, w.t * 4, '#6b1f12', 0, false, true);
    var ac = ['#1b0d07', '#2a130a'];
    for (i = 0; i < w.ants.length; i++) { var a = w.ants[i], ax = a.cx + (a.nx - a.cx) * a.p + .5, ay = a.cy + (a.ny - a.cy) * a.p + .5;
      AF.drawAnt(c, ox + ax * k, oy + ay * k, a.ang, k * 0.55, a.ph, ac[i & 1], a.load, a.nx !== a.cx || a.ny !== a.cy || a.dig > 0, false); }
    // water drops with a small shine
    for (i = 0; i < w.drops.length; i++) { var dx = ox + w.drops[i].x * k, dy = oy + w.drops[i].y * k;
      c.fillStyle = '#5ab4ff'; c.beginPath(); c.arc(dx, dy, k * .6, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(dx - k * .2, dy - k * .2, k * .18, 0, 7); c.fill(); }
    for (i = 0; i < w.falls.length; i++) { var f = w.falls[i], fx = ox + (f.x + .5) * k, fy = oy + f.y * k;   // falling food
      c.fillStyle = '#d63a3a'; c.beginPath(); c.arc(fx, fy, k * .5, 0, 7); c.fill();
      c.fillStyle = '#5fae3a'; c.beginPath(); c.ellipse(fx + Math.cos(f.spin) * k * .6, fy - k * .4, k * .5, k * .22, f.spin, 0, 7); c.fill(); }
    var n = AF.nightAmt(w);
    if (n > 0) { c.fillStyle = 'rgba(8,14,40,' + (n * 0.32).toFixed(3) + ')'; c.fillRect(ox, oy, W * k, H * k); }
    AF.drawFrame(c, ox, oy, W * k, H * k, k);
  };
})();
