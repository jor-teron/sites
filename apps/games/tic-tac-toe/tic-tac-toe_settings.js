/*
 * Tic-tac-toe — shared Games Settings bridge (GS2).
 * Reads apps/games/common/settings/games-settings.js (window.GameSettings). If that script did not load
 * (blocked, offline, old copy) every call falls back to fixed defaults, so the game runs as before.
 *
 * Used:     difficulty (how often "vs CPU Easy" takes / blocks a win; numbers in tic-tac-toe_config.js;
 *           "vs CPU Hard" is always perfect play), theme (light / dark colours; auto = the usual dark),
 *           vibration (win / loss: phone vibration standalone, hub rumble inside the hub), ⚙ gear.
 * Not used: no animation loop or timer, so fpsLimit / showFps / autoPause do nothing; no sound; no hints.
 * Load order: games-settings.js → tic-tac-toe_config.js → this file → tic-tac-toe_logic.js
 */
const TTT_SETTINGS = (() => {
    const GS = window.GameSettings;
    const FALLBACK = { theme: 'auto', difficulty: 'normal', vibration: true };
    const api = {
        linked: !!GS,
        /** Current value of a shared setting (or the fallback default). */
        get: (k) => (GS ? GS.get(k) : FALLBACK[k]),
        /** cb(changed, all) on change (this tab or another tab). Returns unsubscribe. */
        onChange: (cb) => (GS ? GS.onChange(cb) : () => {}),
        /** ⚙ link to the settings page (null without the library). */
        mountGear: (target) => (GS ? GS.mountGear(target, 'tic-tac-toe') : null),
        /** Phone vibration (ms or pattern) when the "vibration" setting is on and supported. */
        vibrate: (p) => {
            if (!p || !api.get('vibration') || !navigator.vibrate) return;
            try { navigator.vibrate(p); } catch (_) { /* not allowed: ignore */ }
        },
    };
    return api;
})();
