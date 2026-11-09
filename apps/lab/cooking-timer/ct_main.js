/* Cooking Timer — ct_main.js: wire modules on DOM ready. CT1 */
(function () {
  function boot() {
    if (window.CT && CT.ui) CT.ui.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
