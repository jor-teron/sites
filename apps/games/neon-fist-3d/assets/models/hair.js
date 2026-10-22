// Neon Fist 3D — hair built in code: shells grown from the cranium, clipped at a hairline, plus tails/buns.
import * as THREE from 'three';
import { V, E, Cn, HEAD_Y, meshSDF, primBox, shadow } from './parts.js';

export const HAIR = ['bald', 'buzz', 'short', 'ponytail', 'long', 'bun'];
export const HAIR_COLORS = ['#0e0a08', '#2b1a10', '#4a2c18', '#7a4a24', '#b07a3a', '#d8b46a', '#9a9a9a', '#ece6da', '#ff2bd6', '#29f0ff'];

// hairline: forehead high at the front, temples at the sides, nape low at the back
const hairline = (front = 0.045) => (x, y, z) => {
  const t = Math.max(0, Math.min(1, (0.06 - z) / 0.14)); // 0 front .. 1 back
  return (HEAD_Y + front - t * (front + 0.075) + (z > 0.02 && Math.abs(x) < 0.07 ? 0 : 0)) - y;
};
const CACHE = new Map();

export function buildHair(style, prims, color, fem) {
  if (style === 'bald') return null;
  const key = style + (fem ? 'f' : 'm') + prims.length;
  if (!CACHE.has(key)) {
    const cr = prims.find(p => p.tag === 'head'), base = [cr], A = (...a) => base.push(...a);
    let pad = 0.011, clip = hairline(), kMul = 1;
    if (style === 'buzz') pad = 0.0035;
    if (style === 'short') { pad = 0.008;
      for (const [x, y, z, r] of [[0, 0.085, 0.03, 0.05], [-0.03, 0.08, 0.0, 0.045], [0.035, 0.078, -0.02, 0.045], [0, 0.07, -0.06, 0.05], [0.02, 0.07, 0.055, 0.035]])
        A(E(V(x, HEAD_Y + y, z), [r, r * 0.55, r], { k: 0.03 }));
    }
    if (style === 'ponytail') { pad = 0.007; const hl = clip; clip = (x, y, z) => z < -0.112 && y < HEAD_Y + 0.05 ? -1 : hl(x, y, z);
      A(E(V(0, HEAD_Y + 0.03, -0.108), [0.022, 0.02, 0.02], { k: 0.02 }),
        Cn(V(0, HEAD_Y + 0.03, -0.12), V(0, HEAD_Y - 0.08, -0.15), 0.024, 0.02, { k: 0.02 }),
        Cn(V(0, HEAD_Y - 0.08, -0.15), V(0.01, HEAD_Y - 0.21, -0.13), 0.02, 0.008, { k: 0.02 }));
    }
    if (style === 'bun') { pad = 0.008; A(E(V(0, HEAD_Y + 0.085, -0.075), [0.042, 0.038, 0.042], { k: 0.015 })); }
    if (style === 'long') { pad = 0.011; kMul = 1.2;
      A(E(V(0, HEAD_Y - 0.06, -0.075), [0.088, 0.13, 0.04], { k: 0.04 }));
      for (const s of [-1, 1]) A(Cn(V(s * 0.07, HEAD_Y + 0.0, 0.005), V(s * 0.08, HEAD_Y - 0.17, -0.035), 0.022, 0.016, { k: 0.04 }));
      const hl = hairline(0.05);
      clip = (x, y, z) => Math.max(y > HEAD_Y - 0.01 ? hl(x, y, z) : z - 0.02 + Math.max(0, HEAD_Y - 0.06 - y) * 0.3, HEAD_Y - 0.25 - y);
    }
    const ps = base.map(p => p === cr ? { ...cr, k: 0.02 } : { ...p });
    const b = primBox(ps, pad + 0.01), padded = ps.map((p, i) => i === 0 ? p : { ...p, r: p.r, ra: p.ra, rb: p.rb });
    const g = meshSDF(padded, b, style === 'buzz' ? 0.0035 : 0.0042, { pad, kMul, clip });
    g.userData.cached = true; CACHE.set(key, g);
  }
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: style === 'buzz' ? 0.9 : 0.5, sheen: 1, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35), sheenRoughness: 0.35,
    emissive: /^#(ff2bd6|29f0ff)$/i.test(color) ? color : '#000', emissiveIntensity: 0.25 });
  const g = new THREE.Group(); g.add(shadow(new THREE.Mesh(CACHE.get(key), m)));
  if (style === 'ponytail') { const tie = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 20), new THREE.MeshBasicMaterial({ color: '#29f0ff' }));
    tie.position.set(0, HEAD_Y + 0.0, -0.13); tie.rotation.x = 1.3; g.add(tie); }
  return g;
}
