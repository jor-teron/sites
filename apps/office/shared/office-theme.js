/*
 * apps/office/shared/office-theme.js
 * SH1 shared light / dark / auto theme helper.
 *   OfficeTheme.isDark(mode)            mode 'light' | 'dark' | 'auto' (auto follows the system)
 *   OfficeTheme.apply(dark, opts)       toggles opts.darkClass / opts.lightClass on <body>
 *                                       (plus of-dark / of-light); stores 'dark'|'light' in opts.key
 *   OfficeTheme.watch(fn)               fn() when the system scheme changes
 * Each app passes its own storage key and class names. Colours stay in the app's CSS.
 */
var OfficeTheme = (function () {
  var MQ = '(prefers-color-scheme: dark)';
  function isDark(mode) {
    if (mode === 'auto') return !!(window.matchMedia && matchMedia(MQ).matches);
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
  return { isDark: isDark, apply: apply, watch: watch, modes: [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto (system)']] };
})();
