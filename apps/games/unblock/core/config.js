/**
 * Unblock — shared config (UNB-1).
 * storageKey v2: new level set; ignore v1 saves.
 */
export const CONFIG = {
    gridSize: 6,
    storageKey: 'unblock_game_save_v2',
    totalLevels: 1000,
    levelsUrl: 'assets/levels.json',
    pageSize: 100,
    hintHighlightMs: 1500,
    snapMs: 120
};

/**
 * Stars from moves vs par.
 * @param {number} moves
 * @param {number} par
 * @returns {1|2|3}
 */
export function starsFor(moves, par) {
    if (moves <= par) return 3;
    if (moves <= Math.ceil(par * 1.5)) return 2;
    return 1;
}
