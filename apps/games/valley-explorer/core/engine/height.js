import { createRng } from '../../../engine/shared/rng.js';

export function makeHeightFn(seed, world = 160) {
  const rng = createRng(seed);
  const hills = [];
  for (let i = 0; i < 7; i++) {
    hills.push({
      x: rng.range(-world * 0.35, world * 0.35),
      z: rng.range(-world * 0.35, world * 0.35),
      r: rng.range(18, 42),
      h: rng.range(2.5, 9)
    });
  }
  return function height(x, z) {
    let y = 0.4 + Math.sin(x * 0.035) * 1.1 + Math.cos(z * 0.028) * 0.9;
    for (const h of hills) {
      const d = Math.hypot(x - h.x, z - h.z);
      if (d < h.r) {
        const t = 1 - d / h.r;
        y += h.h * t * t;
      }
    }
    const edge = Math.max(Math.abs(x), Math.abs(z)) / (world * 0.5);
    if (edge > 0.78) y -= (edge - 0.78) * 14;
    return y;
  };
}
