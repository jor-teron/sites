/* SP1 Sun Position — NOAA solar position algorithm (Meeus / NOAA Solar Calculator).
   Pure maths, no DOM. Usable from the page or from node.
   Azimuth is degrees clockwise from north. Elevation is degrees above the horizon.
   Sunrise and sunset use a 90.833° zenith (sun radius + average refraction).
   Polar day and night return null rise/set and polar: 'day' or 'night'.
   Golden hour is elevation -4° to 6°; blue hour is -6° to -4°.
   SP2: year daylight series, solstices/equinoxes, monthly sun-path samples, best fixed-panel tilt.
   SP3: moon position, phase, illumination, moonrise and moonset. */
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


  function daysInYear(year) {
    return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
  }

  function ymdFromDoy(year, doy) {
    var ms = Date.UTC(year, 0, doy);
    var d = new Date(ms);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), doy: doy };
  }

  function localMinutesFromDate(date, tz) {
    if (!date) return null;
    var fixed = typeof tz === 'number' ? tz : parseOffsetString(tz);
    if (fixed != null) {
      var s = new Date(date.getTime() + fixed * 60000);
      return s.getUTCHours() * 60 + s.getUTCMinutes() + s.getUTCSeconds() / 60;
    }
    var p = zonedParts(date, tz);
    return p.hourNum * 60 + (+p.minute) + (+p.second) / 60;
  }

  /* One entry per local civil day of the year, with sunrise/sunset as minutes from local midnight. */
  function yearDaylight(lat, lon, year, tz) {
    var n = daysInYear(year), out = [], i, ymd, ev, noonPos, riseMin, setMin, dec;
    for (i = 1; i <= n; i++) {
      ymd = ymdFromDoy(year, i);
      ev = dayEvents(lat, lon, ymd.y, ymd.m, ymd.d);
      noonPos = position(lat, lon, ev.solarNoon);
      dec = noonPos.declination;
      riseMin = ev.sunrise ? localMinutesFromDate(ev.sunrise, tz) : null;
      setMin = ev.sunset ? localMinutesFromDate(ev.sunset, tz) : null;
      /* Guard a DST or zone-edge wrap so sunset is after sunrise on the plot when possible. */
      if (riseMin != null && setMin != null && setMin < riseMin) setMin += 1440;
      out.push({
        doy: i, y: ymd.y, m: ymd.m, d: ymd.d,
        sunriseMin: riseMin,
        sunsetMin: setMin,
        dayLengthMinutes: ev.dayLengthMinutes,
        polar: ev.polar,
        declination: dec,
        solarNoon: ev.solarNoon,
        sunrise: ev.sunrise,
        sunset: ev.sunset
      });
    }
    return out;
  }

  function solsticesEquinoxes(series) {
    if (!series || !series.length) return {};
    var maxI = 0, minI = 0, i, a, b, eq = [];
    for (i = 1; i < series.length; i++) {
      if (series[i].declination > series[maxI].declination) maxI = i;
      if (series[i].declination < series[minI].declination) minI = i;
      a = series[i - 1].declination;
      b = series[i].declination;
      if (a <= 0 && b > 0) eq.push({ kind: 'march', day: series[i] });
      if (a >= 0 && b < 0) eq.push({ kind: 'september', day: series[i] });
    }
    var maxDec = series[maxI], minDec = series[minI];
    /* June solstice is the northern-maximum declination (around 21 June), December the minimum. */
    return {
      june: maxDec,
      december: minDec,
      march: (eq[0] && eq[0].kind === 'march' ? eq[0].day : (eq[0] ? eq[0].day : null)),
      september: (function () {
        var j;
        for (j = 0; j < eq.length; j++) if (eq[j].kind === 'september') return eq[j].day;
        return eq[1] ? eq[1].day : null;
      })(),
      longest: series.reduce(function (b, d) {
        if (d.dayLengthMinutes == null) return b;
        if (!b || d.dayLengthMinutes > b.dayLengthMinutes) return d;
        return b;
      }, null),
      shortest: series.reduce(function (b, d) {
        if (d.dayLengthMinutes == null) return b;
        if (!b || d.dayLengthMinutes < b.dayLengthMinutes) return d;
        return b;
      }, null)
    };
  }

  /* Polar sky samples: 21st of each month, and clock-hour lines, elevation apparent. */
  function sunPathDiagram(lat, lon, year, tz) {
    var months = [], hours = {}, h, m, ymd, ev, min, instant, pos, pts, step = 10;
    for (m = 1; m <= 12; m++) {
      ymd = { y: year, m: m, d: 21 };
      ev = dayEvents(lat, lon, ymd.y, ymd.m, ymd.d);
      pts = [];
      for (min = 0; min < 1440; min += step) {
        instant = new Date(wallToUtcMs(year, m, 21, Math.floor(min / 60), min % 60, 0, tz));
        pos = position(lat, lon, instant);
        pts.push({ min: min, azimuth: pos.azimuth, elevation: pos.elevationApp });
      }
      months.push({ month: m, polar: ev.polar, points: pts });
    }
    for (h = 0; h <= 23; h++) {
      pts = [];
      for (m = 1; m <= 12; m++) {
        instant = new Date(wallToUtcMs(year, m, 21, h, 0, 0, tz));
        pos = position(lat, lon, instant);
        pts.push({ month: m, azimuth: pos.azimuth, elevation: pos.elevationApp });
      }
      hours[h] = pts;
    }
    return { months: months, hours: hours };
  }

  function sunVector(az, el) {
    var e = el * RAD, a = az * RAD;
    return { x: Math.cos(e) * Math.sin(a), y: Math.cos(e) * Math.cos(a), z: Math.sin(e) };
  }

  function panelNormal(tilt, azFace) {
    var t = tilt * RAD, a = azFace * RAD;
    return { x: Math.sin(t) * Math.sin(a), y: Math.sin(t) * Math.cos(a), z: Math.cos(t) };
  }

  /* Precompute unit sun vectors (sun up only) for a geometric year-round panel search. */
  function panelSunSamples(lat, lon, year) {
    var out = [], doy, ymd, ev, min, instant, pos, s;
    var stepDay = daysInYear(year) === 366 ? 16 : 15;
    for (doy = 8; doy <= daysInYear(year); doy += stepDay) {
      ymd = ymdFromDoy(year, doy);
      ev = dayEvents(lat, lon, ymd.y, ymd.m, ymd.d);
      if (ev.polar === 'night') continue;
      for (min = 0; min < 1440; min += 30) {
        instant = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, 0, 0) + (min - 12 * 60) * 60000);
        pos = position(lat, lon, instant);
        if (pos.elevationApp <= 0) continue;
        s = sunVector(pos.azimuth, pos.elevationApp);
        out.push(s);
      }
    }
    return out;
  }

  function panelScoreSamples(samples, tilt, azFace) {
    var n = panelNormal(tilt, azFace), score = 0, i, s, c;
    for (i = 0; i < samples.length; i++) {
      s = samples[i];
      c = s.x * n.x + s.y * n.y + s.z * n.z;
      if (c > 0) score += c;
    }
    return score;
  }

  /* Geometric year-round tilt and azimuth (clear-sky cosine of incidence). No weather. */
  function bestPanel(lat, lon, year) {
    var samples = panelSunSamples(lat, lon, year);
    var facing = lat >= 0 ? 180 : 0;
    var tilt, az, bestT = 0, bestAz = facing, bestS = -1, sc;
    if (!samples.length) return { tilt: 0, azimuth: facing, facing: facing === 180 ? 'south' : 'north', score: 0 };
    for (tilt = 0; tilt <= 90; tilt += 2) {
      sc = panelScoreSamples(samples, tilt, facing);
      if (sc > bestS) { bestS = sc; bestT = tilt; }
    }
    var t0 = Math.max(0, bestT - 2), t1 = Math.min(90, bestT + 2);
    for (tilt = t0; tilt <= t1; tilt += 1) {
      sc = panelScoreSamples(samples, tilt, facing);
      if (sc > bestS) { bestS = sc; bestT = tilt; }
    }
    for (az = facing - 30; az <= facing + 30; az += 5) {
      sc = panelScoreSamples(samples, bestT, norm360(az));
      if (sc > bestS) { bestS = sc; bestAz = norm360(az); }
    }
    for (az = bestAz - 4; az <= bestAz + 4; az += 1) {
      sc = panelScoreSamples(samples, bestT, norm360(az));
      if (sc > bestS) { bestS = sc; bestAz = norm360(az); }
    }
    return {
      tilt: bestT,
      azimuth: bestAz,
      facing: (bestAz > 90 && bestAz < 270) ? 'south' : 'north',
      score: bestS
    };
  }


  /* ---- Moon (Meeus, Astronomical Algorithms ch. 47, main terms; node-testable) ---- */
  /* Periodic terms: [D, M, Mp, F, lon 1e-6 deg, dist 0.001 km, lat 1e-6 deg]. M terms need the E factor. */
  var MOON_LR = [
    [0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],
    [0,0,2,0,213618,-569925],[0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],
    [2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],
    [2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],
    [0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],
    [0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],
    [4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],
    [1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],
    [2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],
    [0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],
    [1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],[0,1,2,0,-2120,5751],
    [0,2,0,0,-2069,0],[2,-2,-1,0,2048,-4950],[2,0,1,-2,-1773,4130],
    [2,0,0,2,-1595,0],[4,-1,-1,0,1215,-3958],[0,0,2,2,-1110,0],
    [3,0,-1,0,-892,3258],[2,1,1,0,-810,2616],[4,-1,-2,0,759,-1897],
    [0,2,-1,0,-713,-2217],[2,2,-1,0,-700,2450],[2,1,-2,0,691,0],
    [2,-1,0,-2,596,0],[4,0,1,0,549,-1423],[0,0,4,0,537,-1117],
    [4,-1,0,0,520,-1571],[1,0,-2,0,-487,-1739],[2,1,0,-2,-399,0],
    [0,0,2,-2,-381,0],[1,1,1,0,351,0],[3,0,-2,0,-340,0],
    [4,0,-3,0,330,0],[2,-1,2,0,327,0],[0,2,1,0,-323,1165],
    [1,1,-1,0,299,0],[2,0,3,0,294,0],[2,0,-1,-2,0,8752]
  ];
  var MOON_B = [
    [0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],
    [2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],
    [2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],
    [2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],
    [2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794],
    [0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],
    [0,1,1,-1,-1410],[0,1,0,-1,-1344],[1,0,0,-1,-1335],[0,0,3,1,1107],
    [4,0,0,-1,1021],[4,0,-1,1,833],[0,0,2,3,777],[4,0,-2,1,671],
    [2,0,0,-3,607],[2,0,2,-1,596],[2,-1,1,-1,491],[2,0,-2,1,-451],
    [0,0,3,-1,439],[2,0,2,1,422],[2,0,-3,-1,421],[2,1,-1,1,-366],
    [2,1,0,1,-351],[4,0,0,1,331],[2,-1,1,1,315],[2,-2,0,-1,302],
    [0,0,1,3,-283],[2,1,1,-1,-229],[1,1,0,-1,223],[1,1,0,1,223],
    [0,1,-2,-1,-220],[2,1,-1,-1,-220],[1,0,1,1,-185],[2,-1,-2,-1,181],
    [0,1,2,1,-177],[4,0,-2,-1,176],[4,-1,-1,-1,166],[1,0,1,-1,-164],
    [4,0,1,-1,132],[1,0,-1,-1,-119],[4,-1,0,-1,115],[2,-2,0,1,107]
  ];

  function normDeg(d) { return ((d % 360) + 360) % 360; }

  function moonGeocentric(jd) {
    var T = julianCentury(jd);
    var Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T * T * T / 538841 - T * T * T * T / 65194000;
    var D  = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868 - T * T * T * T / 113065000;
    var M  = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T * T * T / 24490000;
    var Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699 - T * T * T * T / 14712000;
    var F  = 93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - T * T * T / 3526000 + T * T * T * T / 863310000;
    var E = 1 - 0.002516 * T - 0.0000074 * T * T;
    var sl = 0, sr = 0, sb = 0, i, t, arg, fE;
    for (i = 0; i < MOON_LR.length; i++) {
      t = MOON_LR[i];
      arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F;
      fE = 1;
      if (Math.abs(t[1]) === 1) fE = E;
      else if (Math.abs(t[1]) === 2) fE = E * E;
      sl += t[4] * fE * sind(arg);
      sr += t[5] * fE * cosd(arg);
    }
    for (i = 0; i < MOON_B.length; i++) {
      t = MOON_B[i];
      arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F;
      fE = 1;
      if (Math.abs(t[1]) === 1) fE = E;
      else if (Math.abs(t[1]) === 2) fE = E * E;
      sb += t[4] * fE * sind(arg);
    }
    var lon = Lp + sl / 1000000;
    var lat = sb / 1000000;
    var dist = 385000.56 + sr / 1000; /* km */
    /* Light-time / aberration not applied; add nutation in longitude. */
    var Omega = 125.04452 - 1934.136261 * T;
    var Ls = 280.4665 + 36000.7698 * T;
    var dpsi = (-17.20 * sind(Omega) - 1.32 * sind(2 * Ls) - 0.23 * sind(2 * Lp) + 0.21 * sind(2 * Omega)) / 3600;
    var deps = (9.20 * cosd(Omega) + 0.57 * cosd(2 * Ls) + 0.10 * cosd(2 * Lp) - 0.09 * cosd(2 * Omega)) / 3600;
    var eps = meanObliquity(T) + deps;
    var lam = lon + dpsi;
    var beta = lat;
    var ra = norm360(deg(Math.atan2(sind(lam) * cosd(eps) - tand(beta) * sind(eps), cosd(lam))));
    var dec = deg(Math.asin(sind(beta) * cosd(eps) + cosd(beta) * sind(eps) * sind(lam)));
    var hp = deg(Math.asin(Math.min(1, 6378.14 / dist))); /* horizontal parallax, deg */
    return {
      lon: normDeg(lam), lat: beta, distanceKm: dist, ra: ra, dec: dec,
      parallax: hp, nutationLon: dpsi, obliquity: eps, meanElongation: normDeg(D)
    };
  }

  function greenwichSidereal(jd) {
    var T = julianCentury(jd);
    return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000);
  }

  /* Moon (and generic equatorial) topocentric azimuth / elevation at a UTC instant. */
  function moonPosition(lat, lon, when) {
    var ms = when instanceof Date ? when.getTime() : when;
    var dt = new Date(ms);
    var hourUtc = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600 + dt.getUTCMilliseconds() / 3600000;
    var jd = julianDay(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), hourUtc);
    var g = moonGeocentric(jd);
    var lst = norm360(greenwichSidereal(jd) + lon + (g.nutationLon || 0) * cosd(g.obliquity));
    var ha = lst - g.ra;
    var csz = sind(lat) * sind(g.dec) + cosd(lat) * cosd(g.dec) * cosd(ha);
    if (csz > 1) csz = 1;
    if (csz < -1) csz = -1;
    var zenith = deg(Math.acos(csz));
    var elev = 90 - zenith;
    /* Topocentric: subtract horizontal parallax in altitude, then add refraction. */
    var elevTopo = elev - g.parallax * cosd(elev);
    var elevApp = elevTopo + refraction(elevTopo);
    var azDenom = cosd(lat) * sind(zenith);
    var azimuth;
    if (Math.abs(azDenom) > 0.001) {
      var azCos = (sind(lat) * cosd(zenith) - sind(g.dec)) / azDenom;
      if (azCos < -1) azCos = -1;
      if (azCos > 1) azCos = 1;
      azimuth = 180 - deg(Math.acos(azCos));
      if (ha > 0) azimuth = -azimuth;
    } else {
      azimuth = lat > 0 ? 180 : 0;
    }
    azimuth = norm360(azimuth);
    var ph = moonPhaseAt(jd, g);
    return {
      azimuth: azimuth,
      elevation: elevTopo,
      elevationApp: elevApp,
      ra: g.ra,
      dec: g.dec,
      distanceKm: g.distanceKm,
      parallax: g.parallax,
      lon: g.lon,
      lat: g.lat,
      illumination: ph.illumination,
      phaseAngle: ph.phaseAngle,
      waxing: ph.waxing,
      phaseName: ph.phaseName
    };
  }

  function moonPhaseAt(jd, g) {
    if (!g) g = moonGeocentric(jd);
    var t = julianCentury(jd);
    var sunLon = sunApparentLong(t);
    var Rkm = sunRadVector(t) * 149597870.7;
    var psi = deg(Math.acos(Math.max(-1, Math.min(1, cosd(g.lat) * cosd(g.lon - sunLon)))));
    var i = deg(Math.atan2(Rkm * sind(psi), g.distanceKm - Rkm * cosd(psi)));
    var k = (1 + Math.cos(i * RAD)) / 2;
    if (k < 0) k = 0;
    if (k > 1) k = 1;
    var elong = normDeg(g.lon - sunLon);
    var waxing = elong < 180;
    var name;
    if (k < 0.04) name = 'New';
    else if (k < 0.46) name = waxing ? 'Waxing crescent' : 'Waning crescent';
    else if (k < 0.54) name = waxing ? 'First quarter' : 'Last quarter';
    else if (k < 0.96) name = waxing ? 'Waxing gibbous' : 'Waning gibbous';
    else name = 'Full';
    return { illumination: k, phaseAngle: i, waxing: waxing, phaseName: name, elongation: elong };
  }

  /* Rise/set: the topocentric apparent altitude of the Moon's limb crosses the horizon.
     Target geometric topocentric elevation ≈ -0.5667° (refraction); we search apparent elevation = 0
     after applying parallax + refraction, which is close to the usual almanac convention. */
  function moonEvents(lat, lon, y, m, d, tz) {
    var start = wallToUtcMs(y, m, d, 0, 0, 0, tz);
    var nxt = new Date(Date.UTC(y, m - 1, d + 1));
    var end = wallToUtcMs(nxt.getUTCFullYear(), nxt.getUTCMonth() + 1, nxt.getUTCDate(), 0, 0, 0, tz);
    if (!(end > start)) end = start + 24 * 3600000;
    /* Pad a little so a crossing just after midnight is not missed. */
    var from = start - 30 * 60000, to = end + 30 * 60000;
    var step = 10 * 60000;
    var rise = null, set = null, transit = null, maxEl = -90;
    var prevT = from, prevEl, pos, t, el, den, frac, cross;
    pos = moonPosition(lat, lon, prevT);
    prevEl = pos.elevationApp;
    for (t = from + step; t <= to; t += step) {
      pos = moonPosition(lat, lon, t);
      el = pos.elevationApp;
      if (el > maxEl) { maxEl = el; transit = t; }
      if (prevEl < 0 && el >= 0 && !rise) {
        den = el - prevEl;
        frac = den === 0 ? 0 : (0 - prevEl) / den;
        cross = prevT + frac * (t - prevT);
        if (cross >= start && cross < end) rise = new Date(cross);
      }
      if (prevEl >= 0 && el < 0 && !set) {
        den = el - prevEl;
        frac = den === 0 ? 0 : (0 - prevEl) / den;
        cross = prevT + frac * (t - prevT);
        if (cross >= start && cross < end) set = new Date(cross);
      }
      prevT = t; prevEl = el;
    }
    /* Second pass if the first crossing was skipped because we already stored one of the other kind only. */
    return {
      moonrise: rise,
      moonset: set,
      transit: transit ? new Date(transit) : null,
      polar: (!rise && !set) ? (maxEl >= 0 ? 'up' : 'down') : null
    };
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
    SUN_RISE_ZENITH: SUN_RISE_ZENITH,
    daysInYear: daysInYear,
    ymdFromDoy: ymdFromDoy,
    localMinutesFromDate: localMinutesFromDate,
    yearDaylight: yearDaylight,
    solsticesEquinoxes: solsticesEquinoxes,
    sunPathDiagram: sunPathDiagram,
    bestPanel: bestPanel,
    moonGeocentric: moonGeocentric,
    moonPosition: moonPosition,
    moonPhaseAt: moonPhaseAt,
    moonEvents: moonEvents,
    greenwichSidereal: greenwichSidereal
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SpCalc = api;
})(this);
