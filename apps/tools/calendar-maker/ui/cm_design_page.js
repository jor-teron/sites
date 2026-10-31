/* Calendar Maker CM13 ui: Design page (CM1) + page tabs. Adds P, save, hols, render, isLand, sheetCanvas to window.CM.
   Settings keys, defaults and validation live in core/cm_settings.js.
   ?year=YYYY (from Calendar's "Make printable") wins over the saved year. */
(function () {
  'use strict';
  const CM = window.CM, S = CM.Settings, T = CM.Theme, R = CM.Render;
  /* const RELEASE = 'CM13';  (CM13) */
  /* const RELEASE = 'CM14';  (CM14) */
  const RELEASE = 'CM16'; /* was 'CM12' (CM10-CM12), 'CM13', 'CM14' */
  const $ = (id) => document.getElementById(id);
  const P = S.loadSettings(location.search);
  const save = () => S.saveSettings(P);

  /* holidays for a year: Holidays page lists when loaded, otherwise the Calendar's built-in fixed list */
  function hols(y) {
    if (CM.Hol) return CM.Hol.forYear(y);
    return CM.Holidays.builtIns(y);
  }
  Object.assign(CM, { P, save, hols, render, bgImg: null, sheet: null });

  function opts() {
    return { year: P.year, week: P.week, colour: P.colour === 'custom' ? P.custom : P.colour,
      font: P.font, /* CM6 */ rcolour: P.rcol, /* CM9 */ sundays: P.sundays, sat: P.sat, hols: hols(P.year),
      bg: { type: P.bg, colour: P.soft, img: CM.bgImg, faint: P.faint / 100 }, strip: P.strip, layout: P.layout,
      fold: P.fold !== false, legend: P.legend, mfill: P.mfill }; /* CM12-F3 */
  }
  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { R.draw($('sheet'), opts()); page(); sync(); });
  }
  /* CM4: preview shape + @page size follow the layout */
  function page() {
    const land = R.layoutOf(P.layout).land;
    document.body.classList.toggle('land', land);
    let st = $('cm-page');
    if (!st) { st = document.createElement('style'); st.id = 'cm-page'; document.head.appendChild(st); }
    st.textContent = '@page{size:A4 ' + (land ? 'landscape' : 'portrait') + ';margin:0}';
  }
  CM.isLand = () => R.layoutOf(P.layout).land;
  /* a fresh full-size sheet canvas (Print / PDF) */
  CM.sheetCanvas = () => R.draw(document.createElement('canvas'), opts());

  const markOn = (sel, v) => document.querySelectorAll(sel).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  function sync() {
    $('year').value = P.year;
    document.querySelectorAll('.seg').forEach((s) => s.querySelectorAll('button')
      .forEach((b) => b.classList.toggle('on', String(P[s.dataset.key]) === b.dataset.v)));
    markOn('#colours button', P.colour);
    if ($('custom')) { /* CM6 */
      $('custom').value = P.custom; $('custom').closest('label').classList.toggle('on', P.colour === 'custom');
    }
    if ($('font')) $('font').value = P.font;
    if ($('rcustom')) { $('rcustom').value = P.rcol; markOn('#rcolours button', P.rcol); } /* CM9 */
    $('sundays').checked = P.sundays !== false;
    $('fold').checked = P.fold !== false; /* CM5 */
    if ($('legend')) $('legend').checked = P.legend !== false; /* CM12-F3 */
    if ($('mcustom')) { $('mcustom').value = P.mfill; markOn('#mfills button', P.mfill.toLowerCase()); }
    if (CM.onSync) CM.onSync();
  }

  /* UI */
  /* swatch buttons from [value, colour, label, title = label]; a click sets P[key] */
  const swatches = (id, list, key) => {
    $(id).innerHTML = list.map(([v, bg, n, t]) => '<button type="button" data-v="' + v + '" style="background:' + bg +
      '" aria-label="' + n + '" title="' + (t || n) + '"></button>').join('');
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; P[key] = b.dataset.v; save(); render();
    });
  };
  const cs = T.COLOURS;
  /* $('colours').innerHTML = Object.keys(cs).map((k) => '<button type="button" data-v="' + k + '" style="background:' + cs[k][0] + '" aria-label="' + k + '" title="' + k[0].toUpperCase() + k.slice(1) + '"></button>').join('');  (CM1-CM12-F3) */
  swatches('colours', Object.keys(cs).map((k) => [k, cs[k][0], T.colourName(k)]), 'colour'); /* CM12-F4 names */
  document.querySelectorAll('.seg').forEach((s) => s.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; P[s.dataset.key] = b.dataset.v; save(); render();
  }));
  /* CM9: restricted colour presets + custom */
  const rcs = T.RCOLOURS;
  if ($('rcolours')) swatches('rcolours', Object.keys(rcs).map((k) => [rcs[k], rcs[k], k, T.cap1(k)]), 'rcol');
  if ($('rcustom')) $('rcustom').oninput = () => { P.rcol = $('rcustom').value; save(); render(); };
  /* CM6: custom holiday colour + font colour */
  if ($('custom')) $('custom').oninput = () => { P.custom = $('custom').value; P.colour = 'custom'; save(); render(); };
  if ($('font')) $('font').oninput = () => { P.font = $('font').value; save(); render(); };
  if ($('font-reset')) $('font-reset').onclick = () => { P.font = '#000000'; save(); render(); };
  $('sundays').onchange = () => { P.sundays = $('sundays').checked; save(); render(); };
  $('fold').onchange = () => { P.fold = $('fold').checked; save(); render(); }; /* CM5 */
  /* CM12-F3: legend toggle + month row fill (White = none, Light grey, custom) */
  if ($('legend')) $('legend').onchange = () => { P.legend = $('legend').checked; save(); render(); };
  if ($('mfills')) swatches('mfills', T.MFILLS.map(([v, n]) => [v, v, n]), 'mfill');
  if ($('mcustom')) $('mcustom').oninput = () => { P.mfill = $('mcustom').value; save(); render(); };
  const setYear = (y) => {
    y = Math.round(+y); if (!(y >= 1900 && y <= 2200)) { sync(); return; }
    P.year = y; save(); render(); if (CM.onYear) CM.onYear();
  };
  $('y-prev').onclick = () => setYear(P.year - 1);
  $('y-next').onclick = () => setYear(P.year + 1);
  $('year').onchange = () => setYear($('year').value);

  /* Print: draw the sheet to an image and print only that (see @media print) */
  $('print').onclick = () => CM.Pdf.print($('print-img'), CM.sheetCanvas());
  /* Download PDF (CM2, was in calendar-maker_pdf.js) */
  $('pdf').onclick = () => CM.Pdf.save($('pdf'), CM.sheetCanvas, CM.isLand(), String(P.year), 'calendar-' + P.year + '.pdf');
  $('ver').textContent = RELEASE;

  /* CM3 tabs (only present once the Holidays page ships) */
  const tabs = $('tabs');
  /* CM16: was one click handler (kept below as a comment); now CM.showPage(page) so the Hub title bar
     (ui/cm_titlebar.js) can switch pages too. CM.onPage(fn) listeners hear every switch. */
  //   if (tabs) tabs.addEventListener('click', (e) => {
  //     const b = e.target.closest('.tab'); if (!b) return;
  //     tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === b));
  //     $('page-design').hidden = b.dataset.page !== 'design';
  //     $('page-hol').hidden = b.dataset.page !== 'hol';
  //     if ($('page-list')) $('page-list').hidden = b.dataset.page !== 'list'; /* CM10 */
  //     if ($('page-ovw')) $('page-ovw').hidden = b.dataset.page !== 'ovw'; /* CM14 */
  //     if (b.dataset.page === 'hol' && CM.Hol) CM.Hol.show(P.year);
  //     else if (b.dataset.page === 'list' && CM.listRender) { CM.listRender(); render(); } /* CM10 */
  //     else if (b.dataset.page === 'ovw' && CM.ovwRender) { CM.ovwRender(); render(); } /* CM14 */
  //     else render();
  //   });
  const pageFns = [];
  CM.onPage = (fn) => { if (typeof fn === 'function') pageFns.push(fn); };
  CM.page = 'design';
  CM.showPage = (pg) => {
    const b = tabs && tabs.querySelector('.tab[data-page="' + pg + '"]'); if (!b) return;
    tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === b));
    $('page-design').hidden = pg !== 'design';
    $('page-hol').hidden = pg !== 'hol';
    if ($('page-list')) $('page-list').hidden = pg !== 'list'; /* CM10 */
    if ($('page-ovw')) $('page-ovw').hidden = pg !== 'ovw'; /* CM14 */
    if (pg === 'hol' && CM.Hol) CM.Hol.show(P.year);
    else if (pg === 'list' && CM.listRender) { CM.listRender(); render(); } /* CM10 */
    else if (pg === 'ovw' && CM.ovwRender) { CM.ovwRender(); render(); } /* CM14 */
    else render();
    CM.page = pg;
    pageFns.forEach((fn) => fn(pg));
  };
  if (tabs) tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (b) CM.showPage(b.dataset.page);
  });
  window.addEventListener('storage', (e) => {
    if (e.key !== S.KEYS.settings) return;
    try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ }
    render();
  });
  save();
  render();
})();
