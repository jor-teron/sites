/* Calendar logic. Settings in 'calendar-settings-v1': { week:'sun'|'mon', hol:'on'|'off', theme:'system'|'light'|'dark',
   sat24, satAll, dateOnly (booleans, C5, default false) }. Red days (C5): Sundays, fixed holidays (when On) and the
   Saturday options get a red cell; Saturday holidays only colour the cell (no names, not in holiday lists).
   State in 'calendar-state-v1': { mode:'month'|'year'|'hol'|'set', y, m (0-11), sel:'YYYY-MM-DD'|null, from, to, inc } */
(function () {
  'use strict';
  const KEY = 'calendar-state-v1', SKEY = 'calendar-settings-v1', VERSION = '1.2', SWIPE = 75, MOVE = 10;
  const MODES = ['month', 'year', 'hol', 'set'];
  const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const S = { mode: 'month', y: now.getFullYear(), m: now.getMonth(), sel: null, from: '', to: '', inc: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* bad data */ }
  if (MODES.indexOf(S.mode) < 0) S.mode = 'month';
  if (!Number.isInteger(S.y) || !Number.isInteger(S.m) || S.m < 0 || S.m > 11) { S.y = now.getFullYear(); S.m = now.getMonth(); }
  const P = { week: 'sun', theme: 'dark', hol: 'on' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) { /* bad data */ }
  if (P.week !== 'mon') P.week = 'sun';
  if (P.hol !== 'off') P.hol = 'on';
  ['sat24', 'satAll', 'dateOnly'].forEach((k) => { P[k] = P[k] === true; });
  const HOL = window.CalHolidays;
  const hols = (s) => (P.hol === 'on' && HOL ? HOL.get(s) : null);
  const WDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* blocked */ } };
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* blocked */ } };

  /* theme: hub pref else system */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    let v = null; try { v = localStorage.getItem('sites-hub.theme'); } catch (_) { /* blocked */ }
    const sys = v === 'dark' ? true : v === 'light' ? false : mq.matches;
    document.documentElement.classList.toggle('dark', P.theme === 'dark' || (P.theme === 'system' && sys));
  }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);

  /* date helpers (UTC day numbers avoid DST issues) */
  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => y + '-' + p2(m + 1) + '-' + p2(d);
  const parse = (s) => { const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return r ? { y: +r[1], m: +r[2] - 1, d: +r[3] } : null; };
  const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 864e5);
  const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const dow = (y, m, d) => new Date(Date.UTC(y, m, d)).getUTCDay();
  const today = () => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; };
  function isoWeek(y, m, d) {
    const t = new Date(Date.UTC(y, m, d)), wd = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - wd);
    const y1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y1) / 864e5 + 1) / 7);
  }
  const first = () => (P.week === 'mon' ? 1 : 0);
  /* red day: Sunday, a Saturday holiday option, or a fixed holiday */
  const satHol = (d, wd) => wd === 6 && (P.satAll || (P.sat24 && ((d >= 8 && d <= 14) || (d >= 22 && d <= 28))));
  const red = (y, m, d) => { const wd = dow(y, m, d); return wd === 0 || satHol(d, wd) || !!hols(iso(y, m, d)); };

  /* month view */
  function renderMonth() {
    const t = today(), f = first();
    $('m-title').textContent = MN[S.m] + ' ' + S.y;
    $('m-wd').innerHTML = [0, 1, 2, 3, 4, 5, 6].map((i) => '<span>' + WD[(i + f) % 7] + '</span>').join('');
    const lead = (dow(S.y, S.m, 1) - f + 7) % 7, n = dim(S.y, S.m), cells = Math.ceil((lead + n) / 7) * 7;
    let h = '';
    for (let i = 0; i < cells; i++) {
      const dt = new Date(Date.UTC(S.y, S.m, 1 - lead + i)), y = dt.getUTCFullYear(), m = dt.getUTCMonth(), d = dt.getUTCDate();
      const c = [];
      if (m !== S.m) c.push('out');
      if (red(y, m, d)) c.push('red');
      if (y === t.y && m === t.m && d === t.d) c.push('today');
      if (S.sel === iso(y, m, d)) c.push('sel');
      const hn = hols(iso(y, m, d)); if (hn) c.push('hol');
      h += '<button type="button" class="' + c.join(' ') + '" data-d="' + iso(y, m, d) + '"' + (hn ? ' title="' + hn.join(', ') + '"' : '') + '>' + d + (hn && !P.dateOnly ? '<span class="hn">' + hn.join(', ') + '</span>' : '') + '</button>';
    }
    $('m-grid').innerHTML = h;
    $('m-grid').classList.toggle('donly', P.dateOnly);
    renderInfo();
    const L = [];
    for (let d = 1; d <= n; d++) { const hn = hols(iso(S.y, S.m, d)); if (hn) L.push('<div><span>' + d + '</span> ' + hn.join(', ') + '</div>'); }
    $('hol-list').innerHTML = L.length ? '<b>Holidays this month</b>' + L.join('') : '';
  }
  function renderInfo() {
    const s = parse(S.sel), el = $('info');
    if (!s) { el.textContent = 'Tap a day for details.'; return; }
    const doy = dayNum(s.y, s.m, s.d) - dayNum(s.y, 0, 0), len = dayNum(s.y + 1, 0, 1) - dayNum(s.y, 0, 1);
    const t = today(), diff = dayNum(s.y, s.m, s.d) - dayNum(t.y, t.m, t.d);
    const rel = diff === 0 ? 'Today' : diff > 0 ? 'In ' + diff + (diff === 1 ? ' day' : ' days') : Math.abs(diff) + (diff === -1 ? ' day' : ' days') + ' ago';
    el.innerHTML = '<b>' + WDL[dow(s.y, s.m, s.d)] + ', ' + s.d + ' ' + MN[s.m] + ' ' + s.y + '</b><br>Day ' + doy + ' of ' + len + ' · ISO week ' + isoWeek(s.y, s.m, s.d) + ' · ' + rel + (hols(S.sel) ? '<br><span class="hol-n">' + hols(S.sel).join(', ') + '</span>' : '');
  }
  function shiftMonth(k) { const d = new Date(Date.UTC(S.y, S.m + k, 1)); S.y = d.getUTCFullYear(); S.m = d.getUTCMonth(); save(); renderMonth(); renderYear(); }
  function goDate(s) { const d = parse(s); if (!d) return; $('sheet').hidden = true; S.y = d.y; S.m = d.m; S.sel = s; setMode('month'); renderMonth(); renderYear(); }
  $('m-prev').onclick = () => shiftMonth(-1);
  $('m-next').onclick = () => shiftMonth(1);
  $('m-today').onclick = () => { const t = today(); goDate(iso(t.y, t.m, t.d)); };
  $('m-grid').addEventListener('click', (e) => {
    if (gridSwiped) return;
    const b = e.target.closest('button'); if (!b) return;
    const d = parse(b.dataset.d); S.sel = b.dataset.d;
    if (d.m !== S.m || d.y !== S.y) { S.y = d.y; S.m = d.m; renderYear(); }
    save(); renderMonth();
  });

  /* year view */
  let yv = S.y;
  function renderYear() {
    const t = today(), f = first();
    $('y-title').textContent = yv;
    let h = '';
    for (let m = 0; m < 12; m++) {
      const lead = (dow(yv, m, 1) - f + 7) % 7, n = dim(yv, m);
      let g = [0, 1, 2, 3, 4, 5, 6].map((i) => '<i>' + WD[(i + f) % 7][0] + '</i>').join('');
      for (let i = 0; i < lead; i++) g += '<span></span>';
      for (let d = 1; d <= n; d++) { const cl = [(yv === t.y && m === t.m && d === t.d) ? 't' : '', red(yv, m, d) ? 'h' : ''].join(' ').trim(); g += '<span' + (cl ? ' class="' + cl + '"' : '') + '>' + d + '</span>'; }
      h += '<button type="button" class="mm' + (yv === t.y && m === t.m ? ' cur' : '') + '" data-m="' + m + '"><b>' + MN[m] + '</b><div class="g">' + g + '</div></button>';
    }
    $('year').innerHTML = h;
  }
  $('y-prev').onclick = () => { yv--; renderYear(); };
  $('y-next').onclick = () => { yv++; renderYear(); };
  $('y-today').onclick = () => { yv = today().y; renderYear(); };
  $('year').addEventListener('click', (e) => { const b = e.target.closest('.mm'); if (!b) return; S.y = yv; S.m = +b.dataset.m; save(); renderMonth(); setMode('month'); });

  /* holiday list screen (always viewable, even with markers Off) */
  let hy = S.y;
  function renderHol() {
    $('h-title').textContent = 'Holidays ' + hy;
    const t = today(), tn = dayNum(t.y, t.m, t.d); let nextDone = false;
    $('hol-table').tBodies[0].innerHTML = (HOL ? HOL.list(hy) : []).map((h) => {
      const n = dayNum(hy, h.m, h.d); let c = '';
      if (n < tn) c = 'past'; else if (!nextDone) { c = 'next'; nextDone = true; }
      return '<tr class="' + c + '" data-d="' + h.date + '"><td>' + h.d + ' ' + MN[h.m].slice(0, 3) + '</td><td>' + WDS[dow(hy, h.m, h.d)] + '</td><td>' + h.name + '</td></tr>';
    }).join('');
  }
  $('h-prev').onclick = () => { hy--; renderHol(); };
  $('h-next').onclick = () => { hy++; renderHol(); };
  $('h-today').onclick = () => { hy = today().y; renderHol(); };
  $('hol-table').addEventListener('click', (e) => { const r = e.target.closest('tr[data-d]'); if (r) goDate(r.dataset.d); });

  /* jump & count sheet (from the Month header) */
  const sheet = $('sheet');
  const openSheet = () => { sheet.hidden = false; };
  const closeSheet = () => { sheet.hidden = true; };
  $('m-tools').onclick = openSheet; $('sheet-x').onclick = closeSheet;
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  const tt = today();
  $('jump-date').value = iso(tt.y, tt.m, tt.d);
  $('jump-go').onclick = () => goDate($('jump-date').value);
  $('jump-date').addEventListener('keydown', (e) => { if (e.key === 'Enter') goDate($('jump-date').value); });
  $('c-from').value = S.from || iso(tt.y, tt.m, tt.d);
  $('c-to').value = S.to || iso(tt.y, 11, 31);
  $('c-inc').checked = !!S.inc;
  function count() {
    const a = parse($('c-from').value), b = parse($('c-to').value), out = $('c-out');
    S.from = $('c-from').value; S.to = $('c-to').value; S.inc = $('c-inc').checked; save();
    if (!a || !b) { out.textContent = 'Pick both dates.'; return; }
    let n = dayNum(b.y, b.m, b.d) - dayNum(a.y, a.m, a.d);
    const neg = n < 0; n = Math.abs(n); if (S.inc) n += 1;
    const w = Math.floor(n / 7), r = n % 7;
    out.innerHTML = '<b id="c-days">' + n + '</b> ' + (n === 1 ? 'day' : 'days') + (neg ? ' (To is before From)' : '') +
      '<br><span style="color:var(--mut)">' + w + (w === 1 ? ' week' : ' weeks') + ' ' + r + (r === 1 ? ' day' : ' days') + (S.inc ? ' · end date included' : '') + '</span>';
  }
  ['c-from', 'c-to', 'c-inc'].forEach((id) => { $(id).addEventListener('input', count); $(id).addEventListener('change', count); });

  /* screens */
  const track = $('track'), vp = $('viewport');
  vp.addEventListener('scroll', () => { if (vp.scrollLeft) vp.scrollLeft = 0; }); /* focus in an off-screen pane must not scroll the track */
  function place(dx) { track.style.transform = 'translateX(calc(' + (-100 / MODES.length * MODES.indexOf(S.mode)) + '% + ' + (dx || 0) + 'px))'; }
  function setMode(m) {
    S.mode = m; save(); place(0); vp.scrollLeft = 0;
    if (document.activeElement && document.activeElement.closest && !document.activeElement.closest('#pane-' + m)) document.activeElement.blur();
    document.querySelectorAll('.dot').forEach((d) => { const on = d.dataset.mode === m; d.classList.toggle('on', on); d.setAttribute('aria-selected', on); });
  }
  const step = (k) => setMode(MODES[(MODES.indexOf(S.mode) + k + MODES.length) % MODES.length]);
  document.querySelectorAll('.dot').forEach((d) => { d.onclick = () => setMode(d.dataset.mode); });
  $('ver').textContent = 'v' + VERSION;
  function renderSeg() {
    document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', P[g.dataset.key] === b.dataset.v)));
    document.querySelectorAll('input.sw').forEach((i) => { i.checked = !!P[i.dataset.key]; });
    const s24 = document.querySelector('input.sw[data-key="sat24"]');
    if (s24) { s24.disabled = P.satAll; s24.closest('.set-row').classList.toggle('off', P.satAll); }
  }
  document.querySelectorAll('input.sw').forEach((i) => i.addEventListener('change', () => {
    P[i.dataset.key] = i.checked; saveP(); renderSeg(); renderMonth(); renderYear();
  }));
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    P[g.dataset.key] = b.dataset.v; saveP(); theme(); renderSeg(); renderMonth(); renderYear();
  }));

  /* gestures: top bar = switch screen (slides with finger), month grid = change month */
  let gridSwiped = false;
  function swipe(host, onMove, onEnd) {
    let g = null;
    host.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; g = { x: e.clientX, y: e.clientY, axis: null, id: e.pointerId }; });
    host.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.axis && (Math.abs(dx) > MOVE || Math.abs(dy) > MOVE)) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'x' && onMove) onMove(dx);
    });
    const end = (e, cancel) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y, gg = g; g = null;
      onEnd(!cancel && gg.axis === 'x' && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : -1) : 0, gg.axis);
    };
    host.addEventListener('pointerup', (e) => end(e, false));
    host.addEventListener('pointercancel', (e) => end(e, true));
  }
  swipe($('topbar'), (dx) => { track.classList.add('drag'); place(dx); }, (k) => { track.classList.remove('drag'); if (k) step(k); else place(0); });
  swipe($('grid-wrap'), null, (k, axis) => { gridSwiped = !!axis; setTimeout(() => { gridSwiped = false; }, 0); if (k) shiftMonth(k); });

  /* keys: Left/Right = month (Month) or year (Year); PageUp/PageDown or Alt+Left/Right = screen */
  addEventListener('keydown', (e) => {
    if (!$('sheet').hidden) { if (e.key === 'Escape') $('sheet').hidden = true; return; }
    if (e.target.tagName === 'INPUT') return;
    if (e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'PageDown' || (e.altKey && k === 'ArrowRight')) { e.preventDefault(); step(1); }
    else if (k === 'PageUp' || (e.altKey && k === 'ArrowLeft')) { e.preventDefault(); step(-1); }
    else if (e.altKey) return;
    else if (k === 'ArrowRight' || k === 'ArrowLeft') {
      const d = k === 'ArrowRight' ? 1 : -1;
      if (S.mode === 'month') { e.preventDefault(); shiftMonth(d); } else if (S.mode === 'year') { e.preventDefault(); yv += d; renderYear(); }
    } else if ((k === 't' || k === 'T') && S.mode === 'month') $('m-today').click();
  });
  addEventListener('storage', (e) => {
    if (e.key === 'sites-hub.theme') theme();
    if (e.key === SKEY) { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } ['sat24', 'satAll', 'dateOnly'].forEach((k) => { P[k] = P[k] === true; }); theme(); renderSeg(); renderMonth(); renderYear(); }
  });

  renderSeg(); renderMonth(); renderYear(); renderHol(); count(); setMode(S.mode);
})();
