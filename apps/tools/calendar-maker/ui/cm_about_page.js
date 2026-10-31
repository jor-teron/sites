/* Calendar Maker CM15 ui: About page = Settings (app theme, reset design), How to, About cards. Adds CM.applyTheme.
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
  $('about-ver').textContent = CM.RELEASE || '';
  paint(); CM.applyTheme();
})();
