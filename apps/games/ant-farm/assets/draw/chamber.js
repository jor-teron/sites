// AFV1 chambers: warm glow behind the brood and a natural food pile in the store.
// AF3: glow in the queen room and the brood room; eggs, larvae and pupae (cocoons).
(function () {
  // Pre-rendered radial glow sprite (no per-frame shadowBlur).
  var glow = document.createElement('canvas'); glow.width = glow.height = 64;
  (function () { var g = glow.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,190,90,.45)'); r.addColorStop(0.5, 'rgba(255,150,60,.18)'); r.addColorStop(1, 'rgba(255,140,50,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); })();
  var FOOD = ['#8fd14f', '#6fb83c', '#c9e06a', '#d9534f', '#e8a33a'];

  AF.drawBrood = function (c, w, ox, oy, k) {
    var pulse = 1 + Math.sin(w.t * 1.2) * 0.06, R = 8 * k * pulse;
    c.drawImage(glow, ox + (w.qx + .5) * k - R, oy + (w.qy + 1.2) * k - R * .6, R * 2, R * 1.2);
    if (w.bx !== undefined) c.drawImage(glow, ox + (w.bx + .5) * k - R, oy + (w.by + .8) * k - R * .5, R * 2, R);
    for (var i = 0; i < w.brood.length; i++) { var b = w.brood[i], egg = b.stage === 'egg', bx = ox + b.x * k, by = oy + b.y * k;
      if (b.stage === 'pupa') { c.fillStyle = '#e9d39a'; c.beginPath(); c.ellipse(bx, by, .62 * k, .32 * k, 0.15, 0, 7); c.fill();   // cocoon
        c.fillStyle = 'rgba(120,80,30,.45)'; c.beginPath(); c.arc(bx + .45 * k, by, .14 * k, 0, 7); c.fill(); continue; }
      c.fillStyle = egg ? '#fffbea' : '#f1dfae'; c.beginPath(); c.ellipse(bx, by, (egg ? .3 : .55) * k, (egg ? .2 : .3) * k, 0.3, 0, 7); c.fill();
      if (!egg) { c.strokeStyle = 'rgba(160,120,60,.5)'; c.lineWidth = Math.max(.5, k * .06); c.beginPath();   // larva segments
        c.moveTo(bx - .15 * k, by - .25 * k); c.lineTo(bx - .1 * k, by + .25 * k); c.moveTo(bx + .15 * k, by - .25 * k); c.lineTo(bx + .2 * k, by + .25 * k); c.stroke(); } }
  };

  // Stored food: bits stacked in a mound shape (wide at the floor, narrow on top).
  AF.drawStore = function (c, w, ox, oy, k) {
    var n = Math.min(60, w.stored | 0), row = 0, inRow = 0, rowLen = 11;
    for (var i = 0; i < n; i++) {
      if (inRow >= rowLen) { row++; inRow = 0; rowLen = Math.max(2, rowLen - 2); }
      var fx = w.sx + (inRow - (rowLen - 1) / 2) * 0.62 + ((i * 37) % 7 - 3) * 0.04, fy = w.sy + 1.7 - row * 0.42;
      c.fillStyle = FOOD[(i * 7) % FOOD.length]; c.beginPath(); c.ellipse(ox + fx * k, oy + fy * k, k * .34, k * .26, i, 0, 7); c.fill();
      inRow++;
    }
  };
})();
