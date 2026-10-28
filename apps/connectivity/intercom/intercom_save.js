/* Intercom IC1 — the one save module. localStorage only:
   'intercom-settings-v1' = { name, theme:'system'|'light'|'dark', dnd:false, volume:0.8 (0–1), chime:true, target:'all'|<peer id> }
   'intercom-last-code'   = last Hub Connect Code used.
   Theme 'system' follows the Hub's sites-hub.theme when set, else the OS. Default theme: dark. */
(function () {
  'use strict';
  var KEY = 'intercom-settings-v1', LAST = 'intercom-last-code';
  var P = { name: '', theme: 'dark', dnd: false, volume: 0.8, chime: true, target: 'all' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* blocked */ }
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  P.volume = Math.max(0, Math.min(1, +P.volume)); if (isNaN(P.volume)) P.volume = 0.8;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (_) { /* blocked */ } }
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function hubName() {
    try { if (window.SharedLinkDevices) return SharedLinkDevices.name(); } catch (_) { /* */ }
    return ls('shared-link-device-name');
  }
  function name() { return P.name || hubName() || 'Device'; }
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() {
    var t = P.theme, hub = ls('sites-hub.theme');
    if (t === 'system' && (hub === 'light' || hub === 'dark')) t = hub;
    var dark = t === 'dark' || (t === 'system' && mq && mq.matches);
    document.documentElement.classList.toggle('dark', dark);
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') theme(); });
  window.ICSave = {
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; save(); if (k === 'theme') theme(); },
    name: name, theme: theme, ls: ls,
    lastCode: function () { return ls(LAST); },
    setLastCode: function (c) { try { localStorage.setItem(LAST, c); } catch (_) { /* */ } }
  };
  theme();
})();
