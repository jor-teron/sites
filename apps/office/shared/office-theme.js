/*
 * apps/office/shared/office-theme.js
 * SH1 shared light / dark / auto theme helper.
 *   OfficeTheme.isDark(mode)            mode 'light' | 'dark' | 'auto'
 *   OfficeTheme.apply(dark, opts)       toggles opts.darkClass / opts.lightClass on <body>
 *                                       (plus of-dark / of-light); stores 'dark'|'light' in opts.key
 *   OfficeTheme.watch(fn)               fn() when the system scheme changes
 *   OfficeTheme.watchHub(fn)            watch() plus live Hub theme (HO2)
 *   OfficeTheme.inHub()                 same-origin parent frame (the Hub)
 * HO2: Auto inside the Hub follows localStorage 'sites-hub.theme'
 * ('dark' = Dark, anything else = Light), the same rule as Spreadsheet.
 * Standalone Auto follows prefers-color-scheme.
 * (before HO2) Auto always followed the system, even inside the Hub.
 * Each app passes its own storage key and class names. Colours stay in the app's CSS.
 */
var OfficeTheme = (function () {
  var MQ = '(prefers-color-scheme: dark)';
  var HUB_KEY = 'sites-hub.theme';
  function inHub() {
    try { return window.parent !== window && window.parent.location.origin === location.origin; }
    catch (e) { return false; }
  }
  function hubTheme() {
    try { return localStorage.getItem(HUB_KEY) || ''; }
    catch (e) { return ''; }
  }
  function systemDark() { return !!(window.matchMedia && matchMedia(MQ).matches); }
  function isDark(mode) {
    /* (before HO2) if (mode === 'auto') return !!(window.matchMedia && matchMedia(MQ).matches); */
    if (mode === 'auto') return inHub() ? hubTheme() === 'dark' : systemDark();
    return mode === 'dark';
  }
  function apply(dark, opts) {
    opts = opts || {};
    var b = document.body;
    if (!b) return;
    if (opts.darkClass) b.classList.toggle(opts.darkClass, !!dark);
    if (opts.lightClass) b.classList.toggle(opts.lightClass, !dark);
    b.classList.toggle('of-dark', !!dark);
    b.classList.toggle('of-light', !dark);
    if (opts.key) { try { localStorage.setItem(opts.key, dark ? (opts.darkValue || 'dark') : 'light'); } catch (e) {} }
  }
  function watch(fn) {
    if (!window.matchMedia) return;
    var mq = matchMedia(MQ);
    if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn);
  }
  /* HO2: storage (other window wrote the Hub theme), hub-prefs message, and focus. */
  function watchHub(fn) {
    watch(fn);
    if (!window.addEventListener) return;
    window.addEventListener('storage', function (e) {
      if (!e.key || e.key === HUB_KEY) fn();
    });
    window.addEventListener('message', function (e) {
      var d = e && e.data;
      try {
        if (e.origin === location.origin && d && d.type === 'hub-prefs') fn();
      } catch (err) {}
    });
    window.addEventListener('focus', fn);
  }
  return {
    isDark: isDark, apply: apply, watch: watch, watchHub: watchHub, inHub: inHub, hubKey: HUB_KEY,
    /* (before HO2) modes: [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto (system)']] */
    modes: [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']]
  };
})();
