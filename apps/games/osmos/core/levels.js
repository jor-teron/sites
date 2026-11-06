/* ============================================================
 * File:        core/levels.js
 * Project:     Osmos OSM1a
 * Purpose:     Build 20 seeded calm levels (00–19). No AI.
 * Depends on:  OSMOS_CONFIG, OsmosRng
 * ============================================================ */
var OSMOS_LEVELS = (function () {
  var C = OSMOS_CONFIG;
  var W = C.world.w, H = C.world.h;

  function build(levelIndex) {
    var seed = 0x05A1A000 + levelIndex * 9973;
    var rng = new OsmosRng(seed);
    var prog = levelIndex / (C.levels - 1);
    var target = Math.round(48 + prog * 110 + levelIndex * 2.2);
    var foodCount = 18 + Math.floor(prog * 22) + (levelIndex % 3);
    var bigCount = 2 + Math.floor(prog * 5);
    var theme = C.themes[levelIndex % C.themes.length];

    var cells = [];
    var px = W * 0.5, py = H * 0.5;
    cells.push({
      id: 0, kind: 'player', x: px, y: py, vx: 0, vy: 0,
      mass: C.player.startMass, alive: true
    });

    /* Nourishing starter patch near the player */
    var patch = 7 + Math.floor(prog * 4);
    for (var i = 0; i < patch; i++) {
      var a = rng.range(0, Math.PI * 2);
      var d = rng.range(36, 90);
      cells.push({
        id: cells.length, kind: 'food',
        x: px + Math.cos(a) * d, y: py + Math.sin(a) * d,
        vx: rng.range(-4, 4), vy: rng.range(-4, 4),
        mass: rng.range(3.2, 7.5), alive: true
      });
    }

    for (var f = 0; f < foodCount; f++) {
      var fx = rng.range(40, W - 40), fy = rng.range(40, H - 40);
      if (dist(fx, fy, px, py) < 110) continue;
      cells.push({
        id: cells.length, kind: 'food',
        x: fx, y: fy,
        vx: rng.range(-6, 6) * (0.35 + prog * 0.4),
        vy: rng.range(-6, 6) * (0.35 + prog * 0.4),
        mass: rng.range(2.8, 9 + prog * 3), alive: true
      });
    }

    for (var b = 0; b < bigCount; b++) {
      var bx = rng.range(60, W - 60), by = rng.range(60, H - 60);
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
      index: levelIndex,
      label: (levelIndex < 10 ? '0' : '') + levelIndex,
      seed: seed,
      targetMass: target,
      theme: theme,
      cells: cells
    };
  }

  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function all() {
    var out = [];
    for (var i = 0; i < C.levels; i++) out.push(build(i));
    return out;
  }

  return { build: build, all: all };
})();
