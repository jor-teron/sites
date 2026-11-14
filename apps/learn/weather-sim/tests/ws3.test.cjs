/* Weather Sim — tests/ws3.test.cjs: range clamp + place fallback (WS3)
   Pure helpers only. No network / DOM. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGround() {
  const root = path.join(__dirname, '..', 'js');
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'ground.js'), 'utf8'), sandbox, {
    filename: 'ground.js',
  });
  /* SEA_TEMP_* live in state.js — mirror them here for the clamp helper check. */
  const stateSrc = fs.readFileSync(path.join(root, 'state.js'), 'utf8');
  const mMin = stateSrc.match(/const SEA_TEMP_MIN\s*=\s*(-?\d+)/);
  const mMax = stateSrc.match(/const SEA_TEMP_MAX\s*=\s*(-?\d+)/);
  sandbox.SEA_TEMP_MIN = mMin ? Number(mMin[1]) : 0;
  sandbox.SEA_TEMP_MAX = mMax ? Number(mMax[1]) : 50;
  const liveSrc = fs.readFileSync(path.join(root, 'live.js'), 'utf8');
  const start = liveSrc.indexOf('function clampNum');
  const end = liveSrc.indexOf('/* ---- fetch with timeout');
  vm.runInContext(liveSrc.slice(start, end), sandbox, { filename: 'live-pure.js' });
  return sandbox;
}

const S = loadGround();

test('WS3 temperature range constants are 0…50', () => {
  assert.equal(S.SEA_TEMP_MIN, 0);
  assert.equal(S.SEA_TEMP_MAX, 50);
});

test('WS3 liveToSliders clamps sea-level temperature into 0…50', () => {
  const ranges = { tempMin: S.SEA_TEMP_MIN, tempMax: S.SEA_TEMP_MAX };
  // Old WS2-era hot value would have been 60; now clamps to 50
  const hot = S.liveToSliders({ temperature_2m: 55, time: '2026-11-09T12:00' }, 0, ranges);
  assert.equal(hot.temperature, 50);
  const cold = S.liveToSliders({ temperature_2m: -5, time: '2026-11-09T12:00' }, 0, ranges);
  assert.equal(cold.temperature, 0);
  const mid = S.liveToSliders({ temperature_2m: 22, time: '2026-11-09T12:00' }, 0, ranges);
  assert.equal(mid.temperature, 22);
});

test('WS3 unknown place key falls back to default when no custom', () => {
  assert.equal(S.resolvePlaceKey('coast'), 'default');
  assert.equal(S.resolvePlaceKey('himalaya'), 'default');
  assert.equal(S.resolvePlaceKey('deadsea'), 'default');
  assert.equal(S.resolvePlaceKey('nope'), 'default');
  assert.equal(S.resolvePlaceKey(null), 'default');
  assert.equal(S.elevationOf('coast'), 0); // elevationOf also falls through to default
  assert.equal(S.elevationOf('default'), 0);
  assert.equal(S.seaLine('default'), 0); // inland sea-level → no water
  assert.equal(S.hasCustomPlaceRegistered(), false);
});

test('WS3 unknown place key falls back to custom when registered', () => {
  S.registerCustomPlace({ name: 'Guwahati', lat: 26.18, lon: 91.75, elev: 55 });
  assert.equal(S.resolvePlaceKey('leadville'), 'custom');
  assert.equal(S.resolvePlaceKey('alps'), 'custom');
  assert.equal(S.resolvePlaceKey('custom'), 'custom');
  assert.equal(S.resolvePlaceKey('default'), 'default'); // known key still wins
});
