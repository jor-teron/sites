import { CONFIG } from './config.js';
import { generateLevel } from './levelGenerator.js';
import { GameLogic } from './gameLogic.js';
import { Storage } from './storage.js';

class StateManager {
    constructor() {
        this.progress = Storage.loadProgress();
        this.currentLevelNum = this.progress.currentLevel || 0;
        this.loadCurrentLevel();
        this.initUI();
    }

    loadCurrentLevel() {
        const blocks = generateLevel(this.currentLevelNum);
        this.game = new GameLogic(blocks);
        this.render();
    }

    setLevel(levelNum) {
        if (levelNum < 0 || levelNum >= CONFIG.totalLevels) return;
        this.currentLevelNum = levelNum;
        this.loadCurrentLevel();
    }

    render() {
        // HUD
        document.getElementById('current-level-num').textContent = String(this.currentLevelNum).padStart(3, '0');
        document.getElementById('move-count').textContent = this.game.moveCount;
        document.getElementById('btn-undo').disabled = this.game.history.length === 0;

        // Board
        const boardEl = document.getElementById('game-board');
        boardEl.innerHTML = '';

        const size = CONFIG.gridSize;
        const boardWidth = boardEl.clientWidth || 360;
        const cellSize = boardWidth / size;

        for (const block of this.game.blocks) {
            const blockEl = document.createElement('div');
            blockEl.className = `block ${block.isPlayer ? 'player' : `${block.orientation}-block-${block.length}`}`;
            
            // Positioning & dimensions
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
            this.attachDragHandlers(blockEl, block.id, cellSize);
            boardEl.appendChild(blockEl);
        }
    }

    attachDragHandlers(element, blockId, cellSize) {
        let startX = 0, startY = 0;
        let currentDelta = 0;
        const block = this.game.getBlock(blockId);

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
                const validDelta = this.game.getValidDeltaRange(blockId, rawDelta);
                currentDelta = validDelta;
                element.style.transform = `translateX(${validDelta * cellSize}px)`;
            } else {
                rawDelta = Math.round(dy / cellSize);
                const validDelta = this.game.getValidDeltaRange(blockId, rawDelta);
                currentDelta = validDelta;
                element.style.transform = `translateY(${validDelta * cellSize}px)`;
            }
        };

        const onPointerUp = (e) => {
            element.classList.remove('dragging');
            element.onpointermove = null;
            element.onpointerup = null;
            element.onpointercancel = null;

            element.style.transform = '';

            if (currentDelta !== 0) {
                this.game.moveBlock(blockId, currentDelta);
                this.render();

                if (this.game.isWon()) {
                    this.handleVictory();
                }
            }
        };

        element.onpointerdown = onPointerDown;
    }

    handleVictory() {
        Storage.completeLevel(this.currentLevelNum, this.game.moveCount);
        
        document.getElementById('vic-level').textContent = String(this.currentLevelNum).padStart(3, '0');
        document.getElementById('vic-moves').textContent = this.game.moveCount;
        document.getElementById('modal-victory').style.display = 'flex';
        document.getElementById('btn-next').style.display = 'inline-flex';
    }

    initUI() {
        // Buttons
        document.getElementById('btn-restart').onclick = () => {
            this.loadCurrentLevel();
            document.getElementById('btn-next').style.display = 'none';
        };

        document.getElementById('btn-undo').onclick = () => {
            if (this.game.undo()) {
                this.render();
                document.getElementById('btn-next').style.display = 'none';
            }
        };

        document.getElementById('btn-hint').onclick = () => {
            alert("Hint: Clear intersecting blocks by sliding them up/down or left/right to free the red hero block!");
        };

        document.getElementById('btn-next').onclick = () => {
            document.getElementById('modal-victory').style.display = 'none';
            this.setLevel(this.currentLevelNum + 1);
            document.getElementById('btn-next').style.display = 'none';
        };

        // Level Select Modal
        const modalLevels = document.getElementById('modal-levels');
        document.getElementById('btn-levels').onclick = () => {
            this.renderLevelGrid();
            modalLevels.style.display = 'flex';
        };

        document.getElementById('btn-close-levels').onclick = () => {
            modalLevels.style.display = 'none';
        };

        document.getElementById('btn-jump-level').onclick = () => {
            const input = document.getElementById('level-jump-input');
            const val = parseInt(input.value, 10);
            if (!isNaN(val) && val >= 0 && val < CONFIG.totalLevels) {
                this.setLevel(val);
                modalLevels.style.display = 'none';
                document.getElementById('btn-next').style.display = 'none';
            }
        };

        // Victory Modal Buttons
        document.getElementById('btn-vic-replay').onclick = () => {
            document.getElementById('modal-victory').style.display = 'none';
            this.loadCurrentLevel();
        };

        document.getElementById('btn-vic-next').onclick = () => {
            document.getElementById('modal-victory').style.display = 'none';
            this.setLevel(this.currentLevelNum + 1);
            document.getElementById('btn-next').style.display = 'none';
        };

        // Window resize handler to readjust board rendering
        window.onresize = () => this.render();
    }

    renderLevelGrid() {
        const gridEl = document.getElementById('level-grid');
        gridEl.innerHTML = '';
        this.progress = Storage.loadProgress();

        // Render first 100 levels for easy browsing, or all if scrolled
        for (let i = 0; i < CONFIG.totalLevels; i++) {
            const cell = document.createElement('div');
            cell.className = 'level-cell';
            if (i === this.currentLevelNum) cell.classList.add('current');
            else if (this.progress.completedLevels[i] !== undefined) cell.classList.add('completed');
            
            cell.textContent = i;
            cell.onclick = () => {
                this.setLevel(i);
                document.getElementById('modal-levels').style.display = 'none';
                document.getElementById('btn-next').style.display = 'none';
            };
            gridEl.appendChild(cell);
        }
    }
}

// Start app on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    window.app = new StateManager();
});
