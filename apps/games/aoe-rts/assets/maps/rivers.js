/** AOE RTS - R2b seeded rivers with shallow fords (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
/** Chance that a map of size S has a river (map 00 / 16x16 never does) */
function riverChance(S) { return S <= 16 ? 0 : S <= 32 ? 0.3 : S <= 48 ? 0.5 : S <= 64 ? 0.65 : 0.8; }
/** Carve 0-2 meandering rivers edge to edge (called from initWater before the cut-off flood).
 *  Rivers skip the dry ring round the TC; fords (walkable shallow tiles, ford[] = 1) cross them every 9-15 tiles. */
function carveRivers(num, cx0, cy0, keep) {
    const S = MAP_SIZE; if (S <= 16) return 0;
    let rnd = (mapSeed(num) ^ 0x27d4eb2f) % 2147483646 + 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5; i++) R();
    let n = R() < riverChance(S) ? 1 : 0;
    if (n && S >= 80 && R() < 0.35) n = 2;
    const lake = water.slice();   // ponds / lakes before rivers
    for (let r = 0; r < n; r++) {
        const alongX = R() < 0.5, width = S >= 80 ? 2 + (R() < 0.5 ? 1 : 0) : S >= 48 ? 2 : 1;
        const tcA = alongX ? cx0 : cy0, tcB = alongX ? cy0 : cx0;
        // start offset across the map, away from the TC line so the river does not just hug the town
        let c = S * (0.15 + R() * 0.7); if (Math.abs(c - tcB) < keep) c = tcB + (c < tcB ? -1 : 1) * (keep + 2 + R() * 4);
        c = Math.max(3, Math.min(S - 4, c));
        let drift = (R() - 0.5) * 0.6; const centre = [];
        for (let a = 0; a < S; a++) {
            centre.push(c);
            drift += (R() - 0.5) * 0.3; drift = Math.max(-0.7, Math.min(0.7, drift));
            if (c + drift < 2 || c + drift > S - 3) drift = -drift * 0.5;
            c += drift;
        }
        const cells = a => { const out = [], lo = Math.round(centre[a] - (width - 1) / 2);
            for (let k = 0; k < width; k++) { const b = lo + k, x = alongX ? a : b, y = alongX ? b : a;
                if (inMap(x, y) && Math.hypot(x - cx0, y - cy0) >= keep) out.push(y * S + x); }
            // a 1-tile sideways step leaves only a diagonal gap, which walkers cannot cut (no corner cutting)
            return out; };
        // fords: 2 tiles long along the river, every 9-15 tiles, never inside a lake
        const fordAt = new Uint8Array(S); let next = 3 + Math.floor(R() * 6);
        while (next < S - 2) { const span = [next, next + 1];
            if (span.every(a => cells(a).every(i => !lake[i]))) { fordAt[next] = fordAt[next + 1] = 1; next += 9 + Math.floor(R() * 7); } else next += 2; }
        for (let a = 0; a < S; a++) cells(a).forEach(i => {
            if (!lake[i]) riv[i] = r + 1;   // ARQ1t: river id (for the ford check)
            if (fordAt[a] && !lake[i]) { if (!water[i]) ford[i] = 1; }
            else { water[i] = 1; ford[i] = 0; }
        });
    }
    // fords are open ground: clear any resource on them (trees etc. would hide the crossing)
    for (let i = 0; i < S * S; i++) if (ford[i]) { const x = i % S, y = (i - x) / S; if (water[i]) ford[i] = 0; else if (mapData[y][x] && mapData[y][x].kind !== 'tc') mapData[y][x] = null; }
    return n;
}
