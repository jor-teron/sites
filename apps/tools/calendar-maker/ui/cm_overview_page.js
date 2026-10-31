/* Calendar Maker CM14 ui: Year Overview page (preview, Print, PDF). Adds CM.ovwRender.
   Year, Saturday rule and font colour follow the Design page; Header and header row colour follow the Holiday List. */
(function () {
  'use strict';
  const CM = window.CM;
  const $ = (id) => document.getElementById(id);
  if (!CM.P || !CM.Overview || !$('ovw-sheet') || !$('ovw-print')) return; /* skipped without the page (test harness) */
  const P = CM.P;
  const opts = () => ({ year: P.year, hols: CM.hols(P.year), sat: P.sat, font: P.font, header: P.lhead, hcolour: P.lhc });
  const canvas = () => CM.Overview.draw(document.createElement('canvas'), opts());
  CM.ovwRender = () => CM.Overview.draw($('ovw-sheet'), opts());
  $('ovw-print').onclick = () => {
    const st = $('cm-page'); if (st) st.textContent = '@page{size:A4 portrait;margin:0}';
    document.body.classList.remove('land');
    CM.Pdf.print($('print-img'), canvas(), CM.render);
  };
  /* CM16-F4 was: $('ovw-pdf').onclick = () => CM.Pdf.save($('ovw-pdf'), canvas, false, 'Year overview ' + P.year, 'overview-' + P.year + '.pdf'); */
  $('ovw-pdf').onclick = () => CM.Pdf.save($('ovw-pdf'), canvas, false, 'Year overview ' + P.year, P.year + '-year-overview.pdf');
})();
