/**
 * Unblock — victory modal (UNB-1).
 */
import { hideNextButton, showNextButton } from './hud.js';

/**
 * @param {import('../core/game.js').Game} game
 * @param {number} stars
 */
export function showVictory(game, stars) {
    document.getElementById('vic-level').textContent =
        String(game.currentLevelNum).padStart(3, '0');
    document.getElementById('vic-moves').textContent = game.moveCount;
    document.getElementById('vic-par').textContent = game.par;
    document.getElementById('vic-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('vic-hints').textContent =
        game.hintsUsed === 0 ? 'No hints used' : `Hints used: ${game.hintsUsed}`;
    document.getElementById('modal-victory').style.display = 'flex';
    showNextButton();
}

export function hideVictory() {
    document.getElementById('modal-victory').style.display = 'none';
}

/**
 * @param {{ onReplay: ()=>void, onNext: ()=>void }} handlers
 */
export function bindVictoryControls(handlers) {
    document.getElementById('btn-vic-replay').onclick = () => {
        hideVictory();
        handlers.onReplay();
    };
    document.getElementById('btn-vic-next').onclick = () => {
        hideVictory();
        handlers.onNext();
        hideNextButton();
    };
}
