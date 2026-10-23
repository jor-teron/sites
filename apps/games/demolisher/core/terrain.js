/*
  File: core/terrain.js
  Project: Demolisher
  Purpose: Tile grid (material + HP per tile), terrain colours and offscreen paint, world generation (Level 00 seeded Demo world, Sandbox / Mission worlds).
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js.
*/

'use strict';

/* ============================================================
   TERRAIN
   ============================================================ */

/* Material id per tile. Length GRID_W * GRID_H. */
let terrain = null;
/* Remaining HP per tile. */
let terrainHp = null;
/* Offscreen 1 pixel per tile. Blitted scaled into the view. */
let terrainCanvas = null;
/* Context for the offscreen terrain. */
let terrainCtx = null;
/* True when the whole offscreen image must be rebuilt (new world). */
let terrainDirty = true;
/* Damaged tile rectangle still to repaint (tile coords, inclusive); null = none. */
let dirtyRect = null;
function markDirty(x, y) {
  if (!dirtyRect) dirtyRect = { x0: x, y0: y, x1: x, y1: y };
  else {
    if (x < dirtyRect.x0) dirtyRect.x0 = x;
    if (x > dirtyRect.x1) dirtyRect.x1 = x;
    if (y < dirtyRect.y0) dirtyRect.y0 = y;
    if (y > dirtyRect.y1) dirtyRect.y1 = y;
  }
}

/*
  Allocate grids and the offscreen canvas.
  Called at the start of every world generate.
*/
function initTerrain() {
  terrain = new Uint8Array(GRID_W * GRID_H);
  terrainHp = new Float32Array(GRID_W * GRID_H); // float: hits below 0 must not wrap
  terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = GRID_W;
  terrainCanvas.height = GRID_H;
  terrainCtx = terrainCanvas.getContext('2d', { willReadFrequently: true });
  terrainCtx.imageSmoothingEnabled = false;
  terrainDirty = true;
  dirtyRect = null;
}

/*
  Flat index for a tile column and row.
*/
function ti(x, y) {
  return y * GRID_W + x;
}

/*
  True if the tile column and row sit inside the grid.
*/
function inBounds(x, y) {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
}

/*
  Material at a tile, or AIR outside the grid.
*/
function getMat(x, y) {
  if (!inBounds(x, y)) return MAT.AIR;
  return terrain[ti(x, y)];
}

/*
  Write a material and reset its HP from the table.
*/
function setMat(x, y, m) {
  if (!inBounds(x, y)) return;
  const i = ti(x, y);
  terrain[i] = m;
  terrainHp[i] = m ? MAT_INFO[m].hp : 0;
  markDirty(x, y);
}

/*
  True if the tile blocks movement and should be part of a chunk body.
*/
function isSolid(x, y) {
  const m = getMat(x, y);
  if (m === MAT.AIR) return false;
  return MAT_INFO[m].solid;
}

/*
  Parse #rrggbb into channels.
*/
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  };
}

/* Precomputed paint: per material, COLOR_STEPS+1 shades from dark (0 hp) to intact. */
const COLOR_STEPS = 16;
const SHADES = {};
for (const id in MAT_INFO) {
  const c = hexToRgb(MAT_INFO[id].color), d = hexToRgb(MAT_INFO[id].dark);
  const arr = [];
  for (let k = 0; k <= COLOR_STEPS; k++) {
    const f = k / COLOR_STEPS;
    arr.push([Math.round(d.r + (c.r - d.r) * f), Math.round(d.g + (c.g - d.g) * f), Math.round(d.b + (c.b - d.b) * f)]);
  }
  SHADES[id] = arr;
}
/* Shade for a tile: [r, g, b]. */
function tileShade(m, hp) {
  const k = Math.max(0, Math.min(1, hp / MAT_INFO[m].hp));
  return SHADES[m][Math.round(k * COLOR_STEPS)];
}

/* ============================================================
   WORLD GENERATION
   ============================================================ */

/*
  Fill rolling hills, pockets of stone and metal, valley water, and a lava cut.
  Sandbox also stacks crates and a metal bunker.
*/
/* World-gen RNG: Math.random, except Level 00 (the Demo) which is a fixed, seeded world. */
let worldRand = Math.random;
function generateWorld(mode) {
  initTerrain();
  const surfaceY = Math.floor(GRID_H * 0.45);
  for (let x = 0; x < GRID_W; x++) {
    const wave = Math.sin(x * 0.03) * 4 + Math.sin(x * 0.11) * 2;
    const top = surfaceY + Math.floor(wave);
    for (let y = top; y < GRID_H; y++) {
      let m = MAT.DIRT;
      if (y === top) m = MAT.GRASS;
      else if (y > top + 4 && worldRand() < 0.08) m = MAT.STONE;
      if (y > top + 20 && worldRand() < 0.02) m = MAT.METAL;
      setMat(x, y, m);
    }
  }
  for (let x = 0; x < GRID_W; x++) {
    const wave = Math.sin(x * 0.03) * 4 + Math.sin(x * 0.11) * 2;
    const top = surfaceY + Math.floor(wave);
    if (top > surfaceY + 3) {
      for (let y = top - 2; y < top; y++) {
        if (getMat(x, y) === MAT.AIR) setMat(x, y, MAT.WATER);
      }
    }
  }
  /* Lava trench so the fluid actually matters. */
  const lavaX = Math.floor(GRID_W * 0.62);
  for (let x = lavaX; x < lavaX + 10; x++) {
    for (let y = surfaceY + 1; y < surfaceY + 6; y++) {
      setMat(x, y, MAT.LAVA);
    }
  }
  if (mode === 'sandbox') {
    spawnCrateStack(20, surfaceY - 4);
    spawnCrateStack(40, surfaceY - 2);
    spawnCrateStack(60, surfaceY - 6);
    for (let y = surfaceY - 8; y < surfaceY; y++) {
      setMat(80, y, MAT.STONE);
      setMat(81, y, MAT.STONE);
    }
    for (let x = 100; x < 110; x++) {
      for (let y = surfaceY - 6; y < surfaceY; y++) setMat(x, y, MAT.METAL);
    }
    for (let x = 102; x < 108; x++) {
      for (let y = surfaceY - 5; y < surfaceY - 1; y++) setMat(x, y, MAT.AIR);
    }
    for (let i = 0; i < CFG.world.crates; i++) {
      const x = Math.floor(worldRand() * GRID_W);
      const y = surfaceY - Math.floor(worldRand() * 6) - 1;
      if (getMat(x, y) === MAT.AIR) setMat(x, y, MAT.CRATE);
    }
  }
  terrainDirty = true;
}

/*
  2 by 3 crate block used by sandbox dressing.
*/
function spawnCrateStack(gx, gy) {
  for (let y = gy; y < gy + 3; y++) {
    for (let x = gx; x < gx + 2; x++) {
      if (inBounds(x, y) && getMat(x, y) === MAT.AIR) setMat(x, y, MAT.CRATE);
    }
  }
}

/*
  Nominal surface row. Used for spawn height.
*/
function surfaceRow() {
  return Math.floor(GRID_H * 0.45);
}
