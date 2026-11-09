/**
 * Unblock — pointer drag on blocks (UNB-0).
 * Snaps to whole cells (same as the original Lab build).
 * Calls onMoved() after a committed move so the app can re-render / check win.
 */
/**
 * Attach pointer drag handlers to a block element.
 * @param {import('../core/game.js').Game} game
 * @param {HTMLElement} element
 * @param {string} blockId
 * @param {number} cellSize
 * @param {() => void} onMoved called after a non-zero move is applied
 */
export function attachDragHandlers(game, element, blockId, cellSize, onMoved) {
    let startX = 0, startY = 0;
    let currentDelta = 0;
    const block = game.getBlock(blockId);

    const onPointerDown = (e) => {
        e.preventDefault();
        startX = e.clientX || (e.touches && e.touches[0].clientX);
        startY = e.clientY || (e.touches && e.touches[0].clientY);
        currentDelta = 0;

        element.classList.add('dragging');
        element.setPointerCapture(e.pointerId);

        element.onpointermove = onPointerMove;
        element.onpointerup = onPointerUp;
        element.onpointercancel = onPointerUp;
    };

    const onPointerMove = (e) => {
        const clientX = e.clientX;
        const clientY = e.clientY;
        if (clientX === undefined || clientY === undefined) return;

        const dx = clientX - startX;
        const dy = clientY - startY;

        let rawDelta = 0;
        if (block.orientation === 'h') {
            rawDelta = Math.round(dx / cellSize);
            const validDelta = game.getValidDeltaRange(blockId, rawDelta);
            currentDelta = validDelta;
            element.style.transform = `translateX(${validDelta * cellSize}px)`;
        } else {
            rawDelta = Math.round(dy / cellSize);
            const validDelta = game.getValidDeltaRange(blockId, rawDelta);
            currentDelta = validDelta;
            element.style.transform = `translateY(${validDelta * cellSize}px)`;
        }
    };

    const onPointerUp = () => {
        element.classList.remove('dragging');
        element.onpointermove = null;
        element.onpointerup = null;
        element.onpointercancel = null;

        element.style.transform = '';

        if (currentDelta !== 0) {
            game.moveBlock(blockId, currentDelta);
            onMoved();
        }
    };

    element.onpointerdown = onPointerDown;
}
