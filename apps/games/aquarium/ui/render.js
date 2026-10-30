// Aquarium AQQ1a (scene from AQ1b): canvas layout and drawing - water, sand, rocks, plants, light rays, fish, food, bubbles, clean sweep, surface.
(function () {
  'use strict';
  var A = window.AQ, S = A.st, C = A.core, cv = document.getElementById('c'), cx = cv.getContext('2d');
  var W = 0, H = 0, dpr = 1, U = 1, floorY = 0, t = 0, maxDpr = 2, bg, fg, plants = [], rays = [], scratch = document.createElement('canvas');
  var rng = C.rng, clamp = C.clamp, sandTop = C.sandTop;

  // ---- static layers (rebuilt on resize) ----
  function layer(fn) { var c = document.createElement('canvas'); c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr); var g = c.getContext('2d'); g.scale(dpr, dpr); fn(g); return c; }
  function rock(g, x, y, w, h, seed, shade) {
    var r = rng(seed), n = 9, p = [], i;
    for (i = 0; i < n; i++) { var a = i / n * 6.283; p.push([x + Math.cos(a) * w * (.8 + r() * .3), y - h / 2 + Math.sin(a) * h * (.5 + r() * .12)]); }
    g.beginPath(); g.moveTo((p[0][0] + p[n - 1][0]) / 2, (p[0][1] + p[n - 1][1]) / 2);
    for (i = 0; i < n; i++) { var q = p[(i + 1) % n]; g.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + q[0]) / 2, (p[i][1] + q[1]) / 2); }
    var gr = g.createLinearGradient(0, y - h, 0, y); gr.addColorStop(0, 'hsl(35,8%,' + (58 * shade) + '%)'); gr.addColorStop(1, 'hsl(30,10%,' + (26 * shade) + '%)');
    g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(70,130,60,.45)'; for (i = 0; i < 4; i++) { g.beginPath(); g.ellipse(x + (r() - .5) * w, y - h * (.7 + r() * .2), 5 + r() * 8, 2 + r() * 3, 0, 0, 6.3); g.fill(); }
  }
  function build() {
    var r = rng(11), i;
    bg = layer(function (g) {
      var w = g.createLinearGradient(0, 0, 0, H); w.addColorStop(0, '#46c8da'); w.addColorStop(.3, '#1d8db5'); w.addColorStop(.7, '#0f4d7e'); w.addColorStop(1, '#0a2f57');
      g.fillStyle = w; g.fillRect(0, 0, W, H);
      for (i = 0; i < 5; i++) rock(g, (i + .3 + r() * .4) / 5 * W, sandTop(W * i / 5) + 4 * U, (50 + r() * 50) * U, (50 + r() * 40) * U, 100 + i, .6);   // distant rocks, dimmed
      g.fillStyle = 'rgba(15,77,126,.35)'; g.fillRect(0, 0, W, H);
      g.beginPath(); g.moveTo(0, H); for (var x = 0; x <= W + 8; x += 8) g.lineTo(x, sandTop(x)); g.lineTo(W, H); g.closePath();
      var s = g.createLinearGradient(0, floorY - 8 * U, 0, H); s.addColorStop(0, '#e9d69c'); s.addColorStop(1, '#b4955a'); g.fillStyle = s; g.fill();
      for (i = 0; i < W * (H - floorY) / 260; i++) { g.fillStyle = r() < .5 ? 'rgba(255,248,210,.35)' : 'rgba(110,80,40,.3)'; g.fillRect(r() * W, floorY + r() * (H - floorY), 1.5, 1.5); }
    });
    fg = layer(function (g) {
      rock(g, W * .09, sandTop(W * .09) + 14 * U, 70 * U, 62 * U, 21, .95); rock(g, W * .86, sandTop(W * .86) + 16 * U, 84 * U, 74 * U, 22, 1); rock(g, W * .6, sandTop(W * .6) + 20 * U, 40 * U, 28 * U, 23, .9);
      for (var i = 0; i < 14; i++) { g.fillStyle = 'hsl(30,8%,' + (40 + r() * 25) + '%)'; g.beginPath(); g.ellipse(r() * W, H - r() * (H - floorY) * .6, 3 + r() * 4, 2 + r() * 2, 0, 0, 6.3); g.fill(); }
      var v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .45, W / 2, H / 2, Math.max(W, H) * .8); v.addColorStop(0, 'rgba(0,10,30,0)'); v.addColorStop(1, 'rgba(0,10,30,.45)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    });
    plants = []; var n = clamp(Math.round(W / 70), 6, 22);
    for (i = 0; i < n; i++) {
      var px = (i + .2 + r() * .6) / n * W, near = i % 6 === 3, bl = [];
      for (var k = 0, m = 2 + (r() * 3 | 0); k < m; k++) bl.push({ dx: (k - m / 2) * 7 * U + r() * 4, h: (.14 + r() * .26) * H * (near ? .6 : 1), ph: r() * 6.3, sp: .8 + r() * .7, col: 'hsl(' + (105 + r() * 45) + ',55%,' + (26 + r() * 14) + '%)' });
      plants.push({ x: px, near: near, bl: bl });
    }
    rays = []; for (i = 0, n = clamp(W / 150 | 0, 4, 9); i < n; i++) rays.push({ x: r() * W * 1.1 - W * .05, w: (20 + r() * 50) * U, sl: (.15 + r() * .3) * (r() < .5 ? -1 : 1) * H, sp: .4 + r() * .8, ph: r() * 6.3 });
    var bubbles = S.bubbles; bubbles.length = 0; for (i = 0; i < 28; i++) { bubbles.push({}); C.respawn(bubbles[i], true); }
  }

  // ---- layout ----
  function layout() {
    var oW = W, oH = H; W = S.W = innerWidth; H = S.H = innerHeight; dpr = S.dpr = Math.min(window.devicePixelRatio || 1, maxDpr); U = S.U = clamp(Math.min(W, H * 1.4) / 800, .8, 1.4);
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr); floorY = S.floorY = H * .87; build();
    C.resize(oW, oH);
  }

  // ---- drawing ----
  function plant(p) {
    p.bl.forEach(function (b) {
      cx.strokeStyle = b.col; cx.lineWidth = 5 * U; cx.lineCap = 'round'; cx.beginPath();
      for (var i = 0; i <= 8; i++) { var q = i / 8, sw = Math.sin(t * b.sp + b.ph + q * 2.2) * 16 * U * Math.pow(q, 1.4); cx[i ? 'lineTo' : 'moveTo'](p.x + b.dx + sw, sandTop(p.x) + 3 - q * b.h); }
      cx.stroke();
    });
  }
  function drawFish(f) {   // hungry / unhappy fish are drawn paler and a little see-through
    var p = clamp((.8 - f.mood) / .6, 0, 1);
    if (p < .04) { A.render(cx, f.sp, f.L, f.ph); return; }
    var sw = f.L * 2.4, sh = Math.max(sw, f.hh * 3.8), g = scratch.getContext('2d');
    scratch.width = Math.ceil(sw * dpr); scratch.height = Math.ceil(sh * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.translate(sw / 2, sh / 2);
    A.render(g, f.sp, f.L, f.ph); g.globalCompositeOperation = 'source-atop'; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(150,180,196,' + .6 * p + ')'; g.fillRect(0, 0, scratch.width, scratch.height);
    cx.globalAlpha = 1 - .3 * p; cx.drawImage(scratch, -sw / 2, -sh / 2, sw, sh); cx.globalAlpha = 1;
  }
  function draw() {
    var sel = S.sel, wq = S.wq, cleanT = S.cleanT, fish = S.fish; t = S.t;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.drawImage(bg, 0, 0); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.globalCompositeOperation = 'lighter';
    rays.forEach(function (r) {
      var a = .07 + .06 * Math.sin(t * r.sp + r.ph), g = cx.createLinearGradient(0, 0, 0, H * .85); g.addColorStop(0, 'rgba(200,255,255,' + a + ')'); g.addColorStop(1, 'rgba(200,255,255,0)');
      var w = r.w * (1 + .25 * Math.sin(t * r.sp * .7 + r.ph)); cx.fillStyle = g; cx.beginPath(); cx.moveTo(r.x - w, 0); cx.lineTo(r.x + w, 0); cx.lineTo(r.x + r.sl + w * 2.2, H * .85); cx.lineTo(r.x + r.sl - w * 2.2, H * .85); cx.fill();
    });
    cx.globalCompositeOperation = 'source-over';
    plants.forEach(function (p) { if (!p.near) plant(p); });
    fish.forEach(function (f) {
      cx.save(); cx.translate(f.x, f.y); cx.rotate(f.pitch * f.face); cx.scale(f.face, 1); drawFish(f); cx.restore();
    });
    if (sel) {
      cx.save(); cx.strokeStyle = 'rgba(255,255,255,' + (.6 + .3 * Math.sin(t * 5)) + ')'; cx.lineWidth = 2; cx.setLineDash([6, 5]); cx.lineDashOffset = -t * 20;
      cx.beginPath(); cx.ellipse(sel.x, sel.y, sel.L * .6 + 8, Math.max(sel.hh * .75, sel.L * .3) + 8, 0, 0, 6.3); cx.stroke(); cx.restore();
    }
    plants.forEach(function (p) { if (p.near) plant(p); });
    S.food.forEach(function (p) { cx.fillStyle = p.c; cx.globalAlpha = p.rest ? Math.max(.3, 1 - p.rest / 22) : 1; cx.beginPath(); cx.ellipse(p.x, p.y, 3.2 * U, 2 * U, p.ph + t * (p.rest ? 0 : 1.5), 0, 6.3); cx.fill(); }); cx.globalAlpha = 1;
    cx.fillStyle = 'rgba(255,255,255,.18)'; cx.strokeStyle = 'rgba(255,255,255,.5)'; cx.lineWidth = 1;
    S.puffs.forEach(function (b) { cx.globalAlpha = Math.min(1, b.life); cx.beginPath(); cx.arc(b.x + Math.sin(b.ph + t * 6) * 4 * U, b.y, b.r, 0, 6.3); cx.fill(); cx.stroke(); }); cx.globalAlpha = 1;
    S.bubbles.forEach(function (b) { var x = b.x + Math.sin(b.ph) * b.wob; cx.beginPath(); cx.arc(x, b.y, b.r, 0, 6.3); cx.fill(); cx.stroke(); cx.fillStyle = 'rgba(255,255,255,.7)'; cx.fillRect(x - b.r * .4, b.y - b.r * .5, Math.max(1, b.r * .3), Math.max(1, b.r * .3)); cx.fillStyle = 'rgba(255,255,255,.18)'; });
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.drawImage(fg, 0, 0); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (wq < 55) { cx.fillStyle = 'rgba(70,115,25,' + (55 - wq) / 55 * .5 + ')'; cx.fillRect(0, 0, W, H); }   // murky green when the water is poor
    if (cleanT > 0) { var sx = -120 * U + (W + 240 * U) * (1 - cleanT / 2.4), sg = cx.createLinearGradient(sx - 110 * U, 0, sx + 110 * U, 0); sg.addColorStop(0, 'rgba(220,255,255,0)'); sg.addColorStop(.7, 'rgba(220,255,255,.32)'); sg.addColorStop(1, 'rgba(220,255,255,0)'); cx.fillStyle = sg; cx.fillRect(sx - 110 * U, 0, 220 * U, H); }
    S.ripples.forEach(function (r) { cx.strokeStyle = 'rgba(255,255,255,' + (1 - r.t) * .7 + ')'; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(r.x, 9, 6 + r.t * 30 * U, 2 + r.t * 5 * U, 0, 0, 6.3); cx.stroke(); });
    cx.fillStyle = 'rgba(225,255,255,.28)'; cx.beginPath(); cx.moveTo(0, 0);
    for (var x = 0; x <= W + 12; x += 12) cx.lineTo(x, 8 + Math.sin(x * .03 + t * 1.4) * 2.5 + Math.sin(x * .011 - t * .8) * 2); cx.lineTo(W, 0); cx.fill();
  }
  A.view = { cv: cv, layout: layout, draw: draw, maxDpr: function (v) { if (v !== undefined) maxDpr = v; return maxDpr; } };
})();
