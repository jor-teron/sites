// Neon Fist 3D — clothing built in code, fitted to the body frame.
import * as THREE from 'three';
import { V, mat, lathe, limb, taper, ball, box, lerpV, radiusAt, HEAD_Y } from './parts.js';
import { bust, glutes } from './female.js';

export const ATTIRE = {
  footwear: ['barefoot', 'sneakers', 'boots', 'sandals'],
  top: ['none', 'tank', 'tshirt', 'hoodie', 'jacket'],
  bottom: ['shorts', 'pants', 'joggers', 'skirt'],
  headwear: ['none', 'cap', 'beanie', 'helmet', 'headband'],
};
const C = { top: '#2a1f55', hoodie: '#3a1040', jacket: '#151520', bottom: '#202040', jog: '#2b2b33', skirt: '#4a1450',
  shoe: '#111', neonA: '#ff2bd6', neonB: '#29f0ff' };
const glow = (c, i = 0.6) => mat(c, { emissive: c, emissiveIntensity: i });

function sleeve(g, J, m, t, pad) { // t = fraction of arm down to wrist (0.5 = elbow)
  const { ua, fa } = J.r;
  for (const { sh, el, wr } of J.arms) {
    g.add(ball(m, sh, 0.065 * J.b.sh * J.b.w * (J.fem ? 0.88 : 1) + pad * 0.5));
    if (t <= 0.5) { const e = lerpV(sh, el, t * 2); g.add(taper(m, sh, e, ua[0] + pad, ua[0] + (ua[1] - ua[0]) * t * 2 + pad)); }
    else { g.add(taper(m, sh, el, ua[0] + pad, ua[1] + pad), ball(m, el, ua[1] + pad)); g.add(taper(m, el, lerpV(el, wr, (t - 0.5) * 2), ua[1] + pad, fa[1] + pad)); }
  }
}
function torsoCloth(g, J, m, y0, y1, pad = 0.014) {
  g.add(lathe(m, J.torso, J.depth, { y0, y1, pad }));
  if (J.fem && y1 > 1.3) { const B = bust(J); for (const s of [-1, 1]) { const b = ball(m, V(s * B.x, B.y, B.z), B.r + 0.008, 1, 0.92, 0.8); b.rotation.z = s * 0.2; g.add(b); } }
  if (!J.fem && y1 > 1.3) for (const s of [-1, 1]) g.add(ball(m, V(s * 0.075 * J.b.sh, 1.34, 0.07 * J.depth / 0.64), 0.075 * J.b.sh + 0.008, 1.05, 0.6, 0.55));
}

function top(g, J, kind) {
  if (kind === 'none') { if (J.fem) torsoCloth(g, J, glow('#1a1a2a', 0), 1.22, 1.4, 0.01); return; } // sports top
  if (kind === 'tank') { torsoCloth(g, J, mat(C.top), 0.96, 1.44); g.add(box(glow(C.neonB), V(0, 1.2, radiusAt(J.torso, 1.2) * J.depth + 0.012), 0.12, 0.012, 0.004)); return; }
  if (kind === 'tshirt') { const m = mat(C.top); torsoCloth(g, J, m, 0.95, 1.49); sleeve(g, J, m, 0.3, 0.012); return; }
  const hood = kind === 'hoodie', m = mat(hood ? C.hoodie : C.jacket, { roughness: hood ? 0.9 : 0.4 });
  torsoCloth(g, J, m, 0.92, 1.49, 0.022); sleeve(g, J, m, 0.95, 0.018);
  const fz = (y) => radiusAt(J.torso, y) * J.depth + 0.024;
  if (hood) {
    g.add(ball(m, V(0, 1.5, -0.1), 0.12, 1.1, 0.55, 0.7)); // hood down on back
    g.add(box(m, V(0, 1.08, fz(1.08) + 0.005), 0.2 * J.b.w, 0.1, 0.02)); // pocket
    for (const s of [-1, 1]) g.add(taper(glow(C.neonA), V(s * 0.03, 1.45, fz(1.45)), V(s * 0.03, 1.33, fz(1.33)), 0.004, 0.004, 6));
  } else {
    g.add(box(glow(C.neonB, 0.9), V(0, 1.2, fz(1.2)), 0.008, 0.5, 0.006)); // zip
    for (const s of [-1, 1]) { const c = box(m, V(s * 0.06, 1.5, 0.04), 0.07, 0.05, 0.02); c.rotation.z = s * 0.5; g.add(c); } // collar
  }
}

function bottom(g, J, kind) {
  const { th, ca } = J.r;
  const m = mat(kind === 'joggers' ? C.jog : kind === 'skirt' ? C.skirt : C.bottom, { roughness: 0.85 });
  g.add(lathe(m, J.torso, J.depth, { y0: 0.86, y1: kind === 'skirt' ? 1.06 : 1.03, pad: 0.016, capBottom: true }));
  g.add(lathe(glow(C.neonA, 0.4), J.torso, J.depth, { y0: 1.0, y1: 1.02, pad: 0.02 })); // waistband
  if (J.fem) { const G = glutes(J); for (const s of [-1, 1]) g.add(ball(m, V(s * G.x, G.y, G.z), G.r + 0.008, 1, 0.95, 0.82)); }
  if (kind === 'skirt') { // flared A-line with soft pleats
    const rTop = radiusAt(J.torso, 0.95) + 0.03, pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(rTop + 0.15 * t ** 1.6 + 0.02 * Math.sin(t * Math.PI) , 1.0 - 0.42 * t)); }
    const geo = new THREE.LatheGeometry(pts.reverse(), 48), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), t = (1.0 - p.getY(i)) / 0.42, k = 1 + 0.05 * t * Math.sin(Math.atan2(z, x) * 14); p.setX(i, x * k); p.setZ(i, z * k); }
    geo.computeVertexNormals();
    const sk = new THREE.Mesh(geo, mat(C.skirt, { roughness: 0.85, side: THREE.DoubleSide })); sk.scale.z = Math.max(0.8, J.depth + 0.16); sk.castShadow = true; g.add(sk);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 48), glow(C.neonB, 0.6)).rotateX(Math.PI / 2).translateZ(0.0)); g.children.at(-1).scale.set(rTop + 0.15 * 1 + 0.003, rTop + 0.15 + 0.003, 1); g.children.at(-1).position.y = 0.58; g.children.at(-1).scale.y *= sk.scale.z;
    return;
  }
  for (const { hp, kn, an } of J.legs) {
    const p = 0.012;
    if (kind === 'shorts') { const e = lerpV(hp, kn, 0.6), r1 = th[0] + (th[1] - th[0]) * 0.6 + p + 0.008; g.add(J.fem ? limb(m, hp, e, th[0] + p, r1, 0.01, 0.4, 20) : taper(m, hp, e, th[0] + p, r1)); continue; }
    const loose = kind === 'pants' ? 0.012 : 0;
    if (J.fem) { // follow the R3 female thigh and calf curves
      g.add(limb(m, hp, kn, th[0] + p, th[1] + p, 0.01, 0.25, 20));
      g.add(limb(m, kn, an.clone().add(V(0, 0.03, 0)), th[1] * 0.9 + p, ca[1] + p + loose, 0.016, 0.3, 18));
    } else {
      g.add(taper(m, hp, kn, th[0] + p, th[1] + p), ball(m, kn, th[1] + p));
      g.add(taper(m, kn, an.clone().add(V(0, 0.03, 0)), th[1] + p, ca[1] + p + loose));
    }
    if (kind === 'joggers') g.add(taper(glow(C.neonB, 0.3), an.clone().add(V(0, 0.03, 0)), an.clone().add(V(0, 0.07, 0)), ca[1] + p + 0.004, ca[1] + p + 0.004));
  }
}

function footwear(g, J, kind) {
  if (kind === 'barefoot') return;
  const k = J.fem ? 0.92 : 1.05;
  for (const { an, toe } of J.legs) {
    const f = new THREE.Group(); f.position.set(an.x, 0, an.z + 0.045); f.rotation.y = toe; g.add(f);
    const sole = mat(kind === 'sandals' ? '#5a3a20' : '#eee'); 
    if (kind === 'sandals') {
      f.add(box(sole, V(0, 0.008, 0), 0.085 * k, 0.016, 0.24 * k));
      const strap = glow(C.neonA, 0.5);
      f.add(box(strap, V(0, 0.04, 0.03), 0.09 * k, 0.012, 0.025), box(strap, V(0, 0.05, -0.05), 0.09 * k, 0.012, 0.02));
      continue;
    }
    const up = mat(kind === 'boots' ? '#2a1a12' : C.shoe, { roughness: 0.5, emissive: C.neonA, emissiveIntensity: kind === 'sneakers' ? 0.15 : 0 });
    f.add(box(sole, V(0, 0.012, 0.005), 0.1 * k, 0.024, 0.25 * k));
    f.add(ball(up, V(0, 0.04, 0.005), 0.054 * k, 0.88, 0.62, 2.05));
    if (kind === 'sneakers') f.add(box(glow(C.neonB), V(0, 0.026, 0.005), 0.102 * k, 0.006, 0.252 * k));
    else f.add(taper(up, V(0, 0.03, -0.035), V(0, 0.3, -0.045 + 0.01), J.r.ca[1] + 0.02, J.r.ca[0] * 0.8 + 0.02));
  }
}

function headwear(g, J, kind) {
  if (kind === 'none') return;
  const y = HEAD_Y, cw = J.fem ? 0.088 : 0.095, cd = J.fem ? 0.098 : 0.105;
  const cap = (m, top, s = 1) => { const h = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, top), m); h.scale.set((cw + 0.012) * s, 0.13 * s, (cd + 0.012) * s); h.position.y = y; h.castShadow = true; return h; };
  if (kind === 'cap') {
    const m = mat('#1b1b3a'); g.add(cap(m, Math.PI * 0.45));
    const brim = box(m, V(0, y + 0.03, cd + 0.05), 0.15, 0.01, 0.1); brim.rotation.x = 0.12; g.add(brim);
    g.add(box(glow(C.neonA), V(0, y + 0.075, cd - 0.012), 0.04, 0.025, 0.01));
  } else if (kind === 'beanie') {
    const m = mat('#7a1a3a', { roughness: 0.95 }); g.add(cap(m, Math.PI * 0.5, 1.03));
    g.add(ball(m, V(0, y + 0.145, 0), 0.025)); 
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 8, 24), m); cuff.rotation.x = Math.PI / 2; cuff.scale.set(cw + 0.01, cd + 0.01, 0.12); cuff.position.y = y + 0.01; g.add(cuff);
  } else if (kind === 'helmet') {
    const m = mat('#1a1a26', { roughness: 0.25, metalness: 0.6 }); g.add(cap(m, Math.PI * 0.62, 1.12));
    const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.38, Math.PI * 0.17), glow(C.neonB, 0.8));
    visor.scale.set(cw + 0.022, 0.15, cd + 0.024); visor.position.y = y; g.add(visor);
  } else if (kind === 'headband') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 28), glow(C.neonA, 0.7));
    band.rotation.x = Math.PI / 2; band.scale.set(cw + 0.006, cd + 0.006, 0.12); band.position.y = y + 0.045; g.add(band);
  }
}

export function buildAttire(h, J) {
  const g = new THREE.Group(); g.name = 'attire';
  bottom(g, J, h.bottom); top(g, J, h.top); footwear(g, J, h.footwear); headwear(g, J, h.headwear);
  return g;
}
