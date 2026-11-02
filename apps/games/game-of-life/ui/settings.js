/*
 * Game of Life — shared Games Settings bridge (LIFE-1), same shape as connect-4/ui/settings.js.
 * Reads window.GameSettings; if it did not load, every call falls back to fixed defaults.
 *
 * Used:     theme (light / dark; auto = Hub theme, else device), fpsLimit (render cap, max 30),
 *           autoPause (pauses when the tab is hidden), ⚙ gear (button row).
 * Not used: sound, vibration, difficulty, controls / 3D options, hints.
 * Load order: games-settings.js → core/config.js → this file → the rest.
 */
const LIFE_SETTINGS = (() => {
  const GS = window.GameSettings;
  const FALLBACK = { theme: 'auto', fpsLimit: 30, autoPause: true };
  const api = {
    linked: !!GS,
    get: (k) => (GS ? GS.get(k) : FALLBACK[k]),
    onChange: (cb) => (GS ? GS.onChange(cb) : () => {}),
    mountGear: (target) => (GS ? GS.mountGear(target, 'game-of-life') : null),
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
