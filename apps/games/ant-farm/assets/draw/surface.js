// AFV1 surface: day/night sky, drifting clouds, mounds, grass, food piles.
(function () {
  var W = AF.W, S = AF.SURF;
  // Sky keys over one colony day (AF.DAY sim seconds): [top, horizon].
  var KEYS = [[[18, 24, 54], [52, 50, 86]], [[110, 160, 220], [240, 190, 150]], [[110, 175, 230], [205, 232, 246]],
              [[110, 175, 230], [205, 232, 246]], [[80, 90, 160], [245, 150, 100]], [[18, 24, 54], [52, 50, 86]]];
  function mix(a, b, t) { return 'rgb(' + (a[0] + (b[0] - a[0]) * t | 0) + ',' + (a[1] + (b[1] - a[1]) * t | 0) + ',' + (a[2] + (b[2] - a[2]) * t | 0) + ')'; }
  // 0..1 position in the day; starts mid-morning so a new colony opens in daylight.
  AF.dayPhase = function (w) { return ((w.t / (AF.DAY || 60)) + 0.3) % 1; };

  // One puffy cloud sprite, drawn once and reused for every cloud.
  var cloud = document.createElement('canvas'); cloud.width = 120; cloud.height = 50;
  (function () { var g = cloud.getContext('2d'); g.fillStyle = 'rgba(255,255,255,.85)';
    [[30, 32, 18], [55, 22, 22], [82, 30, 18], [60, 36, 16]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], p[2], 0, 7); g.fill(); }); })();
  var CL = [[0.1, 2.5, 1, 1.0], [0.45, 4.5, 0.7, 1.6], [0.75, 1.8, 0.85, 1.25]];  // x, y(cells), scale, speed

  AF.drawSky = function (c, w, ox, oy, k) {
    var p = AF.dayPhase(w) * 5, i = p | 0, t = p - i, a = KEYS[i], b = KEYS[i + 1];
    var g = c.createLinearGradient(0, oy, 0, oy + S * k); g.addColorStop(0, mix(a[0], b[0], t)); g.addColorStop(1, mix(a[1], b[1], t));
    c.fillStyle = g; c.fillRect(ox, oy, W * k, S * k);
    var night = Math.max(0, Math.abs(AF.dayPhase(w) - 0.5) * 4 - 1.2);   // 0 by day, ~0.8 deep night
    c.save(); c.beginPath(); c.rect(ox, oy, W * k, S * k); c.clip();
    if (night > 0) { c.fillStyle = 'rgba(255,255,230,' + Math.min(1, night) + ')';
      for (var s = 0; s < 24; s++) c.fillRect(ox + ((s * 97) % W) * k, oy + ((s * 53) % (S - 4)) * k, Math.max(1, k * .2), Math.max(1, k * .2)); }
    c.globalAlpha = 1 - Math.min(0.7, night);
    for (var j = 0; j < CL.length; j++) { var q = CL[j], cw = 18 * q[2] * k, span = W * k + cw;
      var cx = ox - cw + ((q[0] * span + w.t * q[3] * k * 0.4) % span);
      c.drawImage(cloud, cx, oy + q[1] * k, cw, cw * 0.42); }
    c.restore(); c.globalAlpha = 1;
  };

  AF.drawSurface = function (c, w, ox, oy, k) {
    var x, base = oy + S * k;
    // mounds of excavated dirt, with a darker crest line
    c.fillStyle = '#a87a4a'; c.beginPath(); c.moveTo(ox, base);
    for (x = 0; x < W; x++) { var m = (w.mound[Math.max(0, x - 1)] + w.mound[x] * 2 + w.mound[Math.min(W - 1, x + 1)]) / 4; c.lineTo(ox + (x + .5) * k, base - m * k); }
    c.lineTo(ox + W * k, base); c.fill();
    c.fillStyle = '#4c8f35'; c.fillRect(ox, base, W * k, k * 0.4);
    // grass: 3 blades per cell in two shades, varied height and sway (batched into 2 strokes)
    c.lineWidth = Math.max(1, k * 0.28); c.lineCap = 'round';
    for (var shade = 0; shade < 2; shade++) {
      c.strokeStyle = shade ? '#6cbc4a' : '#3f8a2e'; c.beginPath();
      for (x = 0; x < W; x++) { var i = S * W + x; if (w.g[i] === 0 || w.mound[x] > 1.5) continue;
        for (var b = shade; b < 3; b += 2) { var tn = w.tone[i] * 7 + b, gx = ox + (x + b * .33 + .1) * k, hgt = (0.8 + (tn * 1.7 % 1.4)) * k;
          var sway = Math.sin(w.t * 1.5 + x * 0.7 + b) * k * 0.3;
          c.moveTo(gx, base + k * .2); c.quadraticCurveTo(gx + sway * .3, base - hgt * .5, gx + sway, base - hgt); } }
      c.stroke();
    }
    // food piles: a green leaf with a vein + a red berry with a shine
    for (var f = 0; f < w.food.length; f++) { var fd = w.food[f], r = Math.sqrt(fd.amt) * 0.35 + 0.6, fx = ox + (fd.x + .5) * k, fy = base - k * .1;
      c.fillStyle = '#5fae3a'; c.beginPath(); c.moveTo(fx - r * k, fy); c.quadraticCurveTo(fx, fy - r * 1.1 * k, fx + r * k, fy); c.quadraticCurveTo(fx, fy + r * .25 * k, fx - r * k, fy); c.fill();
      c.strokeStyle = '#3e7d24'; c.lineWidth = Math.max(1, k * .12); c.beginPath(); c.moveTo(fx - r * .9 * k, fy); c.lineTo(fx + r * .9 * k, fy - r * .25 * k); c.stroke();
      var bx = fx - r * .25 * k, by = fy - r * .45 * k, br = k * (.35 + Math.min(.3, r * .08));
      c.fillStyle = '#d63a3a'; c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(bx - br * .35, by - br * .35, br * .3, 0, 7); c.fill();
      c.fillStyle = '#e8a33a'; c.beginPath(); c.arc(fx + r * .4 * k, fy - r * .3 * k, br * .8, 0, 7); c.fill(); }
  };
})();
