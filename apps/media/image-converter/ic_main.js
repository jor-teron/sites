/* Image Converter — ic_main.js: boot theme, dialogs, UI. CI1 */
(function () {
  'use strict';

  var RELEASE = 'CI1';

  function boot() {
    if (window.ICTheme) ICTheme.boot();
    if (window.ICDlg) ICDlg.boot();
    if (window.ICUI) ICUI.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.IC_RELEASE = RELEASE;
})();
