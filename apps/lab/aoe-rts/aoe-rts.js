/**
 * AOE RTS - Tiny Slice Isometric Game (Phaser 3)
 * R9: code-drawn graphics (baked grass, villagers with tools/animation, TC, house stages, trees,
 *     berries, gold, stone depletion) + procedural Web Audio sounds with mute toggle.
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
    const v = { x: p.x, y: p.y, state: 'idle', target: null, node: null, carry: 0, carryType: null, timer: 0, selected: false, face: 1, walking: false, seed: Math.random() };
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
    v.walking = true; if (Math.abs(dx) > 0.5) v.face = dx > 0 ? 1 : -1;
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
                Sfx.play(cell.kind === 'tree' ? 'chop' : cell.kind === 'berry' ? 'gather' : 'mine', 0.3);
                { const np = tileCenter(v.node.x, v.node.y); if (Math.abs(np.x - v.x) > 1) v.face = np.x > v.x ? 1 : -1; }
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
            Sfx.play('hammer', 0.45);
            if (h.progress >= 1) { h.progress = 1; h.done = true; v.state = 'idle'; v.house = null; Sfx.play('built'); }
            break;
        }
        case 'returning':
            if (stepTo(v, dropPoint(v), dt, 3)) {
                resources[v.carryType] += v.carry; Sfx.play('drop', 0.15);
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
    bakeGround(this);
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
    villagers.forEach(v => { v.walking = false; updateVillager(v, dt); });
    if (trainQueue > 0 && popCount() < popCap()) {
        trainTimer += dt;
        if (trainTimer >= TRAIN_TIME) { trainTimer = 0; trainQueue--; spawnFromTC(); }
    }
    hudText.setText(`Wood ${resources.wood}   Food ${resources.food}   Gold ${resources.gold}   Stone ${resources.stone}   Pop ${popCount()}/${popCap()}`);
    updateBar();
    render();
}

// ============================================================================
// RENDER (R9: code-drawn graphics, no image files)
// ============================================================================
/** Deterministic hash 0..1 for per-tile variation */
function hash(x, y, k) { const s = Math.sin(x * 127.1 + y * 311.7 + (k || 0) * 74.7) * 43758.5453; return s - Math.floor(s); }
function shade(col, f) {
    const r = Math.min(255, ((col >> 16) & 255) * f) | 0, g = Math.min(255, ((col >> 8) & 255) * f) | 0, b = Math.min(255, (col & 255) * f) | 0;
    return (r << 16) | (g << 8) | b;
}
/** Bake the whole grass map once into a canvas texture (cheap: one image per frame) */
function bakeGround(scene) {
    const W = 960, H = 600, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    c.fillStyle = '#24401f'; c.fillRect(0, 0, W, H);
    const greens = ['#4a7d3a', '#44753a', '#4f8540', '#3f6e35', '#538a43'];
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
        const p = tileCenter(x, y);
        c.save(); c.beginPath();
        c.moveTo(p.x, p.y - hh); c.lineTo(p.x + hw, p.y); c.lineTo(p.x, p.y + hh); c.lineTo(p.x - hw, p.y); c.closePath();
        c.fillStyle = greens[Math.floor(hash(x, y) * greens.length)]; c.fill(); c.clip();
        // light/dark patches
        for (let i = 0; i < 3; i++) {
            c.fillStyle = hash(x, y, i + 10) > 0.5 ? 'rgba(255,255,200,0.07)' : 'rgba(0,30,0,0.10)';
            c.beginPath(); c.ellipse(p.x + (hash(x, y, i) - 0.5) * 50, p.y + (hash(x, y, i + 3) - 0.5) * 24, 10 + hash(x, y, i + 6) * 12, 5 + hash(x, y, i + 7) * 5, 0, 0, 7); c.fill();
        }
        // grass blades
        c.strokeStyle = 'rgba(120,170,80,0.55)'; c.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
            const bx = p.x + (hash(x, y, i + 20) - 0.5) * 56, by = p.y + (hash(x, y, i + 40) - 0.5) * 28;
            c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + (hash(x, y, i + 60) - 0.5) * 3, by - 3 - hash(x, y, i + 80) * 3); c.stroke();
        }
        // occasional flowers / pebbles
        if (hash(x, y, 99) > 0.8) { c.fillStyle = hash(x, y, 98) > 0.5 ? '#f2e46a' : '#f4f4f4'; for (let i = 0; i < 3; i++) c.fillRect(p.x + (hash(x, y, i + 90) - 0.5) * 36, p.y + (hash(x, y, i + 95) - 0.5) * 14, 2, 2); }
        if (hash(x, y, 97) > 0.88) { c.fillStyle = '#8c8c7c'; c.beginPath(); c.ellipse(p.x + 10, p.y + 4, 3, 2, 0, 0, 7); c.fill(); }
        c.restore();
        c.strokeStyle = 'rgba(0,0,0,0.08)'; c.beginPath();
        c.moveTo(p.x, p.y - hh); c.lineTo(p.x + hw, p.y); c.lineTo(p.x, p.y + hh); c.lineTo(p.x - hw, p.y); c.closePath(); c.stroke();
    }
    // dirt around the Town Center
    const t = townCenter, tc = tileCenter(t.x + 0.5, t.y + 0.5);
    const grd = c.createRadialGradient(tc.x, tc.y, 10, tc.x, tc.y, 90);
    grd.addColorStop(0, 'rgba(150,120,80,0.9)'); grd.addColorStop(0.6, 'rgba(140,110,70,0.5)'); grd.addColorStop(1, 'rgba(140,110,70,0)');
    c.fillStyle = grd; c.beginPath(); c.ellipse(tc.x, tc.y, 100, 52, 0, 0, 7); c.fill();
    scene.textures.addCanvas('ground', cv);
    scene.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(-1);
}
function diamond(g, cx, cy, color, alpha) {
    const p = tileCenter(cx, cy), hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    g.fillStyle(color, alpha == null ? 1 : alpha);
    g.beginPath();
    g.moveTo(p.x, p.y - hh); g.lineTo(p.x + hw, p.y); g.lineTo(p.x, p.y + hh); g.lineTo(p.x - hw, p.y);
    g.closePath(); g.fillPath();
}
function shadow(g, x, y, w, h) { g.fillStyle(0x000000, 0.22); g.fillEllipse(x, y, w, h); }
function render() {
    const g = gfx;
    g.clear();
    if (placing === 'house') {              // show free tiles while placing
        for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) if (!mapData[y][x]) diamond(g, x, y, 0xffffff, 0.06);
    }
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
    const p = tileCenter(x, y), frac = c.amount / c.max, s = hash(x, y, 5);
    if (c.kind === 'tree') {
        const ox = (hash(x, y, 1) - 0.5) * 10, oy = (hash(x, y, 2) - 0.5) * 4, px = p.x + ox, py = p.y + oy;
        shadow(g, px + 4, py + 1, 30, 12);
        if (frac < 0.25) {                       // nearly cut: stump + log
            g.fillStyle(0x6b4423, 1); g.fillEllipse(px, py - 3, 12, 7); g.fillStyle(0xc89a62, 1); g.fillEllipse(px, py - 5, 10, 5);
            g.fillStyle(0x7a4e28, 1); g.fillRect(px + 4, py - 3, 14, 4);
            return;
        }
        const h = 0.85 + s * 0.35, lean = frac < 0.6 ? 0.85 : 1;  // thinner when chopped
        g.fillStyle(0x5a3a1a, 1); g.fillRect(px - 2.5, py - 12 * h, 5, 12 * h);
        g.fillStyle(0x3d2810, 1); g.fillRect(px + 0.5, py - 12 * h, 2, 12 * h);
        if (s > 0.45) {                          // pine
            const greens = [0x1f4d22, 0x2a5e2a, 0x357035];
            for (let i = 0; i < 3; i++) {
                const w = (16 - i * 4) * lean, base = py - 8 * h - i * 9 * h;
                g.fillStyle(greens[i], 1); g.fillTriangle(px - w, base, px + w, base, px, base - 16 * h);
                g.fillStyle(0x000000, 0.18); g.fillTriangle(px, base, px + w, base, px, base - 16 * h);
            }
        } else {                                 // round leafy tree
            const cy = py - 22 * h;
            g.fillStyle(0x2a5a24, 1); g.fillCircle(px - 6 * lean, cy + 3, 9 * lean); g.fillCircle(px + 6 * lean, cy + 3, 9 * lean);
            g.fillStyle(0x34702c, 1); g.fillCircle(px, cy - 4, 11 * lean);
            g.fillStyle(0x4a8a3a, 1); g.fillCircle(px - 3, cy - 7, 5 * lean);
        }
    } else if (c.kind === 'berry') {
        shadow(g, p.x + 2, p.y + 2, 30, 12);
        g.fillStyle(0x245a24, 1); g.fillEllipse(p.x, p.y - 5, 30, 18);
        g.fillStyle(0x2f6e2f, 1); g.fillEllipse(p.x - 5, p.y - 8, 16, 11); g.fillEllipse(p.x + 6, p.y - 7, 14, 10);
        const n = Math.ceil(9 * frac);
        for (let i = 0; i < n; i++) {
            const bx = p.x + (hash(x, y, i + 30) - 0.5) * 22, by = p.y - 5 + (hash(x, y, i + 40) - 0.5) * 12;
            g.fillStyle(0x8a1844, 1); g.fillCircle(bx, by, 2.6); g.fillStyle(0xe05090, 1); g.fillCircle(bx - 0.8, by - 0.8, 1.2);
        }
    } else {
        const gold = c.kind === 'gold', n = Math.max(1, Math.ceil(6 * frac));
        shadow(g, p.x, p.y + 2, 40 * (0.6 + 0.4 * frac), 14);
        // grey base rocks shrink with depletion
        const rocks = [[-10, -2, 14], [8, -1, 12], [0, -7, 15], [-4, 3, 10], [11, -8, 9], [-12, -9, 9]];
        for (let i = 0; i < n; i++) {
            const r = rocks[i], sz = r[2] * (0.7 + 0.3 * frac);
            const base = gold ? 0x6e6458 : 0x8c8c88;
            g.fillStyle(shade(base, 0.75), 1); g.fillEllipse(p.x + r[0] + 1, p.y + r[1], sz * 1.3, sz);
            g.fillStyle(base, 1); g.fillEllipse(p.x + r[0], p.y + r[1] - 2, sz * 1.2, sz * 0.85);
            g.fillStyle(shade(base, 1.3), 1); g.fillEllipse(p.x + r[0] - sz * 0.2, p.y + r[1] - sz * 0.35, sz * 0.5, sz * 0.3);
            if (gold) {                           // gold veins / nuggets
                g.fillStyle(0xe8c33a, 1); g.fillCircle(p.x + r[0] + 2, p.y + r[1] - 3, sz * 0.18); g.fillCircle(p.x + r[0] - 3, p.y + r[1], sz * 0.13);
                g.fillStyle(0xfff2a0, 1); g.fillCircle(p.x + r[0] + 1.5, p.y + r[1] - 3.5, sz * 0.07);
            }
        }
        if (gold && Math.sin(game.loop.time / 300 + x * 3 + y) > 0.97) { g.fillStyle(0xffffff, 0.9); g.fillCircle(p.x + 4, p.y - 8, 1.6); }
    }
}
function drawTC(g) {
    const t = townCenter;
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) diamond(g, x, y, 0x9c8a66);
    const c = tileCenter(t.x + 0.5, t.y + 0.5);
    if (t.selected) { g.lineStyle(3, 0xffffff, 0.9); g.strokeEllipse(c.x, c.y, 140, 70); }
    shadow(g, c.x + 8, c.y + 4, 120, 46);
    // stone foundation (iso box)
    const W = 44, D = 22, H = 10;
    g.fillStyle(0x8a8478, 1); g.fillPoints([{ x: c.x - W, y: c.y }, { x: c.x, y: c.y + D }, { x: c.x, y: c.y + D - H }, { x: c.x - W, y: c.y - H }], true);
    g.fillStyle(0x6a655c, 1); g.fillPoints([{ x: c.x, y: c.y + D }, { x: c.x + W, y: c.y }, { x: c.x + W, y: c.y - H }, { x: c.x, y: c.y + D - H }], true);
    // timber walls
    const w = 36, d = 18, h = 30, by = c.y - H;
    g.fillStyle(0xc9a26a, 1); g.fillPoints([{ x: c.x - w, y: by }, { x: c.x, y: by + d }, { x: c.x, y: by + d - h }, { x: c.x - w, y: by - h }], true);
    g.fillStyle(0xa8834f, 1); g.fillPoints([{ x: c.x, y: by + d }, { x: c.x + w, y: by }, { x: c.x + w, y: by - h }, { x: c.x, y: by + d - h }], true);
    g.lineStyle(2, 0x5a3a1a, 1);                 // beams
    [[-w, 0], [-w / 2, d / 2], [0, d], [w / 2, d / 2], [w, 0]].forEach(o => g.lineBetween(c.x + o[0], by + o[1], c.x + o[0], by + o[1] - h));
    g.lineBetween(c.x - w, by - h / 2, c.x, by + d - h / 2); g.lineBetween(c.x, by + d - h / 2, c.x + w, by - h / 2);
    // door + windows
    g.fillStyle(0x3a2412, 1); g.fillPoints([{ x: c.x - 18, y: by + 9 }, { x: c.x - 8, y: by + 14 }, { x: c.x - 8, y: by - 2 }, { x: c.x - 18, y: by - 7 }], true);
    g.fillStyle(0xffd27a, 0.9); g.fillRect(c.x + 12, by - 16, 6, 6); g.fillRect(c.x + 24, by - 22, 6, 6);
    // roof (hip)
    const ry = by - h, rh = 30;
    g.fillStyle(0x8a3220, 1); g.fillTriangle(c.x - w - 6, ry, c.x, ry + d + 3, c.x, ry - rh);
    g.fillStyle(0x6a2416, 1); g.fillTriangle(c.x, ry + d + 3, c.x + w + 6, ry, c.x, ry - rh);
    g.fillStyle(0x9e3c26, 1); g.fillTriangle(c.x - w - 6, ry, c.x, ry - rh, c.x - 2, ry - d - 2);
    g.lineStyle(1, 0x4a160c, 0.5); for (let i = 1; i < 4; i++) { const f = i / 4; g.lineBetween(c.x - (w + 6) * (1 - f), ry - rh * f, c.x, ry + d + 3 - (d + 3 + rh) * f); g.lineBetween(c.x + (w + 6) * (1 - f), ry - rh * f, c.x, ry + d + 3 - (d + 3 + rh) * f); }
    // flag
    const fl = Math.sin(game.loop.time / 200) * 2;
    g.lineStyle(2, 0x3a2a1a, 1); g.lineBetween(c.x, ry - rh, c.x, ry - rh - 22);
    g.fillStyle(0x2a5ab0, 1); g.fillTriangle(c.x, ry - rh - 22, c.x + 14, ry - rh - 18 + fl, c.x, ry - rh - 13);
    if (trainQueue > 0) {          // training progress bar
        const f = trainTimer / TRAIN_TIME;
        g.fillStyle(0x000000, 0.7); g.fillRect(c.x - 36, c.y - 110, 72, 9);
        g.fillStyle(popCount() < popCap() ? 0x55dd55 : 0xdd5555, 1); g.fillRect(c.x - 35, c.y - 109, 70 * f, 7);
    }
}
function drawHouse(g, x, y, h) {
    const p = tileCenter(x, y), pr = h.done ? 1 : h.progress;
    diamond(g, x, y, 0x9c8a66);
    shadow(g, p.x + 4, p.y + 2, 46, 20);
    const w = 18, d = 9, H = 18;
    if (pr < 0.33) {                          // stage 1: foundation + corner posts
        g.fillStyle(0x8a8478, 1); g.fillPoints([{ x: p.x - w, y: p.y }, { x: p.x, y: p.y + d }, { x: p.x + w, y: p.y }, { x: p.x, y: p.y - d }], true);
        const ph = H * (pr / 0.33);
        g.lineStyle(3, 0x6b4423, 1);
        [[-w, 0], [0, d], [w, 0], [0, -d]].forEach(o => g.lineBetween(p.x + o[0], p.y + o[1], p.x + o[0], p.y + o[1] - ph));
    } else if (pr < 0.66) {                   // stage 2: walls rising, frame roof
        const f = (pr - 0.33) / 0.33, wh = H * f;
        g.lineStyle(3, 0x6b4423, 1); [[-w, 0], [0, d], [w, 0], [0, -d]].forEach(o => g.lineBetween(p.x + o[0], p.y + o[1], p.x + o[0], p.y + o[1] - H));
        g.fillStyle(0xc9a26a, 1); g.fillPoints([{ x: p.x - w, y: p.y }, { x: p.x, y: p.y + d }, { x: p.x, y: p.y + d - wh }, { x: p.x - w, y: p.y - wh }], true);
        g.fillStyle(0xa8834f, 1); g.fillPoints([{ x: p.x, y: p.y + d }, { x: p.x + w, y: p.y }, { x: p.x + w, y: p.y - wh }, { x: p.x, y: p.y + d - wh }], true);
        g.lineStyle(2, 0x6b4423, 1); g.lineBetween(p.x - w, p.y - H, p.x, p.y - H - 14); g.lineBetween(p.x + w, p.y - H, p.x, p.y - H - 14);
    } else {                                  // stage 3 / done: full house, roof fills in
        const rf = h.done ? 1 : (pr - 0.66) / 0.34;
        g.fillStyle(0xd4ad74, 1); g.fillPoints([{ x: p.x - w, y: p.y }, { x: p.x, y: p.y + d }, { x: p.x, y: p.y + d - H }, { x: p.x - w, y: p.y - H }], true);
        g.fillStyle(0xb08a55, 1); g.fillPoints([{ x: p.x, y: p.y + d }, { x: p.x + w, y: p.y }, { x: p.x + w, y: p.y - H }, { x: p.x, y: p.y + d - H }], true);
        g.lineStyle(1.5, 0x5a3a1a, 1); g.lineBetween(p.x, p.y + d, p.x, p.y + d - H);
        g.fillStyle(0x3a2412, 1); g.fillPoints([{ x: p.x - 11, y: p.y + 3 }, { x: p.x - 5, y: p.y + 6 }, { x: p.x - 5, y: p.y - 5 }, { x: p.x - 11, y: p.y - 8 }], true);
        if (h.done) { g.fillStyle(0xffd27a, 0.9); g.fillRect(p.x + 7, p.y - 10, 4, 4); }
        const ry = p.y - H;
        g.fillStyle(0x8a3220, rf); g.fillTriangle(p.x - w - 3, ry, p.x, ry + d + 2, p.x, ry - 16);
        g.fillStyle(0x6a2416, rf); g.fillTriangle(p.x, ry + d + 2, p.x + w + 3, ry, p.x, ry - 16);
        g.fillStyle(0x9e3c26, rf); g.fillTriangle(p.x - w - 3, ry, p.x, ry - 16, p.x, ry - d - 2);
        if (!h.done) { g.lineStyle(2, 0x6b4423, 1); g.lineBetween(p.x - w, ry, p.x, ry - 16); g.lineBetween(p.x + w, ry, p.x, ry - 16); }
        if (h.done) { g.fillStyle(0x6a655c, 1); g.fillRect(p.x + 6, ry - 12, 4, 8); }
    }
    if (!h.done) {
        g.fillStyle(0x000000, 0.7); g.fillRect(p.x - 18, p.y - 48, 36, 6);
        g.fillStyle(0x55aaff, 1); g.fillRect(p.x - 17, p.y - 47, 34 * h.progress, 4);
    }
}
/** Spawn a trained villager on a free tile around the Town Center */
function spawnFromTC() {
    const t = townCenter, ring = [];
    for (let y = t.y - 1; y <= t.y + t.h; y++) for (let x = t.x - 1; x <= t.x + t.w; x++)
        if (inMap(x, y) && !mapData[y][x]) ring.push({ x, y });
    const spot = ring[Math.floor(Math.random() * ring.length)] || { x: t.x + 2, y: t.y + 2 };
    spawnVillager(spot.x, spot.y);
    Sfx.play('train');
}
function drawVillager(g, v) {
    const T = game.loop.time, x = v.x, y = v.y, face = v.face || 1;
    const walking = v.walking, working = v.state === 'gathering' || v.state === 'building';
    const ph = (T / 1000) * 10 + (v.seed || 0) * 6;
    const bob = walking ? Math.abs(Math.sin(ph)) * 2 : 0;
    const leg = walking ? Math.sin(ph) * 3 : 0;
    // swing angle for tool: fast down-stroke
    const sw = working ? (Math.sin(T / 1000 * 9 + (v.seed || 0) * 6) * 0.5 + 0.5) : 0.15;
    if (v.selected) { g.lineStyle(2, 0xffff66, 1); g.strokeEllipse(x, y + 2, 26, 12); }
    shadow(g, x, y + 1, 16, 6);
    // legs
    g.fillStyle(0x4a3a28, 1); g.fillRect(x - 4 + leg * 0.5, y - 8, 3, 8); g.fillRect(x + 1 - leg * 0.5, y - 8, 3, 8);
    const by = y - bob;
    // body (tunic) + belt
    g.fillStyle(0x2a5ab0, 1); g.fillRoundedRect(x - 5.5, by - 19, 11, 12, 3);
    g.fillStyle(0x1d4488, 1); g.fillRect(x + (face > 0 ? 1 : -5.5), by - 19, 4.5, 12);
    g.fillStyle(0x5a3a1a, 1); g.fillRect(x - 5.5, by - 10, 11, 2);
    // head + hair
    g.fillStyle(0xf0c8a0, 1); g.fillCircle(x, by - 23, 4.5);
    g.fillStyle(0x6b4423, 1); g.fillEllipse(x - face * 0.8, by - 26, 9, 4);
    g.fillStyle(0x222222, 1); g.fillCircle(x + face * 2, by - 23, 0.8);
    // tool arm
    const kind = v.state === 'building' ? 'hammer' : (v.node && mapData[v.node.y] && mapData[v.node.y][v.node.x] ? mapData[v.node.y][v.node.x].kind : (v.lastKind || null));
    const sx = x + face * 4, sy = by - 16;
    const ang = (-1.9 + sw * 1.9) * face;     // raised -> down
    const ex = sx + Math.sin(ang) * 7 * 1, ey = sy - Math.cos(ang) * 7;
    g.lineStyle(2.5, 0xf0c8a0, 1); g.lineBetween(sx, sy, ex, ey);
    if (working || kind) {
        const tx = ex + Math.sin(ang) * 6, ty = ey - Math.cos(ang) * 6;
        g.lineStyle(1.5, 0x7a5230, 1); g.lineBetween(ex, ey, tx, ty);
        if (kind === 'tree') { g.fillStyle(0xbfc4c8, 1); g.fillTriangle(tx, ty, tx + Math.cos(ang) * 4, ty + Math.sin(ang) * 4, tx - Math.sin(ang) * 3, ty + Math.cos(ang) * 3); }
        else if (kind === 'gold' || kind === 'stone') { g.lineStyle(2, 0x9aa0a6, 1); g.lineBetween(tx - Math.cos(ang) * 4, ty - Math.sin(ang) * 4, tx + Math.cos(ang) * 4, ty + Math.sin(ang) * 4); }
        else if (kind === 'hammer') { g.fillStyle(0x777777, 1); g.fillRect(tx - 2, ty - 2, 4, 4); }
        else if (kind === 'berry') { g.fillStyle(0x8a6a3a, 1); g.fillEllipse(x - face * 6, by - 9, 7, 5); }
    }
    // carry indicator: load on back + small fill bar
    if (v.carry > 0) {
        const cx = x - face * 6, cy = by - 16, col = CARRY_COLORS[v.carryType];
        if (v.carryType === 'wood') { g.fillStyle(col, 1); g.fillRect(cx - 4, cy - 2, 8, 2.5); g.fillRect(cx - 4, cy + 1, 8, 2.5); g.fillStyle(0xc89a62, 1); g.fillCircle(cx + 4, cy - 0.7, 1.2); g.fillCircle(cx + 4, cy + 2.3, 1.2); }
        else if (v.carryType === 'food') { g.fillStyle(0x8a6a3a, 1); g.fillEllipse(cx, cy + 2, 8, 6); g.fillStyle(col, 1); g.fillCircle(cx - 1.5, cy, 1.6); g.fillCircle(cx + 1.5, cy - 0.5, 1.6); }
        else { g.fillStyle(0x6b4a2a, 1); g.fillRoundedRect(cx - 4, cy - 2, 8, 7, 2); g.fillStyle(col, 1); g.fillCircle(cx, cy - 2, 2.2); }
        g.fillStyle(0x000000, 0.6); g.fillRect(x - 7, by - 33, 14, 3);
        g.fillStyle(col, 1); g.fillRect(x - 6.5, by - 32.5, 13 * v.carry / CARRY_MAX, 2);
    }
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
    Sfx.play('tap', 0.05);
    const t0 = screenToTile(px, py);
    if (placing === 'house') {
        placing = null;
        const builders = villagers.filter(u => u.selected);
        if (!inMap(t0.x, t0.y) || mapData[t0.y][t0.x] || !builders.length || !canAfford(HOUSE_COST)) { flash('Can\'t build there'); Sfx.play('error'); return; }
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
    Sfx.init(); Sfx.play('tap');
    if (cmd === 'train') { if (canAfford(VILLAGER_COST) && trainQueue < QUEUE_MAX) { pay(VILLAGER_COST); trainQueue++; } }
    else if (cmd === 'cancel') { if (trainQueue) { trainQueue--; refund(VILLAGER_COST); if (!trainQueue) trainTimer = 0; } }
    else if (cmd === 'house') { placing = placing ? null : 'house'; if (placing) flash('Tap a free tile to place the House'); }
    else if (cmd === 'deselect') { villagers.forEach(u => u.selected = false); placing = null; }
    else if (cmd === 'idle') { villagers.forEach(u => u.selected = u.state === 'idle'); }
});

// ============================================================================
// AUDIO: start on first tap, mute toggle (saved)
// ============================================================================
window.addEventListener('pointerdown', () => Sfx.init(), { capture: true });
const muteBtn = document.getElementById('mute-btn');
function syncMute() { muteBtn.textContent = Sfx.isMuted() ? '🔇' : '🔊'; }
muteBtn.addEventListener('pointerdown', e => { e.stopPropagation(); Sfx.init(); Sfx.toggle(); syncMute(); });
window.addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') { Sfx.toggle(); syncMute(); } });
syncMute();
