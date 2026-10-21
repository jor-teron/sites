// Neon Fist 3D — male body: V torso, tapered neck, jaw, tapered limbs, hands, feet.
import * as THREE from 'three';
import { V, lathe, taper, ball, limbs, hands, feet, head } from './parts.js';

export function buildMale(J, skin) {
  const g = new THREE.Group(), b = J.b;
  g.add(lathe(skin, J.torso, J.depth, { capBottom: true }));
  // pecs + shoulder caps (traps) for the V
  for (const s of [-1, 1]) {
    g.add(ball(skin, V(s * 0.075 * b.sh, 1.34, 0.07 * J.depth / 0.64), 0.075 * b.sh, 1.05, 0.6, 0.55));
    g.add(taper(skin, V(s * 0.05, 1.5, -0.01), V(s * J.shW * 0.9, 1.43, 0), 0.04 * b.sh, 0.05 * b.sh));
  }
  g.add(taper(skin, V(0, 1.45, -0.005), V(0, 1.6, 0.005), 0.068 * b.sh, 0.05));
  head(g, skin, { cw: 0.095, ch: 0.115, cd: 0.105, jw: 0.078, jh: 0.055, jd: 0.085, nose: 1.15, brow: 0.012 });
  limbs(g, J, skin); hands(g, J, skin, 1.05); feet(g, J, skin, 1.05);
  return g;
}
