/* Weather Sim — tests/ws6.test.cjs: Rain slider drives precip (WS6)
   Pure helpers only. No network / DOM / browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadLivePure() {
  const root = path.join(__dirname, '..', 'js');
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'ground.js'), 'utf8'), sandbox, {
    filename: 'ground.js',
  });
  const liveSrc = fs.readFileSync(path.join(root, 'live.js'), 'utf8');
  const start = liveSrc.indexOf('function clampNum');
  const end = liveSrc.indexOf('/* ---- fetch with timeout');
  if (start < 0 || end < 0) throw new Error('could not slice pure helpers from live.js');
  vm.runInContext(liveSrc.slice(start, end), sandbox, { filename: 'live-pure.js' });
  return sandbox;
}

function loadPrecipPure() {
  const root = path.join(__dirname, '..', 'js');
  const canvas = {
    getContext() {
      return {
        setTransform() {},
        clearRect() {},
        beginPath() {},
        stroke() {},
        fill() {},
        moveTo() {},
        lineTo() {},
        arc() {},
      };
    },
    clientWidth: 100,
    clientHeight: 100,
    width: 0,
    height: 0,
  };
  const sandbox = {
    console,
    state: { rain: 0, temperature: 20, cloud: 100, humidity: 100, wind: 10, time: 12, place: 'default' },
    document: {
      getElementById(id) {
        if (id === 'weather-canvas') return canvas;
        return null;
      },
    },
    matchMedia: () => ({ matches: false }),
    window: { addEventListener() {}, devicePixelRatio: 1 },
    // fallTarget is only used on resize/sync; stub for safety
    fallTarget: () => 0.16,
    windPx: () => 0,
  };
  vm.createContext(sandbox);
  /* $ is defined in state.js — provide a minimal stand-in */
  vm.runInContext('const $ = (id) => document.getElementById(id);', sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'precip.js'), 'utf8'), sandbox, {
    filename: 'precip.js',
  });
  return sandbox;
}

const L = loadLivePure();
const P = loadPrecipPure();

test('WS6 rain 0 means no precip even at 100% cloud', () => {
  P.state.rain = 0;
  P.state.cloud = 100;
  P.state.humidity = 100;
  P.state.temperature = 20;
  assert.equal(P.precipType(), 'none');
  assert.equal(P.precipAmount(), 0);
});

test('WS6 rain > 0 and temp <= 0 means snow', () => {
  P.state.rain = 2;
  P.state.temperature = 0;
  P.state.cloud = 40;
  assert.equal(P.precipType(), 'snow');
  assert.ok(P.precipAmount() > 0);

  P.state.temperature = -3;
  assert.equal(P.precipType(), 'snow');

  P.state.temperature = 1;
  assert.equal(P.precipType(), 'rain');
});

test('WS6 live maps 0.5 mm per 15 min to 2 mm/h', () => {
  const ranges = {
    tempMin: 0, tempMax: 50, humidityMax: 100, windMax: 100,
    cloudMax: 100, rainMax: 10, timeMax: 24,
  };
  const vals = L.liveToSliders({
    temperature_2m: 22,
    relative_humidity_2m: 60,
    wind_speed_10m: 8,
    cloud_cover: 70,
    precipitation: 0.5, // mm in preceding ~15 min
    time: '2026-11-09T10:00',
  }, 0, ranges);
  // 0.5 × 4 = 2.0 mm/h
  assert.equal(vals.rain, 2);
});

test('WS6 live rain clamps to 0…10', () => {
  const ranges = {
    tempMin: 0, tempMax: 50, humidityMax: 100, windMax: 100,
    cloudMax: 100, rainMax: 10, timeMax: 24,
  };
  const heavy = L.liveToSliders({
    temperature_2m: 20,
    relative_humidity_2m: 90,
    wind_speed_10m: 5,
    cloud_cover: 100,
    precipitation: 5, // 5 × 4 = 20 → clamp 10
    time: '2026-11-09T12:00',
  }, 0, ranges);
  assert.equal(heavy.rain, 10);

  const dry = L.liveToSliders({
    temperature_2m: 20,
    relative_humidity_2m: 40,
    wind_speed_10m: 5,
    cloud_cover: 10,
    precipitation: 0,
    time: '2026-11-09T12:00',
  }, 0, ranges);
  assert.equal(dry.rain, 0);

  // Missing precipitation → rain+snowfall/7 fallback
  const fromParts = L.liveToSliders({
    temperature_2m: 20,
    relative_humidity_2m: 40,
    wind_speed_10m: 5,
    cloud_cover: 10,
    rain: 0.25,
    snowfall: 0, // cm
    time: '2026-11-09T12:00',
  }, 0, ranges);
  // 0.25 × 4 = 1.0
  assert.equal(fromParts.rain, 1);
});

test('WS6 rainWord labels match the mm/h bands', () => {
  assert.equal(P.rainWord(0), 'none');
  assert.equal(P.rainWord(0.3), 'drizzle');
  assert.equal(P.rainWord(1.5), 'light');
  assert.equal(P.rainWord(4), 'moderate');
  assert.equal(P.rainWord(9), 'heavy');
  assert.equal(P.formatRain(0), '0 mm/h · none');
  assert.equal(P.formatRain(2.4), '2.4 mm/h · light');
});
