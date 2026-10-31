// Sling Birds SB1a: procedural levels 00-50 (replaces the ten hand-built levels).
// generateLevel(n) is a pure function of the number n: same n -> identical level, every time.
// 00 is a fixed demo showcase; 01-50 grow with n (taller towers, tougher materials, more pigs, platforms).
// Every candidate is checked by validateLevel(); a failing candidate is re-rolled with the next attempt seed.
import { WORLD_WIDTH, GROUND_Y, SLING_X, SLING_Y, MAX_PULL, LAUNCH_POWER, GRAVITY, BIRD_FRICTION_AIR, STEP_MS } from './config.js';
import { settleProblems } from './stability.js';
import { rngFor, MAX_LEVEL, LEVEL_COUNT, pad2, isLevelNumber } from './seed.js';

export { MAX_LEVEL, LEVEL_COUNT, pad2, isLevelNumber };

const BX0 = 560, BX1 = 1090;          // build zone (x): inside the slingshot's reach, inside the world
const TOP_MIN = 60;                    // nothing above this y
const BIRD_R = 18;
const CLEAR = 8;                       // a shot is 'clear' if it passes this far from rock/stone (a bird is 18 but squeezes and smashes)
const r1 = (v) => Math.round(v * 10) / 10;
const ri = (R, a, b) => a + Math.floor(R() * (b - a + 1));   // inclusive integer
const pickOf = (R, arr) => arr[Math.floor(R() * arr.length)];

// ---------- BUILDING BLOCKS ----------
// A block is placed by its bottom edge and rests 0.5px above what is below it. Returns its top edge.
function blk(L, x, bottom, w, h, material) {
  const y = bottom - h / 2 - 0.5;
  L.blocks.push({ x: r1(x), y: r1(y), w, h, material });
  return y - h / 2;
}
function ball(L, x, bottom, r, material) {
  const y = bottom - r - 0.5;
  L.blocks.push({ x: r1(x), y: r1(y), r, material });
  return y - r;
}
const pigAt = (L, x, surface, r) => { L.pigs.push({ x: r1(x), y: r1(surface - r - 1), r }); };

// Material by difficulty: glass dominates early, stone late. role 'low' favours stone, 'high' favours glass.
function pickMat(L, role) {
  const d = L.n / MAX_LEVEL;
  let g = 0.70 * (1 - d) + 0.05, w = 0.60, s = 0.04 + 0.80 * d;
  if (role === 'low') { s *= 1.4; g *= 0.6; } else if (role === 'high') { g *= 1.4; s *= 0.6; }
  const x = L.MR() * (g + w + s);
  return x < g ? 'glass' : x < g + w ? 'wood' : 'stone';
}
const notStone = (m) => (m === 'stone' ? 'wood' : m);

// Tower: `floors` storeys of two posts and a slab; pigs sit inside storeys and on top.
// W = outer width. opts.posts / opts.slab force a material; opts.pigs: chance (0-1) of a pig per storey.
function tower(L, x0, base, floors, W, opts = {}) {
  const R = L.R, PR = L.PR;
  let b = base;
  const pw = opts.pw || Math.max(pickOf(R, [16, 18, 20, 24]), 14 + 6 * (floors - 1));   // taller towers get stouter posts (less creep)
  const inner = W - 2 * pw;
  for (let f = 0; f < floors; f++) {
    const fh = opts.fh || 60 + 10 * ri(R, 0, 4);
    const sh = ri(R, 14, 20);
    const pm = opts.posts || pickMat(L, f === 0 ? 'low' : 'high');
    const sm = opts.slab || notStone(pickMat(L, f === floors - 1 ? 'high' : 'low'));
    const top = blk(L, x0 + pw / 2, b, pw, fh, pm);
    blk(L, x0 + W - pw / 2, b, pw, fh, pm);
    const floorSurface = b;
    b = blk(L, x0 + W / 2, top, W, sh, sm);
    const r = Math.min(Math.floor(inner / 2) - 3, Math.floor(fh / 2) - 3, 22);
    if (r >= 12 && PR() < (opts.pigs === undefined ? 0.35 + 0.5 * (L.n / MAX_LEVEL) : opts.pigs)) pigAt(L, x0 + W / 2, floorSurface, ri(PR, 12, r));
  }
  if (opts.topPig !== false && PR() < (opts.topPig === true ? 1 : 0.6)) {
    const r = ri(PR, 14, 20), room = W / 2 - r - 4;
    pigAt(L, x0 + W / 2 + (room > 4 ? (PR() * 2 - 1) * room * 0.6 : 0), b, r);
  }
  if (opts.boulder && W >= 90) ball(L, x0 + W / 2, b, ri(R, 14, 18), 'stone');
  return { w: W, top: b };
}

// Bridge: two pillars and a long plank; pigs on the plank and (sometimes) one underneath.
function bridge(L, x0, base, span) {
  const R = L.R, PR = L.PR;
  const pw = ri(R, 26, 34), ph = 70 + 10 * ri(R, 0, 6), th = ri(R, 14, 18);
  const pm = pickMat(L, 'low'), plm = notStone(pickMat(L, 'high'));
  const top = blk(L, x0 + pw / 2, base, pw, ph, pm);
  blk(L, x0 + span - pw / 2, base, pw, ph, pm);
  const t2 = blk(L, x0 + span / 2, top, span, th, plm);
  const r = Math.min(Math.floor((span - 2 * pw) / 2) - 3, Math.floor(ph / 2) - 3, 22);
  if (r >= 12 && PR() < 0.6) pigAt(L, x0 + span / 2, base, ri(PR, 12, r));
  const n = span >= 190 ? ri(PR, 1, 3) : span >= 150 ? ri(PR, 1, 2) : 1;
  for (let i = 0; i < n; i++) pigAt(L, x0 + span * (i + 1) / (n + 1), t2, ri(PR, 14, 18));
  return { w: span, top: t2 };
}

// Brick pyramid: rows of blocks, each row shifted half a block, a pig on top.
function pyramid(L, x0, base, rows) {
  const R = L.R, PR = L.PR;
  const bw = ri(R, 36, 44), bh = ri(R, 28, 34);
  let b = base, topEdge = base;
  for (let k = 0; k < rows; k++) {
    const m = pickMat(L, k === 0 ? 'low' : 'high');
    const cnt = rows - k;
    for (let i = 0; i < cnt; i++) topEdge = blk(L, x0 + (k * bw) / 2 + bw / 2 + i * bw, b, bw, bh, m);
    b = topEdge;
  }
  pigAt(L, x0 + (rows * bw) / 2, b, ri(PR, 14, 20));
  return { w: rows * bw, top: b };
}

// Shield wall: a short column of stacked blocks with a pig hiding behind it (the far side).
function wall(L, x0, base, count) {
  const R = L.R, PR = L.PR;
  const w = ri(R, 22, 30);
  let b = base;
  const m = pickMat(L, 'low');
  for (let i = 0; i < count; i++) b = blk(L, x0 + w / 2, b, w, ri(R, 44, 56), i === count - 1 ? notStone(m) : m);
  const r = ri(PR, 14, 20);
  pigAt(L, x0 + w + 8 + r, base, r);
  return { w: w + 8 + 2 * r, top: b };
}

// ---------- LEVEL 00: DEMO ----------
// Fixed showcase: glass, wood and stone, one pig each, a platform, generous birds.
function demoLevel() {
  const L = { n: 0, blocks: [], pigs: [], platforms: [], birds: 6, name: 'DEMO', attempt: 0 };
  const stack = (x0, base, W, pw, fh, sh, post, slab, pigR) => {
    const top = blk(L, x0 + pw / 2, base, pw, fh, post);
    blk(L, x0 + W - pw / 2, base, pw, fh, post);
    const t = blk(L, x0 + W / 2, top, W, sh, slab);
    pigAt(L, x0 + W / 2, base, pigR);
    return t;
  };
  stack(650, GROUND_Y, 84, 16, 80, 16, 'glass', 'glass', 20);
  const t = stack(780, GROUND_Y, 96, 20, 90, 18, 'wood', 'wood', 22);
  blk(L, 828, t, 40, 30, 'stone');                      // a stone crate on the wood roof
  const H = 90, topY = GROUND_Y - H;
  L.platforms.push({ x: 1000, y: topY + (H + 30) / 2, w: 120, h: H + 30, kind: 'hill' });
  stack(960, topY, 80, 18, 70, 16, 'stone', 'wood', 20);
  return L;
}

// ---------- GENERATOR ----------
function build(n, attempt) {
  const L = {
    n, attempt, name: pad2(n), blocks: [], pigs: [], platforms: [], birds: 0,
    R: rngFor(n, 'layout', attempt), MR: rngFor(n, 'material', attempt), PR: rngFor(n, 'pigs', attempt),
    BR: rngFor(n, 'birds', attempt), TR: rngFor(n, 'terrain', attempt)
  };
  const R = L.R, PR = L.PR, TR = L.TR;
  const d = n / MAX_LEVEL;
  const targetPigs = 1 + Math.floor(n * 0.14) + (PR() < 0.5 ? 0 : 1);
  const maxFloors = 1 + Math.floor(n / 14);                        // 1..4
  const kinds = ['tower'];
  if (n >= 3) kinds.push('pyramid');
  if (n >= 5) kinds.push('bridge');
  if (n >= 8) kinds.push('wall', 'tower');
  if (n >= 20) kinds.push('tower', 'bridge');

  const targetStructs = 1 + Math.floor(n / 12) + (n >= 6 && R() < 0.5 ? 1 : 0);   // 1..6 structures
  let structs = 0;
  let cursor = BX0 + ri(R, 0, 30);
  for (let guard = 0; guard < 14 && (L.pigs.length < targetPigs || structs < targetStructs); guard++) {
    const kind = pickOf(R, kinds);
    const onHill = n >= 6 && TR() < Math.min(0.65, 0.1 + d);
    const H = onHill ? ri(TR, 50, 150) : 0;
    const base = GROUND_Y - H;
    const room = (BX1 - cursor) - (onHill ? 24 : 0);
    const maxFl = Math.max(1, Math.min(maxFloors, Math.floor((base - TOP_MIN) / 120)));
    let w = 0;
    const x0 = cursor + (onHill ? 12 : 0);
    if (kind === 'tower') {
      w = pickOf(R, [64, 72, 80, 90, 100, 110]);
      if (w > room) w = Math.floor(room);
      if (w < 64) break;
      tower(L, x0, base, ri(R, 1, maxFl), w, { boulder: n >= 22 && R() < 0.3, topPig: undefined });
    } else if (kind === 'pyramid') {
      const rows = Math.min(2 + Math.floor(n / 20), 4, Math.floor((base - TOP_MIN) / 34) - 1);
      w = rows * 44;
      if (w > room) { cursor += 20; continue; }
      pyramid(L, x0, base, rows);
    } else if (kind === 'bridge') {
      w = pickOf(R, [140, 170, 200, 230]);
      if (w > room) w = Math.floor(room);
      if (w < 130) break;
      bridge(L, x0, base, w);
    } else {
      const cnt = Math.min(2 + Math.floor(n / 25), 4);
      w = 30 + 8 + 40;
      if (w + 12 > room) { cursor += 20; continue; }
      w = wall(L, x0, base, cnt).w;
    }
    structs++;
    if (onHill) L.platforms.push({ x: r1(cursor + (w + 24) / 2), y: r1(base + (H + 30) / 2), w: Math.ceil(w + 24), h: H + 30, kind: 'hill' });
    cursor += w + (onHill ? 24 : 0) + ri(R, 28 - Math.floor(d * 14), 56 - Math.floor(d * 24));
  }

  // Floating ledge (n >= 12): a static rock shelf in the air with a pig on it
  if (n >= 12 && TR() < 0.35 && L.pigs.length < targetPigs + 1) {
    const lw = ri(TR, 90, 130), lh = 18, ly = GROUND_Y - ri(TR, 170, 240);
    const lx = ri(TR, BX0, BX1 - lw);
    const hit = L.blocks.some(b => b.x + (b.w || 2 * b.r) / 2 > lx - 20 && b.x - (b.w || 2 * b.r) / 2 < lx + lw + 20 && b.y - (b.h || 2 * b.r) / 2 < ly + 60 && b.y + (b.h || 2 * b.r) / 2 > ly - 90) ||
                L.pigs.some(p => p.x + p.r > lx - 20 && p.x - p.r < lx + lw + 20 && p.y + p.r > ly - 90 && p.y - p.r < ly + 60) ||
                L.platforms.some(p => p.x + p.w / 2 > lx - 20 && p.x - p.w / 2 < lx + lw + 20 && p.y - p.h / 2 < ly + 60);
    if (!hit) {
      L.platforms.push({ x: r1(lx + lw / 2), y: r1(ly + lh / 2), w: lw, h: lh, kind: 'ledge' });
      pigAt(L, lx + lw / 2, ly, ri(PR, 14, 18));
    }
  }

  // Not enough pigs yet: exposed pigs fill the remaining ground space (right to left)
  let fx = BX1 - 24;
  while (L.pigs.length < targetPigs && fx > BX0) {
    const r = ri(PR, 16, 20);
    const clash = L.blocks.some(b => Math.abs(b.x - fx) < (b.w || 2 * b.r) / 2 + r + 6 && b.y + (b.h || 2 * b.r) / 2 > GROUND_Y - 2) ||
                  L.pigs.some(p => Math.abs(p.x - fx) < p.r + r + 6 && p.y + p.r > GROUND_Y - 4) ||
                  L.platforms.some(p => Math.abs(p.x - fx) < p.w / 2 + r + 6 && p.kind === 'hill');
    if (!clash) pigAt(L, fx, GROUND_Y, r);
    fx -= 2 * r + 16;
  }
  if (L.pigs.length > 10) L.pigs.length = 10;

  const stones = L.blocks.filter(b => b.material === 'stone').length;
  L.birds = Math.max(3, Math.min(9, Math.ceil(L.pigs.length * 0.7 + 2 + stones * 0.1) + (n <= 5 ? 1 : 0) + Math.floor(L.BR() * 2)));
  return L;
}

// ---------- VALIDATION ----------
const bbox = (b) => (b.r ? { x0: b.x - b.r, x1: b.x + b.r, y0: b.y - b.r, y1: b.y + b.r }
  : { x0: b.x - b.w / 2, x1: b.x + b.w / 2, y0: b.y - b.h / 2, y1: b.y + b.h / 2 });

// Pre-computed shot arcs (same integration as the trajectory preview) for the reachability check.
let ARCS = null;
function arcs() {
  if (ARCS) return ARCS;
  ARCS = [];
  const g = GRAVITY * 0.001 * STEP_MS * STEP_MS, air = 1 - BIRD_FRICTION_AIR;
  for (let a = 5; a <= 80; a += 2.5) for (let p = 0.35; p <= 1.0001; p += 0.05) {
    const th = a * Math.PI / 180;
    let px = SLING_X - Math.cos(th) * MAX_PULL * p, py = SLING_Y + Math.sin(th) * MAX_PULL * p;
    let vx = Math.cos(th) * MAX_PULL * p * LAUNCH_POWER, vy = -Math.sin(th) * MAX_PULL * p * LAUNCH_POWER;
    const pts = [];
    for (let i = 0; i < 240; i++) {
      vx *= air; vy = vy * air + g; px += vx; py += vy;
      if (py > GROUND_Y || px > WORLD_WIDTH + 100) break;
      pts.push(px, py);
    }
    ARCS.push(pts);
  }
  return ARCS;
}

// Returns a list of problems (empty = level is valid).
export function validateLevel(L) {
  const bad = [];
  const items = [];
  L.blocks.forEach((b, i) => items.push({ id: 'block' + i, kind: 'block', o: b, ...bbox(b) }));
  L.pigs.forEach((p, i) => items.push({ id: 'pig' + i, kind: 'pig', o: p, ...bbox(p) }));
  L.platforms.forEach((p, i) => items.push({ id: 'platform' + i, kind: 'platform', o: p, ...bbox(p) }));

  // 1. everything inside the play area
  for (const it of items) {
    const bottomLimit = it.kind === 'platform' ? GROUND_Y + 40 : GROUND_Y;
    if (it.x0 < BX0 - 1 || it.x1 > BX1 + 40 || it.y0 < TOP_MIN || it.y1 > bottomLimit + 0.01) bad.push(`${it.id} outside play area`);
  }
  // 2. no overlaps (touching / 0.5px gaps are fine)
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox > 1 && oy > 1) bad.push(`${a.id} overlaps ${b.id}`);
  }
  // 3. resting on the ground, a platform or another block at the start
  const supporters = items.filter(it => it.kind !== 'pig');
  for (const it of items) {
    if (it.kind === 'platform') continue;
    if (Math.abs(it.y1 - GROUND_Y) <= 2) continue;
    const cx = it.o.x;
    const ok = supporters.some(s => s !== it && Math.abs(s.y0 - it.y1) <= 2 &&
      (it.kind === 'pig' || it.o.r ? cx >= s.x0 && cx <= s.x1 : Math.min(s.x1, it.x1) - Math.max(s.x0, it.x0) >= Math.min(6, 0.2 * it.o.w)));
    if (!ok) bad.push(`${it.id} unsupported`);
  }
  // 4. every pig can be hit: some arc reaches it with only glass/wood in the way (those break)
  const solid = items.filter(it => it.kind === 'platform' || (it.kind === 'block' && it.o.material === 'stone'));
  for (const pig of items.filter(it => it.kind === 'pig')) {
    const reach = pig.o.r + BIRD_R;
    let ok = false;
    for (const pts of arcs()) {
      let hit = -1;
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i] - pig.o.x, dy = pts[i + 1] - pig.o.y;
        if (dx * dx + dy * dy < reach * reach) { hit = i; break; }
      }
      if (hit < 0) continue;
      let clear = true;
      for (let i = 0; i < hit && clear; i += 2) {
        const x = pts[i], y = pts[i + 1];
        for (const s of solid) if (x > s.x0 - CLEAR && x < s.x1 + CLEAR && y > s.y0 - CLEAR && y < s.y1 + CLEAR) { clear = false; break; }
      }
      if (clear) { ok = true; break; }
    }
    if (!ok) bad.push(`${pig.id} unreachable`);
  }
  // 5. pigs, birds
  if (L.pigs.length < 1) bad.push('no pigs');
  if (L.birds < Math.min(9, Math.ceil(L.pigs.length * 0.7) + 1) && L.n !== 0) bad.push('too few birds');
  if (L.birds < 1 || L.birds > 9) bad.push('bird count out of range');
  // 6. physics: nothing moves, tips or collapses on its own in the first 3 seconds
  if (!bad.length) bad.push(...settleProblems(L));
  return bad;
}

const MAX_ATTEMPTS = 60;
// Pure: no caching, no shared state. Returns { n, name, birds, blocks, pigs, platforms, attempt }.
export function generateLevel(n) {
  if (!isLevelNumber(n)) throw new RangeError('level must be an integer 0-' + MAX_LEVEL + ', got ' + n);
  if (n === 0) {
    const d = demoLevel(); const bad = validateLevel(d);
    if (bad.length) throw new Error('demo level invalid: ' + bad.join('; '));
    return d;
  }
  let last = [];
  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    const L = build(n, a);
    last = validateLevel(L);
    if (!last.length && L.pigs.length < 1 + Math.floor(n / 10)) last = ['too few pigs for this difficulty'];   // keeps the ramp: 01-09: 1+, 50: 6+
    if (!last.length) return { n, name: L.name, birds: L.birds, blocks: L.blocks, pigs: L.pigs, platforms: L.platforms, attempt: a };
  }
  throw new Error('level ' + pad2(n) + ' failed validation after ' + MAX_ATTEMPTS + ' attempts: ' + last.join('; '));
}

const cache = new Map();
export function getLevel(n) {
  if (!cache.has(n)) cache.set(n, generateLevel(n));
  return cache.get(n);
}
