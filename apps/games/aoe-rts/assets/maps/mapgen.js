/** AOE RTS - map number -> seed, Town Center (fair start), map build order (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
// ============================================================================
// MAP
// ============================================================================
/** Hash the map number into an RNG seed so neighbouring numbers give very different maps */
function mapSeed(n) {
    let h = Math.imul(n + 1, 0x9E3779B1) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35) >>> 0; h ^= h >>> 16;
    return ((h >>> 0) % 2147483646) + 1;
}
function initMap(num) {
    const S = MAP_SIZE;
    mapData = [];
    for (let y = 0; y < S; y++) { mapData[y] = []; for (let x = 0; x < S; x++) mapData[y][x] = null; }
    let rnd = mapSeed(num); const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;  // seeded
    for (let i = 0; i < 5; i++) R();
    // Town Center 2x2 near the middle (seeded jitter on bigger maps)
    const jit = Math.floor(S / 10);
    const m0 = Math.floor(S / 2) - 1;
    const mx = m0 + Math.round((R() - 0.5) * 2 * jit), my = m0 + Math.round((R() - 0.5) * 2 * jit);
    townCenter = { x: mx, y: my, w: 2, h: 2 };
    for (let y = my; y < my + 2; y++) for (let x = mx; x < mx + 2; x++) mapData[y][x] = { kind: 'tc' };
    const cx0 = mx + 0.5, cy0 = my + 0.5;
    placeLandResources(S, R, cx0, cy0);   // assets/maps/resources.js
}
/** Test hook: animal placement checks */
function animalReport() {
    const S = MAP_SIZE, cx0 = townCenter.x + 0.5, cy0 = townCenter.y + 0.5, keep = animalKeep();
    let deerOnWater = 0, deerInRing = 0, fish = 0, fishBad = 0, fishInRing = 0, carcass = 0, h = 2166136261;
    deer.forEach(d => { const t = screenToTile(d.x, d.y); if (!isLand(t.x, t.y)) deerOnWater++; if (Math.hypot(t.x - cx0, t.y - cy0) < keep) deerInRing++;
        const s = t.x + ',' + t.y + (d.ant ? 'a' : ''); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; });
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = mapData[y][x]; if (!c) continue;
        if (c.kind === 'carcass') carcass++;
        if (c.kind !== 'fish') continue; fish++; h = Math.imul(h ^ (y * S + x), 16777619) >>> 0;
        if (!isWater(x, y) || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(o => isLand(x + o[0], y + o[1]))) fishBad++;
        if (Math.hypot(x - cx0, y - cy0) < keep) fishInRing++; }
    return { deer: deer.length, herds: new Set(deer.map(d => d.hx + ',' + d.hy)).size, deerOnWater, deerInRing, fish, fishBad, fishInRing, carcass, hash: h.toString(16) };
}
/** Test hook: BFS from the TC over land (8-dir, no corner cutting, same rules as A*) */
function reachReport() {
    const S = MAP_SIZE, seen = new Uint8Array(S * S), st = [townCenter.y * S + townCenter.x]; seen[st[0]] = 1;
    while (st.length) { const i = st.pop(), x = i % S, y = (i - x) / S;
        for (let k = 0; k < 8; k++) { const dx = DIRS[k][0], dy = DIRS[k][1], nx = x + dx, ny = y + dy, j = ny * S + nx;
            if (!isLand(nx, ny) || seen[j] || (dx && dy && (!isLand(x + dx, y) || !isLand(x, y + dy)))) continue; seen[j] = 1; st.push(j); } }
    let res = 0, unreach = 0, onWater = 0, land = 0, landUnreach = 0, w = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, c = mapData[y][x];
        if (water[i]) w++; else if (!rock[i]) { land++; if (!seen[i]) landUnreach++; }
        if (c && c.kind !== 'tc' && c.kind !== 'fish') { res++; if (water[i] || rock[i]) onWater++; if (!seen[i]) unreach++; }
        if (c && c.kind === 'tc' && (!seen[i] || water[i])) unreach++; }
    return { res, unreach, onWater, landUnreach, waterTiles: w, waterPct: Math.round(w / (S * S) * 1000) / 10 };
}
/** Test hook: counts of resources within 10 tiles of the TC */
function fairStartCounts() {
    const c = { tree: 0, berry: 0, gold: 0, stone: 0, berryClusters: 0 }, cx0 = townCenter.x + 0.5, cy0 = townCenter.y + 0.5, seen = {};
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) { const k = mapData[y][x]; if (!k || !(k.kind in c)) continue;
        if (Math.hypot(x - cx0, y - cy0) <= 10.5) c[k.kind]++; }
    // berry clusters = connected groups (8-neighbour) with any bush within 10 tiles
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) { const k = mapData[y][x];
        if (!k || k.kind !== 'berry' || seen[y * MAP_SIZE + x]) continue;
        const st = [[x, y]]; seen[y * MAP_SIZE + x] = 1; let near = false;
        while (st.length) { const [px, py] = st.pop(); if (Math.hypot(px - cx0, py - cy0) <= 10.5) near = true;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const qx = px + dx, qy = py + dy;
                if (inMap(qx, qy) && !seen[qy * MAP_SIZE + qx] && mapData[qy][qx] && mapData[qy][qx].kind === 'berry') { seen[qy * MAP_SIZE + qx] = 1; st.push([qx, qy]); } } }
        if (near) c.berryClusters++; }
    let tcRing = true;
    for (let y = townCenter.y - 1; y <= townCenter.y + 2; y++) for (let x = townCenter.x - 1; x <= townCenter.x + 2; x++) {
        const k = inMap(x, y) && mapData[y][x]; if (k && k.kind !== 'tc' && k.kind !== 'fish') tcRing = false; }
    c.ringClear = tcRing; return c;
}
