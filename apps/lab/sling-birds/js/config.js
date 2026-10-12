// World constants and materials (unchanged from the original single-file game).
export const { Engine, World, Bodies, Body, Composite, Events, Vector } = window.Matter;

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 600;
export const GROUND_Y = 560;

export const SLING_X = 180;
export const SLING_Y = 440;
export const MAX_PULL = 100;
export const LAUNCH_POWER = 0.19;    // full pull at ~45deg lands near x=1000 (far side of towers)
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
  wood:  { density: 0.0012, friction: 0.6, restitution: 0.15 },
  stone: { density: 0.0025, friction: 0.8, restitution: 0.05 }
};
