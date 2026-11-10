/* Image Converter — ic_theme.js: Auto / Light / Dark. CI1
   Auto follows Hub sites-hub.theme / sites-hub.themeAuto live (read-only).
   App preference is stored in image-converter-v1 {theme}. */
(function (root) {
  'use strict';

  var KEY = 'image-converter-v1';
  var P = 'sites-hub.';
  var mq = null;
  var mode = 'auto';
  var fns = [];

  function read(k) {
    try { return localStorage.getItem(k) || ''; } catch (_) { return ''; }
  }

  function loadStore() {
    try { return JSON.parse(read(KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function saveStore(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* blocked */ }
  }

  function loadMode() {
    var s = loadStore();
    if (s && (s.theme === 'light' || s.theme === 'dark' || s.theme === 'auto')) {
      mode = s.theme;
      return mode;
    }
    mode = 'auto';
    return mode;
  }

  function saveMode(m) {
    mode = (m === 'light' || m === 'dark') ? m : 'auto';
    var s = loadStore();
    s.theme = mode;
    saveStore(s);
    return mode;
  }

  function resolve() {
    if (mode === 'dark' || mode === 'light') return mode;
    var auto = read(P + 'themeAuto') === '1';
    if (!auto) {
      var t = read(P + 'theme');
      if (t === 'dark' || t === 'light') return t;
    }
    try {
      if (root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (_) { /* ok */ }
    return 'light';
  }

  function apply() {
    var eff = resolve();
    var el = document.documentElement;
    el.classList.remove('dark', 'light');
    el.classList.add(eff);
    el.dataset.theme = eff;
    el.style.colorScheme = eff;
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](eff, mode); } catch (_) { /* ok */ }
    }
    return eff;
  }

  function setMode(m) {
    saveMode(m);
    return apply();
  }

  function onChange(fn) {
    if (typeof fn === 'function') fns.push(fn);
  }

  function boot() {
    loadMode();
    apply();
    try {
      mq = root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)');
      if (mq) {
        var h = function () { if (mode === 'auto') apply(); };
        if (mq.addEventListener) mq.addEventListener('change', h);
        else if (mq.addListener) mq.addListener(h);
      }
    } catch (_) { /* ok */ }
    try {
      root.addEventListener('storage', function (e) {
        if (!e) return;
        if (e.key === KEY || e.key === P + 'theme' || e.key === P + 'themeAuto') {
          if (e.key === KEY) loadMode();
          apply();
        }
      });
    } catch (_) { /* ok */ }
    root.addEventListener('focus', function () { apply(); });
    document.addEventListener('hub-prefs', function () { apply(); });
  }

  root.ICTheme = {
    KEY: KEY,
    loadStore: loadStore,
    saveStore: saveStore,
    loadMode: loadMode,
    saveMode: saveMode,
    getMode: function () { return mode; },
    resolve: resolve,
    apply: apply,
    setMode: setMode,
    onChange: onChange,
    boot: boot
  };
})(typeof window !== 'undefined' ? window : globalThis);
