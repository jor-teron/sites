/*
  File: core/mapgen.js
  Project: tower-defence
  Purpose: Seeded map generator. The map number (1-99) is the seed, so a map
           is identical on every device. Map 00 is hand-made (assets/maps/map00.js).
           Pure logic: no DOM, no game state, safe to run in tests.

  How a map is made:
    1. Pick a spawn edge (left, right or bottom; the top row is under the HUD).
    2. Walk straight runs with right-angle turns. A new tile may not touch
       (even diagonally) any earlier part of the road, so parallel roads
       always keep at least one grass tile between them.
    3. Once long enough, finish on a different edge.
    4. Validate (length, buildable grass, no useless pockets).
       If anything fails, retry with the next sub-seed.
  Difficulty grows with the number: shorter roads, longer straights.
*/

import { COLS, ROWS } from './config.js';

/* Hard limits every generated map must pass. */
export const RULES = {
  minLen: 35,         /* road tiles */
  maxLen: 70,
  minBuildable: 0.40, /* share of the board that stays grass */
  towerReach: 3,      /* tiles; grass farther than this from the road is useless */
  minUseful: 0.80,    /* share of grass that must be within towerReach */
  maxTries: 2000      /* sub-seeds tried before giving up */
};

/* Small fast deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Unit steps: right, down, left, up. */
const DIRS = [{ dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 0, dr: -1 }];

/* Which board edge a tile sits on, or null. Row 0 never counts (HUD row). */
function edgeOf(c, r) {
  if (c === 0) return 'L';
  if (c === COLS - 1) return 'R';
  if (r === ROWS - 1) return 'B';
  return null;
}

/* Interior tiles a road may wander through (1 tile margin, rows 2+ for the HUD). */
function inInterior(c, r) {
  return c >= 1 && c <= COLS - 2 && r >= 2 && r <= ROWS - 2;
}

/*
  Difficulty knobs for map n (1-99). t runs 0 (easy) to 1 (hard).
  Easy maps: long winding road, short straights.
  Hard maps: short road, long straights (less time under fire).
*/
export function difficulty(n) {
  const t = Math.max(0, Math.min(1, (n - 1) / 98));
  return {
    t,
    targetMin: Math.round(52 - 17 * t),   /* 52 -> 35 */
    targetMax: Math.round(70 - 18 * t),   /* 70 -> 52 */
    runMin: 2 + Math.round(t * 2),        /* 2 -> 4 */
    runMax: 4 + Math.round(t * 5)         /* 4 -> 9 */
  };
}

/*
  One attempt at a walk. Returns an ordered list of tiles {c, r} or null.
  grid[r][c] holds the tile's index in the walk, or -1.
*/
function walk(rand, knobs) {
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(-1));
  const cells = [];

  /* Spawn tile on the left, right or bottom edge, facing inward. */
  const edge = ['L', 'R', 'B'][Math.floor(rand() * 3)];
  let c, r, dir;
  if (edge === 'L') { c = 0; r = 2 + Math.floor(rand() * (ROWS - 3)); dir = 0; }
  else if (edge === 'R') { c = COLS - 1; r = 2 + Math.floor(rand() * (ROWS - 3)); dir = 2; }
  else { c = 1 + Math.floor(rand() * (COLS - 2)); r = ROWS - 1; dir = 3; }
  const place = (pc, pr) => { grid[pr][pc] = cells.length; cells.push({ c: pc, r: pr }); };
  place(c, r);

  /*
    A tile is legal if it is free and none of its 8 neighbours belong to the
    road, except the last two tiles placed (the tile we step from, and the
    diagonal one when we just turned).
  */
  const legal = (nc, nr, exitOk) => {
    if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) return false;
    if (grid[nr][nc] !== -1) return false;
    if (!inInterior(nc, nr)) {
      const e = edgeOf(nc, nr);
      if (!exitOk || !e || e === edge) return false;
    }
    const recent = cells.length - 2;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const ac = nc + dc, ar = nr + dr;
        if (ac < 0 || ar < 0 || ac >= COLS || ar >= ROWS) continue;
        const idx = grid[ar][ac];
        if (idx !== -1 && idx < recent) return false;
      }
    }
    return true;
  };

  /* First tile inward so the spawn never hugs the edge. */
  if (!legal(c + DIRS[dir].dc, r + DIRS[dir].dr, false)) return null;
  c += DIRS[dir].dc; r += DIRS[dir].dr; place(c, r);

  let runLeft = knobs.runMin + Math.floor(rand() * (knobs.runMax - knobs.runMin + 1)) - 1;
  for (let guard = 0; guard < 400; guard++) {
    const longEnough = cells.length >= knobs.targetMin;
    if (cells.length > knobs.targetMax) return null;

    /* Exit check: once long enough, take any straight line to a new edge. */
    if (longEnough) {
      for (let d = 0; d < 4; d++) {
        let tc = c, tr = r, ok = true, path = [];
        while (true) {
          tc += DIRS[d].dc; tr += DIRS[d].dr;
          const exit = !inInterior(tc, tr);
          if (!legalAfter(path, tc, tr, exit)) { ok = false; break; }
          path.push({ c: tc, r: tr });
          if (exit) break;
        }
        if (ok && path.length <= 9 && cells.length + path.length <= RULES.maxLen) {
          for (const p of path) place(p.c, p.r);
          return cells;
        }
      }
    }

    /* Keep going straight while the run lasts, else turn left or right. */
    let options;
    if (runLeft > 0) options = [dir, (dir + 1) % 4, (dir + 3) % 4];
    else options = rand() < 0.5 ? [(dir + 1) % 4, (dir + 3) % 4, dir] : [(dir + 3) % 4, (dir + 1) % 4, dir];
    let moved = false;
    for (const nd of options) {
      const nc = c + DIRS[nd].dc, nr = r + DIRS[nd].dr;
      if (!legal(nc, nr, false)) continue;
      if (nd !== dir) runLeft = knobs.runMin + Math.floor(rand() * (knobs.runMax - knobs.runMin + 1));
      dir = nd; c = nc; r = nr; place(c, r); runLeft--; moved = true;
      break;
    }
    if (!moved) return null;
  }
  return null;

  /* legal() for a straight probe that has not been placed yet. */
  function legalAfter(pending, nc, nr, exitOk) {
    for (const p of pending) place(p.c, p.r);
    const ok = legal(nc, nr, exitOk);
    for (let i = 0; i < pending.length; i++) {
      const p = cells.pop();
      grid[p.r][p.c] = -1;
    }
    return ok;
  }
}

/* Collapse a tile list into corner waypoints (what path.js expects). */
export function toWaypoints(cells) {
  const pts = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const a = cells[i - 1], b = cells[i], n = cells[i + 1];
    if ((b.c - a.c) !== (n.c - b.c) || (b.r - a.r) !== (n.r - b.r)) pts.push(b);
  }
  pts.push(cells[cells.length - 1]);
  return pts.map(p => ({ c: p.c, r: p.r }));
}

/* Expand waypoints back to every tile on the road (used by checks and previews). */
export function toCells(points) {
  const out = [{ c: points[0].c, r: points[0].r }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const sc = Math.sign(b.c - a.c), sr = Math.sign(b.r - a.r);
    let c = a.c, r = a.r;
    while (c !== b.c || r !== b.r) { c += sc; r += sr; out.push({ c, r }); }
  }
  return out;
}

/*
  Check a road (tile list). Returns { ok, reason, len, buildable, useful }.
  Also used by the test script for map 00 and every generated map.
*/
export function validate(cells) {
  const road = new Set(cells.map(p => p.r * COLS + p.c));
  const len = cells.length;
  if (road.size !== len) return { ok: false, reason: 'crosses itself', len };
  for (let i = 1; i < len; i++) {
    if (Math.abs(cells[i].c - cells[i - 1].c) + Math.abs(cells[i].r - cells[i - 1].r) !== 1) {
      return { ok: false, reason: 'not orthogonal', len };
    }
  }
  /* No touching: tiles 3+ steps apart along the road may not be 4-neighbours. */
  const index = new Map(cells.map((p, i) => [p.r * COLS + p.c, i]));
  for (let i = 0; i < len; i++) {
    const p = cells[i];
    for (const d of DIRS) {
      const j = index.get((p.r + d.dr) * COLS + p.c + d.dc);
      if (j !== undefined && Math.abs(j - i) > 1 && p.c + d.dc >= 0 && p.c + d.dc < COLS) {
        return { ok: false, reason: 'touches itself', len };
      }
    }
  }
  const total = COLS * ROWS;
  const grass = total - len;
  const buildable = grass / total;
  /* Useful grass = within tower reach of some road tile. */
  let near = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (road.has(r * COLS + c)) continue;
      const hit = cells.some(p => Math.max(Math.abs(p.c - c), Math.abs(p.r - r)) <= RULES.towerReach);
      if (hit) near++;
    }
  }
  const useful = near / grass;
  let reason = '';
  if (len < RULES.minLen || len > RULES.maxLen) reason = 'length ' + len;
  else if (buildable < RULES.minBuildable) reason = 'too little grass';
  else if (useful < RULES.minUseful) reason = 'useless pockets';
  return { ok: !reason, reason, len, buildable, useful };
}

/* Cache: generation is cheap, but previews ask for all 100 at once. */
const cache = new Map();

/*
  Generate map n (1-99). Returns { id, points, cells, subSeed }.
  Deterministic: same n gives the same map everywhere.
*/
export function generateMap(n) {
  if (cache.has(n)) return cache.get(n);
  const knobs = difficulty(n);
  for (let sub = 0; sub < RULES.maxTries; sub++) {
    const rand = rng(n * 7919 + sub * 104729 + 1);
    const cells = walk(rand, knobs);
    if (!cells) continue;
    if (!validate(cells).ok) continue;
    const map = { id: n, points: toWaypoints(cells), cells, subSeed: sub };
    cache.set(n, map);
    return map;
  }
  return null; /* caller falls back to map 00 */
}
