/*
 * Photo Editor v2 — print (pe_print.js). "Print 🖨" in the Save menu: renders the CURRENT
 * edits full-size (same path as Save, via PE.io.save(fmt, onBlob)) and hands that image
 * alone to the browser's own print dialog.
 */
(function (PE) {
  'use strict';
  // Hand one image/PDF blob alone to the browser's own print dialog (same approach as hub/viewer/hub_viewer.js):
  // PDF → hidden iframe with the blob URL; image → srcdoc iframe fitting the image to the page.
  // Fallback: open the blob in a new tab (the browser's own viewer prints it).
  let frame = null;
  function printBlob(blob, kind) {
    const url = URL.createObjectURL(blob);
    if (frame) frame.remove();
    const f = frame = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    const fire = () => {
      try { f.contentWindow.focus(); f.contentWindow.print(); }
      catch (_) { window.open(url, '_blank'); }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    };
    if (kind === 'pdf') { f.onload = fire; f.src = url; }
    else {
      f.onload = () => {
        const im = f.contentDocument && f.contentDocument.querySelector('img');
        if (im && !im.complete) im.onload = im.onerror = fire; else fire();
      };
      f.srcdoc = '<!doctype html><html><head><style>@page{margin:10mm}html,body{margin:0;height:100%}' +
        'body{display:flex;align-items:center;justify-content:center}' +
        'img{max-width:100%;max-height:100vh;object-fit:contain}</style></head><body><img src="' + url + '" alt=""></body></html>';
    }
    document.body.appendChild(f);
  }
  PE.print = () => PE.io.save('jpeg', (blob) => printBlob(blob, 'image'));
})(window.PE);
