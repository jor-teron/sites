/* Calendar C6: holidays from Calendar Maker's shared list ('calendar-maker-holidays'), read with Calendar Maker's own code
   (../calendar-maker/core/cm_theme.js, cm_holidays.js, cm_settings.js; no copy here). Never edited -> built-in CalHolidays list.
   window.CalShared = { get(iso) -> [{name, t}] | null (t 'g'|'r'|'p'|'s'), list(y) -> [{date, m, d, end?, name, t}],
   colour(t) -> hex from CM's rcol / pcol / scol (else CM defaults), reset() (drop cache on storage change) } */
window.CalShared = (function () {
  'use strict';
  const CM = window.CM || {}, Hd = CM.Holidays, St = CM.Settings, T = CM.Theme;
  const p2 = (n) => String(n).padStart(2, '0');
  let cache = {}, H = null;
  const hol = () => { if (!H) H = St ? St.loadHolidays() : { fixed: null, dated: [], moving: [] }; return H; };
  function year(y) {
    if (cache[y]) return cache[y];
    const map = {}, rows = [];
    (Hd ? Hd.forYear(hol(), y) : []).forEach((h) => {
      const t = Hd.typeOf(h);
      rows.push({ date: y + '-' + p2(h.m + 1) + '-' + p2(h.d), m: h.m, d: h.d, name: h.name, t,
        end: h.em != null ? y + '-' + p2(h.em + 1) + '-' + p2(h.ed) : '' });
      Hd.daysOf(h, y).forEach(([m, d]) => { const k = y + '-' + p2(m + 1) + '-' + p2(d); (map[k] = map[k] || []).push({ name: h.name, t }); });
    });
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return (cache[y] = { map, rows });
  }
  function colour(t) {
    let s = {}; try { s = JSON.parse(localStorage.getItem('calendar-maker-settings') || '{}') || {}; } catch (_) { /* */ }
    if (!T) return { r: '#cfcfcf', p: '#d9d2e9', s: '#fff2cc' }[t];
    return t === 'r' ? T.restrictedColour(s.rcol) : t === 'p' ? T.publicColour(s.pcol) : T.schoolColour(s.scol);
  }
  return {
    get: (s) => year(+s.slice(0, 4)).map[s] || null,
    list: (y) => year(y).rows,
    colour,
    reset: () => { cache = {}; H = null; }
  };
})();
