/* CM9: any holiday may carry r:true = Restricted; missing r = Gazetted (older saves load unchanged).
   Calendar Maker CM3: Holidays page. Saved in 'calendar-maker-holidays':
   { fixed: null (= Calendar's built-in list) | [{m (0-11), d, name}], dated: [{date:'YYYY-MM-DD', name}] }
   Custom holidays stay in Calendar Maker only; the Calendar app is not changed. */
window.CMHol = (function () {
  'use strict';
  const HKEY = 'calendar-maker-holidays';
  const $ = (id) => document.getElementById(id);
  const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (n) => String(n).padStart(2, '0');
  let H = {};
  try { H = JSON.parse(localStorage.getItem(HKEY) || '{}') || {}; } catch (_) { H = {}; }
  if (!H || typeof H !== 'object') H = {};
  if (!Array.isArray(H.dated)) H.dated = [];
  if (!Array.isArray(H.fixed)) H.fixed = null; /* null = never edited -> built-in list; an array (even empty) is kept as is */
  /* CM4: drop broken entries from a damaged key instead of crashing */
  const okName = (h) => h && typeof h.name === 'string';
  H.dated = H.dated.filter((h) => okName(h) && /^\d{4}-\d{2}-\d{2}$/.test(h.date));
  if (H.fixed) H.fixed = H.fixed.filter((h) => okName(h) && h.m >= 0 && h.m <= 11 && h.d >= 1 && h.d <= 31);
  const defaults = () => (window.CalHolidays ? window.CalHolidays.list(2000).map((h) => ({ m: h.m, d: h.d, name: h.name })) : []); /* built-ins = Gazetted */
  const fixed = () => H.fixed || defaults();
  /* const save = () => { try { localStorage.setItem(HKEY, JSON.stringify(H)); } catch (_) { (empty) } if (window.CM) window.CM.render(); };  (CM3) */
  let warned = false;
  const save = () => {
    try { localStorage.setItem(HKEY, JSON.stringify(H)); } catch (_) { /* CM4: tell the user once that changes are not kept */
      if (!warned && window.UiDialog) { warned = true; window.UiDialog.info('Holidays not saved', [['Note', 'This browser is not letting the page save. Changes last for this visit only.']]); }
    }
    if (window.CM) window.CM.render();
  };
  const own = () => { if (!H.fixed) H.fixed = defaults(); return H.fixed; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let year = new Date().getFullYear();

  function forYear(y) {
    /* const out = fixed()...map((h) => ({ m: h.m, d: h.d, name: h.name }));  (CM3-CM8) */
    const out = fixed().filter((h) => h.d <= new Date(y, h.m + 1, 0).getDate()).map((h) => ({ m: h.m, d: h.d, name: h.name, r: h.r === true })); /* CM9 */
    H.dated.forEach((h) => { if (+h.date.slice(0, 4) === y) out.push({ m: +h.date.slice(5, 7) - 1, d: +h.date.slice(8, 10), name: h.name, r: h.r === true }); });
    return out;
  }

  /* CM3-CM8 draw() (one list per section, no type):
  //   function draw() {
  //     const fx = fixed().map((h, i) => ({ h, i })).sort((a, b) => a.h.m - b.h.m || a.h.d - b.h.d);
  //     $('fx-list').innerHTML = fx.length ? fx.map(({ h, i }) => '<li data-i="' + i + '"><input type="date" data-act="date" value="' + year + '-' + p2(h.m + 1) + '-' + p2(h.d) + '" aria-label="Date"><span title="' + esc(h.name) + '"><b>' + h.d + ' ' + MS[h.m] + '</b> ' + esc(h.name) + '</span><button type="button" data-act="ren">Rename</button><button type="button" data-act="del">Delete</button></li>').join('') : '<li class="empty">No every-year holidays.</li>';
  //     const dt = H.dated.map((h, i) => ({ h, i })).filter(({ h }) => +h.date.slice(0, 4) === year).sort((a, b) => (a.h.date < b.h.date ? -1 : 1));
  //     $('dt-list').innerHTML = dt.length ? dt.map(({ h, i }) => '<li data-i="' + i + '"><input type="date" data-act="date" value="' + h.date + '" min="' + year + '-01-01" max="' + year + '-12-31" aria-label="Date"><span title="' + esc(h.name) + '">' + esc(h.name) + '</span><button type="button" data-act="ren">Rename</button><button type="button" data-act="del">Delete</button></li>').join('') : '<li class="empty">None for ' + year + ' yet.</li>';
  //     $('dt-year').textContent = '(' + year + ')';
  //     ['fx-date', 'dt-date'].forEach((id) => { $(id).min = year + '-01-01'; $(id).max = year + '-12-31'; });
  //   }
  */
  /* CM9: each row gets a Gazetted/Restricted chip; Restricted rows listed in their own block below the main ones */
  const chip = (h) => '<button type="button" class="chip' + (h.r ? ' r' : '') + '" data-act="type" title="Tap to switch type">' + (h.r ? 'Restricted' : 'Gazetted') + '</button>';
  const rowBtns = (h) => chip(h) + '<button type="button" data-act="ren">Rename</button><button type="button" data-act="del">Delete</button></li>';
  const split = (rows, empty) => {
    const g = rows.filter((x) => !x.h.r), r = rows.filter((x) => x.h.r);
    return (g.length ? g.map((x) => x.html).join('') : '<li class="empty">' + empty + '</li>') +
      (r.length ? '<li class="sub">Restricted Holidays</li>' + r.map((x) => x.html).join('') : '');
  };
  function draw() {
    const fx = fixed().map((h, i) => ({ h, i })).sort((a, b) => a.h.m - b.h.m || a.h.d - b.h.d)
      .map(({ h, i }) => ({ h, html: '<li data-i="' + i + '"><input type="date" data-act="date" value="' + year + '-' + p2(h.m + 1) + '-' + p2(h.d) + '" aria-label="Date"><span title="' + esc(h.name) + '"><b>' + h.d + ' ' + MS[h.m] + '</b> ' + esc(h.name) + '</span>' + rowBtns(h) }));
    $('fx-list').innerHTML = fx.length ? split(fx, 'No gazetted every-year holidays.') : '<li class="empty">No every-year holidays.</li>';
    const dt = H.dated.map((h, i) => ({ h, i })).filter(({ h }) => +h.date.slice(0, 4) === year).sort((a, b) => (a.h.date < b.h.date ? -1 : 1))
      .map(({ h, i }) => ({ h, html: '<li data-i="' + i + '"><input type="date" data-act="date" value="' + h.date + '" min="' + year + '-01-01" max="' + year + '-12-31" aria-label="Date"><span title="' + esc(h.name) + '">' + esc(h.name) + '</span>' + rowBtns(h) }));
    $('dt-list').innerHTML = dt.length ? split(dt, 'No gazetted ones for ' + year + '.') : '<li class="empty">None for ' + year + ' yet.</li>';
    $('dt-year').textContent = '(' + year + ')';
    ['fx-date', 'dt-date'].forEach((id) => { $(id).min = year + '-01-01'; $(id).max = year + '-12-31'; });
  }
  function show(y) { year = y; draw(); }

  async function act(list, e) {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    const i = +li.dataset.i, a = e.target.dataset.act, isFx = list === 'fx';
    const arr = isFx ? own() : H.dated, item = arr[i];
    if (e.type === 'change' && a === 'date') {
      const v = e.target.value; if (!v) return;
      if (isFx) { item.m = +v.slice(5, 7) - 1; item.d = +v.slice(8, 10); } else item.date = v;
      save(); draw(); return;
    }
    if (e.type !== 'click') return;
    if (a === 'type') { if (item.r) delete item.r; else item.r = true; save(); draw(); return; } /* CM9 */
    if (a === 'ren') {
      const n = await window.UiDialog.ask('Rename holiday', item.name, 'Rename');
      if (n && n.trim()) { item.name = n.trim().slice(0, 60); save(); draw(); }
    } else if (a === 'del') {
      if (await window.UiDialog.confirm('Delete holiday?', item.name, 'Delete', true)) { arr.splice(i, 1); save(); draw(); }
    }
  }
  function add(isFx) {
    const di = $(isFx ? 'fx-date' : 'dt-date'), ni = $(isFx ? 'fx-name' : 'dt-name');
    const v = di.value, n = ni.value.trim().slice(0, 60);
    if (!v || !n) { window.UiDialog.info('Add holiday', [['Needed', 'Pick a date and type a name.']]); return; }
    /* if (isFx) own().push({ m, d, name: n }); else H.dated.push({ date, name: n });  (CM3-CM8) */
    const ti = $(isFx ? 'fx-type' : 'dt-type'), rs = !!(ti && ti.value === 'r'); /* CM9 */
    const it = isFx ? { m: +v.slice(5, 7) - 1, d: +v.slice(8, 10), name: n } : { date: year + v.slice(4), name: n };
    if (rs) it.r = true;
    if (isFx) own().push(it); else H.dated.push(it);
    ni.value = ''; save(); draw();
  }

  document.addEventListener('DOMContentLoaded', () => {
    ['fx', 'dt'].forEach((k) => { const l = $(k + '-list'); l.addEventListener('click', (e) => act(k, e)); l.addEventListener('change', (e) => act(k, e)); });
    $('fx-add').onclick = () => add(true);
    $('dt-add').onclick = () => add(false);
    $('fx-name').onkeydown = (e) => { if (e.key === 'Enter') add(true); };
    $('dt-name').onkeydown = (e) => { if (e.key === 'Enter') add(false); };
    $('fx-reset').onclick = async () => {
      if (await window.UiDialog.confirm('Restore defaults?', 'Every-year holidays go back to the Calendar list. This-year-only holidays are kept.', 'Restore', true)) { H.fixed = null; save(); draw(); }
    };
  });
  return { forYear, show, _H: H, _save: save, _own: own }; /* _ = test hooks */
})();
