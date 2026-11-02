/* Live Location LL1 — settings. Key 'live-location-settings-v1' = {code} (last private mesh code).
   Sharing is never remembered: it always starts OFF. Name comes from SharedLinkDevices (the Hub device name). */
(function () {
  'use strict';
  var KEY = 'live-location-settings-v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* */ } }
  function name() {
    try { if (window.SharedLinkDevices) return SharedLinkDevices.name(); } catch (_) { /* */ }
    return 'This device';
  }
  window.LLStore = { KEY: KEY, load: load, save: save, name: name,
    code: function () { return load().code || ''; },
    setCode: function (c) { var o = load(); o.code = c; save(o); } };
})();
