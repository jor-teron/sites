/**
 * AOE RTS - Tiny Slice Isometric Game (Phaser 3)
 * R2d: per-map saves (localStorage aoe-rts.save.NN: autosave 30s + pause / map switch / page hide),
 *     2-digit map box with Resume / Restart / Random.
 * R2c: animals - seeded deer herds (wander on land, flee briefly, hunted with a spear -> carcass ~100 food,
 *     fast gather, finite) and fish spots on lakes/ponds (~150 food, gathered from the shore with a net).
 * R2a: speed 1x-5x (sub-stepped sim), female villagers (training alternates), auto-start on the last map,
 *     seeded ponds/lakes (water blocks walking + building) and 8-dir grid A* for all villager movement.
 * R1b: high-res art (tile 128x64, villager ~110px, trees ~150-185px, TC ~280px) pre-rendered once into
 *     texture atlases by assets/models/art.js and shown as pooled images; everything else scaled 2x.
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

/** Shared namespace: assets/models register drawing code here; core scripts share top-level names via plain script tags */
const AOE = window.AOE = { models: {} };


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
// ARQ1a: game mode from ?mode= (open | vs | aivai); no mode = start screen (shows Open World behind it)
const URL_MODE = new URLSearchParams(location.search).get('mode'), MODE = ['vs', 'aivai'].indexOf(URL_MODE) >= 0 ? URL_MODE : 'open';
const TEAM = { p: { tint: null, mm: '#3a6ad0', name: 'You' }, ai1: { tint: 0xff7a6a, col: 0xe03828, mm: '#e04030', name: 'Red' }, ai2: { tint: 0xffd86a, col: 0xf0c020, mm: '#f0c020', name: 'Gold' } };
function mapSizeFor(n) { return n <= 0 ? 16 : 16 * (1 + Math.ceil(n / 20)); }
function mapLabel(n) { return String(n).padStart(2, '0'); }
let MAP_SIZE = mapSizeFor(MAP_NUM);   // tiles per side (only the test hook swaps it)
const WORLD_MARGIN = 192;          // px of empty border around the map diamond
const WORLD_W = MAP_SIZE * TILE_WIDTH + WORLD_MARGIN * 2;
const WORLD_H = MAP_SIZE * TILE_HEIGHT + WORLD_MARGIN * 2 + 280;
const ORIGIN_X = WORLD_W / 2;     // world x of tile (0,0) top corner
const ORIGIN_Y = WORLD_MARGIN + 280; // world y of tile (0,0) top corner (room for tall sprites)
const ZOOM_DEFAULT = 1.1, ZOOM_MAX = 2, ZOOM_MIN_ABS = 0.15;
const PAN_SPEED = 900;            // screen px / s for keys
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
const HILL_COST = 1.35;           // R2b: A* step cost on hill tiles (paths prefer going round)
const HILL_SPEED = 0.75;          // ARQ1t: walk speed factor on hill tiles
const AUTOSAVE_MS = 30000;        // R2d: autosave every 30 s of real time

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
