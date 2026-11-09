/**
 * Unblock — Mulberry32 PRNG (UNB-0).
 * Tiny deterministic RNG used only by levelGenerator.
 * Not the npm "seedrandom" package; kept in core/ as first-party code.
 * @param {number} seed
 * @returns {() => number} float in [0, 1)
 */
export function createRNG(seed) {
    let t = seed += 0x6D2B79F5;
    return function() {
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
