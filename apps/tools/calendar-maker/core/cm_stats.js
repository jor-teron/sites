/* Calendar Maker CM14 core: Year Overview numbers (no DOM). window.CM.Stats
   Day rules: off = Sunday, Saturday holiday (sat '24' = 2nd & 4th, 'all'), or any day of a Gazetted holiday.
   Restricted days are NOT off (never deducted), only counted and named. Multi-day holidays count every day.
   Stats.year(y, hols, sat) -> { days, summary, streaks, stretches } */
window.CM = window.CM || {};
window.CM.Stats = (function () {
  'use strict';
  const Hd = window.CM.Holidays;
  const SAT_RULE = { none: 'None', '24': '2nd & 4th Saturdays', all: 'All Saturdays' };
  const isSatOff = (sat, d) => sat === 'all' || (sat === '24' && ((d >= 8 && d <= 14) || (d >= 22 && d <= 28)));

  /* one entry per day of year y: {m, d, wd, sun, satOff, gaz: [names], res: [names], off} */
  function classify(y, hols, sat) {
    const map = {};
    (hols || []).forEach((h) => Hd.daysOf(h, y).forEach(([m, d]) => {
      const k = m * 100 + d, e = map[k] || (map[k] = { gaz: [], res: [] });
      const list = h.r ? e.res : e.gaz;
      if (list.indexOf(h.name) < 0) list.push(h.name);
    }));
    const out = [];
    for (let dt = new Date(y, 0, 1); dt.getFullYear() === y; dt.setDate(dt.getDate() + 1)) {
      const m = dt.getMonth(), d = dt.getDate(), wd = dt.getDay(), e = map[m * 100 + d] || { gaz: [], res: [] };
      const sun = wd === 0, satOff = wd === 6 && isSatOff(sat, d);
      out.push({ m, d, wd, sun, satOff, gaz: e.gaz, res: e.gaz.length ? [] : e.res,
        off: sun || satOff || e.gaz.length > 0 });
    }
    return out;
  }
  function summary(days, sat) {
    const n = (f) => days.filter(f).length;
    const sundays = n((x) => x.sun), sats = n((x) => x.satOff), gaz = n((x) => x.gaz.length > 0);
    const gazWk = n((x) => x.gaz.length > 0 && (x.sun || x.satOff)), actual = n((x) => x.off);
    return { total: days.length, sundays, sats, satRule: SAT_RULE[sat] || 'None', gaz, gazWk,
      totalHol: sundays + sats + gaz, actual, working: days.length - actual, restricted: n((x) => x.res.length > 0) };
  }
  /* 'Sat 17 Oct – Thu 22 Oct' */
  const dayText = (x) => Hd.WD[x.wd] + ' ' + Hd.p2(x.d) + ' ' + Hd.MS[x.m];
  const range = (days, a, b) => dayText(days[a]) + (a === b ? '' : ' – ' + dayText(days[b]));
  /* 'Durga Puja + Diwali + Sunday + 2 Saturdays (Restricted: Bhai Dooj)'; weekends named only when not Gazetted */
  function names(days, a, b) {
    const g = [], r = []; let su = 0, sa = 0;
    for (let i = a; i <= b; i++) {
      const x = days[i];
      x.gaz.forEach((s) => { if (g.indexOf(s) < 0) g.push(s); });
      x.res.forEach((s) => { if (r.indexOf(s) < 0) r.push(s); });
      if (!x.gaz.length) { if (x.sun) su++; else if (x.satOff) sa++; }
    }
    const w = (k, s) => (k ? [k === 1 ? s : k + ' ' + s + 's'] : []);
    const parts = g.concat(w(su, 'Sunday'), w(sa, 'Saturday'));
    return parts.join(' + ') + (r.length ? ' (Restricted: ' + r.join(', ') + ')' : '');
  }
  /* blocks of consecutive off days [{a, b}] */
  function blocks(days) {
    const out = []; let s = -1;
    days.forEach((x, i) => {
      if (x.off && s < 0) s = i;
      if (s >= 0 && (!x.off || i === days.length - 1)) { out.push({ a: s, b: x.off ? i : i - 1 }); s = -1; }
    });
    return out;
  }
  const byLen = (p, q) => (q.len - p.len) || (p.a - q.a);
  /* all runs of >= min (3) off days, longest first, ties by date */
  function streaks(days, min) {
    return blocks(days).filter((k) => k.b - k.a + 1 >= (min || 3))
      .map((k) => ({ a: k.a, b: k.b, len: k.b - k.a + 1, from: range(days, k.a, k.b), names: names(days, k.a, k.b) }))
      .sort(byLen);
  }
  /* Jor's stretches: span from an off-block start to a later off-block end (>= 2 blocks, so >= 1 working day),
     off >= working (restricted days count as working). Greedy: longest first, skip any overlapping a chosen one. */
  function stretches(days) {
    const B = blocks(days), pre = [0];
    days.forEach((x, i) => { pre[i + 1] = pre[i] + (x.off ? 1 : 0); });
    const cand = [];
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i].a, b = B[j].b, len = b - a + 1, off = pre[b + 1] - pre[a];
      if (off >= len - off) cand.push({ a, b, len, off, work: len - off });
    }
    cand.sort(byLen);
    const picked = [];
    cand.forEach((s) => { if (!picked.some((p) => s.a <= p.b && p.a <= s.b)) picked.push(s); });
    return picked.map((s) => Object.assign(s, { from: range(days, s.a, s.b), names: names(days, s.a, s.b) }));
  }
  function year(y, hols, sat) {
    const days = classify(y, hols, sat);
    return { year: y, days, summary: summary(days, sat), streaks: streaks(days, 3), stretches: stretches(days) };
  }
  return { SAT_RULE, classify, summary, blocks, streaks, stretches, names, range, year };
})();
