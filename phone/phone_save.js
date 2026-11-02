/*
 * Phone launcher PH1 — the ONE save module. localStorage key 'phone-launcher-v1':
 *   { v:1, pages:[[appId…]…], dock:[appId…≤5], recent:[appId…≤8], settings:{theme, wall, clock24, keepAlive} }
 * theme: 'system' | 'light' | 'dark' (PH6: default 'system', shown as "Hub": follows sites-hub.theme, then the device).
 * H80: default 'system' (shown as "Hub": follows the Hub theme). th80 marks saves made from H80 on; older saves
 * (which always held 'dark', the PH1 default) move to 'system' once. Light / Dark stay as a phone-only override.
 * PH5: ph5 marks saves made from PH5 on; older saves get the PH5 home (TV only) and dock once, settings kept.
 * Dock ids not in the catalog yet (e.g. 'message') stay saved; phone_app.js only hides them.
 * wall: 'night' (PH12 default: Hub Night blue gradient, also in the WebView) | 'none' (see-through) | '#rrggbb'. Old 'auto' -> 'night'.
 * Everything is repaired on load (unknown ids dropped later by phone_app.js, bad types reset to defaults).
 * PH10: settings.hidden = ids hidden on this phone; settings.unhidden = ids from phone/hidden-apps.csv shown again here (≤200 each).
 * Storage blocked / full → keeps working in memory only.
 */
(function () {
  'use strict';
  var KEY = 'phone-launcher-v1';
  var PAGE_MAX = 24;          // apps per home page (page 1 also holds the clock: phone_app.js shows fewer)
  var DOCK_MAX = 5;
  var HIDDEN_MAX = 200;        // PH10
  var DEFAULTS = {
    v: 1,
    // Clock = Stopwatch for now (no Clock app in the catalog yet).
    // dock: ['telephone', 'intercom', 'camera', 'gallery', 'stopwatch'],   (PH1)
    // pages: [['calendar', 'dashboard', 'weather-chart', 'calculator', 'video-chat', 'pooh-chat', 'files', 'news', 'tv', 'sound-recorder', 'screen-wall', 'search'], []],   (PH1)
    dock: ['message', 'telephone', 'camera'],   // PH5: 'message' shows once the app is in the catalog
    pages: [['tv'], []],   // PH5
    recent: [],
    // settings: { theme: 'system', wall: 'auto', clock24: true, keepAlive: 2, th80: true, ph5: true, hidden: [], unhidden: [] }   (PH11)
    settings: { theme: 'system', wall: 'night', clock24: true, keepAlive: 2, th80: true, ph5: true, hidden: [], unhidden: [] }
  };
  var mem = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function ids(a, max) {
    var out = [];
    (Array.isArray(a) ? a : []).forEach(function (x) {
      if (typeof x === 'string' && x && x.length < 80 && out.indexOf(x) < 0 && out.length < max) out.push(x);
    });
    return out;
  }
  function repair(d) {
    var o = clone(DEFAULTS);
    if (!d || typeof d !== 'object') return o;
    if (Array.isArray(d.dock)) o.dock = ids(d.dock, DOCK_MAX);
    if (Array.isArray(d.pages)) {
      var seen = {};
      o.pages = d.pages.slice(0, 12).map(function (p) {
        return ids(p, PAGE_MAX).filter(function (id) { if (seen[id]) return false; seen[id] = 1; return true; });
      });
      if (!o.pages.length) o.pages = [[]];
    }
    o.recent = ids(d.recent, 8);
    var s = d.settings || {};
    if (!s.ph5) { o.pages = clone(DEFAULTS.pages); o.dock = clone(DEFAULTS.dock); }   // PH5: older saves get the new home + dock once
    if (['system', 'light', 'dark'].indexOf(s.theme) >= 0 && s.th80) o.settings.theme = s.theme;   // H80: pre-H80 saves follow the Hub
    // if (s.wall === 'auto' || s.wall === 'none' || /^#[0-9a-f]{6}$/i.test(s.wall || '')) o.settings.wall = s.wall;   (PH11)
    if (s.wall === 'night' || s.wall === 'none' || /^#[0-9a-f]{6}$/i.test(s.wall || '')) o.settings.wall = s.wall;   // PH12: 'auto' (or anything else) -> default 'night'
    if (typeof s.clock24 === 'boolean') o.settings.clock24 = s.clock24;
    o.settings.hidden = ids(s.hidden, HIDDEN_MAX);   // PH10: hidden on this phone
    o.settings.unhidden = ids(s.unhidden, HIDDEN_MAX);   // PH10: CSV-hidden ids unhidden on this phone
    o.settings.hidden = o.settings.hidden.filter(function (x) { return o.settings.unhidden.indexOf(x) < 0; });   // PH10: never both
    if (s.keepAlive === 1 || s.keepAlive === 2) o.settings.keepAlive = s.keepAlive;
    return o;
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (_) { /* blocked */ }
    if (raw === null) return mem ? clone(mem) : clone(DEFAULTS);
    try { return repair(JSON.parse(raw)); } catch (_) { return clone(DEFAULTS); }
  }
  function save(d) {
    mem = repair(d);
    try { localStorage.setItem(KEY, JSON.stringify(mem)); return true; } catch (_) { return false; }
  }
  function reset() {
    mem = null;
    try { localStorage.removeItem(KEY); } catch (_) { /* blocked */ }
    return clone(DEFAULTS);
  }
  window.PhoneSave = { KEY: KEY, PAGE_MAX: PAGE_MAX, DOCK_MAX: DOCK_MAX, load: load, save: save, reset: reset, repair: repair, defaults: function () { return clone(DEFAULTS); } };
})();
