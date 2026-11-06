/* ============================================================
 * File:        core/levels.js
 * Project:     Osmos OSM1b
 * Purpose:     Seeded levels 00–39. No AI.
 *              00–19 identical to OSM1a; 20–39 add field props.
 * Depends on:  OSMOS_CONFIG, OsmosRng
 * ============================================================ */
var OSMOS_LEVELS = (function () {
  var C = OSMOS_CONFIG;
  var W = C.world.w, H = C.world.h;

  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function labelOf(i) { return (i < 10 ? '0' : '') + i; }

  /* OSM1a builder — prog locked to /19 so raising C.levels does not rewrite 00–19 */
  function buildClassic(levelIndex) {
    var seed = 0x05A1A000 + levelIndex * 9973;
    var rng = new OsmosRng(seed);
    var prog = levelIndex / 19;
    var target = Math.round(48 + prog * 110 + levelIndex * 2.2);
    var foodCount = 18 + Math.floor(prog * 22) + (levelIndex % 3);
    var bigCount = 2 + Math.floor(prog * 5);
    var theme = C.themes[levelIndex % 3];

    var cells = [];
    var px = W * 0.5, py = H * 0.5;
    cells.push({
      id: 0, kind: 'player', x: px, y: py, vx: 0, vy: 0,
      mass: C.player.startMass, alive: true
    });

    var patch = 7 + Math.floor(prog * 4);
    var i, a, d;
    for (i = 0; i < patch; i++) {
      a = rng.range(0, Math.PI * 2);
      d = rng.range(36, 90);
      cells.push({
        id: cells.length, kind: 'food',
        x: px + Math.cos(a) * d, y: py + Math.sin(a) * d,
        vx: rng.range(-4, 4), vy: rng.range(-4, 4),
        mass: rng.range(3.2, 7.5), alive: true
      });
    }

    var f, fx, fy;
    for (f = 0; f < foodCount; f++) {
      fx = rng.range(40, W - 40); fy = rng.range(40, H - 40);
      if (dist(fx, fy, px, py) < 110) continue;
      cells.push({
        id: cells.length, kind: 'food',
        x: fx, y: fy,
        vx: rng.range(-6, 6) * (0.35 + prog * 0.4),
        vy: rng.range(-6, 6) * (0.35 + prog * 0.4),
        mass: rng.range(2.8, 9 + prog * 3), alive: true
      });
    }

    var b, bx, by;
    for (b = 0; b < bigCount; b++) {
      bx = rng.range(60, W - 60); by = rng.range(60, H - 60);
      if (dist(bx, by, px, py) < 150) { bx = (bx + W * 0.35) % W; }
      cells.push({
        id: cells.length, kind: 'big',
        x: bx, y: by,
        vx: rng.range(-3, 3), vy: rng.range(-3, 3),
        mass: rng.range(C.player.startMass * 1.15, C.player.startMass * (1.6 + prog * 1.4)),
        alive: true
      });
    }

    return {
      index: levelIndex, label: labelOf(levelIndex), seed: seed,
      targetMass: target, theme: theme, cells: cells,
      wells: [], currents: [], membranes: [], band: 'classic'
    };
  }

  function baseAdvanced(levelIndex, band) {
    var seed = 0x05B1B000 + levelIndex * 7919;
    var rng = new OsmosRng(seed);
    var local = (levelIndex - 20) / 19;
    var target = Math.round(70 + local * 90 + (levelIndex - 20) * 1.8);
    var theme = C.themes[levelIndex % C.themes.length];
    var px = W * 0.28 + rng.range(0, 40), py = H * 0.5 + rng.range(-30, 30);
    var cells = [];
    cells.push({
      id: 0, kind: 'player', x: px, y: py, vx: 0, vy: 0,
      mass: C.player.startMass, alive: true
    });

    var patch = 8 + Math.floor(local * 3);
    var i, a, d;
    for (i = 0; i < patch; i++) {
      a = rng.range(0, Math.PI * 2);
      d = rng.range(30, 85);
      cells.push({
        id: cells.length, kind: 'food',
        x: px + Math.cos(a) * d, y: py + Math.sin(a) * d,
        vx: rng.range(-3, 3), vy: rng.range(-3, 3),
        mass: rng.range(3.5, 8), alive: true
      });
    }

    var foodCount = 20 + Math.floor(local * 16);
    var f, fx, fy;
    for (f = 0; f < foodCount; f++) {
      fx = rng.range(50, W - 50); fy = rng.range(50, H - 50);
      if (dist(fx, fy, px, py) < 100) continue;
      cells.push({
        id: cells.length, kind: 'food',
        x: fx, y: fy,
        vx: rng.range(-5, 5), vy: rng.range(-5, 5),
        mass: rng.range(3, 10), alive: true
      });
    }

    var bigCount = 2 + Math.floor(local * 3);
    var b, bx, by;
    for (b = 0; b < bigCount; b++) {
      bx = rng.range(80, W - 80); by = rng.range(80, H - 80);
      if (dist(bx, by, px, py) < 160) continue;
      cells.push({
        id: cells.length, kind: 'big',
        x: bx, y: by,
        vx: rng.range(-2.5, 2.5), vy: rng.range(-2.5, 2.5),
        mass: rng.range(C.player.startMass * 1.2, C.player.startMass * 2.4),
        alive: true
      });
    }

    return {
      index: levelIndex, label: labelOf(levelIndex), seed: seed, rng: rng,
      targetMass: target, theme: theme, cells: cells,
      wells: [], currents: [], membranes: [], band: band, startX: px, startY: py
    };
  }

  function buildWells(levelIndex) {
    var L = baseAdvanced(levelIndex, 'wells');
    var rng = L.rng;
    var n = 1 + Math.floor((levelIndex - 20) / 3);
    var k, wx, wy, r;
    for (k = 0; k < n; k++) {
      wx = rng.range(W * 0.45, W * 0.88);
      wy = rng.range(H * 0.18, H * 0.82);
      if (dist(wx, wy, L.startX, L.startY) < 140) wy = (wy + H * 0.4) % H;
      r = rng.range(90, 140);
      L.wells.push({
        x: wx, y: wy, r: r, core: r * 0.22,
        pull: C.wells.pull * (0.75 + (levelIndex - 20) * 0.04)
      });
    }
    delete L.rng; delete L.startX; delete L.startY;
    return L;
  }

  function buildCurrents(levelIndex) {
    var L = baseAdvanced(levelIndex, 'currents');
    var rng = L.rng;
    var n = 1 + Math.floor((levelIndex - 28) / 2);
    var k, ang, spd, cx, cy, hw, hh;
    for (k = 0; k < n; k++) {
      ang = (k % 2 === 0) ? 0 : Math.PI / 2;
      if (rng.next() > 0.55) ang += rng.range(-0.35, 0.35);
      spd = C.currents.speed * (0.7 + (levelIndex - 28) * 0.06);
      cx = rng.range(W * 0.35, W * 0.75);
      cy = rng.range(H * 0.25, H * 0.75);
      hw = (ang % Math.PI < 0.8) ? rng.range(160, 260) : rng.range(70, 110);
      hh = (ang % Math.PI < 0.8) ? rng.range(50, 90) : rng.range(140, 220);
      L.currents.push({
        x: cx, y: cy, hw: hw, hh: hh,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd
      });
    }
    /* keep start clear of strong bands when possible */
    delete L.rng; delete L.startX; delete L.startY;
    return L;
  }

  function buildMembranes(levelIndex) {
    var L = baseAdvanced(levelIndex, 'membranes');
    var rng = L.rng;
    var n = 2 + Math.floor((levelIndex - 34) / 2);
    var k, x1, y1, x2, y2;
    for (k = 0; k < n; k++) {
      if (k % 2 === 0) {
        x1 = rng.range(W * 0.4, W * 0.7);
        y1 = rng.range(40, H * 0.35);
        x2 = x1 + rng.range(-40, 40);
        y2 = rng.range(H * 0.65, H - 40);
      } else {
        y1 = rng.range(H * 0.3, H * 0.7);
        x1 = rng.range(W * 0.35, W * 0.55);
        x2 = rng.range(W * 0.7, W - 50);
        y2 = y1 + rng.range(-50, 50);
      }
      /* nudge away from start so a path remains */
      if (dist(x1, y1, L.startX, L.startY) < 90) x1 += 120;
      L.membranes.push({ x1: x1, y1: y1, x2: x2, y2: y2 });
    }
    /* a few clearly larger marked hazard cells (passive) */
    var h, hx, hy;
    for (h = 0; h < 2; h++) {
      hx = rng.range(W * 0.5, W - 70);
      hy = rng.range(70, H - 70);
      if (dist(hx, hy, L.startX, L.startY) < 150) continue;
      L.cells.push({
        id: L.cells.length, kind: 'hazard',
        x: hx, y: hy, vx: rng.range(-1.5, 1.5), vy: rng.range(-1.5, 1.5),
        mass: C.player.startMass * (1.8 + h * 0.4), alive: true
      });
    }
    delete L.rng; delete L.startX; delete L.startY;
    return L;
  }

  function build(levelIndex) {
    levelIndex = levelIndex | 0;
    if (levelIndex < 0) levelIndex = 0;
    if (levelIndex >= C.levels) levelIndex = C.levels - 1;
    if (levelIndex < C.classicLevels) return buildClassic(levelIndex);
    if (levelIndex <= 27) return buildWells(levelIndex);
    if (levelIndex <= 33) return buildCurrents(levelIndex);
    return buildMembranes(levelIndex);
  }

  function all() {
    var out = [], i;
    for (i = 0; i < C.levels; i++) out.push(build(i));
    return out;
  }

  return { build: build, all: all };
})();
