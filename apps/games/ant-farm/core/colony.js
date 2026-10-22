// Colony: ants (dig, forage, carry, haul, rest), queen, brood.
(function () {
  var W = AF.W, H = AF.H, S = AF.SURF, DAY = 60, MAXANTS = 400;
  AF.DAY = DAY;
  AF.addAnt = function (w, x, y, role) {
    var a = { cx: x, cy: y, nx: x, ny: y, p: 0, st: role === 'nurse' ? 'rest' : role, role: role, t: 1 + w.r() * 3,
      hx: 0, hy: 1, dig: 0, load: 0, trip: 0, dir: w.r() < .5 ? 1 : -1, ph: w.r() * 6, go: true, ang: 0, spd: 3 + w.r(), fx: -1, fy: -1 };
    w.ants.push(a); return a;
  };
  AF.pickRole = function (w) { var v = w.r(); return v < 0.55 ? 'forage' : v < 0.88 ? 'dig' : 'nurse'; };
  AF.seedColony = function (w) { for (var i = 0; i < 12; i++) AF.addAnt(w, w.qx + (i % 5) - 2, w.qy, i < 5 ? 'forage' : i < 11 ? "dig" : "nurse"); };

  function fv(f, x, y) { return AF.walk(w0, x, y) ? f[y * W + x] : -1; }
  var w0;
  function descend(w, a, f) {
    var cur = f[a.cy * W + a.cx], best = 1e9, c = [];
    for (var k = 0; k < 4; k++) { var x = a.cx + AF.N4[k][0], y = a.cy + AF.N4[k][1], v = fv(f, x, y);
      if (v < 0) continue; if (v < best) { best = v; c = [[x, y]]; } else if (v === best) c.push([x, y]); }
    if (!c.length) return false;
    if (cur >= 0 && best >= cur) return false;
    var p = c[w.r() * c.length | 0]; a.nx = p[0]; a.ny = p[1]; return true;
  }
  function randStep(w, a) {
    var o = []; for (var k = 0; k < 4; k++) { var x = a.cx + AF.N4[k][0], y = a.cy + AF.N4[k][1]; if (AF.walk(w, x, y)) o.push([x, y]); }
    if (o.length) { var p = o[w.r() * o.length | 0]; a.nx = p[0]; a.ny = p[1]; }
  }
  function heading(w, a) { var v = w.r(); if (v < 0.4) { a.hx = 0; a.hy = 1; } else if (v < 0.62) { a.hx = 1; a.hy = 0; } else if (v < 0.92) { a.hx = -1; a.hy = 0; } else { a.hx = 0; a.hy = -1; } }
  function nearFood(w, x) { var b = null, bd = 11; for (var i = 0; i < w.food.length; i++) { var d = Math.abs(w.food[i].x - x); if (w.food[i].amt > 0 && d < bd) { bd = d; b = w.food[i]; } } return b; }
  function budget(w) { return w.dug < 120 + w.ants.length * 6; }

  function decide(w, a) {
    a.nx = a.cx; a.ny = a.cy;
    var atSurf = a.cy === S - 1;
    if (a.st === 'carry' || a.st === 'home') {
      if (a.load === 2) { var i = a.cy * W + a.cx; w.ph[i] = Math.min(1, w.ph[i] + 0.6); }
      if (w.distN[a.cy * W + a.cx] <= 1 && w.distN[a.cy * W + a.cx] >= 0) {
        if (a.load === 2) { w.stored++; w.collected = (w.collected || 0) + 1; }
        a.load = 0; a.st = 'rest'; a.t = 1 + w.r() * 3; return;
      }
      if (!descend(w, a, w.distN)) randStep(w, a); return;
    }
    if (a.st === 'haul') {
      if (atSurf) { // drop grain beside entrance
        var mx = a.cx + (w.r() * 7 - 3 | 0); mx = Math.max(0, Math.min(W - 1, mx));
        w.mound[mx] = Math.min(6, w.mound[mx] + 0.12); a.load = 0; a.st = 'dig'; a.go = a.fx < 0; a.dir = -a.dir; return;
      }
      if (!descend(w, a, w.distS)) randStep(w, a); return;
    }
    if (a.st === 'forage') {
      if (!atSurf) { if (!descend(w, a, w.distS)) randStep(w, a); return; }
      if (a.trip > 35) { a.st = 'home'; a.trip = 0; return; }
      var f = nearFood(w, a.cx);
      if (f && Math.abs(f.x - a.cx) <= 1) { f.amt--; a.load = 2; a.st = 'carry'; a.trip = 0; return; }
      if (f) a.dir = f.x > a.cx ? 1 : -1;
      else {
        var ahead = w.ph[a.cy * W + a.cx + a.dir] || 0, back = w.ph[a.cy * W + a.cx - a.dir] || 0;
        if (ahead < 0.04 && back > 0.04 && w.r() < 0.3) a.dir = -a.dir;
        else if (w.r() < 0.03) a.dir = -a.dir;
      }
      var nx = a.cx + a.dir; if (nx < 0 || nx >= W) { a.dir = -a.dir; return; }
      a.nx = nx; return;
    }
    if (a.st === 'dig') {
      if (!budget(w)) { a.st = 'rest'; a.t = 4 + w.r() * 4; return; }
      var dn = w.distN[a.cy * W + a.cx]; if (dn >= 0 && dn <= 3) a.go = false;
      if (a.fx < 0 && a.go) { if (!descend(w, a, w.distN)) randStep(w, a); return; }
      if (a.cy < S + 2) { if (!descend(w, a, w.distN)) randStep(w, a); return; }
      if (a.fx >= 0 && w.r() < 0.7 && (a.cx !== a.fx || a.cy !== a.fy)) { // head back to last dig face
        var bx = a.cx, by = a.cy, bd = Math.abs(a.fx - a.cx) + Math.abs(a.fy - a.cy);
        for (var k = 0; k < 4; k++) { var x = a.cx + AF.N4[k][0], y = a.cy + AF.N4[k][1], d = Math.abs(a.fx - x) + Math.abs(a.fy - y);
          if (d < bd && AF.walk(w, x, y)) { bd = d; bx = x; by = y; } }
        if (bx !== a.cx || by !== a.cy) { a.nx = bx; a.ny = by; return; }
        if (w.g[a.fy * W + a.fx] === 0) a.fx = -1;
      }
      if (w.r() < 0.12) heading(w, a);
      var tx = a.cx + a.hx, ty = a.cy + a.hy;
      if (AF.walk(w, tx, ty)) { a.nx = tx; a.ny = ty; return; }
      if (tx > 0 && tx < W - 1 && ty > S && ty < H - 1 && w.g[ty * W + tx] === 1) {
        a.dig = 0.8 / (1 + 2 * w.wet[ty * W + tx]); a.dx = tx; a.dy = ty; return;
      }
      heading(w, a); a.p = 0.6; return;
    }
    // rest / nurse
    if (a.role === 'nurse' && w.distN[a.cy * W + a.cx] > 6) { descend(w, a, w.distN); return; }
    a.st = a.role === 'nurse' ? 'rest' : a.role; a.go = true; a.t = 2 + w.r() * 3;
    if (a.role === 'nurse') randStep(w, a);
  }

  AF.step = function (w, dt) {
    w0 = w; w.t += dt;
    w.fieldT -= dt; if (w.fieldT <= 0 && w.needField) { AF.fields(w); w.needField = false; w.fieldT = 0.3; }
    for (var i = 0; i < w.ants.length; i++) {
      var a = w.ants[i]; a.ph += dt * 14;
      if (a.st === 'forage') a.trip += dt;
      if (a.dig > 0) { a.dig -= dt; if (a.dig <= 0) { if (w.g[a.dy * W + a.dx] === 1) { AF.set(w, a.dx, a.dy, 0); w.dug++; w.needField = true; a.load = 1; a.st = 'haul'; a.fx = a.dx; a.fy = a.dy; } } continue; }
      if (a.st === 'rest' && a.t > 0) { a.t -= dt; continue; }
      if (a.nx === a.cx && a.ny === a.cy) { decide(w, a); if (a.nx === a.cx && a.ny === a.cy) continue; }
      a.ang = Math.atan2(a.ny - a.cy, a.nx - a.cx);
      a.p += a.spd * dt;
      if (a.p >= 1) { a.p = 0; a.cx = a.nx; a.cy = a.ny; decide(w, a); }
    }
    // pheromone decay
    w.phT += dt; if (w.phT > 0.5) { w.phT = 0; var ph = w.ph; for (i = 0; i < ph.length; i++) if (ph[i] > 0) { ph[i] *= 0.93; if (ph[i] < 0.01) ph[i] = 0; } }
    // food upkeep
    w.stored = Math.max(0, w.stored - dt * (0.004 * w.ants.length + 0.02 * countStage(w, 'larva')));
    // queen
    w.laidT -= dt;
    if (w.laidT <= 0 && w.stored >= 3 && w.ants.length + w.brood.length < MAXANTS) {
      w.stored -= 1; w.laidT = 6;
      w.brood.push({ x: w.qx + (w.r() * 8 - 4), y: w.qy + 1.4 + w.r() * 0.8, age: 0, stage: 'egg' });
    }
    for (i = w.brood.length - 1; i >= 0; i--) {
      var b = w.brood[i]; if (b.stage === 'larva' && w.stored <= 0) continue; b.age += dt;
      if (b.stage === 'egg' && b.age > DAY * 0.6) b.stage = 'larva';
      else if (b.stage === 'larva' && b.age > DAY * 1.6) { w.brood.splice(i, 1); AF.addAnt(w, w.qx, w.qy, AF.pickRole(w)); }
    }
    // water drops
    for (i = w.drops.length - 1; i >= 0; i--) {
      var d = w.drops[i]; d.vy += 40 * dt; d.y += d.vy * dt;
      if (d.y >= S - 0.5) { w.drops.splice(i, 1); soak(w, Math.round(d.x)); }
    }
    for (i = w.food.length - 1; i >= 0; i--) if (w.food[i].amt <= 0) w.food.splice(i, 1);
  };
  function countStage(w, s) { var n = 0; for (var i = 0; i < w.brood.length; i++) if (w.brood[i].stage === s) n++; return n; }
  AF.countStage = countStage;
  function soak(w, cx) {
    for (var y = S; y < S + 12; y++) for (var x = cx - 6; x <= cx + 6; x++) {
      if (x < 0 || x >= W) continue; var i = y * W + x, d = Math.abs(x - cx) + (y - S) * 0.6;
      if (d < 7) { w.wet[i] = Math.min(1, w.wet[i] + 0.5 * (1 - d / 7)); w.dirty.push(i); }
    }
    w.splash = { x: cx, t: 0.5 };
  }
  AF.dropFood = function (w, x) {
    x = Math.max(1, Math.min(W - 2, Math.round(x)));
    for (var i = 0; i < w.food.length; i++) if (Math.abs(w.food[i].x - x) < 3) { w.food[i].amt += 25; return; }
    w.food.push({ x: x, amt: 25 });
  };
  AF.dropWater = function (w, x) { w.drops.push({ x: x, y: 0, vy: 0 }); };
})();
