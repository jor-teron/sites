/**
 * Classic board theme (UNB-4) — today's flat look; the default.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   blurb: string,
 *   decorateBlock?: (el: HTMLElement, block: object) => void,
 *   onApplied?: () => void
 * }} BoardTheme
 * @type {BoardTheme}
 */
export default {
    id: 'classic',
    name: 'Classic',
    blurb: 'Clean flat blocks on a slate grid.'
};
