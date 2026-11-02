/* Live Location LL1 — geolocation watcher. watchPosition runs only between start() and stop().
   Calls onFix({lat, lon, acc, at}) at most every 5 s, or sooner when moved > 10 m. */
(function () {
  'use strict';
  var wid = null, last = null, cb = null, errCb = null, MIN_MS = 5000, MIN_M = 10;
  function dist(a, b) {
    var R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fix(p) {
    var f = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0), at: Date.now() };
    if (last && f.at - last.at < MIN_MS && dist(last, f) < MIN_M) return;
    last = f; if (cb) cb(f);
  }
  function start(onFix, onErr) {
    stop(); cb = onFix; errCb = onErr; last = null;
    if (!navigator.geolocation) { if (errCb) errCb('This browser has no location support.'); return false; }
    wid = navigator.geolocation.watchPosition(fix, function (e) {
      if (errCb) errCb(e.code === 1 ? 'Location permission was denied.' : 'Could not get your location yet…');
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    return true;
  }
  function stop() { if (wid !== null && navigator.geolocation) navigator.geolocation.clearWatch(wid); wid = null; last = null; }
  window.LLGeo = { start: start, stop: stop, on: function () { return wid !== null; }, dist: dist };
})();
