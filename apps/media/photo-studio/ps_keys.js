/* ps_keys.js - HPS6 / HPS5.3 Photo Studio shortcuts (overrides photo-editor-v2's pe_input.js Ctrl+S, which stays unchanged there)
 *   Ctrl+S        = Save project (.hps)   same as #ps-save-hps
 *   Ctrl+E        = Export PNG (HPS5.3; plain E = Eraser since HPS6.1, see ps_erase.js)
 *   Ctrl+Shift+S  = Export PNG (alias)            same as [data-act="savePng"]
 *   Ctrl+P        = Print                 same as [data-act="print"] (no browser print of the page)
 *   Ctrl+W, Alt+W = Close project (HPS6, ps_close.js); asks to save first. Never closes the app. A normal browser
 *                   tab keeps Ctrl+W for itself (closes the tab); in an installed app window preventDefault works.
 * Capture-phase listener on window, runs before pe_input.js's bubble listener. */
(function () {
  'use strict';
  const click = (sel) => { const b = document.querySelector(sel); if (b && !b.disabled) b.click(); };
  window.addEventListener('keydown', (e) => {
    // HPS6: Ctrl+W / Alt+W close the project (e.code too: Alt+W types a symbol on some layouts)
    const isW = (e.key || '').toLowerCase() === 'w' || e.code === 'KeyW';
    if (isW && !e.shiftKey && ((e.ctrlKey || e.metaKey) !== e.altKey)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (window.PE && PE.closeProject) PE.closeProject.request();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = (e.key || '').toLowerCase();
    let sel = null;
    if (k === 's') sel = e.shiftKey ? '[data-act="savePng"]' : '#ps-save-hps';
    else if (k === 'e' && !e.shiftKey) sel = '[data-act="savePng"]';
    else if (k === 'p' && !e.shiftKey) sel = '[data-act="print"]';
    if (!sel) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (window.PE && PE.resize && PE.resize.open) return;
    click(sel);
  }, true);
})();
