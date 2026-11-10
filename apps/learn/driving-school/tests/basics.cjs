const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = Object.assign({}, require('../core/physics.js'), require('../core/lessons.js'), require('../core/session.js'));
function drive(c, input, seconds) { for (let i = 0; i < seconds * 60; i++) D.step(c, input, 1 / 60); }
test('manual launch with throttle and smooth clutch works', () => {
  const c = D.car({ handbrake: false }); D.start(c); D.shift(c, 1);
  drive(c, { throttle: .65 }, 6); assert(c.v > 4); assert(c.engine); assert.equal(c.stalls, 0);
});
test('dumping clutch without throttle stalls; clutch-neutral restart recovers', () => {
  const c = D.car({ handbrake: false }); D.start(c); D.shift(c, 1); drive(c, {}, 3);
  assert(c.stalled); assert.equal(c.rpm, 0); assert.equal(D.start(c), false);
  drive(c, { clutch: 1, brake: 1 }, 1); assert(D.shift(c, 0)); assert(D.start(c)); assert(!c.stalled);
});
test('gears require clutch and reverse requires a full stop', () => {
  const c = D.car({ clutch: 0, v: 5, gear: 1 }); assert(!D.shift(c, 2)); c.clutch = 1;
  assert(D.shift(c, 2)); assert(!D.shift(c, -1)); c.v = 0; assert(D.shift(c, -1));
  drive(c, { throttle: .7 }, 5); assert(c.v <= 0); assert.equal(c.gear, -1);
});
test('braking distance increases with speed; handbrake holds still', () => {
  function stop(v) { const c = D.car({ v, handbrake: false }); drive(c, { brake: 1, clutch: 1 }, 6); assert.equal(c.v, 0); return c.distance; }
  const a = stop(5), b = stop(10); assert(a > 1 && a < 3); assert(b > 6 && b < 9); assert(b > a * 3);
  const c = D.car({ auto: true }); D.start(c); drive(c, { throttle: 1 }, 5); assert.equal(c.distance, 0);
});
test('bicycle steering is speed-dependent and reverses when backing', () => {
  const a = D.car({ v: 3, handbrake: false }), b = D.car({ v: -3, handbrake: false });
  drive(a, { steer: 1 }, .5); drive(b, { steer: 1 }, .5); assert(a.heading > 0); assert(b.heading < 0);
});
test('autodrive lesson 1 using only manual pedal inputs', () => {
  const s = D.session(D.basics[0]); D.start(s.c); D.shift(s.c, 1); s.c.handbrake = false;
  for (let i = 0; i < 6000 && !s.l.done; i++) {
    const remaining = 78 - s.c.x, target = Math.min(5, Math.sqrt(Math.max(0, remaining) * 1.8));
    D.tick(s, { throttle: s.c.v < target && remaining > 1 ? .65 : 0,
      brake: s.c.v > target || remaining < .5 ? .55 : 0, clutch: remaining < 4 ? 1 : 0 }, 1 / 60);
  }
  assert(s.l.done, JSON.stringify(s.c)); assert(s.l.score >= 80); assert(s.c.x >= 72 && s.c.x <= 90);
});
test('lesson cannot complete without moving; scoring clamps and faults persist', () => {
  const s = D.session(D.basics[0]); for (let i = 0; i < 120; i++) D.tick(s, {}, 1 / 60);
  assert(!s.l.done); for (let i = 0; i < 30; i++) D.penalize(s.l, 'fault', 'reason', 6);
  assert.equal(s.l.score, 0); assert.equal(s.l.faults.length, 30);
});
test('six original lessons have actionable cards and target guides', () => {
  assert.equal(D.basics.length, 6); for (const d of D.basics) { assert(d.cards.length >= 2); assert(d.gates.length > 0); }
});
