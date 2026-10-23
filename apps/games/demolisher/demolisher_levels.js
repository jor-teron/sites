/*
  File: demolisher_levels.js
  Project: Demolisher (DM1a)
  Purpose: Deterministic level generator for levels 01-100 (00 is the fixed Demo world, built in demolisher_logic.js).
           generateLevel(n) returns a plain description (tile grid, spawn, targets, enemies, ammo);
           demolisher_logic.js copies it into the live terrain and uses its own spawnTarget /
           spawnEnemy. Difficulty d = n / 100 (and k = 0.36 n for the count / material tiers) scales hills, stone, metal guards, lava, targets,
           enemies and tightens the ammo budget. Every candidate is validated and re-rolled
           (attempt index in the seed) until it passes. Pure: no DOM, no Matter.
*/
(function (root) {
  'use strict';
  const SEED = root.DemolisherSeed || require('./demolisher_seed.js');

  /* Same ids as MAT in demolisher_logic.js (the logic passes its own table in opts.MAT). */
  const MAT0 = { AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, WATER: 4, CRATE: 5, METAL: 6, LAVA: 7, TARGET: 8 };
  const HP0 = { 1: 30, 2: 30, 3: 80, 5: 20, 6: 250, 8: 40 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function defaults(opts) {
    const o = Object.assign({ gridW: 358, gridH: 100, MAT: MAT0, hp: HP0 }, opts || {});
    o.base = Math.floor(o.gridH * 0.45);            // nominal surface row (same as surfaceRow())
    o.sx = Math.floor(o.gridW * 0.12);              // player spawn column (same as Mission)
    return o;
  }

  function build(n, attempt, o) {
    const W = o.gridW, H = o.gridH, M = o.MAT, base = o.base, sx = o.sx, d = n / SEED.MAX_LEVEL, k = n * 0.36;     // k: tier scale, 0.36..36
    const rT = SEED.rngFor(n, 'terrain', attempt), rM = SEED.rngFor(n, 'material', attempt);
    const rG = SEED.rngFor(n, 'targets', attempt), rE = SEED.rngFor(n, 'enemies', attempt);
    const rH = SEED.rngFor(n, 'hazards', attempt);
    const tiles = new Uint8Array(W * H);
    const at = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? -1 : tiles[y * W + x]);
    const put = (x, y, m) => { if (x >= 0 && x < W && y >= 0 && y < H) tiles[y * W + x] = m; };
    const wl = base + 3;                            // valley water level (rows >= wl are below it)

    /* --- terrain: three sines, a flat spawn zone, flat plateaus for the targets --- */
    const waves = [];
    for (let i = 0; i < 3; i++) waves.push({ a: (1.5 + rT() * 2.5) * (0.6 + d * 1.2), f: 0.012 + rT() * 0.1, p: rT() * 6.283 });
    const top = new Int16Array(W), lock = new Uint8Array(W);
    for (let x = 0; x < W; x++) {
      let h = 0; for (const w of waves) h += Math.sin(x * w.f + w.p) * w.a;
      const dist = Math.max(0, Math.abs(x - sx) - 8), k = Math.min(1, dist / 14);
      top[x] = clamp(Math.round(base * (1 - k) + (base + Math.round(h)) * k), base - 12, base + 12);
      if (Math.abs(x - sx) <= 8) { top[x] = base; lock[x] = 1; }
    }
    const T = 1 + Math.floor(k / 6), targets = [];
    for (let i = 0; i < T; i++) {
      const lo = W * 0.30, span = W * 0.60 / T;
      const cx = Math.round(lo + span * (i + 0.5) + (rG() - 0.5) * span * 0.2);
      const h = Math.min(top[cx], base + 2);
      for (let x = cx - 4; x <= cx + 4; x++) { top[x] = h; lock[x] = 1; }
      targets.push({ gx: cx, gy: h - 2 });
    }
    for (let it = 0; it < 3; it++) {
      for (let x = 1; x < W; x++) if (!lock[x]) top[x] = clamp(top[x], top[x - 1] - 1, top[x - 1] + 1);
      for (let x = W - 2; x >= 0; x--) if (!lock[x]) top[x] = clamp(top[x], top[x + 1] - 1, top[x + 1] + 1);
    }

    /* --- strata: grass, dirt, stone pockets (more with difficulty), deep metal pockets --- */
    const stoneP = 0.03 + d * 0.05;
    for (let x = 0; x < W; x++) for (let y = top[x]; y < H; y++) {
      let m = y === top[x] ? M.GRASS : M.DIRT;
      if (y > top[x] + 4 && rM() < stoneP) m = M.STONE;
      put(x, y, m);
    }
    const ellipse = (cx, cy, rx, ry, from, to, ok) => {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1 && at(x, y) === from && ok(x, y)) put(x, y, to);
      }
    };
    for (let i = 0, c = 5 + Math.round(d * 20); i < c; i++) {
      const x = Math.floor(rM() * W);
      ellipse(x, top[x] + 4 + rM() * 20, 2 + rM() * 4, 1.5 + rM() * 3, M.DIRT, M.STONE, () => true);
    }
    for (let i = 0, c = 2 + Math.round(d * 9); i < c; i++) {
      const x = Math.floor(rM() * W), r = 1.5 + rM() * 2;
      ellipse(x, top[x] + 12 + rM() * 20, r, r, M.DIRT, M.METAL, (px, py) => py > top[px] + 9);
    }

    /* --- hazards: valley water, lava pits (4+ levels: 1, 13+: 2, 22+: 3) --- */
    for (let x = 0; x < W; x++) for (let y = wl; y < top[x]; y++) put(x, y, M.WATER);
    const near = (x, list, r) => list.some((v) => Math.abs(x - v) <= r);
    const pits = [], pitCount = k < 4 ? 0 : 1 + Math.floor((k - 4) / 9), plat = targets.map((t) => t.gx);
    for (let i = 0; i < pitCount; i++) {
      const w = 4 + Math.floor(rH() * 3) + Math.floor(d * 3);
      for (let tries = 0; tries < 30; tries++) {
        const x0 = Math.floor(W * 0.28 + rH() * (W * 0.67 - w));
        const mid = x0 + w / 2;
        if (near(mid, plat, 9 + w / 2) || near(mid, pits, 12 + w)) continue;
        for (let x = x0; x < x0 + w; x++) for (let y = top[x]; y < top[x] + 3; y++) put(x, y, M.LAVA);
        pits.push(Math.round(mid));
        break;
      }
    }

    /* --- surface dressing: crate stacks (2x3), stone pillars --- */
    const free = (x, r) => !near(x, plat, 10) && !near(x, pits, r + 6) && Math.abs(x - sx) > 14 && top[x] <= wl && top[x + 1] <= wl;
    for (let i = 0, c = 3 + Math.round(d * 8); i < c; i++) {
      const x = Math.floor(W * 0.15 + rM() * W * 0.8);
      if (!free(x, 2)) continue;
      const m = Math.min(top[x], top[x + 1]);
      for (const cx of [x, x + 1]) for (let y = m - 3; y < top[cx]; y++) if (at(cx, y) === M.AIR) put(cx, y, M.CRATE);
    }
    for (let i = 0, c = k < 3 ? 0 : 1 + Math.floor(d * 4); i < c; i++) {
      const x = Math.floor(W * 0.20 + rM() * W * 0.75), h = 4 + Math.floor(rM() * 4);
      if (!free(x, 2)) continue;
      for (const cx of [x, x + 1]) for (let y = Math.min(top[x], top[x + 1]) - h; y < top[cx]; y++) put(cx, y, M.STONE);
    }

    /* --- targets: 3x3 marker on a plateau, guard walls (3+) and a roof (8+) that tighten with n --- */
    const guardM = k < 6 ? M.CRATE : k < 12 ? M.STONE : M.METAL;
    const thick = k < 20 ? 1 : 2, gh = 4 + Math.floor(d * 2), roofM = k < 16 ? M.CRATE : M.STONE;
    for (const t of targets) {
      const cx = t.gx, h = top[cx];
      for (let y = h - 8; y < h; y++) for (let x = cx - 4; x <= cx + 4; x++) put(x, y, M.AIR);
      if (k >= 3) for (let j = 0; j < thick; j++) for (let y = h - gh; y < h; y++) { put(cx - 2 - j, y, guardM); put(cx + 2 + j, y, guardM); }
      for (let y = h - 3; y < h; y++) for (let x = cx - 1; x <= cx + 1; x++) put(x, y, M.TARGET);
      if (k >= 8) for (let r = 0, rows = k >= 24 ? 2 : 1; r < rows; r++) for (let x = cx - 1; x <= cx + 1; x++) put(x, h - 4 - r, roofM);
    }

    /* --- enemies: walkers beyond alert range of the spawn, on clear ground, away from lava --- */
    const enemies = [], E = 1 + Math.floor(k / 3), hp = 40 + Math.round(d * 40);
    for (let i = 0; i < E; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = Math.floor(W * 0.30 + rE() * W * 0.66);
        if (near(x, plat, 5) || near(x, pits, 9) || near(x, enemies.map((e) => e.gx), 6) || top[x] > wl) continue;
        let clear = true;
        for (let y = top[x] - 4; y < top[x]; y++) if (at(x, y) !== M.AIR) clear = false;
        if (!clear) continue;
        enemies.push({ gx: x, gy: top[x] - 3, hp });
        break;
      }
    }

    const ammo = { rocket: 6 + 2 * T - Math.floor(d * 4), grenade: 3 + T - Math.floor(d * 2), laser: 60 - Math.floor(d * 20) };
    return { n, gridW: W, gridH: H, tiles, top, base, wl, spawn: { gx: sx, gy: base - 4 }, targets, enemies, ammo, pits };
  }

  /* Returns a list of problems (empty = playable). */
  function validate(lv, o) {
    const W = lv.gridW, H = lv.gridH, M = o.MAT, base = o.base, sx = o.sx, top = lv.top, er = [];
    const at = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? -1 : lv.tiles[y * W + x]);
    const fluid = (m) => m === M.WATER || m === M.LAVA;
    if (lv.tiles.length !== W * H) er.push('grid size');
    for (let x = 0; x < W; x++) {
      if (top[x] < base - 14 || top[x] > base + 14) er.push('surface out of range at ' + x);
      if (x && Math.abs(top[x] - top[x - 1]) > 1) er.push('steep step at ' + x);
    }
    for (let x = sx - 8; x <= sx + 8; x++) {            // spawn area is safe: flat, open, no water / lava
      if (top[x] !== base) er.push('spawn not flat');
      for (let y = base - 8; y <= base + 2; y++) {
        if (fluid(at(x, y))) er.push('fluid at spawn');
        if (y < base && at(x, y) !== M.AIR) er.push('spawn blocked');
      }
    }
    if (lv.targets.length !== 1 + Math.floor(lv.n * 0.36 / 6)) er.push('target count');
    lv.targets.forEach((t, i) => {
      const cx = t.gx, h = top[cx];
      if (cx < 12 || cx > W - 14 || t.gy < 4 || t.gy >= H) er.push('target outside world');
      if (i && cx - lv.targets[i - 1].gx < 20) er.push('targets too close');
      for (let x = cx - 4; x <= cx + 4; x++) if (top[x] !== h) er.push('plateau not flat');
      for (let y = h - 3; y < h; y++) for (let x = cx - 1; x <= cx + 1; x++) if (at(x, y) !== M.TARGET) er.push('target tile missing');
      for (let y = h - 8; y <= h + 2; y++) for (let x = cx - 5; x <= cx + 5; x++) if (fluid(at(x, y))) er.push('fluid at target');
      let cost = 0;                                       // reachable from above: no metal, little rock
      for (let y = h - 4; y >= 0; y--) { const m = at(cx, y); if (m === M.AIR) continue; if (m === M.METAL) er.push('target roofed by metal'); cost += o.hp[m] || 0; }
      if (cost > 240) er.push('target cover too thick');
      let run = 0, worst = 0;                             // the way east is jumpable (lava runs <= 10 columns)
      for (let x = sx; x <= cx; x++) { run = at(x, top[x]) === M.LAVA ? run + 1 : 0; worst = Math.max(worst, run); }
      if (worst > 10) er.push('lava run too wide');
    });
    if (lv.enemies.length !== 1 + Math.floor(lv.n * 0.36 / 3)) er.push('enemy count');
    lv.enemies.forEach((e, i) => {
      if (e.gx - sx < 30 || e.gx > W - 4 || e.gy < 4 || e.gy >= H) er.push('enemy outside / too close to spawn');
      if (at(e.gx, top[e.gx]) <= 0 || fluid(at(e.gx, top[e.gx]))) er.push('enemy not on ground');
      for (let y = top[e.gx] - 4; y < top[e.gx]; y++) if (at(e.gx, y) !== M.AIR) er.push('enemy inside terrain');
      for (let x = e.gx - 2; x <= e.gx + 2; x++) if (at(x, top[x]) === M.LAVA) er.push('enemy beside lava');
      if (i && lv.enemies.slice(0, i).some((p) => Math.abs(p.gx - e.gx) < 6)) er.push('enemies overlap');
    });
    if (lv.pits.length !== (lv.n * 0.36 < 4 ? 0 : 1 + Math.floor((lv.n * 0.36 - 4) / 9))) er.push('lava pit count');
    const T = lv.targets.length;
    if (lv.ammo.rocket < T + 2 || lv.ammo.rocket + lv.ammo.grenade < 2 * T + 2) er.push('ammo budget too small');
    return er;
  }

  function generateLevel(n, opts) {
    if (!Number.isInteger(n) || n < 1 || n > SEED.MAX_LEVEL) throw new RangeError('level ' + n + ' is not generated (1-' + SEED.MAX_LEVEL + ')');
    const o = defaults(opts);
    let lv = null, errs = [];
    for (let attempt = 0; attempt < 60; attempt++) {
      lv = build(n, attempt, o);
      errs = validate(lv, o);
      if (!errs.length) { lv.attempt = attempt; lv.errors = []; return lv; }
    }
    lv.attempt = 60; lv.errors = errs;
    return lv;
  }

  const api = { generateLevel, validateLevel: (lv, opts) => validate(lv, defaults(opts)) };
  root.DemolisherLevels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
