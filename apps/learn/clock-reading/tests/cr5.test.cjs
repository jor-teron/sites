// Clock Reading CR5 — hand-drag maths (core/time.js, no DOM). Run: node --test apps/learn/clock-reading/tests/*.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/time.js'), 'utf8'), ctx);
const C = ctx.window.CR, T = (h, m) => h * 60 + m;
// simulate a drag: first point with wrap=false, then every point with wrap=true
const drag = (fn, t, angles) => angles.reduce((acc, a, i) => fn(acc, a, i > 0), t);
const sweep = (from, to, step) => { const out = []; for (let a = from; step > 0 ? a <= to : a >= to; a += step) out.push(a); return out; };

test('minute hand sets minutes', () => {
  assert.strictEqual(C.dragMinute(T(3, 10), 90, false), T(3, 15));
  assert.strictEqual(C.dragMinute(T(3, 10), 359.9, false), T(3, 0));
});
test('minute hand rolls the hour forward and back past 12', () => {
  assert.strictEqual(drag(C.dragMinute, T(3, 50), sweep(300, 390, 6).map(C.normDeg)), T(4, 5));
  assert.strictEqual(drag(C.dragMinute, T(4, 10), sweep(60, -60, -6).map(C.normDeg)), T(3, 50));
});
test('minute hand: 23:55 -> 0:05 and back', () => {
  assert.strictEqual(drag(C.dragMinute, T(23, 55), sweep(330, 390, 6).map(C.normDeg)), T(0, 5));
  assert.strictEqual(drag(C.dragMinute, T(0, 5), sweep(30, -30, -6).map(C.normDeg)), T(23, 55));
});
test('first touch never rolls the hour', () => {
  assert.strictEqual(C.dragMinute(T(3, 55), 30, false), T(3, 5));
  assert.strictEqual(C.dragHour(T(23, 0), 30, false), T(13, 0));
});
test('hour hand: PM -> past midnight -> AM, keeps going', () => {
  const t = drag(C.dragHour, T(22, 0), sweep(300, 390, 2).map(C.normDeg));   // 10 PM -> 1 AM
  assert.strictEqual(t, T(1, 0));
  assert.strictEqual(drag(C.dragHour, t, sweep(30, 370, 5).map(C.normDeg)), T(12, 20));   // on round to 12:20 PM
});
test('hour hand backwards: 1 AM -> 11 PM', () => {
  assert.strictEqual(drag(C.dragHour, T(1, 0), sweep(30, -30, -2).map(C.normDeg)), T(23, 0));
});
test('hour hand carries the minutes', () => {
  assert.strictEqual(C.dragHour(T(9, 0), 105, false), T(3, 30));
  assert.strictEqual(C.dragHour(T(15, 0), 105, false), T(15, 30));
});
test('pickHand finds the right hand', () => {
  const t = T(3, 0);   // hour at 90, minute at 0
  assert.strictEqual(C.pickHand(t, 90, 40, 50, 80, true), 'hour');
  assert.strictEqual(C.pickHand(t, 2, 70, 50, 80, true), 'minute');
  assert.strictEqual(C.pickHand(t, 200, 60, 50, 80, true), null);
  assert.strictEqual(C.pickHand(t, 0, 99, 50, 80, true), null);
  assert.strictEqual(C.pickHand(T(12, 0), 0, 40, 50, 80, true), 'hour');   // both at 12: inside the hour length takes the hour
  assert.strictEqual(C.pickHand(T(12, 0), 0, 70, 50, 80, true), 'minute');
  assert.strictEqual(C.pickHand(t, 90, 60, 64, 0, false), 'hour');          // sundial shadow
  assert.strictEqual(C.pickHand(t, 0, 60, 64, 0, false), null);
});
