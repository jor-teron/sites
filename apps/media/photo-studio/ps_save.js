/*
 * Hub Photo Studio (HPS1) — ps_save.js, the ONE save module (Hub Drive can replace it later).
 * localStorage only, keys owned by Photo Studio (Photo Editor v2 stores nothing of its own):
 *   'photo-studio-settings-v1' = { theme:'system'|'light'|'dark', format:'auto'|'jpeg'|'png', quality:0.8|0.92|0.98 }
 *   'photo-studio-state-v1'    = { adj:'b'|'c'|'s'|'w'|'sh' }  (last Adjust chip, restored on start)
 * Theme 'system' follows the Hub's sites-hub.theme when set, else the device. Default theme: dark.
 * Loaded in <head> so the theme class is set before the first paint.
 */
(function () {
  'use strict';
  var SET = 'photo-studio-settings-v1', ST = 'photo-studio-state-v1';
  var QUAL = [0.8, 0.92, 0.98];
  function rd(k) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : null; } catch (_) { return null; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }

  function clean(p) {
    var o = { theme: 'dark', format: 'auto', quality: 0.92 };
    if (p) {
      if (['system', 'light', 'dark'].indexOf(p.theme) >= 0) o.theme = p.theme;
      if (['auto', 'jpeg', 'png'].indexOf(p.format) >= 0) o.format = p.format;
      if (QUAL.indexOf(+p.quality) >= 0) o.quality = +p.quality;
    }
    return o;
  }
  var P = clean(rd(SET));
  var S = rd(ST) || {};
  if (['b', 'c', 's', 'w', 'sh'].indexOf(S.adj) < 0) S.adj = 'b';

  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var hooks = [];
  function isDark() {
    var t = P.theme, hub = ls('sites-hub.theme');
    if (t === 'system' && (hub === 'light' || hub === 'dark')) t = hub;
    return t === 'dark' || (t === 'system' && !!(mq && mq.matches));
  }
  function theme() {
    var dark = isDark(), el = document.documentElement;
    el.classList.toggle('light', !dark);
    el.classList.toggle('dark', dark);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#141518' : '#f4f5f7');
    hooks.forEach(function (fn) { fn(dark); });
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') theme(); });
  theme();

  window.PSSave = {
    KEYS: { settings: SET, state: ST },
    settings: function () { return Object.assign({}, P); },
    set: function (k, v) { var n = Object.assign({}, P); n[k] = v; P = clean(n); wr(SET, P); if (k === 'theme') theme(); return Object.assign({}, P); },
    state: function () { return Object.assign({}, S); },
    setState: function (k, v) { S[k] = v; wr(ST, S); },
    isDark: isDark,
    onTheme: function (fn) { hooks.push(fn); }
  };
})();
