/* Video Trimmer — vt_main.js: boot theme + UI. VT1 */
(function () {
  'use strict';

  function boot() {
    if (window.VTTheme) VTTheme.boot();
    if (window.VTUI) VTUI.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
