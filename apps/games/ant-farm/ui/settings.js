/*
 * Ant Farm — shared Games Settings bridge (AF-4a; was ant-farm_settings.js in AF2).
 * Reads window.GameSettings; if it did not load, every call falls back to fixed defaults.
 *
 * Used:     theme (light / dark; auto = Hub theme, else device — default Auto),
 *           fpsLimit (frame cap; the colony runs on real time), showFps (stats bar),
 *           autoPause (pause while the tab is hidden), lowGraphics (no trails / clouds),
 *           sfx + masterVolume (quiet WebAudio; mute or volume 0 is silent),
 *           gear (in the top bar).
 * Not used: difficulty, vibration, joystick (sandbox).
 * Load order: games-settings.js → this file → core/* and assets/*.
 * Old keys (fpsLimit, showFps, autoPause, lowGraphics) keep working.
 */
var AF_SETTINGS = (function () {
  var GS = window.GameSettings;
  var FALLBACK = { theme: 'auto', fpsLimit: 30, showFps: false, autoPause: true, lowGraphics: false, sfx: true, masterVolume: 0.8 };
  var api = {
    linked: !!GS,
    get: function (k) { return GS ? GS.get(k) : FALLBACK[k]; },
    frameMs: function () { return GS ? GS.frameMs() : 1000 / 30; },
    onChange: function (cb) { return GS ? GS.onChange(cb) : function () {}; },
    mountGear: function (where) { return GS ? GS.mountGear(where, 'ant-farm') : null; },
    /** true = dark chrome. auto follows the Hub theme key, else the device setting. */
    isDark: function () {
      var t = api.get('theme');
      if (t === 'light') return false;
      if (t === 'dark') return true;
      var h = '';
      try { h = localStorage.getItem('sites-hub.theme') || ''; } catch (_) { /* blocked */ }
      return h ? h === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    }
  };
  return api;
})();
