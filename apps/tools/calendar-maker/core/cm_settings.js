/* Calendar Maker CM13 core: every saved key, with defaults and validation, in one place. window.CM.Settings
   'calendar-maker-settings' (CM1+): { year, colour: preset key | 'custom', sundays, sat: 'none'|'24'|'all',
     week: 'sun'|'mon' (default from Calendar's 'calendar-settings-v1'), bg: 'none'|'soft'|'pic', soft, faint,
     strip (CM2), layout (CM4), fold (CM5), custom, font (CM6), rcol (CM9), lhead (CM10), legend, mfill (CM12-F3), lgsz (CM16-F1), wfill, wmatch (CM16-F5),
     llay, lsub, ldeco, labcd, lmerge, lhc (CM12), lband, lbandc (CM16-F2), lshowr (CM16-F3), theme: 'auto'|'light'|'dark' (CM15) }
   'calendar-maker-holidays' (CM3): { fixed: null (= Calendar's built-in list) | [{m, d, name, r?, em?, ed?}],
     dated: [{date: 'YYYY-MM-DD', end?, name, r?}] }
   'calendar-maker-bg' (CM2): picture background as a JPEG data URL (<= 1600 px).
   ?year=YYYY (from Calendar's "Make printable") wins over the saved year; the page opens on the current year. */
window.CM = window.CM || {};
window.CM.Settings = (function () {
  'use strict';
  const T = window.CM.Theme, C = window.CM.Canvas, Hd = window.CM.Holidays;
  const KEYS = { settings: 'calendar-maker-settings', holidays: 'calendar-maker-holidays',
    bg: 'calendar-maker-bg', calendar: 'calendar-settings-v1' };
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (_) { return {}; } };
  const isBool = (v) => typeof v === 'boolean';
  const isStr = (v) => typeof v === 'string';

  /* defaults; sat / week follow the Calendar app's own settings */
  function defaults(cal) {
    return { year: new Date().getFullYear(), colour: 'green', sundays: true,
      sat: cal.satAll ? 'all' : (cal.sat24 ? '24' : 'none'), week: cal.week === 'mon' ? 'mon' : 'sun',
      bg: 'none', soft: '#fef9e7', faint: 25, strip: false, layout: 'p3', fold: true,
      custom: '#15803d', /* CM12-F4: was '#92d36e' (CM6); saved custom values are kept */
      font: '#000000', rcol: '#cfcfcf', lhead: '', legend: true, mfill: '#d9d9d9', lgsz: 0.58, wfill: '#d9d9d9', wmatch: false }; /* CM16-F5 wfill, wmatch */
    /* CM16-F1: legend size in em of the date font (0.58 = the CM12-F3 look) */
    /* CM12-F3: legend + month row fill */ /* CM10: Holiday List header */ /* CM9: restricted holiday colour */
    /* CM6: custom holiday colour + font colour */ /* CM5: fold on (existing users get it too) */
    /* CM4: bg default None = white */
  }
  /* validation, in this order: [key, ok(value), fallback (D = defaults)]. Keys missing from defaults
     (CM12 list options) are added in this order. */
  const RULES = [
    ['layout', (v) => !!C.LAYOUTS[v], () => 'p3'],
    ['custom', (v) => T.HEX.test(v), (D) => D.custom], /* CM6 */
    ['font', (v) => T.HEX.test(v), (D) => D.font],
    ['rcol', (v) => T.HEX.test(v), (D) => D.rcol], /* CM9 */
    ['lhead', isStr, () => ''], /* CM10 */
    ['legend', isBool, () => true], /* CM12-F3 */
    ['mfill', (v) => T.HEX.test(v), (D) => D.mfill],
    ['wfill', (v) => T.HEX.test(v), (D) => D.wfill], /* CM16-F5 */
    ['wmatch', isBool, () => false], /* CM16-F5 */
    ['lgsz', (v) => typeof v === 'number' && isFinite(v), (D) => D.lgsz], /* CM16-F1: then clamped below */
    /* CM12: holiday list layout (Classic default) + Classic options */
    ['llay', (v) => v === 'simple', () => 'classic'],
    ['lsub', isStr, () => 'LIST OF HOLIDAYS'],
    ['ldeco', isBool, () => true], ['labcd', isBool, () => true], ['lmerge', isBool, () => true],
    ['lhc', (v) => T.HEX.test(v), () => '#2e75b6'],
    ['lband', isBool, () => true], ['lbandc', (v) => T.HEX.test(v), () => '#ddebf7'], /* CM16-F2: striped rows, light blue */
    ['lshowr', isBool, () => true], /* CM16-F3: restricted section on the Holiday List */
    ['theme', (v) => v === 'light' || v === 'dark', () => 'auto'], /* CM15: app UI theme only */
    ['colour', (v) => v === 'custom' || !!T.COLOURS[v], () => 'green'],
    ['bg', (v) => ['none', 'soft', 'pic'].indexOf(v) >= 0, () => 'none'] /* CM4: unknown / old value -> white */
  ];
  function loadSettings(search) {
    const P = read(KEYS.settings), D = defaults(read(KEYS.calendar));
    Object.keys(D).forEach((k) => { if (P[k] === undefined || P[k] === null) P[k] = D[k]; });
    RULES.forEach(([k, ok, fb]) => { if (!ok(P[k])) P[k] = fb(D); });
    P.lgsz = clampLg(P.lgsz); /* CM16-F1 */
    P.year = D.year; /* opens on the current year unless Calendar passes ?year= */
    const q = /[?&]year=(\d{4})/.exec(search || '');
    if (q) P.year = +q[1];
    return P;
  }
  /* CM16-F1: legend size 0.5-2 em, 2 decimals; anything not a number -> 0.58 */
  function clampLg(v) {
    v = typeof v === 'string' && v.trim() !== '' ? +v : v;
    if (typeof v !== 'number' || !isFinite(v)) return 0.58;
    return Math.round(Math.min(2, Math.max(0.5, v)) * 100) / 100;
  }
  const saveSettings = (P) => {
    try { localStorage.setItem(KEYS.settings, JSON.stringify(P)); } catch (_) { /* full / private mode */ }
  };

  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  function loadHolidays() {
    let H = read(KEYS.holidays);
    if (!H || typeof H !== 'object') H = {};
    if (!Array.isArray(H.dated)) H.dated = [];
    /* null = never edited -> built-in list; an array (even empty) is kept as is */
    if (!Array.isArray(H.fixed)) H.fixed = null;
    /* CM4: drop broken entries from a damaged key instead of crashing */
    const okName = (h) => h && typeof h.name === 'string';
    H.dated = H.dated.filter((h) => okName(h) && DATE.test(h.date));
    if (H.fixed) H.fixed = H.fixed.filter((h) => okName(h) && h.m >= 0 && h.m <= 11 && h.d >= 1 && h.d <= 31);
    /* CM11: drop a broken end (keeps the holiday as one day) */
    H.dated.forEach((h) => {
      const ok = typeof h.end === 'string' && DATE.test(h.end) && h.end.slice(0, 4) === h.date.slice(0, 4) && h.end > h.date;
      if (h.end != null && !ok) delete h.end;
    });
    if (H.fixed) H.fixed.forEach((h) => {
      if (h.em == null && h.ed == null) return;
      const ok = h.em >= 0 && h.em <= 11 && h.ed >= 1 && h.ed <= Hd.mlen(h.em) && h.em * 100 + h.ed > h.m * 100 + h.d;
      if (!ok) { delete h.em; delete h.ed; }
    });
    return H;
  }
  /* false when the browser refuses to store */
  const saveHolidays = (H) => {
    try { localStorage.setItem(KEYS.holidays, JSON.stringify(H)); return true; } catch (_) { return false; }
  };

  const loadBg = () => { try { return localStorage.getItem(KEYS.bg); } catch (_) { return null; } };
  const saveBg = (url) => { try { localStorage.setItem(KEYS.bg, url); return true; } catch (_) { return false; } };
  const clearBg = () => { try { localStorage.removeItem(KEYS.bg); } catch (_) { /* */ } };

  return { KEYS, defaults, RULES, loadSettings, saveSettings, clampLg, /* CM16-F1 */ loadHolidays, saveHolidays, loadBg, saveBg, clearBg };
})();
