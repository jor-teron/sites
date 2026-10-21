/** AOE RTS - gathering: wood, food, gold, stone, hunting, fishing (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
function orderGather(v, tx, ty) {
    const cell = mapData[ty][tx];
    if (v.carry > 0 && v.carryType !== RES_TYPES[cell.kind].res) { v.carry = 0; } // drop other type
    v.house = null; v.prey = null;
    v.node = { x: tx, y: ty };
    v.state = 'toNode';
    v.target = tileCenter(tx, ty);
}
/** R2c: walk within throwing range of a deer, then spear it (it becomes a carcass) */
function orderHunt(v, d) {
    if (v.carry > 0 && v.carryType !== 'food') v.carry = 0;
    v.house = null; v.node = null; v.prey = d; v.state = 'toHunt'; v.route = null; v.lastKind = 'carcass';
}
/** Carcass goes on the deer's tile, or the nearest free land tile */
function placeCarcass(px, py) {
    const t = screenToTile(px, py);
    for (let r = 0; r < 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = t.x + dx, y = t.y + dy;
        if (isLand(x, y) && !mapData[y][x]) { mapData[y][x] = { kind: 'carcass', amount: RES_TYPES.carcass.amount, max: RES_TYPES.carcass.amount }; return { x, y }; } }
    return null;
}
/** Find nearest node of the same kind to continue gathering */
function findNearest(kind, from) {
    let best = null, bd = Infinity;
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
        const c = mapData[y][x];
        if (c && c.kind === kind && c.amount > 0) {
            const p = tileCenter(x, y), d = Math.hypot(p.x - from.x, p.y - from.y);
            if (d < bd) { bd = d; best = { x, y }; }
        }
    }
    return best;
}
function goDrop(v) {
    const cell = v.node && mapData[v.node.y][v.node.x];
    if (cell) v.lastKind = cell.kind;
    v.state = 'returning';
}
/** Another berry bush with food (not the villager's current one)? */
function otherBerry(v) { const n = findNearest('berry', v); return n && !(v.node && n.x === v.node.x && n.y === v.node.y) ? n : null; }
/** Berry bushes are never removed; every bush slowly regrows to its max (frame-rate independent) */
let berryT = 0;
function regrowBerries(dt) {
    berryT += dt; if (berryT < BERRY_REGROW) return;
    const n = Math.floor(berryT / BERRY_REGROW); berryT -= n * BERRY_REGROW;
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) { const c = mapData[y][x]; if (c && c.kind === 'berry' && c.amount < c.max) c.amount = Math.min(c.max, c.amount + n); }
}
/** Node is gone: move on to the nearest node of the same kind, or go idle */
function retarget(v) {
    const kind = v.lastKind || (v.node && mapData[v.node.y][v.node.x] && mapData[v.node.y][v.node.x].kind);
    let next = kind && findNearest(kind, v);
    // R2c food fall-backs: carcass -> nearest deer -> berries; fish -> berries
    if (!next && kind === 'carcass') { const d = nearestDeer(v); if (d) { orderHunt(v, d); return; } }
    if (!next && (kind === 'carcass' || kind === 'fish')) next = findNearest('berry', v);
    if (next) orderGather(v, next.x, next.y);
    else if (v.carry > 0) v.state = 'returning';
    else { v.state = 'idle'; v.node = null; }
}
