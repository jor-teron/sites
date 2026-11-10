/* Video Editor — ve_main.js: boot theme, dialogs, tips, UI. VD3 */
(function () {
  'use strict';

  var RELEASE = 'VD3';

  function boot() {
    if (window.VETheme) VETheme.boot();
    if (window.VEDlg) VEDlg.boot();
    if (window.VETip && VETip.boot) VETip.boot();
    if (window.VEUI) VEUI.init();
    if (window.VETip && VETip.sweep) VETip.sweep();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.VE_RELEASE = RELEASE;
})();
