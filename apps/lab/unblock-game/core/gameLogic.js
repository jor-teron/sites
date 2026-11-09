import { CONFIG } from './config.js';

export class GameLogic {
    constructor(blocks) {
        this.setBlocks(blocks);
        this.moveCount = 0;
        this.history = []; // Array of board snapshots for undo
    }

    setBlocks(blocks) {
        // Deep clone blocks
        this.blocks = blocks.map(b => ({ ...b }));
        this.updateGrid();
    }

    updateGrid() {
        const size = CONFIG.gridSize;
        this.grid = Array.from({ length: size }, () => Array(size).fill(null));
        
        for (const block of this.blocks) {
            for (let i = 0; i < block.length; i++) {
                const cx = block.orientation === 'h' ? block.x + i : block.x;
                const cy = block.orientation === 'h' ? block.y : block.y + i;
                this.grid[cy][cx] = block.id;
            }
        }
    }

    getBlock(id) {
        return this.blocks.find(b => b.id === id);
    }

    /**
     * Calculates valid movement range (minDelta, maxDelta) for a block in its orientation.
     */
    getValidDeltaRange(blockId, delta) {
        const block = this.getBlock(blockId);
        if (!block) return 0;

        const size = CONFIG.gridSize;
        let allowedDelta = 0;

        if (block.orientation === 'h') {
            if (delta > 0) {
                // Moving right
                for (let step = 1; step <= delta; step++) {
                    const targetX = block.x + block.length - 1 + step;
                    // Check right wall / exit (player can exit at x >= size - 2 if on row 2)
                    if (targetX >= size) {
                        if (block.isPlayer && block.y === 2) {
                            allowedDelta = step; // Can slide out/win
                            continue;
                        } else {
                            break;
                        }
                    }
                    if (this.grid[block.y][targetX] !== null) break;
                    allowedDelta = step;
                }
            } else if (delta < 0) {
                // Moving left
                for (let step = 1; step <= Math.abs(delta); step++) {
                    const targetX = block.x - step;
                    if (targetX < 0) break;
                    if (this.grid[block.y][targetX] !== null) break;
                    allowedDelta = -step;
                }
            }
        } else {
            // Vertical orientation
            if (delta > 0) {
                // Moving down
                for (let step = 1; step <= delta; step++) {
                    const targetY = block.y + block.length - 1 + step;
                    if (targetY >= size) break;
                    if (this.grid[targetY][block.x] !== null) break;
                    allowedDelta = step;
                }
            } else if (delta < 0) {
                // Moving up
                for (let step = 1; step <= Math.abs(delta); step++) {
                    const targetY = block.y - step;
                    if (targetY < 0) break;
                    if (this.grid[targetY][block.x] !== null) break;
                    allowedDelta = -step;
                }
            }
        }

        return allowedDelta;
    }

    moveBlock(blockId, delta) {
        const actualDelta = this.getValidDeltaRange(blockId, delta);
        if (actualDelta === 0) return false;

        // Save state for undo before applying move
        this.history.push(this.blocks.map(b => ({ ...b })));

        const block = this.getBlock(blockId);
        if (block.orientation === 'h') {
            block.x += actualDelta;
        } else {
            block.y += actualDelta;
        }

        this.moveCount++;
        this.updateGrid();
        return true;
    }

    undo() {
        if (this.history.length === 0) return false;
        this.blocks = this.history.pop();
        this.moveCount = Math.max(0, this.moveCount - 1);
        this.updateGrid();
        return true;
    }

    isWon() {
        const player = this.getBlock('player');
        if (!player) return false;
        // Player wins if its right edge reaches or exceeds the rightmost column (index 5 in 6x6)
        return player.y === 2 && (player.x + player.length >= CONFIG.gridSize);
    }
}
