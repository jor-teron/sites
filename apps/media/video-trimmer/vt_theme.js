/* Video Trimmer — vt_theme.js: Hub theme when set, else OS prefers-color-scheme. VT1
   Honours sites-hub.theme / sites-hub.themeAuto read-only (shared Hub key).
   Live: matchMedia change + storage + hub-prefs postMessage + focus. */
(function (root) {
  'use strict';

  var P = 'sites-hub.';
  var mq = null;
  var fns = [];

  function read(k) {
    try { return localStorage.getItem(k) || ''; } catch (_) { return ''; }
  }

  /**
   * Resolve 'dark' | 'light'.
   * - Hub Auto on → follow the device (prefers-color-scheme).
   * - Hub theme explicitly dark|light → honour that shared key.
   * - Otherwise → device.
   */
  function resolve() {
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
    el.dataset.theme = eff;
    el.classList.toggle('light', eff === 'light');
    el.classList.toggle('dark', eff === 'dark');
    el.style.colorScheme = eff;
    fns.forEach(function (fn) {
      try { fn(eff); } catch (_) { /* app bug */ }
    });
    return eff;
  }

  function onChange(fn) {
    if (typeof fn === 'function') fns.push(fn);
  }

  function boot() {
    apply();
    try {
      mq = root.matchMedia('(prefers-color-scheme: dark)');
      var handler = function () { apply(); };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    } catch (_) { /* ok */ }
    root.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf(P) === 0) apply();
    });
    root.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'hub-prefs') apply();
    });
    root.addEventListener('focus', apply);
  }

  root.VTTheme = { apply: apply, resolve: resolve, onChange: onChange, boot: boot };
})(typeof window !== 'undefined' ? window : globalThis);
