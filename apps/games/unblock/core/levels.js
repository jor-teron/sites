/**
 * Unblock — load precomputed levels from assets/levels.json (UNB-1).
 * Replaces the old runtime generateLevel() path.
 */
import { CONFIG } from './config.js';

/** @type {{ version:number, seed:number, levels: Array<{par:number, blocks:Array}> }|null} */
let data = null;

/**
 * Expand compact block records to GameLogic shape.
 * @param {Array} compact
 */
export function expandBlocks(compact) {
    return compact.map(b => ({
        id: b.id,
        x: b.x,
        y: b.y,
        length: b.len,
        orientation: b.o,
        isPlayer: !!b.p
    }));
}

/** Fetch and cache levels.json (call once at boot). */
export async function loadLevels() {
    if (data) return data;
    const res = await fetch(CONFIG.levelsUrl);
    if (!res.ok) throw new Error(`Failed to load ${CONFIG.levelsUrl}: ${res.status}`);
    data = await res.json();
    if (!data.levels || data.levels.length !== CONFIG.totalLevels) {
        throw new Error(`Expected ${CONFIG.totalLevels} levels, got ${data.levels?.length}`);
    }
    return data;
}

/**
 * @param {number} levelNum
 * @returns {{ par: number, blocks: Array }}
 */
export function getLevel(levelNum) {
    if (!data) throw new Error('levels not loaded');
    const entry = data.levels[levelNum];
    if (!entry) throw new Error(`Missing level ${levelNum}`);
    return { par: entry.par, blocks: expandBlocks(entry.blocks) };
}

export function levelsReady() {
    return !!data;
}
