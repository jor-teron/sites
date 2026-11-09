/**
 * Unblock — real hint (UNB-1).
 * Runs the BFS solver from the current position and highlights the block + direction.
 */
import { CONFIG } from '../core/config.js';
import { hintMove } from '../core/solver.js';

let clearTimer = 0;

/** Clear any active hint highlight. */
export function clearHintHighlight() {
    if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = 0;
    }
    document.querySelectorAll('.block.hint, .hint-arrow').forEach(el => {
        el.classList.remove('hint');
        if (el.classList.contains('hint-arrow')) el.remove();
    });
}

/**
 * @param {import('../core/game.js').Game} game
 * @returns {boolean} true if a hint was shown
 */
export function showHint(game) {
    clearHintHighlight();
    if (game.isWon()) return false;

    const hint = hintMove(game.blocks, { timeLimitMs: 800 });
    if (!hint) {
        // Brief flash on the hint button as feedback
        const btn = document.getElementById('btn-hint');
        btn.classList.add('hint-miss');
        setTimeout(() => btn.classList.remove('hint-miss'), 400);
        return false;
    }

    game.noteHintUsed();

    const el = document.querySelector(`.block[data-id="${hint.id}"]`);
    if (!el) return false;

    el.classList.add('hint');
    const block = game.getBlock(hint.id);
    const arrow = document.createElement('div');
    arrow.className = 'hint-arrow';
    // Direction glyph
    if (block.orientation === 'h') {
        arrow.textContent = hint.delta > 0 ? '→' : '←';
    } else {
        arrow.textContent = hint.delta > 0 ? '↓' : '↑';
    }
    el.appendChild(arrow);

    clearTimer = setTimeout(() => clearHintHighlight(), CONFIG.hintHighlightMs);
    return true;
}
