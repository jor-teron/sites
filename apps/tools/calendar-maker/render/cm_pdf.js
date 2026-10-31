/* Calendar Maker CM13 render: Download PDF (jsPDF, bundled in vendor/, no network) and Print, shared by the
   sheet and the Holiday List. The PDF and the print image are the same 250 dpi canvas as the preview. window.CM.Pdf */
window.CM = window.CM || {};
window.CM.Pdf = (function () {
  'use strict';
  /* btn = the button (shows 'Making PDF…'); canvas() = a fresh full-size canvas; land = landscape A4 */
  function save(btn, canvas, land, title, file) {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) { window.UiDialog.info('PDF not available', [['Reason', 'The PDF library did not load.']]); return; }
    btn.disabled = true; btn.textContent = 'Making PDF…';
    setTimeout(() => {
      try {
        /* CM1-CM3: new J({ orientation: 'portrait', ... }); title 'YEAR ' + P.year; image 210 x 297 */
        const doc = new J({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
        doc.setProperties({ title, creator: 'Calendar Maker' });
        doc.addImage(canvas().toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, land ? 297 : 210, land ? 210 : 297);
        doc.save(file);
      } catch (e) {
        window.UiDialog.info('PDF failed', [['Error', String(e && e.message || e)]]);
      }
      btn.disabled = false; btn.textContent = 'Download PDF';
    }, 30);
  }
  /* Print: put the canvas into the print image and print only that (see @media print); after() once printed */
  function print(img, cv, after) {
    img.onload = () => { img.onload = null; setTimeout(() => { window.print(); if (after) after(); }, 50); };
    img.src = cv.toDataURL('image/png');
  }
  return { save, print };
})();
