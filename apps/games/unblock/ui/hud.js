/**
 * Unblock — HUD updates (UNB-0).
 * Level number, move count, undo disabled state.
 */
/**
 * @param {import('../core/game.js').Game} game
 */
export function updateHud(game) {
    document.getElementById('current-level-num').textContent =
        String(game.currentLevelNum).padStart(3, '0');
    document.getElementById('move-count').textContent = game.moveCount;
    document.getElementById('btn-undo').disabled = game.historyLength === 0;
}

/** Hide the footer "Next Level" button. */
export function hideNextButton() {
    document.getElementById('btn-next').style.display = 'none';
}

/** Show the footer "Next Level" button. */
export function showNextButton() {
    document.getElementById('btn-next').style.display = 'inline-flex';
}
