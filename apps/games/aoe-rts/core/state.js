/** AOE RTS - state, cost helpers and tile coordinates (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
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
let rock = new Uint8Array(MAP_SIZE * MAP_SIZE);    // R2b: 1 = rock outcrop (blocks walking + building, not a resource)
let hill = new Uint8Array(MAP_SIZE * MAP_SIZE);    // R2b: 1 = hill (walkable, A* prefers to go round)
let ford = new Uint8Array(MAP_SIZE * MAP_SIZE);    // R2b: 1 = shallow river ford (walkable land drawn as shallow water)
let mount = new Uint8Array(MAP_SIZE * MAP_SIZE);   // ARQ1t: 1 = mountain peak (also rock: impassable)
let riv = new Uint8Array(MAP_SIZE * MAP_SIZE);     // ARQ1t: river id + 1 on river water / ford tiles
let aiStart = null;      // ARQ1t: reserved far start spot {x, y} for a future AI base
let ground = new Uint8Array(MAP_SIZE * MAP_SIZE);  // R2b: ground look 0 grass, 1 lush, 2 dry, 3 dirt, 4 sand (visual only)
let deer = [];           // R2c: { x, y, hx, hy, ant, state, timer, gx, gy, face, seed, cd }
let trainedCount = 0;
let tcs = [], factions = {};   // ARQ1a: all Town Centers ({.., owner}); AI owners -> { res, queue, timer }    // villagers made so far: even = male, odd = female
window.addEventListener('keydown', e => { if (e.key === 'Control' || e.key === 'Meta') ctrlHeld = true; });
window.addEventListener('keyup', e => { if (e.key === 'Control' || e.key === 'Meta') ctrlHeld = false; });
window.addEventListener('blur', () => { ctrlHeld = false; });

const own = u => u.owner || 'p';   // ARQ1a owners: 'p' (player), 'ai1', 'ai2'
function resOf(o) { return o && o !== 'p' ? factions[o].res : resources; }
function tcOf(o) { return tcs.find(t => t.owner === o) || null; }
function popCount(o) { return villagers.filter(v => own(v) === (o || 'p')).length; }
function popCap(o) { return POP_BASE + POP_PER_HOUSE * houses.filter(h => h.done && own(h) === (o || 'p')).length; }
function canAfford(cost) { return Object.keys(cost).every(k => resources[k] >= cost[k]); }
function pay(cost, o) { const r = resOf(o); Object.keys(cost).forEach(k => r[k] -= cost[k]); }
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
