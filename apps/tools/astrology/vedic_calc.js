/* AS3 Astrology — offline Vedic (sidereal) maths on top of astro_calc.js. Pure functions, no DOM.
   Ayanamsa: linear approximations (Lahiri 23.853° at J2000, Raman 22.37°, KP 23.76°; precession 50.29"/yr).
   Rahu = mean lunar node, Ketu opposite. Vimshottari dasha from Moon nakshatra balance (365.25-day years).
   Panchang: tithi, nakshatra, yoga, karana at a given instant (not at sunrise). Traditional, for fun. */
(function (root) {
  'use strict';
  var AC = root.AstroCalc || (typeof require === 'function' ? require('./astro_calc.js') : null);
  function n360(x) { x %= 360; return x < 0 ? x + 360 : x; }
  var AYA0 = { lahiri: 23.853, raman: 22.370, kp: 23.760 }, RATE = 50.29 / 3600; // deg/yr
  function ayanamsa(ms, kind) { var yrs = (ms / 86400000 + 2440587.5 - 2451545) / 365.25; return (AYA0[kind] || AYA0.lahiri) + RATE * yrs; }
  function meanNode(ms) { return n360(125.1228 - 0.0529538083 * AC.dayNum(ms)); }
  var NAK_W = 360 / 27, LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'], YEARS = [7, 20, 6, 10, 7, 18, 16, 19, 17];
  function nakOf(lon) { var x = n360(lon) / NAK_W, i = Math.floor(x), f = x - i; return { i: i, pada: Math.floor(f * 4) + 1, frac: f, lord: LORDS[i % 9] }; }
  var VP = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  // Sidereal chart: planets (Sun..Saturn, Rahu, Ketu) + optional Lagna.
  function chart(ms, lat, lonE, kind) {
    var t = AC.chart(ms, lat, lonE), ay = ayanamsa(ms, kind), by = {}, out = { ayanamsa: ay, planets: [] };
    t.planets.forEach(function (p) { by[p.name] = p; });
    VP.forEach(function (n) { out.planets.push({ name: n, lon: n360(by[n].lon - ay), retro: by[n].retro }); });
    var ra = n360(meanNode(ms) - ay); out.planets.push({ name: 'Rahu', lon: ra, retro: true }, { name: 'Ketu', lon: n360(ra + 180), retro: true });
    if (t.asc != null) out.lagna = n360(t.asc - ay);
    return out;
  }
  var DAY = 86400000, YR = 365.25 * DAY;
  // Vimshottari: Maha (and Antar) dasha containing instant `at`, from Moon sidereal longitude at birth.
  function dasha(birthMs, moonSid, at) {
    var nk = nakOf(moonSid), li = nk.i % 9, start = birthMs - nk.frac * YEARS[li] * YR, guard = 0;
    while (guard++ < 30) { var end = start + YEARS[li] * YR; if (at < end) break; start = end; li = (li + 1) % 9; }
    var md = { lord: LORDS[li], start: start, end: start + YEARS[li] * YR }, s = start, ai = li;
    for (var k = 0; k < 9; k++) { var len = YEARS[li] * YEARS[ai] / 120 * YR; if (at < s + len) break; s += len; ai = (ai + 1) % 9; }
    return { maha: md, antar: { lord: LORDS[ai], start: s, end: s + YEARS[li] * YEARS[ai] / 120 * YR }, balanceYears: (1 - nk.frac) * YEARS[nk.i % 9] };
  }
  var TITHI = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];
  var YOGA = ['Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana',
    'Vajra', 'Siddhi', 'Vyatipata', 'Variyan', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti'];
  var KAR = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];
  function panchang(ms, kind) {
    var d = AC.dayNum(ms), s = AC.lonOf('Sun', d), m = AC.lonOf('Moon', d), ay = ayanamsa(ms, kind), el = n360(m - s);
    var ti = Math.floor(el / 12), shukla = ti < 15, k = Math.floor(el / 6);
    var tname = ti === 14 ? 'Purnima' : ti === 29 ? 'Amavasya' : TITHI[ti % 15];
    var kname = k === 0 ? 'Kimstughna' : k >= 57 ? ['Shakuni', 'Chatushpada', 'Naga'][k - 57] : KAR[(k - 1) % 7];
    var yi = Math.floor(n360(s + m - 2 * ay) / NAK_W);
    return { tithi: ti + 1, tithiName: tname, paksha: shukla ? 'Shukla' : 'Krishna', tithiLeft: 1 - (el / 12 - ti),
      nak: nakOf(m - ay), yoga: yi, yogaName: YOGA[yi], karana: kname, sunSid: n360(s - ay), moonSid: n360(m - ay), elong: el };
  }
  var api = { ayanamsa: ayanamsa, meanNode: meanNode, nakOf: nakOf, chart: chart, dasha: dasha, panchang: panchang, LORDS: LORDS, YEARS: YEARS, n360: n360 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VedicCalc = api;
})(this);
