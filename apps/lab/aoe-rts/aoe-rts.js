/**
 * AOE RTS - Tiny Slice Isometric Game (Phaser 3)
 * R4: command bar (big touch buttons with costs), Town Center trains villagers (queue + progress),
 *     population cap raised by Houses that villagers build over time.
 * R3: Town Center drop-off, villagers gather over time (carry 10) and walk back,
 *     resources deplete gradually, trees / berries / gold / stone, 4-resource HUD.
 */

// ============================================================================
// CONSTANTS
// ============================================================================
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_SIZE = 14;
const ORIGIN_X = 480;             // screen x of tile (0,0) top corner
const ORIGIN_Y = 90;              // screen y of tile (0,0) top corner
const VILLAGER_SPEED = 70;        // px / s
const CARRY_MAX = 10;
const GATHER_INTERVAL = 0.6;      // seconds per 1 unit gathered
const START_RES = { wood: 200, food: 200, gold: 100, stone: 200 };
const START_VILLAGERS = 3;
const VILLAGER_COST = { food: 50 };
const TRAIN_TIME = 6;             // seconds per villager
const QUEUE_MAX = 5;
const HOUSE_COST = { wood: 25 };
const HOUSE_BUILD_TIME = 8;       // seconds for one villager
const POP_BASE = 5;               // Town Center supports 5
const POP_PER_HOUSE = 5;

/** Resource node definitions */
const RES_TYPES = {
    tree:  { res: 'wood',  amount: 100, color: 0x1f4d1f, label: 'Wood'  },
    berry: { res: 'food',  amount: 125, color: 0xc0306a, label: 'Food'  },
    gold:  { res: 'gold',  amount: 400, color: 0xe8c33a, label: 'Gold'  },
    stone: { res: 'stone', amount: 350, color: 0x9a9a9a, label: 'Stone' }
};
const CARRY_COLORS = { wood: 0x8b5a2b, food: 0xc0306a, gold: 0xe8c33a, stone: 0xbbbbbb };

// ============================================================================
// GAME CONFIG
// ============================================================================
const config = {
    type: Phaser.AUTO,
    width: 960,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#2d4a2d',
    fps: { target: 30, limit: 30 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: { create: create, update: update }
};
const game = new Phaser.Game(config);

// ============================================================================
// STATE
// ============================================================================
const resources = Object.assign({}, START_RES);
/** mapData[y][x] = null | { kind, amount, max } ; town center tiles = { kind:'tc' } */
let mapData = [];
let villagers = [];
let townCenter = null;   // { x, y, w, h } tile rect (top-left tile)
let gfx = null;
let hudText = null;
let infoText = null;
let trainQueue = 0;      // villagers queued at the Town Center
let trainTimer = 0;      // seconds into the current villager
let placing = null;      // 'house' while waiting for a tile tap
let houses = [];         // { x, y, progress, done }

function popCount() { return villagers.length; }
function popCap() { return POP_BASE + POP_PER_HOUSE * houses.filter(h => h.done).length; }
function canAfford(cost) { return Object.keys(cost).every(k => resources[k] >= cost[k]); }
function pay(cost) { Object.keys(cost).forEach(k => resources[k] -= cost[k]); }
function refund(cost) { Object.keys(cost).forEach(k => resources[k] += cost[k]); }
function costText(cost) { return Object.keys(cost).map(k => cost[k] + ' ' + k).join(', '); }

// ============================================================================
// COORDINATES
// ============================================================================
/** Tile (cx,cy) -> screen position of the tile CENTRE */
function tileCenter(cx, cy) {
    return {
        x: ORIGIN_X + (cx - cy) * (TILE_WIDTH / 2),
        y: ORIGIN_Y + (cx + cy) * (TILE_HEIGHT / 2) + TILE_HEIGHT / 2
    };
}
/** Screen position -> tile under it (uses tile centre, so taps anywhere inside a diamond work) */
function screenToTile(px, py) {
    const lx = (px - ORIGIN_X) / (TILE_WIDTH / 2);
    const ly = (py - ORIGIN_Y - TILE_HEIGHT / 2) / (TILE_HEIGHT / 2);
    return { x: Math.round((lx + ly) / 2), y: Math.round((ly - lx) / 2) };
}
function inMap(x, y) { return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE; }

// ============================================================================
// MAP
// ============================================================================
function initMap() {
    mapData = [];
    for (let y = 0; y < MAP_SIZE; y++) { mapData[y] = []; for (let x = 0; x < MAP_SIZE; x++) mapData[y][x] = null; }
    // Town Center 2x2 in the middle
    townCenter = { x: 6, y: 6, w: 2, h: 2 };
    for (let y = 6; y < 8; y++) for (let x = 6; x < 8; x++) mapData[y][x] = { kind: 'tc' };

    const place = (kind, cx, cy) => {
        if (!inMap(cx, cy) || mapData[cy][cx]) return;
        if (Math.abs(cx - 6.5) < 2.2 && Math.abs(cy - 6.5) < 2.2) return; // keep TC area clear
        const a = RES_TYPES[kind].amount;
        mapData[cy][cx] = { kind, amount: a, max: a };
    };
    // Forest patches
    for (let i = 0; i < 26; i++) place('tree', Math.floor(Math.random() * MAP_SIZE), Math.floor(Math.random() * 4));
    for (let i = 0; i < 14; i++) place('tree', Math.floor(Math.random() * 3), Math.floor(Math.random() * MAP_SIZE));
    // Berry bushes cluster near TC
    [[3, 9], [4, 9], [3, 10], [4, 10]].forEach(p => place('berry', p[0], p[1]));
    // Gold and stone
    [[11, 9], [12, 9], [11, 10]].forEach(p => place('gold', p[0], p[1]));
    [[9, 12], [10, 12], [9, 13]].forEach(p => place('stone', p[0], p[1]));
}

// ============================================================================
// VILLAGERS
// ============================================================================
function spawnVillager(tx, ty) {
    const p = tileCenter(tx, ty);
    const v = { x: p.x, y: p.y, state: 'idle', target: null, node: null, carry: 0, carryType: null, timer: 0, selected: false };
    villagers.push(v);
    return v;
}
/** Nearest drop-off point (edge of Town Center facing the villager) */
function dropPoint(v) {
    const c = tileCenter(townCenter.x + 0.5, townCenter.y + 0.5);
    const dx = v.x - c.x, dy = v.y - c.y, d = Math.hypot(dx, dy) || 1;
    return { x: c.x + dx / d * 44, y: c.y + dy / d * 24 };
}
function orderGather(v, tx, ty) {
    const cell = mapData[ty][tx];
    if (v.carry > 0 && v.carryType !== RES_TYPES[cell.kind].res) { v.carry = 0; } // drop other type
    v.house = null;
    v.node = { x: tx, y: ty };
    v.state = 'toNode';
    v.target = tileCenter(tx, ty);
}
function orderBuild(v, h) {
    v.node = null; v.house = h; v.state = 'toBuild';
    const p = tileCenter(h.x, h.y); v.target = { x: p.x, y: p.y + 6 };
}
function orderMove(v, tx, ty) {
    v.house = null;
    v.node = null; v.state = 'moving'; v.target = tileCenter(tx, ty);
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
/** Move toward target, returns true when arrived */
function stepTo(v, t, dt, stopDist) {
    const dx = t.x - v.x, dy = t.y - v.y, d = Math.hypot(dx, dy);
    if (d <= stopDist) return true;
    const s = Math.min(d, VILLAGER_SPEED * dt);
    v.x += dx / d * s; v.y += dy / d * s;
    return false;
}
function updateVillager(v, dt) {
    switch (v.state) {
        case 'moving':
            if (stepTo(v, v.target, dt, 2)) v.state = 'idle';
            break;
        case 'toNode': {
            const cell = v.node && mapData[v.node.y][v.node.x];
            if (!cell || cell.amount <= 0) { retarget(v); break; }
            if (stepTo(v, v.target, dt, 14)) { v.state = 'gathering'; v.timer = 0; }
            break;
        }
        case 'gathering': {
            const cell = mapData[v.node.y][v.node.x];
            if (!cell || cell.amount <= 0) { if (v.carry > 0) goDrop(v); else retarget(v); break; }
            v.timer += dt;
            while (v.timer >= GATHER_INTERVAL && v.carry < CARRY_MAX && cell.amount > 0) {
                v.timer -= GATHER_INTERVAL;
                cell.amount--; v.carry++; v.carryType = RES_TYPES[cell.kind].res;
                if (cell.amount <= 0) { v.lastKind = cell.kind; mapData[v.node.y][v.node.x] = null; }
            }
            if (v.carry >= CARRY_MAX) goDrop(v);
            break;
        }
        case 'toBuild': {
            const h = v.house;
            if (!h || h.done) { v.state = 'idle'; v.house = null; break; }
            if (stepTo(v, v.target, dt, 14)) v.state = 'building';
            break;
        }
        case 'building': {
            const h = v.house;
            if (!h || h.done) { v.state = 'idle'; v.house = null; break; }
            h.progress += dt / HOUSE_BUILD_TIME;
            if (h.progress >= 1) { h.progress = 1; h.done = true; v.state = 'idle'; v.house = null; }
            break;
        }
        case 'returning':
            if (stepTo(v, dropPoint(v), dt, 3)) {
                resources[v.carryType] += v.carry;
                v.carry = 0;
                const cell = v.node && mapData[v.node.y][v.node.x];
                if (cell && cell.amount > 0) { v.state = 'toNode'; v.target = tileCenter(v.node.x, v.node.y); }
                else retarget(v);
            }
            break;
    }
}
function goDrop(v) {
    const cell = v.node && mapData[v.node.y][v.node.x];
    if (cell) v.lastKind = cell.kind;
    v.state = 'returning';
}
/** Node is gone: move on to the nearest node of the same kind, or go idle */
function retarget(v) {
    const kind = v.lastKind || (v.node && mapData[v.node.y][v.node.x] && mapData[v.node.y][v.node.x].kind);
    const next = kind && findNearest(kind, v);
    if (next) orderGather(v, next.x, next.y);
    else if (v.carry > 0) v.state = 'returning';
    else { v.state = 'idle'; v.node = null; }
}

// ============================================================================
// SCENE
// ============================================================================
function create() {
    initMap();
    gfx = this.add.graphics();
    const c = townCenter;
    [[c.x - 1, c.y + 2], [c.x + 2, c.y - 1], [c.x + 2, c.y + 2]].slice(0, START_VILLAGERS).forEach(p => spawnVillager(p[0], p[1]));

    hudText = this.add.text(10, 10, '', {
        fontSize: '18px', fill: '#ffffff', backgroundColor: '#000000aa', padding: { x: 10, y: 6 }
    }).setDepth(100);
    infoText = this.add.text(10, 46, 'Tap villagers to select, tap a resource to gather. Tap the Town Center to train.', {
        fontSize: '13px', fill: '#dddddd', backgroundColor: '#00000066', padding: { x: 6, y: 3 }
    }).setDepth(100);

    this.input.on('pointerdown', onPointerDown, this);
}

function update(time, delta) {
    const dt = Math.min(delta, 100) / 1000;
    villagers.forEach(v => updateVillager(v, dt));
    if (trainQueue > 0 && popCount() < popCap()) {
        trainTimer += dt;
        if (trainTimer >= TRAIN_TIME) { trainTimer = 0; trainQueue--; spawnFromTC(); }
    }
    hudText.setText(`Wood ${resources.wood}   Food ${resources.food}   Gold ${resources.gold}   Stone ${resources.stone}   Pop ${popCount()}/${popCap()}`);
    updateBar();
    render();
}

// ============================================================================
// RENDER
// ============================================================================
function diamond(g, cx, cy, color, alpha) {
    const p = tileCenter(cx, cy), hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    g.fillStyle(color, alpha == null ? 1 : alpha);
    g.beginPath();
    g.moveTo(p.x, p.y - hh); g.lineTo(p.x + hw, p.y); g.lineTo(p.x, p.y + hh); g.lineTo(p.x - hw, p.y);
    g.closePath(); g.fillPath();
}
function render() {
    const g = gfx;
    g.clear();
    // Ground
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++)
        diamond(g, x, y, (x + y) % 2 ? 0x3d6b3d : 0x3a673a);

    // Depth-sorted objects
    const items = [];
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
        const c = mapData[y][x];
        if (c && c.kind === 'house') items.push({ d: tileCenter(x, y).y, draw: () => drawHouse(g, x, y, c.house) });
        else if (c && c.kind !== 'tc') items.push({ d: tileCenter(x, y).y, draw: () => drawNode(g, x, y, c) });
    }
    const tcC = tileCenter(townCenter.x + 0.5, townCenter.y + 0.5);
    items.push({ d: tcC.y + 16, draw: () => drawTC(g) });
    villagers.forEach(v => items.push({ d: v.y, draw: () => drawVillager(g, v) }));
    items.sort((a, b) => a.d - b.d).forEach(i => i.draw());
}
function drawNode(g, x, y, c) {
    const p = tileCenter(x, y), f = 0.45 + 0.55 * (c.amount / c.max), col = RES_TYPES[c.kind].color;
    if (c.kind === 'tree') {
        g.fillStyle(0x5a3a1a, 1); g.fillRect(p.x - 2, p.y - 6, 4, 8);
        g.fillStyle(col, 1); g.fillTriangle(p.x - 12 * f, p.y - 4, p.x + 12 * f, p.y - 4, p.x, p.y - 4 - 30 * f);
    } else if (c.kind === 'berry') {
        g.fillStyle(0x2e6b2e, 1); g.fillEllipse(p.x, p.y - 4, 26 * f, 16 * f);
        g.fillStyle(col, 1);
        for (let i = 0; i < 5; i++) g.fillCircle(p.x - 8 * f + i * 4 * f, p.y - 6 + (i % 2) * 4, 2.5);
    } else {
        g.fillStyle(0x555555, 1); g.fillEllipse(p.x, p.y - 2, 34 * f, 18 * f);
        g.fillStyle(col, 1); g.fillEllipse(p.x - 3, p.y - 5, 22 * f, 11 * f);
    }
}
function drawTC(g) {
    const t = townCenter;
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) diamond(g, x, y, 0x8a7a5a);
    const c = tileCenter(t.x + 0.5, t.y + 0.5);
    g.fillStyle(0xb08a55, 1); g.fillRect(c.x - 34, c.y - 44, 68, 44);
    g.fillStyle(0x7a2e1e, 1); g.fillTriangle(c.x - 42, c.y - 44, c.x + 42, c.y - 44, c.x, c.y - 78);
    g.fillStyle(0x3a2a1a, 1); g.fillRect(c.x - 8, c.y - 20, 16, 20);
    if (t.selected) { g.lineStyle(3, 0xffffff, 1); g.strokeEllipse(c.x, c.y, 140, 70); }
    if (trainQueue > 0) {          // training progress bar above the roof
        const f = trainTimer / TRAIN_TIME;
        g.fillStyle(0x000000, 0.7); g.fillRect(c.x - 36, c.y - 96, 72, 9);
        g.fillStyle(popCount() < popCap() ? 0x55dd55 : 0xdd5555, 1); g.fillRect(c.x - 35, c.y - 95, 70 * f, 7);
    }
}
function drawHouse(g, x, y, h) {
    const p = tileCenter(x, y);
    diamond(g, x, y, 0x8a7a5a);
    if (!h.done) {
        g.lineStyle(2, 0xc8a46a, 1); g.strokeRect(p.x - 14, p.y - 22, 28, 20);
        const hgt = 20 * h.progress;
        g.fillStyle(0xb08a55, 1); g.fillRect(p.x - 14, p.y - 2 - hgt, 28, hgt);
        g.fillStyle(0x000000, 0.7); g.fillRect(p.x - 18, p.y - 34, 36, 6);
        g.fillStyle(0x55aaff, 1); g.fillRect(p.x - 17, p.y - 33, 34 * h.progress, 4);
    } else {
        g.fillStyle(0xc49a60, 1); g.fillRect(p.x - 14, p.y - 22, 28, 20);
        g.fillStyle(0x7a2e1e, 1); g.fillTriangle(p.x - 18, p.y - 22, p.x + 18, p.y - 22, p.x, p.y - 38);
        g.fillStyle(0x3a2a1a, 1); g.fillRect(p.x - 4, p.y - 12, 8, 10);
    }
}
/** Spawn a trained villager on a free tile around the Town Center */
function spawnFromTC() {
    const t = townCenter, ring = [];
    for (let y = t.y - 1; y <= t.y + t.h; y++) for (let x = t.x - 1; x <= t.x + t.w; x++)
        if (inMap(x, y) && !mapData[y][x]) ring.push({ x, y });
    const spot = ring[Math.floor(Math.random() * ring.length)] || { x: t.x + 2, y: t.y + 2 };
    spawnVillager(spot.x, spot.y);
}
function drawVillager(g, v) {
    if (v.selected) { g.lineStyle(2, 0xffff66, 1); g.strokeEllipse(v.x, v.y + 2, 26, 12); }
    const bob = v.state === 'gathering' ? Math.sin(game.loop.time / 90) * 2 : 0;
    g.fillStyle(0x2a5ab0, 1); g.fillRect(v.x - 5, v.y - 16, 10, 14);
    g.fillStyle(0xf0c8a0, 1); g.fillCircle(v.x, v.y - 20 + bob, 5);
    if (v.carry > 0) { g.fillStyle(CARRY_COLORS[v.carryType], 1); g.fillRect(v.x + 4, v.y - 14, 7, 7); }
}

// ============================================================================
// INPUT
// ============================================================================
function villagerAt(px, py) {
    let best = null, bd = 22;
    villagers.forEach(v => { const d = Math.hypot(v.x - px, (v.y - 10) - py); if (d < bd) { bd = d; best = v; } });
    return best;
}
function onPointerDown(pointer) {
    const px = pointer.worldX, py = pointer.worldY;
    const t0 = screenToTile(px, py);
    if (placing === 'house') {
        placing = null;
        const builders = villagers.filter(u => u.selected);
        if (!inMap(t0.x, t0.y) || mapData[t0.y][t0.x] || !builders.length || !canAfford(HOUSE_COST)) { flash('Can\'t build there'); return; }
        pay(HOUSE_COST);
        const h = { x: t0.x, y: t0.y, progress: 0, done: false };
        houses.push(h); mapData[t0.y][t0.x] = { kind: 'house', house: h };
        builders.forEach(u => orderBuild(u, h));
        return;
    }
    const v = villagerAt(px, py);
    if (v) {
        townCenter.selected = false;                       // toggle-select villager (tap several to group)
        v.selected = !v.selected;
        return;
    }
    const t = screenToTile(px, py);
    if (!inMap(t.x, t.y)) { villagers.forEach(u => u.selected = false); townCenter.selected = false; return; }
    const cell = mapData[t.y][t.x];
    let sel = villagers.filter(u => u.selected);
    if (cell && RES_TYPES[cell.kind]) {
        if (!sel.length) {         // nobody selected: send the nearest idle villager
            const p = tileCenter(t.x, t.y);
            const idle = villagers.filter(u => u.state === 'idle').sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
            sel = idle.slice(0, 1);
        }
        sel.forEach(u => orderGather(u, t.x, t.y));
    } else if (cell && cell.kind === 'tc') {
        if (sel.length) sel.forEach(u => { if (u.carry > 0) u.state = 'returning'; });
        else townCenter.selected = !townCenter.selected;   // select TC to train villagers
    } else if (cell && cell.kind === 'house') {
        if (!cell.house.done) sel.forEach(u => orderBuild(u, cell.house));
    } else {
        sel.forEach(u => orderMove(u, t.x, t.y));
    }
}

// ============================================================================
// COMMAND BAR (DOM, big touch buttons)
// ============================================================================
const bar = document.getElementById('command-bar');
let flashTimer = 0;
function flash(msg) {
    infoText.setText(msg); clearTimeout(flashTimer);
    flashTimer = setTimeout(() => infoText.setText(DEFAULT_INFO), 1800);
}
const DEFAULT_INFO = 'Tap villagers to select, tap a resource to gather. Tap the Town Center to train.';
let barKey = '';
function button(id, label, sub, enabled) {
    return `<button class="cmd" data-cmd="${id}" ${enabled ? '' : 'disabled'}><b>${label}</b><small>${sub}</small></button>`;
}
function updateBar() {
    const sel = villagers.filter(u => u.selected);
    let html = '';
    if (townCenter.selected) {
        const full = popCount() >= popCap();
        const pct = trainQueue ? Math.round(trainTimer / TRAIN_TIME * 100) : 0;
        html = `<span class="sel">Town Center</span>` +
            button('train', 'Train Villager', costText(VILLAGER_COST) + ` · ${TRAIN_TIME}s`, canAfford(VILLAGER_COST) && trainQueue < QUEUE_MAX) +
            (trainQueue ? button('cancel', 'Cancel', 'refund 50 food', true) : '') +
            `<span class="queue">Queue ${trainQueue}${trainQueue ? ' · ' + pct + '%' : ''}${full && trainQueue ? ' · need House!' : ''}</span>`;
    } else if (sel.length) {
        html = `<span class="sel">${sel.length} villager${sel.length > 1 ? 's' : ''}</span>` +
            button('house', placing ? 'Tap a tile…' : 'Build House', costText(HOUSE_COST) + ` · +${POP_PER_HOUSE} pop`, canAfford(HOUSE_COST)) +
            button('deselect', 'Deselect', 'clear selection', true);
    } else {
        html = `<span class="sel">Nothing selected</span>` + button('idle', 'Select Idle', villagers.filter(u => u.state === 'idle').length + ' idle', true);
    }
    if (html !== barKey) { bar.innerHTML = html; barKey = html; }
}
bar.addEventListener('pointerdown', e => {
    const b = e.target.closest('button.cmd');
    e.stopPropagation();
    if (!b || b.disabled) return;
    const cmd = b.dataset.cmd;
    if (cmd === 'train') { if (canAfford(VILLAGER_COST) && trainQueue < QUEUE_MAX) { pay(VILLAGER_COST); trainQueue++; } }
    else if (cmd === 'cancel') { if (trainQueue) { trainQueue--; refund(VILLAGER_COST); if (!trainQueue) trainTimer = 0; } }
    else if (cmd === 'house') { placing = placing ? null : 'house'; if (placing) flash('Tap a free tile to place the House'); }
    else if (cmd === 'deselect') { villagers.forEach(u => u.selected = false); placing = null; }
    else if (cmd === 'idle') { villagers.forEach(u => u.selected = u.state === 'idle'); }
});
