/*
 * Weather Forecast — WX1b tests for the 7-day part of the data layer.
 * Loads the browser scripts in a vm context (no DOM needed).
 * Run: node --test apps/tools/weather-forecast/tests/
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dir = path.join(__dirname, "..");
const ctx = vm.createContext({});
for (const f of ["weather-forecast_config.js", "weather-forecast_format.js", "weather-forecast_data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
}

function payload(dayCount) {
  const time = [], codes = [], hi = [], lo = [], rain = [], sunrise = [], sunset = [];
  for (let i = 0; i < dayCount; i++) {
    const day = String(17 + i).padStart(2, "0");
    time.push(`2026-11-${day}`);
    codes.push(i === 0 ? 3 : 61);
    hi.push(25.3 + i);
    lo.push(17.3 - i);
    rain.push(20 + i);
    sunrise.push(`2026-11-${day}T06:12`);
    sunset.push(`2026-11-${day}T16:28`);
  }
  return {
    timezone: "Asia/Kolkata",
    current: {
      time: "2026-11-17T08:15",
      temperature_2m: 20.6,
      apparent_temperature: 22.2,
      relative_humidity_2m: 82,
      weather_code: 3,
      wind_speed_10m: 7,
      wind_gusts_10m: 18.7,
      wind_direction_10m: 100,
      is_day: 1,
    },
    current_units: { temperature_2m: "\u00B0C", wind_speed_10m: "km/h" },
    daily: {
      time,
      weather_code: codes,
      temperature_2m_max: hi,
      temperature_2m_min: lo,
      precipitation_probability_max: rain,
      sunrise,
      sunset,
    },
  };
}

test("normalize keeps current conditions and today's high/low", () => {
  const d = ctx.WXData.normalize(payload(7));
  assert.strictEqual(d.place, "Diphu");
  assert.strictEqual(d.timezone, "Asia/Kolkata");
  assert.strictEqual(d.now.temp, 20.6);
  assert.strictEqual(d.now.code, 3);
  assert.strictEqual(d.today.hi, 25.3);
  assert.strictEqual(d.today.lo, 17.3);
  assert.strictEqual(d.units.temp, "\u00B0C");
  assert.strictEqual(d.units.wind, "km/h");
});

test("normalize builds seven days with code, high/low, rain and sun times", () => {
  const d = ctx.WXData.normalize(payload(7));
  assert.strictEqual(d.days.length, 7);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.days[0])), {
    date: "2026-11-17",
    code: 3,
    hi: 25.3,
    lo: 17.3,
    rain: 20,
    sunrise: "2026-11-17T06:12",
    sunset: "2026-11-17T16:28",
  });
  assert.strictEqual(d.days[6].date, "2026-11-23");
});

test("normalize caps the list at seven days", () => {
  const d = ctx.WXData.normalize(payload(10));
  assert.strictEqual(d.days.length, 7);
});

test("normalize rejects a response without a current temperature", () => {
  const raw = payload(7);
  delete raw.current.temperature_2m;
  assert.throws(() => ctx.WXData.normalize(raw), /no current temperature/);
});

test("normalize tolerates missing daily arrays", () => {
  const raw = payload(7);
  delete raw.daily.precipitation_probability_max;
  const d = ctx.WXData.normalize(raw);
  assert.strictEqual(d.days.length, 7);
  assert.strictEqual(d.days[0].rain, undefined);
});
