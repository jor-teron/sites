/* Whiteboard WB1 — settings store. localStorage 'whiteboard-settings-v1':
   { name, theme:'system'|'light'|'dark', bg:'plain'|'grid'|'dots', tool, shape, color, size }.
   Theme 'system' follows the Hub's sites-hub.theme when set, else the OS. */
(function () {
  'use strict';
  var KEY = 'whiteboard-settings-v1';
  var P = { name: '', theme: 'dark', bg: 'grid', tool: 'pen', shape: 'rect', color: 'ink', size: 4 };
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* blocked */ }
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  if (['plain', 'grid', 'dots'].indexOf(P.bg) < 0) P.bg = 'grid';
  var cbs = [];
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
    cbs.forEach(function (f) { try { f(dark); } catch (e) { console.warn(e); } });
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') theme(); });
  window.WBStore = {
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; save(); if (k === 'theme') theme(); },
    name: name, theme: theme,
    onTheme: function (f) { cbs.push(f); }
  };
  theme();
})();
