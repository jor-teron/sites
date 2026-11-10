/* Password Manager PW1 — Auto / Light / Dark.
   Auto follows Hub sites-hub.theme / sites-hub.themeAuto live (read-only).
   App preference is stored in password-manager-v1 {theme}.
   Loaded in <head> so the first paint already has the right colours (no inline script). */
(function (root) {
  'use strict';

  var KEY = 'password-manager-v1';
  var P = 'sites-hub.';
  var mq = null;
  var mode = 'auto';
  var fns = [];
  var booted = false;

  function read(k) {
    try { return localStorage.getItem(k) || ''; } catch (_) { return ''; }
  }

  function loadMode() {
    try {
      var s = JSON.parse(read(KEY) || '{}');
      if (s && (s.theme === 'light' || s.theme === 'dark' || s.theme === 'auto')) {
        mode = s.theme;
        return mode;
      }
    } catch (_) { /* ok */ }
    mode = 'auto';
    return mode;
  }

  function saveMode(m) {
    mode = (m === 'light' || m === 'dark') ? m : 'auto';
    var s = {};
    try { s = JSON.parse(read(KEY) || '{}') || {}; } catch (_) { s = {}; }
    s.theme = mode;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* blocked */ }
    return mode;
  }

  /**
   * Resolve 'dark' | 'light'.
   * App Light/Dark wins. App Auto → Hub explicit theme, or device if Hub Auto
   * is on or the Hub key is unset.
   */
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

  function paintSeg() {
    var seg = document.getElementById('themeSeg');
    if (!seg) return;
    var buttons = seg.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('on', buttons[i].getAttribute('data-v') === mode);
    }
  }

  function apply() {
    var eff = resolve();
    var el = document.documentElement;
    el.dataset.theme = eff;
    el.classList.toggle('light', eff === 'light');
    el.classList.toggle('dark', eff === 'dark');
    el.style.colorScheme = eff;
    paintSeg();
    fns.forEach(function (fn) {
      try { fn(eff, mode); } catch (_) { /* app bug */ }
    });
    return eff;
  }

  function setMode(m) {
    saveMode(m);
    return apply();
  }

  function getMode() { return mode; }

  function onChange(fn) {
    if (typeof fn === 'function') fns.push(fn);
  }

  function boot() {
    if (booted) {
      paintSeg();
      return;
    }
    booted = true;
    var seg = document.getElementById('themeSeg');
    if (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target && e.target.closest && e.target.closest('button');
        if (!b) return;
        setMode(b.getAttribute('data-v'));
      });
    }
    try {
      mq = root.matchMedia('(prefers-color-scheme: dark)');
      var handler = function () { apply(); };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    } catch (_) { /* ok */ }
    root.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf(P) === 0 || e.key === KEY) {
        if (e.key === KEY) loadMode();
        apply();
      }
    });
    root.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'hub-prefs') apply();
    });
    root.addEventListener('focus', apply);
    paintSeg();
  }

  // Immediate paint when this file is loaded from <head>.
  loadMode();
  try { apply(); } catch (_) { /* documentElement always exists */ }

  root.PMTheme = {
    apply: apply,
    resolve: resolve,
    setMode: setMode,
    getMode: getMode,
    onChange: onChange,
    boot: boot
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PMTheme;
})(typeof window !== 'undefined' ? window : globalThis);
