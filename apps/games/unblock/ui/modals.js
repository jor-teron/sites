/**
 * Unblock — level-select and victory modals (UNB-0).
 */
import { CONFIG } from '../core/config.js';
import { hideNextButton, showNextButton } from './hud.js';

/**
 * Show the victory modal and footer Next button.
 * @param {import('../core/game.js').Game} game
 */
export function showVictory(game) {
    document.getElementById('vic-level').textContent =
        String(game.currentLevelNum).padStart(3, '0');
    document.getElementById('vic-moves').textContent = game.moveCount;
    document.getElementById('modal-victory').style.display = 'flex';
    showNextButton();
}

/** Hide the victory modal. */
export function hideVictory() {
    document.getElementById('modal-victory').style.display = 'none';
}

/**
 * Paint all 1000 level cells and open the level modal.
 * @param {import('../core/game.js').Game} game
 * @param {(levelNum: number) => void} onPickLevel
 */
export function openLevelSelect(game, onPickLevel) {
    const gridEl = document.getElementById('level-grid');
    gridEl.innerHTML = '';
    const progress = game.reloadProgress();

    for (let i = 0; i < CONFIG.totalLevels; i++) {
        const cell = document.createElement('div');
        cell.className = 'level-cell';
        if (i === game.currentLevelNum) cell.classList.add('current');
        else if (progress.completedLevels[i] !== undefined) cell.classList.add('completed');

        cell.textContent = i;
        cell.onclick = () => {
            onPickLevel(i);
            closeLevelSelect();
        };
        gridEl.appendChild(cell);
    }

    document.getElementById('modal-levels').style.display = 'flex';
}

/** Close the level-select modal. */
export function closeLevelSelect() {
    document.getElementById('modal-levels').style.display = 'none';
}

/**
 * Wire modal / jump-input buttons once.
 * @param {import('../core/game.js').Game} game
 * @param {{
 *   onPickLevel: (n: number) => void,
 *   onReplay: () => void,
 *   onNext: () => void
 * }} handlers
 */
export function bindModalControls(game, handlers) {
    document.getElementById('btn-levels').onclick = () => {
        openLevelSelect(game, handlers.onPickLevel);
    };

    document.getElementById('btn-close-levels').onclick = () => {
        closeLevelSelect();
    };

    document.getElementById('btn-jump-level').onclick = () => {
        const input = document.getElementById('level-jump-input');
        const val = parseInt(input.value, 10);
        if (!isNaN(val) && val >= 0 && val < CONFIG.totalLevels) {
            handlers.onPickLevel(val);
            closeLevelSelect();
            hideNextButton();
        }
    };

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
