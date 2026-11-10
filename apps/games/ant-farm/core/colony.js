// Colony: ants (dig, forage, carry, haul, rest), queen, brood.
// AF2: digging follows dig jobs (w.tips) so tunnels stay 1 cell wide, branch,
// and sometimes end in a side chamber. Uses world.js (AF.addTip, AF.fields).
// AF3: nurses carry eggs from the queen to the brood room; egg -> larva -> pupa -> ant
// (capped at AF.MAXANTS); foragers sleep in the nest at night; food falls from the sky.
(function () {
  var W = AF.W, H = AF.H, S = AF.SURF, DAY = 60;
  AF.DAY = DAY; AF.MAXANTS = 300;                  // ui.js lowers the cap with lowGraphics (weak phones)
  AF.addAnt = function (w, x, y, role) {
    var a = { cx: x, cy: y, nx: x, ny: y, p: 0, st: role === 'nurse' ? 'rest' : role, role: role, t: 1 + w.r() * 3,
      hx: 0, hy: 1, dig: 0, load: 0, trip: 0, dir: w.r() < .5 ? 1 : -1, ph: w.r() * 6, ang: 0, spd: 3 + w.r(), tip: null };
    w.ants.push(a); return a;
  };
  AF.pickRole = function (w) { var v = w.r(); return v < 0.55 ? 'forage' : v < 0.88 ? 'dig' : 'nurse'; };
  AF.seedColony = function (w) { for (var i = 0; i < 12; i++) AF.addAnt(w, w.qx + (i % 5) - 2, w.qy, i < 5 ? 'forage' : i < 10 ? 'dig' : 'nurse'); };

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
  function nearFood(w, x) { var b = null, bd = 16; for (var i = 0; i < w.food.length; i++) { var d = Math.abs(w.food[i].x - x); if (w.food[i].amt > 0 && d < bd) { bd = d; b = w.food[i]; } } return b; }
  function budget(w) { return w.dug < Math.min(1400, 160 + w.ants.length * 8); }

  // AF2 dig jobs ---------------------------------------------------------
  // A soil cell may be dug only if no air touches it except around the ant's own cell: keeps tunnels thin.
  function thinOK(w, ax, ay, tx, ty) {
    if (tx < 1 || tx >= W - 1 || ty < S + 4 || ty >= H - 1 || w.g[ty * W + tx] !== 1) return false;
    for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) { var nx = tx + ox, ny = ty + oy;
      if (Math.abs(nx - ax) <= 1 && Math.abs(ny - ay) <= 1) continue; if (w.g[ny * W + nx] === 0) return false; }
    return true;
  }
  function tipAt(w, x, y) { for (var i = 0; i < w.tips.length; i++) if (w.tips[i].x === x && w.tips[i].y === y) return w.tips[i]; return null; }
  // Next cell index to dig for a job, or -1 when the job is finished / blocked.
  AF.tipNext = function (w, t) {
    if (t.room) { var R = t.room;
      while (R.i < R.cells.length) { var c = R.cells[R.i];
        if (w.g[c] === 1) for (var k = 0; k < 4; k++) { var x = c % W + AF.N4[k][0], y = (c / W | 0) + AF.N4[k][1];
          if (AF.walk(w, x, y)) { if (t.x !== x || t.y !== y) { t.x = x; t.y = y; w.needField = true; } return c; } }
        R.i++; }
      return -1; }
    var px = t.my ? 1 : 0, py = t.mx ? 1 : 0, sg = py ? (w.r() < 0.68 ? 1 : -1) : (w.r() < 0.5 ? 1 : -1);
    var o = [[t.mx, t.my], [px * sg, py * sg], [-px * sg, -py * sg]];
    if (!t.perp && w.r() < 0.28) o = [o[1], o[0], o[2]];         // wiggle: one sideways step now and then
    for (var j = 0; j < 3; j++) { var tx = t.x + o[j][0], ty = t.y + o[j][1];
      if (thinOK(w, t.x, t.y, tx, ty)) { t.perp = j > 0 || o[j][0] !== t.mx || o[j][1] !== t.my; return ty * W + tx; } }
    return -1;
  };
  // Room (side chamber) at the end of a tunnel: an ellipse dug outwards from the door cell.
  function makeRoom(w, ex, ey, mx, my) {
    var rx = mx ? 3 + w.r() * 2.5 : 2.5 + w.r() * 1.5, ry = 1.5 + w.r() * 0.9, cx = ex + mx * (rx + 1), cy = ey + my * (ry + 1), x, y;
    if (cx - rx < 2 || cx + rx > W - 3 || cy - ry < S + 5 || cy + ry > H - 3) return false;
    for (y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++)
      if (w.g[y * W + x] === 0 && Math.abs(x - ex) + Math.abs(y - ey) > 2) return false;   // too close to other tunnels
    var inR = function (x, y) { var u = (x - cx) / rx, v = (y - cy) / ry; return u * u + v * v <= 1; };
    var cells = [], seen = {}, q = [[ex + mx, ey + my]]; seen[q[0][1] * W + q[0][0]] = 1;
    while (q.length) { var p = q.shift(), i = p[1] * W + p[0]; if (w.g[i] !== 1) continue; cells.push(i);
      for (var k = 0; k < 4; k++) { x = p[0] + AF.N4[k][0]; y = p[1] + AF.N4[k][1]; var n = y * W + x;
        if (!seen[n] && inR(x, y)) { seen[n] = 1; q.push([x, y]); } } }
    if (cells.length < 6) return false;
    var room = { x: cx, y: cy, rx: rx, ry: ry, kind: 'side', cells: cells, i: 0 };
    w.rooms.push(room); AF.addTip(w, ex, ey, mx, my, 0).room = room; return true;
  }
  AF.endTip = function (w, t) {
    var i = w.tips.indexOf(t); if (i < 0) return; w.tips.splice(i, 1); w.needField = true;
    if (t.room) { t.room.done = true; return; }
    if (t.len >= 5 && w.r() < 0.65) makeRoom(w, t.x, t.y, t.mx, t.my);
    if (t.len >= 4 && w.r() < 0.4) { var s = w.r() < 0.5 ? 1 : -1;      // fork: carry on at a right angle
      AF.addTip(w, t.x, t.y, t.my ? s : 0, t.mx ? (w.r() < 0.75 ? 1 : -1) : 0, 6 + w.r() * 16); }
  };
  function tipDug(w, t, x, y) {
    if (t.room) { t.room.i++; return; }
    t.x = x; t.y = y; t.len++; t.left--; w.tun.push(y * W + x); w.needField = true;
    if (t.left <= 0) AF.endTip(w, t);
  }
  // Start a new branch from a random tunnel cell (side branch from a shaft, or downward from a gallery).
  function newTip(w) {
    for (var n = 0; n < 8; n++) {
      var c = w.tun[w.r() * w.tun.length | 0], x = c % W, y = c / W | 0;
      if (y < S + 4 || w.g[c] !== 0) continue;
      var horiz = AF.walk(w, x - 1, y) || AF.walk(w, x + 1, y), s = w.r() < 0.5 ? 1 : -1;
      var d = horiz ? [0, w.r() < 0.8 ? 1 : -1] : [s, 0];
      if (thinOK(w, x, y, x + d[0], y + d[1])) { AF.addTip(w, x, y, d[0], d[1], 8 + w.r() * 22); return; }
    }
  }

  // AF3 nurse: fetch a fresh egg from the queen room and carry it to the brood room.
  function nurse(w, a) {
    var i = a.cy * W + a.cx, j;
    a.st = 'rest'; a.t = 0;
    if (a.load === 3) {
      if (w.distB[i] >= 0 && w.distB[i] <= 2) { var b = a.egg; b.room = 'b'; b.x = w.bx + (w.r() * 2 - 1) * 3; b.y = w.by + 0.4 + w.r() * 0.9;
        w.brood.push(b); a.egg = null; a.load = 0; a.t = 1 + w.r() * 2; return; }
      if (!descend(w, a, w.distB)) randStep(w, a); return;
    }
    for (j = 0; j < w.brood.length; j++) if (w.brood[j].room === 'q') break;
    if (j < w.brood.length) {
      if (w.distQ[i] >= 0 && w.distQ[i] <= 3) { a.egg = w.brood.splice(j, 1)[0]; a.load = 3; return; }
      if (!descend(w, a, w.distQ)) randStep(w, a); return;
    }
    if (w.distB[i] > 4) { if (!descend(w, a, w.distB)) randStep(w, a); return; }
    a.t = 1 + w.r() * 3; randStep(w, a);                       // tend the brood
  }

  function decide(w, a) {
    a.nx = a.cx; a.ny = a.cy;
    var atSurf = a.cy === S - 1;
    if (a.st === 'carry' || a.st === 'home') {
      if (a.load === 2) { var i = a.cy * W + a.cx; w.ph[i] = Math.min(1, w.ph[i] + 0.6); }
      if (w.distN[a.cy * W + a.cx] <= 1 && w.distN[a.cy * W + a.cx] >= 0) {
        if (a.load === 2) { var got = a.carryAmt || 2; w.stored += got; w.collected = (w.collected || 0) + got; }
        a.load = 0; a.carryAmt = 0; a.st = 'rest'; a.t = 1 + w.r() * 3; return;
      }
      if (!descend(w, a, w.distN)) randStep(w, a); return;
    }
    if (a.st === 'haul') {
      if (atSurf) { // drop grain beside entrance
        var mx = a.cx + (w.r() * 7 - 3 | 0); mx = Math.max(0, Math.min(W - 1, mx));
        w.mound[mx] = Math.min(6, w.mound[mx] + 0.12); a.load = 0; a.st = 'dig'; a.dir = -a.dir; return;
      }
      if (!descend(w, a, w.distS)) randStep(w, a); return;
    }
    if (a.st === 'forage') {
      if (AF.nightAmt(w) > 0.18) { a.st = 'home'; return; }      // AF-4b: head in at dusk so they are clearly inside at night
      if (!atSurf) { if (!descend(w, a, w.distS)) randStep(w, a); return; }
      if (a.trip > 48) { a.st = 'home'; a.trip = 0; return; }
      var f = nearFood(w, a.cx);
      if (f && Math.abs(f.x - a.cx) <= 1) { var take = Math.min(2, f.amt); f.amt -= take; a.load = 2; a.carryAmt = take; a.st = 'carry'; a.trip = 0; return; }
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
      if (!budget(w) || !w.tips.length) { a.st = 'rest'; a.t = 3 + w.r() * 4; return; }
      var tp = tipAt(w, a.cx, a.cy);
      if (tp) {
        if (tp.busy) { a.st = 'rest'; a.t = 0.6 + w.r(); return; }
        var c = AF.tipNext(w, tp);
        if (c < 0) { AF.endTip(w, tp); return; }
        if (tp.x !== a.cx || tp.y !== a.cy) return;        // room door moved: walk there next
        tp.busy = true; a.tip = tp; a.dx = c % W; a.dy = c / W | 0; a.dig = 0.8 / (1 + 2 * w.wet[c]); return;
      }
      if (w.distT && w.distT[a.cy * W + a.cx] >= 0) { if (!descend(w, a, w.distT)) randStep(w, a); return; }
      randStep(w, a); return;
    }
    // rest / nurse
    if (a.role === 'nurse') { nurse(w, a); return; }
    a.st = a.role; a.t = 2 + w.r() * 3;
  }

  AF.step = function (w, dt) {
    w0 = w; w.t += dt;
    w.fieldT -= dt; if (w.fieldT <= 0 && w.needField) { AF.fields(w); w.needField = false; w.fieldT = 0.3; }
    w.tipT -= dt; if (w.tipT <= 0) { w.tipT = 2.5; if (w.tips.length < Math.min(8, 2 + w.ants.length / 25) && budget(w)) newTip(w); }
    for (var i = 0; i < w.ants.length; i++) {
      var a = w.ants[i]; a.ph += dt * 14;
      if (a.st === 'forage') a.trip += dt;
      if (a.dig > 0) { a.dig -= dt; if (a.dig <= 0) { var tp = a.tip; a.tip = null; if (tp) tp.busy = false;
        if (w.g[a.dy * W + a.dx] === 1) { AF.set(w, a.dx, a.dy, 0); w.dug++; w.needField = true; a.load = 1; a.st = 'haul'; if (tp) tipDug(w, tp, a.dx, a.dy); } } continue; }
      if (a.st === 'rest' && a.t > 0) { a.t -= dt; continue; }
      if (a.nx === a.cx && a.ny === a.cy) { decide(w, a); if (a.nx === a.cx && a.ny === a.cy) continue; }
      a.ang = Math.atan2(a.ny - a.cy, a.nx - a.cx);
      a.p += a.spd * dt;
      if (a.p >= 1) { a.p = 0; a.cx = a.nx; a.cy = a.ny; decide(w, a); }
    }
    // pheromone decay
    w.phT += dt; if (w.phT > 0.5) { w.phT = 0; var ph = w.ph; for (i = 0; i < ph.length; i++) if (ph[i] > 0) { ph[i] *= 0.93; if (ph[i] < 0.01) ph[i] = 0; } }
    // AF-4b: wet soil dries (surface faster than deep); mark dirty so the cache repaints
    w.dryT = (w.dryT || 0) + dt;
    if (w.dryT > 0.5) {
      var dryDt = w.dryT, wet = w.wet, y, rate, nv; w.dryT = 0;
      for (i = S * W; i < wet.length; i++) if (wet[i] > 0) {
        y = i / W | 0; rate = 0.022 * (y < S + 5 ? 1.5 : 0.7);
        nv = wet[i] - rate * dryDt; if (nv < 0.008) nv = 0;
        if (nv !== wet[i]) { wet[i] = nv; w.dirty.push(i); }
      }
    }
    if (w.splash) { w.splash.t -= dt; if (w.splash.t <= 0) w.splash = null; }
    // food upkeep
    w.stored = Math.max(0, Math.min(220, w.stored - dt * (0.0022 * w.ants.length + 0.01 * countStage(w, 'larva'))));
    // queen
    w.laidT -= dt;
    if (w.laidT <= 0 && w.stored >= 2 && w.ants.length + w.brood.length < AF.MAXANTS) {
      w.stored -= 1; w.laidT = AF.nightAmt(w) > 0.3 ? 6 : 9;     // AF-4c: steady laying, a little faster at night
      w.brood.push({ x: w.qx + (w.r() * 6 - 3), y: w.qy + 1.4 + w.r() * 0.8, age: 0, stage: 'egg', room: 'q' });
    }
    for (i = w.brood.length - 1; i >= 0; i--) {
      var b = w.brood[i]; if (b.stage === 'larva' && w.stored <= 0) continue; b.age += dt;
      if (b.stage === 'egg' && b.age > DAY * 0.5) b.stage = 'larva';
      else if (b.stage === 'larva' && b.age > DAY * 1.2) b.stage = 'pupa';
      else if (b.stage === 'pupa' && b.age > DAY * 1.7) { w.brood.splice(i, 1);    // hatch where it lies (brood room floor)
        var hx = Math.round(b.x), hy = Math.round(b.y - 0.5); if (!AF.walk(w, hx, hy)) { hx = b.room === 'b' ? w.bx : w.qx; hy = b.room === 'b' ? w.by : w.qy; }
        AF.addAnt(w, hx, hy, AF.pickRole(w)); }
    }
    // water drops
    for (i = w.drops.length - 1; i >= 0; i--) {
      var d = w.drops[i]; d.vy += 40 * dt; d.y += d.vy * dt;
      if (d.y >= S - 0.5) { w.drops.splice(i, 1); soak(w, Math.round(d.x)); }
    }
    for (i = w.falls.length - 1; i >= 0; i--) {              // AF3: food falling to the surface
      var f = w.falls[i]; f.vy += 30 * dt; f.y += f.vy * dt; f.spin += dt * 5;
      if (f.y >= S - 0.6) { w.falls.splice(i, 1); landFood(w, f.x, f.amt); }
    }
    w.natT -= dt;                                               // now and then a leaf or berry drops by itself (daytime)
    if (w.natT <= 0) {
      var scarce = w.stored < 10, night = AF.nightAmt(w) > 0.3, cap = night ? 3 : 7;
      w.natT = (scarce ? 7 : 10) + w.r() * (scarce ? 6 : 10);
      if (w.food.length + w.falls.length < cap && (scarce || !night || w.r() < 0.35))
        AF.dropFood(w, 4 + w.r() * (W - 8), night ? 10 : (scarce ? 16 : 18));
    }
    for (i = w.food.length - 1; i >= 0; i--) if (w.food[i].amt <= 0) w.food.splice(i, 1);
    w.histT = (w.histT || 0) + dt;
    if (w.histT >= 2) {
      w.histT = 0; if (!w.hist) w.hist = [];
      w.hist.push({ t: w.t, ants: w.ants.length, brood: w.brood.length, stored: w.stored });
      if (w.hist.length > 480) w.hist.splice(0, w.hist.length - 480);
    }
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
  function landFood(w, x, amt) {
    x = Math.max(1, Math.min(W - 2, Math.round(x)));
    for (var i = 0; i < w.food.length; i++) if (Math.abs(w.food[i].x - x) < 3) { w.food[i].amt += amt; return; }
    w.food.push({ x: x, amt: amt });
  }
  // Tap / natural drop: the food falls from the top of the sky, then lands as a pile.
  AF.dropFood = function (w, x, amt) { if (w.falls.length < 12) w.falls.push({ x: x, y: 0, vy: 0, amt: amt || 25, spin: w.r() * 6 }); };
  AF.playerDig = function (w, x, y) {
    var W = AF.W, H = AF.H, S = AF.SURF;
    x = Math.round(x); y = Math.round(y);
    if (x < 1 || x >= W - 1 || y < S || y >= H - 1) return false;
    if (w.g[y * W + x] !== 1) return false;
    var open = y === S || AF.walk(w, x - 1, y) || AF.walk(w, x + 1, y) || AF.walk(w, x, y - 1) || AF.walk(w, x, y + 1);
    if (!open) return false;
    AF.set(w, x, y, 0); w.dug++; w.tun.push(y * W + x); w.needField = true;
    var mx = Math.max(0, Math.min(W - 1, (w.ents && w.ents[0] != null) ? w.ents[0] : (w.ex || x)));
    w.mound[mx] = Math.min(6, w.mound[mx] + 0.1);
    return true;
  };
  AF.hitAnt = function (w, x, y) {
    var best = null, bd = 0.9, i, a, ax, ay, d;
    if (Math.hypot((w.qx + 0.5) - x, (w.qy + 1.0) - y) < 1.8) return { kind: 'queen' };
    for (i = 0; i < w.ants.length; i++) {
      a = w.ants[i]; ax = a.cx + (a.nx - a.cx) * a.p + 0.5; ay = a.cy + (a.ny - a.cy) * a.p + 0.5;
      if (AF.antDrawY) ay = AF.antDrawY(w, ax, ay);
      d = Math.hypot(ax - x, ay - y); if (d < bd) { bd = d; best = { kind: 'ant', ant: a, i: i }; }
    }
    return best;
  };
  AF.hitRoom = function (w, x, y) {
    var i, r, u, v;
    for (i = 0; i < w.rooms.length; i++) { r = w.rooms[i]; u = (x - r.x) / (r.rx || 3); v = (y - r.y) / (r.ry || 2); if (u * u + v * v <= 1.05) return r; }
    return null;
  };

  AF.dropWater = function (w, x) { w.drops.push({ x: x, y: 0, vy: 0 }); };
})();
