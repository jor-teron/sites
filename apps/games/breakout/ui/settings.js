/* Shared Games Settings bridge: Auto follows Hub then system; physics is always
 * 60 Hz. fpsLimit only throttles drawing (60 if the library is unavailable).
 * Used: theme, fpsLimit, lowGraphics, showHints, autoPause, sfx, masterVolume, gear.
 * Unused: music, difficulty, vibration, screenShake, joystick and 3D settings. */
'use strict';
BRK.settings = (() => {
  const gs = window.GameSettings;
  const defaults = { theme: 'auto', fpsLimit: 60, sfx: true, masterVolume: .8, autoPause: true, lowGraphics: false, showHints: true };
  const api = {
    get: k => gs ? gs.get(k) : defaults[k],
    onChange: cb => gs ? gs.onChange(cb) : () => {},
    gear: el => gs ? gs.mountGear(el, 'breakout') : null,
    effects: () => !api.get('lowGraphics') && !matchMedia('(prefers-reduced-motion: reduce)').matches,
    dark() {
      const theme = api.get('theme');
      if (theme !== 'auto') return theme === 'dark';
      let hub; try { hub = localStorage.getItem('sites-hub.theme'); } catch (_) {}
      return hub === 'dark' || (hub !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    },
    apply() { document.documentElement.classList.toggle('dark', api.dark()); },
  };
  api.onChange(api.apply);
  addEventListener('storage', e => { if (e.key === 'sites-hub.theme' || e.key === null) api.apply(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', api.apply);
  api.apply();
  return api;
})();
