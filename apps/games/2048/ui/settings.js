/*
  ============================================================
  File:        ui/settings.js
  Project:     2048 — GS2
  Purpose:     Bridge to the shared Games Settings
               (apps/games/common/settings/games-settings.js,
               window.GameSettings). If that script did not load
               (blocked, offline, old copy) every call falls back
               to fixed defaults, so the game runs as before.
  Used:        vibration (big tile / 2048 / game over: phone
               vibration standalone, hub rumble inside the hub),
               ⚙ gear in the bottom button row.
  Not used:    turn-based with CSS slide animations and no sound,
               so fpsLimit / showFps / autoPause / music / sfx /
               volume do nothing; no hints; difficulty has no
               meaning for 2048; theme: the board is always dark.
  Load order:  games-settings.js → core/config.js → this file
               → core/logic.js
  ============================================================
*/
const G2048_SETTINGS = (() => {
  const GS = window.GameSettings;
  const FALLBACK = { vibration: true };
  const api = {
    linked: !!GS,
    /** Current value of a shared setting (or the fallback default). */
    get: (k) => (GS ? GS.get(k) : FALLBACK[k]),
    /** cb(changed, all) on change (this tab or another tab). Returns unsubscribe. */
    onChange: (cb) => (GS ? GS.onChange(cb) : () => {}),
    /** ⚙ link to the settings page (null without the library). */
    mountGear: (target) => (GS ? GS.mountGear(target, '2048') : null),
    /** Phone vibration (ms or pattern) when the "vibration" setting is on and supported. */
    vibrate: (p) => {
      if (!p || !api.get('vibration') || !navigator.vibrate) return;
      try { navigator.vibrate(p); } catch (_) { /* not allowed: ignore */ }
    },
  };
  return api;
})();
