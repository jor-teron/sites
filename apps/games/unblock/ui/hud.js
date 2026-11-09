/**
 * Unblock — HUD updates (UNB-1). Level, moves, par, undo.
 */
/**
 * @param {import('../core/game.js').Game} game
 */
export function updateHud(game) {
    document.getElementById('current-level-num').textContent =
        String(game.currentLevelNum).padStart(3, '0');
    document.getElementById('move-count').textContent = game.moveCount;
    const parEl = document.getElementById('par-count');
    if (parEl) parEl.textContent = game.par;
    document.getElementById('btn-undo').disabled = game.historyLength === 0;
}

export function hideNextButton() {
    document.getElementById('btn-next').style.display = 'none';
}

export function showNextButton() {
    document.getElementById('btn-next').style.display = 'inline-flex';
}
