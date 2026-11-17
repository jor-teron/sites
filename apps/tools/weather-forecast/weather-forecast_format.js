/*
 * Weather Forecast — pure formatting helpers (WX1a).
 * No DOM and no fetch, so node --test can load this file directly.
 */
var WXFormat = (function () {
  "use strict";

  // WMO weather code -> [label, icon kind]
  var WMO = {
    0: ["Clear sky", "sun"],
    1: ["Mainly clear", "sun"],
    2: ["Partly cloudy", "partly"],
    3: ["Overcast", "cloud"],
    45: ["Fog", "fog"],
    48: ["Rime fog", "fog"],
    51: ["Light drizzle", "drizzle"],
    53: ["Drizzle", "drizzle"],
    55: ["Heavy drizzle", "drizzle"],
    56: ["Freezing drizzle", "drizzle"],
    57: ["Freezing drizzle", "drizzle"],
    61: ["Light rain", "rain"],
    63: ["Rain", "rain"],
    65: ["Heavy rain", "rain"],
    66: ["Freezing rain", "rain"],
    67: ["Freezing rain", "rain"],
    71: ["Light snow", "snow"],
    73: ["Snow", "snow"],
    75: ["Heavy snow", "snow"],
    77: ["Snow grains", "snow"],
    80: ["Light showers", "rain"],
    81: ["Showers", "rain"],
    82: ["Heavy showers", "rain"],
    85: ["Snow showers", "snow"],
    86: ["Snow showers", "snow"],
    95: ["Thunderstorm", "storm"],
    96: ["Thunderstorm, hail", "storm"],
    99: ["Thunderstorm, hail", "storm"],
  };

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function wmo(code) {
    return WMO[code] || ["Unknown", "cloud"];
  }

  function roundTemp(v) {
    return (typeof v === "number" && isFinite(v)) ? Math.round(v) : null;
  }

  function fmtTemp(v) {
    var n = roundTemp(v);
    return n === null ? "\u2013" : n + "\u00B0";
  }

  // "2026-11-17T14:05" -> "14:05" (Open-Meteo already returns local time with timezone=auto)
  function fmtClock(iso) {
    if (typeof iso !== "string" || iso.length < 16) return "\u2013";
    return iso.slice(11, 16);
  }

  // "2026-11-17" -> "Tue 17 Nov"
  function fmtDay(iso) {
    if (typeof iso !== "string" || iso.length < 10) return "\u2013";
    var d = new Date(iso.length === 10 ? iso + "T12:00" : iso);
    if (isNaN(d.getTime())) return "\u2013";
    return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
  }

  function freshness(ms) {
    if (!(ms >= 0)) return "just now";
    var m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m === 1) return "1 min ago";
    if (m < 60) return m + " min ago";
    var h = Math.floor(m / 60);
    return h === 1 ? "1 h ago" : h + " h ago";
  }

  function isStale(savedAt, now, maxAge) {
    return !(savedAt > 0) || (now - savedAt) > maxAge;
  }

  function direction(deg) {
    if (typeof deg !== "number" || !isFinite(deg)) return "";
    var names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return names[Math.round(((deg % 360) / 45)) % 8];
  }

  function windText(speed, deg, unit) {
    if (typeof speed !== "number" || !isFinite(speed)) return "\u2013";
    var out = Math.round(speed) + (unit ? " " + unit : "");
    var d = direction(deg);
    return d ? out + " " + d : out;
  }

  return {
    wmo: wmo,
    roundTemp: roundTemp,
    fmtTemp: fmtTemp,
    fmtClock: fmtClock,
    fmtDay: fmtDay,
    freshness: freshness,
    isStale: isStale,
    direction: direction,
    windText: windText,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = WXFormat;
