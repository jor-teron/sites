/** AOE RTS - villager and deer behaviour (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
// ============================================================================
// VILLAGERS
// ============================================================================
function spawnVillager(tx, ty, owner) {
    const p = tileCenter(tx, ty), fem = trainedCount++ % 2 === 1;   // male, female, male, ...
    const v = { fem, x: p.x, y: p.y, state: 'idle', target: null, node: null, carry: 0, carryType: null, timer: 0, selected: false, face: 1, walking: false, seed: Math.random() };
    if (owner && owner !== 'p') v.owner = owner;
    v.hp = HP.v;
    villagers.push(v);
    return v;
}
/** Nearest drop-off point (edge of Town Center facing the villager) */
function dropPoint(v) {
    const t = tcOf(own(v)) || townCenter, c = tileCenter(t.x + 0.5, t.y + 0.5);
    const dx = v.x - c.x, dy = v.y - c.y, d = Math.hypot(dx, dy) || 1;
    return { x: c.x + dx / d * 112, y: c.y + dy / d * 58 };
}
/** Iso-corrected distance (screen dy doubled, so it reads like ground distance) */
function isoDist(ax, ay, bx, by) { return Math.hypot(bx - ax, (by - ay) * 2); }
function nearestDeer(from) { let best = null, bd = Infinity; deer.forEach(d => { const k = isoDist(from.x, from.y, d.x, d.y); if (k < bd) { bd = k; best = d; } }); return best; }
function updateDeer(d, dt) {
    let near = null, nd = Infinity;
    villagers.forEach(v => { const k = isoDist(d.x, d.y, v.x, v.y); if (k < nd) { nd = k; near = v; } });
    d.cd = Math.max(0, d.cd - dt); d.moving = false;
    if (near && nd < DEER_FLEE_R && d.cd <= 0 && d.state !== 'flee') { d.state = 'flee'; d.timer = DEER_FLEE_T; d.cd = DEER_FLEE_T + DEER_FLEE_CD;
        const dx = d.x - near.x, dy = (d.y - near.y) * 2, k = Math.hypot(dx, dy) || 1; d.fx = dx / k; d.fy = dy / k / 2; }
    const tryMove = (ux, uy, dist) => { const nx = d.x + ux * dist, ny = d.y + uy * dist, t = screenToTile(nx, ny);
        if (!deerFree(t.x, t.y)) return false; d.x = nx; d.y = ny; d.moving = true; if (Math.abs(ux) > 0.05) d.face = ux > 0 ? 1 : -1; return true; };
    if (d.state === 'flee') {
        d.timer -= dt;
        const base = Math.atan2(d.fy * 2, d.fx);
        let ok = false;
        for (const o of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) { const a = base + o, ux = Math.cos(a), uy = Math.sin(a) / 2; if (tryMove(ux, uy, DEER_FLEE_SPEED * dt)) { if (o) { d.fx = ux; d.fy = uy; } ok = true; break; } }
        if (!ok || d.timer <= 0) { d.state = 'graze'; d.timer = 1 + Math.random() * 2; }
    } else if (d.state === 'walk') {
        const dx = d.gx - d.x, dy = d.gy - d.y, k = Math.hypot(dx, dy), s = DEER_SPEED * dt;
        if (k <= s || !tryMove(dx / k, dy / k, s)) { d.state = 'graze'; d.timer = 2 + Math.random() * 4; }
    } else {   // graze: stand, head down, then wander a little around the herd home
        d.timer -= dt;
        if (d.timer <= 0) {
            d.timer = 1 + Math.random() * 2;
            for (let t = 0; t < 6; t++) { const a = Math.random() * 6.283, r = 0.5 + Math.random() * 3, x = Math.round(d.hx + Math.cos(a) * r), y = Math.round(d.hy + Math.sin(a) * r);
                if (!deerFree(x, y)) continue; const p = tileCenter(x, y), gx = p.x + (Math.random() - 0.5) * 50, gy = p.y + (Math.random() - 0.5) * 20;
                if (losClear(d.x, d.y, gx, gy)) { d.gx = gx; d.gy = gy; d.state = 'walk'; break; } }
        }
    }
}
function orderMove(v, tx, ty, idx) {
    v.house = null; v.prey = null; v.foe = null;
    v.node = null; v.state = 'moving'; v.target = tileCenter(tx, ty);
    if (idx) { const a = idx * 2.4, r = 18 * Math.sqrt(idx); v.target.x += Math.cos(a) * r * 1.6; v.target.y += Math.sin(a) * r * 0.8; }
}
/** Idle villagers push apart so a stack can be clicked one by one */
function spreadIdle(dt) {
    const idle = villagers.filter(v => v.state === 'idle');
    for (let i = 0; i < idle.length; i++) for (let j = i + 1; j < idle.length; j++) {
        const a = idle[i], b = idle[j]; let dx = b.x - a.x, dy = (b.y - a.y) * 2, d = Math.hypot(dx, dy);
        if (d < 36) {
            if (d < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
            const push = Math.min(36 - d, 80 * dt) / 2, ux = dx / d, uy = dy / d / 2;
            const nudge = (u, sx) => { const nx = u.x + ux * push * sx, ny = u.y + uy * push * sx, t = screenToTile(nx, ny); if (isLand(t.x, t.y)) { u.x = nx; u.y = ny; } };
            nudge(a, -1); nudge(b, 1);
        }
    }
}
function updateVillager(v, dt) {
    switch (v.state) {
        case 'attack': fight(v, dt); break;   // ARQ1b
        case 'moving':
            if (stepTo(v, v.target, dt, 4)) v.state = 'idle';
            break;
        case 'toNode': {
            const cell = v.node && mapData[v.node.y][v.node.x];
            if (!cell || cell.amount <= 0) { if (!(cell && cell.kind === 'berry' && !otherBerry(v))) { retarget(v); break; } }
            if (stepTo(v, v.target, dt, 30)) { v.state = 'gathering'; v.timer = 0; }
            break;
        }
        case 'gathering': {
            const cell = mapData[v.node.y][v.node.x];
            if (!cell || cell.amount <= 0) {
                if (v.carry > 0) goDrop(v);
                else if (cell && cell.kind === 'berry' && !otherBerry(v)) v.timer = 0;   // wait for regrowth
                else retarget(v);
                break;
            }
            v.timer += dt;
            const iv = RES_TYPES[cell.kind].rate || GATHER_INTERVAL;   // carcass / fish gather faster than berries
            while (v.timer >= iv && v.carry < CARRY_MAX && cell.amount > 0) {
                v.timer -= iv;
                cell.amount--; v.carry++; v.carryType = RES_TYPES[cell.kind].res;
                Sfx.play(cell.kind === 'tree' ? 'chop' : (cell.kind === 'gold' || cell.kind === 'stone') ? 'mine' : 'gather', 0.3);
                { const np = tileCenter(v.node.x, v.node.y); if (Math.abs(np.x - v.x) > 1) v.face = np.x > v.x ? 1 : -1; }
                if (cell.amount <= 0) { v.lastKind = cell.kind; if (cell.kind !== 'berry') mapData[v.node.y][v.node.x] = null; }
            }
            if (v.carry >= CARRY_MAX) goDrop(v);
            break;
        }
        case 'toHunt': {
            const d = v.prey;
            if (!d || d.dead) { v.prey = null; retarget(v); break; }
            if (isoDist(v.x, v.y, d.x, d.y) <= HUNT_R && losClear(v.x, v.y, d.x, d.y)) { v.state = 'hunting'; v.timer = 0; v.route = null; break; }
            stepTo(v, { x: d.x, y: d.y }, dt, 20);
            break;
        }
        case 'hunting': {
            const d = v.prey;
            if (!d || d.dead) { v.prey = null; retarget(v); break; }
            if (Math.abs(d.x - v.x) > 1) v.face = d.x > v.x ? 1 : -1;
            if (isoDist(v.x, v.y, d.x, d.y) > HUNT_R + 80) { v.state = 'toHunt'; break; }
            v.timer += dt;
            if (v.timer >= HUNT_AIM) {
                d.dead = true; deer = deer.filter(o => o !== d); Sfx.play('hunt');
                const c = placeCarcass(d.x, d.y); v.prey = null; v.lastKind = 'carcass';
                if (c) orderGather(v, c.x, c.y); else retarget(v);
            }
            break;
        }
        case 'toBuild': {
            const h = v.house;
            if (!h || h.done) { v.state = 'idle'; v.house = null; break; }
            if (stepTo(v, v.target, dt, 30)) v.state = 'building';
            break;
        }
        case 'building': {
            const h = v.house;
            if (!h || h.done) { v.state = 'idle'; v.house = null; break; }
            h.progress += dt / (h.type ? BARRACKS_BUILD_TIME : HOUSE_BUILD_TIME);
            Sfx.play('hammer', 0.45);
            if (h.progress >= 1) { h.progress = 1; h.done = true; v.state = 'idle'; v.house = null; Sfx.play('built'); }
            break;
        }
        case 'returning':
            if (stepTo(v, dropPoint(v), dt, 6)) {
                resOf(own(v))[v.carryType] += v.carry; Sfx.play('drop', 0.15);
                v.carry = 0;
                const cell = v.node && mapData[v.node.y][v.node.x];
                if (cell && (cell.amount > 0 || (cell.kind === 'berry' && !otherBerry(v)))) { v.state = 'toNode'; v.target = tileCenter(v.node.x, v.node.y); }
                else retarget(v);
            }
            break;
    }
}
