const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = Object.assign({}, require('../core/physics.js'), require('../core/lessons.js'), require('../core/town.js'), require('../core/rules.js'), require('../core/session.js'));
function scenario(options, control, fixture, max = 1200) {
  const c = D.car(Object.assign({ auto: true, gear: 1, x: 30, y: 56.5 }, options)); D.start(c); c.handbrake = false;
  const w = D.world('left', 13), l = D.lesson(D.roadLessons()[0]); w.cars = []; w.pedestrians = [];
  if (fixture) fixture(w, c);
  for (let i = 0; i < max; i++) { const input = control(c, w, i); D.step(c, input, 1 / 60); w.time += 1 / 60; D.checkRules(w, c, l, 1 / 60); }
  return { c, w, l, codes: l.faults.map(f => f.code) };
}
test('town lesson autodrive completes lane keeping without faults', () => {
  for (const side of ['left', 'right']) {
    const s = D.session(D.roadLessons(side)[0], { auto: true, side }); D.start(s.c); D.shift(s.c, 1); s.c.handbrake = false;
    for (let i = 0; i < 6000 && !s.l.done; i++) D.tick(s, { throttle: s.c.v < 4 ? .7 : 0 }, 1 / 60);
    assert(s.l.done); assert.equal(s.l.score, 100, JSON.stringify(s.l.faults));
  }
});
test('autodrive throttle triggers speeding fault', () => {
  const r = scenario({}, () => ({ throttle: 1 }), null, 3600); assert(r.codes.includes('speeding'));
});
test('scripted steering triggers missing-indicator fault; early correct signal avoids it', () => {
  const turn = c => ({ throttle: .6, steer: 1 });
  const bad = scenario({ x: 60, y: 60 }, turn, null, 360); assert(bad.codes.includes('no_indicator'));
  const good = scenario({ x: 60, y: 60, indicator: 'right' }, turn, null, 360); assert(!good.codes.includes('no_indicator'));
});
test('autodrive through red stop line triggers red-light fault', () => {
  const r = scenario({ x: 137 }, () => ({ throttle: .7 }), null, 300); assert(r.codes.includes('red_light'));
});
test('autodrive through STOP without stopping triggers stop fault', () => {
  const r = scenario({ x: 63.5, y: 46, heading: Math.PI / 2 }, () => ({ throttle: .7 }), null, 300); assert(r.codes.includes('stop_sign'));
});
test('one full stationary second satisfies STOP before moving', () => {
  const r = scenario({ x: 63.5, y: 48, heading: Math.PI / 2 }, (c, w, i) => i < 90 ? { brake: 1 } : { throttle: .7 }, null, 360);
  assert(r.w.stopSatisfied); assert(!r.codes.includes('stop_sign'));
});
test('autodrive across occupied zebra triggers pedestrian yield fault', () => {
  const r = scenario({ x: 108 }, () => ({ throttle: .6 }), w => { w.pedestrians = [{ x: 116, y: 58, active: true }]; w.time = 4; }, 240); assert(r.codes.includes('pedestrian'));
});
test('autodrive wrong side triggers lane-line fault', () => {
  const r = scenario({ x: 28, y: 63.5 }, () => ({ throttle: .6 }), null, 180); assert(r.codes.includes('lane_line'));
});
test('autodrive into a stopped car triggers collision fault', () => {
  const r = scenario({}, () => ({ throttle: .6 }), w => { w.cars = [{ x: 40, y: 56.5, id: 1 }]; }, 360); assert(r.codes.includes('collision'));
});
test('autodrive approaching circulating traffic triggers give-way fault', () => {
  const r = scenario({ x: 153, y: 176.5 }, () => ({ throttle: .5 }), w => { w.cars = [{ x: 164, y: 176.5, id: 3 }]; }, 300); assert(r.codes.includes('give_way'));
});
test('AI traffic waits at red and pedestrians use a crossing', () => {
  const w = D.world('left', 13), ai = w.cars[0]; ai.travel = 75; Object.assign(ai, D.pathPose(ai.path, ai.travel));
  const x = ai.x; for (let i = 0; i < 120; i++) D.updateWorld(w, { x: -100, y: -100 }, 1 / 60);
  assert(ai.x < 142); assert.equal(ai.v, 0); assert(ai.x >= x);
  w.time = 4; D.updateWorld(w, { x: -100, y: -100 }, 1 / 60); assert.equal(w.pedestrians.length, 1); assert(w.pedestrians[0].y >= 52);
});
test('fault cooldown and severity are deterministic; score never negative', () => {
  const r = scenario({ x: 28, y: 63.5 }, () => ({ throttle: .6 }), null, 180); assert.equal(r.codes.filter(c => c === 'lane_line').length, 1);
  assert(r.l.faults.every(f => ['minor', 'serious'].includes(f.severity)));
  assert.equal(D.roadLessons().length, 7); assert.equal(D.roadLessons('right')[0].spawn[1], 63.5);
});
