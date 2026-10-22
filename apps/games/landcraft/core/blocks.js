// LandCraft block ids and which atlas tile each face uses: [top, bottom, sides].
import { TILES } from './atlas.js';

export const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3;
export const FACE_TILES = {
  [GRASS]: [TILES.grassTop, TILES.dirt, TILES.grassSide],
  [DIRT]: [TILES.dirt, TILES.dirt, TILES.dirt],
  [STONE]: [TILES.stone, TILES.stone, TILES.stone]
};
