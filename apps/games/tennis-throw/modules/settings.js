/*
 * File: modules/settings.js
 * Project: tennis-throw — TB4/GS1, TB9 sound
 * Purpose: Bridge to the shared Games settings (apps/games/common/settings).
 *          TT.settings has get(), fps(), onChange(), mountGear(), vibrate().
 *          If games-settings.js did not load (blocked, offline, old copy),
 *          it falls back to fixed defaults, so the game always runs.
 *          TB9: sfx + masterVolume drive modules/sound.js; lowGraphics halves particles.
 */
(function (TT) {
  const GS = window.GameSettings;
  const FALLBACK = { theme: 'auto', fpsLimit: TT.CFG.loop.fps, difficulty: 'normal', vibration: true,
    showHints: true, showFps: false, autoPause: true, sfx: true, masterVolume: 0.8, lowGraphics: false };

  TT.settings = GS ? {
    get: k => GS.get(k),
    fps: () => GS.fps(),
    onChange: cb => GS.onChange(cb),
    mountGear: (el, name) => GS.mountGear(el, name),
  } : {
    get: k => FALLBACK[k],
    fps: () => FALLBACK.fpsLimit,
    onChange: () => () => {},
    mountGear: () => null,         // no settings page without the library
  };

  /** Short buzz on a hit when 'vibration' is on and the device supports it. */
  TT.settings.vibrate = function () {
    if (TT.settings.get('vibration') && navigator.vibrate) { try { navigator.vibrate(TT.CFG.vibrateMs); } catch (e) {} }
  };
})(window.TT);
