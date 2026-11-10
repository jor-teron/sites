/* Video Editor — ve_main.js: boot theme, dialogs, UI. VD1 */
(function () {
  'use strict';

  var RELEASE = 'VD1';

  function boot() {
    if (window.VETheme) VETheme.boot();
    if (window.VEDlg) VEDlg.boot();
    if (window.VEUI) VEUI.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.VE_RELEASE = RELEASE;
})();
