/* Ant Farm settings moved to ui/settings.js (AF-4a).
 * This file stays so an old path still defines AF_SETTINGS if the new file was not loaded.
 * Old keys (fpsLimit, showFps, autoPause, lowGraphics) keep working. */
if (!window.AF_SETTINGS) {
  var AF_SETTINGS = (function () {
    var GS = window.GameSettings, FALLBACK = { theme: 'auto', fpsLimit: 30, showFps: false, autoPause: true, lowGraphics: false };
    return {
      get: function (k) { return GS ? GS.get(k) : FALLBACK[k]; },
      frameMs: function () { return GS ? GS.frameMs() : 1000 / 30; },
      onChange: function (cb) { return GS ? GS.onChange(cb) : function () {}; },
      mountGear: function (where) { return GS ? GS.mountGear(where, 'ant-farm') : null; },
      isDark: function () {
        var t = GS ? GS.get('theme') : 'auto';
        if (t === 'light') return false;
        if (t === 'dark') return true;
        var h = ''; try { h = localStorage.getItem('sites-hub.theme') || ''; } catch (_) {}
        return h ? h === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
      }
    };
  })();
}
