/**
 * =============================================================================
 * Project : pooh-chat
 * File    : modules/pooh-chat-theme.js
 * Purpose : Light / dark toggle and localStorage persistence.
 * Author  : pooh-chat refactor
 * Notes   : Dark mode is body.theme-dark. Button label is the mode you switch to.
 * =============================================================================
 */

import { POOH_CHAT_CONFIG as CFG } from "../pooh-chat-config.js";
import { btnTheme } from "./pooh-chat-dom.js";

/**
 * Apply light or dark and remember the choice.
 * @param {string} theme "light" or "dark".
 */
export function applyTheme(theme) {
    const dark = theme === "dark";
    document.body.classList.toggle("theme-dark", dark);
    btnTheme.textContent = dark ? CFG.strings.themeDarkLabel : CFG.strings.themeLightLabel;
    try {
        localStorage.setItem(CFG.themeStorageKey, dark ? "dark" : "light");
    } catch (e) {
        /* private mode may block storage */
    }
}

/**
 * Read the saved theme, or the config default.
 * @returns {string} "light" or "dark".
 */
export function loadTheme() {
    try {
        const saved = localStorage.getItem(CFG.themeStorageKey);
        if (saved === "dark" || saved === "light") {
            return saved;
        }
    } catch (e) {
        /* ignore */
    }
    return CFG.defaultTheme;
}

/**
 * Flip the current theme.
 */
export function toggleTheme() {
    const next = document.body.classList.contains("theme-dark") ? "light" : "dark";
    applyTheme(next);
}
