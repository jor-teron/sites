/* Screen Share SS1 — settings store. localStorage 'screenshare-settings-v1':
   { name, theme:'system'|'light'|'dark', quality:'720'|'1080', fps:5|15|30, audio:'on'|'off', fit:'fit'|'fill' }.
   Theme System follows sites-hub.theme when set, else the device.
   SS2 adds did (lasting device id), trusted:{did:{name,token}} (devices this one gave a token to on a private
   code) and keys:{did:{name,token}} (tokens other devices gave this one). */
(function () {
  'use strict';
  var KEY = 'screenshare-settings-v1';
  var P = { name: '', theme: 'dark', quality: '1080', fps: 15, audio: 'off', fit: 'fit' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* blocked */ }
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  if (['720', '1080'].indexOf(String(P.quality)) < 0) P.quality = '1080';
  if ([5, 15, 30].indexOf(+P.fps) < 0) P.fps = 15;
  function token(n) { var a = new Uint8Array(n || 16); try { crypto.getRandomValues(a); } catch (_) { for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256 | 0; } return Array.prototype.map.call(a, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  var fresh = !/^[0-9a-f]{16}$/.test(String(P.did || ''));   // SS2
  if (fresh) P.did = token(8);
  if (!P.trusted || typeof P.trusted !== 'object') P.trusted = {};
  if (!P.keys || typeof P.keys !== 'object') P.keys = {};
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
  if (fresh) save();
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') theme(); });
  window.SSStore = {
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; save(); if (k === 'theme') theme(); },
    name: name, theme: theme, token: token
  };
  theme();
})();
