// LandCraft block ids, names and rules (opaque / solid). Which atlas tile each face uses lives in assets/models/block_models.js.

export const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, LOG = 4, LEAVES = 5, SAND = 6, GLASS = 7, WATER = 8;
export const NAMES = { [GRASS]: 'Grass', [DIRT]: 'Dirt', [STONE]: 'Stone', [LOG]: 'Wood', [LEAVES]: 'Leaves', [SAND]: 'Sand', [GLASS]: 'Glass', [WATER]: 'Water' };
export const HOTBAR = [GRASS, DIRT, STONE, LOG, LEAVES, SAND, GLASS];
// Opaque blocks hide the faces of whatever touches them; leaves and glass do not.
export function opaque(b) { return b !== AIR && b !== LEAVES && b !== GLASS && b !== WATER; }
// Solid blocks stop the player and the targeting ray; water is neither (not placeable yet either).
export function solid(b) { return b !== AIR && b !== WATER; }
