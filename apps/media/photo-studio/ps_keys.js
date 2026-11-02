/* ps_keys.js - HPS5.3 Photo Studio shortcuts (overrides photo-editor-v2's pe_input.js Ctrl+S, which stays unchanged there)
 *   Ctrl+S        = Save project (.hps)   same as #ps-save-hps
 *   Ctrl+E        = Export PNG (HPS5.3; plain E = Resize untouched)
 *   Ctrl+Shift+S  = Export PNG (alias)            same as [data-act="savePng"]
 *   Ctrl+P        = Print                 same as [data-act="print"] (no browser print of the page)
 * Capture-phase listener on window, runs before pe_input.js's bubble listener. */
(function () {
  'use strict';
  const click = (sel) => { const b = document.querySelector(sel); if (b && !b.disabled) b.click(); };
  window.addEventListener('keydown', (e) => {
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
