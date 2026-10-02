/*
  File: modules/config.js
  Project: tower-defence
  Purpose: Static balance and map data. No DOM, no mutable run state.
*/

/* Grid width in tiles. */
export const COLS = 16;

/* Grid height in tiles. */
export const ROWS = 12;

/* Design tile size in CSS pixels before fit-to-stage scaling. */
export const BASE_TILE = 48;

/*
  Waypoints in tile coordinates. Enemies walk center-to-center
  along each segment. First point is spawn (IN), last is base (OUT).
*/
export const PATH = [
  { c: 0,  r: 2  },
  { c: 3,  r: 2  },
  { c: 3,  r: 5  },
  { c: 1,  r: 5  },
  { c: 1,  r: 9  },
  { c: 6,  r: 9  },
  { c: 6,  r: 4  },
  { c: 10, r: 4  },
  { c: 10, r: 10 },
  { c: 14, r: 10 },
  { c: 14, r: 6  },
  { c: 12, r: 6  },
  { c: 12, r: 2  },
  { c: 15, r: 2  }
];

/*
  Tower catalog.
  range is in tiles. fireRate is seconds between shots.
  upgradeCost is the level-1 upgrade price; upgradeMul scales later levels.
*/
export const TOWER_TYPES = {
  gun: {
    name: 'GUN', cost: 50,
    range: 3, damage: 10, fireRate: 0.35, projectileSpeed: 8,
    color: '#FFD700', bulletColor: '#FFE66D',
    upgradeCost: 40, upgradeMul: 1.35
  },
  cannon: {
    name: 'CANNON', cost: 100,
    range: 4, damage: 25, fireRate: 0.9, projectileSpeed: 5,
    splash: 1.1,
    color: '#FF6B6B', bulletColor: '#FF8C42',
    upgradeCost: 80, upgradeMul: 1.4
  },
  frost: {
    name: 'FROST', cost: 75,
    range: 3, damage: 5, fireRate: 0.5, projectileSpeed: 6,
    slow: 0.5, slowDuration: 1.5,
    color: '#6BE8FF', bulletColor: '#B8FFFF',
    upgradeCost: 60, upgradeMul: 1.3
  }
};

/*
  Enemy catalog.
  hp and speed are base values. Waves scale hp in enemies.js.
  speed is tiles per second before conversion to pixels.
*/
export const ENEMY_TYPES = {
  grunt:  { name: 'GRUNT',  hp: 50,  speed: 1.4, gold: 3,  radius: 0.28, color: '#FF5B5B' },
  runner: { name: 'RUNNER', hp: 25,  speed: 2.6, gold: 4,  radius: 0.24, color: '#FFB852' },
  tank:   { name: 'TANK',   hp: 200, speed: 0.9, gold: 7, radius: 0.36, color: '#A050FF' },
  boss:   { name: 'BOSS',   hp: 1000, speed: 0.75, gold: 30, radius: 0.48, color: '#FF00FF' }
};

/* Starting gold for a new run. */
export const START_GOLD = 150;

/* Starting base HP for a new run. */
export const START_LIVES = 20;

/* Seconds before the first wave after START. */
export const FIRST_WAVE_DELAY = 3;

/* Seconds between a cleared wave and the next one. */
export const BETWEEN_WAVE_DELAY = 4;
