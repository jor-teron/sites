/* Weather Sim — tests/ws7.test.cjs: analog clock maths (WS7)
   Pure helpers only. No network / DOM / browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadClockPure() {
  const root = path.join(__dirname, '..', 'js');
  const sandbox = { console };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(root, 'clock.js'), 'utf8');
  const start = src.indexOf('/* ---- pure clock maths ---- */');
  const end = src.indexOf('/* ---- /pure clock maths ---- */');
  if (start < 0 || end < 0) throw new Error('could not slice pure clock maths from clock.js');
  vm.runInContext(src.slice(start, end), sandbox, { filename: 'clock-pure.js' });
  return sandbox;
}

const S = loadClockPure();

function minutesOf(time) {
  return Math.round(S.wrapTime(time) * 60);
}

test('WS7 angle ↔ minutes and time ↔ hand angles', () => {
  assert.equal(S.angleToMinutes(0), 0);
  assert.equal(S.angleToMinutes(90), 15);
  assert.equal(S.angleToMinutes(180), 30);
  assert.equal(S.angleToMinutes(270), 45);
  assert.equal(S.angleToMinutes(360), 0);
  assert.equal(S.angleToMinutes(-90), 45);
  assert.equal(S.minutesToAngle(0), 0);
  assert.equal(S.minutesToAngle(15), 90);
  assert.equal(S.minutesToAngle(59), 354);

  assert.equal(S.timeToMinuteAngle(12), 0);
  assert.equal(S.timeToMinuteAngle(12.5), 180); // 12:30
  assert.equal(S.timeToHourAngle(12), 0);
  assert.equal(S.timeToHourAngle(0), 0);
  assert.equal(S.timeToHourAngle(15), 90); // 3:00 PM
  assert.equal(S.timeToHourAngle(3), 90);  // 3:00 AM
  assert.equal(S.timeToHourAngle(3.5), 105); // 3:30
  // 12:00 and 24 wrap to the same hands
  assert.equal(S.timeToHourAngle(24), S.timeToHourAngle(0));
  assert.equal(S.timeToMinuteAngle(24), 0);
});

test('WS7 minute hand crossing 12 both ways', () => {
  // 3:55 → 4:05 (clockwise past 12)
  assert.equal(minutesOf(S.applyMinuteDrag(3 + 55 / 60, 30)), 4 * 60 + 5);
  // 4:05 → 3:55 (anticlockwise past 12)
  assert.equal(minutesOf(S.applyMinuteDrag(4 + 5 / 60, 330)), 3 * 60 + 55);
  // no wrap: 3:10 → 3:20
  assert.equal(minutesOf(S.applyMinuteDrag(3 + 10 / 60, 120)), 3 * 60 + 20);
  // exact 12: 3:00 stays on the hour when the hand is at 0°
  assert.equal(minutesOf(S.applyMinuteDrag(3, 0)), 3 * 60);
  // first click far from 12 must not wrap the hour
  assert.equal(minutesOf(S.applyMinuteDrag(3, 300, false)), 3 * 60 + 50);
});

test('WS7 wrapping past midnight both ways', () => {
  // 23:50 → 00:10
  assert.equal(minutesOf(S.applyMinuteDrag(23 + 50 / 60, 60)), 10);
  // 00:10 → 23:50
  assert.equal(minutesOf(S.applyMinuteDrag(10 / 60, 50 * 6)), 23 * 60 + 50);
  // 23:59 → 00:00
  assert.equal(minutesOf(S.applyMinuteDrag(23 + 59 / 60, 0)), 0);
  // 00:00 → 23:59
  assert.equal(minutesOf(S.applyMinuteDrag(0, 354)), 23 * 60 + 59);
});

test('WS7 hour-hand AM/PM flip', () => {
  // 11:00 AM clockwise past 12 → 12:00 PM
  assert.equal(minutesOf(S.applyHourDrag(11, 0)), 12 * 60);
  // 11:00 PM clockwise past 12 → 12:00 AM (wraps to 0)
  assert.equal(minutesOf(S.applyHourDrag(23, 0)), 0);
  // 12:00 PM anticlockwise to 11:00 → 11:00 AM
  assert.equal(minutesOf(S.applyHourDrag(12, 330)), 11 * 60);
  // 12:00 AM anticlockwise to 11:00 → 11:00 PM
  assert.equal(minutesOf(S.applyHourDrag(0, 330)), 23 * 60);
  // no flip inside a half: 3:00 AM → 6:00 AM, 3:00 PM → 6:00 PM
  assert.equal(minutesOf(S.applyHourDrag(3, 180)), 6 * 60);
  assert.equal(minutesOf(S.applyHourDrag(15, 180)), 18 * 60);
  // minutes ride with the hour hand: 2:00 AM → 2:30 AM (75° = 60 + 15)
  assert.equal(minutesOf(S.applyHourDrag(2, 75)), 2 * 60 + 30);
  // first click past 12 must not flip AM/PM
  assert.equal(minutesOf(S.applyHourDrag(11, 0, false)), 0); // 12:00 AM, same half
  assert.equal(minutesOf(S.applyHourDrag(23, 0, false)), 12 * 60); // 12:00 PM
});

test('WS7 AM/PM label (sun 6:00–18:59, else moon)', () => {
  assert.equal(S.clockPeriodLabel(6), '☀️ AM');
  assert.equal(S.clockPeriodLabel(11 + 59 / 60), '☀️ AM');
  assert.equal(S.clockPeriodLabel(12), '☀️ PM');
  assert.equal(S.clockPeriodLabel(18 + 59 / 60), '☀️ PM');
  assert.equal(S.clockPeriodLabel(19), '🌙 PM');
  assert.equal(S.clockPeriodLabel(23 + 59 / 60), '🌙 PM');
  assert.equal(S.clockPeriodLabel(0), '🌙 AM');
  assert.equal(S.clockPeriodLabel(5 + 59 / 60), '🌙 AM');
  assert.equal(S.clockPeriodLabel(24), '🌙 AM'); // 24 wraps to midnight
  assert.equal(S.formatClockAria(19.5), '7:30 PM');
  assert.equal(S.formatClockAria(0), '12:00 AM');
  assert.equal(S.formatClockAria(12), '12:00 PM');
  assert.equal(S.formatClockAria(7 + 31 / 60), '7:31 AM');
});
