/*
 * Game of Life — config (LIFE-1). All tunable numbers live here.
 */
const LIFE_CONFIG = {
  cols: 60, rows: 60,        // grid size (wraps at the edges: a torus)
  maxFps: 30,                // render cap (shared fpsLimit can only lower it)
  speed: { min: 1, max: 30, def: 8 }, // generations per second (slider)
  randomFill: 0.25,          // share of live cells for "Random"
  zoom: { min: 1, max: 8 },  // view scale relative to "fit the screen"
  storeKey: 'game-of-life.state', // saved speed + grid (prefixed by folder name)
};
