/** AOE RTS - ARQ1a/ARQ1b AI (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order).
 *  Each AI owner has its own Town Center, resources and pop. Slow tick: send idle villagers to the scarcest resource, train villagers,
 *  build houses near the pop cap, farms when food runs short (or wood piles up), a Barracks, then Militia that attack in waves (AI_LEVEL). */
const AI_TICK = 0.75, AI_POP_MAX = 40, AI_VILL_MAX = 18, AI_MIX = { food: 0.45, wood: 0.3, gold: 0.17, stone: 0.08 }, AI_KIND = { food: ['carcass', 'berry', 'fish', 'farm'], wood: ['tree'], gold: ['gold'], stone: ['stone'] };
let aiT = 0;
/** Mode setup (before resumeSave): AI Town Centers + starting villagers. Vs AI: ai1 at aiStart. AI vs AI: ai1 at the player spot, ai2 at aiStart. */
function initAI() {
    townCenter.owner = MODE === 'aivai' ? 'ai1' : 'p'; tcs = [townCenter];
    const ids = MODE === 'vs' ? ['ai1'] : MODE === 'aivai' ? ['ai1', 'ai2'] : [];
    ids.forEach(id => { factions[id] = { res: Object.assign({}, START_RES), queue: 0, timer: 0 }; });
    const far = MODE === 'vs' ? 'ai1' : 'ai2';
    if (factions[far] && aiStart) { const t = { x: aiStart.x, y: aiStart.y, w: 2, h: 2, owner: far }; tcs.push(t);
        for (let y = t.y; y < t.y + 2; y++) for (let x = t.x; x < t.x + 2; x++) mapData[y][x] = { kind: 'tc', tc: t }; }
    else if (factions[far]) delete factions[far];   // no reserved spot on this map: one AI fewer
    tcs.forEach(t => { if (t.owner !== 'p') [[t.x - 1, t.y + 2], [t.x + 2, t.y - 1], [t.x + 2, t.y + 2]].forEach(p => spawnVillager(p[0], p[1], t.owner)); });
}
function updateAI(dt) {
    aiT += dt; if (aiT < AI_TICK) return; aiT = 0;
    Object.keys(factions).forEach(id => { const f = factions[id], t = tcOf(id), all = villagers.filter(v => v.owner === id), mine = all.filter(v => !v.mil); if (!t) return;
        const pop = all.length, cap = popCap(id), building = houses.find(h => h.owner === id && !h.done), rax = houses.filter(h => h.owner === id && h.type);
        f.t = (f.t || 0) + AI_TICK;
        const build = kind => { const spot = canAfford(BUILD_COST[kind], id) && aiHouseSpot(t); if (spot) placeBuilding(kind, spot.x, spot.y, id, mine.filter(v => v.state !== 'building' && v.state !== 'attack').slice(0, kind === 'farm' ? 1 : 2)); return !!spot; };
        if (!f.queue && pop < cap && mine.length < AI_VILL_MAX && f.res.food >= VILLAGER_COST.food) { pay(VILLAGER_COST, id); f.queue = 1; }
        const farms = () => { let n = 0; for (let y = Math.max(0, t.y - 12); y < Math.min(MAP_SIZE, t.y + 14); y++) for (let x = Math.max(0, t.x - 12); x < Math.min(MAP_SIZE, t.x + 14); x++) if (mapData[y][x] && mapData[y][x].kind === 'farm') n++; return n; };
        if (!building && cap - pop <= 2 && cap < AI_POP_MAX) build('house');
        else if (!building && mine.length >= 6 && rax.length < (f.res.wood > 400 ? 2 : 1)) build('barracks');
        else if ((((f.miss || {}).food || f.res.wood > 300) && f.res.food < 400 || f.res.wood > 500) && farms() < 10) build('farm');   // food short or wood piling up
        const milMax = AI_LEVEL.wave * 2 + 2 * (f.waves || 0);   // standing army limit by difficulty
        rax.forEach(b => { if (b.done && !b.queue && pop < cap && all.length - mine.length < milMax && (mine.length >= 8 || f.res.food > 150) && canAfford(MILITIA_COST, id)) { pay(MILITIA_COST, id); b.queue = 1; } });
        const army = all.filter(v => v.mil && v.state !== 'attack'), foe = MODE === 'vs' ? 'p' : id === 'ai1' ? 'ai2' : 'ai1';   // waves
        if (f.t >= (f.next || AI_LEVEL.first) && army.length >= AI_LEVEL.wave + (f.waves || 0)) {
            const tgt = tcOf(foe) || villagers.find(v => own(v) === foe) || houses.find(h => own(h) === foe);
            if (tgt) { army.forEach(v => orderAttack(v, tgt)); f.next = f.t + AI_LEVEL.every; f.waves = Math.min(6, (f.waves || 0) + 1); } }
        if (building && !mine.some(v => v.house === building)) { const v = mine.find(u => u.state === 'idle') || mine.find(u => u.state !== 'attack'); if (v) orderBuild(v, building); }
        const count = { food: 0, wood: 0, gold: 0, stone: 0 };
        mine.forEach(v => { if (v.carryType && v.state !== 'idle') count[v.carryType]++; else if (v.node && mapData[v.node.y][v.node.x]) count[RES_TYPES[mapData[v.node.y][v.node.x].kind].res]++; });
        const ratio = r => count[r] / AI_MIX[r], most = Object.keys(AI_MIX).sort((a, b) => ratio(b) - ratio(a))[0];
        const lack = Object.keys(AI_MIX).find(r => ratio(r) < ratio(most) / 2 && !(f.miss || {})[r]);
        if (lack && count[most] > 1) { const v = mine.find(u => u.state === 'gathering' && !u.carry && u.node && mapData[u.node.y][u.node.x] && RES_TYPES[mapData[u.node.y][u.node.x].kind].res === most); if (v) { v.state = 'idle'; v.node = null; count[most]--; } }   // rebalance
        f.miss = {};
        mine.filter(v => v.state === 'idle').forEach(v => {
            const want = Object.keys(AI_MIX).sort((a, b) => count[a] / AI_MIX[a] - count[b] / AI_MIX[b]);
            const near = (x, y) => Math.hypot(x - t.x, y - t.y) < 22;
            for (const r of want) { for (const k of AI_KIND[r]) { const n = findNearest(k, v); if (n && near(n.x, n.y)) { orderGather(v, n.x, n.y); count[r]++; return; } }
                const d = r === 'food' && nearestDeer(v), dt = d && screenToTile(d.x, d.y); if (d && near(dt.x, dt.y)) { orderHunt(v, d); count.food++; return; } f.miss[r] = 1; }
        });
    });
}
/** Free flat land tile 3-11 tiles from the Town Center (rings outward, seeded order) */
function aiHouseSpot(t) {
    for (let r = 3; r <= 11; r++) for (let k = 0; k < 8 * r; k++) { const a = (k / (8 * r) + hash(t.x, r, 9)) * 6.283, x = Math.round(t.x + 0.5 + Math.cos(a) * r), y = Math.round(t.y + 0.5 + Math.sin(a) * r);
        if (isLand(x, y) && !mapData[y][x] && !hill[y * MAP_SIZE + x]) return { x, y }; }
    return null;
}
