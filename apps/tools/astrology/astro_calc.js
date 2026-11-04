/* AS2 Astrology — offline astronomy. Paul Schlyter, "How to compute planetary positions" (stjarnhimlen.se):
   orbital elements as functions of d (days from 2000 Jan 0.0 UT), Kepler solve, Moon main perturbation terms,
   Jupiter/Saturn/Uranus perturbations, Pluto series (valid ~1885-2099). Results: tropical geocentric ecliptic
   longitude of date, accuracy ~1-2 arc-min (Moon) to well under 1° (planets). Asc/MC from GMST (IAU 1982 approx). */
(function (root) {
  'use strict';
  var R = Math.PI / 180;
  function n360(x) { x %= 360; return x < 0 ? x + 360 : x; }
  function sin(x) { return Math.sin(x * R); } function cos(x) { return Math.cos(x * R); }
  function atan2(y, x) { return Math.atan2(y, x) / R; }
  function dayNum(ms) { return ms / 86400000 + 2440587.5 - 2451543.5; } // JD - 2451543.5
  var EL = { // N, i, w, a, e, M  (each [c0, c1*d])
    Sun: [[0, 0], [0, 0], [282.9404, 4.70935e-5], [1, 0], [0.016709, -1.151e-9], [356.0470, 0.9856002585]],
    Moon: [[125.1228, -0.0529538083], [5.1454, 0], [318.0634, 0.1643573223], [60.2666, 0], [0.054900, 0], [115.3654, 13.0649929509]],
    Mercury: [[48.3313, 3.24587e-5], [7.0047, 5.00e-8], [29.1241, 1.01444e-5], [0.387098, 0], [0.205635, 5.59e-10], [168.6562, 4.0923344368]],
    Venus: [[76.6799, 2.46590e-5], [3.3946, 2.75e-8], [54.8910, 1.38374e-5], [0.723330, 0], [0.006773, -1.302e-9], [48.0052, 1.6021302244]],
    Mars: [[49.5574, 2.11081e-5], [1.8497, -1.78e-8], [286.5016, 2.92961e-5], [1.523688, 0], [0.093405, 2.516e-9], [18.6021, 0.5240207766]],
    Jupiter: [[100.4542, 2.76854e-5], [1.3030, -1.557e-7], [273.8777, 1.64505e-5], [5.20256, 0], [0.048498, 4.469e-9], [19.8950, 0.0830853001]],
    Saturn: [[113.6634, 2.38980e-5], [2.4886, -1.081e-7], [339.3939, 2.97661e-5], [9.55475, 0], [0.055546, -9.499e-9], [316.9670, 0.0334442282]],
    Uranus: [[74.0005, 1.3978e-5], [0.7733, 1.9e-8], [96.6612, 3.0565e-5], [19.18171, -1.55e-8], [0.047318, 7.45e-9], [142.5905, 0.011725806]],
    Neptune: [[131.7806, 3.0173e-5], [1.7700, -2.55e-7], [272.8461, -6.027e-6], [30.05826, 3.313e-8], [0.008606, 2.15e-9], [260.2471, 0.005995147]]
  };
  function elem(p, d) { var e = EL[p]; return e.map(function (v) { return v[0] + v[1] * d; }); }
  function kepler(M, e) { var E = M + (e / R) * sin(M) * (1 + e * cos(M));
    for (var k = 0; k < 8; k++) { var dE = (E - (e / R) * sin(E) - M) / (1 - e * cos(E)); E -= dE; if (Math.abs(dE) < 1e-6) break; } return E; }
  function orbit(p, d) { // heliocentric (geocentric for Moon) ecliptic rect coords
    var o = elem(p, d), N = o[0], i = o[1], w = o[2], a = o[3], e = o[4], M = n360(o[5]);
    var E = kepler(M, e), xv = a * (cos(E) - e), yv = a * Math.sqrt(1 - e * e) * sin(E);
    var v = atan2(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
    return { x: r * (cos(N) * cos(v + w) - sin(N) * sin(v + w) * cos(i)), y: r * (sin(N) * cos(v + w) + cos(N) * sin(v + w) * cos(i)),
      z: r * sin(v + w) * sin(i), r: r, M: M, w: w, N: N };
  }
  function sph(o) { return { lon: n360(atan2(o.y, o.x)), lat: atan2(o.z, Math.sqrt(o.x * o.x + o.y * o.y)), r: Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z) }; }
  function sun(d) { var o = elem('Sun', d), M = n360(o[5]), w = o[2], e = o[4], E = kepler(M, e);
    var xv = cos(E) - e, yv = Math.sqrt(1 - e * e) * sin(E), v = atan2(yv, xv), r = Math.sqrt(xv * xv + yv * yv), lon = n360(v + w);
    return { lon: lon, r: r, M: M, L: n360(M + w), x: r * cos(lon), y: r * sin(lon) }; }
  function moon(d) {
    var o = orbit('Moon', d), s = sph(o), S = sun(d), Mm = o.M, Ms = S.M, Lm = n360(o.N + o.w + Mm), Ls = S.L, D = Lm - Ls, F = Lm - o.N;
    var lon = s.lon - 1.274 * sin(Mm - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms) - 0.059 * sin(2 * Mm - 2 * D) - 0.057 * sin(Mm - 2 * D + Ms)
      + 0.053 * sin(Mm + 2 * D) + 0.046 * sin(2 * D - Ms) + 0.041 * sin(Mm - Ms) - 0.035 * sin(D) - 0.031 * sin(Mm + Ms)
      - 0.015 * sin(2 * F - 2 * D) + 0.011 * sin(Mm - 4 * D);
    return n360(lon);
  }
  function pluto(d) { var S = 50.03 + 0.033459652 * d, P = 238.95 + 0.003968789 * d;
    var lon = 238.9508 + 0.00400703 * d - 19.799 * sin(P) + 19.848 * cos(P) + 0.897 * sin(2 * P) - 4.956 * cos(2 * P) + 0.610 * sin(3 * P) + 1.211 * cos(3 * P)
      - 0.341 * sin(4 * P) - 0.190 * cos(4 * P) + 0.128 * sin(5 * P) - 0.034 * cos(5 * P) - 0.038 * sin(6 * P) + 0.031 * cos(6 * P)
      + 0.020 * sin(S - P) - 0.010 * cos(S - P);
    var lat = -3.9082 - 5.453 * sin(P) - 14.975 * cos(P) + 3.527 * sin(2 * P) + 1.673 * cos(2 * P) - 1.051 * sin(3 * P) + 0.328 * cos(3 * P)
      + 0.179 * sin(4 * P) - 0.292 * cos(4 * P) + 0.019 * sin(5 * P) + 0.100 * cos(5 * P) - 0.031 * sin(6 * P) - 0.026 * cos(6 * P) + 0.011 * cos(S - P);
    var r = 40.72 + 6.68 * sin(P) + 6.90 * cos(P) - 1.18 * sin(2 * P) - 0.03 * cos(2 * P) + 0.15 * sin(3 * P) - 0.14 * cos(3 * P);
    return { x: r * cos(lon) * cos(lat), y: r * sin(lon) * cos(lat), z: r * sin(lat) };
  }
  function planetHelio(p, d) {
    if (p === 'Pluto') return pluto(d);
    var o = orbit(p, d); if (p !== 'Jupiter' && p !== 'Saturn' && p !== 'Uranus') return o;
    var Mj = n360(19.8950 + 0.0830853001 * d), Ms = n360(316.9670 + 0.0334442282 * d), Mu = n360(142.5905 + 0.011725806 * d);
    var s = sph(o), dl = 0, db = 0;
    if (p === 'Jupiter') dl = -0.332 * sin(2 * Mj - 5 * Ms - 67.6) - 0.056 * sin(2 * Mj - 2 * Ms + 21) + 0.042 * sin(3 * Mj - 5 * Ms + 21)
      - 0.036 * sin(Mj - 2 * Ms) + 0.022 * cos(Mj - Ms) + 0.023 * sin(2 * Mj - 3 * Ms + 52) - 0.016 * sin(Mj - 5 * Ms - 69);
    if (p === 'Saturn') { dl = 0.812 * sin(2 * Mj - 5 * Ms - 67.6) - 0.229 * cos(2 * Mj - 4 * Ms - 2) + 0.119 * sin(Mj - 2 * Ms - 3)
      + 0.046 * sin(2 * Mj - 6 * Ms - 69) + 0.014 * sin(Mj - 3 * Ms + 32);
      db = -0.020 * cos(2 * Mj - 4 * Ms - 2) + 0.018 * sin(2 * Mj - 6 * Ms - 49); }
    if (p === 'Uranus') dl = 0.040 * sin(Ms - 2 * Mu + 6) + 0.035 * sin(Ms - 3 * Mu + 33) - 0.015 * sin(Mj - Mu + 20);
    var lon = s.lon + dl, lat = s.lat + db;
    return { x: s.r * cos(lon) * cos(lat), y: s.r * sin(lon) * cos(lat), z: s.r * sin(lat) };
  }
  var NAMES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  function lonOf(p, d) {
    if (p === 'Sun') return sun(d).lon; if (p === 'Moon') return moon(d);
    var h = planetHelio(p, d), S = sun(d); return n360(atan2(h.y + S.y, h.x + S.x));
  }
  function angles(ms, lat, lonE) { // Asc, MC (tropical) for UT ms, geographic lat/lon (east +)
    var jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525, d = jd - 2451543.5;
    var gmst = n360(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T);
    var ramc = n360(gmst + lonE), eps = 23.4393 - 3.563e-7 * d;
    var mc = n360(atan2(sin(ramc), cos(ramc) * cos(eps)));
    var asc = n360(atan2(cos(ramc), -(sin(ramc) * cos(eps) + Math.tan(lat * R) * sin(eps))));
    return { asc: asc, mc: mc };
  }
  function chart(ms, lat, lonE) {
    var d = dayNum(ms), out = { planets: [] };
    NAMES.forEach(function (p) { var l = lonOf(p, d), l2 = lonOf(p, d + 1), dl = ((l2 - l + 540) % 360) - 180;
      out.planets.push({ name: p, lon: l, retro: p !== 'Sun' && p !== 'Moon' && dl < 0 }); });
    if (lat != null && lonE != null) { var a = angles(ms, lat, lonE); out.asc = a.asc; out.mc = a.mc; }
    return out;
  }
  var api = { chart: chart, lonOf: lonOf, angles: angles, dayNum: dayNum, NAMES: NAMES, n360: n360 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AstroCalc = api;
})(this);
