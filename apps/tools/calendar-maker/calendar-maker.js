/* Calendar Maker page logic (CM1). Settings in 'calendar-maker-settings':
   { year, colour:'green'|'red'|'yellow'|'blue'|'orange', sundays (bool, default true), sat:'none'|'24'|'all',
     week:'sun'|'mon' (default from Calendar's 'calendar-settings-v1'), bg:'none'|'soft'|'pic', soft, faint, strip (CM2) }
   ?year=YYYY (from Calendar's "Make printable") wins over the saved year. Exposes window.CM for CM2 / CM3 plug-ins. */
window.CM = (function () {
  'use strict';
  const SKEY = 'calendar-maker-settings', RELEASE = 'CM4';
  const $ = (id) => document.getElementById(id);
  let P = {};
  try { P = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (_) { P = {}; }
  let cal = {};
  try { cal = JSON.parse(localStorage.getItem('calendar-settings-v1') || '{}') || {}; } catch (_) { cal = {}; }
  const D = { year: new Date().getFullYear(), colour: 'green', sundays: true,
    sat: cal.satAll ? 'all' : (cal.sat24 ? '24' : 'none'), week: cal.week === 'mon' ? 'mon' : 'sun',
    bg: 'none', soft: '#fef9e7', faint: 25, strip: false, layout: 'p3' }; /* CM4: bg default None = white */
  Object.keys(D).forEach((k) => { if (P[k] === undefined || P[k] === null) P[k] = D[k]; });
  if (!window.CMRender.LAYOUTS[P.layout]) P.layout = 'p3';
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
    return { year: P.year, week: P.week, colour: P.colour, sundays: P.sundays, sat: P.sat, hols: hols(P.year),
      bg: { type: P.bg, colour: P.soft, img: api.bgImg, faint: P.faint / 100 }, strip: P.strip, layout: P.layout };
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
    $('sundays').checked = P.sundays !== false;
    if (api.onSync) api.onSync();
  }

  /* UI */
  const cs = window.CMRender.COLOURS;
  $('colours').innerHTML = Object.keys(cs).map((k) => '<button type="button" data-v="' + k + '" style="background:' + cs[k][0] + '" aria-label="' + k + '" title="' + k[0].toUpperCase() + k.slice(1) + '"></button>').join('');
  $('colours').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; P.colour = b.dataset.v; save(); render(); });
  document.querySelectorAll('.seg').forEach((s) => s.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; P[s.dataset.key] = b.dataset.v; save(); render();
  }));
  $('sundays').onchange = () => { P.sundays = $('sundays').checked; save(); render(); };
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
    if (b.dataset.page === 'hol' && window.CMHol) window.CMHol.show(P.year);
    else render();
  });
  window.addEventListener('storage', (e) => { if (e.key === SKEY) { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } render(); } });
  save();
  render();
  return api;
})();
