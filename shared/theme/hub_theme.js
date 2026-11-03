/*
 * Hub theme for apps (shared/theme/hub_theme.js), H22.
 * System apps follow the Hub's Dark / Light theme and accent (Settings > Look) automatically.
 * There is no per-app picker. An app with its own built-in theme (only the Terminal) can pass
 * data-own-key="<localStorage key>" holding 'dark' | 'light' | '' (= System, follow the Hub).
 *
 * localStorage (same origin as the Hub):
 *   (legacy) sites-hub.theme 'light' | '' (dark)
 *   sites-hub.theme    H60a: 'dark' | 'light' | '' (light)   the Hub theme (hub/core/hub_prefs.js)
 *   sites-hub.accent   '#rrggbb' | ''         → --accent
 * Paints <html>: class 'light', data-theme="dark|light", --accent, color-scheme.
 * Live: 'storage' event, a {type:'hub-prefs'} postMessage from the Hub, window focus.
 * Use: <script src="../../../shared/theme/hub_theme.js?v=…"></script> in <head> (auto-init, no flash).
 * H103: system apps (path /apps/system/) also get Glass: when the Hub has Glass on (sites-hub.glass '1',
 *   theme not 'dark', themeAuto not '1', or theme 'glass') → html.hub-glass (+ html.hub-glass-solid for
 *   sites-hub.glassSolid '1'), on top of html.light, and shared/theme/hub_glass_apps.css is added once.
 *   Other app categories are unchanged (they still see Light).
 * H104: system apps also get XP: when the Hub has XP on (sites-hub.xp '1', theme not 'dark', themeAuto not
 *   '1', or theme 'xp') → html.hub-xp on top of html.light, and shared/theme/hub_xp_apps.css is added once.
 *   XP wins over a stale Glass pick (no html.hub-glass with XP). Other app categories still see Light.
 * API: HubTheme.apply(), .hub(), .effective(), .own() / .setOwn(pref) (own-key apps only), .onChange(fn).
 */
(function () {
  'use strict';
  if (window.HubTheme) return;
  const P = 'sites-hub.';
  const root = document.documentElement;
  const IS_FILE = location.protocol === 'file:';
  const me = document.currentScript;
  const ownKey = (me && me.dataset && me.dataset.ownKey) || '';
  const fns = [];
  const read = (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };

  // function hub() { return read(P + 'theme') === 'light' ? 'light' : 'dark'; }   // legacy: unset = Dark
  function hub() { return read(P + 'theme') === 'dark' ? 'dark' : 'light'; }   // H60a: the Hub defaults to Light
  // H61: Glass (sites-hub.glass '1' with theme 'light', or a theme of 'glass') is a light theme: apps get 'light'
  function own() { const v = ownKey ? read(ownKey) : ''; return v === 'dark' || v === 'light' ? v : 'system'; }
  function effective() { const o = own(); return o === 'system' ? hub() : o; }
  function setOwn(pref) {
    if (!ownKey || ['system', 'dark', 'light'].indexOf(pref) < 0) return false;
    try { if (pref === 'system') localStorage.removeItem(ownKey); else localStorage.setItem(ownKey, pref); } catch (_) { return false; }
    apply(); return true;
  }

  // H103: Glass for opted-in apps (system category only for now)
  const GLASS_OK = /\/apps\/system\//.test(location.pathname);
  const glassCss = me && me.src ? me.src.replace(/hub_theme\.js(\?.*)?$/, 'hub_glass_apps.css') : '';
  function glassOn() {
    const t = read(P + 'theme');
    return read(P + 'themeAuto') !== '1' && (t === 'glass' || (read(P + 'glass') === '1' && t !== 'dark'));
  }
  // H104: XP for the same opted-in apps (system category)
  const xpCss = me && me.src ? me.src.replace(/hub_theme\.js(\?.*)?$/, 'hub_xp_apps.css') : '';
  function xpOn() {
    const t = read(P + 'theme');
    return read(P + 'themeAuto') !== '1' && (t === 'xp' || (read(P + 'xp') === '1' && t !== 'dark'));
  }
  function applyXp(eff) {
    const x = GLASS_OK && own() === 'system' && eff === 'light' && xpOn();
    root.classList.toggle('hub-xp', x);
    if (x && xpCss && !document.getElementById('hub-xp-apps-css')) {
      const l = document.createElement('link');
      l.id = 'hub-xp-apps-css'; l.rel = 'stylesheet'; l.href = xpCss;
      (document.head || root).appendChild(l);
    }
    return x ? 'x' : '';
  }
  function applyGlass(eff) {
    // const g = GLASS_OK && own() === 'system' && eff === 'light' && glassOn();   (before H104)
    const g = GLASS_OK && own() === 'system' && eff === 'light' && glassOn() && !xpOn();   // an own-theme pick (Terminal) wins; H104: XP wins
    root.classList.toggle('hub-glass', g);
    root.classList.toggle('hub-glass-solid', g && read(P + 'glassSolid') === '1');
    if (g && glassCss && !document.getElementById('hub-glass-apps-css')) {
      const l = document.createElement('link');
      l.id = 'hub-glass-apps-css'; l.rel = 'stylesheet'; l.href = glassCss;
      (document.head || root).appendChild(l);
    }
    return g ? (root.classList.contains('hub-glass-solid') ? 'gs' : 'g') : '';
  }

  let last = '';
  function apply() {
    const eff = effective(), acc = read(P + 'accent');
    root.classList.toggle('light', eff === 'light');
    root.dataset.theme = eff;
    root.style.colorScheme = eff;
    if (/^#[0-9a-f]{6}$/i.test(acc)) root.style.setProperty('--accent', acc); else root.style.removeProperty('--accent');
    const gl = applyGlass(eff);   // H103
    const xp = applyXp(eff);   // H104
    // const sig = eff + '|' + acc + '|' + gl;   (before H104)
    const sig = eff + '|' + acc + '|' + gl + '|' + xp;
    if (sig !== last) { last = sig; fns.forEach((fn) => { try { fn(eff); } catch (_) { /* app bug */ } }); }
  }
  function onChange(fn) { if (typeof fn === 'function') fns.push(fn); }

  window.addEventListener('storage', (e) => { if (!e.key || e.key.indexOf(P) === 0 || e.key === ownKey) apply(); });
  window.addEventListener('message', (e) => {
    if (!IS_FILE && e.origin !== location.origin && e.origin !== 'null') return;
    if (e.data && e.data.type === 'hub-prefs') apply();
  });
  window.addEventListener('focus', apply);

  window.HubTheme = { apply, hub, own, setOwn, effective, onChange };
  apply();
})();
