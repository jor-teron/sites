/* Video Chat VC2 — settings store. localStorage 'videochat-settings-v1':
   { name, cam, mic, theme:'system'|'light'|'dark' }. Theme follows sites-hub.theme when set. */
(function () {
  'use strict';
  var KEY = 'videochat-settings-v1';
  var P = { name: '', cam: '', mic: '', theme: 'dark' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* blocked */ }
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (_) { /* blocked */ } }
  function hubName() {
    try { if (window.SharedLinkDevices) return SharedLinkDevices.name(); } catch (_) { /* */ }
    try { return localStorage.getItem('shared-link-device-name') || ''; } catch (_) { return ''; }
  }
  function name() { return P.name || hubName() || 'Device'; }
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() {
    var t = P.theme, hub = null;
    try { hub = localStorage.getItem('sites-hub.theme'); } catch (_) { /* */ }
    if (t === 'system' && (hub === 'light' || hub === 'dark')) t = hub;
    var dark = t === 'dark' || (t === 'system' && mq && mq.matches);
    document.documentElement.classList.toggle('dark', dark);
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') theme(); });
  window.VCStore = {
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; save(); if (k === 'theme') theme(); },
    name: name, theme: theme
  };
  theme();
})();
