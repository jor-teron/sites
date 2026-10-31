/* Calendar Maker CM13 ui: Holidays page (CM3). window.CM.Hol (old window.CMHol API kept, _ = test hooks).
   CM11: optional range end, additive: fixed {em, ed} (end month/day, same year), dated {end:'YYYY-MM-DD'}; no end = one day.
   Every-year input is Day + Month selects (no year); 29 Feb only shows in leap years.
   CM9: any holiday may carry r:true = Restricted; missing r = Gazetted (older saves load unchanged).
   CM18: type select per row (Gazetted, Restricted, Public, School); t 'p' / 's' for Public / School (Hd.setType).
   CM19: third repeat choice 'Every year, date changes' (H.moving, see core/cm_holidays.js): carried to every year by
   name; a year with no date shows in 'Needs a date for YYYY' at the top and is not drawn or counted.
   Saved in 'calendar-maker-holidays' (see core/cm_settings.js). Custom holidays stay in Calendar Maker only;
   the Calendar app is not changed. */
window.CM = window.CM || {};
window.CM.Hol = (function () {
  'use strict';
  const S = window.CM.Settings, Hd = window.CM.Holidays, MS = Hd.MS, mlen = Hd.mlen, readFx = Hd.readFx;
  const $ = (id) => document.getElementById(id);
  const H = S.loadHolidays();
  const defaults = () => Hd.builtIns(2000); /* built-ins = Gazetted */
  const fixed = () => Hd.fixedOf(H);
  /* const save = () => { try { localStorage.setItem(HKEY, JSON.stringify(H)); } catch (_) { (empty) } if (window.CM) window.CM.render(); };  (CM3) */
  let warned = false;
  const save = () => {
    if (!S.saveHolidays(H)) { /* CM4: tell the user once that changes are not kept */
      if (!warned && window.UiDialog) {
        warned = true;
        window.UiDialog.info('Holidays not saved',
          [['Note', 'This browser is not letting the page save. Changes last for this visit only.']]);
      }
    }
    if (window.CM.render) window.CM.render();
  };
  const own = () => { if (!H.fixed) H.fixed = defaults(); return H.fixed; };
  const esc = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let year = new Date().getFullYear();

  const forYear = (y) => Hd.forYear(H, y);

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
  /* const chip = (h) => '<button type="button" class="chip' + (h.r ? ' r' : '') +
    '" data-act="type" title="Tap to switch type">' + (h.r ? 'Restricted' : 'Gazetted') + '</button>';  (CM9-CM17) */
  /* CM18: type select chip with the 4 types */
  const chip = (h) => { const t = Hd.typeOf(h);
    return '<select class="chip ' + t + '" data-act="type" aria-label="Type" title="Holiday type">' + Hd.TYPES.map((k) =>
      '<option value="' + k + '"' + (k === t ? ' selected' : '') + '>' + Hd.TYPE_NAMES[k] + '</option>').join('') + '</select>'; };
  const rowBtns = (h) => chip(h) +
    '<button type="button" data-act="ren">Rename</button><button type="button" data-act="del">Delete</button></li>';
  /* const split = (rows, empty) => {
    const g = rows.filter((x) => !x.h.r), r = rows.filter((x) => x.h.r);
    return (g.length ? g.map((x) => x.html).join('') : '<li class="empty">' + empty + '</li>') +
      (r.length ? '<li class="sub">Restricted Holidays</li>' + r.map((x) => x.html).join('') : '');
  };  (CM9-CM17) */
  const split = (rows, empty) => { /* CM18: Gazetted, then Restricted, Public, School blocks */
    const of = (t) => rows.filter((x) => Hd.typeOf(x.h) === t), g = of('g');
    return (g.length ? g.map((x) => x.html).join('') : '<li class="empty">' + empty + '</li>') +
      ['r', 'p', 's'].map((t) => { const l = of(t);
        return l.length ? '<li class="sub">' + Hd.TYPE_NAMES[t] + ' Holidays</li>' + l.map((x) => x.html).join('') : ''; }).join('');
  };
  /* CM11: Day + Month selects (no year). Day list fits the month; Feb lists 29 (used in leap years only). blank = no end */
  const dayOpts = (m, sel, blank) => (blank ? '<option value="">To</option>' : '') +
    Array.from({ length: m == null || m === '' ? 31 : mlen(+m) }, (_, k) =>
      '<option value="' + (k + 1) + '"' + (+sel === k + 1 ? ' selected' : '') + '>' + (k + 1) + '</option>').join('');
  const monOpts = (sel, blank) => (blank ? '<option value="">–</option>' : '') +
    MS.map((n, k) => '<option value="' + k + '"' + (sel !== '' && sel != null && +sel === k ? ' selected' : '') +
      '>' + n + '</option>').join('');
  const dm = (act, m, d, blank) => '<select data-act="' + act + 'd" aria-label="Day">' + dayOpts(m, d, blank) +
    '</select><select data-act="' + act + 'm" aria-label="Month">' + monOpts(m, blank) + '</select>';
  const label = (h) => h.d + ' ' + MS[h.m] + (h.em != null ? '–' + h.ed + ' ' + MS[h.em] : '');
  const dlabel = (h) => h.end ? +h.date.slice(8, 10) + ' ' + MS[+h.date.slice(5, 7) - 1] + '–' +
    +h.end.slice(8, 10) + ' ' + MS[+h.end.slice(5, 7) - 1] + ' ' : '';
  const yrange = () => ' min="' + year + '-01-01" max="' + year + '-12-31"';
  function draw() {
    /* CM3-CM10 fixed row: <input type="date" data-act="date" value="YEAR-MM-DD"> ... <b>d Mon</b> name */
    const fx = fixed().map((h, i) => ({ h, i })).sort((a, b) => a.h.m - b.h.m || a.h.d - b.h.d)
      .map(({ h, i }) => ({ h, html: '<li data-i="' + i + '">' + dm('s', h.m, h.d, false) + dm('e', h.em, h.ed, true) +
        '<span title="' + esc(h.name) + '"><b>' + label(h) + '</b> ' + esc(h.name) + '</span>' + rowBtns(h) }));
    $('fx-list').innerHTML = fx.length ? split(fx, 'No gazetted every-year holidays.')
      : '<li class="empty">No every-year holidays.</li>';
    const dt = H.dated.map((h, i) => ({ h, i })).filter(({ h }) => +h.date.slice(0, 4) === year)
      .sort((a, b) => (a.h.date < b.h.date ? -1 : 1))
      .map(({ h, i }) => ({ h, html: '<li data-i="' + i + '"><input type="date" data-act="date" value="' + h.date + '"' +
        yrange() + ' aria-label="Date"><input type="date" data-act="end" value="' + (h.end || '') + '"' + yrange() +
        ' aria-label="To (optional)" title="To (optional)"><span title="' + esc(h.name) + '"><b>' + dlabel(h) + '</b>' +
        esc(h.name) + '</span>' + rowBtns(h) })); /* CM11: + To date */
    $('dt-list').innerHTML = dt.length ? split(dt, 'No gazetted ones for ' + year + '.')
      : '<li class="empty">None for ' + year + ' yet.</li>';
    $('dt-year').textContent = '(' + year + ')';
    drawMoving(); /* CM19 */
    /* ['fx-date', 'dt-date'].forEach(...)  (CM3-CM10) */
    ['dt-date', 'dt-end', 'mv-date', 'mv-end'].forEach((id) => { if ($(id)) { $(id).min = year + '-01-01'; $(id).max = year + '-12-31'; } }); /* CM11 */
  }
  /* CM19: moving holidays. Rows carry the year's start / To dates (empty when undated). */
  const mvRow = (h, i) => { const v = (h.dates && h.dates[year]) || {};
    return '<li data-i="' + i + '"><input type="date" data-act="mstart" value="' + (v.start || '') + '"' + yrange() +
      ' aria-label="Date for ' + year + '"><input type="date" data-act="mend" value="' + (v.end || '') + '"' + yrange() +
      ' aria-label="To (optional)" title="To (optional)"><span title="' + esc(h.name) + '"><b>' + (v.start ? dlabel({ date: v.start, end: v.end }) ||
      (+v.start.slice(8, 10) + ' ' + MS[+v.start.slice(5, 7) - 1] + ' ') : '') + '</b>' + esc(h.name) + '</span>' + rowBtns(h); };
  const needN = (y) => Hd.needDate(H, y).length;
  const needText = (y) => { const n = needN(y); return n ? n + ' holiday' + (n === 1 ? ' needs a date' : 's need dates') + ' for ' + y : ''; };
  /* CM19: small note on Design / Holiday List (elements with class mv-note) */
  function notes(y) {
    const t = needText(y);
    document.querySelectorAll('.mv-note').forEach((el) => { el.textContent = t ? t + ' (Holidays tab); they are not on the calendar yet.' : ''; el.hidden = !t; });
  }
  function drawMoving() {
    if (!$('mv-list')) return;
    const need = Hd.needDate(H, year), sorted = (a) => a.sort((x, y) => (x.h.name < y.h.name ? -1 : 1));
    $('mv-need').hidden = !need.length;
    $('mv-need-year').textContent = year;
    $('mv-need-list').innerHTML = sorted(need).map(({ h, i }) => mvRow(h, i)).join('');
    $('mv-remind').textContent = needText(year); $('mv-remind').hidden = !need.length;
    const dt = H.moving.map((h, i) => ({ h, i })).filter(({ h }) => h.dates && h.dates[year])
      .sort((a, b) => (a.h.dates[year].start < b.h.dates[year].start ? -1 : 1))
      .map(({ h, i }) => ({ h, html: mvRow(h, i) }));
    $('mv-list').innerHTML = dt.length ? split(dt, 'No gazetted ones dated for ' + year + '.')
      : '<li class="empty">' + (H.moving.length ? 'None dated for ' + year + ' yet.' : 'None yet.') + '</li>';
    $('mv-year').textContent = '(' + year + ')';
    notes(year);
  }
  async function actMv(e) {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    const item = H.moving[+li.dataset.i], a = e.target.dataset.act; if (!item) return;
    const cur = (item.dates && item.dates[year]) || {};
    if (e.type === 'change' && a === 'mstart') {
      const v = e.target.value;
      if (!v) { Hd.setMoving(item, year, ''); save(); draw(); return; }
      if (v.slice(0, 4) !== String(year)) { draw(); return; }
      Hd.setMoving(item, year, v, Hd.autoEnd(v, item.len)); /* end auto-filled from the last known length */
      save(); draw(); return;
    }
    if (e.type === 'change' && a === 'mend') {
      const v = e.target.value;
      if (!cur.start) { draw(); return; }
      if (v && v <= cur.start) { badRange(); draw(); return; }
      Hd.setMoving(item, year, cur.start, v); save(); draw(); return;
    }
    if (e.type === 'change' && a === 'type') { Hd.setType(item, e.target.value); save(); draw(); return; }
    if (e.type !== 'click') return;
    if (a === 'ren') {
      const n = await window.UiDialog.ask('Rename holiday', item.name, 'Rename');
      if (n && n.trim()) { item.name = n.trim().slice(0, 60); save(); draw(); }
    } else if (a === 'del') {
      const pick = await window.UiDialog.choose('Delete holiday?', item.name + ': remove it for ' + year + ' only, or every year?',
        [{ value: 'all', label: 'Every year', kind: 'danger' }, { value: 'year', label: year + ' only', kind: 'primary' }]);
      const v = pick && pick.value;
      if (v === 'all') H.moving.splice(H.moving.indexOf(item), 1);
      else if (v === 'year') Hd.setMoving(item, year, '', '', true); /* off this year: not asked for again */
      else return;
      save(); draw();
    }
  }
  function addMv() {
    const n = $('mv-name').value.trim().slice(0, 60), sd = $('mv-date').value, ed = $('mv-end').value;
    if (!n) { window.UiDialog.info('Add holiday', [['Needed', 'Type a name. The date is optional; you can fill it in later.']]); return; }
    if (sd && ed && ed <= sd) { badRange(); return; }
    const ti = $('mv-type'), tv = ti && Hd.TYPES.indexOf(ti.value) >= 0 ? ti.value : 'g';
    const it = Hd.setType({ name: n, len: 1, dates: {} }, tv);
    if (sd) Hd.setMoving(it, year, year + sd.slice(4), ed ? year + ed.slice(4) : '');
    H.moving.push(it);
    $('mv-name').value = ''; $('mv-date').value = ''; $('mv-end').value = '';
    save(); draw();
  }
  function show(y) { year = y; draw(); }

  async function act(list, e) {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    const i = +li.dataset.i, a = e.target.dataset.act, isFx = list === 'fx';
    const arr = isFx ? own() : H.dated, item = arr[i];
    /* CM3-CM10: change 'date' -> fixed m/d from a full date, or dated date */
    if (e.type === 'change' && a === 'date' && !isFx) {
      const v = e.target.value; if (!v) return;
      if (item.end && item.end <= v) { badRange(); draw(); return; } /* CM11 */
      item.date = v; save(); draw(); return;
    }
    if (e.type === 'change' && a === 'end') { /* CM11 */
      const v = e.target.value;
      if (!v) delete item.end; else if (v <= item.date) { badRange(); draw(); return; } else item.end = v;
      save(); draw(); return;
    }
    if (e.type === 'change' && /^[se][dm]$/.test(a)) { /* CM11: Day/Month selects on an every-year row */
      const q = (k) => li.querySelector('[data-act="' + k + '"]').value;
      if (q('em') !== '' && q('ed') === '') { /* end month picked first: wait for its day */
        const es = li.querySelector('[data-act="ed"]'); es.innerHTML = dayOpts(q('em'), '', true); return;
      }
      const r = readFx(q('sd'), q('sm'), q('ed'), q('em'));
      if (!r) { badRange(); draw(); return; }
      item.m = r.m; item.d = r.d;
      if (r.em != null) { item.em = r.em; item.ed = r.ed; } else { delete item.em; delete item.ed; }
      save(); draw(); return;
    }
    if (e.type === 'change' && a === 'type') { Hd.setType(item, e.target.value); save(); draw(); return; } /* CM18 */
    if (e.type !== 'click') return;
    /* if (a === 'type') { if (item.r) delete item.r; else item.r = true; save(); draw(); return; }  (CM9-CM17 chip toggle) */
    if (a === 'ren') {
      const n = await window.UiDialog.ask('Rename holiday', item.name, 'Rename');
      if (n && n.trim()) { item.name = n.trim().slice(0, 60); save(); draw(); }
    } else if (a === 'del') {
      if (await window.UiDialog.confirm('Delete holiday?', item.name, 'Delete', true)) { arr.splice(i, 1); save(); draw(); }
    }
  }
  /* CM11: end before (or on) start is refused with an in-app note */
  function badRange() {
    if (window.UiDialog) window.UiDialog.info('Check the dates',
      [['To', 'The To date must be after the start date (same year). Leave To empty for a one-day holiday.']]);
  }
  function add(isFx) {
    /* CM3-CM10: const di = $(isFx ? 'fx-date' : 'dt-date') ... v = di.value (fixed took m/d from a full date) */
    const ni = $(isFx ? 'fx-name' : 'dt-name'), n = ni.value.trim().slice(0, 60);
    const fr = isFx ? readFx($('fx-d').value, $('fx-m').value, $('fx-ed').value, $('fx-em').value) : null;
    const v = isFx ? (fr ? 'ok' : '') : $('dt-date').value, ev = isFx ? '' : ($('dt-end') ? $('dt-end').value : '');
    if (isFx && !fr && $('fx-d').value && $('fx-m').value && n) { badRange(); return; }
    if (!v || !n) { window.UiDialog.info('Add holiday', [['Needed', 'Pick a date and type a name.']]); return; }
    if (!isFx && ev && ev.slice(5) <= v.slice(5)) { badRange(); return; }
    /* if (isFx) own().push({ m, d, name: n }); else H.dated.push({ date, name: n });  (CM3-CM8) */
    /* const ti = $(isFx ? 'fx-type' : 'dt-type'), rs = !!(ti && ti.value === 'r');  (CM9-CM17) */
    const ti = $(isFx ? 'fx-type' : 'dt-type'), tv = ti && Hd.TYPES.indexOf(ti.value) >= 0 ? ti.value : 'g'; /* CM18 */
    /* const it = isFx ? { m: +v.slice(5, 7) - 1, d: +v.slice(8, 10), name: n } : { date: year + v.slice(4), name: n };  (CM3-CM10) */
    const it = isFx ? Object.assign(fr, { name: n }) : { date: year + v.slice(4), name: n }; /* CM11 */
    if (!isFx && ev) it.end = year + ev.slice(4);
    /* if (rs) it.r = true;  (CM9-CM17) */
    Hd.setType(it, tv);
    if (isFx) own().push(it); else H.dated.push(it);
    ni.value = '';
    if (isFx) { $('fx-ed').value = ''; $('fx-em').value = ''; } else if ($('dt-end')) $('dt-end').value = ''; /* CM11 */
    save(); draw();
  }

  document.addEventListener('DOMContentLoaded', () => {
    ['fx', 'dt'].forEach((k) => {
      const l = $(k + '-list');
      l.addEventListener('click', (e) => act(k, e)); l.addEventListener('change', (e) => act(k, e));
    });
    /* CM11: fill the add-row Day/Month selects; a month change refits its day list */
    const fit = (dId, mId, blank) => { const dv = $(dId).value; $(dId).innerHTML = dayOpts($(mId).value, dv, blank); };
    if ($('fx-m')) {
      $('fx-m').innerHTML = monOpts(new Date().getMonth(), false);
      $('fx-d').innerHTML = dayOpts($('fx-m').value, new Date().getDate(), false);
      $('fx-em').innerHTML = monOpts('', true); $('fx-ed').innerHTML = dayOpts('', '', true);
      $('fx-m').onchange = () => fit('fx-d', 'fx-m', false); $('fx-em').onchange = () => fit('fx-ed', 'fx-em', true);
    }
    if ($('mv-list')) { /* CM19 */
      ['mv-list', 'mv-need-list'].forEach((id) => { $(id).addEventListener('click', actMv); $(id).addEventListener('change', actMv); });
      $('mv-add').onclick = addMv;
      $('mv-name').onkeydown = (e) => { if (e.key === 'Enter') addMv(); };
    }
    $('fx-add').onclick = () => add(true);
    $('dt-add').onclick = () => add(false);
    $('fx-name').onkeydown = (e) => { if (e.key === 'Enter') add(true); };
    $('dt-name').onkeydown = (e) => { if (e.key === 'Enter') add(false); };
    $('fx-reset').onclick = async () => {
      const msg = 'Every-year holidays go back to the Calendar list. This-year-only holidays are kept.';
      if (await window.UiDialog.confirm('Restore defaults?', msg, 'Restore', true)) { H.fixed = null; save(); draw(); }
    };
  });
  /* return { forYear, show, readFx, _H: H, _save: save, _own: own, _act: act, _add: add };  (CM13-CM18) */
  return { forYear, show, readFx, notes, needText, _H: H, _save: save, _own: own, _act: act, _add: add, _actMv: actMv, _addMv: addMv }; /* _ = test hooks; CM19 notes, needText, _actMv, _addMv */
})();
