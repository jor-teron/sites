/* Weather Sim — tests/ws4.test.cjs: horizon cap + sun arc (WS4)
   Pure helpers only. No network / DOM / browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPure() {
  const root = path.join(__dirname, '..', 'js');
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'ground.js'), 'utf8'), sandbox, {
    filename: 'ground.js',
  });
  /* Slice the pure sky-path block out of sky.js (avoids $ / DOM). */
  const skySrc = fs.readFileSync(path.join(root, 'sky.js'), 'utf8');
  const start = skySrc.indexOf('const SUN_RISE');
  const end = skySrc.indexOf('/* ---- /pure sky paths ---- */');
  if (start < 0 || end < 0) throw new Error('could not slice pure sky paths from sky.js');
  vm.runInContext(skySrc.slice(start, end), sandbox, { filename: 'sky-pure.js' });
  return sandbox;
}

const S = loadPure();

test('WS4 horizon never exceeds 25% for any elevation', () => {
  const coast = S.horizonLine('default');
  assert.ok(coast <= 0.25);
  assert.ok(coast >= 0.10 && coast <= 0.20, 'coast horizon is low');
  // Very high custom place still capped at ≤ 0.25
  S.registerCustomPlace({ name: 'High', lat: 30, lon: 79, elev: 8000 });
  const hi = S.horizonLine('custom');
  assert.ok(hi <= 0.25 + 1e-9);
  assert.equal(hi, 0.25);
  // Mid elevation sits between coast and the cap
  S.registerCustomPlace({ name: 'Hill', lat: 26, lon: 91, elev: 1800 });
  const mid = S.horizonLine('custom');
  assert.ok(mid > coast);
  assert.ok(mid < hi);
});

test('WS4 sun: sunrise left@horizon, noon top-middle, sunset right@horizon', () => {
  const h = 0.20; // a typical horizon fraction
  const horizonTop = (1 - h) * 100;

  const rise = S.sunPosition(6, h);
  assert.equal(rise.visible, true);
  assert.ok(rise.x < 10, 'sunrise near left');
  assert.ok(Math.abs(rise.y - horizonTop) < 0.2, 'sunrise on horizon');

  const noon = S.sunPosition(12.5, h); // midpoint of 6..19
  assert.equal(noon.visible, true);
  assert.ok(Math.abs(noon.x - 50) < 1, 'noon near horizontal middle');
  assert.ok(noon.y < 15, 'noon near top');
  assert.ok(noon.y < rise.y, 'noon higher than sunrise');

  const set = S.sunPosition(19, h);
  assert.equal(set.visible, true);
  assert.ok(set.x > 90, 'sunset near right');
  assert.ok(Math.abs(set.y - horizonTop) < 0.2, 'sunset on horizon');

  assert.equal(S.sunPosition(3, h).visible, false);
  assert.equal(S.sunPosition(22, h).visible, false);
});

test('WS4 moon shares the night arc and is visible after sunset', () => {
  const h = 0.16;
  const eve = S.moonPosition(19, h);
  assert.equal(eve.visible, true);
  assert.ok(eve.x < 10, 'moon rises left');
  const late = S.moonPosition(0.5, h);
  assert.equal(late.visible, true);
  assert.ok(late.x > 40 && late.x < 70, 'midnight moon mid-ish');
  assert.equal(S.moonPosition(12, h).visible, false);
});
