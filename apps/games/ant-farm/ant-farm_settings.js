/* Ant Farm — shared Games Settings bridge (AF2)
 * Reads ../common/settings/games-settings.js (window.GameSettings). If that script
 * did not load, every call falls back to fixed defaults and the game runs as before.
 * Used here: fpsLimit (frame cap; the colony runs on real time), showFps (stats bar),
 *            autoPause (pause while the tab is hidden), lowGraphics (no trails / clouds), gear.
 * Not used:  no sound, no difficulty (it is a sandbox), theme (own art), vibration, joystick. */
var AF_SETTINGS = (function () {
  var GS = window.GameSettings, FALLBACK = { fpsLimit: 30, showFps: false, autoPause: true, lowGraphics: false };
  return {
    get: function (k) { return GS ? GS.get(k) : FALLBACK[k]; },
    frameMs: function () { return GS ? GS.frameMs() : 1000 / 30; },
    onChange: function (cb) { return GS ? GS.onChange(cb) : function () {}; },
    mountGear: function (where) { return GS ? GS.mountGear(where, 'ant-farm') : null; }
  };
})();
