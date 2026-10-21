// Neon Fist 3D — female body (R3): smooth spline torso, blended limbs, sculpted face, fingers, shaped feet.
import * as THREE from 'three';
import { V, mat, lathe, limb, ball, radiusAt, HEAD_Y } from './parts.js';

const zf = (J, y) => radiusAt(J.torso, y) * J.depth; // front surface depth of the torso at height y
export function bust(J) {
  const k = J.b.belly ? 1.2 : J.b.w * (1 + (J.b.sh - 1) * 0.3);
  return { y: 1.31, x: 0.064 * k, z: zf(J, 1.31) - 0.045 * k, r: 0.058 * k };
}
export function glutes(J) {
  const k = J.b.w * (J.b.belly ? 1.05 : 1) * (J.b.sh > 1.1 ? 1.05 : 1);
  return { y: 0.955, x: 0.064 * k, z: -(zf(J, 0.955) - 0.045 * k), r: 0.062 * k };
}
const tint = (skin, hex, t) => '#' + new THREE.Color(skin.color).lerp(new THREE.Color(hex), t).getHexString();

function torso(g, J, skin) {
  g.add(lathe(skin, J.torso, J.depth, { capBottom: true }));
  const B = bust(J), G = glutes(J);
  for (const s of [-1, 1]) {
    const m = ball(skin, V(s * B.x, B.y, B.z), B.r, 1, 0.95, 0.82); m.rotation.set(-0.15, 0, s * 0.25); g.add(m);
    g.add(ball(skin, V(s * G.x, G.y, G.z), G.r, 1, 0.95, 0.82));
    // collarbone ridge + soft trapezius slope
    const cy = 1.455, cz = zf(J, cy) - 0.006;
    g.add(limb(skin, V(s * 0.022, cy + 0.005, cz), V(s * J.shW * 0.82, cy - 0.005, cz * 0.6), 0.009, 0.011));
    g.add(limb(skin, V(s * 0.03, 1.49, -0.015), V(s * J.shW * 0.8, 1.425, -0.01), 0.032, 0.04));
  }
  g.add(limb(skin, V(0, 1.44, -0.006), V(0, 1.6, 0.008), 0.047, 0.038));
}

function arms(g, J, skin) {
  const { ua, fa } = J.r, mus = J.b.sh > 1.1 ? 0.008 : 0.003;
  for (const { sd, sh, el, wr } of J.arms) {
    g.add(ball(skin, sh.clone().add(V(-sd * 0.006, 0.004, 0)), ua[0] * 1.15, 1.05, 0.95, 1.05)); // deltoid
    g.add(limb(skin, V(sd * J.shW * 0.6, 1.43, 0), sh, 0.05, ua[0] * 1.1)); // shoulder blend
    g.add(limb(skin, sh, el, ua[0], ua[1], mus, 0.3));
    g.add(limb(skin, el, wr, fa[0], fa[1], 0.004, 0.2));
    hand(g, skin, sd, wr, el);
  }
}
function hand(g, skin, sd, wr, el) {
  const h = new THREE.Group(); h.position.copy(wr);
  const dir = wr.clone().sub(el).normalize(); h.quaternion.setFromUnitVectors(V(0, -1, 0), dir); g.add(h);
  h.add(ball(skin, V(0, -0.035, 0.004), 0.034, 0.5, 1.05, 0.95)); // palm faces the thigh
  [-0.017, -0.006, 0.006, 0.017].forEach((z, i) => {
    const len = [0.034, 0.042, 0.044, 0.04][i], a = V(-sd * 0.002, -0.066, z), m = a.clone().add(V(-sd * 0.006, -len * 0.55, z * 0.1));
    h.add(limb(skin, a, m, 0.0062, 0.0056, 0, 0.5, 8), limb(skin, m, m.clone().add(V(-sd * 0.012, -len * 0.45, 0)), 0.0056, 0.0045, 0, 0.5, 8));
  });
  const t0 = V(-sd * 0.008, -0.02, 0.022), t1 = V(-sd * 0.016, -0.045, 0.034);
  h.add(limb(skin, t0, t1, 0.008, 0.0065, 0, 0.5, 8), limb(skin, t1, V(-sd * 0.02, -0.065, 0.036), 0.0065, 0.0052, 0, 0.5, 8));
}

function legs(g, J, skin) {
  const { th, ca } = J.r;
  for (const { sd, hp, kn, an, toe } of J.legs) {
    g.add(limb(skin, hp, kn, th[0], th[1], 0.01, 0.25, 20));            // full thigh
    g.add(limb(skin, kn, an, ca[0] * 0.95, ca[1] * 0.9, 0.012, 0.28, 18)); // calf bulge high on the shin
    g.add(ball(skin, kn.clone().add(V(0, 0.005, 0.022)), th[1] * 0.62, 1, 1.1, 0.7)); // kneecap
    const f = new THREE.Group(); f.position.set(an.x, 0, an.z + 0.045); f.rotation.y = toe; g.add(f);
    f.add(limb(skin, V(0, an.y + 0.01, -0.045), V(0, 0.036, -0.05), ca[1] * 0.9, 0.03, 0, 0.5, 14)); // ankle into heel
    f.add(ball(skin, V(0, 0.032, -0.06), 0.031, 1, 0.95, 1.1));                    // heel
    f.add(limb(skin, V(0, 0.034, -0.05), V(0, 0.018, 0.07), 0.028, 0.02, 0.004, 0.3, 14)); // arch + instep
    f.add(ball(skin, V(0, 0.018, 0.07), 0.036, 1, 0.5, 0.75));                       // ball of foot
    [-0.022, -0.009, 0.003, 0.014, 0.024].forEach((x, i) => f.add(ball(skin, V(-sd * x, 0.012, (i ? 0.096 - i * 0.006 : 0.1)), i ? 0.0085 - i * 0.0005 : 0.011)));
  }
}

function face(g, skin) {
  const y = HEAD_Y, cw = 0.088, ch = 0.108, cd = 0.098;
  g.add(ball(skin, V(0, y + 0.005, -0.004), 1, cw, ch, cd));                 // cranium
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);    // tapered jaw to a soft chin
  const p = jaw.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const yy = p.getY(i), k = yy < 0 ? 1 + yy * 0.42 : 1; p.setX(i, p.getX(i) * k); }
  jaw.geometry.computeVertexNormals(); jaw.scale.set(0.072, 0.072, 0.08); jaw.position.set(0, y - 0.045, 0.0); jaw.castShadow = true; g.add(jaw);
  const lip = mat(tint(skin, '#d0306a', 0.45), { roughness: 0.35 }), dark = mat('#140a14'), brow = mat('#1a1010');
  const eye = new THREE.MeshBasicMaterial({ color: '#29f0ff' });
  for (const s of [-1, 1]) {
    g.add(ball(skin, V(s * 0.045, y - 0.024, 0.054), 0.019, 1, 0.7, 0.8));          // cheekbone
    g.add(ball(dark, V(s * 0.032, y + 0.004, 0.078), 0.0145, 1.35, 0.85, 0.5));        // eye socket shadow
    g.add(ball(mat('#f4f0ff'), V(s * 0.032, y + 0.004, 0.077), 0.0115, 1.2, 0.8, 0.9)); // eyeball
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.0065, 10, 8), eye).translateX(s * 0.032).translateY(y + 0.004).translateZ(0.0845)); // neon iris
    const br = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0028, 6, 14, 1.6), brow); // arched brow
    br.position.set(s * 0.032, y + 0.006, 0.084); br.rotation.z = Math.PI / 2 - 0.8 + s * 0.1; br.scale.set(1, 1, 0.6); g.add(br);
    const ear = ball(skin, V(s * cw * 0.96, y - 0.006, -0.012), 0.024, 0.35, 1.15, 0.72); ear.rotation.y = s * 0.3; g.add(ear);
    g.add(ball(dark, V(s * (cw * 0.96 + 0.005), y - 0.008, -0.008), 0.011, 0.3, 1, 0.6));
    g.add(ball(skin, V(s * 0.008, y - 0.046, 0.093), 0.0055, 1.1, 0.8, 0.9));     // nostril wing
  }
  g.add(limb(skin, V(0, y - 0.004, 0.088), V(0, y - 0.04, 0.1), 0.0055, 0.0075, 0, 0.5, 10)); // nose bridge
  g.add(ball(skin, V(0, y - 0.042, 0.099), 0.0095, 1, 0.85, 0.9));       // nose tip
  g.add(ball(lip, V(0, y - 0.065, 0.088), 0.014, 1.25, 0.36, 0.5));     // upper lip
  g.add(ball(lip, V(0, y - 0.074, 0.086), 0.013, 1.1, 0.45, 0.55));        // lower lip
  g.add(ball(skin, V(0, y - 0.098, 0.056), 0.016, 1.1, 0.8, 0.8));          // chin
}

export function buildFemale(J, skin) {
  const g = new THREE.Group();
  torso(g, J, skin); arms(g, J, skin); legs(g, J, skin); face(g, skin);
  return g;
}
