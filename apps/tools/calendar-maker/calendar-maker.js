/* Calendar Maker page logic (CM1). Settings in 'calendar-maker-settings':
   { year, colour:'green'|'red'|'yellow'|'blue'|'orange'|'lgreen'|'lred'|'lyellow'|'lblue'|'lorange'|'custom', sundays (bool, default true), sat:'none'|'24'|'all',
     week:'sun'|'mon' (default from Calendar's 'calendar-settings-v1'), bg:'none'|'soft'|'pic', soft, faint, strip (CM2) }
   ?year=YYYY (from Calendar's "Make printable") wins over the saved year. Exposes window.CM for CM2 / CM3 plug-ins. */
window.CM = (function () {
  'use strict';
  const SKEY = 'calendar-maker-settings', RELEASE = 'CM12'; /* CM10; was 'CM11' */
  const $ = (id) => document.getElementById(id);
  let P = {};
  try { P = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (_) { P = {}; }
  let cal = {};
  try { cal = JSON.parse(localStorage.getItem('calendar-settings-v1') || '{}') || {}; } catch (_) { cal = {}; }
  const D = { year: new Date().getFullYear(), colour: 'green', sundays: true,
    sat: cal.satAll ? 'all' : (cal.sat24 ? '24' : 'none'), week: cal.week === 'mon' ? 'mon' : 'sun',
    bg: 'none', soft: '#fef9e7', faint: 25, strip: false, layout: 'p3', fold: true, custom: '#15803d', /* CM12-F4: was '#92d36e' (CM6); saved custom values are kept */ font: '#000000', rcol: '#cfcfcf', lhead: '', legend: true, mfill: '#d9d9d9' }; /* CM12-F3: legend + month row fill */ /* CM10: Holiday List header */ /* CM9: restricted holiday colour */ /* CM6: custom holiday colour + font colour */ /* CM5: fold on (existing users get it too) */ /* CM4: bg default None = white */
  Object.keys(D).forEach((k) => { if (P[k] === undefined || P[k] === null) P[k] = D[k]; });
  if (!window.CMRender.LAYOUTS[P.layout]) P.layout = 'p3';
  const HEX = /^#[0-9a-f]{6}$/i; /* CM6 */
  if (!HEX.test(P.custom)) P.custom = D.custom;
  if (!HEX.test(P.font)) P.font = D.font;
  if (!HEX.test(P.rcol)) P.rcol = D.rcol; /* CM9 */
  if (typeof P.lhead !== 'string') P.lhead = ''; /* CM10 */
  if (typeof P.legend !== 'boolean') P.legend = true; if (!HEX.test(P.mfill)) P.mfill = D.mfill; /* CM12-F3 */
  /* CM12: holiday list layout (Classic default) + Classic options */
  if (P.llay !== 'simple') P.llay = 'classic';
  if (typeof P.lsub !== 'string') P.lsub = 'LIST OF HOLIDAYS';
  ['ldeco', 'labcd', 'lmerge'].forEach((k) => { if (typeof P[k] !== 'boolean') P[k] = true; });
  if (!HEX.test(P.lhc)) P.lhc = '#2e75b6';
  if (P.colour !== 'custom' && !window.CMRender.COLOURS[P.colour]) P.colour = 'green';
  if (['none', 'soft', 'pic'].indexOf(P.bg) < 0) P.bg = 'none'; /* CM4: unknown / old value -> white */
  P.year = D.year; /* opens on the current year unless Calendar passes ?year= */
  const q = /[?&]year=(\d{4})/.exec(location.search);
  if (q) P.year = +q[1];
  const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* full / private mode */ } };

  /* holidays for a year: CM3 lists when loaded, otherwise the Calendar's built-in fixed list */
  function hols(y) {
    if (window.CMHol) return window.CMHol.forYear(y);
    return window.CalHolidays ? window.CalHolidays.list(y).map((h) => ({ m: h.m, d: h.d, name: h.name })) : [];
  }
  const api = { P, save, hols, render, bgImg: null, sheet: null };

  function opts() {
    return { year: P.year, week: P.week, colour: P.colour === 'custom' ? P.custom : P.colour, font: P.font, /* CM6 */ rcolour: P.rcol, /* CM9 */ sundays: P.sundays, sat: P.sat, hols: hols(P.year),
      bg: { type: P.bg, colour: P.soft, img: api.bgImg, faint: P.faint / 100 }, strip: P.strip, layout: P.layout, fold: P.fold !== false, legend: P.legend, mfill: P.mfill }; /* CM12-F3 */
  }
  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { window.CMRender.draw($('sheet'), opts()); page(); sync(); });
  }
  /* CM4: preview shape + @page size follow the layout */
  function page() {
    const land = window.CMRender.layoutOf(P.layout).land;
    document.body.classList.toggle('land', land);
    let st = $('cm-page');
    if (!st) { st = document.createElement('style'); st.id = 'cm-page'; document.head.appendChild(st); }
    st.textContent = '@page{size:A4 ' + (land ? 'landscape' : 'portrait') + ';margin:0}';
  }
  api.isLand = () => window.CMRender.layoutOf(P.layout).land;
  /* a fresh full-size sheet canvas (Print / PDF) */
  api.sheetCanvas = () => window.CMRender.draw(document.createElement('canvas'), opts());

  function sync() {
    $('year').value = P.year;
    document.querySelectorAll('.seg').forEach((s) => s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(P[s.dataset.key]) === b.dataset.v)));
    document.querySelectorAll('#colours button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.colour));
    if ($('custom')) { $('custom').value = P.custom; $('custom').closest('label').classList.toggle('on', P.colour === 'custom'); } /* CM6 */
    if ($('font')) $('font').value = P.font;
    if ($('rcustom')) { $('rcustom').value = P.rcol; document.querySelectorAll('#rcolours button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.rcol)); } /* CM9 */
    $('sundays').checked = P.sundays !== false;
    $('fold').checked = P.fold !== false; /* CM5 */
    if ($('legend')) $('legend').checked = P.legend !== false; /* CM12-F3 */
    if ($('mcustom')) { $('mcustom').value = P.mfill; document.querySelectorAll('#mfills button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.mfill.toLowerCase())); }
    if (api.onSync) api.onSync();
  }

  /* UI */
  const cs = window.CMRender.COLOURS;
  /* $('colours').innerHTML = Object.keys(cs).map((k) => '<button type="button" data-v="' + k + '" style="background:' + cs[k][0] + '" aria-label="' + k + '" title="' + k[0].toUpperCase() + k.slice(1) + '"></button>').join('');  (CM1-CM12-F3) */
  const cn = window.CMRender.COLOUR_NAMES || {}, cname = (k) => cn[k] || (k[0].toUpperCase() + k.slice(1)); /* CM12-F4 */
  $('colours').innerHTML = Object.keys(cs).map((k) => '<button type="button" data-v="' + k + '" style="background:' + cs[k][0] + '" aria-label="' + cname(k) + '" title="' + cname(k) + '"></button>').join('');
  $('colours').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; P.colour = b.dataset.v; save(); render(); });
  document.querySelectorAll('.seg').forEach((s) => s.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; P[s.dataset.key] = b.dataset.v; save(); render();
  }));
  /* CM9: restricted colour presets + custom */
  const rcs = window.CMRender.RCOLOURS;
  if ($('rcolours')) {
    $('rcolours').innerHTML = Object.keys(rcs).map((k) => '<button type="button" data-v="' + rcs[k] + '" style="background:' + rcs[k] + '" aria-label="' + k + '" title="' + k[0].toUpperCase() + k.slice(1) + '"></button>').join('');
    $('rcolours').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; P.rcol = b.dataset.v; save(); render(); });
  }
  if ($('rcustom')) $('rcustom').oninput = () => { P.rcol = $('rcustom').value; save(); render(); };
  /* CM6: custom holiday colour + font colour */
  if ($('custom')) $('custom').oninput = () => { P.custom = $('custom').value; P.colour = 'custom'; save(); render(); };
  if ($('font')) $('font').oninput = () => { P.font = $('font').value; save(); render(); };
  if ($('font-reset')) $('font-reset').onclick = () => { P.font = '#000000'; save(); render(); };
  $('sundays').onchange = () => { P.sundays = $('sundays').checked; save(); render(); };
  $('fold').onchange = () => { P.fold = $('fold').checked; save(); render(); }; /* CM5 */
  /* CM12-F3: legend toggle + month row fill (White = none, Light grey, custom) */
  if ($('legend')) $('legend').onchange = () => { P.legend = $('legend').checked; save(); render(); };
  if ($('mfills')) {
    $('mfills').innerHTML = [['#ffffff', 'White (no fill)'], ['#d9d9d9', 'Light grey']].map(([v, n]) => '<button type="button" data-v="' + v + '" style="background:' + v + '" aria-label="' + n + '" title="' + n + '"></button>').join('');
    $('mfills').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; P.mfill = b.dataset.v; save(); render(); });
  }
  if ($('mcustom')) $('mcustom').oninput = () => { P.mfill = $('mcustom').value; save(); render(); };
  const setYear = (y) => { y = Math.round(+y); if (!(y >= 1900 && y <= 2200)) { sync(); return; } P.year = y; save(); render(); if (api.onYear) api.onYear(); };
  $('y-prev').onclick = () => setYear(P.year - 1);
  $('y-next').onclick = () => setYear(P.year + 1);
  $('year').onchange = () => setYear($('year').value);

  /* Print: draw the sheet to an image and print only that (see @media print) */
  $('print').onclick = () => {
    const img = $('print-img');
    img.onload = () => { img.onload = null; setTimeout(() => window.print(), 50); };
    img.src = api.sheetCanvas().toDataURL('image/png');
  };
  $('ver').textContent = RELEASE;

  /* CM3 tabs (only present once the Holidays page ships) */
  const tabs = $('tabs');
  if (tabs) tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === b));
    $('page-design').hidden = b.dataset.page !== 'design';
    $('page-hol').hidden = b.dataset.page !== 'hol';
    if ($('page-list')) $('page-list').hidden = b.dataset.page !== 'list'; /* CM10 */
    if (b.dataset.page === 'hol' && window.CMHol) window.CMHol.show(P.year);
    else if (b.dataset.page === 'list' && api.listRender) { api.listRender(); render(); } /* CM10 */
    else render();
  });
  window.addEventListener('storage', (e) => { if (e.key === SKEY) { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } render(); } });
  save();
  render();
  return api;
})();
