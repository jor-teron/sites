// LandCraft block ids, names, and which atlas tile each face uses: [top, bottom, sides].
import { TILES } from './atlas.js';

export const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, LOG = 4, LEAVES = 5, SAND = 6, GLASS = 7;
export const NAMES = { [GRASS]: 'Grass', [DIRT]: 'Dirt', [STONE]: 'Stone', [LOG]: 'Wood', [LEAVES]: 'Leaves', [SAND]: 'Sand', [GLASS]: 'Glass' };
export const HOTBAR = [GRASS, DIRT, STONE, LOG, LEAVES, SAND, GLASS];
export const FACE_TILES = {
  [GRASS]: [TILES.grassTop, TILES.dirt, TILES.grassSide],
  [DIRT]: [TILES.dirt, TILES.dirt, TILES.dirt],
  [STONE]: [TILES.stone, TILES.stone, TILES.stone],
  [LOG]: [TILES.logTop, TILES.logTop, TILES.logSide],
  [LEAVES]: [TILES.leaves, TILES.leaves, TILES.leaves],
  [SAND]: [TILES.sand, TILES.sand, TILES.sand],
  [GLASS]: [TILES.glass, TILES.glass, TILES.glass]
};
// Opaque blocks hide the faces of whatever touches them; leaves and glass do not.
export function opaque(b) { return b !== AIR && b !== LEAVES && b !== GLASS; }
