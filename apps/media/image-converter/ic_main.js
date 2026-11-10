/* Image Converter — ic_main.js: boot theme, dialogs, UI. CI3 */
(function () {
  'use strict';

  var RELEASE = 'CI3';

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
