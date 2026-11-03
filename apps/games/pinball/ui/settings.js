/*
 * Star Pinball — shared Games Settings bridge (PIN-1a; sound + effects PIN-1c), same shape as orbito/ui/settings.js.
 * Reads window.GameSettings; if it did not load, every call falls back to fixed defaults.
 *
 * Used:     theme (light / dark; auto = Hub theme, else device), fpsLimit (drawing rate; physics
 *           sub-steps are fixed whatever the rate), lowGraphics (fewer stars, no glow, and no flashes,
 *           shake or light shows), screenShake (shake on big hits), sfx + masterVolume (ui/sound.js),
 *           autoPause (also pause when the window loses focus; hiding the tab always pauses),
 *           vibration (bumper hit, mission done, tilt, drain), ⚙ gear (title bar).
 *           The device's reduced-motion setting also turns the flashes, shake and light shows off.
 *           The high score ('pinball.best') and the game in progress ('pinball.save') are removed by the
 *           settings page's "Clear all game progress".
 * Not used: music (there is none), difficulty, controls / joystick options.
 * Load order: games-settings.js → core/config.js → this file → the rest.
 */
const PB_SETTINGS = (() => {
  const GS = window.GameSettings;
  const FALLBACK = { theme: 'auto', fpsLimit: 30, lowGraphics: false, screenShake: true, autoPause: true, vibration: true, sfx: true, masterVolume: 0.8 };
  const api = {
    linked: !!GS,
    get: (k) => (GS ? GS.get(k) : FALLBACK[k]),
    onChange: (cb) => (GS ? GS.onChange(cb) : () => {}),
    mountGear: (target) => (GS ? GS.mountGear(target, 'pinball') : null),
    vibrate: (p) => {
      if (!p || !api.get('vibration') || !navigator.vibrate) return;
      try { navigator.vibrate(p); } catch (_) { /* not allowed */ }
    },
    /** Device asks for less motion. */
    reducedMotion: () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
    /** Flashes and light shows: off for Low graphics or reduced motion. */
    fxOn: () => !api.get('lowGraphics') && !api.reducedMotion(),
    /** Camera shake: as fxOn, and the shared screenShake switch. */
    shakeOn: () => api.fxOn() && api.get('screenShake') !== false,
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
