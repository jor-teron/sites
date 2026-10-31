/** AOE RTS - seeded ponds and lakes (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
function isWater(x, y) { return inMap(x, y) && water[y * MAP_SIZE + x] === 1; }
function isLand(x, y) { if (!inMap(x, y)) return false; const i = y * MAP_SIZE + x; return water[i] === 0 && rock[i] === 0; }   // walkable
/** Seeded ponds / lakes (own RNG so land layouts stay as in R1). Keeps the TC area dry, then floods
 *  any land not connected to the TC so every tile and resource stays reachable. */
function initWater(num) {
    const S = MAP_SIZE; water = new Uint8Array(S * S); rock = new Uint8Array(S * S); hill = new Uint8Array(S * S); ford = new Uint8Array(S * S); mount = new Uint8Array(S * S); riv = new Uint8Array(S * S); ground = new Uint8Array(S * S);
    let rnd = (mapSeed(num) ^ 0x5bd1e995) % 2147483646 + 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5; i++) R();
    const cx0 = townCenter.x + 0.5, cy0 = townCenter.y + 0.5, keep = S <= 16 ? 4.6 : 11.5;
    const lake = (lx, ly, rad) => {
        const ph = [R() * 6.283, R() * 6.283, R() * 6.283], am = [0.25 + R() * 0.2, 0.12 + R() * 0.12, 0.08];
        for (let y = Math.floor(ly - rad * 1.6); y <= ly + rad * 1.6; y++) for (let x = Math.floor(lx - rad * 1.6); x <= lx + rad * 1.6; x++) {
            if (x < 2 || y < 2 || x > S - 3 || y > S - 3 || Math.hypot(x - cx0, y - cy0) < keep) continue;   // ARQ1t: lakes stay inland
            const a = Math.atan2(y - ly, x - lx), k = 1 + am[0] * Math.sin(a * 2 + ph[0]) + am[1] * Math.sin(a * 3 + ph[1]) + am[2] * Math.sin(a * 5 + ph[2]);
            if (Math.hypot(x - lx, y - ly) <= rad * k) water[y * S + x] = 1;
        }
    };
    const spot = (minD) => { for (let t = 0; t < 40; t++) { const x = 1 + R() * (S - 2), y = 1 + R() * (S - 2); if (Math.hypot(x - cx0, y - cy0) >= minD) return [x, y]; } return null; };
    if (S <= 16) { if (R() < 0.5) { const p = spot(5.5); if (p) lake(p[0], p[1], 0.9); } }
    else if (S <= 32) { const n = 1 + Math.floor(R() * 2); for (let i = 0; i < n; i++) { const p = spot(keep + 2); if (p) lake(p[0], p[1], 0.8 + R() * 0.7); } }
    else {
        const target = S * S * (0.05 + 0.10 * Math.min(1, (S - 48) / 48)) * (0.6 + R() * 0.4);
        let tries = 0, cnt = () => water.reduce((a, b) => a + b, 0);
        while (cnt() < target && tries++ < 12) { const p = spot(keep + 3); if (p) lake(p[0], p[1], 2 + R() * Math.min(9, S / 9)); }
        const ponds = Math.floor(R() * 3); for (let i = 0; i < ponds; i++) { const p = spot(keep + 2); if (p) lake(p[0], p[1], 0.8 + R() * 0.6); }
    }
    carveRivers(num, cx0, cy0, keep);   // R2b: assets/maps/rivers.js (own RNG, so lakes stay as in R2a)
    connectLand();   // ARQ1t: no islands - pockets cut off by water get a ford instead of being flooded
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (water[y * S + x] && mapData[y][x] && mapData[y][x].kind !== 'tc') mapData[y][x] = null;
}
/** ARQ1t: flood land from the TC (4-dir); while some land is not reached, turn the shortest water path from the
 *  reached area to it into a ford (BFS through water, deterministic tile order). Returns fords added. */
function landSeen() {
    const S = MAP_SIZE, seen = new Uint8Array(S * S), st = [townCenter.y * S + townCenter.x]; seen[st[0]] = 1;
    while (st.length) { const i = st.pop(), x = i % S, y = (i - x) / S;
        for (let d = 0; d < 4; d++) { const nx = x + [1, -1, 0, 0][d], ny = y + [0, 0, 1, -1][d], j = ny * S + nx;
            if (isLand(nx, ny) && !seen[j]) { seen[j] = 1; st.push(j); } } }
    return seen;
}
function connectLand() {
    const S = MAP_SIZE; let added = 0;
    for (let guard = 0; guard < 64; guard++) {
        const seen = landSeen(), from = new Int32Array(S * S).fill(-2), q = [];
        for (let i = 0; i < S * S; i++) if (seen[i]) { from[i] = -1; q.push(i); }
        let hit = -1;
        for (let h = 0; h < q.length && hit < 0; h++) { const i = q[h], x = i % S, y = (i - x) / S;
            for (let d = 0; d < 4; d++) { const nx = x + [1, -1, 0, 0][d], ny = y + [0, 0, 1, -1][d], j = ny * S + nx;
                if (!inMap(nx, ny) || from[j] !== -2 || rock[j]) continue; from[j] = i;
                if (!water[j]) { hit = j; break; } q.push(j); } }
        if (hit < 0) break;
        for (let i = from[hit]; i >= 0 && !seen[i]; i = from[i]) { water[i] = 0; ford[i] = 1; added++; const x = i % S, y = (i - x) / S; if (mapData[y][x] && mapData[y][x].kind !== 'tc') mapData[y][x] = null; }
    }
    return added;
}
