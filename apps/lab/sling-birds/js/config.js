// World constants and materials (unchanged from the original single-file game).
export const { Engine, World, Bodies, Body, Composite, Events, Vector } = window.Matter;

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 600;
export const GROUND_Y = 560;

export const SLING_X = 180;
export const SLING_Y = 440;
export const MAX_PULL = 100;
export const LAUNCH_POWER = 0.35;    // tuned for slow, arc-y shots

export const MAT = {
  wood:  { density: 0.0012, friction: 0.6, restitution: 0.15 },
  stone: { density: 0.0025, friction: 0.8, restitution: 0.05 }
};
