/**
 * AOE RTS - Tiny Slice Isometric Game (Phaser 3)
 * R2c: animals - seeded deer herds (wander on land, flee briefly, hunted with a spear -> carcass ~100 food,
 *     fast gather, finite) and fish spots on lakes/ponds (~150 food, gathered from the shore with a net).
 * R2a: speed 1x-5x (sub-stepped sim), female villagers (training alternates), auto-start on the last map,
 *     seeded ponds/lakes (water blocks walking + building) and 8-dir grid A* for all villager movement.
 * R1b: high-res art (tile 128x64, villager ~110px, trees ~150-185px, TC ~280px) pre-rendered once into
 *     texture atlases by aoe-rts_art.js and shown as pooled images; everything else scaled 2x.
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
const TILE_WIDTH = 128;
const TILE_HEIGHT = 64;
// Procedural maps 00-99: number from ?map=NN, else last saved, else 00. Size rounds up to multiples of 16.
const URL_MAP = (() => { const v = new URLSearchParams(location.search).get('map'); return v !== null && /^\d{1,2}$/.test(v.trim()) ? parseInt(v, 10) : null; })();
function storedMap() { try { const v = localStorage.getItem('aoe-rts.map'); return v !== null && /^\d{1,2}$/.test(v) ? parseInt(v, 10) : null; } catch (e) { return null; } }
const MAP_NUM = URL_MAP !== null ? URL_MAP : (storedMap() !== null ? storedMap() : 0);
/** Map number -> tiles per side: 00=16, 01-20=32, 21-40=48, 41-60=64, 61-80=80, 81-99=96 */
function mapSizeFor(n) { return n <= 0 ? 16 : 16 * (1 + Math.ceil(n / 20)); }
function mapLabel(n) { return String(n).padStart(2, '0'); }
let MAP_SIZE = mapSizeFor(MAP_NUM);   // tiles per side (only the test hook swaps it)
const WORLD_MARGIN = 192;          // px of empty border around the map diamond
const WORLD_W = MAP_SIZE * TILE_WIDTH + WORLD_MARGIN * 2;
const WORLD_H = MAP_SIZE * TILE_HEIGHT + WORLD_MARGIN * 2 + 280;
const ORIGIN_X = WORLD_W / 2;     // world x of tile (0,0) top corner
const ORIGIN_Y = WORLD_MARGIN + 280; // world y of tile (0,0) top corner (room for tall sprites)
const ZOOM_DEFAULT = 1.1, ZOOM_MAX = 2, ZOOM_MIN_ABS = 0.15;
const PAN_SPEED = 900;            // screen px / s for keys + edge scroll
const EDGE_PX = 14;               // screen edge scroll band
const CHUNK = 8;                  // grass chunk size in tiles
const MINIMAP_W = 180;
const VILLAGER_SPEED = 140;       // px / s
const CARRY_MAX = 10;
const GATHER_INTERVAL = 0.6;      // seconds per 1 unit gathered
const BERRY_REGROW = 0.4;         // seconds per 1 food regrown on every berry bush (full 125 in ~50s)
const START_RES = { wood: 200, food: 200, gold: 100, stone: 200 };
const START_VILLAGERS = 3;
const VILLAGER_COST = { food: 50 };
const TRAIN_TIME = 6;             // seconds per villager
const QUEUE_MAX = 5;
const HOUSE_COST = { wood: 25 };
const HOUSE_BUILD_TIME = 8;       // seconds for one villager
const POP_BASE = 5;               // Town Center supports 5
const POP_PER_HOUSE = 5;
const SPEEDS = [1, 2, 3, 4, 5];
const SIM_STEP = 1 / 30;          // max simulated seconds per sub-step (5x at 30fps = 5 sub-steps)
const PATH_BUDGET = 12;           // A* searches allowed per frame (others wait a frame)
const DEER_SPEED = 42, DEER_FLEE_SPEED = 175;   // px / s
const DEER_FLEE_R = 130;          // iso-corrected px: a villager this close makes a deer bolt
const DEER_FLEE_T = 1.1, DEER_FLEE_CD = 2.6;    // seconds of fleeing, then calm-down before it can bolt again
const HUNT_R = 200;               // iso-corrected px: hunters throw from here (outside the flee radius)
const HUNT_AIM = 0.8;             // seconds to aim + throw

/** Resource node definitions */
const RES_TYPES = {
    tree:  { res: 'wood',  amount: 100, color: 0x1f4d1f, label: 'Wood'  },
    berry: { res: 'food',  amount: 125, color: 0xc0306a, label: 'Food'  },
    gold:  { res: 'gold',  amount: 400, color: 0xe8c33a, label: 'Gold'  },
    stone: { res: 'stone', amount: 350, color: 0x9a9a9a, label: 'Stone' },
    carcass: { res: 'food', amount: 100, color: 0x8a5a2a, label: 'Food', rate: 0.3 },   // hunted deer (finite)
    fish:  { res: 'food',  amount: 150, color: 0x9ad8ff, label: 'Food', rate: 0.45 }   // on water, gathered from shore
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
let keys = null, pointerInside = false, ctrlHeld = false;
let pool = [], poolN = 0, gUnder = null;
let speed = 1;           // game speed multiplier (not saved)
let water = new Uint8Array(MAP_SIZE * MAP_SIZE);   // 1 = water tile (blocks walking + building)
let deer = [];           // R2c: { x, y, hx, hy, ant, state, timer, gx, gy, face, seed, cd }
let trainedCount = 0;    // villagers made so far: even = male, odd = female
window.addEventListener('keydown', e => { if (e.key === 'Control' || e.key === 'Meta') ctrlHeld = true; });
window.addEventListener('keyup', e => { if (e.key === 'Control' || e.key === 'Meta') ctrlHeld = false; });
window.addEventListener('blur', () => { ctrlHeld = false; });

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
/** Hash the map number into an RNG seed so neighbouring numbers give very different maps */
function mapSeed(n) {
    let h = Math.imul(n + 1, 0x9E3779B1) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35) >>> 0; h ^= h >>> 16;
    return ((h >>> 0) % 2147483646) + 1;
}
function initMap(num) {
    const S = MAP_SIZE;
    mapData = [];
    for (let y = 0; y < S; y++) { mapData[y] = []; for (let x = 0; x < S; x++) mapData[y][x] = null; }
    let rnd = mapSeed(num); const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;  // seeded
    for (let i = 0; i < 5; i++) R();
    // Town Center 2x2 near the middle (seeded jitter on bigger maps)
    const jit = Math.floor(S / 10);
    const m0 = Math.floor(S / 2) - 1;
    const mx = m0 + Math.round((R() - 0.5) * 2 * jit), my = m0 + Math.round((R() - 0.5) * 2 * jit);
    townCenter = { x: mx, y: my, w: 2, h: 2 };
    for (let y = my; y < my + 2; y++) for (let x = mx; x < mx + 2; x++) mapData[y][x] = { kind: 'tc' };
    const cx0 = mx + 0.5, cy0 = my + 0.5;
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
function isWater(x, y) { return inMap(x, y) && water[y * MAP_SIZE + x] === 1; }
function isLand(x, y) { return inMap(x, y) && water[y * MAP_SIZE + x] === 0; }
/** Seeded ponds / lakes (own RNG so land layouts stay as in R1). Keeps the TC area dry, then floods
 *  any land not connected to the TC so every tile and resource stays reachable. */
function initWater(num) {
    const S = MAP_SIZE; water = new Uint8Array(S * S);
    let rnd = (mapSeed(num) ^ 0x5bd1e995) % 2147483646 + 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5; i++) R();
    const cx0 = townCenter.x + 0.5, cy0 = townCenter.y + 0.5, keep = S <= 16 ? 4.6 : 11.5;
    const lake = (lx, ly, rad) => {
        const ph = [R() * 6.283, R() * 6.283, R() * 6.283], am = [0.25 + R() * 0.2, 0.12 + R() * 0.12, 0.08];
        for (let y = Math.floor(ly - rad * 1.6); y <= ly + rad * 1.6; y++) for (let x = Math.floor(lx - rad * 1.6); x <= lx + rad * 1.6; x++) {
            if (!inMap(x, y) || Math.hypot(x - cx0, y - cy0) < keep) continue;
            const a = Math.atan2(y - ly, x - lx), k = 1 + am[0] * Math.sin(a * 2 + ph[0]) + am[1] * Math.sin(a * 3 + ph[1]) + am[2] * Math.sin(a * 5 + ph[2]);
            if (Math.hypot(x - lx, y - ly) <= rad * k) water[y * S + x] = 1;
        }
    };
    const spot = (minD) => { for (let t = 0; t < 40; t++) { const x = 1 + R() * (S - 2), y = 1 + R() * (S - 2); if (Math.hypot(x - cx0, y - cy0) >= minD) return [x, y]; } return null; };
    if (S <= 16) { if (R() < 0.5) { const p = spot(5.5); if (p) lake(p[0], p[1], 0.9); } }
    else if (S <= 32) { const n = 1 + Math.floor(R() * 2); for (let i = 0; i < n; i++) { const p = spot(keep + 2); if (p) lake(p[0], p[1], 0.8 + R() * 0.7); } }
    else {
        const target = S * S * (0.05 + 0.10 * Math.min(1, (S - 48) / 48)) * (0.6 + R() * 0.4);
        let tries = 0, cnt = () => water.reduce((a, b) => a + b, 0);
        while (cnt() < target && tries++ < 12) { const p = spot(keep + 3); if (p) lake(p[0], p[1], 2 + R() * Math.min(9, S / 9)); }
        const ponds = Math.floor(R() * 3); for (let i = 0; i < ponds; i++) { const p = spot(keep + 2); if (p) lake(p[0], p[1], 0.8 + R() * 0.6); }
    }
    // Flood land cut off from the TC (enclosed pockets / map-edge corners), so all land is one walkable area
    const seen = new Uint8Array(S * S), st = [townCenter.y * S + townCenter.x]; seen[st[0]] = 1;
    while (st.length) { const i = st.pop(), x = i % S, y = (i - x) / S;
        for (let d = 0; d < 4; d++) { const nx = x + [1, -1, 0, 0][d], ny = y + [0, 0, 1, -1][d], j = ny * S + nx;
            if (inMap(nx, ny) && !seen[j] && !water[j]) { seen[j] = 1; st.push(j); } } }
    for (let i = 0; i < S * S; i++) if (!seen[i]) water[i] = 1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (water[y * S + x] && mapData[y][x] && mapData[y][x].kind !== 'tc') mapData[y][x] = null;
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
/** Test hook: animal placement checks */
function animalReport() {
    const S = MAP_SIZE, cx0 = townCenter.x + 0.5, cy0 = townCenter.y + 0.5, keep = animalKeep();
    let deerOnWater = 0, deerInRing = 0, fish = 0, fishBad = 0, fishInRing = 0, carcass = 0, h = 2166136261;
    deer.forEach(d => { const t = screenToTile(d.x, d.y); if (!isLand(t.x, t.y)) deerOnWater++; if (Math.hypot(t.x - cx0, t.y - cy0) < keep) deerInRing++;
        const s = t.x + ',' + t.y + (d.ant ? 'a' : ''); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; });
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = mapData[y][x]; if (!c) continue;
        if (c.kind === 'carcass') carcass++;
        if (c.kind !== 'fish') continue; fish++; h = Math.imul(h ^ (y * S + x), 16777619) >>> 0;
        if (!isWater(x, y) || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(o => isLand(x + o[0], y + o[1]))) fishBad++;
        if (Math.hypot(x - cx0, y - cy0) < keep) fishInRing++; }
    return { deer: deer.length, herds: new Set(deer.map(d => d.hx + ',' + d.hy)).size, deerOnWater, deerInRing, fish, fishBad, fishInRing, carcass, hash: h.toString(16) };
}
/** Test hook: BFS from the TC over land (8-dir, no corner cutting, same rules as A*) */
function reachReport() {
    const S = MAP_SIZE, seen = new Uint8Array(S * S), st = [townCenter.y * S + townCenter.x]; seen[st[0]] = 1;
    while (st.length) { const i = st.pop(), x = i % S, y = (i - x) / S;
        for (let k = 0; k < 8; k++) { const dx = DIRS[k][0], dy = DIRS[k][1], nx = x + dx, ny = y + dy, j = ny * S + nx;
            if (!isLand(nx, ny) || seen[j] || (dx && dy && (!isLand(x + dx, y) || !isLand(x, y + dy)))) continue; seen[j] = 1; st.push(j); } }
    let res = 0, unreach = 0, onWater = 0, land = 0, landUnreach = 0, w = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, c = mapData[y][x];
        if (water[i]) w++; else { land++; if (!seen[i]) landUnreach++; }
        if (c && c.kind !== 'tc' && c.kind !== 'fish') { res++; if (water[i]) onWater++; if (!seen[i]) unreach++; }
        if (c && c.kind === 'tc' && (!seen[i] || water[i])) unreach++; }
    return { res, unreach, onWater, landUnreach, waterTiles: w, waterPct: Math.round(w / (S * S) * 1000) / 10 };
}
/** Test hook: counts of resources within 10 tiles of the TC */
function fairStartCounts() {
    const c = { tree: 0, berry: 0, gold: 0, stone: 0, berryClusters: 0 }, cx0 = townCenter.x + 0.5, cy0 = townCenter.y + 0.5, seen = {};
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) { const k = mapData[y][x]; if (!k || !(k.kind in c)) continue;
        if (Math.hypot(x - cx0, y - cy0) <= 10.5) c[k.kind]++; }
    // berry clusters = connected groups (8-neighbour) with any bush within 10 tiles
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) { const k = mapData[y][x];
        if (!k || k.kind !== 'berry' || seen[y * MAP_SIZE + x]) continue;
        const st = [[x, y]]; seen[y * MAP_SIZE + x] = 1; let near = false;
        while (st.length) { const [px, py] = st.pop(); if (Math.hypot(px - cx0, py - cy0) <= 10.5) near = true;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const qx = px + dx, qy = py + dy;
                if (inMap(qx, qy) && !seen[qy * MAP_SIZE + qx] && mapData[qy][qx] && mapData[qy][qx].kind === 'berry') { seen[qy * MAP_SIZE + qx] = 1; st.push([qx, qy]); } } }
        if (near) c.berryClusters++; }
    let tcRing = true;
    for (let y = townCenter.y - 1; y <= townCenter.y + 2; y++) for (let x = townCenter.x - 1; x <= townCenter.x + 2; x++) {
        const k = inMap(x, y) && mapData[y][x]; if (k && k.kind !== 'tc' && k.kind !== 'fish') tcRing = false; }
    c.ringClear = tcRing; return c;
}
function mapHash() { let h = 2166136261; for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) { const k = mapData[y][x] && mapData[y][x].kind !== 'fish' ? mapData[y][x] : null;   // R2a layout hash (animals excluded)
    const s = (k ? k.kind[0] + k.max : '.') + (water[y * MAP_SIZE + x] ? 'w' : ''); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; } return h.toString(16); }
/** Test hook: generate any map number (only valid for numbers with this page's size) without touching the scene */
window.aoeTest = {
    MAP_NUM, MAP_SIZE, mapSizeFor, mapHash, fairStartCounts,
    gen(n) { const sv = [mapData, townCenter, MAP_SIZE, water, deer]; MAP_SIZE = mapSizeFor(n); initMap(n); initWater(n); initAnimals(n); const r = { hash: mapHash(), fair: fairStartCounts(), tc: Object.assign({}, townCenter), reach: reachReport(), animals: animalReport() }; r.size = MAP_SIZE; mapData = sv[0]; townCenter = sv[1]; MAP_SIZE = sv[2]; water = sv[3]; deer = sv[4]; return r; },
    get villagers() { return villagers; }, get resources() { return resources; }, orderGather: (v, x, y) => orderGather(v, x, y), findNearest,
    get speed() { return speed; }, setSpeed: n => setSpeed(n), get water() { return water; }, get townCenter() { return townCenter; }, get mapData() { return mapData; },
    reachReport, isLand, tileCenter, findPath: (a, b, c, d) => findPath(a, b, c, d), orderMove: (v, x, y) => orderMove(v, x, y), pathStats: null, spawnVillager: (x, y) => spawnVillager(x, y),
    get deer() { return deer; }, animalReport, orderHunt: (v, d) => orderHunt(v, d)
};

// ============================================================================
// VILLAGERS
// ============================================================================
function spawnVillager(tx, ty) {
    const p = tileCenter(tx, ty), fem = trainedCount++ % 2 === 1;   // male, female, male, ...
    const v = { fem, x: p.x, y: p.y, state: 'idle', target: null, node: null, carry: 0, carryType: null, timer: 0, selected: false, face: 1, walking: false, seed: Math.random() };
    villagers.push(v);
    return v;
}
/** Nearest drop-off point (edge of Town Center facing the villager) */
function dropPoint(v) {
    const c = tileCenter(townCenter.x + 0.5, townCenter.y + 0.5);
    const dx = v.x - c.x, dy = v.y - c.y, d = Math.hypot(dx, dy) || 1;
    return { x: c.x + dx / d * 112, y: c.y + dy / d * 58 };
}
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
/** Iso-corrected distance (screen dy doubled, so it reads like ground distance) */
function isoDist(ax, ay, bx, by) { return Math.hypot(bx - ax, (by - ay) * 2); }
function nearestDeer(from) { let best = null, bd = Infinity; deer.forEach(d => { const k = isoDist(from.x, from.y, d.x, d.y); if (k < bd) { bd = k; best = d; } }); return best; }
/** Carcass goes on the deer's tile, or the nearest free land tile */
function placeCarcass(px, py) {
    const t = screenToTile(px, py);
    for (let r = 0; r < 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = t.x + dx, y = t.y + dy;
        if (isLand(x, y) && !mapData[y][x]) { mapData[y][x] = { kind: 'carcass', amount: RES_TYPES.carcass.amount, max: RES_TYPES.carcass.amount }; return { x, y }; } }
    return null;
}
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
function orderBuild(v, h) {
    v.prey = null; v.node = null; v.house = h; v.state = 'toBuild';
    const p = tileCenter(h.x, h.y); v.target = { x: p.x + (Math.random() - 0.5) * 60, y: p.y + 34 };
}
function orderMove(v, tx, ty, idx) {
    v.house = null; v.prey = null;
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
// ---------------------------------------------------------------------------
// PATHFINDING: 8-dir grid A* over land tiles (no corner cutting), LOS-smoothed, cached, budgeted per frame
// ---------------------------------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const pathStats = { calls: 0, cached: 0, totalMs: 0, maxMs: 0, waits: 0 };
let pathBudget = PATH_BUDGET, pathCache = new Map();
let asG = null, asFrom = null, asOpen = null, asClosed = null, asGen = 0, heapI = [], heapF = [];
/** World px -> fractional tile coords (tile centres are integers) */
function tileF(px, py) { const lx = (px - ORIGIN_X) / (TILE_WIDTH / 2), ly = (py - ORIGIN_Y - TILE_HEIGHT / 2) / (TILE_HEIGHT / 2); return { x: (lx + ly) / 2, y: (ly - lx) / 2 }; }
/** Straight walk a->b (world px) stays on land with a little clearance */
function losClear(ax, ay, bx, by) {
    const a = tileF(ax, ay), b = tileF(bx, by), n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4) + 1;
    for (let i = 0; i <= n; i++) { const fx = a.x + (b.x - a.x) * i / n, fy = a.y + (b.y - a.y) * i / n;
        for (let k = 0; k < 4; k++) if (!isLand(Math.round(fx + (k & 1 ? 0.28 : -0.28)), Math.round(fy + (k & 2 ? 0.28 : -0.28)))) return false; }
    return true;
}
/** Nearest land tile to (x,y) (itself when dry) */
function nearestLand(x, y) {
    x = Math.max(0, Math.min(MAP_SIZE - 1, x)); y = Math.max(0, Math.min(MAP_SIZE - 1, y));
    if (isLand(x, y)) return { x, y };
    for (let r = 1; r < MAP_SIZE; r++) { let best = null, bd = Infinity;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !isLand(x + dx, y + dy)) continue;
            const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x + dx, y: y + dy }; } }
        if (best) return best; }
    return { x, y };
}
function heapPush(i, f) { let k = heapI.length; heapI.push(i); heapF.push(f);
    while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; } heapI[k] = i; heapF[k] = f; }
function heapPop() { const top = heapI[0], li = heapI.pop(), lf = heapF.pop(), n = heapI.length;
    if (n) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= lf) break; heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c; } heapI[k] = li; heapF[k] = lf; }
    return top; }
/** A* from tile (sx,sy) to (gx,gy), both land. Returns tile list [[x,y]...] incl. both ends, or null */
function findPath(sx, sy, gx, gy) {
    const S = MAP_SIZE, N = S * S, key = (sy * S + sx) * N + gy * S + gx;
    if (pathCache.has(key)) { pathStats.cached++; return pathCache.get(key); }
    const t0 = performance.now();
    if (!asG || asG.length !== N) { asG = new Float32Array(N); asFrom = new Int32Array(N); asOpen = new Uint32Array(N); asClosed = new Uint32Array(N); asGen = 0; }
    asGen++; heapI.length = 0; heapF.length = 0;
    const s0 = sy * S + sx, g0 = gy * S + gx, h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy); };
    asG[s0] = 0; asFrom[s0] = -1; asOpen[s0] = asGen; heapPush(s0, h(sx, sy));
    let found = false;
    while (heapI.length) {
        const i = heapPop(); if (asClosed[i] === asGen) continue; asClosed[i] = asGen;
        if (i === g0) { found = true; break; }
        const x = i % S, y = (i - x) / S;
        for (let k = 0; k < 8; k++) { const dx = DIRS[k][0], dy = DIRS[k][1], nx = x + dx, ny = y + dy;
            if (!isLand(nx, ny)) continue;
            if (dx && dy && (!isLand(x + dx, y) || !isLand(x, y + dy))) continue;   // no corner cutting
            const j = ny * S + nx; if (asClosed[j] === asGen) continue;
            const g = asG[i] + (dx && dy ? 1.4142 : 1);
            if (asOpen[j] !== asGen || g < asG[j]) { asOpen[j] = asGen; asG[j] = g; asFrom[j] = i; heapPush(j, g + h(nx, ny)); } }
    }
    let path = null;
    if (found) { path = []; for (let i = g0; i !== -1; i = asFrom[i]) path.push([i % S, (i - i % S) / S]); path.reverse(); }
    const ms = performance.now() - t0; pathStats.calls++; pathStats.totalMs += ms; pathStats.maxMs = Math.max(pathStats.maxMs, ms);
    if (pathCache.size > 300) pathCache.clear();
    pathCache.set(key, path);
    return path;
}
/** Plan a route for v to world point t: list of world waypoints ending at the (land) goal */
function planRoute(v, t) {
    const gt = screenToTile(t.x, t.y), gl = nearestLand(gt.x, gt.y), goalDry = gl.x === gt.x && gl.y === gt.y;
    const end = goalDry ? { x: t.x, y: t.y } : tileCenter(gl.x, gl.y);
    if (losClear(v.x, v.y, end.x, end.y)) return [end];
    if (pathBudget <= 0) { pathStats.waits++; return null; }
    pathBudget--;
    const st = screenToTile(v.x, v.y), sl = nearestLand(st.x, st.y);
    const tiles = findPath(sl.x, sl.y, gl.x, gl.y);
    if (!tiles) return [end];
    // LOS smoothing: from each anchor, run forward while the straight line stays dry
    const pts = tiles.map(p => tileCenter(p[0], p[1])); pts[pts.length - 1] = end;
    const out = []; let ax = v.x, ay = v.y, i = 0;
    while (i < pts.length - 1) { let j = i + 1; while (j + 1 < pts.length && losClear(ax, ay, pts[j + 1].x, pts[j + 1].y)) j++;
        if (j === i + 1 && !losClear(ax, ay, pts[j].x, pts[j].y)) j = i;   // can't see next: go via current tile centre
        if (j === i) { out.push(pts[i]); ax = pts[i].x; ay = pts[i].y; i++; continue; }
        out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; i = j; }
    if (!out.length || out[out.length - 1] !== end) out.push(end);
    return out;
}
/** Move toward target along a planned path, returns true when arrived (or as close as land allows) */
function stepTo(v, t, dt, stopDist) {
    let dx = t.x - v.x, dy = t.y - v.y, d = Math.hypot(dx, dy);
    if (d <= stopDist) { v.route = null; return true; }
    const gt = screenToTile(t.x, t.y), gkey = gt.y * 4096 + gt.x;
    if (!v.route || v.routeKey !== gkey) { const r = planRoute(v, t); if (!r) return false; v.route = r; v.routeKey = gkey; }
    else { const last = v.route[v.route.length - 1]; if (isLand(gt.x, gt.y)) { last.x = t.x; last.y = t.y; } }   // goal drifts inside its tile (drop point)
    let s = VILLAGER_SPEED * dt;
    while (s > 0 && v.route.length) {
        const w = v.route[0], wx = w.x - v.x, wy = w.y - v.y, wd = Math.hypot(wx, wy), final = v.route.length === 1;
        if (final && Math.hypot(t.x - v.x, t.y - v.y) <= stopDist) break;
        v.walking = true; if (Math.abs(wx) > 0.5) v.face = wx > 0 ? 1 : -1;
        if (wd <= s) { v.x = w.x; v.y = w.y; s -= wd; v.route.shift(); }
        else { v.x += wx / wd * s; v.y += wy / wd * s; s = 0; }
    }
    if (!v.route.length) { v.route = null; return true; }   // reached the end (goal itself, or nearest dry tile)
    return Math.hypot(t.x - v.x, t.y - v.y) <= stopDist;
}
function updateVillager(v, dt) {
    switch (v.state) {
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
            h.progress += dt / HOUSE_BUILD_TIME;
            Sfx.play('hammer', 0.45);
            if (h.progress >= 1) { h.progress = 1; h.done = true; v.state = 'idle'; v.house = null; Sfx.play('built'); }
            break;
        }
        case 'returning':
            if (stepTo(v, dropPoint(v), dt, 6)) {
                resources[v.carryType] += v.carry; Sfx.play('drop', 0.15);
                v.carry = 0;
                const cell = v.node && mapData[v.node.y][v.node.x];
                if (cell && (cell.amount > 0 || (cell.kind === 'berry' && !otherBerry(v)))) { v.state = 'toNode'; v.target = tileCenter(v.node.x, v.node.y); }
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

// ============================================================================
// SCENE
// ============================================================================
function create() {
    scene = this; cam = this.cameras.main;
    initMap(MAP_NUM);
    initWater(MAP_NUM);
    initAnimals(MAP_NUM);
    bakeGround(this);
    Art.build(this);
    gUnder = this.add.graphics().setDepth(-5);
    gfx = this.add.graphics().setDepth(1e7);
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
    pathBudget = PATH_BUDGET;
    if (!paused) {
        // speed multiplies simulated time; split into small steps so 5x stays stable (no overshoot)
        const sim = dt * speed, n = Math.max(1, Math.ceil(sim / SIM_STEP - 1e-6)), h = sim / n;
        for (let k = 0; k < n; k++) simStep(h);
    }
    const hud = `Wood ${resources.wood} · Food ${resources.food} · Gold ${resources.gold} · Stone ${resources.stone} · Pop ${popCount()}/${popCap()}`;
    if (hudText.textContent !== hud) hudText.textContent = hud;
    updateBar();
    render();
    updateMinimap(time);
}

function simStep(dt) {
    animT += dt * 1000;
    villagers.forEach(v => { v.walking = false; updateVillager(v, dt); });
    spreadIdle(dt);
    regrowBerries(dt);
    for (let i = 0; i < deer.length; i++) updateDeer(deer[i], dt);
    if (trainQueue > 0 && popCount() < popCap()) {
        trainTimer += dt;
        if (trainTimer >= TRAIN_TIME) { trainTimer = 0; trainQueue--; spawnFromTC(); }
    }
}

// ============================================================================
// CAMERA
// ============================================================================
function updateCameraKeys(dt) {
    let vx = 0, vy = 0;
    if (ctrlHeld) { /* Ctrl+A etc: no pan */ } else if (keys.A.isDown || keys.LEFT.isDown) vx--; if (keys.D.isDown || keys.RIGHT.isDown) vx++;
    if (!ctrlHeld) { if (keys.W.isDown || keys.UP.isDown) vy--; if (keys.S.isDown || keys.DOWN.isDown) vy++; }
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
    b.fillStyle = '#3a78c8';   // water tiles
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) if (water[y * MAP_SIZE + x]) { const p = tileCenter(x, y), hw = TILE_WIDTH / 2 * s + 0.4, hh = TILE_HEIGHT / 2 * s + 0.4;
        b.beginPath(); b.moveTo(p.x * s, p.y * s - hh); b.lineTo(p.x * s + hw, p.y * s); b.lineTo(p.x * s, p.y * s + hh); b.lineTo(p.x * s - hw, p.y * s); b.closePath(); b.fill(); }
    const move = e => { const rc = mm.getBoundingClientRect(); cam.centerOn((e.clientX - rc.left) / rc.width * WORLD_W, (e.clientY - rc.top) / rc.height * WORLD_H); };
    mm.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (e.button !== 0) return; mmDrag = true; mm.setPointerCapture(e.pointerId); move(e); });
    mm.addEventListener('pointermove', e => { if (mmDrag) move(e); });
    mm.addEventListener('pointerup', () => { mmDrag = false; });
    mm.addEventListener('contextmenu', e => e.preventDefault());
}
const MM_COL = { fish: '#9ad8ff', carcass: '#6a3a1a', tree: '#1d4a1a', berry: '#d04a8a', gold: '#f0d040', stone: '#b0b0b0', house: '#3a6ad0', tc: '#3a6ad0' };
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
    c.fillStyle = '#8a4a1a'; deer.forEach(d => c.fillRect(d.x * s - 1.5, d.y * s - 1.5, 3, 3));   // deer: small brown dots
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
    for (let cy0 = 0; cy0 < MAP_SIZE; cy0 += CHUNK) for (let cx0 = 0; cx0 < MAP_SIZE; cx0 += CHUNK) {
        const x1 = Math.min(MAP_SIZE, cx0 + CHUNK), y1 = Math.min(MAP_SIZE, cy0 + CHUNK);
        const left = tileCenter(cx0, y1 - 1).x - hw, right = tileCenter(x1 - 1, cy0).x + hw;
        const top = tileCenter(cx0, cy0).y - hh, bottom = tileCenter(x1 - 1, y1 - 1).y + hh;
        groundChunks.push({ img: null, key: 'ground' + groundChunks.length, cx0, cy0, cx1: x1, cy1: y1, x0: left, y0: top, x1: right, y1: bottom, used: 0 });
    }
}
const GROUND_CACHE = 16;   // baked chunks kept in memory (each ~1100x560 px)
/** Bake one grass chunk on demand (only chunks near the view exist as textures) */
function bakeChunk(ch) {
    const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    const greens = ['#4a7d3a', '#44753a', '#4f8540', '#3f6e35', '#538a43'];
    const t = townCenter, tc = tileCenter(t.x + 0.5, t.y + 0.5);
    const cx0 = ch.cx0, cy0 = ch.cy0, x1 = ch.cx1, y1 = ch.cy1, left = ch.x0, right = ch.x1, top = ch.y0, bottom = ch.y1;
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
                c.beginPath(); c.ellipse(p.x + (hash(x, y, i) - 0.5) * 100, p.y + (hash(x, y, i + 3) - 0.5) * 48, 20 + hash(x, y, i + 6) * 24, 10 + hash(x, y, i + 7) * 10, 0, 0, 7); c.fill();
            }
            c.lineWidth = 1.2;
            for (let i = 0; i < 40; i++) {
                const bx = p.x + (hash(x, y, i + 20) - 0.5) * 112, by = p.y + (hash(x, y, i + 40) - 0.5) * 56;
                c.strokeStyle = i % 3 ? 'rgba(120,170,80,0.55)' : 'rgba(30,70,25,0.45)';
                c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + (hash(x, y, i + 60) - 0.5) * 4, by - 4, bx + (hash(x, y, i + 60) - 0.5) * 7, by - 5 - hash(x, y, i + 80) * 6); c.stroke();
            }
            if (hash(x, y, 99) > 0.8) { c.fillStyle = hash(x, y, 98) > 0.5 ? '#f2e46a' : '#f4f4f4'; for (let i = 0; i < 4; i++) { const fx = p.x + (hash(x, y, i + 90) - 0.5) * 72, fy = p.y + (hash(x, y, i + 95) - 0.5) * 28; c.beginPath(); c.arc(fx, fy, 2.4, 0, 7); c.fill(); } }
            if (hash(x, y, 97) > 0.88) { c.fillStyle = '#8c8c7c'; c.beginPath(); c.ellipse(p.x + 20, p.y + 8, 6, 4, 0, 0, 7); c.fill(); c.fillStyle = '#a8a898'; c.beginPath(); c.ellipse(p.x + 19, p.y + 7, 3, 1.6, 0, 0, 7); c.fill(); }
            c.restore();
            c.strokeStyle = 'rgba(0,0,0,0.08)'; c.beginPath();
            c.moveTo(p.x, p.y - hh); c.lineTo(p.x + hw, p.y); c.lineTo(p.x, p.y + hh); c.lineTo(p.x - hw, p.y); c.closePath(); c.stroke();
        }
        drawWaterTiles(c, cx0, cy0, x1, y1);
        if (Math.abs(tc.x - (left + right) / 2) < W / 2 + 220 && Math.abs(tc.y - (top + bottom) / 2) < H / 2 + 120) {  // dirt around TC
            const grd = c.createRadialGradient(tc.x, tc.y, 20, tc.x, tc.y, 180);
            grd.addColorStop(0, 'rgba(150,120,80,0.9)'); grd.addColorStop(0.6, 'rgba(140,110,70,0.5)'); grd.addColorStop(1, 'rgba(140,110,70,0)');
            c.fillStyle = grd; c.beginPath(); c.ellipse(tc.x, tc.y, 210, 108, 0, 0, 7); c.fill();
        }
        scene.textures.addCanvas(ch.key, cv);
        ch.img = scene.add.image(left, top, ch.key).setOrigin(0, 0).setDepth(-10);
}
/** Water: deep-blue diamonds with ripples, then a sandy shoreline + foam band on edges that touch land */
function drawWaterTiles(c, cx0, cy0, x1, y1) {
    const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    for (let y = cy0; y < y1; y++) for (let x = cx0; x < x1; x++) {
        if (!isWater(x, y)) continue;
        const p = tileCenter(x, y), T = [p.x, p.y - hh], Rr = [p.x + hw, p.y], B = [p.x, p.y + hh], L = [p.x - hw, p.y];
        c.save(); c.beginPath(); c.moveTo(T[0], T[1] - 0.6); c.lineTo(Rr[0] + 0.6, Rr[1]); c.lineTo(B[0], B[1] + 0.6); c.lineTo(L[0] - 0.6, L[1]); c.closePath();
        const g = c.createLinearGradient(p.x - hw, p.y - hh, p.x + hw, p.y + hh); g.addColorStop(0, '#3f86cf'); g.addColorStop(1, hash(x, y, 7) > 0.5 ? '#2a68b0' : '#2c6db6');
        c.fillStyle = g; c.fill(); c.clip();
        c.strokeStyle = 'rgba(200,230,255,0.28)'; c.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) { const rx = p.x + (hash(x, y, i + 30) - 0.5) * 80, ry = p.y + (hash(x, y, i + 33) - 0.5) * 36; c.beginPath(); c.moveTo(rx - 12, ry); c.quadraticCurveTo(rx - 4, ry - 3, rx + 4, ry); c.quadraticCurveTo(rx + 10, ry + 2, rx + 14, ry); c.stroke(); }
        // edges: x+1 = lower-right (R-B), x-1 = upper-left (L-T), y+1 = lower-left (B-L), y-1 = upper-right (T-R)
        [[1, 0, Rr, B], [-1, 0, L, T], [0, 1, B, L], [0, -1, T, Rr]].forEach(e => {
            if (isWater(x + e[0], y + e[1]) || !inMap(x + e[0], y + e[1])) return;
            c.beginPath(); c.moveTo(e[2][0], e[2][1]); c.lineTo(e[3][0], e[3][1]);
            c.strokeStyle = 'rgba(235,248,255,0.55)'; c.lineWidth = 20; c.stroke();     // foam
            c.strokeStyle = '#c9b27a'; c.lineWidth = 10; c.stroke();                    // wet sand
            c.strokeStyle = '#a8905a'; c.lineWidth = 3; c.stroke();
        });
        c.restore();
    }
}
function updateGround(vr) {
    let baked = 0, frame = game.loop.frame;
    groundChunks.forEach(ch => {
        const on = ch.x1 > vr.x0 && ch.x0 < vr.x1 && ch.y1 > vr.y0 && ch.y0 < vr.y1;
        if (on && !ch.img && (baked < 2 || frame < 3)) { bakeChunk(ch); baked++; }
        if (ch.img) { ch.img.setVisible(on); if (on) ch.used = frame; }
    });
    const live = groundChunks.filter(c => c.img);
    if (live.length > GROUND_CACHE) live.filter(c => !c.img.visible).sort((a, b) => a.used - b.used).slice(0, live.length - GROUND_CACHE)
        .forEach(c => { c.img.destroy(); scene.textures.remove(c.key); c.img = null; });
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
    const g = gfx, gu = gUnder;
    g.clear(); gu.clear(); poolN = 0;
    const vr = viewRect(200);
    updateGround(viewRect(64));
    // visible tile range (iso: check the 4 view corners)
    const cs = [screenToTile(vr.x0, vr.y0), screenToTile(vr.x1, vr.y0), screenToTile(vr.x0, vr.y1), screenToTile(vr.x1, vr.y1)];
    const tx0 = Math.max(0, Math.min(...cs.map(c => c.x)) - 1), tx1 = Math.min(MAP_SIZE - 1, Math.max(...cs.map(c => c.x)) + 1);
    const ty0 = Math.max(0, Math.min(...cs.map(c => c.y)) - 1), ty1 = Math.min(MAP_SIZE - 1, Math.max(...cs.map(c => c.y)) + 3);
    const vis = (x, y) => { const p = tileCenter(x, y); return p.x > vr.x0 && p.x < vr.x1 && p.y > vr.y0 && p.y < vr.y1 + 120; };
    if (placing === 'house') {              // show free tiles + hover preview while placing
        for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (!mapData[y][x] && isLand(x, y) && vis(x, y)) diamond(gu, x, y, 0xffffff, 0.06);
        if (hoverTile && inMap(hoverTile.x, hoverTile.y)) diamond(gu, hoverTile.x, hoverTile.y, mapData[hoverTile.y][hoverTile.x] || !isLand(hoverTile.x, hoverTile.y) ? 0xff3333 : 0x33ff33, 0.45);
    }
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        const c = mapData[y][x];
        if (!c || c.kind === 'tc' || !vis(x, y)) continue;
        if (c.kind === 'house') drawHouse(g, x, y, c.house); else drawNode(g, x, y, c);
    }
    drawTC(g, gu);
    deer.forEach(d => { if (d.x > vr.x0 && d.x < vr.x1 && d.y > vr.y0 && d.y < vr.y1 + 120) drawDeer(d); });
    villagers.forEach(v => { if (v.x > vr.x0 && v.x < vr.x1 && v.y > vr.y0 && v.y < vr.y1 + 120) drawVillager(g, gu, v); });
    for (let i = poolN; i < pool.length; i++) if (pool[i].visible) pool[i].setVisible(false);
    if (dragSel && dragSel.active) {        // selection rectangle
        const x = Math.min(dragSel.sx, dragSel.ex), y = Math.min(dragSel.sy, dragSel.ey), w = Math.abs(dragSel.ex - dragSel.sx), h = Math.abs(dragSel.ey - dragSel.sy);
        g.fillStyle(0xffffff, 0.08); g.fillRect(x, y, w, h); g.lineStyle(1.5 / cam.zoom, 0xffffff, 0.9); g.strokeRect(x, y, w, h);
    }
}
/** Next pooled image showing art frame `name` at world (x,y), depth-sorted by y */
function sprite(name, x, y, depth, flip) {
    let img = pool[poolN];
    if (!img) { img = scene.add.image(0, 0, 'art0'); pool.push(img); }
    poolN++;
    Art.apply(img, name, x, y, flip, depth);
    return img;
}
function drawNode(g, x, y, c) {
    const p = tileCenter(x, y), frac = c.amount / c.max, s = hash(x, y, 5);
    if (c.kind === 'tree') {
        const px = p.x + (hash(x, y, 1) - 0.5) * 20, py = p.y + (hash(x, y, 2) - 0.5) * 8, v = Math.floor(hash(x, y, 3) * 3);
        const name = frac < 0.25 ? 'stump' : (s > 0.45 ? 'pine' : 'leafy') + v + (frac < 0.6 ? '_cut' : '');
        sprite(name, px, py, py, hash(x, y, 4) > 0.5);
    } else if (c.kind === 'fish') {
        sprite('fish' + (Math.floor(animT / 260 + s * 4) % 4), p.x, p.y, p.y - 40, s > 0.5);
    } else if (c.kind === 'carcass') {
        sprite('carcass' + Math.max(1, Math.ceil(frac * 3)), p.x, p.y + 4, p.y, s > 0.5);
    } else if (c.kind === 'berry') {
        sprite('berry' + Math.min(4, Math.ceil(frac * 4)), p.x, p.y + 6, p.y, hash(x, y, 4) > 0.5);
    } else {
        sprite(c.kind + Math.max(1, Math.ceil(6 * frac)), p.x, p.y + 8, p.y, hash(x, y, 4) > 0.5);
        if (c.kind === 'gold' && Math.sin(animT / 300 + x * 3 + y) > 0.97) { g.fillStyle(0xffffff, 0.9); g.fillCircle(p.x + 8, p.y - 40, 3); }
    }
}
function drawTC(g, gu) {
    const t = townCenter, c = tileCenter(t.x + 0.5, t.y + 0.5);
    if (t.selected) { gu.lineStyle(4, 0xffffff, 0.9); gu.strokeEllipse(c.x, c.y, 300, 150); }
    sprite('tc', c.x, c.y, c.y + 40);
    sprite('flag' + (Math.floor(animT / 140) % 4), c.x, c.y - 203, c.y + 40.5);
    if (trainQueue > 0) {          // training progress bar
        const f = trainTimer / TRAIN_TIME;
        g.fillStyle(0x000000, 0.7); g.fillRect(c.x - 72, c.y - 290, 144, 14);
        g.fillStyle(popCount() < popCap() ? 0x55dd55 : 0xdd5555, 1); g.fillRect(c.x - 70, c.y - 288, 140 * f, 10);
    }
}
function drawHouse(g, x, y, h) {
    const p = tileCenter(x, y), pr = h.done ? 1 : h.progress;
    const idx = h.done ? 9 : Math.min(8, Math.floor(pr / (1 / 9)));
    sprite('house' + idx, p.x, p.y, p.y + 10);
    if (!h.done) {
        g.fillStyle(0x000000, 0.7); g.fillRect(p.x - 40, p.y - 180, 80, 10);
        g.fillStyle(0x55aaff, 1); g.fillRect(p.x - 38, p.y - 178, 76 * h.progress, 6);
    }
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
function drawDeer(d) {
    const t = animT / 1000 + d.seed * 7, pre = d.ant ? 'deer_a_' : 'deer_';
    let name;
    if (d.moving) name = pre + 'walk' + (Math.floor(t * (d.state === 'flee' ? 16 : 7)) % 4);
    else if (d.state === 'graze' && Math.sin(t * 0.6) < 0.5) name = pre + 'graze' + (Math.floor(t * 2.2) % 2);
    else name = pre + 'idle';
    sprite(name, d.x, d.y, d.y + 0.15, d.face < 0);
}
function drawVillager(g, gu, v) {
    const face = v.face || 1, working = v.state === 'gathering' || v.state === 'building' || v.state === 'hunting';
    const kind = (v.state === 'toHunt' || v.state === 'hunting') ? 'carcass' : v.state === 'building' ? 'hammer' : (v.node && mapData[v.node.y] && mapData[v.node.y][v.node.x] ? mapData[v.node.y][v.node.x].kind : (v.lastKind || null));
    const tool = kind === 'hammer' ? 'hammer' : kind === 'tree' ? 'axe' : (kind === 'gold' || kind === 'stone') ? 'pick' : kind === 'berry' ? 'basket' : kind === 'carcass' ? 'spear' : kind === 'fish' ? 'net' : 'none';
    const t = animT / 1000 + (v.seed || 0) * 3;
    let name; const pre = v.fem ? 'v_f_' : 'v_';
    if (working && tool !== 'none') name = `${pre}${tool}_work${Math.floor(t * 9) % 6}`;
    else if (v.walking) name = `${pre}${tool}_walk${Math.floor(t * 12) % 8}`;
    else name = `${pre}${tool}_idle`;
    if (v.selected) { gu.lineStyle(3, 0xffff66, 1); gu.strokeEllipse(v.x, v.y + 2, 54, 22); }
    sprite(name, v.x, v.y, v.y + 0.2, face < 0);
    if (v.carry > 0) {
        sprite('carry_' + v.carryType, v.x - face * 15, v.y - 46, v.y + 0.1, face < 0);
        const col = CARRY_COLORS[v.carryType];
        g.fillStyle(0x000000, 0.6); g.fillRect(v.x - 16, v.y - 128, 32, 6);
        g.fillStyle(col, 1); g.fillRect(v.x - 15, v.y - 127, 30 * v.carry / CARRY_MAX, 4);
    }
}

// ============================================================================
// INPUT
// ============================================================================
function villagerAt(px, py) {
    let best = null, bd = Infinity;   // villager body box ~40x110 above the feet; front-most (lowest y) wins ties
    villagers.forEach(v => { if (Math.abs(px - v.x) > 22 || py > v.y + 6 || py < v.y - 104) return; const d = Math.abs(px - v.x) + Math.abs(py - (v.y - 50)) * 0.3 - v.y * 0.01; if (d < bd) { bd = d; best = v; } });
    return best;
}
function deerAt(px, py) { let best = null, bd = Infinity; deer.forEach(d => { if (Math.abs(px - d.x) > 40 || py > d.y + 12 || py < d.y - 70) return; const k = Math.abs(px - d.x) + Math.abs(py - d.y + 30); if (k < bd) { bd = k; best = d; } }); return best; }
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
        const inside = villagers.filter(v => v.x >= x0 && v.x <= x1 && v.y - 50 >= y0 - 30 && v.y - 50 <= y1 + 30);
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
    const tcC = tileCenter(townCenter.x + 0.5, townCenter.y + 0.5);
    const onTC = (cell && cell.kind === 'tc') || (Math.abs(px - tcC.x) < 110 && py > tcC.y - 250 && py < tcC.y + 40);
    if (onTC && !shift) { deselectAll(); townCenter.selected = true; return; }
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
    const dr = deerAt(px, py);
    if (dr) { sel.forEach(u => orderHunt(u, dr)); return; }
    if (cell && RES_TYPES[cell.kind]) sel.forEach(u => orderGather(u, t.x, t.y));
    else if (cell && cell.kind === 'tc') sel.forEach((u, i) => { if (u.carry > 0) u.state = 'returning'; else orderMove(u, t.x, t.y + 2, i); });
    else if (cell && cell.kind === 'house') { if (!cell.house.done) sel.forEach(u => orderBuild(u, cell.house)); }
    else sel.forEach((u, i) => orderMove(u, t.x, t.y, i));
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

// ============================================================================
// PAUSE + KEYS
// ============================================================================
const pauseBtn = document.getElementById('pause-btn'), pauseOv = document.getElementById('pause-overlay');
function setPaused(p) {
    if (!p && document.getElementById('title-overlay').style.display === 'flex') return;
    paused = p; pauseBtn.textContent = p ? '▶' : '⏸'; pauseOv.style.display = p ? 'flex' : 'none';
}
pauseBtn.addEventListener('pointerdown', e => { e.stopPropagation(); setPaused(!paused); });
document.getElementById('resume-btn').addEventListener('pointerdown', e => { e.stopPropagation(); setPaused(false); });
const speedBtn = document.getElementById('speed-btn');
function setSpeed(n) { speed = Math.max(1, Math.min(5, n)); speedBtn.textContent = speed + 'x'; document.getElementById('pause-speed').textContent = 'Speed ' + speed + 'x'; }
speedBtn.addEventListener('pointerdown', e => { e.stopPropagation(); setSpeed(speed >= 5 ? 1 : speed + 1); });
setSpeed(1);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
window.addEventListener('keydown', e => {
    if (e.key === 'p' || e.key === 'P') setPaused(!paused);
    else if (e.key === '+' || e.key === '=') setSpeed(speed + 1);
    else if (e.key === '-' || e.key === '_') setSpeed(speed - 1);
    else if (e.key === 'Escape') { if (placing) { placing = null; flash('Placement cancelled'); } else deselectAll(); }
    else if (e.key === ' ') { e.preventDefault(); if (cam) centerOnTC(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); townCenter.selected = false; villagers.forEach(u => u.selected = true); }
});

// ============================================================================
// COMMAND BAR (DOM, big touch buttons)
// ============================================================================
const bar = document.getElementById('command-bar');
const DEFAULT_INFO = 'Left-click/drag to select · right-click to gather, move or build · wheel zoom · right-drag pan · Space = Town Center · P pause · +/- speed';
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

// ============================================================================
// MAP PICKER (title overlay) + map number on the pause overlay
// ============================================================================
(function mapPicker() {
    const ov = document.getElementById('title-overlay'), sel = document.getElementById('map-select'), note = document.getElementById('map-note');
    const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    opt('r', 'Random');
    for (let n = 0; n < 100; n++) opt(String(n), mapLabel(n));
    sel.value = String(MAP_NUM);
    let pick = MAP_NUM;
    const show = () => { note.textContent = 'Map ' + mapLabel(pick) + (pick === 0 ? ' · demo' : ''); };
    sel.addEventListener('change', () => {
        if (sel.value === 'r') { pick = Math.floor(Math.random() * 100); note.textContent = 'Map ' + mapLabel(pick); }
        else { pick = parseInt(sel.value, 10); show(); }
    });
    show();
    const save = n => { try { localStorage.setItem('aoe-rts.map', String(n)); } catch (e) {} };
    document.getElementById('pause-map').textContent = 'Map ' + mapLabel(MAP_NUM);
    document.getElementById('picker-cancel').addEventListener('click', () => { ov.style.display = 'none'; setPaused(false); });
    const open = () => { setPaused(true); pauseOv.style.display = 'none'; ov.style.display = 'flex'; sel.value = String(MAP_NUM); pick = MAP_NUM; show(); };
    document.getElementById('start-btn').addEventListener('click', () => {
        save(pick);
        if (pick === MAP_NUM && !ov.dataset.played) { ov.style.display = 'none'; ov.dataset.played = '1'; setPaused(false); return; }
        location.search = '?map=' + String(pick).padStart(2, '0');   // new map = new game
    });
    document.getElementById('newmap-btn').addEventListener('pointerdown', e => { e.stopPropagation(); open(); });
    // Auto start: always straight into the map (last played, ?map=NN, or 00); picker only via New map
    save(MAP_NUM); ov.dataset.played = '1';
})();
