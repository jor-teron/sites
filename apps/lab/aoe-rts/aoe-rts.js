/**
 * AOE RTS - Tiny Slice Isometric Game (Phaser 3)
 * R1a: 48x48 map (MAP_SIZE), full-window canvas, zoomable/pannable camera (wheel, right/middle drag,
 *     screen edge, WASD/arrows, Space = TC), chunked grass, minimap, mouse selection (click, drag box,
 *     Shift toggle, Ctrl+A, Esc), right-click orders, villager spreading, pause (P / button, tab hidden).
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
const MAP_SIZE = 48;              // tiles per side (config)
const WORLD_MARGIN = 96;          // px of empty border around the map diamond
const WORLD_W = MAP_SIZE * TILE_WIDTH + WORLD_MARGIN * 2;
const WORLD_H = MAP_SIZE * TILE_HEIGHT + WORLD_MARGIN * 2 + 64;
const ORIGIN_X = WORLD_W / 2;     // world x of tile (0,0) top corner
const ORIGIN_Y = WORLD_MARGIN + 64; // world y of tile (0,0) top corner (room for tall sprites)
const ZOOM_DEFAULT = 2.2, ZOOM_MAX = 4, ZOOM_MIN_ABS = 0.3;
const PAN_SPEED = 900;            // screen px / s for keys + edge scroll
const EDGE_PX = 14;               // screen edge scroll band
const CHUNK = 8;                  // grass chunk size in tiles
const MINIMAP_W = 180;
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
    parent: 'game-container',
    backgroundColor: '#2d4a2d',
    fps: { target: 30, limit: 30 },
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    disableContextMenu: true,
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
let paused = false;
let animT = 0;           // animation clock (ms), frozen while paused
let scene = null, cam = null, groundChunks = [];
let dragSel = null;      // { sx, sy, ex, ey, active } left-drag box (world coords)
let panDrag = null;      // { x, y, sx, sy, moved } right/middle drag
let hoverTile = null;
let keys = null, pointerInside = false;

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
    const m = Math.floor(MAP_SIZE / 2) - 1;
    townCenter = { x: m, y: m, w: 2, h: 2 };
    for (let y = m; y < m + 2; y++) for (let x = m; x < m + 2; x++) mapData[y][x] = { kind: 'tc' };
    const cx0 = m + 0.5, cy0 = m + 0.5;
    let rnd = 1234567; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;  // seeded
    const place = (kind, cx, cy) => {
        cx = Math.round(cx); cy = Math.round(cy);
        if (!inMap(cx, cy) || mapData[cy][cx]) return;
        if (Math.abs(cx - cx0) < 4 && Math.abs(cy - cy0) < 4) return; // keep TC area clear
        const a = RES_TYPES[kind].amount;
        mapData[cy][cx] = { kind, amount: a, max: a };
    };
    const blob = (kind, cx, cy, r, n) => { for (let i = 0; i < n; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * r; place(kind, cx + Math.cos(a) * d, cy + Math.sin(a) * d); } };
    // Forest belts near the map edges + scattered woods
    const S = MAP_SIZE;
    for (let i = 0; i < S * 5; i++) { const e = Math.floor(R() * 4), t = R() * S, d = R() * R() * 5;
        place('tree', e === 0 ? t : e === 1 ? d : e === 2 ? t : S - 1 - d, e === 0 ? d : e === 1 ? t : e === 2 ? S - 1 - d : t); }
    for (let i = 0; i < 9; i++) { const a = R() * 6.283, d = 9 + R() * (S / 2 - 12); blob('tree', cx0 + Math.cos(a) * d, cy0 + Math.sin(a) * d, 2 + R() * 2.5, 18 + R() * 20); }
    blob('tree', cx0 - 7, cy0 - 6, 2.5, 22);               // a wood line close to home
    // Berries, gold, stone near the TC, more further out
    blob('berry', cx0 - 6, cy0 + 4, 1.4, 6);
    blob('gold', cx0 + 7, cy0 + 3, 1.2, 5); blob('stone', cx0 + 3, cy0 + 7, 1.2, 4);
    for (let i = 0; i < 3; i++) { const a = R() * 6.283, d = 13 + R() * 6;
        blob(['gold', 'stone', 'berry'][i], cx0 + Math.cos(a) * d, cy0 + Math.sin(a) * d, 1.3, 5); }
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
function orderMove(v, tx, ty, idx) {
    v.house = null;
    v.node = null; v.state = 'moving'; v.target = tileCenter(tx, ty);
    if (idx) { const a = idx * 2.4, r = 9 * Math.sqrt(idx); v.target.x += Math.cos(a) * r * 1.6; v.target.y += Math.sin(a) * r * 0.8; }
}
/** Idle villagers push apart so a stack can be clicked one by one */
function spreadIdle(dt) {
    const idle = villagers.filter(v => v.state === 'idle');
    for (let i = 0; i < idle.length; i++) for (let j = i + 1; j < idle.length; j++) {
        const a = idle[i], b = idle[j]; let dx = b.x - a.x, dy = (b.y - a.y) * 2, d = Math.hypot(dx, dy);
        if (d < 18) {
            if (d < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
            const push = Math.min(18 - d, 40 * dt) / 2, ux = dx / d, uy = dy / d / 2;
            a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        }
    }
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
    scene = this; cam = this.cameras.main;
    initMap();
    bakeGround(this);
    gfx = this.add.graphics();
    const c = townCenter;
    [[c.x - 1, c.y + 2], [c.x + 2, c.y - 1], [c.x + 2, c.y + 2]].slice(0, START_VILLAGERS).forEach(p => spawnVillager(p[0], p[1]));
    hudText = document.getElementById('hud');
    infoText = { setText: t => { document.getElementById('info').textContent = t; } };
    infoText.setText(DEFAULT_INFO);

    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setZoom(ZOOM_DEFAULT);
    centerOnTC();
    this.scale.on('resize', () => { cam.setZoom(Phaser.Math.Clamp(cam.zoom, minZoom(), ZOOM_MAX)); });

    this.input.mouse.disableContextMenu();
    this.input.on('pointerdown', onPointerDown, this);
    this.input.on('pointermove', onPointerMove, this);
    this.input.on('pointerup', onPointerUp, this);
    this.input.on('wheel', onWheel, this);
    this.input.on('gameout', () => { pointerInside = false; });
    this.input.on('gameover', () => { pointerInside = true; });
    keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    initMinimap();
}
function centerOnTC() { const p = tileCenter(townCenter.x + 0.5, townCenter.y + 0.5); cam.centerOn(p.x, p.y - 20); }
function minZoom() { return Math.max(ZOOM_MIN_ABS, Math.min(cam.width / WORLD_W, cam.height / WORLD_H)); }

function update(time, delta) {
    const dt = Math.min(delta, 100) / 1000;
    updateCameraKeys(dt);
    if (!paused) {
        animT += dt * 1000;
        villagers.forEach(v => { v.walking = false; updateVillager(v, dt); });
        spreadIdle(dt);
        if (trainQueue > 0 && popCount() < popCap()) {
            trainTimer += dt;
            if (trainTimer >= TRAIN_TIME) { trainTimer = 0; trainQueue--; spawnFromTC(); }
        }
    }
    const hud = `Wood ${resources.wood} · Food ${resources.food} · Gold ${resources.gold} · Stone ${resources.stone} · Pop ${popCount()}/${popCap()}`;
    if (hudText.textContent !== hud) hudText.textContent = hud;
    updateBar();
    render();
    updateMinimap(time);
}

// ============================================================================
// CAMERA
// ============================================================================
function updateCameraKeys(dt) {
    let vx = 0, vy = 0;
    if (keys.A.isDown || keys.LEFT.isDown) vx--; if (keys.D.isDown || keys.RIGHT.isDown) vx++;
    if (keys.W.isDown || keys.UP.isDown) vy--; if (keys.S.isDown || keys.DOWN.isDown) vy++;
    const p = scene.input.activePointer;
    if (pointerInside && !panDrag && !dragSel && p.x >= 0) {
        if (p.x < EDGE_PX) vx--; else if (p.x > cam.width - EDGE_PX) vx++;
        if (p.y < EDGE_PX) vy--; else if (p.y > cam.height - EDGE_PX) vy++;
    }
    if (vx || vy) { cam.scrollX += vx * PAN_SPEED * dt / cam.zoom; cam.scrollY += vy * PAN_SPEED * dt / cam.zoom; }
}
function onWheel(pointer, objs, dx, dy) {
    const z1 = cam.zoom, z2 = Phaser.Math.Clamp(z1 * Math.pow(1.0015, -dy), minZoom(), ZOOM_MAX);
    if (z2 === z1) return;
    const hw = cam.width / 2, hh = cam.height / 2;
    const wx = cam.scrollX + hw + (pointer.x - hw) / z1, wy = cam.scrollY + hh + (pointer.y - hh) / z1;
    cam.setZoom(z2);
    cam.scrollX = wx - hw - (pointer.x - hw) / z2; cam.scrollY = wy - hh - (pointer.y - hh) / z2;
}
/** World rect currently visible (+margin) */
function viewRect(m) {
    const hw = cam.width / 2, hh = cam.height / 2, z = cam.zoom;
    return { x0: cam.scrollX + hw - hw / z - m, y0: cam.scrollY + hh - hh / z - m, x1: cam.scrollX + hw + hw / z + m, y1: cam.scrollY + hh + hh / z + m };
}

// ============================================================================
// MINIMAP (DOM canvas, ~4 refreshes / s + camera frame)
// ============================================================================
let mm = null, mmCtx = null, mmBase = null, mmScale = 1, mmNext = 0, mmDrag = false;
function initMinimap() {
    mm = document.getElementById('minimap');
    mmScale = MINIMAP_W / WORLD_W;
    mm.width = MINIMAP_W; mm.height = Math.round(WORLD_H * mmScale);
    mmCtx = mm.getContext('2d', { willReadFrequently: true }); // CPU canvas: avoids a GPU layer ghost seen in Chromium
    mmBase = document.createElement('canvas'); mmBase.width = mm.width; mmBase.height = mm.height;
    const b = mmBase.getContext('2d'), s = mmScale;
    b.fillStyle = '#1a2a16'; b.fillRect(0, 0, mm.width, mm.height);
    const a = tileCenter(0, 0), r = tileCenter(MAP_SIZE - 1, 0), d = tileCenter(MAP_SIZE - 1, MAP_SIZE - 1), l = tileCenter(0, MAP_SIZE - 1);
    b.fillStyle = '#4a7d3a'; b.beginPath();
    b.moveTo(a.x * s, (a.y - 16) * s); b.lineTo((r.x + 32) * s, r.y * s); b.lineTo(d.x * s, (d.y + 16) * s); b.lineTo((l.x - 32) * s, l.y * s); b.closePath(); b.fill();
    const move = e => { const rc = mm.getBoundingClientRect(); cam.centerOn((e.clientX - rc.left) / rc.width * WORLD_W, (e.clientY - rc.top) / rc.height * WORLD_H); };
    mm.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (e.button !== 0) return; mmDrag = true; mm.setPointerCapture(e.pointerId); move(e); });
    mm.addEventListener('pointermove', e => { if (mmDrag) move(e); });
    mm.addEventListener('pointerup', () => { mmDrag = false; });
    mm.addEventListener('contextmenu', e => e.preventDefault());
}
const MM_COL = { tree: '#1d4a1a', berry: '#d04a8a', gold: '#f0d040', stone: '#b0b0b0', house: '#3a6ad0', tc: '#3a6ad0' };
let mmDots = null;
function updateMinimap(time) {
    const c = mmCtx, s = mmScale;
    if (time >= mmNext || !mmDots) {      // rebuild resource/building layer 4x / s
        mmNext = time + 250;
        mmDots = document.createElement('canvas'); mmDots.width = mm.width; mmDots.height = mm.height;
        const d = mmDots.getContext('2d'); d.drawImage(mmBase, 0, 0);
        for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
            const cell = mapData[y][x]; if (!cell) continue;
            const p = tileCenter(x, y); d.fillStyle = MM_COL[cell.kind] || '#fff';
            const z = cell.kind === 'tc' ? 4 : cell.kind === 'tree' ? 2 : 3; d.fillRect(p.x * s - z / 2, p.y * s - z / 2, z, z);
        }
    }
    c.drawImage(mmDots, 0, 0);
    c.fillStyle = '#ffffff';
    villagers.forEach(v => { c.fillStyle = v.selected ? '#ffff66' : '#ffffff'; c.fillRect(v.x * s - 1.5, v.y * s - 1.5, 3, 3); });
    const r = viewRect(0);
    c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.strokeRect(r.x0 * s + 0.5, r.y0 * s + 0.5, (r.x1 - r.x0) * s, (r.y1 - r.y0) * s);
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
/** Bake the grass into CHUNK x CHUNK tile canvases (one image each, hidden when off screen) */
function bakeGround(scene) {
    const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    const greens = ['#4a7d3a', '#44753a', '#4f8540', '#3f6e35', '#538a43'];
    const t = townCenter, tc = tileCenter(t.x + 0.5, t.y + 0.5);
    let n = 0;
    for (let cy0 = 0; cy0 < MAP_SIZE; cy0 += CHUNK) for (let cx0 = 0; cx0 < MAP_SIZE; cx0 += CHUNK) {
        const x1 = Math.min(MAP_SIZE, cx0 + CHUNK), y1 = Math.min(MAP_SIZE, cy0 + CHUNK);
        const left = tileCenter(cx0, y1 - 1).x - hw, right = tileCenter(x1 - 1, cy0).x + hw;
        const top = tileCenter(cx0, cy0).y - hh, bottom = tileCenter(x1 - 1, y1 - 1).y + hh;
        const W = Math.ceil(right - left), H = Math.ceil(bottom - top);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const c = cv.getContext('2d'); c.translate(-left, -top);
        for (let y = cy0; y < y1; y++) for (let x = cx0; x < x1; x++) {
            const p = tileCenter(x, y);
            c.save(); c.beginPath();
            c.moveTo(p.x, p.y - hh - 0.5); c.lineTo(p.x + hw + 0.5, p.y); c.lineTo(p.x, p.y + hh + 0.5); c.lineTo(p.x - hw - 0.5, p.y); c.closePath();
            c.fillStyle = greens[Math.floor(hash(x, y) * greens.length)]; c.fill(); c.clip();
            for (let i = 0; i < 3; i++) {
                c.fillStyle = hash(x, y, i + 10) > 0.5 ? 'rgba(255,255,200,0.07)' : 'rgba(0,30,0,0.10)';
                c.beginPath(); c.ellipse(p.x + (hash(x, y, i) - 0.5) * 50, p.y + (hash(x, y, i + 3) - 0.5) * 24, 10 + hash(x, y, i + 6) * 12, 5 + hash(x, y, i + 7) * 5, 0, 0, 7); c.fill();
            }
            c.strokeStyle = 'rgba(120,170,80,0.55)'; c.lineWidth = 1;
            for (let i = 0; i < 14; i++) {
                const bx = p.x + (hash(x, y, i + 20) - 0.5) * 56, by = p.y + (hash(x, y, i + 40) - 0.5) * 28;
                c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + (hash(x, y, i + 60) - 0.5) * 3, by - 3 - hash(x, y, i + 80) * 3); c.stroke();
            }
            if (hash(x, y, 99) > 0.8) { c.fillStyle = hash(x, y, 98) > 0.5 ? '#f2e46a' : '#f4f4f4'; for (let i = 0; i < 3; i++) c.fillRect(p.x + (hash(x, y, i + 90) - 0.5) * 36, p.y + (hash(x, y, i + 95) - 0.5) * 14, 2, 2); }
            if (hash(x, y, 97) > 0.88) { c.fillStyle = '#8c8c7c'; c.beginPath(); c.ellipse(p.x + 10, p.y + 4, 3, 2, 0, 0, 7); c.fill(); }
            c.restore();
            c.strokeStyle = 'rgba(0,0,0,0.08)'; c.beginPath();
            c.moveTo(p.x, p.y - hh); c.lineTo(p.x + hw, p.y); c.lineTo(p.x, p.y + hh); c.lineTo(p.x - hw, p.y); c.closePath(); c.stroke();
        }
        if (Math.abs(tc.x - (left + right) / 2) < W / 2 + 110 && Math.abs(tc.y - (top + bottom) / 2) < H / 2 + 60) {  // dirt around TC
            const grd = c.createRadialGradient(tc.x, tc.y, 10, tc.x, tc.y, 90);
            grd.addColorStop(0, 'rgba(150,120,80,0.9)'); grd.addColorStop(0.6, 'rgba(140,110,70,0.5)'); grd.addColorStop(1, 'rgba(140,110,70,0)');
            c.fillStyle = grd; c.beginPath(); c.ellipse(tc.x, tc.y, 100, 52, 0, 0, 7); c.fill();
        }
        const key = 'ground' + (n++);
        scene.textures.addCanvas(key, cv);
        const img = scene.add.image(left, top, key).setOrigin(0, 0).setDepth(-1);
        groundChunks.push({ img, x0: left, y0: top, x1: right, y1: bottom });
    }
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
    const vr = viewRect(80);
    groundChunks.forEach(c => c.img.setVisible(c.x1 > vr.x0 && c.x0 < vr.x1 && c.y1 > vr.y0 && c.y0 < vr.y1));
    // visible tile range (iso: check the 4 view corners)
    const cs = [screenToTile(vr.x0, vr.y0), screenToTile(vr.x1, vr.y0), screenToTile(vr.x0, vr.y1), screenToTile(vr.x1, vr.y1)];
    const tx0 = Math.max(0, Math.min(...cs.map(c => c.x)) - 1), tx1 = Math.min(MAP_SIZE - 1, Math.max(...cs.map(c => c.x)) + 1);
    const ty0 = Math.max(0, Math.min(...cs.map(c => c.y)) - 1), ty1 = Math.min(MAP_SIZE - 1, Math.max(...cs.map(c => c.y)) + 3);
    const vis = (x, y) => { const p = tileCenter(x, y); return p.x > vr.x0 && p.x < vr.x1 && p.y > vr.y0 && p.y < vr.y1 + 60; };
    if (placing === 'house') {              // show free tiles + hover preview while placing
        for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (!mapData[y][x] && vis(x, y)) diamond(g, x, y, 0xffffff, 0.06);
        if (hoverTile && inMap(hoverTile.x, hoverTile.y)) diamond(g, hoverTile.x, hoverTile.y, mapData[hoverTile.y][hoverTile.x] ? 0xff3333 : 0x33ff33, 0.45);
    }
    const items = [];
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        if (!vis(x, y)) continue;
        const c = mapData[y][x];
        if (c && c.kind === 'house') items.push({ d: tileCenter(x, y).y, draw: () => drawHouse(g, x, y, c.house) });
        else if (c && c.kind !== 'tc') items.push({ d: tileCenter(x, y).y, draw: () => drawNode(g, x, y, c) });
    }
    const tcC = tileCenter(townCenter.x + 0.5, townCenter.y + 0.5);
    items.push({ d: tcC.y + 16, draw: () => drawTC(g) });
    villagers.forEach(v => { if (v.x > vr.x0 && v.x < vr.x1 && v.y > vr.y0 && v.y < vr.y1 + 40) items.push({ d: v.y, draw: () => drawVillager(g, v) }); });
    items.sort((a, b) => a.d - b.d).forEach(i => i.draw());
    if (dragSel && dragSel.active) {        // selection rectangle
        const x = Math.min(dragSel.sx, dragSel.ex), y = Math.min(dragSel.sy, dragSel.ey), w = Math.abs(dragSel.ex - dragSel.sx), h = Math.abs(dragSel.ey - dragSel.sy);
        g.fillStyle(0xffffff, 0.08); g.fillRect(x, y, w, h); g.lineStyle(1.5 / cam.zoom, 0xffffff, 0.9); g.strokeRect(x, y, w, h);
    }
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
        if (gold && Math.sin(animT / 300 + x * 3 + y) > 0.97) { g.fillStyle(0xffffff, 0.9); g.fillCircle(p.x + 4, p.y - 8, 1.6); }
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
    const fl = Math.sin(animT / 200) * 2;
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
    const T = animT, x = v.x, y = v.y, face = v.face || 1;
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
    let best = null, bd = 16;
    villagers.forEach(v => { const d = Math.hypot(v.x - px, (v.y - 12) - py); if (d < bd) { bd = d; best = v; } });
    return best;
}
function deselectAll() { villagers.forEach(u => u.selected = false); townCenter.selected = false; }
function onPointerDown(pointer) {
    const px = pointer.worldX, py = pointer.worldY;
    if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        if (placing) { placing = null; flash('Placement cancelled'); panDrag = null; return; }
        panDrag = { x: pointer.x, y: pointer.y, sx: cam.scrollX, sy: cam.scrollY, moved: false, right: pointer.rightButtonDown(), wx: px, wy: py };
        return;
    }
    Sfx.play('tap', 0.05);
    if (placing === 'house') { placeHouse(screenToTile(px, py)); return; }
    dragSel = { sx: px, sy: py, ex: px, ey: py, x: pointer.x, y: pointer.y, active: false, shift: pointer.event.shiftKey };
}
function onPointerMove(pointer) {
    hoverTile = screenToTile(pointer.worldX, pointer.worldY);
    if (panDrag) {
        const dx = pointer.x - panDrag.x, dy = pointer.y - panDrag.y;
        if (Math.hypot(dx, dy) > 6) panDrag.moved = true;
        if (panDrag.moved) { cam.scrollX = panDrag.sx - dx / cam.zoom; cam.scrollY = panDrag.sy - dy / cam.zoom; }
    } else if (dragSel) {
        dragSel.ex = pointer.worldX; dragSel.ey = pointer.worldY;
        if (Math.hypot(pointer.x - dragSel.x, pointer.y - dragSel.y) > 6) dragSel.active = true;
    }
}
function onPointerUp(pointer) {
    if (panDrag) {
        const p = panDrag; panDrag = null;
        if (!p.moved && p.right) rightClick(p.wx, p.wy);
        return;
    }
    if (!dragSel) return;
    const d = dragSel; dragSel = null;
    if (d.active) {
        const x0 = Math.min(d.sx, d.ex), x1 = Math.max(d.sx, d.ex), y0 = Math.min(d.sy, d.ey), y1 = Math.max(d.sy, d.ey);
        const inside = villagers.filter(v => v.x >= x0 && v.x <= x1 && v.y - 12 >= y0 - 10 && v.y - 12 <= y1 + 10);
        if (!d.shift) deselectAll();
        townCenter.selected = false;
        inside.forEach(v => v.selected = true);
        return;
    }
    leftClick(d.sx, d.sy, d.shift);
}
function leftClick(px, py, shift) {
    const v = villagerAt(px, py);
    if (v) {
        townCenter.selected = false;
        if (shift) v.selected = !v.selected; else { deselectAll(); v.selected = true; }
        return;
    }
    const t = screenToTile(px, py), cell = inMap(t.x, t.y) && mapData[t.y][t.x];
    if (cell && cell.kind === 'tc' && !shift) { deselectAll(); townCenter.selected = true; return; }
    if (!shift) deselectAll();     // empty ground / resource: deselect
}
/** AoE2-style right-click order for the selection */
function rightClick(px, py) {
    const sel = villagers.filter(u => u.selected);
    if (!sel.length) return;
    const t = screenToTile(px, py);
    if (!inMap(t.x, t.y)) return;
    const cell = mapData[t.y][t.x];
    Sfx.play('tap', 0.05);
    if (cell && RES_TYPES[cell.kind]) sel.forEach(u => orderGather(u, t.x, t.y));
    else if (cell && cell.kind === 'tc') sel.forEach((u, i) => { if (u.carry > 0) u.state = 'returning'; else orderMove(u, t.x, t.y + 2, i); });
    else if (cell && cell.kind === 'house') { if (!cell.house.done) sel.forEach(u => orderBuild(u, cell.house)); }
    else sel.forEach((u, i) => orderMove(u, t.x, t.y, i));
}
function placeHouse(t0) {
    const builders = villagers.filter(u => u.selected);
    if (!inMap(t0.x, t0.y) || mapData[t0.y][t0.x] || !builders.length || !canAfford(HOUSE_COST)) { flash('Can\'t build there'); Sfx.play('error'); return; }
    placing = null;
    pay(HOUSE_COST);
    const h = { x: t0.x, y: t0.y, progress: 0, done: false };
    houses.push(h); mapData[t0.y][t0.x] = { kind: 'house', house: h };
    builders.forEach(u => orderBuild(u, h));
}

// ============================================================================
// PAUSE + KEYS
// ============================================================================
const pauseBtn = document.getElementById('pause-btn'), pauseOv = document.getElementById('pause-overlay');
function setPaused(p) {
    paused = p; pauseBtn.textContent = p ? '▶' : '⏸'; pauseOv.style.display = p ? 'flex' : 'none';
}
pauseBtn.addEventListener('pointerdown', e => { e.stopPropagation(); setPaused(!paused); });
document.getElementById('resume-btn').addEventListener('pointerdown', e => { e.stopPropagation(); setPaused(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
window.addEventListener('keydown', e => {
    if (e.key === 'p' || e.key === 'P') setPaused(!paused);
    else if (e.key === 'Escape') { if (placing) { placing = null; flash('Placement cancelled'); } else deselectAll(); }
    else if (e.key === ' ') { e.preventDefault(); if (cam) centerOnTC(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); townCenter.selected = false; villagers.forEach(u => u.selected = true); }
});

// ============================================================================
// COMMAND BAR (DOM, big touch buttons)
// ============================================================================
const bar = document.getElementById('command-bar');
const DEFAULT_INFO = 'Left-click/drag to select · right-click to gather, move or build · wheel zoom · right-drag pan · Space = Town Center · P pause';
let flashTimer = 0;
function flash(msg) {
    infoText.setText(msg); clearTimeout(flashTimer);
    flashTimer = setTimeout(() => infoText.setText(DEFAULT_INFO), 1800);
}
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
            button('house', placing ? 'Click a tile… (Esc)' : 'Build House', costText(HOUSE_COST) + ` · +${POP_PER_HOUSE} pop`, canAfford(HOUSE_COST)) +
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
    else if (cmd === 'house') { placing = placing ? null : 'house'; if (placing) flash('Left-click a free tile to place the House · right-click or Esc cancels'); }
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
