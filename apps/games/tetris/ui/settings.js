/* =============================================================================
 * TETRIS — shared Games Settings bridge (GS2)
 * Reads apps/games/common/settings/games-settings.js (window.GameSettings).
 * If that script did not load (blocked, offline, old copy) every call falls
 * back to fixed defaults, so the game always runs exactly as before.
 *
 * Used here: theme (light = inverted B/W; auto / dark = the classic black look),
 *            fpsLimit (draw throttle; gravity stays on real time),
 *            difficulty (fall speed, numbers in core/config.js),
 *            autoPause, showHints (controls help), showFps, vibration, gear.
 * Not used:  no sound (music / sfx / masterVolume), no joystick or on-screen
 *            buttons, no screen shake, no 3D options.
 * Load order: games-settings.js → core/config.js → this file → core/logic.js
 * ============================================================================= */
var TETRIS_SETTINGS = (function () {
  var GS = window.GameSettings;
  var FALLBACK = { theme: "auto", fpsLimit: 30, difficulty: "normal", vibration: true,
    showHints: true, autoPause: true, showFps: false };

  var api = {
    linked: !!GS,
    /* Current value of a shared setting (or the fallback default). */
    get: function (k) { return GS ? GS.get(k) : FALLBACK[k]; },
    /* Milliseconds per drawn frame for the FPS cap. */
    frameMs: function () { return GS ? GS.frameMs() : 1000 / FALLBACK.fpsLimit; },
    /* cb(changed, all) when settings change (this tab or the settings page in another tab). */
    onChange: function (cb) { return GS ? GS.onChange(cb) : function () {}; },
    /* ⚙ link to the settings page (none without the library). */
    mountGear: function (pos) { return GS ? GS.mountGear(pos, "tetris") : null; },
    /* Buzz the phone if the "vibration" setting is on and the browser supports it. */
    vibrate: function (p) {
      if (!p || !api.get("vibration") || !navigator.vibrate) return;
      try { navigator.vibrate(p); } catch (e) { /* not allowed: ignore */ }
    }
  };

  /* Small FPS counter (bottom-left). tick(now) once per drawn frame; hidden unless showFps. */
  api.fpsMeter = function (everyMs) {
    var el = document.createElement("div");
    el.id = "fps";
    el.style.cssText = "position:fixed;left:6px;bottom:6px;font:11px monospace;color:#0f0;" +
      "background:rgba(0,0,0,.5);padding:1px 4px;z-index:40;pointer-events:none;display:none";
    document.body.appendChild(el);
    var frames = 0, t0 = 0;
    return {
      show: function (on) { el.style.display = on ? "block" : "none"; frames = 0; t0 = 0; },
      tick: function (now) {
        if (el.style.display === "none") return;
        if (!t0) t0 = now;
        frames += 1;
        if (now - t0 >= everyMs) {
          el.textContent = Math.round(frames * 1000 / (now - t0)) + " fps";
          frames = 0; t0 = now;
        }
      }
    };
  };
  return api;
})();
