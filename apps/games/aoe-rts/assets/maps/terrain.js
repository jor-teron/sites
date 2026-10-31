/** AOE RTS - R2b seeded terrain: hills, rock outcrops, ground variety (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order)
 *  Everything here is rebuilt from the map number (never saved). Own RNG, so resources / water stay as before. */
/** Smooth seeded value noise 0..1 (bilinear over a lattice of `cell` tiles) */
function valueNoise(x, y, cell, k) {
    const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * sx, b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
}
/** Land tiles reachable from the TC (4-dir over walkable tiles) */
function reachCount() {
    const S = MAP_SIZE, seen = new Uint8Array(S * S), st = [townCenter.y * S + townCenter.x]; seen[st[0]] = 1; let n = 1;
    while (st.length) { const i = st.pop(), x = i % S, y = (i - x) / S;
        for (let d = 0; d < 4; d++) { const nx = x + [1, -1, 0, 0][d], ny = y + [0, 0, 1, -1][d], j = ny * S + nx;
            if (isLand(nx, ny) && !seen[j]) { seen[j] = 1; n++; st.push(j); } } }
    return n;
}
function initTerrain(num) {
    const S = MAP_SIZE, cx0 = townCenter.x + 0.5, cy0 = townCenter.y + 0.5, keep = S <= 16 ? 4.6 : 11.5, area = (S * S) / (48 * 48);
    let rnd = (mapSeed(num) ^ 0x1b873593) % 2147483646 + 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5; i++) R();
    const k0 = Math.floor(R() * 1000);   // noise offset per map
    const far = (x, y, d) => Math.hypot(x - cx0, y - cy0) >= d;
    const spot = minD => { for (let t = 0; t < 40; t++) { const x = Math.floor(1 + R() * (S - 2)), y = Math.floor(1 + R() * (S - 2)); if (far(x, y, minD)) return [x, y]; } return null; };
    // HILLS: noisy blobs on land, outside the fair-start ring
    const hills = S <= 16 ? 0 : Math.round((2 + R() * 3) * area);
    for (let h = 0; h < hills; h++) { const p = spot(keep + 3); if (!p) continue;
        const rad = 2 + R() * Math.min(4, S / 14), ph = R() * 6.283, am = 0.2 + R() * 0.25;
        for (let y = Math.floor(p[1] - rad * 1.5); y <= p[1] + rad * 1.5; y++) for (let x = Math.floor(p[0] - rad * 1.5); x <= p[0] + rad * 1.5; x++) {
            if (!inMap(x, y) || !far(x, y, keep + 1) || water[y * S + x] || ford[y * S + x]) continue;
            const a = Math.atan2(y - p[1], x - p[0]), k = 1 + am * Math.sin(a * 3 + ph) + 0.15 * Math.sin(a * 5 + ph * 2);
            if (Math.hypot(x - p[0], (y - p[1]) * 1.1) <= rad * k) hill[y * S + x] = 1; } }
    // ROCK OUTCROPS: 1-5 impassable tiles on empty land, never in the fair start, never next to a ford,
    // and never allowed to cut any land off from the TC (checked with a flood after each one)
    const outcrops = S <= 16 ? 0 : Math.round((3 + R() * 4) * area);
    let reach = reachCount();
    const okRock = (x, y) => inMap(x, y) && x > 0 && y > 0 && x < S - 1 && y < S - 1 && isLand(x, y) && !mapData[y][x] && far(x, y, keep + 2)
        && ![[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(o => inMap(x + o[0], y + o[1]) && ford[(y + o[1]) * S + x + o[0]]);
    for (let o = 0; o < outcrops; o++) { const p = spot(keep + 3); if (!p) continue;
        const want = 1 + Math.floor(R() * 5), put = []; let x = p[0], y = p[1];
        for (let t = 0; t < want * 3 && put.length < want; t++) {
            if (okRock(x, y)) { rock[y * S + x] = 1; put.push(y * S + x); }
            const d = Math.floor(R() * 4); x += [1, -1, 0, 0][d]; y += [0, 0, 1, -1][d]; }
        if (!put.length) continue;
        const now = reachCount();
        if (now !== reach - put.length) put.forEach(i => { rock[i] = 0; }); else reach = now; }
    // ARQ1t MOUNTAINS: ridges of rocky peaks (impassable, mount[] + rock[]), hilly foothills round them; kept only if no land is cut off
    const ranges = S < 32 ? 0 : Math.round((1 + R() * 2) * area);
    for (let m = 0; m < ranges; m++) { const p = spot(keep + 4); if (!p) continue;
        const len = 3 + Math.floor(R() * 7), put = [], cut = []; let x = p[0], y = p[1], a = R() * 6.283;
        for (let t = 0; t < len; t++) { const r = 1 + R() * 1.1;   // ARQ1t2: thick ranges, 2-4 cells across, round a winding spine
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const qx = x + dx, qy = y + dy, j = qy * S + qx;
                if (Math.hypot(dx, dy) > r || !inMap(qx, qy) || mount[j]) continue;
                const cell = mapData[qy][qx], tree = cell && cell.kind === 'tree'; if (tree) mapData[qy][qx] = null;   // ranges swallow trees
                if (okRock(qx, qy)) { rock[j] = mount[j] = 1; put.push(j); if (tree) cut.push([qx, qy, cell]); } else if (tree) mapData[qy][qx] = cell; }
            a += (R() - 0.5) * 1.2; x = Math.round(x + Math.cos(a) * 1.5); y = Math.round(y + Math.sin(a) * 1.5); }
        const now = reachCount();
        if (now !== reach - put.length) { put.forEach(i => { rock[i] = mount[i] = 0; }); cut.forEach(t => { mapData[t[1]][t[0]] = t[2]; }); continue; }
        reach = now;
        put.forEach(i => { const px = i % S, py = (i - px) / S; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const qx = px + dx, qy = py + dy, j = qy * S + qx;
            if (inMap(qx, qy) && isLand(qx, qy) && !ford[j] && far(qx, qy, keep + 1)) hill[j] = 1; } });
    }
    // ARQ1t: reserve the farthest flat, open, reachable spot as a future AI start (cleared of resources in a radius of 2)
    const seen = landSeen(); aiStart = null;
    const cand = []; for (let y = 3; y < S - 3; y++) for (let x = 3; x < S - 3; x++) cand.push([Math.hypot(x - cx0, y - cy0), x, y]);
    cand.sort((p, q) => q[0] - p[0] || p[2] - q[2] || p[1] - q[1]);
    for (const c of cand) if (seen[c[2] * S + c[1]] && flatAt(c[1], c[2], 3)) { aiStart = { x: c[1], y: c[2] }; break; }
    if (aiStart) for (let y = aiStart.y - 2; y <= aiStart.y + 2; y++) for (let x = aiStart.x - 2; x <= aiStart.x + 2; x++) if (mapData[y][x] && mapData[y][x].kind !== 'tc' && mapData[y][x].kind !== 'fish') mapData[y][x] = null;
    // ARQ1c: third base (2nd AI): flat, reachable, farthest from both the TC and aiStart (resources cleared by initAI only when used)
    aiStart2 = null; let bd = 0;
    if (aiStart) for (const c of cand) { const d = Math.min(c[0], Math.hypot(c[1] - aiStart.x, c[2] - aiStart.y)); if (d > bd && seen[c[2] * S + c[1]] && flatAt(c[1], c[2], 3)) { bd = d; aiStart2 = { x: c[1], y: c[2] }; } }
    // GROUND: grass shades from low-frequency noise, dirt patches, sand next to water (visual only)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x;
        if (water[i]) { ground[i] = 0; continue; }
        let wet = false; for (let dy = -1; dy <= 1 && !wet; dy++) for (let dx = -1; dx <= 1; dx++) if (isWater(x + dx, y + dy)) { wet = true; break; }
        if (wet || ford[i]) { ground[i] = 4; continue; }
        const n1 = valueNoise(x, y, 7, k0) * 0.7 + valueNoise(x, y, 3, k0 + 1) * 0.3, n2 = valueNoise(x, y, 4, k0 + 2);
        ground[i] = n2 > 0.78 && far(x, y, 3) ? 3 : n1 < 0.36 ? 1 : n1 > 0.64 ? 2 : 0;
    }
}
/** ARQ1t hooks: hill test (slower walking now, combat bonus later) and flat open ground (no water/rock/hill/ford in radius r) */
function isHill(x, y) { return inMap(x, y) && hill[y * MAP_SIZE + x] === 1; }
function flatAt(x, y, r) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const qx = x + dx, qy = y + dy;
    if (dx * dx + dy * dy > r * r + 1) continue; if (!isLand(qx, qy) || isHill(qx, qy) || ford[qy * MAP_SIZE + qx]) return false; } return true; }
/** ARQ1t test hook: islands, fords per river, inland lakes, flat + reachable starts */
function mapCheck() {
    const S = MAP_SIZE, seen = landSeen(), fords = {}, rivers = {}; let land = 0, cut = 0, lakeEdge = 0, mt = 0, inner = 0, ranges = 0;
    const lab = new Uint8Array(S * S); for (let i = 0; i < S * S; i++) if (mount[i] && !lab[i]) { ranges++; const st = [i]; lab[i] = 1;   // 8-joined ranges
        while (st.length) { const k = st.pop(), kx = k % S, ky = (k - kx) / S; for (let d = 0; d < 9; d++) { const nx = kx + d % 3 - 1, ny = ky + Math.floor(d / 3) - 1, j = ny * S + nx; if (inMap(nx, ny) && mount[j] && !lab[j]) { lab[j] = 1; st.push(j); } } } }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x;
        if (isLand(x, y)) { land++; if (!seen[i]) cut++; }
        if (riv[i]) { rivers[riv[i]] = 1; if (ford[i]) fords[riv[i]] = (fords[riv[i]] || 0) + 1; }
        if (water[i] && !riv[i] && (x < 2 || y < 2 || x > S - 3 || y > S - 3)) lakeEdge++; if (mount[i]) { mt++; if ([-1, 0, 1].every(dy => [-1, 0, 1].every(dx => inMap(x + dx, y + dy) && mount[(y + dy) * S + x + dx]))) inner++; } }
    const t = townCenter;
    return { land, cut, rivers: Object.keys(rivers).length, riversNoFord: Object.keys(rivers).filter(r => !fords[r]).length, lakeEdge, mountains: mt, mountInner: inner, ranges,
        tcFlat: flatAt(t.x, t.y, 3) && flatAt(t.x + 1, t.y + 1, 3), ai: aiStart, aiFlat: !!aiStart && flatAt(aiStart.x, aiStart.y, 3), aiReach: !!aiStart && !!seen[aiStart.y * S + aiStart.x],
        aiDist: aiStart ? Math.round(Math.hypot(aiStart.x - t.x, aiStart.y - t.y)) : 0, ai2: aiStart2, ai2Flat: !!aiStart2 && flatAt(aiStart2.x, aiStart2.y, 3), ai2Reach: !!aiStart2 && !!seen[aiStart2.y * S + aiStart2.x],
        ai2Dist: aiStart2 ? Math.round(Math.min(Math.hypot(aiStart2.x - t.x, aiStart2.y - t.y), Math.hypot(aiStart2.x - aiStart.x, aiStart2.y - aiStart.y))) : 0 };
}
/** Test hook: terrain counts + checks */
function terrainReport() {
    const S = MAP_SIZE, cx0 = townCenter.x + 0.5, cy0 = townCenter.y + 0.5, keep = S <= 16 ? 4.6 : 11.5;
    const r = { rock: 0, hill: 0, ford: 0, sand: 0, dirt: 0, lush: 0, dry: 0, rockInRing: 0, rockOnRes: 0, fordOnWater: 0, rivers: 0 };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x;
        if (rock[i]) { r.rock++; if (Math.hypot(x - cx0, y - cy0) < keep + 2) r.rockInRing++; if (mapData[y][x]) r.rockOnRes++; }
        if (hill[i]) r.hill++; if (ford[i]) { r.ford++; if (water[i]) r.fordOnWater++; }
        if (!water[i]) { const g = ground[i]; if (g === 4) r.sand++; else if (g === 3) r.dirt++; else if (g === 1) r.lush++; else if (g === 2) r.dry++; } }
    return r;
}
function terrainHash() { let h = 2166136261; for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) h = Math.imul(h ^ (rock[i] | hill[i] << 1 | ford[i] << 2 | ground[i] << 3 | water[i] << 6 | mount[i] << 7), 16777619) >>> 0; return h.toString(16); }
