/* Calendar Maker CM13 ui: Holiday List page (CM10) controls, Print and PDF. Adds CM.listRender. */
(function () {
  'use strict';
  const CM = window.CM, L = CM.List, T = CM.Theme;
  const $ = (id) => document.getElementById(id);
  if (!CM.P || !$('list-sheet')) return; /* page UI skipped when the page or its elements are missing (test harness) */
  const P = CM.P, cleanHeader = L.cleanHeader;
  const opts = () => ({ year: P.year, hols: CM.hols(P.year), colour: P.colour === 'custom' ? P.custom : P.colour,
    rcolour: P.rcol, font: P.font, header: P.lhead,
    layout: P.llay, sub: P.lsub, deco: P.ldeco, abcd: P.labcd, merge: P.lmerge, hcolour: P.lhc }); /* CM12 */
  const canvas = () => L.draw(document.createElement('canvas'), opts());
  CM.listRender = () => L.draw($('list-sheet'), opts());
  const hi = $('list-header');
  if (hi) { hi.value = cleanHeader(P.lhead); hi.oninput = () => { P.lhead = cleanHeader(hi.value); CM.save(); CM.listRender(); }; }
  /* CM12: Classic / Simple options */
  const hcs = T.HCOLOURS, set = (k, v) => { P[k] = v; CM.save(); syncL(); CM.listRender(); };
  const CHECKS = [['list-deco', 'ldeco'], ['list-abcd', 'labcd'], ['list-merge', 'lmerge']];
  function syncL() {
    if ($('list-layout')) $('list-layout').value = P.llay;
    if ($('list-sub')) $('list-sub').value = P.lsub;
    CHECKS.forEach(([id, k]) => { if ($(id)) $(id).checked = P[k] !== false; });
    if ($('list-hcustom')) $('list-hcustom').value = P.lhc;
    document.querySelectorAll('#list-hcolours button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.lhc));
    document.querySelectorAll('.list-classic').forEach((e) => { e.hidden = P.llay !== 'classic'; });
  }
  if ($('list-layout')) $('list-layout').onchange = () => set('llay', $('list-layout').value === 'simple' ? 'simple' : 'classic');
  if ($('list-sub')) $('list-sub').oninput = () => { P.lsub = cleanHeader($('list-sub').value); CM.save(); CM.listRender(); };
  CHECKS.forEach(([id, k]) => { if ($(id)) $(id).onchange = () => set(k, $(id).checked); });
  if ($('list-hcolours')) {
    $('list-hcolours').innerHTML = Object.keys(hcs).map((k) => '<button type="button" data-v="' + hcs[k] +
      '" style="background:' + hcs[k] + '" aria-label="' + k + '" title="' + T.cap1(k) + '"></button>').join('');
    $('list-hcolours').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) set('lhc', b.dataset.v); });
  }
  if ($('list-hcustom')) $('list-hcustom').oninput = () => set('lhc', $('list-hcustom').value);
  syncL();
  $('list-print').onclick = () => {
    /* the list is always portrait: override the layout's @page / preview class while printing */
    const st = $('cm-page'); if (st) st.textContent = '@page{size:A4 portrait;margin:0}';
    document.body.classList.remove('land');
    CM.Pdf.print($('print-img'), canvas(), CM.render);
  };
  $('list-pdf').onclick = () => CM.Pdf.save($('list-pdf'), canvas, false, 'Holidays ' + P.year, 'holidays-' + P.year + '.pdf');
})();
