// LandCraft texture atlas: 16x16 pixel tiles drawn procedurally on a canvas (no image files).
import * as THREE from 'three';

export const TILE = 16;
export const TILES = { grassTop: 0, grassSide: 1, dirt: 2, stone: 3, logTop: 4, logSide: 5, leaves: 6, sand: 7, glass: 8, water: 9 };
const COUNT = 10;

function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

export function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = TILE * COUNT; c.height = TILE;
  const g = c.getContext('2d'), r = rng(1234);
  // Fill one pixel with a base colour randomly lightened or darkened by up to +/- vary/2.
  function px(tile, x, y, rgb, vary) {
    const k = 1 - vary / 2 + r() * vary;
    g.fillStyle = 'rgb(' + rgb.map(function (v) { return Math.min(255, Math.round(v * k)); }).join(',') + ')';
    g.fillRect(tile * TILE + x, y, 1, 1);
  }
  const DIRT = [134, 96, 67], GRASS = [92, 160, 52], STONE = [128, 128, 128];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      px(TILES.grassTop, x, y, GRASS, 0.35);
      px(TILES.dirt, x, y, DIRT, 0.35);
      px(TILES.stone, x, y, r() < 0.08 ? [96, 96, 96] : STONE, 0.22);
      px(TILES.grassSide, x, y, DIRT, 0.35);
    }
  }
  // Grass side: dirt with a ragged grass fringe along the top edge.
  for (let x = 0; x < TILE; x++) {
    const depth = 3 + Math.floor(r() * 3);
    for (let y = 0; y < depth; y++) px(TILES.grassSide, x, y, GRASS, 0.35);
  }
  // L1c tiles. Leaves have see-through holes (alpha-tested); glass is a translucent pane with a frame.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      px(TILES.logTop, x, y, ring > 6.5 ? [96, 72, 42] : Math.floor(ring) % 2 ? [176, 140, 88] : [150, 114, 66], 0.12);
      px(TILES.logSide, x, y, x % 4 === 0 ? [78, 58, 34] : [106, 80, 48], 0.25);
      px(TILES.sand, x, y, [219, 206, 150], 0.14);
      if (r() < 0.22) g.clearRect(TILES.leaves * TILE + x, y, 1, 1);
      else px(TILES.leaves, x, y, [58, 122, 40], 0.45);
      const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1, streak = x - y === 3 || x - y === 5;
      g.fillStyle = edge ? 'rgba(225,240,255,.9)' : streak && x > 3 && x < 12 ? 'rgba(255,255,255,.45)' : 'rgba(200,230,255,.12)';
      g.fillRect(TILES.glass * TILE + x, y, 1, 1);
      g.fillStyle = 'rgba(' + [40, 100 + Math.floor(r() * 30), 200].join(',') + ',.6)';             // L2a water
      g.fillRect(TILES.water * TILE + x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// UV rectangle [u0, v0, u1, v1] for a tile, inset half a texel so neighbours never bleed in.
export function tileUV(tile) {
  const e = 0.5 / (TILE * COUNT);
  return [tile / COUNT + e, 0, (tile + 1) / COUNT - e, 1];
}
