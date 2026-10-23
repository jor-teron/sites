// LandCraft block models: which atlas tile each block face uses, [top, bottom, sides]. Art data only; block rules are in core/blocks.js.
import { TILES } from '../textures/atlas.js';
import { GRASS, DIRT, STONE, LOG, LEAVES, SAND, GLASS, WATER } from '../../core/blocks.js';

export const FACE_TILES = {
  [GRASS]: [TILES.grassTop, TILES.dirt, TILES.grassSide],
  [DIRT]: [TILES.dirt, TILES.dirt, TILES.dirt],
  [STONE]: [TILES.stone, TILES.stone, TILES.stone],
  [LOG]: [TILES.logTop, TILES.logTop, TILES.logSide],
  [LEAVES]: [TILES.leaves, TILES.leaves, TILES.leaves],
  [SAND]: [TILES.sand, TILES.sand, TILES.sand],
  [GLASS]: [TILES.glass, TILES.glass, TILES.glass],
  [WATER]: [TILES.water, TILES.water, TILES.water]
};
