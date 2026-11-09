/* Weather Sim — tests/ws2.test.cjs: live → slider mapping (WS2)
   Loads ground.js + the pure helpers from live.js in Node. No network.
   WS3: presets gone — inverse test registers temporary custom elevations;
   clamp ranges updated to 0…50. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadMapping() {
  const root = path.join(__dirname, '..', 'js');
  const sandbox = {
    console,
    // ground.js touches nothing else; live.js pure helpers need seaLevelFromLocal
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'ground.js'), 'utf8'), sandbox, {
    filename: 'ground.js',
  });
  /* Extract only the pure bits from live.js (avoid fetch / DOM). */
  const liveSrc = fs.readFileSync(path.join(root, 'live.js'), 'utf8');
  const start = liveSrc.indexOf('function clampNum');
  const end = liveSrc.indexOf('/* ---- fetch with timeout');
  if (start < 0 || end < 0) throw new Error('could not slice pure helpers from live.js');
  vm.runInContext(liveSrc.slice(start, end), sandbox, { filename: 'live-pure.js' });
  return sandbox;
}

const S = loadMapping();

test('WS2 seaLevelFromLocal is the inverse of temperatureAt', () => {
  // High place: ~3550 m (was Kedarnath preset; WS3 uses a registered custom)
  S.registerCustomPlace({ name: 'High pass', lat: 30.7, lon: 79.1, elev: 3550 });
  const seaHigh = 30;
  const localHigh = S.temperatureAt('custom', seaHigh);
  assert.equal(
    Math.round(S.seaLevelFromLocal(localHigh, S.elevationOf('custom')) * 100) / 100,
    Math.round(seaHigh * 100) / 100
  );
  // Basin: -430 m (was Dead Sea preset)
  S.registerCustomPlace({ name: 'Basin', lat: 31.5, lon: 35.5, elev: -430 });
  const seaLow = 28;
  const localLow = S.temperatureAt('custom', seaLow);
  assert.equal(
    Math.round(S.seaLevelFromLocal(localLow, S.elevationOf('custom')) * 100) / 100,
    Math.round(seaLow * 100) / 100
  );
  // Flat: elev 0
  assert.equal(S.seaLevelFromLocal(22, 0), 22);
});

test('WS2 liveToSliders maps local air to clamped sea-level slider', () => {
  const ranges = { tempMin: 0, tempMax: 50, humidityMax: 100, windMax: 100, cloudMax: 100, timeMax: 24 };
  // Guwahati-ish: ~50 m, local 29 °C → sea ≈ 29.3, rounds to 29
  const vals = S.liveToSliders({
    temperature_2m: 29,
    relative_humidity_2m: 78,
    wind_speed_10m: 12.4,
    cloud_cover: 55,
    time: '2026-11-09T14:05',
  }, 50, ranges);
  assert.equal(vals.humidity, 78);
  assert.equal(vals.wind, 12);
  assert.equal(vals.cloud, 55);
  assert.equal(vals.time, 14.1);
  // sea = 29 + 0.05*6.5 = 29.325 → 29
  assert.equal(vals.temperature, 29);
});

test('WS2 liveToSliders clamps wind and sea-level temperature', () => {
  const ranges = { tempMin: 0, tempMax: 50, humidityMax: 100, windMax: 100, cloudMax: 100, timeMax: 24 };
  // Very high + very warm local → sea would exceed 50 without clamp
  // elev 4000 m, local 40 → sea = 40 + 26 = 66 → clamp 50
  const hot = S.liveToSliders({
    temperature_2m: 40,
    relative_humidity_2m: 110,
    wind_speed_10m: 150,
    cloud_cover: -5,
    time: '2026-11-09T25:00', // bad hour → localHourFromIso still parses 25 → clamp
  }, 4000, ranges);
  assert.equal(hot.temperature, 50);
  assert.equal(hot.humidity, 100);
  assert.equal(hot.wind, 100);
  assert.equal(hot.cloud, 0);
  assert.equal(hot.time, 24);

  // Cold high place: local -10 at 3550 → sea = -10 + 23.075 ≈ 13 → stays 13 (above 0)
  const cold = S.liveToSliders({
    temperature_2m: -10,
    relative_humidity_2m: 40,
    wind_speed_10m: 5,
    cloud_cover: 10,
    time: '2026-11-09T06:30',
  }, 3550, ranges);
  assert.equal(cold.temperature, 13);
  assert.equal(cold.time, 6.5);

  // Colder still: local -30 at 3550 → sea ≈ -6.9 → clamp 0
  const colder = S.liveToSliders({
    temperature_2m: -30,
    relative_humidity_2m: 40,
    wind_speed_10m: 5,
    cloud_cover: 10,
    time: '2026-11-09T06:30',
  }, 3550, ranges);
  assert.equal(colder.temperature, 0);
});

test('WS2 registerCustomPlace makes elevationOf work; inland stays land', () => {
  S.registerCustomPlace({ name: 'Guwahati', lat: 26.18, lon: 91.75, elev: 55 });
  assert.equal(S.elevationOf('custom'), 55);
  assert.equal(S.seaLine('custom'), 0); // inland → no water band
  assert.equal(S.isElevated('custom'), false); // 55 <= 60
  // Negative elev still draws a water band (shore/basin); zero/positive stays land.
  S.registerCustomPlace({ name: 'Basin', lat: 31.5, lon: 35.5, elev: -200 });
  assert.ok(S.seaLine('custom') > 0);
  assert.equal(S.elevationOf('custom'), -200);
});
