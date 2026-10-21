// Neon Fist 3D — hero data: defaults, random, sanitize (v1 -> v2), and assembling the model.
import * as THREE from 'three';
import { BUILD, frame } from '../assets/models/parts.js';
import { buildMale } from '../assets/models/male.js';
import { buildFemale } from '../assets/models/female.js';
import { ATTIRE, buildAttire } from '../assets/models/attire.js';

export const SKINS = ['#3b2219','#5a3825','#7a4b2f','#9a6440','#b57b52','#c99068','#dba67f','#e8bc98','#f3d2b6','#fbe3cf'];
export const BUILDS = Object.keys(BUILD);
export { ATTIRE };
export const DEFAULT_HERO = { v: 2, gender: 'male', build: 'average', height: 178, skin: SKINS[5],
  footwear: 'sneakers', top: 'tshirt', bottom: 'shorts', headwear: 'none' };

export function randomHero(rnd = Math.random) {
  const pick = a => a[Math.floor(rnd() * a.length)];
  const h = { v: 2, gender: pick(['male', 'female']), build: pick(BUILDS), height: Math.round(150 + rnd() * 55), skin: pick(SKINS) };
  for (const k in ATTIRE) h[k] = pick(ATTIRE[k]);
  return h;
}

export function sanitizeHero(h) {
  const o = { ...DEFAULT_HERO, ...(h && typeof h === 'object' ? h : {}) };
  delete o.type;
  if (!['male', 'female'].includes(o.gender)) o.gender = 'male';
  if (!BUILDS.includes(o.build)) o.build = 'average';
  o.height = Math.min(205, Math.max(150, Math.round(Number(o.height)) || 178));
  if (!/^#[0-9a-f]{6}$/i.test(o.skin)) o.skin = DEFAULT_HERO.skin;
  for (const k in ATTIRE) if (!ATTIRE[k].includes(o[k])) o[k] = DEFAULT_HERO[k];
  o.v = 2;
  return o;
}

// Group with feet on y=0, metres.
export function buildHero(hero) {
  const h = sanitizeHero(hero), J = frame(h.gender, h.build);
  const skin = new THREE.MeshStandardMaterial({ color: h.skin, roughness: 0.6 });
  const g = new THREE.Group(); g.name = 'hero';
  g.add((h.gender === 'female' ? buildFemale : buildMale)(J, skin), buildAttire(h, J));
  g.scale.setScalar(h.height / 178);
  g.userData.hero = h;
  return g;
}
