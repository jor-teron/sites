/* My Day — Sun & Moon math (PD2.1). Pure functions, no network, no DOM.
   Sun: NOAA solar calculator formulas (Julian century, equation of time, declination,
   hour angle at zenith 90.833 deg for sunrise/sunset and 96 deg for civil twilight).
   Moon: phase from mean synodic month (29.530588853 d) after a known new moon (2000-01-06 18:14 UTC).
   All returned times are JS Date objects (absolute instants). */
(function(){
  var RAD = Math.PI / 180;
  var SYNODIC = 29.530588853;
  var NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14);

  function julianDay(ms) {
    return ms / 86400000 + 2440587.5;
  }

  /* Solar declination (deg) and equation of time (minutes) for a Julian day */
  function solarParams(jd) {
    var t = (jd - 2451545) / 36525;
    var l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
    var m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    var e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    var c = Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t));
    c += Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t);
    c += Math.sin(3 * m * RAD) * 0.000289;
    var trueLong = l0 + c;
    var omega = 125.04 - 1934.136 * t;
    var appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    var eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    var eps = eps0 + 0.00256 * Math.cos(omega * RAD);
    var decl = Math.asin(Math.sin(eps * RAD) * Math.sin(appLong * RAD)) / RAD;
    var y = Math.pow(Math.tan(eps * RAD / 2), 2);
    var eot = y * Math.sin(2 * l0 * RAD);
    eot -= 2 * e * Math.sin(m * RAD);
    eot += 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD);
    eot -= 0.5 * y * y * Math.sin(4 * l0 * RAD);
    eot -= 1.25 * e * e * Math.sin(2 * m * RAD);
    return { decl: decl, eot: 4 * eot / RAD };
  }

  /* Hour angle (deg) for a zenith angle, or null if the sun never reaches it */
  function hourAngle(lat, decl, zenith) {
    var cosH = (Math.cos(zenith * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) /
      (Math.cos(lat * RAD) * Math.cos(decl * RAD));
    if (cosH > 1 || cosH < -1) return null;
    return Math.acos(cosH) / RAD;
  }

  /* Sun events for the local calendar day containing `date` at lat/lon (east positive) */
  function sunTimes(date, lat, lon) {
    var day = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    var utcMidnight = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
    /* Noon in UTC minutes, refined twice with params at that instant */
    var noonMin = 720 - 4 * lon;
    for (var i = 0; i < 2; i++) {
      var p0 = solarParams(julianDay(utcMidnight + noonMin * 60000));
      noonMin = 720 - 4 * lon - p0.eot;
    }
    function at(min) {
      return new Date(utcMidnight + min * 60000);
    }
    /* Event offset from noon, refined once at the event's own instant */
    function event(zenith, sign) {
      var p = solarParams(julianDay(utcMidnight + noonMin * 60000));
      var h = hourAngle(lat, p.decl, zenith);
      if (h === null) return null;
      var guess = noonMin + sign * 4 * h;
      p = solarParams(julianDay(utcMidnight + guess * 60000));
      h = hourAngle(lat, p.decl, zenith);
      if (h === null) return null;
      var n = 720 - 4 * lon - p.eot;
      return at(n + sign * 4 * h);
    }
    var noon = at(noonMin);
    var sunrise = event(90.833, -1);
    var sunset = event(90.833, 1);
    return {
      noon: noon,
      midnight: new Date(noon.getTime() + 12 * 3600000),
      sunrise: sunrise,
      sunset: sunset,
      dawn: event(96, -1),
      dusk: event(96, 1),
      dayLength: sunrise && sunset ? sunset - sunrise : null
    };
  }

  var PHASES = [
    ['New moon', '🌑'], ['Waxing crescent', '🌒'], ['First quarter', '🌓'], ['Waxing gibbous', '🌔'],
    ['Full moon', '🌕'], ['Waning gibbous', '🌖'], ['Last quarter', '🌗'], ['Waning crescent', '🌘']
  ];

  /* Moon phase: fraction 0..1 (0 new, 0.5 full), name, emoji, % lit, next full and new moon */
  function moon(date) {
    var days = (date.getTime() - NEW_MOON_REF) / 86400000;
    var phase = ((days / SYNODIC) % 1 + 1) % 1;
    var lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    var idx = Math.round(phase * 8) % 8;
    var toNew = (1 - phase) * SYNODIC;
    var toFull = ((0.5 - phase + 1) % 1) * SYNODIC;
    return {
      phase: phase,
      name: PHASES[idx][0],
      emoji: PHASES[idx][1],
      lit: Math.round(lit * 100),
      nextNew: new Date(date.getTime() + toNew * 86400000),
      nextFull: new Date(date.getTime() + toFull * 86400000)
    };
  }

  var api = { sunTimes: sunTimes, moon: moon };
  if (typeof module !== 'undefined') module.exports = api;
  else window.MDSun = api;
})();
