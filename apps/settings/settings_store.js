/*
 * Settings store (apps/settings/settings_store.js) — read / write the Hub's localStorage keys
 * ('sites-hub.<key>') and tell the Hub to re-apply at once: parent.HubPrefs.apply() directly,
 * plus postMessage {type:'hub-prefs'} to the parent Hub; other open Hub tabs get the normal
 * 'storage' event.
 * Keys: wallpaper, taskH, titleH, accent, theme, motion, wmMode, startHover (see hub/hub_prefs.js), trayMeter (hub_traymeter.js),
 *   hoverFocus (wm_windows.js), filesClick (Files app).
 * Also paints this app's own accent / theme so Settings matches the Hub.
 */
window.SettingsStore = (function () {
  'use strict';
  const P = 'sites-hub.';
  const listeners = [];
  function get(k, d) {
    try { const v = localStorage.getItem(P + k); return v == null || v === '' ? (d == null ? '' : d) : v; } catch (_) { return d == null ? '' : d; }
  }
  function set(k, v) {
    try {
      if (v == null || v === '') localStorage.removeItem(P + k);
      else localStorage.setItem(P + k, String(v));
    } catch (_) { /* blocked */ }
    paintSelf();
    // Live apply in the Hub: call it directly (same origin), plus the message / storage event as backup
    try { const h = window.parent !== window && window.parent; if (h && h.HubPrefs) h.HubPrefs.apply(); } catch (_) { /* cross-origin */ }
    try { if (window.parent !== window) window.parent.postMessage({ type: 'hub-prefs', key: k }, location.origin === 'null' ? '*' : location.origin); } catch (_) { /* ignore */ }
    listeners.forEach((fn) => fn(k));
  }
  function onChange(fn) { listeners.push(fn); }
  /** The Hub page when Settings runs inside it (same origin), else null. */
  function hub() {
    try { const p = window.parent; return p !== window && p.document && p.HubMode ? p : null; } catch (_) { return null; }
  }
  function paintSelf() {
    const r = document.documentElement;
    const acc = get('accent');
    if (/^#[0-9a-f]{6}$/i.test(acc)) r.style.setProperty('--accent', acc); else r.style.removeProperty('--accent');
    r.classList.toggle('light', get('theme') === 'light');
    r.classList.toggle('motion-off', get('motion') === 'off');
  }
  window.addEventListener('storage', (e) => { if (!e.key || e.key.indexOf(P) === 0) { paintSelf(); listeners.forEach((fn) => fn(e.key ? e.key.slice(P.length) : '')); } });
  paintSelf();
  return { get, set, onChange, hub };
})();
