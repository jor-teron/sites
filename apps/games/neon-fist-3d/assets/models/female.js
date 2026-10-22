// Neon Fist 3D — female body: softer shoulders, one smooth bust, narrow waist, wider hips, finer face.
import { V, E, Cn, limbPrims, headPrims } from './parts.js';

export const FEMALE_HEAD = { cw: 0.073, ch: 0.097, cd: 0.093, jw: 0.042, jt: 0.92, brow: 0.8, nose: 0.86, chin: 0.92, lip: 1.15, lipTint: [0.86, 0.56, 0.58] };

export function femalePrims(J) {
  const { b, shW } = J, w = b.w, s = b.sh, dz = b.depth, m = b.mus, f = b.fat, out = [], A = (...a) => out.push(...a);
  A(E(V(0, 0.95, -0.012), [0.15 * w, 0.105, 0.098 * dz], { k: 0.06, tag: 'pelvis' }));
  A(E(V(0, 1.1, -0.004), [0.106 * w, 0.13, 0.078 * dz], { k: 0.07, tag: 'abd' }));
  A(E(V(0, 1.29, -0.012), [0.125 * (1 + (s - 1) * 0.5) * w, 0.13, 0.086 * dz], { k: 0.05, tag: 'chest' }));
  A(E(V(0, 1.355, -0.03), [0.14 * (1 + (s - 1) * 0.5) * w, 0.085, 0.075 * dz], { k: 0.05, tag: 'back' }));
  const bs = 1 + 0.35 * f - 0.1 * (b.limb < 0.9);
  for (const sd of [-1, 1]) {
    A(E(V(sd * 0.046 * w, 1.282, 0.05 * dz + 0.004), [0.056 * bs, 0.054 * bs, 0.048 * bs], { k: 0.035, tag: 'bust' }));
    A(E(V(sd * 0.072 * w, 0.893, -0.055 * dz), [0.075 * w, 0.085, 0.07 * dz], { k: 0.04, tag: 'glute' }));
    A(E(V(sd * 0.105 * w, 0.92, -0.008), [0.05 * w, 0.075, 0.065], { k: 0.06, tag: 'pelvis' })); // hip curve
    A(Cn(V(sd * 0.025, 1.49, -0.03), V(sd * shW * 0.8, 1.44, -0.02), 0.03 + 0.008 * m, 0.026, { k: 0.04, tag: 'trap' }));
    if (f) A(E(V(sd * 0.1 * w, 1.04, -0.01), [0.05, 0.07, 0.07], { k: 0.06, tag: 'belly' }));
  }
  if (f) A(E(V(0, 1.06, 0.04), [0.12, 0.11, 0.095], { k: 0.07, tag: 'belly' }));
  A(Cn(V(0, 1.43, -0.025), V(0, 1.6, -0.012), 0.05 + 0.007 * f, 0.044, { k: 0.035, tag: 'neck' }));
  A(...limbPrims(J), ...headPrims({ ...FEMALE_HEAD, jt: FEMALE_HEAD.jt + 0.25 * f }));
  return out;
}
