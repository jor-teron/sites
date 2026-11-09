/**
 * Unblock — board drawing (UNB-4).
 * cellSize from live board width after layout.sizeBoard(); themes decorate blocks.
 */
import { CONFIG } from '../core/config.js';
import { clearHintHighlight } from './hint.js';
import { sizeBoard } from './layout.js';
import { decorateBlock } from './themes/registry.js';

/**
 * @param {import('../core/game.js').Game} game
 * @param {(el: HTMLElement, blockId: string, cellSize: number) => void} onAttachDrag
 * @returns {number} cellSize in px
 */
export function renderBoard(game, onAttachDrag) {
    clearHintHighlight();
    sizeBoard();

    const boardEl = document.getElementById('game-board');
    boardEl.innerHTML = '';

    const size = CONFIG.gridSize;
    const boardWidth = boardEl.clientWidth || 360;
    const cellSize = boardWidth / size;

    for (const block of game.blocks) {
        const blockEl = document.createElement('div');
        blockEl.className = `block ${block.isPlayer ? 'player' : `${block.orientation}-block-${block.length}`}`;

        blockEl.style.left = `${block.x * cellSize}px`;
        blockEl.style.top = `${block.y * cellSize}px`;

        if (block.orientation === 'h') {
            blockEl.style.width = `${block.length * cellSize}px`;
            blockEl.style.height = `${cellSize}px`;
        } else {
            blockEl.style.width = `${cellSize}px`;
            blockEl.style.height = `${block.length * cellSize}px`;
        }

        blockEl.dataset.id = block.id;
        decorateBlock(blockEl, block);
        onAttachDrag(blockEl, block.id, cellSize);
        boardEl.appendChild(blockEl);
    }

    return cellSize;
}
