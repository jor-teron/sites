/* Video Editor — ve_main.js: boot theme, dialogs, UI. VD2 */
(function () {
  'use strict';

  var RELEASE = 'VD2';

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
