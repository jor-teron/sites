/*
 * Weather Forecast — WX1a tests for the pure formatting helpers.
 * Run: node --test apps/tools/weather-forecast/tests/
 */
const test = require("node:test");
const assert = require("node:assert");
const F = require("../weather-forecast_format.js");

test("wmo maps known codes", () => {
  assert.deepStrictEqual(F.wmo(0), ["Clear sky", "sun"]);
  assert.strictEqual(F.wmo(3)[1], "cloud");
  assert.strictEqual(F.wmo(63)[1], "rain");
  assert.strictEqual(F.wmo(95)[1], "storm");
});

test("wmo falls back on an unknown code", () => {
  assert.deepStrictEqual(F.wmo(1234), ["Unknown", "cloud"]);
  assert.deepStrictEqual(F.wmo(undefined), ["Unknown", "cloud"]);
});

test("roundTemp and fmtTemp", () => {
  assert.strictEqual(F.roundTemp(22.4), 22);
  assert.strictEqual(F.roundTemp(-0.6), -1);
  assert.strictEqual(F.roundTemp(null), null);
  assert.strictEqual(F.roundTemp(NaN), null);
  assert.strictEqual(F.fmtTemp(22.4), "22\u00B0");
  assert.strictEqual(F.fmtTemp(undefined), "\u2013");
});

test("fmtClock reads the local time from the API string", () => {
  assert.strictEqual(F.fmtClock("2026-11-17T14:05"), "14:05");
  assert.strictEqual(F.fmtClock("2026-11-17T09:00"), "09:00");
  assert.strictEqual(F.fmtClock(""), "\u2013");
});

test("fmtDay renders weekday and date", () => {
  assert.strictEqual(F.fmtDay("2026-11-17"), "Tue 17 Nov");
  assert.strictEqual(F.fmtDay("2026-01-01"), "Thu 1 Jan");
  assert.strictEqual(F.fmtDay("bad"), "\u2013");
});

test("freshness", () => {
  assert.strictEqual(F.freshness(0), "just now");
  assert.strictEqual(F.freshness(45e3), "just now");
  assert.strictEqual(F.freshness(60e3), "1 min ago");
  assert.strictEqual(F.freshness(9 * 60e3), "9 min ago");
  assert.strictEqual(F.freshness(3600e3), "1 h ago");
  assert.strictEqual(F.freshness(2.5 * 3600e3), "2 h ago");
  assert.strictEqual(F.freshness(-5), "just now");
});

test("isStale", () => {
  const now = 1e12;
  assert.strictEqual(F.isStale(now - 60e3, now, 10 * 60e3), false);
  assert.strictEqual(F.isStale(now - 11 * 60e3, now, 10 * 60e3), true);
  assert.strictEqual(F.isStale(0, now, 10 * 60e3), true);
});

test("direction and windText", () => {  assert.strictEqual(F.direction(0), "N");
  assert.strictEqual(F.direction(45), "NE");
  assert.strictEqual(F.direction(90), "E");
  assert.strictEqual(F.direction(180), "S");
  assert.strictEqual(F.direction(270), "W");
  assert.strictEqual(F.direction(359), "N");
  assert.strictEqual(F.direction(null), "");
  assert.strictEqual(F.windText(12.4, 45, "km/h"), "12 km/h NE");
  assert.strictEqual(F.windText(8, null, "km/h"), "8 km/h");
  assert.strictEqual(F.windText(null, 90, "km/h"), "\u2013");
});

test("weekday and pct", () => {
  assert.strictEqual(F.weekday("2026-11-17"), "Tue");
  assert.strictEqual(F.weekday("2026-11-22"), "Sun");
  assert.strictEqual(F.weekday("bad"), "\u2013");
  assert.strictEqual(F.pct(20), "20%");
  assert.strictEqual(F.pct(0.4), "40%");
  assert.strictEqual(F.pct(null), "");
});
