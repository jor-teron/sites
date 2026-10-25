/*
  File: modules/maps.js
  Project: tower-defence
  Purpose: One place to get any map 00-99 by number.
           00 = hand-made demo, 01-99 = generated from the number.
*/

import { MAP_COUNT, MAP_HP_BONUS } from './config.js';
import { MAP00 } from '../maps/map00.js';
import { generateMap, toCells } from './mapgen.js';

/* Two-digit label, e.g. 7 -> "07". */
export function mapLabel(n) {
  return String(n).padStart(2, '0');
}

/* Clamp anything (string, NaN, out of range) to a valid map number. */
export function clampMap(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAP_COUNT - 1, n));
}

/*
  Map data for number n: { id, points, cells, hpMul }.
  A generated map that somehow fails falls back to the demo path.
*/
export function getMap(n) {
  n = clampMap(n);
  let points = MAP00;
  if (n > 0) {
    const gen = generateMap(n);
    if (gen) points = gen.points;
  }
  return {
    id: n,
    points,
    cells: toCells(points),
    /* Small wave-strength bump on higher maps: x1.00 on 00 up to x1.25 on 99. */
    hpMul: 1 + MAP_HP_BONUS * n / (MAP_COUNT - 1)
  };
}

/* Map number from ?map=NN, or null if the link has none. */
export function mapFromUrl() {
  const v = new URLSearchParams(location.search).get('map');
  return v === null ? null : clampMap(v);
}
