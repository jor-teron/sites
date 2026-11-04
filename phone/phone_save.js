/*
 * Phone launcher PH1 — the ONE save module. localStorage key 'phone-launcher-v1':
 *   { v:1, pages:[[appId…]…], dock:[appId…≤5], recent:[appId…≤8], settings:{theme, wall, clock24, keepAlive, pinned} }
 * theme: 'system' | 'light' | 'dark' (PH6: default 'system', shown as "Hub": follows sites-hub.theme, then the device).
 * H80: default 'system' (shown as "Hub": follows the Hub theme). th80 marks saves made from H80 on; older saves
 * (which always held 'dark', the PH1 default) move to 'system' once. Light / Dark stay as a phone-only override.
 * PH16: theme is only 'light' | 'dark'. A 'system' (Hub) or missing theme resolves once (sites-hub.theme, else the
 *   device) and is saved as light / dark; ph16 marks migrated saves. 'messages' (the catalog id; PH5 saved 'message')
 *   joins the dock once if there is room.
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
    // dock: ['message', 'telephone', 'camera'],   (PH5: 'message' never matched the catalog id 'messages')
    dock: ['messages', 'telephone', 'camera'],   // PH16
    pages: [['tv'], []],   // PH5
    recent: [],
    // settings: { theme: 'system', wall: 'auto', clock24: true, keepAlive: 2, th80: true, ph5: true, hidden: [], unhidden: [] }   (PH11)
    // settings: { theme: 'system', wall: 'night', clock24: true, keepAlive: 2, th80: true, ph5: true, hidden: [], unhidden: [] }   (PH15)
    // settings: { theme: '', wall: 'night', clock24: true, keepAlive: 2, th80: true, ph5: true, ph16: true, hidden: [], unhidden: [] }   // PH16: '' = resolved at load
    // PH19: keepAlive = auto-close limit 0 (Off) | 3 | 5 | 8 (was 1 | 2); pinned = Recents 📌 keep-alive ids
    settings: { theme: '', wall: 'night', clock24: true, keepAlive: 5, pinned: ['intercom', 'telephone', 'live-location'], th80: true, ph5: true, ph16: true, ph19: true, hidden: [], unhidden: [] }
  };
  // PH16: what 'Hub' resolved to: the Hub theme, else the device
  function resolveTheme() {
    var t = null; try { t = localStorage.getItem('sites-hub.theme'); } catch (_) { /* blocked */ }
    if (t === 'dark' || t === 'light') return t;
    try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (_) { return 'dark'; }
  }
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
    // if (['system', 'light', 'dark'].indexOf(s.theme) >= 0 && s.th80) o.settings.theme = s.theme;   (H80 … PH15)
    o.settings.theme = (s.theme === 'light' || s.theme === 'dark') && s.th80 ? s.theme : resolveTheme();   // PH16: Light / Dark only
    if (!s.ph16) {   // PH16: once: Messages joins the dock ('message' → 'messages') if there is room
      o.dock = o.dock.map(function (x) { return x === 'message' ? 'messages' : x; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      if (o.dock.indexOf('messages') < 0 && o.dock.length < DOCK_MAX) o.dock.unshift('messages');
    }
    // if (s.wall === 'auto' || s.wall === 'none' || /^#[0-9a-f]{6}$/i.test(s.wall || '')) o.settings.wall = s.wall;   (PH11)
    if (s.wall === 'night' || s.wall === 'none' || /^#[0-9a-f]{6}$/i.test(s.wall || '')) o.settings.wall = s.wall;   // PH12: 'auto' (or anything else) -> default 'night'
    if (typeof s.clock24 === 'boolean') o.settings.clock24 = s.clock24;
    o.settings.hidden = ids(s.hidden, HIDDEN_MAX);   // PH10: hidden on this phone
    o.settings.unhidden = ids(s.unhidden, HIDDEN_MAX);   // PH10: CSV-hidden ids unhidden on this phone
    o.settings.hidden = o.settings.hidden.filter(function (x) { return o.settings.unhidden.indexOf(x) < 0; });   // PH10: never both
    // if (s.keepAlive === 1 || s.keepAlive === 2) o.settings.keepAlive = s.keepAlive;   (PH1 … PH16)
    if (s.ph19 && [0, 3, 5, 8].indexOf(s.keepAlive) >= 0) o.settings.keepAlive = s.keepAlive;   // PH19: older 1 / 2 → default 5 once
    if (s.ph19 && Array.isArray(s.pinned)) o.settings.pinned = ids(s.pinned, 60);   // PH19
    return o;
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (_) { /* blocked */ }
    // if (raw === null) return mem ? clone(mem) : clone(DEFAULTS);   (PH15)
    if (raw === null) return mem ? clone(mem) : repair(clone(DEFAULTS));   // PH16: resolves the theme
    // try { return repair(JSON.parse(raw)); } catch (_) { return clone(DEFAULTS); }   (PH15)
    try {
      var p = JSON.parse(raw), r = repair(p);
      // if (!(p && p.settings && p.settings.ph16)) save(r);   // PH16: migration saved once
      if (!(p && p.settings && p.settings.ph16 && p.settings.ph19)) save(r);   // PH16 + PH19: migration saved once
      return r;
    } catch (_) { return clone(DEFAULTS); }
  }
  function save(d) {
    mem = repair(d);
    try { localStorage.setItem(KEY, JSON.stringify(mem)); return true; } catch (_) { return false; }
  }
  function reset() {
    mem = null;
    try { localStorage.removeItem(KEY); } catch (_) { /* blocked */ }
    return repair(clone(DEFAULTS));   // PH16 (was clone(DEFAULTS))
  }
  window.PhoneSave = { KEY: KEY, PAGE_MAX: PAGE_MAX, DOCK_MAX: DOCK_MAX, load: load, save: save, reset: reset, repair: repair, defaults: function () { return clone(DEFAULTS); } };
})();
