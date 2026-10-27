// LandCraft LC3: bridge to the shared Games settings (apps/games/common/settings, window.GameSettings).
// index.html loads games-settings.js as a classic script before the game modules. If it did not load
// (blocked, offline, old copy) every call falls back to FALLBACK, so the game always runs.
// Used here: fpsLimit, renderDistance, pixelRatio, lowGraphics, sensitivity, showFps, autoJump, holdRepeat.
// Not used (no sound, no pause, no difficulty): theme, music, sfx, masterVolume, vibration, difficulty,
// autoPause, screenShake, controlsSide, joystickSize, buttonOpacity, showHints.
const GS = window.GameSettings;
const FALLBACK = { fpsLimit: 30, renderDistance: 5, pixelRatio: 'auto', lowGraphics: false, sensitivity: 1,
  showFps: false, autoJump: true, holdRepeat: true };

export const settings = {
  ok: !!GS, // false = library missing, fixed defaults
  get: function (k) { if (GS) { const v = GS.get(k); if (v !== undefined) return v; } return FALLBACK[k]; },
  // cb(changed) on any change, in this tab or another (e.g. the settings page). Returns unsubscribe.
  onChange: function (cb) { return GS ? GS.onChange(cb) : function () {}; },
  // ⚙ link to the settings page (Back returns to LandCraft). No library = no gear.
  mountGear: function (where) { return GS ? GS.mountGear(where, 'landcraft') : null; },
  // Pixel ratio to render at: 'auto' = device ratio capped at 2 (1 with Low graphics), else the chosen value.
  pixelRatio: function () {
    const p = settings.get('pixelRatio');
    if (p === 'auto') return settings.get('lowGraphics') ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    return p;
  },
  frameMs: function () { return 1000 / (settings.get('fpsLimit') || 30); }
};
