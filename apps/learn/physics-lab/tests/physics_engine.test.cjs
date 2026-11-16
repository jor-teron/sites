// Physics Lab PS1b - engine maths (core/engine.js, no DOM).
// Run: node --test apps/learn/physics-lab/tests/*.cjs
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/engine.js'), 'utf8'), ctx);
const P = ctx.window.PLPhysics;

// Drop a ball from h onto a floor and watch the highest point after the first landing.
function drop(h, e, seconds) {
  const w = P.world(10, 6);
  w.addSegment(0, 0, 10, 0);
  const b = w.addBody(P.circle({ x: 5, y: h, r: 0.3, mass: 1, restitution: e }));
  let landed = false, apex = 0;
  const steps = Math.round((seconds || 4) * 240);
  for (let i = 0; i < steps; i++) {
    w.step(1 / 240);
    if (!landed && b.y <= b.r + 0.02) landed = true;
    if (landed) apex = Math.max(apex, b.y);
  }
  return { w, b, apex, landed };
}

// height a perfect bounce should reach: r + e^2 * (drop height above the floor)
const expected = (h, e) => 0.3 + e * e * (h - 0.3);

test('free fall follows gravity', () => {
  const w = P.world(10, 6);
  const b = w.addBody(P.circle({ x: 5, y: 5, r: 0.3 }));
  for (let i = 0; i < 240; i++) w.step(1 / 240);
  assert.ok(Math.abs(b.y - (5 - 0.5 * 9.81)) < 0.04, 'y after 1 s: ' + b.y);
  assert.ok(Math.abs(b.vy + 9.81) < 0.05, 'vy after 1 s: ' + b.vy);
});

test('bounce 0 lands and stays', () => {
  const d = drop(3, 0, 4);
  assert.ok(d.landed);
  assert.ok(Math.abs(d.b.y - 0.3) < 0.02, 'resting y: ' + d.b.y);
  assert.ok(Math.abs(d.b.vy) < 0.05, 'resting vy: ' + d.b.vy);
});

test('bounce 0.5 loses three quarters of the height', () => {
  const d = drop(4, 0.5, 4);
  assert.ok(Math.abs(d.apex - expected(4, 0.5)) < 0.12, 'apex: ' + d.apex);
});

test('bounce 0.7 rebounds to about half the height', () => {
  const d = drop(4, 0.7, 4);
  assert.ok(Math.abs(d.apex - expected(4, 0.7)) < 0.12, 'apex: ' + d.apex);
});

test('bounce 1 comes back to the drop height', () => {
  const d = drop(3, 1, 4);
  assert.ok(Math.abs(d.apex - 3) < 0.15, 'apex: ' + d.apex);
});

test('a tiny bounce settles instead of buzzing', () => {
  const d = drop(0.4, 0.9, 3);
  assert.ok(Math.abs(d.b.y - 0.3) < 0.02, 'resting y: ' + d.b.y);
  assert.ok(Math.abs(d.b.vy) < 0.05, 'resting vy: ' + d.b.vy);
});

// ---- PS1c: boxes, friction, ramps and body collisions ----------------------

test('box lands flat and stays on the floor', () => {
  const w = P.world(10, 6);
  w.addSegment(0, 0, 10, 0);
  const b = w.addBody(P.box({ x: 5, y: 3, w: 0.8, h: 0.5, mass: 2, restitution: 0, friction: 0.6 }));
  for (let i = 0; i < 4 * 240; i++) w.step(1 / 240);
  assert.ok(Math.abs(b.y - 0.25) < 0.04, 'resting y: ' + b.y);
  assert.ok(Math.abs(b.angle) < 0.06, 'resting angle: ' + b.angle);
  assert.ok(Math.abs(b.vy) < 0.12, 'resting vy: ' + b.vy);
});

test('friction slows a sliding box', () => {
  const run = (mu) => {
    const w = P.world(10, 6);
    w.addSegment(0, 0, 10, 0);
    const b = w.addBody(P.box({ x: 2, y: 0.25, w: 0.8, h: 0.5, mass: 1, vx: 4, restitution: 0, friction: mu }));
    for (let i = 0; i < 240; i++) w.step(1 / 240);
    return b.vx;
  };
  assert.ok(run(0) > 3.5, 'no friction keeps speed');
  assert.ok(run(0.6) < 2.5, 'friction slows it');
});

test('a ball rolls down a ramp', () => {
  const w = P.world(10, 6);
  w.addSegment(0, 0, 10, 0);
  w.addSegment(1, 0, 4, 2.6, 0.7);
  const b = w.addBody(P.circle({ x: 3.35, y: 2.44, r: 0.3, mass: 1, restitution: 0.1, friction: 0.5 }));
  for (let i = 0; i < 240; i++) w.step(1 / 240);
  assert.ok(b.x < 3.1, 'rolled towards the low end: x=' + b.x);
  assert.ok(b.y < 2.2, 'came down: y=' + b.y);
});

test('equal-mass elastic collision passes the speed on', () => {
  const w = P.world(10, 6);
  w.gravity = 0;
  const a = w.addBody(P.circle({ x: 2, y: 3, r: 0.3, mass: 1, vx: 3, restitution: 1, friction: 0 }));
  const b = w.addBody(P.circle({ x: 5, y: 3, r: 0.3, mass: 1, restitution: 1, friction: 0 }));
  for (let i = 0; i < 1.6 * 240; i++) w.step(1 / 240);
  assert.ok(Math.abs(a.vx) < 0.35, 'first ball stops: ' + a.vx);
  assert.ok(Math.abs(b.vx - 3) < 0.35, 'second ball moves: ' + b.vx);
});

test('an inelastic collision loses energy', () => {
  const w = P.world(10, 6);
  w.gravity = 0;
  const a = w.addBody(P.circle({ x: 2, y: 3, r: 0.3, mass: 1, vx: 3, restitution: 0.2, friction: 0 }));
  const b = w.addBody(P.circle({ x: 5, y: 3, r: 0.3, mass: 1, restitution: 0.2, friction: 0 }));
  const before = w.energy(a).ke;
  for (let i = 0; i < 1.6 * 240; i++) w.step(1 / 240);
  const after = w.energy(a).ke + w.energy(b).ke;
  assert.ok(after < before * 0.8, 'kinetic energy dropped: ' + before + ' -> ' + after);
});
