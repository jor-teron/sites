// Neon Fist 3D — hero data: defaults, random, sanitize (v1/v2 -> v3), and assembling the model.
import * as THREE from 'three';
import { BUILD, frame, skinGeometries, faceDetails, shadow } from '../assets/models/parts.js';
import { malePrims } from '../assets/models/male.js';
import { femalePrims } from '../assets/models/female.js';
import { ATTIRE, buildAttire } from '../assets/models/attire.js';
import { HAIR, HAIR_COLORS, buildHair } from '../assets/models/hair.js';

export const SKINS = ['#3b2219','#5a3825','#7a4b2f','#9a6440','#b57b52','#c99068','#dba67f','#e8bc98','#f3d2b6','#fbe3cf'];
export const BUILDS = Object.keys(BUILD);
export { ATTIRE, HAIR, HAIR_COLORS };
export const PICKERS = { ...ATTIRE, hair: HAIR };
export const DEFAULT_HERO = { v: 3, gender: 'male', build: 'average', height: 178, skin: SKINS[5],
  footwear: 'sneakers', top: 'tshirt', bottom: 'shorts', headwear: 'none', hair: 'short', hairColor: HAIR_COLORS[1] };

export function randomHero(rnd = Math.random) {
  const pick = a => a[Math.floor(rnd() * a.length)];
  const h = { v: 3, gender: pick(['male', 'female']), build: pick(BUILDS), height: Math.round(150 + rnd() * 55), skin: pick(SKINS) };
  for (const k in PICKERS) h[k] = pick(PICKERS[k]);
  h.hairColor = rnd() < 0.8 ? pick(HAIR_COLORS.slice(0, 8)) : pick(HAIR_COLORS);
  return h;
}

export function sanitizeHero(h) {
  const src = h && typeof h === 'object' ? h : {};
  const o = { ...DEFAULT_HERO, ...src };
  delete o.type;
  if (!['male', 'female'].includes(o.gender)) o.gender = 'male';
  if (!src.hair) o.hair = o.gender === 'female' ? 'ponytail' : 'short'; // v1/v2 saves had no hair
  if (!BUILDS.includes(o.build)) o.build = 'average';
  o.height = Math.min(205, Math.max(150, Math.round(Number(o.height)) || 178));
  if (!/^#[0-9a-f]{6}$/i.test(o.skin)) o.skin = DEFAULT_HERO.skin;
  if (!HAIR_COLORS.includes(o.hairColor)) o.hairColor = DEFAULT_HERO.hairColor;
  for (const k in PICKERS) if (!PICKERS[k].includes(o[k])) o[k] = DEFAULT_HERO[k];
  o.v = 3;
  return o;
}

// Bodies are cached per gender+build (height is a scale, skin is a material), so picker changes are instant.
const BODIES = new Map();
export function body(gender, build) {
  const key = gender + '|' + build;
  if (!BODIES.has(key)) {
    const J = frame(gender, build), prims = (gender === 'female' ? femalePrims : malePrims)(J), geos = skinGeometries(prims, J);
    for (const g of [geos.body, geos.head, ...geos.hands]) g.userData.cached = true;
    BODIES.set(key, { J, prims, geos });
  }
  return BODIES.get(key);
}

export function skinMaterial(color) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({ color: c, vertexColors: true, roughness: 0.52, metalness: 0,
    sheen: 0.35, sheenColor: new THREE.Color('#ff8f80').lerp(c, 0.4), sheenRoughness: 0.55,
    clearcoat: 0.06, clearcoatRoughness: 0.45, emissive: c.clone().multiply(new THREE.Color('#ff5a40')), emissiveIntensity: 0.05 });
}

// Group with feet on y=0, metres.
export function buildHero(hero) {
  const h = sanitizeHero(hero), { J, prims, geos } = body(h.gender, h.build), skin = skinMaterial(h.skin);
  const g = new THREE.Group(); g.name = 'hero';
  for (const geo of [geos.body, geos.head, ...geos.hands]) g.add(shadow(new THREE.Mesh(geo, skin)));
  const neon = /^#(ff2bd6|29f0ff)$/i.test(h.hairColor);
  g.add(faceDetails(prims, neon || h.hair === 'bald' ? '#2a1a12' : new THREE.Color(h.hairColor).multiplyScalar(0.8)));
  const hair = buildHair(h.hair, prims, h.hairColor, J.fem); if (hair) g.add(hair);
  g.add(buildAttire(h, J, prims));
  g.scale.setScalar(h.height / 178);
  g.userData.hero = h;
  return g;
}
