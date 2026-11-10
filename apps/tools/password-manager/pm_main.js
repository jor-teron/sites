/* Password Manager PW2 — boot. */
(function () {
  'use strict';

  var RELEASE = 'PW2';

  function boot() {
    if (window.PMTheme) PMTheme.boot();
    if (window.PMDlg) PMDlg.boot();
    if (window.PMUi) PMUi.boot({ release: RELEASE });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.PM_RELEASE = RELEASE;
})();
