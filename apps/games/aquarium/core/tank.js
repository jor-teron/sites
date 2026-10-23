// Aquarium AQ1a: tank scene (water, sand, rocks, plants, bubbles, light rays), boids schooling and tap-to-select.
(function () {
  'use strict';
  var A = window.AQ, SP = A.SPECIES, cv = document.getElementById('c'), cx = cv.getContext('2d');
  var W = 0, H = 0, dpr = 1, maxDpr = 2, U = 1, floorY = 0, bg, fg, fish = [], plants = [], rays = [], bubbles = [], sel = null, t = 0, raf = 0, last = 0, slow = 0, nfr = 0;
  function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
  var rnd = rng(7), clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  function sandTop(x) { return floorY + Math.sin(x * .011) * 5 * U + Math.sin(x * .027 + 1) * 3 * U; }

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
    bubbles = []; for (i = 0; i < 28; i++) { bubbles.push({}); respawn(bubbles[i], true); }
  }
  function respawn(b, init) {
    var src = rnd() < .5; b.x = src ? (rnd() < .5 ? W * .2 : W * .78) + (rnd() - .5) * 10 : rnd() * W; b.y = init ? rnd() * H : sandTop(b.x) - 4;
    b.r = (1.5 + rnd() * 3.5) * U; b.vy = (28 + rnd() * 40) * U * (.6 + b.r / (6 * U)); b.ph = rnd() * 6.3; b.wob = (3 + rnd() * 6) * U;
  }

  // ---- layout ----
  function layout() {
    var oW = W, oH = H; W = innerWidth; H = innerHeight; dpr = Math.min(window.devicePixelRatio || 1, maxDpr); U = clamp(Math.min(W, H * 1.4) / 800, .8, 1.4);
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr); floorY = H * .87; build();
    if (!fish.length) spawn();
    fish.forEach(function (f) { if (oW) { f.x *= W / oW; f.y *= H / oH; } f.L = f.sp.L * U * f.k; f.hh = f.sp.H * f.L; place(f); });
  }
  function bounds(f) { return { x0: f.L * .5 + 6, x1: W - f.L * .5 - 6, y0: 24 * U + f.hh * .5, y1: sandTop(f.x) - f.hh * (f.sp.id === 'pleco' ? .3 : .5) - 5 }; }
  function place(f) { var b = bounds(f); f.x = clamp(f.x, b.x0, b.x1); f.y = clamp(f.y, b.y0, Math.max(b.y0, b.y1)); }
  function spawn() {
    SP.forEach(function (sp) {
      var cx0 = 100 + rnd() * (W - 200), cy0 = H * (.2 + .5 * rnd());
      for (var i = 0; i < sp.n; i++) {
        var a = rnd() * 6.283, f = { sp: sp, k: .9 + rnd() * .2, x: cx0 + Math.cos(a) * 50, y: cy0 + Math.sin(a) * 30, ph: rnd() * 6.3, wa: a, face: 1, pitch: 0, mode: 0, tm: 0, dir: rnd() < .5 ? -1 : 1 };
        f.L = sp.L * U * f.k; f.hh = sp.H * f.L; f.vx = Math.cos(a) * sp.spd * U; f.vy = 0; fish.push(f);
      }
    });
    fish.sort(function (a, b) { return a.sp.z - b.sp.z; });
  }

  // ---- simulation: boids (cohesion, alignment, separation) + walls + wander + preferred depth ----
  function update(dt) {
    t += dt;
    fish.forEach(function (f) {
      var sp = f.sp, u = U, spd = sp.spd * u, b = bounds(f), ax = 0, ay = 0, i, g, dx, dy, d, n = 0, mx = 0, my = 0, vx = 0, vy = 0, gx = 0, gy = 0, gn = 0;
      if (sp.id === 'pleco') {   // cruise the sand, pause now and then
        f.tm -= dt; if (f.tm <= 0) { f.mode = f.mode ? 0 : 1; f.tm = f.mode ? 4 + rnd() * 6 : 2 + rnd() * 4; if (f.mode) f.dir = rnd() < .5 ? -1 : 1; }
        if (f.x < b.x0 + 30) f.dir = 1; else if (f.x > b.x1 - 30) f.dir = -1;
        ax = ((f.mode ? f.dir * spd * .8 : 0) - f.vx) * 1.5; ay = ((sandTop(f.x) - f.hh * .3 - 5 - f.y) * 3 - f.vy) * 2;
      } else {
        var R = sp.R * u;
        for (i = 0; i < fish.length; i++) {
          g = fish[i]; if (g === f) continue; dx = g.x - f.x; dy = g.y - f.y; d = Math.sqrt(dx * dx + dy * dy) + .01;
          if (g.sp === sp) { gx += g.x; gy += g.y; gn++; }
          if (g.sp === sp && d < R) { n++; mx += g.x; my += g.y; vx += g.vx; vy += g.vy; }
          var sr = g.sp === sp ? (f.L + g.L) * .6 : (f.L + g.L) * .45;   // separation radius
          if (d < sr) { var k = (sr - d) / sr * spd * (g.sp === sp ? 3 : 2); ax -= dx / d * k; ay -= dy / d * k; }
        }
        if (gn) { ax += (gx / gn - f.x) / (W * .5) * spd * .5; ay += (gy / gn - f.y) / (H * .5) * spd * .3; }   // weak long-range pull keeps schools from splitting in a big tank
        if (n) { ax += (mx / n - f.x) / R * spd * 1.1 + (vx / n - f.vx) * 1.2; ay += (my / n - f.y) / R * spd * 1.1 + (vy / n - f.vy) * 1.2; }
        f.wa += (rnd() - .5) * 3 * dt; ax += Math.cos(f.wa) * spd * .7; ay += Math.sin(f.wa) * spd * .3;
        var lo = b.y0 + (floorY - b.y0) * sp.band[0], hi = b.y0 + (floorY - b.y0) * sp.band[1], z = 90 * u;
        if (f.y < lo) ay += (lo - f.y) / z * spd; else if (f.y > hi) ay -= (f.y - hi) / z * spd;
        var a2 = Math.hypot(ax, ay), cap = spd * 5; if (a2 > cap) { ax *= cap / a2; ay *= cap / a2; }
      }
      var w = 90 * u;   // soft walls
      if (f.x - b.x0 < w) ax += spd * 3.5 * (1 - (f.x - b.x0) / w); if (b.x1 - f.x < w) ax -= spd * 3.5 * (1 - (b.x1 - f.x) / w);
      if (f.y - b.y0 < w * .6) ay += spd * 3.5 * (1 - (f.y - b.y0) / (w * .6)); if (b.y1 - f.y < w * .6) ay -= spd * 3.5 * (1 - (b.y1 - f.y) / (w * .6));
      f.vx += ax * dt; f.vy += ay * dt; f.vy *= 1 - 1.5 * dt;
      var s = Math.hypot(f.vx, f.vy), mn = sp.id === 'pleco' ? 0 : spd * .45, mxs = spd * 1.35;
      if (s > mxs) { f.vx *= mxs / s; f.vy *= mxs / s; } else if (s < mn) { if (s < .01) { f.vx = f.dir * mn; } else { f.vx *= mn / s; f.vy *= mn / s; } }
      f.vy = clamp(f.vy, -.5 * Math.max(Math.abs(f.vx), spd * .5), .5 * Math.max(Math.abs(f.vx), spd * .5));
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.x < b.x0) { f.x = b.x0; f.vx = Math.abs(f.vx); } else if (f.x > b.x1) { f.x = b.x1; f.vx = -Math.abs(f.vx); }
      if (f.y < b.y0) { f.y = b.y0; f.vy = Math.abs(f.vy); } else if (f.y > Math.max(b.y0, b.y1)) { f.y = Math.max(b.y0, b.y1); f.vy = -Math.abs(f.vy); }
      if (Math.abs(f.vx) > .1 * spd) f.face += clamp((f.vx > 0 ? 1 : -1) - f.face, -dt * 5, dt * 5);
      f.pitch += (Math.atan2(f.vy, Math.abs(f.vx) + 1) * (sp.id === 'pleco' ? .1 : .7) - f.pitch) * Math.min(1, dt * 6);
      f.ph += dt * (sp.id === 'pleco' && !f.mode ? 1.5 : 4 + 7 * Math.min(1.3, Math.hypot(f.vx, f.vy) / spd));
    });
    bubbles.forEach(function (b) { b.y -= b.vy * dt; b.ph += dt * 3; if (b.y < 26 * U) respawn(b, false); });
  }

  // ---- drawing ----
  function plant(p) {
    p.bl.forEach(function (b) {
      cx.strokeStyle = b.col; cx.lineWidth = 5 * U; cx.lineCap = 'round'; cx.beginPath();
      for (var i = 0; i <= 8; i++) { var q = i / 8, sw = Math.sin(t * b.sp + b.ph + q * 2.2) * 16 * U * Math.pow(q, 1.4); cx[i ? 'lineTo' : 'moveTo'](p.x + b.dx + sw, sandTop(p.x) + 3 - q * b.h); }
      cx.stroke();
    });
  }
  function draw() {
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.drawImage(bg, 0, 0); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.globalCompositeOperation = 'lighter';
    rays.forEach(function (r) {
      var a = .07 + .06 * Math.sin(t * r.sp + r.ph), g = cx.createLinearGradient(0, 0, 0, H * .85); g.addColorStop(0, 'rgba(200,255,255,' + a + ')'); g.addColorStop(1, 'rgba(200,255,255,0)');
      var w = r.w * (1 + .25 * Math.sin(t * r.sp * .7 + r.ph)); cx.fillStyle = g; cx.beginPath(); cx.moveTo(r.x - w, 0); cx.lineTo(r.x + w, 0); cx.lineTo(r.x + r.sl + w * 2.2, H * .85); cx.lineTo(r.x + r.sl - w * 2.2, H * .85); cx.fill();
    });
    cx.globalCompositeOperation = 'source-over';
    plants.forEach(function (p) { if (!p.near) plant(p); });
    fish.forEach(function (f) {
      cx.save(); cx.translate(f.x, f.y); cx.rotate(f.pitch * f.face); cx.scale(f.face, 1); A.render(cx, f.sp, f.L, f.ph); cx.restore();
    });
    if (sel) {
      cx.save(); cx.strokeStyle = 'rgba(255,255,255,' + (.6 + .3 * Math.sin(t * 5)) + ')'; cx.lineWidth = 2; cx.setLineDash([6, 5]); cx.lineDashOffset = -t * 20;
      cx.beginPath(); cx.ellipse(sel.x, sel.y, sel.L * .6 + 8, Math.max(sel.hh * .75, sel.L * .3) + 8, 0, 0, 6.3); cx.stroke(); cx.restore();
    }
    plants.forEach(function (p) { if (p.near) plant(p); });
    cx.fillStyle = 'rgba(255,255,255,.18)'; cx.strokeStyle = 'rgba(255,255,255,.5)'; cx.lineWidth = 1;
    bubbles.forEach(function (b) { var x = b.x + Math.sin(b.ph) * b.wob; cx.beginPath(); cx.arc(x, b.y, b.r, 0, 6.3); cx.fill(); cx.stroke(); cx.fillStyle = 'rgba(255,255,255,.7)'; cx.fillRect(x - b.r * .4, b.y - b.r * .5, Math.max(1, b.r * .3), Math.max(1, b.r * .3)); cx.fillStyle = 'rgba(255,255,255,.18)'; });
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.drawImage(fg, 0, 0); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = 'rgba(225,255,255,.28)'; cx.beginPath(); cx.moveTo(0, 0);
    for (var x = 0; x <= W + 12; x += 12) cx.lineTo(x, 8 + Math.sin(x * .03 + t * 1.4) * 2.5 + Math.sin(x * .011 - t * .8) * 2); cx.lineTo(W, 0); cx.fill();
  }

  // ---- selection card ----
  var card = document.getElementById('card'), $ = function (id) { return document.getElementById(id); };
  function show(f) {
    sel = f; if (!f) { card.hidden = true; return; }
    var s = f.sp; $('c-name').textContent = s.name; $('c-sci').textContent = s.sci; $('c-desc').textContent = s.desc;
    var ul = $('c-facts'); ul.textContent = ''; s.facts.forEach(function (x) { var li = document.createElement('li'); li.textContent = x; ul.appendChild(li); });
    card.classList.toggle('top', f.y > H * .55);   // phone: sheet goes opposite the fish so it never covers it
    card.hidden = false; $('hint').classList.add('off');
  }
  function pick(px, py) {
    var best = null, bd = 1, pad = 14;
    fish.forEach(function (f) {
      var rx = f.L * .5 + pad, ry = Math.max(f.hh * .5, f.L * .2) + pad, dx = (px - f.x) / rx, dy = (py - f.y) / ry, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = f; }
    });
    return best;
  }
  var down = null;
  cv.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  cv.addEventListener('pointerup', function (e) {
    if (down && down.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) show(pick(e.clientX, e.clientY));
    down = null;
  });
  cv.addEventListener('pointercancel', function () { down = null; });
  $('close').addEventListener('click', function () { show(null); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') show(null); });

  // ---- loop ----
  function frame(ts) {
    raf = requestAnimationFrame(frame); var dt = Math.min(.05, (ts - last) / 1000); last = ts;
    update(dt); draw();
    if (maxDpr > 1.25 && ++nfr > 20) { slow += dt > .03 ? 1 : 0; if (nfr > 120) { if (slow > 80) { maxDpr = 1.25; layout(); } nfr = -1e9; } }   // one-off quality drop on very slow devices
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); });
  window.addEventListener('resize', layout);
  setTimeout(function () { $('hint').classList.add('off'); }, 7000);
  layout(); start();
  A.sim = { fish: fish, update: update, bounds: bounds, size: function () { return [W, H, floorY]; } };   // read-only hooks for tests
})();
