/*
  File: modules/path.js
  Project: tower-defence
  Purpose: Build the polyline enemies walk, sample positions, and
           reject tower placement on the road. Depends on current tile size.
*/

import { PATH } from './config.js';

/* Live tile size in pixels. main.js updates this on resize, then rebuilds. */
export let TILE = 48;

/* Pixel segments derived from PATH. Rebuilt when TILE changes. */
export const pathSegments = [];

/* Total walk length in pixels. Enemies leak when dist reaches this. */
export let totalPathLength = 0;

/*
  Set the current tile size. Caller must call buildPath() after this.
  tileSize: pixels per grid cell.
*/
export function setTile(tileSize) {
  TILE = tileSize;
}

/* Center of a tile in canvas pixels. */
export function cx(tileIndex) {
  return (tileIndex + 0.5) * TILE;
}

/*
  Rebuild pathSegments and totalPathLength from PATH using the current TILE.
  Zero-length segments are skipped.
*/
export function buildPath() {
  pathSegments.length = 0;
  totalPathLength = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i];
    const b = PATH[i + 1];
    const ax = cx(a.c);
    const ay = cx(a.r);
    const bx = cx(b.c);
    const by = cx(b.r);
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;
    pathSegments.push({
      ax, ay, bx, by,
      dx: dx / len, dy: dy / len,
      len, startDist: totalPathLength
    });
    totalPathLength += len;
  }
}

/*
  True if a grass tile is too close to the road to build on.
  Threshold is a bit over half a tile so corners stay blocked.
*/
export function isPathTile(c, r) {
  const x = cx(c);
  const y = cx(r);
  const threshold = TILE * 0.55;
  for (const seg of pathSegments) {
    const px2 = x - seg.ax;
    const py2 = y - seg.ay;
    let t = (px2 * seg.dx + py2 * seg.dy);
    t = Math.max(0, Math.min(seg.len, t));
    const projX = seg.ax + seg.dx * t;
    const projY = seg.ay + seg.dy * t;
    const d = Math.hypot(x - projX, y - projY);
    if (d < threshold) return true;
  }
  return false;
}

/*
  World position at a distance along the path.
  dist is clamped to [0, totalPathLength].
*/
export function posAtDistance(dist) {
  if (dist < 0) dist = 0;
  if (dist > totalPathLength) dist = totalPathLength;
  for (const seg of pathSegments) {
    if (dist <= seg.startDist + seg.len) {
      const t = dist - seg.startDist;
      return { x: seg.ax + seg.dx * t, y: seg.ay + seg.dy * t };
    }
  }
  const last = pathSegments[pathSegments.length - 1];
  return { x: last.bx, y: last.by };
}
