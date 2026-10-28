/* Screen Share SS1 — settings store. localStorage 'screenshare-settings-v1':
   { name, theme:'system'|'light'|'dark', quality:'720'|'1080', fps:5|15|30, audio:'on'|'off', fit:'fit'|'fill' }.
   Theme System follows sites-hub.theme when set, else the device. */
(function () {
  'use strict';
  var KEY = 'screenshare-settings-v1';
  var P = { name: '', theme: 'dark', quality: '1080', fps: 15, audio: 'off', fit: 'fit' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* blocked */ }
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  if (['720', '1080'].indexOf(String(P.quality)) < 0) P.quality = '1080';
  if ([5, 15, 30].indexOf(+P.fps) < 0) P.fps = 15;
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
  window.SSStore = {
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; save(); if (k === 'theme') theme(); },
    name: name, theme: theme
  };
  theme();
})();
