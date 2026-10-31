/* Calendar Maker CM13 core: holiday data and date maths (no DOM).
   Merges the Calendar app's built-in list (window.CalHolidays) with the user's every-year and this-year-only holidays.
   Holiday: {m (0-11), d, name, r?: true = Restricted (CM9), t?: 'p' Public | 's' School (CM18), em?/ed?: end month/day, same year (CM11)}.
   CM18 types: typeOf(h) = 'p' | 's' from t, else 'r' when r, else 'g' (Gazetted). Old saves (no t) load unchanged.
   CM19 moving (every year, date changes): {name, r?, t?, len (days, last known), dates: {'YYYY': {start, end?}}, off?: {'YYYY': 1}}.
   off = removed for that year only (Delete > this year only), so it is not asked for again.
   A year with no entry in dates is undated: not drawn, listed or counted (see needDate).
   window.CM.Holidays */
window.CM = window.CM || {};
window.CM.Holidays = (function () {
  'use strict';
  const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];
  const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];  (CM1-CM5) */
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; /* CM6 */
  const WDF = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const p2 = (n) => String(n).padStart(2, '0');
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const dow = (y, m, d) => new Date(y, m, d).getDay();
  const mlen = (m) => new Date(2000, m + 1, 0).getDate(); /* leap year: Feb = 29 */
  /* CM12: ordinal suffix 1st 2nd 3rd 4th 11th 12th 13th 21st */
  const sfx = (n) => (n % 100 >= 11 && n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  /* 'A', 'A & B', 'A, B & C' */
  const join = (a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' & ' + a[a.length - 1];

  /* CM18: holiday types. Restricted keeps r:true (CM9 readers); Public / School carry t, never r. */
  const TYPES = ['g', 'r', 'p', 's'];
  const TYPE_NAMES = { g: 'Gazetted', r: 'Restricted', p: 'Public', s: 'School' };
  const RANK = { g: 3, r: 2, p: 1, s: 0 }; /* priority below Sunday > Saturday holiday */
  const typeOf = (h) => (h && (h.t === 'p' || h.t === 's') ? h.t : (h && h.r ? 'r' : 'g'));
  const setType = (h, t) => { delete h.t; delete h.r; if (t === 'r') h.r = true; else if (t === 'p' || t === 's') h.t = t; return h; };
  /* CM11: end as m*100+d (a range only when the end is after the start) */
  const endOf = (h) => (h.em != null && h.ed != null && (h.em * 100 + h.ed) > (h.m * 100 + h.d))
    ? h.em * 100 + h.ed : h.m * 100 + h.d;
  /* sorted, de-duplicated holiday list for the strip: [{m,d,name}] */
  /* CM2-CM10 (single days only):
  // function stripRows(hols) {
  //   const map = {};
  //   hols.forEach((h) => { const k = h.m * 100 + h.d; map[k] = map[k] ? map[k] + ' / ' + h.name : h.name; });
  //   return Object.keys(map).map(Number).sort((a, b) => a - b).map((k) => ({ m: Math.floor(k / 100), d: k % 100, name: map[k] }));
  // }
  */
  /* CM11: a range (em/ed = end month/day, same year) is ONE row; same start+end names joined with ' / ' */
  function stripRows(hols) {
    const map = {};
    hols.forEach((h) => {
      const k = (h.m * 100 + h.d) * 10000 + endOf(h);
      map[k] = map[k] ? map[k] + ' / ' + h.name : h.name;
    });
    return Object.keys(map).map(Number).sort((a, b) => a - b).map((k) => {
      const s = Math.floor(k / 10000), e = k % 10000, r = { m: Math.floor(s / 100), d: s % 100, name: map[k] };
      if (e !== s) { r.em = Math.floor(e / 100); r.ed = e % 100; }
      return r;
    });
  }
  /* CM9: strip sections { gaz, res }, each date-sorted */
  function stripSections(hols) {
    /* return { gaz: stripRows((hols || []).filter((h) => !h.r)), res: stripRows((hols || []).filter((h) => h.r)) };  (CM9-CM17) */
    const of = (t) => stripRows((hols || []).filter((h) => typeOf(h) === t)); /* CM18: + pub, sch */
    return { gaz: of('g'), res: of('r'), pub: of('p'), sch: of('s') };
  }
  /* CM11: '05 Jan', '20–23 Oct', '30 Sep–02 Oct' */
  function dateText(r) {
    if (r.em == null) return p2(r.d) + ' ' + MS[r.m];
    return r.em === r.m ? p2(r.d) + '–' + p2(r.ed) + ' ' + MS[r.m]
      : p2(r.d) + ' ' + MS[r.m] + '–' + p2(r.ed) + ' ' + MS[r.em];
  }
  /* CM11: every [m, d] covered by a holiday (range or single) in year y */
  function daysOf(h, y) {
    const out = [], e = endOf(h);
    for (let dt = new Date(y, h.m, h.d); dt.getFullYear() === y && dt.getMonth() * 100 + dt.getDate() <= e;
      dt.setDate(dt.getDate() + 1)) out.push([dt.getMonth(), dt.getDate()]);
    return out;
  }

  /* built-ins (Calendar app) = Gazetted, as {m, d, name} */
  const builtIns = (y) => (window.CalHolidays
    ? window.CalHolidays.list(y).map((h) => ({ m: h.m, d: h.d, name: h.name })) : []);
  /* every-year list: the saved one, or the built-ins when never edited (null) */
  const fixedOf = (H) => H.fixed || builtIns(2000);

  /* merged holidays for year y from a validated H = {fixed: null | [...], dated: [...]} */
  function forYear(H, y) {
    /* const out = fixed()...map((h) => ({ m: h.m, d: h.d, name: h.name }));  (CM3-CM8) */
    /* const out = fixed().filter(...).map((h) => ({ m: h.m, d: h.d, name: h.name, r: h.r === true }));
       H.dated.forEach(... single day ...);  (CM9-CM10) */
    /* CM11: ranges carry em/ed; 29 Feb start skipped in non-leap years, a 29 Feb end becomes 28 Feb */
    const out = fixedOf(H).filter((h) => h.d <= dim(y, h.m)).map((h) => {
      const o = { m: h.m, d: h.d, name: h.name, r: h.r === true };
      if (h.t === 'p' || h.t === 's') { o.t = h.t; o.r = false; } /* CM18 */
      if (h.em != null) {
        const ed = Math.min(h.ed, dim(y, h.em));
        if (h.em * 100 + ed > h.m * 100 + h.d) { o.em = h.em; o.ed = ed; }
      }
      return o;
    });
    H.dated.forEach((h) => {
      if (+h.date.slice(0, 4) !== y) return;
      const o = { m: +h.date.slice(5, 7) - 1, d: +h.date.slice(8, 10), name: h.name, r: h.r === true };
      if (h.t === 'p' || h.t === 's') { o.t = h.t; o.r = false; } /* CM18 */
      if (h.end) { o.em = +h.end.slice(5, 7) - 1; o.ed = +h.end.slice(8, 10); }
      out.push(o);
    });
    /* CM19: moving holidays only in years that have a date */
    (H.moving || []).forEach((h) => {
      const v = h.dates && h.dates[y]; if (!v || !v.start) return;
      const o = { m: +v.start.slice(5, 7) - 1, d: +v.start.slice(8, 10), name: h.name, r: h.r === true };
      if (h.t === 'p' || h.t === 's') { o.t = h.t; o.r = false; }
      if (v.end && v.end > v.start) { o.em = +v.end.slice(5, 7) - 1; o.ed = +v.end.slice(8, 10); }
      out.push(o);
    });
    return out;
  }
  /* CM19: moving holidays with no date for year y -> [{h, i}] */
  const needDate = (H, y) => (H.moving || []).map((h, i) => ({ h, i }))
    .filter(({ h }) => !(h.dates && h.dates[y]) && !(h.off && h.off[y])); /* off[y] = removed for that year only */
  /* CM19: days between two YYYY-MM-DD (inclusive) */
  const spanDays = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5) + 1;
  /* CM19: end for a start using len days; clipped to 31 Dec of the same year; '' for one day */
  function autoEnd(start, len) {
    if (!start || !(len > 1)) return '';
    const y = +start.slice(0, 4), dt = new Date(y, +start.slice(5, 7) - 1, +start.slice(8, 10) + len - 1);
    const e = dt.getFullYear() !== y ? y + '-12-31' : y + '-' + p2(dt.getMonth() + 1) + '-' + p2(dt.getDate());
    return e > start ? e : '';
  }
  /* CM19: set (or clear with start '') the date of moving holiday h in year y; keeps len as the last known length */
  function setMoving(h, y, start, end, off) {
    h.dates = h.dates || {};
    if (h.off) { delete h.off[y]; if (!Object.keys(h.off).length) delete h.off; }
    if (!start) { delete h.dates[y]; if (off) { h.off = h.off || {}; h.off[y] = 1; } return h; }
    const v = { start }; if (end && end > start && end.slice(0, 4) === start.slice(0, 4)) v.end = end;
    h.dates[y] = v; h.len = v.end ? spanDays(start, v.end) : 1; return h;
  }
  /* CM11: every-year Day/Month values -> {m, d, em?, ed?} or null when invalid.
     Day is clamped to the month (29 Feb allowed). */
  function readFx(sd, sm, ed, em) {
    if (sd === '' || sm === '' || sd == null || sm == null) return null;
    const m = +sm, d = Math.min(+sd, mlen(m)), o = { m, d };
    const hasE = ed !== '' && ed != null, hasM = em !== '' && em != null;
    if (!hasE && !hasM) return o;
    const eM = hasM ? +em : m; if (!hasE) return o; /* month alone, no day: still one day */
    const eD = Math.min(+ed, mlen(eM));
    if (eM * 100 + eD <= m * 100 + d) return null;
    o.em = eM; o.ed = eD; return o;
  }

  return {
    MN, MS, WD, WDF, p2, dim, dow, mlen, sfx, join, endOf, stripRows, stripSections, dateText, daysOf,
    builtIns, fixedOf, forYear, readFx, TYPES, TYPE_NAMES, RANK, typeOf, setType, /* CM18 */
    needDate, spanDays, autoEnd, setMoving /* CM19 */
  };
})();
