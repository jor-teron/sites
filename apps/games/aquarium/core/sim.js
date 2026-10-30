// Aquarium AQQ1a (logic from AQ1b): shared state, boids schooling, care (food, hunger, water quality, clean) and the 'aquarium.save' autosave. No drawing here.
(function () {
  'use strict';
  var A = window.AQ, SP = A.SPECIES;
  // S: shared tank state. W/H/U/floorY are set by ui/render.js layout(); ui reads the rest.
  var S = A.st = { W: 0, H: 0, dpr: 1, U: 1, floorY: 0, t: 0, fish: [], bubbles: [], food: [], puffs: [], ripples: [], wq: 100, cleanT: 0, armed: 0, armedT: 0, sel: null };
  var fish = S.fish, food = S.food, puffs = S.puffs, ripples = S.ripples;
  function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
  var rnd = rng(7), clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  function sandTop(x) { return S.floorY + Math.sin(x * .011) * 5 * S.U + Math.sin(x * .027 + 1) * 3 * S.U; }
  var ui = function (fn, v) { if (A.ui && A.ui[fn]) A.ui[fn](v); };   // optional display hooks (ui/hud.js)

  function respawn(b, init) {
    var W = S.W, H = S.H, U = S.U, src = rnd() < .5; b.x = src ? (rnd() < .5 ? W * .2 : W * .78) + (rnd() - .5) * 10 : rnd() * W; b.y = init ? rnd() * H : sandTop(b.x) - 4;
    b.r = (1.5 + rnd() * 3.5) * U; b.vy = (28 + rnd() * 40) * U * (.6 + b.r / (6 * U)); b.ph = rnd() * 6.3; b.wob = (3 + rnd() * 6) * U;
  }
  function bounds(f) { return { x0: f.L * .5 + 6, x1: S.W - f.L * .5 - 6, y0: 24 * S.U + f.hh * .5, y1: sandTop(f.x) - f.hh * (f.sp.id === 'pleco' ? .3 : .5) - 5 }; }
  function place(f) { var b = bounds(f); f.x = clamp(f.x, b.x0, b.x1); f.y = clamp(f.y, b.y0, Math.max(b.y0, b.y1)); }
  function spawn() {
    var W = S.W, H = S.H, U = S.U;
    SP.forEach(function (sp) {
      var cx0 = 100 + rnd() * (W - 200), cy0 = H * (.2 + .5 * rnd());
      for (var i = 0; i < sp.n; i++) {
        var a = rnd() * 6.283, f = { sp: sp, k: .9 + rnd() * .2, x: cx0 + Math.cos(a) * 50, y: cy0 + Math.sin(a) * 30, ph: rnd() * 6.3, wa: a, face: 1, pitch: 0, mode: 0, tm: 0, dir: rnd() < .5 ? -1 : 1, hunger: 30 + rnd() * 25, hr: .05 + rnd() * .02, mood: .7 };
        f.L = sp.L * U * f.k; f.hh = sp.H * f.L; f.vx = Math.cos(a) * sp.spd * U; f.vy = 0; fish.push(f);
      }
    });
    fish.sort(function (a, b) { return a.sp.z - b.sp.z; });
  }
  function resize(oW, oH) {   // after a layout change: rescale fish and food into the new tank
    var W = S.W, H = S.H, U = S.U;
    if (!fish.length) spawn();
    if (oW) food.forEach(function (p) { p.x *= W / oW; p.y *= H / oH; });
    fish.forEach(function (f) { if (oW) { f.x *= W / oW; f.y *= H / oH; } f.L = f.sp.L * U * f.k; f.hh = f.sp.H * f.L; place(f); });
  }

  // ---- simulation: boids (cohesion, alignment, separation) + walls + wander + preferred depth ----
  function update(dt) {
    var W = S.W, H = S.H, U = S.U, floorY = S.floorY;
    S.t += dt;
    fish.forEach(function (f) {
      var sp = f.sp, u = U, spd = sp.spd * u * (.6 + .4 * f.mood), b = bounds(f), tg = target(f), ax = 0, ay = 0, i, g, dx, dy, d, n = 0, mx = 0, my = 0, vx = 0, vy = 0, gx = 0, gy = 0, gn = 0;
      if (sp.id === 'pleco') {   // cruise the sand, pause now and then
        f.tm -= dt; if (f.tm <= 0) { f.mode = f.mode ? 0 : 1; f.tm = f.mode ? 4 + rnd() * 6 : 2 + rnd() * 4; if (f.mode) f.dir = rnd() < .5 ? -1 : 1; }
        if (f.x < b.x0 + 30) f.dir = 1; else if (f.x > b.x1 - 30) f.dir = -1;
        ax = ((f.mode ? f.dir * spd * .8 : 0) - f.vx) * 1.5;
        if (tg) ax = (clamp((tg.x - f.x) / 12, -1, 1) * spd * 1.3 - f.vx) * 2;   // hungry pleco grazes along the bottom toward sinking food
        ay = ((sandTop(f.x) - f.hh * .3 - 5 - f.y) * 3 - f.vy) * 2;
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
        if (tg) { dx = tg.x - f.x; dy = tg.y - f.y; d = Math.hypot(dx, dy) + .01; ax = ax * .25 + dx / d * spd * 5; ay = ay * .25 + dy / d * spd * 4.5; }   // chase food
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
      f.hunger = Math.min(100, f.hunger + f.hr * dt); f.mood += ((100 - f.hunger) / 100 * .75 + S.wq / 100 * .25 - f.mood) * Math.min(1, dt * .5);
      if (tg && Math.hypot(tg.x - (f.x + f.face * f.L * .5), tg.y - f.y) < f.L * .25 + 7 * u) { tg.dead = 1; f.hunger = Math.max(0, f.hunger - sp.eat); S.wq -= .25; }
      f.ph += dt * (sp.id === 'pleco' && !f.mode ? 1.5 : 4 + 7 * Math.min(1.3, Math.hypot(f.vx, f.vy) / spd));
    });
    care(dt);
    S.bubbles.forEach(function (b) { b.y -= b.vy * dt; b.ph += dt * 3; if (b.y < 26 * U) respawn(b, false); });
  }

  // ---- care (AQ1b): food, hunger/mood, water quality, clean ----
  var FOODCOL = ['#e8b04a', '#d96a3a', '#7fb552'], MAXFOOD = 100;
  function target(f) {   // nearest food this fish wants: hungry only; pleco only takes it low down, others skip flakes already on the sand
    var h = f.hunger, pl = f.sp.id === 'pleco', best = null, bd = (pl ? 420 : 260) * S.U, i, p, d;
    if (h < (pl ? 20 : 24)) return null;
    for (i = 0; i < food.length; i++) {
      p = food[i]; if (p.dead) continue;
      if (pl ? p.y < S.floorY - 170 * S.U : p.y > sandTop(p.x) - 24 * S.U) continue;
      d = Math.hypot(p.x - f.x, p.y - f.y); if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function drop(x, y) {   // sprinkle a pinch of flakes
    var U = S.U;
    for (var i = 0; i < 6 && food.length < MAXFOOD; i++) food.push({ x: x + (rnd() - .5) * 26 * U, y: Math.max(y, 12) + (rnd() - .5) * 10, vy: (16 + rnd() * 10) * U, ph: rnd() * 6.3, c: FOODCOL[i % 3], rest: 0, dead: 0 });
    if (y < 50) ripples.push({ x: x, t: 0 });
    S.armedT = 12;
  }
  function setArmed(on) { S.armed = on ? 1 : 0; ui('armed', S.armed); }
  function clean() { if (S.cleanT > 0) return; S.cleanT = 2.4; food.length = 0; ui('cleaning', true); }
  function care(dt) {
    var i, p, U = S.U, t = S.t;
    S.wq -= (.012 + fish.length * .0004) * dt;   // fish waste: slow, steady
    for (i = 0; i < food.length; i++) {
      p = food[i];
      if (p.rest) { p.rest += dt; if (p.rest > 18) { p.dead = 1; S.wq -= .5; } }   // uneaten food fouls the water
      else { p.y += p.vy * dt; p.x += Math.sin(t * 2 + p.ph) * 6 * U * dt; var fl = sandTop(p.x) - 2 * U; if (p.y >= fl) { p.y = fl; p.rest = .01; } }
    }
    for (i = food.length - 1; i >= 0; i--) if (food[i].dead) food.splice(i, 1);
    if (S.cleanT > 0) {
      S.cleanT -= dt; S.wq += (100 - S.wq) * Math.min(1, dt * 2.2); var sx = -120 * U + (S.W + 240 * U) * (1 - Math.max(0, S.cleanT) / 2.4);
      for (i = 0; i < 2; i++) puffs.push({ x: sx + (rnd() - .5) * 90 * U, y: rnd() * S.floorY, r: (2 + rnd() * 4) * U, vy: (40 + rnd() * 60) * U, life: 1.3, ph: rnd() * 6.3 });
      if (S.cleanT <= 0) { S.wq = 100; ui('cleaning', false); }
    }
    S.wq = clamp(S.wq, 0, 100);
    for (i = puffs.length - 1; i >= 0; i--) { p = puffs[i]; p.y -= p.vy * dt; p.life -= dt; if (p.life <= 0 || p.y < 10) puffs.splice(i, 1); }
    for (i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 1) ripples.splice(i, 1); }
    if (S.armedT > 0 && (S.armedT -= dt) <= 0 && S.armed) setArmed(false);
  }
  function stats() { var m = 0, h = 0; fish.forEach(function (f) { m += f.mood; h += f.hunger; }); return { mood: m / fish.length, hunger: h / fish.length, wq: S.wq }; }
  function moodWord(f) { return f.hunger > 70 ? 'Very hungry' : f.hunger > 45 ? 'Hungry' : f.mood < .5 ? 'Uneasy' : f.mood > .8 ? 'Happy' : 'Content'; }

  // ---- save (AQ1b): localStorage 'aquarium.save', validated decode, corrupt saves ignored ----
  var KEY = 'aquarium.save', SAVE_VER = 1;
  function buildSave() { var h = {}; fish.forEach(function (f) { (h[f.sp.id] = h[f.sp.id] || []).push(Math.round(f.hunger * 10) / 10); }); return { v: SAVE_VER, saved: Date.now(), wq: Math.round(S.wq * 10) / 10, hunger: h }; }
  function decodeSave(d) {
    var num = function (v) { if (typeof v !== 'number' || !isFinite(v)) throw new Error('bad number'); return v; }, h = {};
    if (!d || typeof d !== 'object' || d.v !== SAVE_VER || !d.hunger || typeof d.hunger !== 'object') throw new Error('bad save');
    SP.forEach(function (sp) { var a = d.hunger[sp.id]; if (!Array.isArray(a) || a.length !== sp.n) throw new Error('bad fish'); h[sp.id] = a.map(function (v) { return clamp(num(v), 0, 100); }); });
    return { saved: num(d.saved), wq: clamp(num(d.wq), 0, 100), h: h };
  }
  function writeSave() { try { localStorage.setItem(KEY, JSON.stringify(buildSave())); return true; } catch (e) { return false; } }
  function loadSave(now) {
    var d, el, idx = {};
    try { var raw = localStorage.getItem(KEY); if (!raw) return false; d = decodeSave(JSON.parse(raw)); } catch (e) { return false; }
    el = clamp(((now || Date.now()) - d.saved) / 1000, 0, 14 * 86400);
    var dh = Math.min(30, el * .03), dw = Math.min(20, el * .006);   // gentle offline drift, capped so a long absence is never punishing
    var wq = S.wq = Math.max(d.wq - dw, Math.min(d.wq, 40));
    fish.forEach(function (f) { var i = idx[f.sp.id] = (idx[f.sp.id] || 0), h0 = d.h[f.sp.id][i]; idx[f.sp.id]++; f.hunger = Math.min(h0 + dh, Math.max(h0, 75)); f.mood = (100 - f.hunger) / 100 * .75 + wq / 100 * .25; });
    return true;
  }

  A.core = { rng: rng, clamp: clamp, sandTop: sandTop, respawn: respawn, resize: resize, update: update, setArmed: setArmed, drop: drop, clean: clean, stats: stats, moodWord: moodWord, save: writeSave, load: loadSave };
  // read-only hooks for tests (same shape as before AQQ1a)
  A.sim = { fish: fish, update: update, bounds: bounds, size: function () { return [S.W, S.H, S.floorY]; },
    care: { food: food, drop: drop, clean: clean, stats: stats, wq: function (v) { if (v !== undefined) S.wq = v; return S.wq; }, save: writeSave, load: loadSave, decode: decodeSave, key: KEY, cleaning: function () { return S.cleanT > 0; } } };
})();
