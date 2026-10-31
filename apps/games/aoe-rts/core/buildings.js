/** AOE RTS - Town Center training (alternates male / female), houses (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
function orderBuild(v, h) {
    v.prey = null; v.node = null; v.house = h; v.state = 'toBuild';
    const p = tileCenter(h.x, h.y); v.target = { x: p.x + (Math.random() - 0.5) * 60, y: p.y + 34 };
}
/** Spawn a trained villager on a free tile around the Town Center */
function spawnFromTC(t, mil) {
    const ring = [], w = t.w || 1, h = t.h || 1;
    for (let y = t.y - 1; y <= t.y + h; y++) for (let x = t.x - 1; x <= t.x + w; x++)
        if (isLand(x, y) && !mapData[y][x]) ring.push({ x, y });
    const spot = ring[Math.floor(Math.random() * ring.length)] || { x: t.x + 2, y: t.y + 2 };
    const v = spawnVillager(spot.x, spot.y, t.owner);
    if (mil) { v.mil = true; v.fem = false; v.hp = HP.mil; }   // ARQ1b Militia (from a Barracks)
    Sfx.play('train');
}
const BUILD_COST = { house: HOUSE_COST, barracks: BARRACKS_COST, farm: FARM_COST };
/** Place a House / Barracks (built by villagers over time) or a Farm (ready at once, gathered like berries) for owner o */
function placeBuilding(kind, x, y, o, builders) {
    pay(BUILD_COST[kind], o);
    if (kind === 'farm') { mapData[y][x] = { kind: 'farm', amount: RES_TYPES.farm.amount, max: RES_TYPES.farm.amount }; builders.forEach(u => orderGather(u, x, y)); return; }
    const h = { x, y, progress: 0, done: false }; if (o && o !== 'p') h.owner = o; if (kind === 'barracks') Object.assign(h, { type: 'barracks', queue: 0, timer: 0 });
    houses.push(h); mapData[y][x] = { kind: 'house', house: h };
    builders.forEach(u => orderBuild(u, h));
}
function placeHouse(t0) {
    const builders = villagers.filter(u => u.selected && !u.mil);
    if (!isLand(t0.x, t0.y) || mapData[t0.y][t0.x] || !builders.length || !canAfford(BUILD_COST[placing])) { flash('Can\'t build there'); Sfx.play('error'); return; }
    const kind = placing; placing = null;
    placeBuilding(kind, t0.x, t0.y, 'p', builders);
}

/** Town Center training queue (one villager at a time, needs free population) */
function updateTraining(dt) {
    if (townCenter.owner === 'p' && !townCenter.dead && trainQueue > 0 && popCount() < popCap()) {
        trainTimer += dt;
        if (trainTimer >= TRAIN_TIME) { trainTimer = 0; trainQueue--; spawnFromTC(townCenter); }
    }
    Object.keys(factions).forEach(id => { const f = factions[id], t = tcOf(id);   // ARQ1a: AI queues
        if (t && f.queue > 0 && popCount(id) < popCap(id) && (f.timer += dt) >= TRAIN_TIME * AI_LEVEL.train) { f.timer = 0; f.queue--; spawnFromTC(t); } });
    houses.forEach(b => { const o = own(b), k = o === 'p' ? 1 : AI_LEVEL.train;   // ARQ1b: Barracks train Militia
        if (b.type && b.done && b.queue > 0 && popCount(o) < popCap(o) && (b.timer += dt) >= MILITIA_TIME * k) { b.timer = 0; b.queue--; spawnFromTC(b, true); } });
}
