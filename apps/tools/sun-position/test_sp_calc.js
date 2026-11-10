/* Node tests for Sun Position SP1 (sp_calc.js).
   Run: node test_sp_calc.js
   No DOM, no jsdom, no browser.
   Times and angles are checked against the NOAA Solar Calculator method
   (self-consistency plus published values for Delhi, Guwahati, London and Tromsø). */
'use strict';

var Sp = require('./sp_calc.js');
var fails = [];

function approx(name, got, expected, tol, unit) {
  if (got == null || expected == null || !isFinite(got) || !isFinite(expected) || Math.abs(got - expected) > tol) {
    fails.push(name + ' got ' + got + ' expected ' + expected + ' ±' + tol + (unit ? ' ' + unit : ''));
  } else {
    console.log('ok', name);
  }
}

function ok(name, cond, detail) {
  if (cond) console.log('ok', name);
  else fails.push(name + (detail ? (' ' + detail) : ''));
}

function minutesOf(date, tz) {
  if (!date) return null;
  var p = Sp.zonedParts ? null : null;
  var s = Sp.formatTime(date, tz, true); /* HH:MM:SS */
  var m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) {
    s = Sp.formatTime(date, tz, false);
    m = /^(\d{2}):(\d{2})$/.exec(s);
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]);
  }
  return (+m[1]) * 60 + (+m[2]) + (+m[3]) / 60;
}

function approxTime(name, date, tz, hh, mm, tolMin) {
  var got = minutesOf(date, tz);
  var exp = hh * 60 + mm;
  if (got == null) {
    fails.push(name + ' got null expected ' + Sp.formatTime({ dummy: 1 }, tz)); /* won't run */
    fails[fails.length - 1] = name + ' got null expected ' + pad(hh) + ':' + pad(mm);
    return;
  }
  var d = Math.abs(got - exp);
  /* wrap around midnight */
  if (d > 12 * 60) d = 1440 - d;
  if (d > tolMin) fails.push(name + ' got ' + Sp.formatTime(date, tz, true) + ' expected ' + pad(hh) + ':' + pad(mm) + ' ±' + tolMin + ' min');
  else console.log('ok', name, Sp.formatTime(date, tz, true));
}

function pad(n) { return n < 10 ? '0' + n : String(n); }

/* ---- Julian Day ---- */
approx('JD 2000-01-01 12:00 UT is J2000', Sp.julianDay(2000, 1, 1, 12), 2451545.0, 1e-6);
approx('JD 1858-11-17 00:00 UT (MJD 0)', Sp.julianDay(1858, 11, 17, 0), 2400000.5, 1e-6);

/* ---- Equation of time / declination around known dates ---- */
/* At J2000 noon, declination is about -23.03° (a few days after solstice). */
var tJ2000 = Sp.julianCentury(2451545.0);
approx('declination at J2000 noon', Sp.declination(tJ2000), -23.03, 0.05, 'deg');
/* Equation of time at J2000 is around -3 to -4 minutes (early January trough is later). */
ok('EoT at J2000 is a finite number of minutes', Math.abs(Sp.equationOfTime(tJ2000)) < 20);

/* June solstice 2026 is around 21 June: declination near +23.44°. */
var tJun = Sp.julianCentury(Sp.julianDay(2026, 6, 21, 8)); /* ~solstice */
approx('declination 2026-06-21', Sp.declination(tJun), 23.44, 0.15, 'deg');
var tDec = Sp.julianCentury(Sp.julianDay(2026, 12, 21, 20));
approx('declination 2026-12-21', Sp.declination(tDec), -23.44, 0.15, 'deg');
var tMar = Sp.julianCentury(Sp.julianDay(2026, 3, 20, 14.5)); /* March equinox 2026 ~14:46 UT */
approx('declination 2026-03-20 equinox', Sp.declination(tMar), 0, 0.3, 'deg');
var tSep = Sp.julianCentury(Sp.julianDay(2026, 9, 23, 0.1)); /* Sept equinox 2026 ~00:05 UT */
approx('declination 2026-09-23 equinox', Sp.declination(tSep), 0, 0.3, 'deg');

/* EoT early November is near its +16 min peak; mid-February near -14 min. */
var tNov = Sp.julianCentury(Sp.julianDay(2026, 11, 3, 12));
approx('EoT early November ~ +16 min', Sp.equationOfTime(tNov), 16.4, 1.0, 'min');
var tFeb = Sp.julianCentury(Sp.julianDay(2026, 2, 11, 12));
approx('EoT mid-February ~ -14 min', Sp.equationOfTime(tFeb), -14.2, 1.0, 'min');

/* ---- Refraction ---- */
approx('refraction high sun (~90°)', Sp.refraction(90), 0, 1e-9);
ok('refraction at 45° is a small fraction of a degree', Sp.refraction(45) > 0 && Sp.refraction(45) < 0.02);
ok('refraction at horizon is about 0.48° (NOAA formula at 0°)', Sp.refraction(0) > 0.45 && Sp.refraction(0) < 0.55, String(Sp.refraction(0)));

/* ---- Timezone helpers ---- */
approx('IST offset', Sp.parseOffsetString('IST'), 330, 0);
approx('UTC+5:30 offset', Sp.parseOffsetString('UTC+5:30'), 330, 0);
approx('UTC-7 offset', Sp.parseOffsetString('UTC-7'), -420, 0);
var istNoon = new Date(Sp.wallToUtcMs(2026, 11, 10, 12, 0, 0, 'Asia/Kolkata'));
ok('wall 12:00 IST is 06:30 UTC', istNoon.toISOString() === '2026-11-10T06:30:00.000Z', istNoon.toISOString());
approx('offset of Asia/Kolkata', Sp.offsetMinutesAt(istNoon, 'Asia/Kolkata'), 330, 0);
ok('civil date IST', (function () {
  var c = Sp.civilDateInTz(istNoon, 'Asia/Kolkata');
  return c.y === 2026 && c.m === 11 && c.d === 10;
})());

/* London DST: 2026-03-29 01:00 UT clocks go forward. 12:00 BST = 11:00 UT. */
var lonSummer = new Date(Sp.wallToUtcMs(2026, 7, 1, 12, 0, 0, 'Europe/London'));
ok('wall 12:00 BST is 11:00 UTC', lonSummer.toISOString() === '2026-07-01T11:00:00.000Z', lonSummer.toISOString());
var lonWinter = new Date(Sp.wallToUtcMs(2026, 1, 15, 12, 0, 0, 'Europe/London'));
ok('wall 12:00 GMT is 12:00 UTC', lonWinter.toISOString() === '2026-01-15T12:00:00.000Z', lonWinter.toISOString());

/* ---- Places ---- */
var DELHI = { name: 'Delhi', lat: 28.704, lon: 77.102, tz: 'Asia/Kolkata' };
var GUWAHATI = { name: 'Guwahati', lat: 26.145, lon: 91.736, tz: 'Asia/Kolkata' };
var LONDON = { name: 'London', lat: 51.507, lon: -0.128, tz: 'Europe/London' };
var TROMSO = { name: 'Tromsø', lat: 69.649, lon: 18.955, tz: 'Europe/Oslo' };

/* Solar noon azimuth should be due south in the northern mid-latitudes. */
function noonCheck(place, y, m, d, expectAz, elTol) {
  var ev = Sp.dayEvents(place.lat, place.lon, y, m, d);
  var p = Sp.position(place.lat, place.lon, ev.solarNoon);
  approx(place.name + ' ' + y + '-' + pad(m) + '-' + pad(d) + ' noon azimuth', p.azimuth, expectAz, 1.2, 'deg');
  /* Geometric noon elevation ≈ 90 - |lat - dec| */
  var t = Sp.julianCentury(p.julianDay);
  var dec = Sp.declination(t);
  var expectedEl = 90 - Math.abs(place.lat - dec);
  approx(place.name + ' noon elevation (geometric)', p.elevation, expectedEl, 0.15, 'deg');
  ok(place.name + ' noon elevationApp >= geometric', p.elevationApp >= p.elevation - 1e-9);
  return ev;
}

/* ---- Delhi 2026-11-10 (NOAA / IST) ---- */
/* IST meridian is 82.5°E; Delhi is 5.4° west of it ≈ 21.6 min. Early November EoT ≈ +16 min,
   so solar noon is about 12:00 + 21.6 - 16 ≈ 12:06 IST. */
var dDel = noonCheck(DELHI, 2026, 11, 10, 180);
approxTime('Delhi 2026-11-10 solar noon IST', dDel.solarNoon, DELHI.tz, 12, 6, 2);
/* Rise/set from the NOAA 90.833° zenith: mid-November Delhi is roughly 06:40 / 17:30 IST. */
approxTime('Delhi 2026-11-10 sunrise IST', dDel.sunrise, DELHI.tz, 6, 41, 3);
approxTime('Delhi 2026-11-10 sunset IST', dDel.sunset, DELHI.tz, 17, 31, 3);
ok('Delhi 2026-11-10 not polar', dDel.polar == null);
ok('Delhi day length ~10h 50m', dDel.dayLengthMinutes > 10 * 60 + 40 && dDel.dayLengthMinutes < 11 * 60 + 10, String(dDel.dayLengthMinutes));
ok('Delhi morning golden hour exists', dDel.goldenMorning.start && dDel.goldenMorning.end);
ok('Delhi civil dawn before sunrise', dDel.civilDawn && dDel.civilDawn < dDel.sunrise);
ok('Delhi civil dusk after sunset', dDel.civilDusk && dDel.civilDusk > dDel.sunset);

/* Elevation at sunrise (geometric) is about -0.833°; apparent should be near 0. */
var pRise = Sp.position(DELHI.lat, DELHI.lon, dDel.sunrise);
approx('Delhi sunrise geometric elevation', pRise.elevation, -0.833, 0.15, 'deg');
ok('Delhi sunrise apparent elev is above geometric and near the horizon',
  pRise.elevationApp > pRise.elevation && pRise.elevationApp > -0.6 && pRise.elevationApp < 0.2,
  String(pRise.elevationApp));

/* A published NOAA-style check: New Delhi, 2024-01-01, solar noon elevation ~38.4°,
   sunrise ~07:13, noon ~12:24, sunset ~17:35 IST (stjerneskinn / almanac, New Delhi 28.61, 77.21).
   Using 28.704, 77.102 (this app's Delhi) the times stay within a couple of minutes. */
var dDelJan = Sp.dayEvents(DELHI.lat, DELHI.lon, 2024, 1, 1);
approxTime('Delhi 2024-01-01 sunrise IST', dDelJan.sunrise, DELHI.tz, 7, 13, 3);
approxTime('Delhi 2024-01-01 solar noon IST', dDelJan.solarNoon, DELHI.tz, 12, 24, 3);
approxTime('Delhi 2024-01-01 sunset IST', dDelJan.sunset, DELHI.tz, 17, 35, 3);
var pNoonJan = Sp.position(DELHI.lat, DELHI.lon, dDelJan.solarNoon);
approx('Delhi 2024-01-01 noon apparent elev ~38.4°', pNoonJan.elevationApp, 38.4, 0.8, 'deg');

/* ---- Guwahati 2026-11-10 ---- */
/* 91.736°E is 9.236° east of 82.5° ≈ 37 min ahead, EoT ≈ +16, noon ≈ 12:00 - 37 + wait:
   clock noon is mean time at 82.5°. Solar noon at 91.736 is 4*(91.736-82.5)=36.9 min earlier
   than 12:00, then minus? Solar noon LST = 12:00 + 4*(82.5-lon) - EoT
   = 12:00 + 4*(-9.236) - 16 min? No: EoT is already subtracted in NOAA's 720-4*lon-EoT in UTC,
   then +330 for IST.
   720 - 4*91.736 - 16 = 720 - 366.9 - 16 = 337.1 min UTC = 5:37 UTC = 11:07 IST.
   Yes, eastern India has an earlier solar noon. */
var dGuw = noonCheck(GUWAHATI, 2026, 11, 10, 180);
approxTime('Guwahati 2026-11-10 solar noon IST', dGuw.solarNoon, GUWAHATI.tz, 11, 7, 2);
ok('Guwahati sunrise before Delhi (further east)', dGuw.sunrise < dDel.sunrise);
ok('Guwahati day length similar to Delhi', Math.abs(dGuw.dayLengthMinutes - dDel.dayLengthMinutes) < 20);

/* ---- London 2026-06-21 (BST, UTC+1) ---- */
/* Summer solstice in London: sunrise around 04:43, sunset around 21:21 BST, noon ~13:02. */
var dLon = noonCheck(LONDON, 2026, 6, 21, 180);
approxTime('London 2026-06-21 sunrise BST', dLon.sunrise, LONDON.tz, 4, 43, 3);
approxTime('London 2026-06-21 solar noon BST', dLon.solarNoon, LONDON.tz, 13, 2, 3);
approxTime('London 2026-06-21 sunset BST', dLon.sunset, LONDON.tz, 21, 21, 3);
ok('London June day length over 16h', dLon.dayLengthMinutes > 16 * 60 && dLon.dayLengthMinutes < 17 * 60, String(dLon.dayLengthMinutes));

/* London mid-winter is short but the sun still rises. */
var dLonDec = Sp.dayEvents(LONDON.lat, LONDON.lon, 2026, 12, 21);
ok('London December not polar', dLonDec.polar == null && dLonDec.sunrise && dLonDec.sunset);
ok('London December day length under 8h', dLonDec.dayLengthMinutes < 8 * 60 && dLonDec.dayLengthMinutes > 7 * 60, String(dLonDec.dayLengthMinutes));
approxTime('London 2026-12-21 sunrise GMT', dLonDec.sunrise, LONDON.tz, 8, 4, 4);
approxTime('London 2026-12-21 sunset GMT', dLonDec.sunset, LONDON.tz, 15, 53, 4);

/* ---- Tromsø polar day / night ---- */
var dTrJun = Sp.dayEvents(TROMSO.lat, TROMSO.lon, 2026, 6, 21);
ok('Tromsø 2026-06-21 polar day', dTrJun.polar === 'day' && !dTrJun.sunrise && !dTrJun.sunset, 'polar=' + dTrJun.polar);
ok('Tromsø midsummer day length 24h', dTrJun.dayLengthMinutes === 1440);
var pTrJun = Sp.position(TROMSO.lat, TROMSO.lon, dTrJun.solarNoon);
ok('Tromsø midsummer noon sun stays up', pTrJun.elevationApp > 0, String(pTrJun.elevationApp));
/* Even at solar midnight the sun stays up. */
var midn = new Date(dTrJun.solarNoon.getTime() + 12 * 3600000);
var pMidn = Sp.position(TROMSO.lat, TROMSO.lon, midn);
ok('Tromsø midsummer midnight sun still up', pMidn.elevationApp > 0, String(pMidn.elevationApp));

var dTrDec = Sp.dayEvents(TROMSO.lat, TROMSO.lon, 2026, 12, 21);
ok('Tromsø 2026-12-21 polar night', dTrDec.polar === 'night' && !dTrDec.sunrise && !dTrDec.sunset, 'polar=' + dTrDec.polar);
ok('Tromsø midwinter day length 0', dTrDec.dayLengthMinutes === 0);
var pTrDec = Sp.position(TROMSO.lat, TROMSO.lon, dTrDec.solarNoon);
ok('Tromsø midwinter noon sun stays down', pTrDec.elevationApp < 0, String(pTrDec.elevationApp));

/* 2026-11-10: Tromsø still has a short day (polar night starts ~27 Nov). */
var dTrNov = Sp.dayEvents(TROMSO.lat, TROMSO.lon, 2026, 11, 10);
ok('Tromsø 2026-11-10 still has a sunrise', dTrNov.polar == null && dTrNov.sunrise && dTrNov.sunset);
ok('Tromsø 2026-11-10 day is short (under 6h)', dTrNov.dayLengthMinutes < 6 * 60 && dTrNov.dayLengthMinutes > 60, String(dTrNov.dayLengthMinutes));

/* ---- NREL / NOAA-style position check (Golden, Colorado) ---- */
/* Reda & Andreas SPA example: 2003-10-17 12:30:30 MST (UTC-7), 39.742476 N, 105.178557 W.
   SPA zenith 50.11162°, azimuth 194.34024°. NOAA's simpler method agrees to a few tenths of a degree. */
var goldenMs = Date.UTC(2003, 9, 17, 19, 30, 30); /* 12:30:30-07:00 */
var pGold = Sp.position(39.742476, -105.178557, goldenMs);
approx('Golden 2003-10-17 12:30:30 MST zenith ~50.11°', pGold.zenith, 50.11162, 0.4, 'deg');
approx('Golden 2003-10-17 12:30:30 MST azimuth ~194.34°', pGold.azimuth, 194.34024, 0.5, 'deg');

/* ---- Shadow ---- */
var sh = Sp.shadow(10, 45);
approx('shadow ratio at 45°', sh.ratio, 1, 1e-6);
approx('shadow length 10 at 45°', sh.length, 10, 1e-6);
ok('no shadow when sun is down', Sp.shadow(10, -1) == null);
approx('shadow azimuth opposite the sun', Sp.shadowAzimuth(90), 270, 1e-9);

/* ---- Cardinal ---- */
ok('cardinal 0 is N', Sp.cardinal(0) === 'N');
ok('cardinal 90 is E', Sp.cardinal(90) === 'E');
ok('cardinal 45 is NE', Sp.cardinal(45) === 'NE');
ok('cardinal 359 is N', Sp.cardinal(359) === 'N');

/* ---- Day path samples stay finite ---- */
var path = Sp.dayPath(DELHI.lat, DELHI.lon, 2026, 11, 10, 20);
ok('day path has many samples', path.length > 20);
ok('some path samples are above the horizon', path.some(function (s) { return s.elevation > 0; }));
ok('some path samples are below the horizon', path.some(function (s) { return s.elevation < 0; }));

if (fails.length) {
  console.log('\nFAILED ' + fails.length + ' tests:');
  fails.forEach(function (f) { console.log('  -', f); });
  process.exit(1);
}
console.log('\nAll ' + 'tests passed.'.length + ' (see ok lines above).');
console.log('All tests passed.');
