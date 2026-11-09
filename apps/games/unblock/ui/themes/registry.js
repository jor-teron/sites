/**
 * Unblock — board-theme registry (UNB-4).
 * Page chrome still follows shared light/dark; boardTheme paints the board + blocks.
 * Preference: localStorage key "unblock.boardTheme".
 */
import classic from './classic.js';
import wood from './wood.js';
import carbus from './carbus.js';
import floor from './floor.js';
import stone from './stone.js';

export const BOARD_THEME_KEY = 'unblock.boardTheme';

/** @type {import('./classic.js').BoardTheme[]} */
export const BOARD_THEMES = [classic, wood, carbus, floor, stone];

const byId = Object.fromEntries(BOARD_THEMES.map(t => [t.id, t]));

/** @returns {string} */
export function getBoardThemeId() {
    try {
        const v = localStorage.getItem(BOARD_THEME_KEY);
        if (v && byId[v]) return v;
    } catch (_) { /* private mode */ }
    return classic.id;
}

/** @param {string} id */
export function setBoardThemeId(id) {
    const safe = byId[id] ? id : classic.id;
    try { localStorage.setItem(BOARD_THEME_KEY, safe); } catch (_) { /* ignore */ }
    applyBoardTheme(safe);
    return safe;
}

/**
 * Set data-board-theme on the board shell (and #app for modal previews).
 * @param {string} [id]
 */
export function applyBoardTheme(id = getBoardThemeId()) {
    const safe = byId[id] ? id : classic.id;
    const root = document.getElementById('app');
    const board = document.querySelector('.board-container');
    if (root) root.setAttribute('data-board-theme', safe);
    if (board) board.setAttribute('data-board-theme', safe);
    // Theme may want to re-decorate existing blocks without a full re-render
    const theme = byId[safe];
    if (theme?.onApplied) theme.onApplied();
    return safe;
}

/** @param {string} id */
export function getTheme(id) {
    return byId[id] || classic;
}

/**
 * Optional per-block decoration after the DOM node is created.
 * @param {HTMLElement} el
 * @param {{ id:string, length:number, orientation:string, isPlayer?:boolean }} block
 */
export function decorateBlock(el, block) {
    const theme = byId[getBoardThemeId()] || classic;
    if (theme.decorateBlock) theme.decorateBlock(el, block);
}
