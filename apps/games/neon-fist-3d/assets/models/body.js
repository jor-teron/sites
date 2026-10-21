// Neon Fist 3D — hero body from primitives. Shared by builder and (later) game.
import * as THREE from 'three';

export const SKINS = ['#3b2219','#5a3825','#7a4b2f','#9a6440','#b57b52','#c99068','#dba67f','#e8bc98','#f3d2b6','#fbe3cf'];
export const BUILDS = ['lean', 'average', 'muscular', 'fat'];
export const DEFAULT_HERO = { v: 1, gender: 'male', build: 'average', height: 178, skin: SKINS[5] };

const BUILD = { // limb thickness, torso width, belly, shoulder bulk
  lean:     { limb: 0.85, torso: 0.88, belly: 0.0, sh: 0.95 },
  average:  { limb: 1.0,  torso: 1.0,  belly: 0.0, sh: 1.0 },
  muscular: { limb: 1.3,  torso: 1.12, belly: 0.0, sh: 1.25 },
  fat:      { limb: 1.35, torso: 1.25, belly: 1.0, sh: 1.05 },
};

export function randomHero(rnd = Math.random) {
  const pick = a => a[Math.floor(rnd() * a.length)];
  return { v: 1, gender: pick(['male', 'female']), build: pick(BUILDS), height: Math.round(150 + rnd() * 55), skin: pick(SKINS) };
}

export function sanitizeHero(h) {
  const o = { ...DEFAULT_HERO, ...(h || {}) };
  if (!['male', 'female'].includes(o.gender)) o.gender = 'male';
  if (!BUILDS.includes(o.build)) o.build = 'average';
  o.height = Math.min(205, Math.max(150, Number(o.height) || 178));
  if (!/^#[0-9a-f]{6}$/i.test(o.skin)) o.skin = DEFAULT_HERO.skin;
  return o;
}

function capsuleBetween(mat, a, b, r) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 12), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Builds a group, feet on y=0, units in metres.
export function buildHero(hero) {
  const h = sanitizeHero(hero), b = BUILD[h.build], fem = h.gender === 'female';
  const s = h.height / 178;
  const g = new THREE.Group(); g.name = 'hero';
  const skin = new THREE.MeshStandardMaterial({ color: h.skin, roughness: 0.6 });
  const shorts = new THREE.MeshStandardMaterial({ color: '#202040', roughness: 0.8 });
  const shoe = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.5, emissive: '#ff2bd6', emissiveIntensity: 0.15 });
  const shW = (fem ? 0.17 : 0.21) * b.sh, hipW = (fem ? 0.13 : 0.11) * b.torso;
  const L = b.limb * (fem ? 0.9 : 1);
  const hipY = 0.92, shY = 1.42, neckY = 1.5;

  // torso: scaled sphere chest + pelvis + optional belly
  const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), skin);
  chest.scale.set(shW * 1.05, 0.26, 0.13 * b.torso); chest.position.y = 1.27; chest.castShadow = true; g.add(chest);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), shorts);
  pelvis.scale.set(hipW + 0.05, 0.14, 0.12 * b.torso); pelvis.position.y = 0.98; g.add(pelvis);
  const waist = capsuleBetween(skin, V(0, 1.02, 0), V(0, 1.2, 0), 0.11 * b.torso * (fem ? 0.9 : 1)); g.add(waist);
  if (b.belly) { const bel = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin); bel.position.set(0, 1.1, 0.06); bel.scale.set(1.1, 1, 0.9); g.add(bel); }
  if (fem) for (const x of [-0.07, 0.07]) { const br = new THREE.Mesh(new THREE.SphereGeometry(0.065 * (b.belly ? 1.3 : 1), 12, 10), skin); br.position.set(x, 1.3, 0.1 * b.torso); g.add(br); }

  // neck + head
  g.add(capsuleBetween(skin, V(0, neckY - 0.04, 0), V(0, neckY + 0.06, 0), 0.05 * (b.sh > 1.1 ? 1.2 : 1)));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), skin);
  head.scale.set(fem ? 0.9 : 1, 1.15, 1); head.position.y = 1.66; head.castShadow = true; g.add(head);
  const eyeM = new THREE.MeshBasicMaterial({ color: '#29f0ff' });
  for (const x of [-0.035, 0.035]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), eyeM); e.position.set(x, 1.68, 0.1); g.add(e); }

  // arms + hands
  for (const sd of [-1, 1]) {
    const sh = V(sd * shW, shY, 0), el = V(sd * (shW + 0.05), 1.15, 0.02), wr = V(sd * (shW + 0.07), 0.9, 0.06);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.055 * b.sh, 12, 10), skin).translateX(sh.x).translateY(sh.y));
    g.add(capsuleBetween(skin, sh, el, 0.042 * L));
    g.add(capsuleBetween(skin, el, wr, 0.035 * L));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skin);
    hand.scale.set(0.7, 1.1, 0.9); hand.position.copy(wr).add(V(0, -0.06, 0)); g.add(hand);
  }
  // legs + feet
  for (const sd of [-1, 1]) {
    const hp = V(sd * hipW * 0.75, hipY, 0), kn = V(sd * hipW * 0.7, 0.5, 0.02), an = V(sd * hipW * 0.7, 0.08, 0);
    g.add(capsuleBetween(shorts, hp, V(hp.x, 0.72, 0.01), 0.07 * L * (fem ? 1.08 : 1)));
    g.add(capsuleBetween(skin, V(hp.x, 0.72, 0.01), kn, 0.06 * L));
    g.add(capsuleBetween(skin, kn, an, 0.045 * L));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.22), shoe);
    foot.position.set(an.x, 0.035, 0.05); foot.castShadow = true; g.add(foot);
  }
  g.scale.setScalar(s);
  g.userData.hero = h;
  return g;
}
