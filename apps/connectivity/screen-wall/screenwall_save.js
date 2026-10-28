/* Multi-Screen Wall MW1 — the one save module. localStorage only (so Hub Drive can replace it later):
   'screenwall-settings-v1' = { name, theme:'system'|'light'|'dark', role:'display'|'host' }
   'screenwall-state-v1'    = host only: { rows, cols, cells:{<dev>:{r,c}}, bezel, content:{kind, text, speed, size,
                               fg, bg, bg2, pattern, fit, img:<id>|'' } }
   'screenwall-image-v1'    = host only: { id, data:<jpeg data URL> } (the last picked picture, ≤1920 px)
   'screenwall-last-code'   = last Hub Connect Code used.
   Theme 'system' follows the Hub's sites-hub.theme when set, else the OS. Default theme: dark. */
(function () {
  'use strict';
  var KEY = 'screenwall-settings-v1', STATE = 'screenwall-state-v1', IMG = 'screenwall-image-v1', LAST = 'screenwall-last-code';
  var P = { name: '', theme: 'dark', role: 'display' };
  function rd(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  Object.assign(P, rd(KEY) || {});
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  if (P.role !== 'host') P.role = 'display';
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function hubName() {
    try { if (window.SharedLinkDevices) return SharedLinkDevices.name(); } catch (_) { /* */ }
    return ls('shared-link-device-name');
  }
  function name() { return P.name || hubName() || 'Device'; }
  /* permanent device key (layout survives reloads): the Hub's device id when there is one, else our own */
  function dev() {
    try { if (window.SharedLinkDevices && SharedLinkDevices.id) return SharedLinkDevices.id(); } catch (_) { /* */ }
    var d = ls('screenwall-dev');
    if (!d) { d = 'w-' + Math.random().toString(36).slice(2, 14); try { localStorage.setItem('screenwall-dev', d); } catch (_) { /* */ } }
    return d;
  }
  var DEF = { rows: 1, cols: 2, cells: {}, bezel: 0,
    content: { kind: 'pattern', pattern: 'grid', text: 'Hello from the Hub wall', speed: 160, size: 60, fg: '#ffffff', bg: '#101820', bg2: '#2563eb', fit: 'cover', img: '' } };
  function state() {
    var s = rd(STATE) || {}, d = JSON.parse(JSON.stringify(DEF));
    var o = Object.assign(d, s); o.content = Object.assign(d.content, s.content || {});
    o.rows = Math.max(1, Math.min(4, o.rows | 0 || 1)); o.cols = Math.max(1, Math.min(6, o.cols | 0 || 2));
    if (!o.cells || typeof o.cells !== 'object') o.cells = {};
    o.bezel = Math.max(0, Math.min(120, +o.bezel || 0));
    return o;
  }
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() {
    var t = P.theme, hub = ls('sites-hub.theme');
    if (t === 'system' && (hub === 'light' || hub === 'dark')) t = hub;
    var dark = t === 'dark' || (t === 'system' && mq && mq.matches);
    document.documentElement.classList.toggle('dark', dark);
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') theme(); });
  window.SWSave = {
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; wr(KEY, P); if (k === 'theme') theme(); },
    name: name, dev: dev, theme: theme, ls: ls,
    state: state, saveState: function (s) { return wr(STATE, s); },
    image: function () { return rd(IMG); },
    saveImage: function (o) { return wr(IMG, o); },
    lastCode: function () { return ls(LAST); },
    setLastCode: function (c) { try { localStorage.setItem(LAST, c); } catch (_) { /* */ } }
  };
  theme();
})();
