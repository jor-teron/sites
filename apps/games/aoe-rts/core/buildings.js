/** AOE RTS - Town Center training (alternates male / female), houses (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
function orderBuild(v, h) {
    v.prey = null; v.node = null; v.house = h; v.state = 'toBuild';
    const p = tileCenter(h.x, h.y); v.target = { x: p.x + (Math.random() - 0.5) * 60, y: p.y + 34 };
}
/** Spawn a trained villager on a free tile around the Town Center */
function spawnFromTC() {
    const t = townCenter, ring = [];
    for (let y = t.y - 1; y <= t.y + t.h; y++) for (let x = t.x - 1; x <= t.x + t.w; x++)
        if (isLand(x, y) && !mapData[y][x]) ring.push({ x, y });
    const spot = ring[Math.floor(Math.random() * ring.length)] || { x: t.x + 2, y: t.y + 2 };
    spawnVillager(spot.x, spot.y);
    Sfx.play('train');
}
function placeHouse(t0) {
    const builders = villagers.filter(u => u.selected);
    if (!isLand(t0.x, t0.y) || mapData[t0.y][t0.x] || !builders.length || !canAfford(HOUSE_COST)) { flash('Can\'t build there'); Sfx.play('error'); return; }
    placing = null;
    pay(HOUSE_COST);
    const h = { x: t0.x, y: t0.y, progress: 0, done: false };
    houses.push(h); mapData[t0.y][t0.x] = { kind: 'house', house: h };
    builders.forEach(u => orderBuild(u, h));
}

/** Town Center training queue (one villager at a time, needs free population) */
function updateTraining(dt) {
    if (trainQueue > 0 && popCount() < popCap()) {
        trainTimer += dt;
        if (trainTimer >= TRAIN_TIME) { trainTimer = 0; trainQueue--; spawnFromTC(); }
    }
}
