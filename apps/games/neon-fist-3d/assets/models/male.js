// Neon Fist 3D — male body: broad V torso, pecs, narrow hips, stronger jaw and brow.
import { V, E, Cn, limbPrims, headPrims, surfaceZ } from './parts.js';

export const MALE_HEAD = { cw: 0.077, ch: 0.1, cd: 0.097, jw: 0.05, jt: 1.15, brow: 1.25, nose: 1.08, chin: 1.2, lip: 0.92, lipTint: [0.9, 0.74, 0.72] };

export function malePrims(J) {
  const { b, shW } = J, w = b.w, s = b.sh, dz = b.depth, m = b.mus, f = b.fat, out = [], A = (...a) => out.push(...a);
  A(E(V(0, 0.95, -0.005), [0.142 * w, 0.1, 0.098 * dz], { k: 0.05, tag: 'pelvis' }));
  A(E(V(0, 0.865, 0.055 * dz), [0.03, 0.035, 0.03], { k: 0.03, tag: 'pelvis' }));
  A(E(V(0, 1.12, 0.0), [0.128 * w, 0.15, 0.088 * dz], { k: 0.06, tag: 'abd' }));
  A(E(V(0, 1.3, -0.012), [0.148 * s * w, 0.15, 0.1 * dz], { k: 0.05, tag: 'chest' }));
  A(E(V(0, 1.35, -0.035), [0.162 * s * w, 0.1, 0.085 * dz], { k: 0.05, tag: 'back' }));
  for (const sd of [-1, 1]) {
    A(E(V(sd * 0.062 * s * w, 1.318, 0.04 * dz + 0.006 * m), [0.07 * s, 0.05 + 0.008 * m, 0.045 + 0.012 * m], { k: 0.035, tag: 'pec' }));
    A(E(V(sd * 0.095 * s * w, 1.2, -0.03), [0.055 * s * (0.8 + 0.4 * m), 0.1, 0.065], { k: 0.05, tag: 'back' })); // lats
    A(E(V(sd * 0.062 * w, 0.9, -0.05 * dz), [0.07 * w, 0.08, 0.068 * dz], { k: 0.04, tag: 'glute' }));
    A(Cn(V(sd * 0.03, 1.5, -0.03), V(sd * shW * 0.8, 1.445, -0.02), 0.038 + 0.012 * m, 0.03, { k: 0.04, tag: 'trap' }));
    if (f) A(E(V(sd * 0.11 * w, 1.03, -0.01), [0.06, 0.07, 0.08], { k: 0.06, tag: 'belly' })); // love handles
  }
  if (f) A(E(V(0, 1.07, 0.045), [0.14, 0.13, 0.11], { k: 0.07, tag: 'belly' }));
  A(Cn(V(0, 1.42, -0.022), V(0, 1.6, -0.01), 0.06 + 0.006 * m + 0.008 * f, 0.052, { k: 0.035, tag: 'neck' }));
  A(...limbPrims(J), ...headPrims({ ...MALE_HEAD, jt: MALE_HEAD.jt + 0.25 * f }));
  for (const sd of [-1, 1]) { const x = sd * 0.08 * s * w, y = 1.3; // nipples (tint only), seated on the chest
    A(E(V(x, y, surfaceZ(out, x, y)), [0.009, 0.009, 0.009], { op: 'tint', k: 0.003, tint: [0.8, 0.62, 0.58] })); }
  return out;
}
