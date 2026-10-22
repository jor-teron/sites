// Voxel raycast (Amanatides & Woo DDA): step cell by cell along the ray and return the first
// non-air block within reach, plus the normal of the face the ray entered through.
import { AIR } from './blocks.js';

export function raycast(world, o, d, reach) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const dx = sx ? Math.abs(1 / d.x) : Infinity, dy = sy ? Math.abs(1 / d.y) : Infinity, dz = sz ? Math.abs(1 / d.z) : Infinity;
  // Distance along the ray to the first x / y / z cell boundary.
  let tx = sx ? (sx > 0 ? x + 1 - o.x : o.x - x) * dx : Infinity;
  let ty = sy ? (sy > 0 ? y + 1 - o.y : o.y - y) * dy : Infinity;
  let tz = sz ? (sz > 0 ? z + 1 - o.z : o.z - z) * dz : Infinity;
  let n = [0, 0, 0], t = 0;
  while (t <= reach) {
    if (y >= 0 && world.get(x, y, z) !== AIR) return { x: x, y: y, z: z, n: n };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += dx; n = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += dy; n = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += dz; n = [0, 0, -sz]; }
  }
  return null;
}
