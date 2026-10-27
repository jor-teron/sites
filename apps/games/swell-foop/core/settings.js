/*
 * Swell Foop — shared Games Settings bridge (GS2).
 * Reads apps/games/common/settings/games-settings.js (window.GameSettings). If that script did not load
 * (blocked, offline, old copy) every call falls back to fixed defaults, so the game runs as before.
 *
 * Used:     fpsLimit (fall animation + animated-theme idle redraw rate; the animation itself is timed in ms),
 *           showFps (small counter, shows 0 while the board is idle: flat themes never redraw),
 *           vibration (big group / game over), ⚙ gear next to New Game / Theme.
 * Not used: no sound (music / sfx / volume); turn-based, so autoPause has nothing to pause; difficulty and hints
 *           have no meaning here; theme: the page stays dark and the block look is the game's own Theme picker.
 * Load order: games-settings.js → core/config.js → this file → … → core/logic.js
 */
const SF_SETTINGS = (() => {
    const GS = window.GameSettings;
    const FALLBACK = { fpsLimit: 30, vibration: true, showFps: false };
    const api = {
        linked: !!GS,
        /** Current value of a shared setting (or the fallback default). */
        get: (k) => (GS ? GS.get(k) : FALLBACK[k]),
        /** Milliseconds per drawn frame (FPS cap). Without the library: the config's own idle rate. */
        frameMs: () => (GS ? GS.frameMs() : SWELL_FOOP_CONFIG.animation.idleMs),
        /** cb(changed, all) on change (this tab or another tab). Returns unsubscribe. */
        onChange: (cb) => (GS ? GS.onChange(cb) : () => {}),
        /** ⚙ link to the settings page (null without the library). */
        mountGear: (target) => (GS ? GS.mountGear(target, 'swell-foop') : null),
        /** Phone vibration (ms or pattern) when the "vibration" setting is on and supported. */
        vibrate: (p) => {
            if (!p || !api.get('vibration') || !navigator.vibrate) return;
            try { navigator.vibrate(p); } catch (e) { /* not allowed: ignore */ }
        },
    };

    /** FPS counter (bottom-left): tick() per drawn frame, refreshed every everyMs, hidden unless showFps. */
    api.fpsMeter = (everyMs) => {
        const el = document.createElement('div');
        el.className = 'sf-fps hidden';
        document.body.appendChild(el);
        let frames = 0, t0 = performance.now(), timer = 0;
        function update() {
            const now = performance.now();
            el.textContent = Math.round(frames * 1000 / Math.max(1, now - t0)) + ' fps';
            frames = 0; t0 = now;
        }
        return {
            show(on) {
                el.classList.toggle('hidden', !on);
                clearInterval(timer); timer = 0;
                if (on) { frames = 0; t0 = performance.now(); el.textContent = '– fps'; timer = setInterval(update, everyMs); }
            },
            tick() { frames++; },
        };
    };
    return api;
})();
