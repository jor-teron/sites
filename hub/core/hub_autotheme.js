/*
 * Auto theme (hub/core/hub_autotheme.js), H64. Settings › Look › Auto: Light by day, Dark by night.
 * Fixed, editable times (no location): Sunrise '' = 06:00, Sunset '' = 18:00, and an Offset from -2 h
 * to +2 h that moves both switch points (+1 h = Dark at 19:00, Light at 07:00). Night = [sunset + offset,
 * sunrise + offset), may run over midnight (hub/core/hub_daynight.js). Sunrise === Sunset = always Light.
 *
 * localStorage keys (Settings › Look; Shared group of Send profile, hub_profile.js, like theme):
 *   sites-hub.themeAuto     '1' = Auto ('' = off: theme / glass as picked, Light by default)
 *   sites-hub.themeSunrise  'HH:MM', '' = 06:00        sites-hub.themeSunset 'HH:MM', '' = 18:00
 *   sites-hub.themeOffset   minutes -120..120 (step 15), '' = 0
 * While Auto is on, this file keeps writing the effective value into sites-hub.theme ('light' / 'dark'),
 * so hub_prefs.js, shared/theme/hub_theme.js (System apps) and any app reading sites-hub.theme follow it
 * through their normal 'storage' listeners. Auto is never Glass (sites-hub.glass is cleared / ignored).
 * Checks: every HubPrefs.apply() (Settings, storage events, load), every whole minute and on
 * visibilitychange / focus (HubDayNight.watch; tests fake the clock with HubDayNight.now).
 * A switch made by the clock fades the colours for ~0.8 s (html.hub-theme-fade; none with Animations Off).
 * Loaded before hub_prefs.js in hub.html (after hub_daynight.js), so the first paint already has the right theme;
 * also loaded by Settings (apps/system/settings) for its status line when it runs on its own.
 * API: window.HubAutoTheme { DEF, on(), times(), isDark(now?), effective(now?), next(now?), sync(), state() }
 *   sync(): Auto on → write sites-hub.theme when it differs, returns true when it changed something.
 */
(function () {
  'use strict';
  if (window.HubAutoTheme) return;
  const P = 'sites-hub.';
  const DN = window.HubDayNight;
  const DEF = { sunrise: '06:00', sunset: '18:00', offset: 0 };
  const get = (k) => { try { return localStorage.getItem(P + k) || ''; } catch (_) { return ''; } };
  const put = (k, v) => { try { if (v) localStorage.setItem(P + k, v); else localStorage.removeItem(P + k); } catch (_) { /* blocked */ } };
  const on = () => get('themeAuto') === '1';
  const offset = () => { const n = Math.round(+get('themeOffset')); return isFinite(n) ? Math.max(-120, Math.min(120, n)) : 0; };
  const shift = (t, d, off) => DN.fmt(((DN.parse(t, d) + off) % 1440 + 1440) % 1440);
  /* the real switch points after the offset: dark from 'dark' to 'light' */
  function times() {
    const sr = get('themeSunrise') || DEF.sunrise, ss = get('themeSunset') || DEF.sunset, off = offset();
    return { sunrise: sr, sunset: ss, offset: off, dark: shift(ss, DEF.sunset, off), light: shift(sr, DEF.sunrise, off) };
  }
  const now = (n) => (n instanceof Date ? n : DN.now());
  function isDark(n) { const t = times(); return DN.inRange(t.dark, t.light, now(n)); }
  const effective = (n) => (isDark(n) ? 'dark' : 'light');
  function next(n) { const t = times(); return DN.nextChange(t.dark, t.light, now(n)); }

  let fadeT = 0;
  function sync() {
    if (!on()) return false;
    let changed = false;
    const want = effective();
    if (get('theme') !== want) {
      // a clock switch on a page that already shows the old theme: fade (not on page load)
      const root = document.documentElement;
      if (document.readyState === 'complete' && !root.classList.contains('hub-motion-off') && !root.classList.contains('motion-off')) {
        root.classList.add('hub-theme-fade');
        clearTimeout(fadeT);
        fadeT = setTimeout(() => root.classList.remove('hub-theme-fade'), 900);
      }
      put('theme', want); changed = true;
    }
    if (get('glass')) { put('glass', ''); changed = true; }   // Auto and Glass do not mix
    return changed;
  }
  function state() {
    const t = times();
    return { on: on(), dark: isDark(), effective: effective(), next: next(), sunrise: t.sunrise, sunset: t.sunset,
      offset: t.offset, darkAt: t.dark, lightAt: t.light };
  }

  const css = document.createElement('style');
  css.id = 'hub-autotheme-css';
  css.textContent = 'html.hub-theme-fade, html.hub-theme-fade *, html.hub-theme-fade *::before, html.hub-theme-fade *::after{' +
    'transition:background-color .8s ease,color .8s ease,border-color .8s ease,fill .8s ease !important}';
  (document.head || document.documentElement).appendChild(css);

  window.HubAutoTheme = { DEF, on, times, isDark, effective, next, sync, state };
  // The Hub: re-check every minute / when visible again; HubPrefs.apply() repaints (it calls sync() too).
  // Settings on its own (no Hub parent): keep sites-hub.theme right while it is open and repaint itself.
  DN.watch(() => {
    if (!on()) return;
    if (window.HubPrefs) { if (sync()) window.HubPrefs.apply(); return; }
    let hubParent = null;
    try { hubParent = window.parent !== window && window.parent.HubPrefs ? window.parent : null; } catch (_) { /* cross-origin */ }
    if (!hubParent && sync() && window.HubTheme) window.HubTheme.apply();
  });
})();
