/**
 * Unblock — board sizing (UNB-3).
 * Fits the largest square into .game-main (after header/footer), with small
 * side margins and room for the EXIT marker. Caps at 640px on desktop.
 */

const EXIT_PAD = 14;   // exit marker sticks out on the right
const MARGIN = 6;      // breathing room inside .game-main
const DESKTOP_CAP = 640;

/**
 * Set .board-container width/height to the largest square that fits.
 * @returns {number} board pixel size (0 if DOM not ready)
 */
export function sizeBoard() {
    const main = document.querySelector('.game-main');
    const container = document.querySelector('.board-container');
    if (!main || !container) return 0;

    const availW = Math.max(0, main.clientWidth - MARGIN * 2 - EXIT_PAD);
    const availH = Math.max(0, main.clientHeight - MARGIN * 2);
    const size = Math.max(120, Math.min(availW, availH, DESKTOP_CAP));

    container.style.width = `${size}px`;
    container.style.height = `${size}px`;
    container.style.maxWidth = `${size}px`;
    return size;
}
