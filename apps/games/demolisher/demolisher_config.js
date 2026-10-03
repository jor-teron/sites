/*
  File: demolisher_config.js
  Project: Demolisher
  Purpose: Every tunable value: world, player, materials, weapons / ammo, enemies,
           mission, aim, touch sizes, keys, hub-controller rumble and on-screen text.
           demolisher_logic.js reads DEMOLISHER_CONFIG. Plain script, no modules.
*/
const DEMOLISHER_CONFIG = {
  // App info (page title and the sites hub header)
  APP: { name: 'Demolisher', version: '1.1' },

  world: {
    width: 5000,           // world width in px (camera scrolls)
    height: 1400,          // world height in px
    tile: 14,              // tile edge in px (render + collision)
    gravity: 1.0,          // Matter gravity, +Y is down
    chunk: 32,             // chunk edge in tiles (one static body per chunk)
    maxChunkRebuilds: 2,   // chunk rebuilds per step (spreads blast cost)
    crates: 40,            // sandbox: random crates near the surface
  },

  player: {
    w: 22, h: 34,          // body size in px
    speed: 4.6,            // run speed (Matter px per tick)
    jump: 10.5,            // jump velocity (Matter px per tick)
    maxHp: 100,
    jumpLock: 0.32,        // seconds before holding jump hops again
  },

  // Materials: colour (intact), dark (almost broken), hp, solid (has a body)
  materials: {
    dirt:   { color: '#7a4a2a', dark: '#2a140c', hp: 30,   solid: true },
    grass:  { color: '#3a7a3a', dark: '#102010', hp: 30,   solid: true },
    stone:  { color: '#6a6a6a', dark: '#222222', hp: 80,   solid: true },
    water:  { color: '#2a5a9a', dark: '#1a3a6a', hp: 9999, solid: false },
    crate:  { color: '#c68a4a', dark: '#5a3010', hp: 20,   solid: true },
    metal:  { color: '#9a9a9a', dark: '#3a3a3a', hp: 250,  solid: true },
    lava:   { color: '#d05020', dark: '#8a2010', hp: 9999, solid: false },
    target: { color: '#e03030', dark: '#5a0808', hp: 40,   solid: true },
  },

  // Weapons. speed px/s; explosion 0 = direct hit; auto = fires while held.
  // ammo = starting ammo (Infinity = unlimited). Order = 1-4 keys / X cycling.
  weaponOrder: ['pistol', 'rocket', 'grenade', 'laser'],
  weapons: {
    pistol:  { label: 'Pistol',  ammo: Infinity, cooldown: 0.16, speed: 980,  damage: 8,  radius: 3, color: '#FFE66D', explosion: 0,  gravity: 0,   fuse: 1.6,  auto: true },
    rocket:  { label: 'Rocket',  ammo: 10,       cooldown: 0.85, speed: 460,  damage: 60, radius: 4, color: '#FF8C42', explosion: 62, gravity: 40,  fuse: 3.2,  auto: false },
    grenade: { label: 'Grenade', ammo: 5,        cooldown: 1.0,  speed: 380,  damage: 50, radius: 4, color: '#A050FF', explosion: 70, gravity: 520, fuse: 1.35, auto: false },
    laser:   { label: 'Laser',   ammo: 50,       cooldown: 0.07, speed: 1500, damage: 4,  radius: 2, color: '#6BE8FF', explosion: 0,  gravity: 0,   fuse: 1.1,  auto: true },
  },
  selfBlast: 0.35,         // share of blast damage the player takes

  enemies: {
    count: 7,              // mission walkers
    hp: 40,
    walkSpeed: 1.3,
    alertSpeed: 2.1,
    alertDist: 360,        // px: starts chasing
    shootDist: 420,        // px: shoots inside this range
    reload: 1.4,           // seconds between shots (+ up to reloadJitter)
    reloadJitter: 1.0,
    bulletSpeed: 420,      // px/s
    bulletDamage: 8,
    score: 100,
  },

  mission: {
    targets: [0.42, 0.62, 0.84], // target x positions (share of world width)
    targetHp: 46,
    targetScore: 500,
  },

  lava: { damage: 8, tick: 0.35 }, // damage every tick seconds while in lava

  aim: {
    keyRate: 2.4,          // Q / E aim speed (radians per second)
    maxUp: 1.5,            // radians above horizontal (Q)
    maxDown: 1.2,          // radians below horizontal (E)
    stickDead: 0.35,       // hub / touch stick dead zone
  },

  // Touch controls (px). Sticks float to where the thumb lands (left half = move,
  // right half = aim); FIRE / JUMP are buttons (mouse works too).
  touch: {
    stick: 80,             // stick base diameter
    knob: 34,              // knob diameter
    range: 30,             // knob travel (px) for full deflection
    fire: 64,              // FIRE button diameter
    jump: 54,              // JUMP button diameter
    tapMaxMs: 300,         // a tap on the menu / end card starts / retries
    tapMaxMovePx: 12,
  },

  // Keys: matched against KeyboardEvent.code or .key.
  // Hub controller: D-pad / stick = arrows, A = Space, B = x, Start = Enter, Select = Escape.
  keys: {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    jump: ['ArrowUp', 'KeyW'],
    fire: ['Space'],                 // hold for auto weapons
    aimUp: ['KeyQ'],
    aimDown: ['KeyE'],
    nextWeapon: ['KeyX'],
    pause: ['Enter', 'KeyP'],        // pause / resume; start from menu or end card
    menu: ['Escape'],
    weapons: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
  },

  // Phone rumble via the hub (ms or a vibrate pattern; 0 = off). Only inside the hub.
  rumble: {
    hit: 40,               // enemy bullet hits you
    lava: 30,              // lava tick ...
    lavaEveryMs: 600,      // ... at most this often
    nearExplosion: 80,     // a blast close by (no damage to you)
    nearExplosionPx: 150,
    selfBlast: 120,        // your own / any blast hurts you
    enemyKill: 25,
    target: 150,           // target destroyed
    death: [200, 100, 300],
    missionComplete: [80, 60, 80, 60, 200],
    outOfAmmo: 20,
  },

  text: {
    title: 'DEMOLISHER',
    tagline: 'Destroy the world. Blow up <span class="accent">red targets</span>. Kill <span class="accent">enemies</span>.',
    keysPc: 'MOVE A/D or ←→  •  JUMP W / ↑  •  FIRE Space or click  •  AIM mouse or Q/E\nWEAPON 1-4 / X  •  PAUSE Enter  •  MENU Esc',
    keysTouch: 'Left thumb: move  •  right thumb: aim  •  FIRE / JUMP buttons  •  tap to start',
    sandbox: 'SANDBOX',
    mission: 'MISSION',
    sandboxHint: 'SANDBOX — walk east to the gold gate',
    missionHint: 'MISSION — targets, then the east gate',
    gateLocked: 'GATE LOCKED — destroy {n} more target(s)',
    paused: 'PAUSED',
    resume: 'RESUME',
    menu: 'MENU',
    retry: 'RETRY',
    playAgain: 'PLAY AGAIN',
    died: 'YOU DIED',
    won: 'MISSION COMPLETE',
    wonLine: 'The targets are down. The ridge is quiet. Score: {score}',
    exit: 'EDGE OF THE MAP',
    exitLine: 'The ridge stops here. Past the gold gate there is nothing. Score: {score}',
    endKeys: 'Enter / tap: play again  •  Esc: menu',
    noAmmo: 'No ammo',
    statHp: 'HP', statScore: 'Score', statTargets: 'Targets', statEnemies: 'Enemies',
    newGame: 'New Game',
    modeBtn: 'Mode: {mode}',
    modeSandbox: 'Sandbox',        // hub Mode button names
    modeMission: 'Mission',
    weaponBtn: 'Weapon: {weapon}',
  },
};
