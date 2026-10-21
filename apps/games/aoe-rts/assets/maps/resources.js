/** AOE RTS - seeded resource placement: forests, gold, stone, berries, deer, fish (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
/** Land resources around the fair start (uses the map RNG R from initMap, so layouts are unchanged) */
function placeLandResources(S, R, cx0, cy0) {
    const clear = S <= 16 ? 2.6 : 4;     // TC footprint + walk ring stays empty
    const far = (x, y) => Math.hypot(x - cx0, y - cy0);
    const place = (kind, cx, cy, amt) => {
        cx = Math.round(cx); cy = Math.round(cy);
        if (!inMap(cx, cy) || mapData[cy][cx]) return false;
        if (Math.abs(cx - cx0) < clear && Math.abs(cy - cy0) < clear) return false;
        const a = amt || RES_TYPES[kind].amount;
        mapData[cy][cx] = { kind, amount: a, max: a };
        return true;
    };
    const blob = (kind, cx, cy, r, n, amt) => { let k = 0; for (let i = 0; i < n; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * r; if (place(kind, cx + Math.cos(a) * d, cy + Math.sin(a) * d, amt)) k++; } return k; };
    /** Random-walk wood line: a ribbon of trees, 1-2 tiles thick */
    const walkLine = (cx, cy, len) => { let a = R() * 6.283; for (let i = 0; i < len; i++) {
        place('tree', cx, cy); if (R() < 0.6) place('tree', cx + (R() < 0.5 ? 1 : 0), cy + (R() < 0.5 ? 1 : 0));
        a += (R() - 0.5) * 0.9; cx += Math.cos(a); cy += Math.sin(a); } };
    const ring = (dMin, dMax) => { const a = R() * 6.283, d = dMin + R() * (dMax - dMin); return [cx0 + Math.cos(a) * d, cy0 + Math.sin(a) * d]; };
    const area = (S * S) / (48 * 48);
    if (S <= 16) {
        // Demo map: a minimal fair set around the TC
        blob('gold', cx0 + 5, cy0 + 1, 0.8, 3); blob('stone', cx0 - 5, cy0 + 1, 0.8, 3);
        blob('berry', cx0 - 4, cy0 + 4, 1, 4); blob('berry', cx0 + 4, cy0 + 5, 1, 4);
        walkLine(cx0 - 5, cy0 - 6, 9); blob('tree', cx0 + 5, cy0 - 5, 1.6, 10);
    } else {
        // Home: a wood line, two berry clusters, a gold and a stone pile (6-10 tiles out)
        const home = R() * 6.283, at = (k, d) => [cx0 + Math.cos(home + k * 1.257) * d, cy0 + Math.sin(home + k * 1.257) * d];
        { const p = at(0, 7 + R() * 2); blob('tree', p[0], p[1], 2.2, 26); walkLine(p[0], p[1], 8); }
        { const p = at(1, 6 + R() * 2); blob('berry', p[0], p[1], 1.3, 6); }
        { const p = at(2, 7 + R() * 2); blob('gold', p[0], p[1], 1.1, 5); }
        { const p = at(3, 6 + R() * 2); blob('berry', p[0], p[1], 1.3, 6); }
        { const p = at(4, 7 + R() * 2); blob('stone', p[0], p[1], 1.1, 4); }
        // Groves: clustered forests (blob + ragged walks), count scales with area
        const groves = Math.round(9 * area);
        for (let i = 0; i < groves; i++) { const p = ring(10, S * 0.75); blob('tree', p[0], p[1], 2 + R() * 3, 16 + R() * 28);
            if (R() < 0.6) walkLine(p[0], p[1], 6 + R() * 10); }
        const lines = Math.round(5 * area);
        for (let i = 0; i < lines; i++) { const p = ring(11, S * 0.75); walkLine(p[0], p[1], 10 + R() * 16); }
        // Ragged forest edges along the map border
        for (let i = 0; i < S * 4; i++) { const e = Math.floor(R() * 4), t = R() * S, d = R() * R() * 4;
            place('tree', e === 0 ? t : e === 1 ? d : e === 2 ? t : S - 1 - d, e === 0 ? d : e === 1 ? t : e === 2 ? S - 1 - d : t); }
        // Outer fields: richer the farther out they are
        const fields = Math.max(3, Math.round(4 * area));
        for (let i = 0; i < fields; i++) {
            ['gold', 'stone', 'berry'].forEach((kind, j) => { if (kind === 'berry' && R() < 0.4) return;
                const p = ring(12, S * 0.7), rich = 1 + Math.min(1, Math.max(0, (far(p[0], p[1]) - 12) / (S * 0.5)));
                blob(kind, p[0], p[1], 1.3 + rich * 0.4, Math.round(4 + rich * 2), kind === 'berry' ? 0 : Math.round(RES_TYPES[kind].amount * rich)); });
        }
    }
}
// ---------------------------------------------------------------------------
// ANIMALS (R2c): seeded deer herds + fish spots. Own RNG so land/water layouts stay as in R2a.
// ---------------------------------------------------------------------------
function animalKeep() { return MAP_SIZE <= 16 ? 4.6 : 11.5; }   // fair-start ring (same as the dry ring around the TC)
function deerFree(x, y) { const c = isLand(x, y) && mapData[y][x]; return isLand(x, y) && !(c && (c.kind === 'tc' || c.kind === 'house')); }
function initAnimals(num) {
    const S = MAP_SIZE; deer = [];
    let rnd = (mapSeed(num) ^ 0x2c1b3c6d) % 2147483646 + 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5; i++) R();
    const cx0 = townCenter.x + 0.5, cy0 = townCenter.y + 0.5, keep = animalKeep();
    const okTile = (x, y) => deerFree(x, y) && !mapData[y][x] && Math.hypot(x - cx0, y - cy0) >= keep + 0.5;
    // DEER: herds of 2-5 (map 00: one small herd or a single deer), count scales with map area
    const herds = S <= 16 ? 1 : Math.max(1, Math.round(3 * S * S / (48 * 48)));
    for (let h = 0; h < herds; h++) {
        let home = null;
        for (let t = 0; t < 60 && !home; t++) { const x = Math.floor(1 + R() * (S - 2)), y = Math.floor(1 + R() * (S - 2));
            if (okTile(x, y) && !deer.some(d => Math.hypot(d.hx - x, d.hy - y) < 6)) home = { x, y }; }
        if (!home) continue;
        const n = S <= 16 ? 1 + Math.floor(R() * 2) : 2 + Math.floor(R() * 4);
        for (let i = 0, k = 0; i < n && k < 30; k++) {
            const x = home.x + Math.round((R() - 0.5) * 4), y = home.y + Math.round((R() - 0.5) * 4);
            if (!inMap(x, y) || !okTile(x, y)) continue;
            const p = tileCenter(x, y), jx = (R() - 0.5) * 40, jy = (R() - 0.5) * 16, t = screenToTile(p.x + jx, p.y + jy);
            const ok = t.x === x && t.y === y;
            deer.push({ x: p.x + (ok ? jx : 0), y: p.y + (ok ? jy : 0), hx: home.x, hy: home.y, ant: R() < 0.4, state: 'graze', timer: 1 + R() * 4, gx: 0, gy: 0, face: R() < 0.5 ? 1 : -1, seed: R(), cd: 0 });
            i++;
        }
    }
    // FISH: a few spots on shore-adjacent water tiles of lakes/ponds with >= 5 tiles
    const seen = new Uint8Array(S * S);
    for (let i0 = 0; i0 < S * S; i0++) {
        if (!water[i0] || seen[i0]) continue;
        const comp = [], st = [i0]; seen[i0] = 1;
        while (st.length) { const i = st.pop(), x = i % S, y = (i - x) / S; comp.push(i);
            for (let d = 0; d < 4; d++) { const nx = x + [1, -1, 0, 0][d], ny = y + [0, 0, 1, -1][d], j = ny * S + nx;
                if (inMap(nx, ny) && water[j] && !seen[j]) { seen[j] = 1; st.push(j); } } }
        if (comp.length < 5) continue;
        const shore = comp.filter(i => { const x = i % S, y = (i - x) / S; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(o => isLand(x + o[0], y + o[1])); });
        const want = Math.min(4, 1 + Math.floor(comp.length / 30)), got = [];
        for (let t = 0; t < 40 && got.length < want && shore.length; t++) {
            const i = shore[Math.floor(R() * shore.length)], x = i % S, y = (i - x) / S;
            if (mapData[y][x] || got.some(g => Math.hypot(g[0] - x, g[1] - y) < 3.5)) continue;
            mapData[y][x] = { kind: 'fish', amount: RES_TYPES.fish.amount, max: RES_TYPES.fish.amount }; got.push([x, y]);
        }
    }
}
