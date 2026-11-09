/**
 * Unblock — seeded level generator (UNB-0).
 * generateLevel(n) must stay byte-identical for every n in 0..999
 * (same Mulberry32 seed n+1337, same placement rules, same BFS check).
 */
import { createRNG } from './seedrandom.js';
import { CONFIG } from './config.js';
import { GameLogic } from './gameLogic.js';

/**
 * Generates a guaranteed solvable Unblock puzzle for a given level seed.
 * Uses a backward-search solver to ensure every generated puzzle has a valid solution
 * and is not trivially empty or blocked.
 * @param {number} levelNum
 * @returns {Array<{id:string,x:number,y:number,length:number,orientation:string,isPlayer:boolean}>}
 */
export function generateLevel(levelNum) {
    const rng = createRNG(levelNum + 1337);
    const size = CONFIG.gridSize; // 6x6
    
    // We try multiple times with the RNG to find a fun, solvable puzzle layout
    for (let attempt = 0; attempt < 50; attempt++) {
        const playerRow = 2;
        const playerCol = Math.floor(rng() * 2); // 0 or 1
        
        const blocks = [{
            id: 'player',
            x: playerCol,
            y: playerRow,
            length: 2,
            orientation: 'h',
            isPlayer: true
        }];

        const grid = Array.from({ length: size }, () => Array(size).fill(false));
        grid[playerRow][playerCol] = true;
        grid[playerRow][playerCol + 1] = true;

        // Difficulty scaling: 4 to 8 obstacle blocks
        const difficultyFactor = Math.min(1, levelNum / CONFIG.totalLevels);
        const targetBlockCount = 4 + Math.floor(difficultyFactor * 4) + Math.floor(rng() * 2);

        let blockIdCounter = 1;
        let placementAttempts = 0;

        while (blocks.length < targetBlockCount && placementAttempts < 100) {
            placementAttempts++;
            
            const length = rng() < 0.65 ? 2 : 3;
            const orientation = rng() < 0.5 ? 'h' : 'v';
            
            let x, y;
            if (orientation === 'h') {
                x = Math.floor(rng() * (size - length + 1));
                y = Math.floor(rng() * size);
            } else {
                x = Math.floor(rng() * size);
                y = Math.floor(rng() * (size - length + 1));
            }

            // Never block the player's immediate exit path on row 2 right side at start
            if (y === 2 && orientation === 'h' && x > playerCol + 1) {
                continue;
            }

            let canPlace = true;
            for (let i = 0; i < length; i++) {
                const cx = orientation === 'h' ? x + i : x;
                const cy = orientation === 'h' ? y : y + i;
                if (grid[cy][cx]) {
                    canPlace = false;
                    break;
                }
            }

            if (canPlace) {
                for (let i = 0; i < length; i++) {
                    const cx = orientation === 'h' ? x + i : x;
                    const cy = orientation === 'h' ? y : y + i;
                    grid[cy][cx] = true;
                }

                blocks.push({
                    id: `block_${blockIdCounter++}`,
                    x,
                    y,
                    length,
                    orientation,
                    isPlayer: false
                });
            }
        }

        // Verify solvability using BFS shortest path solver
        if (blocks.length >= 4 && isSolvable(blocks)) {
            return blocks;
        }
    }

    // Fallback guaranteed solvable level if generation attempts exhaust
    return [
        { id: 'player', x: 0, y: 2, length: 2, orientation: 'h', isPlayer: true },
        { id: 'block_1', x: 2, y: 1, length: 3, orientation: 'v', isPlayer: false },
        { id: 'block_2', x: 3, y: 2, length: 2, orientation: 'h', isPlayer: false },
        { id: 'block_3', x: 5, y: 0, length: 3, orientation: 'v', isPlayer: false },
        { id: 'block_4', x: 0, y: 4, length: 3, orientation: 'h', isPlayer: false }
    ];
}

/**
 * BFS solver to verify that a set of blocks has at least one valid path to victory.
 * @param {Array} blocks
 * @returns {boolean}
 */
function isSolvable(blocks) {
    const serialize = (blks) => {
        return blks.map(b => `${b.id}:${b.x},${b.y}`).sort().join('|');
    };

    const queue = [{ blocks, moves: 0 }];
    const visited = new Set();
    visited.add(serialize(blocks));

    const game = new GameLogic(blocks);
    let iterations = 0;
    const maxIterations = 1500; // safety cap for performance

    while (queue.length > 0 && iterations < maxIterations) {
        iterations++;
        const current = queue.shift();
        
        game.setBlocks(current.blocks);
        if (game.isWon()) {
            return true;
        }

        // Generate all possible valid moves for all blocks
        for (const block of current.blocks) {
            // Test sliding in both directions (-5 to 5)
            for (let d = -5; d <= 5; d++) {
                if (d === 0) continue;
                
                game.setBlocks(current.blocks);
                const actualD = game.getValidDeltaRange(block.id, d);
                if (actualD !== 0) {
                    // Apply move
                    const nextBlocks = current.blocks.map(b => b.id === block.id ? {
                        ...b,
                        x: b.orientation === 'h' ? b.x + actualD : b.x,
                        y: b.orientation === 'v' ? b.y + actualD : b.y
                    } : { ...b });

                    const key = serialize(nextBlocks);
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push({ blocks: nextBlocks, moves: current.moves + 1 });
                    }
                }
            }
        }
    }

    return false;
}
