/*
 * Orbito — shared Games Settings bridge (ORB-1), same shape as go/ui/settings.js.
 * Reads window.GameSettings; if it did not load, every call falls back to fixed defaults.
 *
 * Used:     theme (light / dark; auto = Hub theme, else device), sfx + masterVolume (clicks, the board turning),
 *           difficulty (default CPU level the first time), vibration (placing, game end),
 *           lowGraphics (no turning animation), ⚙ gear (button row).
 * Not used: fpsLimit (no game loop; the short turning animation is capped at 30 fps on its own),
 *           showFps, autoPause (turn-based), controls / 3D options, hints.
 * Load order: games-settings.js → core/config.js → this file → the rest.
 */
const OB_SETTINGS = (() => {
  const GS = window.GameSettings;
  const FALLBACK = { theme: 'auto', difficulty: 'normal', vibration: true, sfx: true, masterVolume: 0.8, lowGraphics: false };
  const api = {
    linked: !!GS,
    get: (k) => (GS ? GS.get(k) : FALLBACK[k]),
    onChange: (cb) => (GS ? GS.onChange(cb) : () => {}),
    mountGear: (target) => (GS ? GS.mountGear(target, 'orbito') : null),
    vibrate: (p) => {
      if (!p || !api.get('vibration') || !navigator.vibrate) return;
      try { navigator.vibrate(p); } catch (_) { /* not allowed */ }
    },
    /** true = dark colours. auto follows the Hub theme key, else the device setting. */
    isDark: () => {
      const t = api.get('theme');
      if (t === 'light') return false;
      if (t === 'dark') return true;
      let h = ''; try { h = localStorage.getItem('sites-hub.theme') || ''; } catch (_) {}
      return h ? h === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    },
  };
  return api;
})();
