/**
 * Unblock — shared Games Settings bridge (UNB-2).
 * Reads window.GameSettings (loaded as a classic script before this module).
 * If the library is missing, every call falls back to fixed defaults.
 *
 * Used:     theme (light / dark; auto = Hub theme, else device),
 *           vibration (win), showHints (Hint button still works either way),
 *           ⚙ gear (?from=unblock).
 * Not used: sfx/music (no sounds), fpsLimit, difficulty, controls / 3D.
 */
const GS = window.GameSettings;
const FALLBACK = { theme: 'auto', vibration: true, showHints: true };

export const UnblockSettings = {
    linked: !!GS,

    /** @param {string} k */
    get(k) {
        return GS ? GS.get(k) : FALLBACK[k];
    },

    /** @param {(changed: object, all: object) => void} cb */
    onChange(cb) {
        return GS ? GS.onChange(cb) : () => {};
    },

    /**
     * Mount the ⚙ gear. Returns null if the library is missing.
     * @param {Element|string} target
     */
    mountGear(target) {
        return GS ? GS.mountGear(target, 'unblock') : null;
    },

    /** true = dark colours. auto follows Hub theme, else the device setting. */
    isDark() {
        const t = UnblockSettings.get('theme');
        if (t === 'light') return false;
        if (t === 'dark') return true;
        let h = '';
        try { h = localStorage.getItem('sites-hub.theme') || ''; } catch (_) { /* blocked */ }
        return h ? h === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    },

    /** Apply html.dark from the current theme setting. */
    applyTheme() {
        document.documentElement.classList.toggle('dark', UnblockSettings.isDark());
    },

    /**
     * Short vibration if enabled (and the browser allows it).
     * @param {number|number[]} pattern
     */
    vibrate(pattern) {
        if (!pattern || !UnblockSettings.get('vibration') || !navigator.vibrate) return;
        try { navigator.vibrate(pattern); } catch (_) { /* not allowed */ }
    }
};
