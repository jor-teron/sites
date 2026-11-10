/*
 * Battleship — shared Games Settings bridge (SHIP-2b), same shape as tic-tac-toe/ui/settings.js.
 * Reads window.GameSettings; if it did not load, every call falls back to fixed defaults.
 *
 * Used:     theme (light / dark; auto = Hub theme, else device), sfx + masterVolume (shot / hit / sunk / win sounds),
 *           difficulty (default CPU level the first time),
 *           vibration (hit / sunk / win / loss), ⚙ gear (button row).
 * Used also: the Auto (System) theme is the default (Hub theme, else the device). Water motion pauses when the device asks for reduced motion.
 * Used also: lowGraphics (skips arcs, splash, explosions, fire, radar and water motion; also off for reduced motion), fpsLimit (caps the effect loop).
 * Not used: showFps, autoPause (turn-based), controls / 3D options, hints.
 * Load order: games-settings.js → core/config.js → this file → the rest.
 */
const BS_SETTINGS = (() => {
  const GS = window.GameSettings;
  const FALLBACK = { theme: 'auto', difficulty: 'normal', vibration: true, sfx: true, masterVolume: 0.8 };
  const api = {
    linked: !!GS,
    get: (k) => (GS ? GS.get(k) : FALLBACK[k]),
    onChange: (cb) => (GS ? GS.onChange(cb) : () => {}),
    mountGear: (target) => (GS ? GS.mountGear(target, 'battleship') : null),
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
