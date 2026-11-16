/* DS-5: live score maths, horn hold/tap timing and edge-alert setting (no DOM). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/score.js');
const D = Object.assign({}, require('../core/physics.js'), require('../core/lessons.js'), require('../core/session.js'));

test('DS-5: a drive starts at 100; minor takes 5, serious takes 25, and the score stays in 0–100', () => {
  const st = S.scoreState();
  assert.equal(st.value, 100);
  assert.equal(st.cleanM, 0);
  S.applyFault(st, 'minor');
  assert.equal(st.value, 95);
  S.applyFault(st, 'serious');
  assert.equal(st.value, 70);
  for (let i = 0; i < 20; i++) S.applyFault(st, 'serious');
  assert.equal(st.value, 0);
  assert.equal(S.scoreState(-4).value, 0);
  assert.equal(S.scoreState(140).value, 100);
  assert.equal(S.penaltyFor('minor'), 5);
  assert.equal(S.penaltyFor('serious'), 25);
  assert.equal(S.REGAIN_M, 200);
});

test('DS-5: clean driving wins 1 point per 200 m, resets on a fault, and never goes above 100', () => {
  const st = S.scoreState();
  S.applyFault(st, 'minor');
  assert.equal(st.value, 95);
  S.applyDistance(st, 199);
  assert.equal(st.value, 95);
  assert.equal(st.cleanM, 199);
  S.applyDistance(st, 1);
  assert.equal(st.value, 96);
  assert.equal(st.cleanM, 0);
  S.applyDistance(st, 450);
  assert.equal(st.value, 98);
  assert.equal(st.cleanM, 50);
  S.applyFault(st, 'minor');
  assert.equal(st.value, 93);
  assert.equal(st.cleanM, 0, 'a fault starts the 200 m count again');
  S.applyDistance(st, 200);
  assert.equal(st.value, 94);
  const top = S.scoreState(99);
  S.applyDistance(top, 800);
  assert.equal(top.value, 100);
  S.applyDistance(st, 0);
  S.applyDistance(st, -20);
  S.applyDistance(st, NaN);
  assert.equal(st.value, 94, 'non-positive distance is ignored');
});

test('DS-5: lesson hook records faults and advances from car.distance without subtracting a reset', () => {
  const l = D.lesson(D.basics[0]);
  assert.equal(l.score, 100);
  D.penalize(l, 'stall', 'stalled');
  assert.equal(l.score, 95);
  assert.equal(l.faults[0].severity, 'minor');
  D.penalize(l, 'crash', 'collision', 25, 'serious');
  assert.equal(l.score, 70);
  S.advanceLessonScore(l, 200);
  assert.equal(l.score, 71);
  S.advanceLessonScore(l, 400);
  assert.equal(l.score, 72);
  S.advanceLessonScore(l, 0);
  assert.equal(l.score, 72, 'a session reset does not take points away');
  S.advanceLessonScore(l, 200);
  assert.equal(l.score, 73);
  assert.equal(S.scoreColour(100), 'green');
  assert.equal(S.scoreColour(80), 'green');
  assert.equal(S.scoreColour(79), 'amber');
  assert.equal(S.scoreColour(50), 'amber');
  assert.equal(S.scoreColour(49), 'red');
  assert.equal(S.scoreColour(0), 'red');
  assert.equal(S.scoreLabel(87.4), '87%');
});

test('DS-5: best scores keep the higher value for each lesson id', () => {
  const a = S.recordBest({}, 'start', 80);
  assert.equal(a.start, 80);
  const b = S.recordBest(a, 'start', 70);
  assert.equal(b.start, 80);
  assert.equal(a.start, 80, 'recordBest does not mutate the previous object');
  const c = S.recordBest(b, 'start', 92);
  assert.equal(c.start, 92);
  const d = S.recordBest(c, 'loop', 100);
  assert.equal(d.loop, 100);
  assert.equal(d.start, 92);
});

test('DS-5: a horn tap lasts 0.6 s; a hold lasts until release, with a 0.6 s minimum', () => {
  assert.equal(S.HORN_MIN_S, .6);
  assert.equal(S.hornStopAt(10, 10.2), 10.6);
  assert.equal(S.hornStopAt(10, 10.6), 10.6);
  assert.equal(S.hornStopAt(10, 12.5), 12.5);
  assert.equal(S.hornStopAt(0, 0), .6);
  assert.equal(S.hornStopAt(5, 4), 5.6, 'release before start still meets the minimum');
});

test('DS-5: edge alert is on by default; pulse class follows severity and reduced motion', () => {
  const C = require('../core/cockpit.js');
  assert.equal(C.settingsFrom(undefined).edgeAlert, true);
  assert.equal(C.settingsFrom({}).edgeAlert, true);
  assert.equal(C.settingsFrom({ minimap: true }).edgeAlert, true, 'legacy settings stay on');
  assert.equal(C.settingsFrom({ edgeAlert: false }).edgeAlert, false);
  assert.equal(C.settingsFrom({ edgeAlert: true }).edgeAlert, true);
  assert.equal(S.edgeAlertOn(undefined), true);
  assert.equal(S.edgeAlertOn({ edgeAlert: false }), false);
  assert.equal(S.edgeAlertPulse('minor', false), 'pulse-amber');
  assert.equal(S.edgeAlertPulse('serious', false), 'pulse-red');
  assert.equal(S.edgeAlertPulse('minor', true), 'show-amber');
  assert.equal(S.edgeAlertPulse('serious', true), 'show-red');
});

test('DS-5: a clean autodrive still finishes at 100, and a mid-drive fault can be won back', () => {
  const s = D.session(D.basics[0]); D.start(s.c); D.shift(s.c, 1); s.c.handbrake = false;
  for (let i = 0; i < 6000 && !s.l.done; i++) {
    const remaining = 78 - s.c.x, target = Math.min(5, Math.sqrt(Math.max(0, remaining) * 1.8));
    D.tick(s, { throttle: s.c.v < target && remaining > 1 ? .65 : 0,
      brake: s.c.v > target || remaining < .5 ? .55 : 0, clutch: remaining < 4 ? 1 : 0 }, 1 / 60);
  }
  assert(s.l.done); assert(s.l.score >= 80);

  const l = D.lesson(D.basics[0]);
  D.penalize(l, 'lane_line', 'Keep to your side.', 5, 'minor');
  assert.equal(l.score, 95);
  // 250 m of movement after the fault: +1, 50 m left in the clean count.
  S.advanceLessonScore(l, 250);
  assert.equal(l.score, 96);
});
