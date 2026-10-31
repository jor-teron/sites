/* Calendar Maker CM15 ui (CM17: holiday CSV export / import): About page = Settings (app theme, reset design), How to, About cards. Adds CM.applyTheme.
   Theme (`theme` in calendar-maker-settings): 'auto' (default) follows the Calendar app's theme exactly as CM1-CM16-F5 did
   (its Dark default, or System = Hub pref 'sites-hub.theme' else prefers-color-scheme); 'light' / 'dark' are fixed.
   Only the app screens change (html.dark CSS variables); the canvas renders, Print and PDF never read it. */
(function () {
  'use strict';
  const CM = window.CM;
  const $ = (id) => document.getElementById(id);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (_) { return {}; } };
  let mq = null; try { mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)'); } catch (_) { /* */ }
  /* same rule as the inline script in calendar-maker.html <head> */
  CM.isDark = (mode) => {
    if (mode === 'light' || mode === 'dark') return mode === 'dark';
    const cal = read('calendar-settings-v1').theme || 'dark';
    if (cal === 'light') return false;
    if (cal !== 'system') return true;
    let hub = null; try { hub = localStorage.getItem('sites-hub.theme'); } catch (_) { /* blocked */ }
    return hub === 'dark' || (hub !== 'light' && !!(mq && mq.matches));
  };
  CM.applyTheme = () => {
    const html = document.documentElement, mode = CM.P ? CM.P.theme : 'auto';
    html.classList.toggle('dark', CM.isDark(mode));
    html.dataset.cmTheme = mode || 'auto';
  };
  if (!CM.P || !$('page-about') || !$('theme-seg')) return; /* skipped without the page */
  const P = CM.P, S = CM.Settings;
  const seg = $('theme-seg');
  const paint = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.theme));
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !b.dataset.v) return;
    P.theme = ['light', 'dark'].indexOf(b.dataset.v) >= 0 ? b.dataset.v : 'auto';
    S.saveSettings(P); paint(); CM.applyTheme();
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', CM.applyTheme);
  window.addEventListener('storage', (e) => {
    if (e.key === 'sites-hub.theme' || e.key === S.KEYS.calendar || e.key === S.KEYS.settings) CM.applyTheme();
  });
  /* Reset design settings: every calendar-maker-settings key back to its default, keeping year and theme.
     The holidays key and the saved background picture are never touched. Reloads to refresh every control. */
  $('reset-design').onclick = async () => {
    if (!window.UiDialog || !(await window.UiDialog.confirm('Reset design settings?',
      'Colours, layout, legend, background and Holiday List options go back to their defaults. Your holidays are kept.', 'Reset', true))) return;
    const keep = { year: P.year, theme: P.theme };
    const D = Object.assign(S.defaults(read(S.KEYS.calendar)), fallbacks(), keep);
    Object.keys(P).forEach((k) => { delete P[k]; }); Object.assign(P, D);
    S.saveSettings(P);
    try { location.reload(); } catch (_) { /* harness */ }
  };
  function fallbacks() { const D = S.defaults(read(S.KEYS.calendar)), o = {}; S.RULES.forEach(([k, , fb]) => { if (!(k in D)) o[k] = fb(D); }); return o; }
  /* CM17: holiday list CSV export / import (format and checks in core/cm_csv.js). Nothing is saved until the user picks
     Add to existing or Replace all; Replace asks once more. */
  const Csv = CM.Csv;
  const holH = () => (CM.Hol && CM.Hol._H) || S.loadHolidays();
  CM.csvExport = () => {
    const H = holH(), txt = Csv.serialize(CM.Holidays.fixedOf(H), H.dated), name = Csv.fname(P.year);
    try {
      const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); if (a.remove) a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) { /* harness / very old browser */ }
    return { name, txt };
  };
  const refresh = () => {
    if (CM.Hol && CM.Hol.show) CM.Hol.show(P.year);
    if (CM.render) CM.render();
    if (CM.listRender) CM.listRender();
    if (CM.ovwRender) CM.ovwRender();
  };
  /* text -> preview dialog -> save; resolves 'add' | 'replace' | null */
  CM.csvImport = async (text) => {
    const D = window.UiDialog, R = Csv.parse(text), n = R.fixed.length + R.dated.length;
    const sk = R.skipped.slice(0, 12).map((x) => 'line ' + x.line + ': ' + x.reason).join('; ') +
      (R.skipped.length > 12 ? '; and ' + (R.skipped.length - 12) + ' more' : '');
    const head = n + ' holiday' + (n === 1 ? '' : 's') + ' found, ' + R.skipped.length + ' row' + (R.skipped.length === 1 ? '' : 's') + ' skipped.';
    if (!n) { await D.info('Import holidays', [['Result', head], ['Skipped', sk || 'none']]); return null; }
    const pick = await D.choose('Import holidays', head + (sk ? ' Skipped: ' + sk + '.' : ''),
      [{ value: 'replace', label: 'Replace all', kind: 'danger' }, { value: 'add', label: 'Add to existing', kind: 'primary' }]);
    const v = pick && pick.value;
    if (v !== 'add' && v !== 'replace') return null;
    const H = holH();
    let m;
    if (v === 'replace') {
      if (!(await D.confirm('Replace all holidays?', 'Every saved holiday (every-year and this-year-only) is replaced by the ' + n + ' from the file.', 'Replace all', true))) return null;
      m = Csv.merge([], [], R);
    } else m = Csv.merge(CM.Holidays.fixedOf(H), H.dated, R);
    H.fixed = m.fixed; H.dated = m.dated;
    if (CM.Hol && CM.Hol._save) CM.Hol._save(); else S.saveHolidays(H);
    refresh();
    await D.info('Holidays imported', [['Added', String(m.added)], ['Duplicates skipped', String(m.dup)], ['Rows skipped', String(R.skipped.length)]]);
    return v;
  };
  if ($('csv-export')) $('csv-export').onclick = () => { CM.csvExport(); };
  if ($('csv-import') && $('csv-file')) {
    $('csv-import').onclick = () => { $('csv-file').value = ''; $('csv-file').click(); };
    $('csv-file').onchange = () => {
      const f = $('csv-file').files && $('csv-file').files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { CM.csvImport(String(rd.result || '')); };
      rd.onerror = () => window.UiDialog.info('Could not read file', [['File', f.name]]);
      rd.readAsText(f, 'utf-8');
    };
  }
  $('about-ver').textContent = CM.RELEASE || '';
  paint(); CM.applyTheme();
})();
