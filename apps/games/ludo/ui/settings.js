/*
 * Ludo — shared Games Settings bridge (LUDO-1a; difficulty LUDO-1b; sound + lowGraphics LUDO-1c), same shape as tic-tac-toe/ui/settings.js.
 * Reads window.GameSettings; if it did not load, every call falls back to fixed defaults.
 *
 * Used:     theme (light / dark; auto = Hub theme, else device),
 *           difficulty (the first level a seat gets when switched to the computer in New game),
 *           sfx + masterVolume (ui/sound.js), lowGraphics (no slide / die animation),
 *           vibration (capture, home, a player finishes), ⚙ gear (button row).
 * Not used: fpsLimit (no game loop: short slides run at a fixed 30 fps cap, otherwise drawn only on change), showFps, autoPause (turn-based), controls / 3D options, hints.
 * Load order: games-settings.js → core/config.js → this file → the rest.
 */
const LD_SETTINGS = (() => {
  const GS = window.GameSettings;
  const FALLBACK = { theme: 'auto', difficulty: 'normal', vibration: true, sfx: true, masterVolume: 0.8, lowGraphics: false };
  const api = {
    linked: !!GS,
    get: (k) => (GS ? GS.get(k) : FALLBACK[k]),
    onChange: (cb) => (GS ? GS.onChange(cb) : () => {}),
    mountGear: (target) => (GS ? GS.mountGear(target, 'ludo') : null),
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
