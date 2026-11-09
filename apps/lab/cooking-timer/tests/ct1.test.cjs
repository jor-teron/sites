/* Cooking Timer — tests/ct1.test.cjs: endAt countdown, pause/resume, finish, persistence. CT1
   Loads ct_timers.js in Node with a fake localStorage and a controllable clock. No browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadTimers() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'ct_timers.js'), 'utf8');
  const sandbox = { global: {}, console };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'ct_timers.js' });
  return sandbox.CT.Timers;
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _map: map
  };
}

const T = loadTimers();

test('CT1 formatTime MM:SS and H:MM:SS', () => {
  assert.equal(T.formatTime(0), '00:00');
  assert.equal(T.formatTime(59000), '00:59');
  assert.equal(T.formatTime(60000), '01:00');
  assert.equal(T.formatTime(3661000), '1:01:01');
});

test('CT1 create clamps minutes/seconds and rejects zero total', () => {
  const now = 1_000_000;
  assert.equal(T.create('x', 0, 0, now), null);
  assert.equal(T.create('x', -5, -1, now), null);
  const t = T.create('Pasta', 999, 99, now);
  assert.ok(t);
  assert.equal(t.label, 'Pasta');
  // minutes clamped to 120, seconds to 59 → 120*60+59 seconds
  assert.equal(t.totalMs, (120 * 60 + 59) * 1000);
  assert.equal(t.running, true);
  assert.equal(t.endAt, now + t.totalMs);
});

test('CT1 endAt countdown stays accurate across a gap', () => {
  const t0 = 5_000_000;
  const t = T.create('Egg', 0, 10, t0);
  assert.equal(T.remainingMs(t, t0), 10_000);
  // Jump 7 seconds (as if the tab slept) — remaining should be 3s, not 9 ticks left.
  assert.equal(T.remainingMs(t, t0 + 7_000), 3_000);
  assert.equal(T.tickOne(t, t0 + 7_000), false);
  assert.equal(T.tickOne(t, t0 + 10_000), true);
  assert.equal(t.finished, true);
  assert.equal(t.running, false);
  assert.equal(T.remainingMs(t, t0 + 20_000), 0);
});

test('CT1 pause freezes remaining; resume sets a new endAt', () => {
  const t0 = 8_000_000;
  const t = T.create('Tea', 0, 30, t0);
  T.pause(t, t0 + 10_000);
  assert.equal(t.running, false);
  assert.equal(t.remainingMs, 20_000);
  assert.equal(t.endAt, null);
  // Time passes while paused — remaining unchanged.
  assert.equal(T.remainingMs(t, t0 + 50_000), 20_000);
  T.resume(t, t0 + 50_000);
  assert.equal(t.running, true);
  assert.equal(t.endAt, t0 + 50_000 + 20_000);
  assert.equal(T.remainingMs(t, t0 + 55_000), 15_000);
});

test('CT1 persistence round trip; finished while closed loads finished', () => {
  const store = fakeStorage();
  const t0 = 9_000_000;
  const a = T.create('A', 0, 5, t0);
  const b = T.create('B', 1, 0, t0);
  T.pause(b, t0 + 1_000);
  T.save(store, [a, b]);

  // Reload 10s later: A should finish; B stays paused with ~59s.
  const loaded = T.load(store, t0 + 10_000);
  assert.equal(loaded.length, 2);
  const A = loaded.find((x) => x.label === 'A');
  const B = loaded.find((x) => x.label === 'B');
  assert.equal(A.finished, true);
  assert.equal(A.running, false);
  assert.equal(B.finished, false);
  assert.equal(B.running, false);
  assert.equal(B.remainingMs, 59_000);

  // Save again and reload once more — finished stays finished.
  T.save(store, loaded);
  const again = T.load(store, t0 + 60_000);
  assert.equal(again.find((x) => x.label === 'A').finished, true);
});
