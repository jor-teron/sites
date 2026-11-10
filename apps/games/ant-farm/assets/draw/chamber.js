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
    for (var i = 0; i < w.brood.length; i++) {
      var b = w.brood[i], bx = ox + b.x * k, by = oy + b.y * k, wr, seg, j;
      if (b.stage === 'pupa') {   // silk cocoon, slightly translucent, anchored to the floor
        c.fillStyle = 'rgba(236,214,160,.95)'; c.beginPath(); c.ellipse(bx, by, .7 * k, .36 * k, 0.12, 0, 7); c.fill();
        c.strokeStyle = 'rgba(200,170,110,.55)'; c.lineWidth = Math.max(.6, k * .07); c.beginPath();
        c.ellipse(bx, by, .55 * k, .26 * k, 0.12, 0, 7); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(bx - .18 * k, by - .12 * k, .22 * k, .1 * k, -0.3, 0, 7); c.fill();
        c.fillStyle = 'rgba(120,80,30,.4)'; c.beginPath(); c.arc(bx + .52 * k, by + .04 * k, .12 * k, 0, 7); c.fill();
        continue;
      }
      if (b.stage === 'egg') {
        c.fillStyle = '#fffdf4'; c.beginPath(); c.ellipse(bx, by, .34 * k, .22 * k, 0.5, 0, 7); c.fill();
        c.strokeStyle = 'rgba(210,190,150,.5)'; c.lineWidth = Math.max(.5, k * .05); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(bx - .08 * k, by - .06 * k, .1 * k, .07 * k, 0.5, 0, 7); c.fill();
        continue;
      }
      // wriggling larva
      wr = Math.sin(w.t * 6 + i * 1.7) * 0.14;
      c.fillStyle = '#f3e2b0'; c.beginPath();
      c.ellipse(bx, by, .62 * k, (.28 + wr * 0.08) * k, 0.15 + wr, 0, 7); c.fill();
      c.strokeStyle = 'rgba(160,120,60,.55)'; c.lineWidth = Math.max(.5, k * .06); c.beginPath();
      for (j = -1; j <= 1; j++) { seg = bx + j * 0.2 * k; c.moveTo(seg, by - .2 * k); c.quadraticCurveTo(seg + wr * 0.15 * k, by, seg, by + .2 * k); }
      c.stroke();
      c.fillStyle = 'rgba(80,50,20,.45)'; c.beginPath(); c.arc(bx + .45 * k, by - .02 * k, .07 * k, 0, 7); c.fill(); }
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

  // AF-4d: a few props so barracks, pantry and the warm chamber read clearly.
  AF.drawSpecialRooms = function (c, w, ox, oy, k) {
    var i, r, x, y, j;
    for (i = 0; i < w.rooms.length; i++) {
      r = w.rooms[i];
      x = ox + r.x * k; y = oy + (r.y + r.ry * 0.45) * k;
      if (r.kind === 'barracks') {
        c.strokeStyle = 'rgba(180,90,50,.55)'; c.lineWidth = Math.max(1, k * 0.1);
        for (j = -2; j <= 2; j++) { c.beginPath(); c.moveTo(x + j * 0.7 * k, y - 0.15 * k); c.lineTo(x + j * 0.7 * k + 0.15 * k, y + 0.35 * k); c.stroke(); }
      } else if (r.kind === 'pantry') {
        for (j = 0; j < 6; j++) {
          c.fillStyle = j % 2 ? '#e0b24a' : '#8fbf4a';
          c.beginPath(); c.ellipse(x + (j - 2.5) * 0.45 * k, y, k * 0.22, k * 0.16, j, 0, 7); c.fill();
        }
      } else if (r.kind === 'warmth') {
        var R = 5 * k * (1 + Math.sin(w.t * 1.4) * 0.08);
        c.fillStyle = 'rgba(255,150,50,.14)'; c.beginPath(); c.ellipse(x, y - 0.2 * k, R, R * 0.55, 0, 0, 7); c.fill();
      }
    }
  };
})();
