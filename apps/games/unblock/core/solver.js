/**
 * Unblock — BFS solver (UNB-1).
 * One slide of any distance = 1 move (matches GameLogic.moveBlock).
 * Used offline by tools/gen-levels.mjs and in-browser for hints.
 */
import { CONFIG } from './config.js';
import { GameLogic } from './gameLogic.js';

/**
 * Compact state key from block positions (ids + coords).
 * @param {Array<{id:string,x:number,y:number}>} blocks
 * @returns {string}
 */
export function serializeBlocks(blocks) {
    return blocks.map(b => `${b.id}:${b.x},${b.y}`).sort().join('|');
}

/**
 * Layout fingerprint for uniqueness (ignores ids except player).
 * @param {Array} blocks
 * @returns {string}
 */
export function layoutKey(blocks) {
    const player = blocks.find(b => b.isPlayer || b.id === 'player');
    const others = blocks
        .filter(b => b !== player)
        .map(b => `${b.orientation}${b.length}@${b.x},${b.y}`)
        .sort();
    return `P${player.x},${player.y}|${others.join(';')}`;
}

/**
 * Stars from move count vs par.
 * 3 ≤ par, 2 ≤ ceil(par×1.5), else 1.
 * @param {number} moves
 * @param {number} par
 * @returns {1|2|3}
 */
export function starsFor(moves, par) {
    if (moves <= par) return 3;
    if (moves <= Math.ceil(par * 1.5)) return 2;
    return 1;
}

/**
 * BFS shortest solution.
 * @param {Array} blocks initial layout (deep-cloned internally)
 * @param {{ maxNodes?: number, timeLimitMs?: number }} [opts]
 * @returns {{ solvable: boolean, moves: number, path: Array<{id:string,delta:number}>, nodes: number }}
 */
export function solve(blocks, opts = {}) {
    const maxNodes = opts.maxNodes ?? 200000;
    const timeLimitMs = opts.timeLimitMs ?? 0;
    const t0 = timeLimitMs ? Date.now() : 0;

    const start = blocks.map(b => ({ ...b }));
    const game = new GameLogic(start);
    if (game.isWon()) {
        return { solvable: true, moves: 0, path: [], nodes: 0 };
    }

    const startKey = serializeBlocks(start);
    const queue = [start];
    /** @type {Map<string, { prev: string|null, move: {id:string,delta:number}|null }>} */
    const came = new Map();
    came.set(startKey, { prev: null, move: null });

    let nodes = 0;
    let head = 0;

    while (head < queue.length && nodes < maxNodes) {
        if (timeLimitMs && (Date.now() - t0) > timeLimitMs) break;

        const current = queue[head++];
        nodes++;
        game.setBlocks(current);

        // Enumerate every legal single-slide landing for every block
        for (const block of current) {
            for (const dir of [-1, 1]) {
                // Probe max extent in this direction
                const extent = game.getValidDeltaRange(block.id, dir * (CONFIG.gridSize + 1));
                if (extent === 0) continue;

                const step = extent > 0 ? 1 : -1;
                for (let d = step; step > 0 ? d <= extent : d >= extent; d += step) {
                    // Confirm (should match extent walk)
                    game.setBlocks(current);
                    const actual = game.getValidDeltaRange(block.id, d);
                    if (actual !== d) break;

                    const next = current.map(b => {
                        if (b.id !== block.id) return { ...b };
                        return {
                            ...b,
                            x: b.orientation === 'h' ? b.x + actual : b.x,
                            y: b.orientation === 'v' ? b.y + actual : b.y
                        };
                    });
                    const key = serializeBlocks(next);
                    if (came.has(key)) continue;
                    came.set(key, { prev: serializeBlocks(current), move: { id: block.id, delta: actual } });

                    game.setBlocks(next);
                    if (game.isWon()) {
                        // Reconstruct path
                        const path = [];
                        let k = key;
                        while (came.get(k).move) {
                            const info = came.get(k);
                            path.push(info.move);
                            k = info.prev;
                        }
                        path.reverse();
                        return { solvable: true, moves: path.length, path, nodes };
                    }
                    queue.push(next);
                }
            }
        }
    }

    return { solvable: false, moves: -1, path: [], nodes };
}

/**
 * First optimal hint move from the current position, or null.
 * @param {Array} blocks
 * @param {{ timeLimitMs?: number }} [opts]
 * @returns {{ id: string, delta: number, movesLeft: number }|null}
 */
export function hintMove(blocks, opts = {}) {
    const result = solve(blocks, { maxNodes: 150000, timeLimitMs: opts.timeLimitMs ?? 800 });
    if (!result.solvable || result.path.length === 0) return null;
    const first = result.path[0];
    return { id: first.id, delta: first.delta, movesLeft: result.moves };
}
