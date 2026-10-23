// World constants and materials (unchanged from the original single-file game).
export const { Engine, World, Bodies, Body, Composite, Events, Vector } = window.Matter;

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 600;
export const GROUND_Y = 560;

export const SLING_X = 180;
export const SLING_Y = 440;
export const MAX_PULL = 100;
export const LAUNCH_POWER = 0.22;    // full pull at ~45deg lands near x=1100; enough height to reach tower tops
export const GRAB_RADIUS = 100;      // world units; at least GRAB_MIN_PX screen px on small screens
export const GRAB_MIN_PX = 60;

// Single source of truth for gravity (engine.gravity.y).
export const GRAVITY = 1.0;
export const BIRD_FRICTION_AIR = 0.01; // Matter default; used by the trajectory preview too

// Fixed physics step
export const STEP_MS = 1000 / 60;

// Turn resolution: world must settle (all bodies below this speed) or time out
export const SETTLE_SPEED = 0.3;
export const SETTLE_MAX_TIME = 6;    // seconds after launch

export const MAT = {
  glass: { density: 0.0008, friction: 0.4, restitution: 0.1,  hp: 25,  score: 50 },
  wood:  { density: 0.0012, friction: 0.6, restitution: 0.15, hp: 60,  score: 100 },
  stone: { density: 0.0025, friction: 0.8, restitution: 0.05, hp: 150, score: 200 }
};

// ---------- HP / DAMAGE ----------
export const PIG_HP = 100;
export const PIG_SCORE = 500;
export const DMG_MIN = 1.2;          // normal relative speed (px/step) below this does no damage
export const DMG_K = 10;             // damage per px/step above DMG_MIN
export const DMG_MASS_MIN = 0.25;    // clamp of (other mass / own mass)
export const DMG_MASS_MAX = 3;
export const SPAWN_GRACE_MS = 500;   // no damage right after a level is built
export const HIT_FLASH = 0.15;       // seconds
