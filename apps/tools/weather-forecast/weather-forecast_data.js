/*
 * Weather Forecast — data layer (WX1a).
 * One Open-Meteo call, normalised into the shape the page renders, cached in localStorage.
 * load(force) never rejects while a cached reading exists: it returns that with stale:true.
 */
var WXData = (function () {
  "use strict";

  var CFG = WEATHER_FORECAST_CONFIG;

  function placeKey() {
    return CFG.location.latitude + "," + CFG.location.longitude;
  }

  function buildUrl() {
    return CFG.api.url +
      "?latitude=" + CFG.location.latitude +
      "&longitude=" + CFG.location.longitude +
      "&current=" + CFG.api.current.join(",") +
      "&hourly=" + CFG.api.hourly.join(",") +
      "&daily=" + CFG.api.daily.join(",") +
      "&timezone=" + encodeURIComponent(CFG.api.timezone);
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CFG.cache.key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.data || !o.savedAt || o.place !== placeKey()) return null;
      return o;
    } catch (e) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CFG.cache.key, JSON.stringify({
        place: placeKey(),
        savedAt: Date.now(),
        data: data,
      }));
    } catch (e) {
      /* quota or blocked storage: caching is optional */
    }
  }

  function fetchJson(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) { /* ignore */ } }
        reject(new Error("timeout"));
      }, timeoutMs);

      fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(
          function (json) { clearTimeout(timer); resolve(json); },
          function (err) { clearTimeout(timer); reject(err); }
        );
    });
  }

  function normalize(raw) {
    var c = (raw && raw.current) || {};
    var d = (raw && raw.daily) || {};
    if (typeof c.temperature_2m !== "number") throw new Error("no current temperature");

    var codes = d.weather_code || [];
    var hi = d.temperature_2m_max || [];
    var lo = d.temperature_2m_min || [];
    var rain = d.precipitation_probability_max || [];
    var sunrise = d.sunrise || [];
    var sunset = d.sunset || [];
    var cu = (raw && raw.current_units) || {};

    // Up to 7 days, each with its own code, high/low, rain chance and sun times
    var days = [];
    var n = Math.min(7, (d.time || []).length);
    for (var i = 0; i < n; i++) {
      days.push({
        date: d.time[i],
        code: codes[i],
        hi: hi[i],
        lo: lo[i],
        rain: rain[i],
        sunrise: sunrise[i],
        sunset: sunset[i],
      });
    }

    // Hourly series for today's curve (time, temperature, code, rain chance)
    var hr = (raw && raw.hourly) || {};
    var hTimes = hr.time || [];
    var hTemp = hr.temperature_2m || [];
    var hCode = hr.weather_code || [];
    var hRain = hr.precipitation_probability || [];
    var hours = [];
    for (var j = 0; j < hTimes.length; j++) {
      hours.push({ time: hTimes[j], temp: hTemp[j], code: hCode[j], rain: hRain[j] });
    }

    return {
      place: CFG.location.name,
      timezone: raw.timezone || "",
      at: c.time || "",
      now: {
        temp: c.temperature_2m,
        feels: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        code: c.weather_code,
        wind: c.wind_speed_10m,
        gust: c.wind_gusts_10m,
        dir: c.wind_direction_10m,
        isDay: c.is_day,
      },
      today: { code: codes[0], hi: hi[0], lo: lo[0] },
      days: days,
      hours: hours,
      units: {
        temp: cu.temperature_2m || CFG.units.temp,
        wind: cu.wind_speed_10m || CFG.units.wind,
      },
    };
  }

  function nextHours(hours, at, count) {
    var today = (at || "").slice(0, 10);
    var nowH = parseInt((at || "").slice(11, 13), 10);
    var start = -1, i;
    for (i = 0; i < (hours || []).length; i++) {
      if (hours[i].time.slice(0, 10) === today &&
          parseInt(hours[i].time.slice(11, 13), 10) >= nowH) {
        start = i;
        break;
      }
    }
    if (start < 0) return [];
    return hours.slice(start, start + count);
  }

  function load(force) {
    var cached = readCache();
    var fresh = cached && !WXFormat.isStale(cached.savedAt, Date.now(), CFG.cache.maxAge);

    if (cached && fresh && !force) {
      return Promise.resolve({ data: cached.data, savedAt: cached.savedAt, cached: true });
    }

    return fetchJson(buildUrl(), CFG.api.timeoutMs)
      .then(function (raw) {
        var data = normalize(raw);
        writeCache(data);
        return { data: data, savedAt: Date.now(), cached: false };
      })
      .catch(function (err) {
        if (cached) {
          return { data: cached.data, savedAt: cached.savedAt, cached: true, stale: true, error: err };
        }
        throw err;
      });
  }

  function searchPlaces(query) {
    var url = CFG.api.geocode +
      "?name=" + encodeURIComponent(query) +
      "&count=6&language=en&format=json";
    return fetchJson(url, CFG.api.timeoutMs).then(function (j) {
      return (j && j.results) || [];
    });
  }

  return {
    load: load,
    readCache: readCache,
    buildUrl: buildUrl,
    normalize: normalize,
    nextHours: nextHours,
    searchPlaces: searchPlaces,
  };
})();
