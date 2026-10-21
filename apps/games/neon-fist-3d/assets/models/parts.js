// Neon Fist 3D — shared body frame + mesh helpers (used by male, female, attire).
import * as THREE from 'three';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...o });
const UP = V(0, 1, 0);
const shadow = m => { m.castShadow = true; return m; };

// build shape factors: w = overall width, sh = shoulder/chest, limb = limb girth, belly, depth = torso front-back
export const BUILD = {
  lean:     { w: 0.9,  sh: 0.94, limb: 0.82, belly: 0, depth: 0.6 },
  average:  { w: 1.0,  sh: 1.0,  limb: 1.0,  belly: 0, depth: 0.64 },
  muscular: { w: 1.04, sh: 1.2,  limb: 1.3,  belly: 0, depth: 0.7 },
  fat:      { w: 1.18, sh: 1.06, limb: 1.32, belly: 1, depth: 0.86 },
};

// torso profiles [y, radius], crotch -> base of neck
const PROFILE = {
  male:   [[0.86,0.02],[0.88,0.12],[0.95,0.15],[1.05,0.14],[1.15,0.15],[1.27,0.18],[1.36,0.2],[1.42,0.19],[1.46,0.14],[1.49,0.05]],
  female: [[0.86,0.02],[0.88,0.13],[0.95,0.172],[1.02,0.158],[1.1,0.118],[1.2,0.13],[1.3,0.148],[1.4,0.152],[1.46,0.12],[1.49,0.05]],
};

// Joint layout for a gender + build (metres, before height scaling). Relaxed stance.
export function frame(gender, build) {
  const b = BUILD[build], fem = gender === 'female', L = b.limb * (fem ? 0.88 : 1);
  const shW = (fem ? 0.165 : 0.2) * b.sh * b.w, hipW = (fem ? 0.1 : 0.088) * b.w;
  const torso = PROFILE[gender].map(([y, r]) => {
    let k = y < 1.2 ? b.w : b.w * (fem ? (1 + (b.sh - 1) * 0.5) : b.sh);
    r *= k;
    if (b.belly) r += 0.05 * Math.exp(-(((y - 1.08) / 0.11) ** 2));
    return [y, Math.max(0.02, r)];
  });
  const J = { fem, b, shW, hipW, torso, depth: b.depth, shY: 1.42, arms: [], legs: [],
    r: { ua: [0.048 * L, 0.038 * L], fa: [0.036 * L, 0.027 * L], th: [0.075 * L * (fem ? 1.08 : 1), 0.05 * L], ca: [0.048 * L, 0.03 * L] } };
  for (const sd of [-1, 1]) {
    const sh = V(sd * shW, 1.41, 0);
    const el = V(sd * (shW + 0.045 + 0.02 * b.belly), 1.14, -0.03);
    const wr = V(sd * (shW + 0.055 + 0.03 * b.belly), 0.9, 0.05);
    J.arms.push({ sd, sh, el, wr });
    const hp = V(sd * hipW, 0.9, 0), kn = V(sd * (hipW + 0.015), 0.5, 0.025), an = V(sd * (hipW + 0.03), 0.08, 0);
    J.legs.push({ sd, hp, kn, an, toe: sd * 0.18 });
  }
  return J;
}

export function radiusAt(prof, y) {
  for (let i = 1; i < prof.length; i++) if (y <= prof[i][0]) {
    const [y0, r0] = prof[i - 1], [y1, r1] = prof[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return prof[prof.length - 1][1];
}

// Smooth lathe of a [y,r] profile, squashed front-back by depth. y0/y1 clip, pad inflates (clothes).
export function lathe(material, prof, depth, { y0 = -1, y1 = 9, pad = 0, capBottom = false, capTop = false } = {}) {
  const pts = [];
  const lo = Math.max(y0, prof[0][0]), hi = Math.min(y1, prof[prof.length - 1][0]);
  const N = 22;
  for (let i = 0; i <= N; i++) { const y = lo + (hi - lo) * i / N; pts.push(new THREE.Vector2(radiusAt(prof, y) + pad, y)); }
  if (capBottom) pts.unshift(new THREE.Vector2(0.001, lo));
  if (capTop) pts.push(new THREE.Vector2(0.001, hi));
  const m = shadow(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), material));
  m.scale.z = depth; return m;
}

export function taper(material, a, b, ra, rb, seg = 12) {
  const len = a.distanceTo(b);
  const m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, len, seg, 1, true), material));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return m;
}
export function ball(material, p, r, sx = 1, sy = 1, sz = 1) {
  const m = shadow(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), material));
  m.position.copy(p); m.scale.set(sx, sy, sz); return m;
}
export function box(material, p, w, h, d) {
  const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)); m.position.copy(p); return m;
}
export const lerpV = (a, b, t) => a.clone().lerp(b, t);

// Tapered limb with joint balls. Used by both bodies.
export function limbs(g, J, skin) {
  const { ua, fa, th, ca } = J.r;
  for (const { sh, el, wr } of J.arms) {
    g.add(ball(skin, sh, 0.06 * J.b.sh * J.b.w * (J.fem ? 0.85 : 1)));
    g.add(taper(skin, sh, el, ua[0], ua[1]), ball(skin, el, ua[1]));
    g.add(taper(skin, el, wr, fa[0], fa[1]), ball(skin, wr, fa[1]));
  }
  for (const { hp, kn, an } of J.legs) {
    g.add(ball(skin, hp, th[0]));
    g.add(taper(skin, hp, kn, th[0], th[1]), ball(skin, kn, th[1]));
    g.add(taper(skin, kn, an, ca[0], ca[1]), ball(skin, an, ca[1]));
  }
}
export function hands(g, J, skin, k = 1) {
  for (const { sd, wr } of J.arms) {
    g.add(ball(skin, wr.clone().add(V(0, -0.055 * k, 0.005)), 0.045 * k, 0.55, 1.15, 0.95));
    const th = taper(skin, wr.clone().add(V(-sd * 0.005, -0.02, 0.03)), wr.clone().add(V(-sd * 0.012, -0.06 * k, 0.05)), 0.012 * k, 0.01 * k, 8);
    g.add(th);
  }
}
export function feet(g, J, skin, k = 1) {
  for (const { an, toe } of J.legs) {
    const f = ball(skin, V(an.x, 0.035, 0.045), 0.05 * k, 0.85, 0.65, 2.1); f.rotation.y = toe; g.add(f);
  }
}
// face: cranium, jaw, nose, ears, brows, glowing eyes
export function head(g, skin, o) {
  const y = 1.68;
  g.add(ball(skin, V(0, y, 0), 1, o.cw, o.ch, o.cd));
  g.add(ball(skin, V(0, y - 0.075, 0.02), 1, o.jw, o.jh, o.jd));
  const nose = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.014 * o.nose, 0.04, 8), skin));
  nose.position.set(0, y - 0.015, o.cd + 0.005); nose.rotation.x = Math.PI * 0.62; g.add(nose);
  for (const s of [-1, 1]) g.add(ball(skin, V(s * o.cw * 0.98, y - 0.005, -0.005), 0.022, 0.5, 1.2, 0.8));
  const brow = mat('#1a1010');
  for (const s of [-1, 1]) { const br = box(brow, V(s * 0.035, y + 0.03, o.cd - 0.012), 0.038, o.brow, 0.012); br.rotation.z = -s * 0.08; g.add(br); }
  const eye = new THREE.MeshBasicMaterial({ color: '#29f0ff' });
  for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eye).translateX(s * 0.035).translateY(y + 0.008).translateZ(o.cd - 0.016));
}
export const HEAD_Y = 1.68;
