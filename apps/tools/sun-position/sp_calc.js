/* SP1 Sun Position — NOAA solar position algorithm (Meeus / NOAA Solar Calculator).
   Pure maths, no DOM. Usable from the page or from node.
   Azimuth is degrees clockwise from north. Elevation is degrees above the horizon.
   Sunrise and sunset use a 90.833° zenith (sun radius + average refraction).
   Polar day and night return null rise/set and polar: 'day' or 'night'.
   Golden hour is elevation -4° to 6°; blue hour is -6° to -4°. */
(function (root) {
  'use strict';

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;
  var SUN_RISE_ZENITH = 90.833;
  var CIVIL_ZENITH = 96;
  var NAUTICAL_ZENITH = 102;
  var GOLDEN_HIGH_ZENITH = 84; /* elevation +6° */
  var GOLDEN_LOW_ZENITH = 94;  /* elevation -4° */
  var BLUE_LOW_ZENITH = 96;    /* elevation -6°, same as civil twilight */

  function rad(d) { return d * RAD; }
  function deg(r) { return r * DEG; }
  function sind(d) { return Math.sin(d * RAD); }
  function cosd(d) { return Math.cos(d * RAD); }
  function tand(d) { return Math.tan(d * RAD); }

  function norm360(d) {
    d = d % 360;
    if (d < 0) d += 360;
    return d;
  }

  /* Julian Day for a UTC calendar date + hours (may be fractional). Gregorian. */
  function julianDay(y, m, d, hourUtc) {
    if (hourUtc == null) hourUtc = 0;
    var yy = y, mm = m;
    if (mm <= 2) { yy -= 1; mm += 12; }
    var A = Math.floor(yy / 100);
    var B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + d + B - 1524.5 + hourUtc / 24;
  }

  function julianCentury(jd) {
    return (jd - 2451545.0) / 36525;
  }

  function geomMeanLongSun(t) {
    return norm360(280.46646 + t * (36000.76983 + t * 0.0003032));
  }

  function geomMeanAnomSun(t) {
    return 357.52911 + t * (35999.05029 - 0.0001537 * t);
  }

  function eccentEarthOrbit(t) {
    return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  }

  function sunEqOfCenter(t) {
    var M = geomMeanAnomSun(t);
    return sind(M) * (1.914602 - t * (0.004817 + 0.000014 * t))
      + sind(2 * M) * (0.019993 - 0.000101 * t)
      + sind(3 * M) * 0.000289;
  }

  function sunTrueLong(t) {
    return geomMeanLongSun(t) + sunEqOfCenter(t);
  }

  function sunTrueAnom(t) {
    return geomMeanAnomSun(t) + sunEqOfCenter(t);
  }

  function sunRadVector(t) {
    var e = eccentEarthOrbit(t);
    var v = sunTrueAnom(t);
    return (1.000001018 * (1 - e * e)) / (1 + e * cosd(v));
  }

  function sunApparentLong(t) {
    var omega = 125.04 - 1934.136 * t;
    return sunTrueLong(t) - 0.00569 - 0.00478 * sind(omega);
  }

  function meanObliquity(t) {
    var seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
    return 23 + (26 + (seconds / 60)) / 60;
  }

  function obliquityCorr(t) {
    var omega = 125.04 - 1934.136 * t;
    return meanObliquity(t) + 0.00256 * cosd(omega);
  }

  function sunDeclination(t) {
    return deg(Math.asin(sind(obliquityCorr(t)) * sind(sunApparentLong(t))));
  }

  function sunRightAscension(t) {
    var lam = sunApparentLong(t);
    var eps = obliquityCorr(t);
    return norm360(deg(Math.atan2(cosd(eps) * sind(lam), cosd(lam))));
  }

  function equationOfTime(t) {
    var eps = obliquityCorr(t);
    var l0 = geomMeanLongSun(t);
    var e = eccentEarthOrbit(t);
    var m = geomMeanAnomSun(t);
    var y = Math.pow(tand(eps / 2), 2);
    var E = y * sind(2 * l0)
      - 2 * e * sind(m)
      + 4 * e * y * sind(m) * cosd(2 * l0)
      - 0.5 * y * y * sind(4 * l0)
      - 1.25 * e * e * sind(2 * m);
    return 4 * deg(E); /* minutes */
  }

  /* NOAA atmospheric refraction in degrees, added to geometric elevation. */
  function refraction(elev) {
    var correction;
    if (elev > 85) {
      correction = 0;
    } else {
      var te = Math.tan(rad(elev));
      if (elev > 5) {
        correction = 58.1 / te - 0.07 / (te * te * te) + 0.000086 / (te * te * te * te * te);
      } else if (elev > -0.575) {
        correction = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
      } else {
        correction = -20.774 / te;
      }
      correction = correction / 3600;
    }
    return correction;
  }

  function hourAngleForZenith(lat, dec, zenith) {
    var arg = Math.cos(rad(zenith)) / (Math.cos(rad(lat)) * Math.cos(rad(dec)))
      - Math.tan(rad(lat)) * Math.tan(rad(dec));
    if (arg < -1) return { ha: null, polar: 'day' };
    if (arg > 1) return { ha: null, polar: 'night' };
    return { ha: deg(Math.acos(arg)), polar: null };
  }

  /* Minutes from 0h UTC on julian day jd (0h UTC). Two-pass, like the NOAA calculator. */
  function eventUtcMinutes(rise, jd, lat, lon, zenith) {
    function pass(t) {
      var eq = equationOfTime(t);
      var dec = sunDeclination(t);
      var h = hourAngleForZenith(lat, dec, zenith);
      if (h.ha == null) return { minutes: null, polar: h.polar };
      var ha = rise ? h.ha : -h.ha;
      return { minutes: 720 - 4 * (lon + ha) - eq, polar: null };
    }
    var first = pass(julianCentury(jd));
    if (first.minutes == null) return first;
    var second = pass(julianCentury(jd + first.minutes / 1440));
    if (second.minutes == null) return first;
    return second;
  }

  function parseOffsetString(s) {
    if (s == null) return null;
    if (s === 'IST') return 330;
    var m = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/i.exec(String(s).trim());
    if (!m) return null;
    var sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
  }

  function zonedParts(date, tz) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, hourCycle: 'h23'
    });
    var p = { year: '1970', month: '01', day: '01', hour: '00', minute: '00', second: '00' };
    var parts = fmt.formatToParts(date);
    var i;
    for (i = 0; i < parts.length; i++) {
      if (parts[i].type !== 'literal') p[parts[i].type] = parts[i].value;
    }
    var hour = parseInt(p.hour, 10);
    if (hour === 24) hour = 0;
    p.hourNum = hour;
    return p;
  }

  function offsetMinutesAt(date, tz) {
    if (typeof tz === 'number' && isFinite(tz)) return tz;
    var named = parseOffsetString(tz);
    if (named != null) return named;
    var p = zonedParts(date, tz);
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, p.hourNum, +p.minute, +p.second);
    return (asUtc - date.getTime()) / 60000;
  }

  function wallToUtcMs(y, m, d, hh, mm, ss, tz) {
    if (ss == null) ss = 0;
    var fixed = typeof tz === 'number' ? tz : parseOffsetString(tz);
    if (fixed != null) return Date.UTC(y, m - 1, d, hh, mm, ss) - fixed * 60000;
    var guess = Date.UTC(y, m - 1, d, hh, mm, ss);
    var off1 = offsetMinutesAt(new Date(guess), tz);
    var utc = guess - off1 * 60000;
    var off2 = offsetMinutesAt(new Date(utc), tz);
    return Date.UTC(y, m - 1, d, hh, mm, ss) - off2 * 60000;
  }

  function civilDateInTz(date, tz) {
    var fixed = typeof tz === 'number' ? tz : parseOffsetString(tz);
    if (fixed != null) {
      var s = new Date(date.getTime() + fixed * 60000);
      return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate() };
    }
    var p = zonedParts(date, tz);
    return { y: +p.year, m: +p.month, d: +p.day };
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function isoDateInTz(date, tz) {
    var c = civilDateInTz(date, tz);
    return c.y + '-' + pad2(c.m) + '-' + pad2(c.d);
  }

  /* Sun position at a UTC Date or millisecond timestamp. */
  function position(lat, lon, when) {
    var ms = when instanceof Date ? when.getTime() : when;
    var dt = new Date(ms);
    var hourUtc = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600 + dt.getUTCMilliseconds() / 3600000;
    var jd = julianDay(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), hourUtc);
    var t = julianCentury(jd);
    var eq = equationOfTime(t);
    var dec = sunDeclination(t);
    var utcMinutes = hourUtc * 60;
    var trueSolarTime = utcMinutes + eq + 4 * lon;
    trueSolarTime = ((trueSolarTime % 1440) + 1440) % 1440;
    var ha = trueSolarTime / 4 - 180;
    var csz = sind(lat) * sind(dec) + cosd(lat) * cosd(dec) * cosd(ha);
    if (csz > 1) csz = 1;
    if (csz < -1) csz = -1;
    var zenith = deg(Math.acos(csz));
    var elev = 90 - zenith;
    var elevApp = elev + refraction(elev);

    var azDenom = cosd(lat) * sind(zenith);
    var azimuth;
    if (Math.abs(azDenom) > 0.001) {
      var azCos = (sind(lat) * cosd(zenith) - sind(dec)) / azDenom;
      if (azCos < -1) azCos = -1;
      if (azCos > 1) azCos = 1;
      azimuth = 180 - deg(Math.acos(azCos));
      if (ha > 0) azimuth = -azimuth;
    } else {
      azimuth = lat > 0 ? 180 : 0;
    }
    azimuth = norm360(azimuth);

    return {
      julianDay: jd,
      declination: dec,
      equationOfTime: eq,
      hourAngle: ha,
      zenith: zenith,
      elevation: elev,
      elevationApp: elevApp,
      azimuth: azimuth,
      rightAscension: sunRightAscension(t),
      radiusAu: sunRadVector(t)
    };
  }

  /* Local civil date y-m-d is used as the NOAA date number; minutes are UTC. */
  function eventDate(y, m, d, lat, lon, zenith, rise) {
    var jd = julianDay(y, m, d, 0);
    var ev = eventUtcMinutes(rise, jd, lat, lon, zenith);
    if (ev.minutes == null) return { date: null, polar: ev.polar, utcMinutes: null };
    var ms = Date.UTC(y, m - 1, d, 0, 0, 0) + ev.minutes * 60000;
    return { date: new Date(ms), polar: null, utcMinutes: ev.minutes };
  }

  function solarNoonDate(y, m, d, lon) {
    var jd = julianDay(y, m, d, 0);
    function noon(t, longitude) {
      return 720 - longitude * 4 - equationOfTime(t);
    }
    var minutes = noon(julianCentury(jd), lon);
    minutes = noon(julianCentury(jd + minutes / 1440), lon);
    var ms = Date.UTC(y, m - 1, d, 0, 0, 0) + minutes * 60000;
    return { date: new Date(ms), utcMinutes: minutes };
  }

  function dayEvents(lat, lon, y, m, d) {
    var rise = eventDate(y, m, d, lat, lon, SUN_RISE_ZENITH, true);
    var set = eventDate(y, m, d, lat, lon, SUN_RISE_ZENITH, false);
    var noon = solarNoonDate(y, m, d, lon);
    var civilDawn = eventDate(y, m, d, lat, lon, CIVIL_ZENITH, true);
    var civilDusk = eventDate(y, m, d, lat, lon, CIVIL_ZENITH, false);
    var nautDawn = eventDate(y, m, d, lat, lon, NAUTICAL_ZENITH, true);
    var nautDusk = eventDate(y, m, d, lat, lon, NAUTICAL_ZENITH, false);
    var goldMornStart = eventDate(y, m, d, lat, lon, GOLDEN_LOW_ZENITH, true);
    var goldMornEnd = eventDate(y, m, d, lat, lon, GOLDEN_HIGH_ZENITH, true);
    var goldEveStart = eventDate(y, m, d, lat, lon, GOLDEN_HIGH_ZENITH, false);
    var goldEveEnd = eventDate(y, m, d, lat, lon, GOLDEN_LOW_ZENITH, false);
    var blueMornStart = eventDate(y, m, d, lat, lon, BLUE_LOW_ZENITH, true);
    var blueEveEnd = eventDate(y, m, d, lat, lon, BLUE_LOW_ZENITH, false);

    var polar = null;
    if (!rise.date && !set.date) {
      var noonPos = position(lat, lon, noon.date);
      polar = noonPos.elevationApp > -0.833 ? 'day' : 'night';
    } else if (rise.polar) polar = rise.polar;
    else if (set.polar) polar = set.polar;

    var dayLengthMinutes = null;
    if (polar === 'day') dayLengthMinutes = 1440;
    else if (polar === 'night') dayLengthMinutes = 0;
    else if (rise.date && set.date) dayLengthMinutes = (set.date.getTime() - rise.date.getTime()) / 60000;

    return {
      sunrise: rise.date,
      sunset: set.date,
      solarNoon: noon.date,
      civilDawn: civilDawn.date,
      civilDusk: civilDusk.date,
      nauticalDawn: nautDawn.date,
      nauticalDusk: nautDusk.date,
      goldenMorning: { start: goldMornStart.date, end: goldMornEnd.date },
      goldenEvening: { start: goldEveStart.date, end: goldEveEnd.date },
      blueMorning: { start: blueMornStart.date, end: goldMornStart.date },
      blueEvening: { start: goldEveEnd.date, end: blueEveEnd.date },
      dayLengthMinutes: dayLengthMinutes,
      polar: polar
    };
  }

  /* Shadow length for an object of the given height (same units). Null if the sun is down. */
  function shadow(height, elevation) {
    if (elevation == null || !isFinite(elevation) || elevation <= 0) return null;
    if (elevation >= 89.9) return { length: 0, ratio: 0 };
    var ratio = 1 / Math.tan(rad(elevation));
    return { length: height * ratio, ratio: ratio };
  }

  function shadowAzimuth(sunAzimuth) {
    return norm360(sunAzimuth + 180);
  }

  function cardinal(az) {
    var names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return names[Math.round(norm360(az) / 22.5) % 16];
  }

  function formatHms(hh, mm, ss, withSeconds) {
    return pad2(hh) + ':' + pad2(mm) + (withSeconds ? ':' + pad2(ss) : '');
  }

  function formatTime(date, tz, withSeconds) {
    if (!date) return '—';
    var fixed = typeof tz === 'number' ? tz : parseOffsetString(tz);
    if (fixed != null) {
      var s = new Date(date.getTime() + fixed * 60000);
      return formatHms(s.getUTCHours(), s.getUTCMinutes(), s.getUTCSeconds(), withSeconds);
    }
    try {
      var opts = { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone: tz };
      if (withSeconds) opts.second = '2-digit';
      return new Intl.DateTimeFormat('en-GB', opts).format(date);
    } catch (e) {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' }).format(date);
    }
  }

  function formatDayLength(mins) {
    if (mins == null || !isFinite(mins)) return '—';
    if (mins >= 1439.5) return '24h 00m';
    if (mins <= 0.5) return '0h 00m';
    var h = Math.floor(mins / 60);
    var m = Math.round(mins - h * 60);
    if (m === 60) { h += 1; m = 0; }
    return h + 'h ' + pad2(m) + 'm';
  }

  /* Samples of the sun's path, padded around the UTC date number. */
  function dayPath(lat, lon, y, m, d, stepMinutes) {
    if (!stepMinutes) stepMinutes = 10;
    var out = [];
    var start = Date.UTC(y, m - 1, d, 0, 0, 0);
    var min;
    for (min = -6 * 60; min <= 30 * 60; min += stepMinutes) {
      var ms = start + min * 60000;
      var p = position(lat, lon, ms);
      out.push({ azimuth: p.azimuth, elevation: p.elevationApp, ms: ms, hourAngle: p.hourAngle });
    }
    return out;
  }

  var api = {
    julianDay: julianDay,
    julianCentury: julianCentury,
    equationOfTime: equationOfTime,
    declination: sunDeclination,
    refraction: refraction,
    position: position,
    dayEvents: dayEvents,
    eventDate: eventDate,
    solarNoonDate: solarNoonDate,
    shadow: shadow,
    shadowAzimuth: shadowAzimuth,
    cardinal: cardinal,
    formatTime: formatTime,
    formatDayLength: formatDayLength,
    offsetMinutesAt: offsetMinutesAt,
    wallToUtcMs: wallToUtcMs,
    civilDateInTz: civilDateInTz,
    isoDateInTz: isoDateInTz,
    zonedParts: zonedParts,
    dayPath: dayPath,
    norm360: norm360,
    parseOffsetString: parseOffsetString,
    SUN_RISE_ZENITH: SUN_RISE_ZENITH
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SpCalc = api;
})(this);
