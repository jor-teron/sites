/*
 * Hub theme for apps (shared/theme/hub_theme.js), H22.
 * System apps follow the Hub's Dark / Light theme and accent (Settings > Look) automatically.
 * There is no per-app picker. An app with its own built-in theme (only the Terminal) can pass
 * data-own-key="<localStorage key>" holding 'dark' | 'light' | '' (= System, follow the Hub).
 *
 * localStorage (same origin as the Hub):
 *   sites-hub.theme    'light' | '' (dark)    the Hub theme (hub/core/hub_prefs.js)
 *   sites-hub.accent   '#rrggbb' | ''         → --accent
 * Paints <html>: class 'light', data-theme="dark|light", --accent, color-scheme.
 * Live: 'storage' event, a {type:'hub-prefs'} postMessage from the Hub, window focus.
 * Use: <script src="../../../shared/theme/hub_theme.js?v=…"></script> in <head> (auto-init, no flash).
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

  function hub() { return read(P + 'theme') === 'light' ? 'light' : 'dark'; }
  function own() { const v = ownKey ? read(ownKey) : ''; return v === 'dark' || v === 'light' ? v : 'system'; }
  function effective() { const o = own(); return o === 'system' ? hub() : o; }
  function setOwn(pref) {
    if (!ownKey || ['system', 'dark', 'light'].indexOf(pref) < 0) return false;
    try { if (pref === 'system') localStorage.removeItem(ownKey); else localStorage.setItem(ownKey, pref); } catch (_) { return false; }
    apply(); return true;
  }

  let last = '';
  function apply() {
    const eff = effective(), acc = read(P + 'accent');
    root.classList.toggle('light', eff === 'light');
    root.dataset.theme = eff;
    root.style.colorScheme = eff;
    if (/^#[0-9a-f]{6}$/i.test(acc)) root.style.setProperty('--accent', acc); else root.style.removeProperty('--accent');
    const sig = eff + '|' + acc;
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
