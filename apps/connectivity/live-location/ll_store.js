/* Live Location LL2 — settings. Key 'live-location-settings-v1' = {code, share, keep, range, hsync, hup}
   code: last private mesh code; share:false once the user turns sharing off (unset/true = share automatically on a private code);
   LL2: keep = history days 1 | 7 (default) | 30; range = trail range 'today' | '24h' (default) | '7d';
   hsync = {code: cursor} the history server's clock at our last finished sync (next request: points it received from then on);
   hup = {code: time} newest own point already uploaded to that group's server (hput sends only newer ones).
   Name comes from SharedLinkDevices (the Hub device name); dev() = SharedLinkDevices.id() (permanent per browser), the history key for this device. */
// legacy (LL1.1): settings were {code, share} only; no release constant.
(function () {
  'use strict';
  var KEY = 'live-location-settings-v1', VERSION = 'LL2', KEEPS = [1, 7, 30], RANGES = ['today', '24h', '7d'];
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* */ } }
  function set(k, v) { var o = load(); o[k] = v; save(o); }
  function name() {
    try { if (window.SharedLinkDevices) return SharedLinkDevices.name(); } catch (_) { /* */ }
    return 'This device';
  }
  var memDev = '';
  function dev() {
    try { if (window.SharedLinkDevices) return SharedLinkDevices.id(); } catch (_) { /* */ }
    if (!memDev) { try { memDev = localStorage.getItem('live-location-dev') || ''; } catch (_) { /* */ }
      if (!memDev) { memDev = 'll-' + Math.random().toString(36).slice(2, 12); try { localStorage.setItem('live-location-dev', memDev); } catch (_) { /* */ } } }
    return memDev;
  }
  window.LLStore = { KEY: KEY, VERSION: VERSION, KEEPS: KEEPS, RANGES: RANGES, load: load, save: save, name: name, dev: dev,
    code: function () { return load().code || ''; },
    setCode: function (c) { set('code', c); },
    share: function () { return load().share !== false; },
    setShare: function (on) { set('share', !!on); },
    keep: function () { var k = +load().keep; return KEEPS.indexOf(k) >= 0 ? k : 7; },
    setKeep: function (d) { if (KEEPS.indexOf(+d) >= 0) set('keep', +d); },
    range: function () { var r = load().range; return RANGES.indexOf(r) >= 0 ? r : '24h'; },
    setRange: function (r) { if (RANGES.indexOf(r) >= 0) set('range', r); },
    hsync: function (c) { var h = load().hsync; return (h && typeof h === 'object' && +h[c]) || 0; },
    setHsync: function (c, t) { var o = load(); if (!o.hsync || typeof o.hsync !== 'object') o.hsync = {}; o.hsync[c] = +t || 0; save(o); },
    hup: function (c) { var h = load().hup; return (h && typeof h === 'object' && +h[c]) || 0; },
    setHup: function (c, t) { var o = load(); if (!o.hup || typeof o.hup !== 'object') o.hup = {}; o.hup[c] = +t || 0; save(o); } };
})();
