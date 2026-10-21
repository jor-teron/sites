// Neon Fist 3D — female body: narrow waist, wide hips, soft shoulders, shaped bust.
import * as THREE from 'three';
import { V, lathe, taper, ball, limbs, hands, feet, head } from './parts.js';

export function bust(J) { const k = J.b.belly ? 1.25 : J.b.w; return { y: 1.315, x: 0.062 * k, z: 0.068 * J.depth / 0.64, r: 0.062 * k }; }

export function buildFemale(J, skin) {
  const g = new THREE.Group(), b = J.b, B = bust(J);
  g.add(lathe(skin, J.torso, J.depth, { capBottom: true }));
  for (const s of [-1, 1]) {
    const m = ball(skin, V(s * B.x, B.y, B.z), B.r, 1, 0.92, 0.8); m.rotation.z = s * 0.2; g.add(m);
    g.add(taper(skin, V(s * 0.04, 1.49, -0.01), V(s * J.shW * 0.9, 1.43, 0), 0.03, 0.04));
  }
  g.add(taper(skin, V(0, 1.46, -0.005), V(0, 1.6, 0.005), 0.052, 0.04));
  head(g, skin, { cw: 0.088, ch: 0.108, cd: 0.098, jw: 0.064, jh: 0.048, jd: 0.075, nose: 0.85, brow: 0.007 });
  limbs(g, J, skin); hands(g, J, skin, 0.92); feet(g, J, skin, 0.92);
  return g;
}
