// Sling Birds SB1a: runs a level's bodies in a private Matter engine and reports anything that
// shifts, tips over or keeps moving by itself. Used by the level generator (a candidate that fails
// is re-rolled) and mirrored by test/levels.test.mjs.
import { Engine, Composite, GRAVITY, STEP_MS } from './config.js';
import { makeGround, makeLeftWall, makeBlockBody, makePigBody, makePlatformBody } from './bodies.js';

export const SETTLE_STEPS = 180;      // 3 s at 60 Hz
export const MAX_SHIFT = 6;           // px any block/pig may travel from its start position
export const MAX_TILT = 0.05;         // rad a block may rotate
export const MAX_SPEED = 0.5;         // px/step still allowed at the end

export function settleProblems(L) {
  const engine = Engine.create();
  engine.gravity.y = GRAVITY;
  Composite.add(engine.world, [makeGround(), makeLeftWall()]);
  const items = [];
  for (const p of L.platforms) Composite.add(engine.world, makePlatformBody(p));
  L.blocks.forEach((b, i) => { const body = makeBlockBody(b); Composite.add(engine.world, body); items.push({ id: 'block' + i, body, x: body.position.x, y: body.position.y, pig: false }); });
  L.pigs.forEach((p, i) => { const body = makePigBody(p); Composite.add(engine.world, body); items.push({ id: 'pig' + i, body, x: body.position.x, y: body.position.y, pig: true }); });
  for (let i = 0; i < SETTLE_STEPS; i++) Engine.update(engine, STEP_MS);
  const bad = [];
  for (const it of items) {
    const shift = Math.hypot(it.body.position.x - it.x, it.body.position.y - it.y);
    if (shift >= MAX_SHIFT) bad.push(`${it.id} moved ${shift.toFixed(1)}px`);
    else if (!it.pig && Math.abs(it.body.angle) >= MAX_TILT) bad.push(`${it.id} tilted ${it.body.angle.toFixed(2)}`);
    else if (it.body.speed >= MAX_SPEED) bad.push(`${it.id} still moving`);
  }
  return bad;
}
