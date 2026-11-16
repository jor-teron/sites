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
