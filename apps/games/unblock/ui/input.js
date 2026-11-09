/**
 * Unblock — smooth pointer drag (UNB-1).
 * Block follows the finger continuously, clamped to free range, then snaps to
 * the nearest cell with a short ease on release. Pointer Events for mouse+touch.
 */
import { CONFIG } from '../core/config.js';

/**
 * @param {import('../core/game.js').Game} game
 * @param {HTMLElement} element
 * @param {string} blockId
 * @param {number} cellSize
 * @param {() => void} onMoved
 */
export function attachDragHandlers(game, element, blockId, cellSize, onMoved) {
    let startX = 0, startY = 0;
    let pixelDelta = 0;
    const block = game.getBlock(blockId);

    const onPointerDown = (e) => {
        e.preventDefault();
        startX = e.clientX;
        startY = e.clientY;
        pixelDelta = 0;

        element.classList.add('dragging');
        element.style.transition = 'none';
        element.setPointerCapture(e.pointerId);

        element.onpointermove = onPointerMove;
        element.onpointerup = onPointerUp;
        element.onpointercancel = onPointerUp;
    };

    const onPointerMove = (e) => {
        if (e.clientX === undefined) return;
        const { min, max } = game.getSlideLimits(blockId);
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const raw = block.orientation === 'h' ? dx : dy;
        const minPx = min * cellSize;
        const maxPx = max * cellSize;
        pixelDelta = Math.max(minPx, Math.min(maxPx, raw));

        if (block.orientation === 'h') {
            element.style.transform = `translateX(${pixelDelta}px)`;
        } else {
            element.style.transform = `translateY(${pixelDelta}px)`;
        }
    };

    const onPointerUp = () => {
        element.classList.remove('dragging');
        element.onpointermove = null;
        element.onpointerup = null;
        element.onpointercancel = null;

        const { min, max } = game.getSlideLimits(blockId);
        let cellDelta = Math.round(pixelDelta / cellSize);
        cellDelta = Math.max(min, Math.min(max, cellDelta));
        const snapPx = cellDelta * cellSize;

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            element.style.transition = '';
            element.style.transform = '';
            if (cellDelta !== 0) {
                game.moveBlock(blockId, cellDelta);
                onMoved();
            }
        };

        if (Math.abs(pixelDelta - snapPx) < 0.5) {
            finish();
            return;
        }

        element.style.transition = `transform ${CONFIG.snapMs}ms ease-out`;
        if (block.orientation === 'h') {
            element.style.transform = `translateX(${snapPx}px)`;
        } else {
            element.style.transform = `translateY(${snapPx}px)`;
        }
        const done = () => {
            element.removeEventListener('transitionend', done);
            finish();
        };
        element.addEventListener('transitionend', done);
        setTimeout(done, CONFIG.snapMs + 40);
    };

    element.onpointerdown = onPointerDown;
}
