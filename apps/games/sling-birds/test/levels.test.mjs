// Sling Birds SB1a level tests (Node 18+). Run from anywhere:
//   MATTER=/path/to/matter.min.js node apps/games/sling-birds/test/levels.test.mjs
// Checks: determinism (all 51 levels generated twice), validity, neighbouring levels differ,
// invalid numbers rejected, and that structures stand still for 3 s of real Matter physics.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const matterPath = process.env.MATTER || path.resolve(here, '../../demolisher/vendor/matter.min.js');
globalThis.window = { Matter: require(matterPath) };      // core/config.js reads window.Matter
const M = globalThis.window.Matter;

const core = path.resolve(here, '../core');
const { generateLevel, validateLevel, MAX_LEVEL } = await import(core + '/levels.js?v=sb1a');
const { makeGround, makeLeftWall, makeBlockBody, makePigBody, makePlatformBody } = await import(core + '/bodies.js?v=sb1a');
const { mapSeed, rngFor } = await import(core + '/seed.js?v=sb1a');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };

// 1. determinism: two independent generations of every level are identical
const first = [], t0 = Date.now();
for (let n = 0; n <= MAX_LEVEL; n++) first.push(JSON.stringify(generateLevel(n)));
const genMs = Date.now() - t0;
for (let n = 0; n <= MAX_LEVEL; n++) ok(JSON.stringify(generateLevel(n)) === first[n], `level ${n} not deterministic`);
ok(first.length === 51, '51 levels');
// RNG layers are independent streams and seeds differ between neighbours
ok(mapSeed(7) !== mapSeed(8) && rngFor(7, 'layout')() !== rngFor(7, 'pigs')(), 'seed/layer separation');
for (let n = 0; n < MAX_LEVEL; n++) ok(first[n] !== first[n + 1], `levels ${n} and ${n + 1} identical`);

// 2. validity + stats
const stat = [];
for (let n = 0; n <= MAX_LEVEL; n++) {
  const L = generateLevel(n), bad = validateLevel(L);
  ok(bad.length === 0, `level ${n} invalid: ${bad.join('; ')}`);
  stat.push({ n, birds: L.birds, pigs: L.pigs.length, blocks: L.blocks.length, plat: L.platforms.length, attempt: L.attempt });
}
const d0 = generateLevel(0);
ok(d0.birds >= 5 && d0.pigs.length >= 2 && d0.blocks.length <= 12, 'demo is a small generous showcase');

// 3. bad numbers are rejected
for (const bad of [-1, 51, 1.5, NaN, '7', null, undefined]) {
  let threw = false; try { generateLevel(bad); } catch (e) { threw = e instanceof RangeError; }
  ok(threw, `generateLevel(${String(bad)}) should throw RangeError`);
}

// 4. physics: structures hold still for 3 s (180 steps of 1000/60 ms)
const STEPS = 180;
let worstShift = 0, worstAngle = 0, worstLevel = -1;
for (let n = 0; n <= MAX_LEVEL; n++) {
  const L = generateLevel(n);
  const engine = M.Engine.create(); engine.gravity.y = 1.0;
  M.Composite.add(engine.world, [makeGround(), makeLeftWall()]);
  const items = [];
  for (const p of L.platforms) M.Composite.add(engine.world, makePlatformBody(p));
  for (const b of L.blocks) { const body = makeBlockBody(b); M.Composite.add(engine.world, body); items.push({ body, x: body.position.x, y: body.position.y, id: 'block' }); }
  for (const p of L.pigs) { const body = makePigBody(p); M.Composite.add(engine.world, body); items.push({ body, x: body.position.x, y: body.position.y, id: 'pig' }); }
  for (let i = 0; i < STEPS; i++) M.Engine.update(engine, 1000 / 60);
  for (const it of items) {
    const shift = Math.hypot(it.body.position.x - it.x, it.body.position.y - it.y), ang = Math.abs(it.body.angle);
    if (shift > worstShift) { worstShift = shift; worstLevel = n; }
    worstAngle = Math.max(worstAngle, it.id === 'pig' ? 0 : ang);
    ok(shift < 6, `level ${n} ${it.id} moved ${shift.toFixed(1)}px in 3s`);
    if (it.id === 'block') ok(ang < 0.05, `level ${n} block rotated ${ang.toFixed(3)} rad in 3s`);
    ok(it.body.speed < 0.5, `level ${n} ${it.id} still moving (speed ${it.body.speed.toFixed(2)})`);
  }
}
console.log(`generated 51 levels in ${genMs} ms; worst 3s shift ${worstShift.toFixed(2)}px (level ${worstLevel}), worst block angle ${worstAngle.toFixed(4)} rad`);
console.log('n:birds/pigs/blocks/plat/attempt ' + stat.map(s => `${s.n}:${s.birds}/${s.pigs}/${s.blocks}/${s.plat}/${s.attempt}`).join(' '));
console.log(fails ? `${fails} FAILURES` : 'ALL OK');
process.exit(fails ? 1 : 0);
