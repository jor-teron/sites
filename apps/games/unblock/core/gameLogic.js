/**
 * Unblock — pure board rules (UNB-1).
 * No DOM. Holds block positions, collision grid, move/undo, win check, slide limits.
 * Player (red) wins when on row 2 and its right edge reaches column gridSize.
 * One slide of any distance = 1 move.
 */
import { CONFIG } from './config.js';

export class GameLogic {
    /**
     * @param {Array<{id:string,x:number,y:number,length:number,orientation:string,isPlayer:boolean}>} blocks
     */
    constructor(blocks) {
        this.setBlocks(blocks);
        this.moveCount = 0;
        this.history = []; // Array of board snapshots for undo
    }

    /** @param {Array} blocks */
    setBlocks(blocks) {
        this.blocks = blocks.map(b => ({ ...b }));
        this.updateGrid();
    }

    /** Rebuild occupancy grid from this.blocks. */
    updateGrid() {
        const size = CONFIG.gridSize;
        this.grid = Array.from({ length: size }, () => Array(size).fill(null));

        for (const block of this.blocks) {
            for (let i = 0; i < block.length; i++) {
                const cx = block.orientation === 'h' ? block.x + i : block.x;
                const cy = block.orientation === 'h' ? block.y : block.y + i;
                // Skip cells that have already slid past the board (player exiting)
                if (cy < 0 || cy >= size || cx < 0 || cx >= size) continue;
                this.grid[cy][cx] = block.id;
            }
        }
    }

    /** @param {string} id */
    getBlock(id) {
        return this.blocks.find(b => b.id === id);
    }

    /**
     * Integer cell slide limits for smooth drag clamping.
     * @param {string} blockId
     * @returns {{ min: number, max: number }}
     */
    getSlideLimits(blockId) {
        const min = this.getValidDeltaRange(blockId, -(CONFIG.gridSize + 1));
        const max = this.getValidDeltaRange(blockId, CONFIG.gridSize + 1);
        return { min, max };
    }

    /**
     * Calculates valid movement range (clamped delta) for a block in its orientation.
     * @param {string} blockId
     * @param {number} delta requested cells (+ right/down, - left/up)
     * @returns {number} allowed delta (may be 0)
     */
    getValidDeltaRange(blockId, delta) {
        const block = this.getBlock(blockId);
        if (!block) return 0;

        const size = CONFIG.gridSize;
        let allowedDelta = 0;

        if (block.orientation === 'h') {
            if (delta > 0) {
                for (let step = 1; step <= delta; step++) {
                    const targetX = block.x + block.length - 1 + step;
                    if (targetX >= size) {
                        if (block.isPlayer && block.y === 2) {
                            // Cap exit slide so the block can fully leave the board
                            if (block.x + step > size) break;
                            allowedDelta = step;
                            continue;
                        } else {
                            break;
                        }
                    }
                    if (this.grid[block.y][targetX] !== null) break;
                    allowedDelta = step;
                }
            } else if (delta < 0) {
                for (let step = 1; step <= Math.abs(delta); step++) {
                    const targetX = block.x - step;
                    if (targetX < 0) break;
                    if (this.grid[block.y][targetX] !== null) break;
                    allowedDelta = -step;
                }
            }
        } else {
            if (delta > 0) {
                for (let step = 1; step <= delta; step++) {
                    const targetY = block.y + block.length - 1 + step;
                    if (targetY >= size) break;
                    if (this.grid[targetY][block.x] !== null) break;
                    allowedDelta = step;
                }
            } else if (delta < 0) {
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

    /**
     * Apply a move if valid; pushes undo snapshot.
     * @param {string} blockId
     * @param {number} delta
     * @returns {boolean}
     */
    moveBlock(blockId, delta) {
        const actualDelta = this.getValidDeltaRange(blockId, delta);
        if (actualDelta === 0) return false;

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

    /** @returns {boolean} */
    undo() {
        if (this.history.length === 0) return false;
        this.blocks = this.history.pop();
        this.moveCount = Math.max(0, this.moveCount - 1);
        this.updateGrid();
        return true;
    }

    /** @returns {boolean} */
    isWon() {
        const player = this.getBlock('player');
        if (!player) return false;
        return player.y === 2 && (player.x + player.length >= CONFIG.gridSize);
    }
}
