// Neon Fist 3D — clothing built in code: each garment is the body's own shape grown by a pad and
// clipped to where the cloth sits, so it fits every gender, build and pose.
import * as THREE from 'three';
import { V, E, mat, HEAD_Y, meshSDF, primBox, shadow, surfaceZ, evalSD } from './parts.js';

export const ATTIRE = {
  footwear: ['barefoot', 'sneakers', 'boots', 'sandals'],
  top: ['none', 'tank', 'tshirt', 'hoodie', 'jacket'],
  bottom: ['shorts', 'pants', 'joggers', 'skirt'],
  headwear: ['none', 'cap', 'beanie', 'helmet', 'headband'],
};
const C = { top: '#2a1f55', tank: '#1f2a4a', hoodie: '#3a1040', jacket: '#16161f', bra: '#1b1b28', shorts: '#202040', pants: '#1c2233', jog: '#2b2b33', skirt: '#4a1450',
  shoe: '#18181c', sole: '#e8e8f0', boot: '#2a1a12', sandal: '#5a3a22', cap: '#14141c', beanie: '#3a3a48', helmet: '#22222c', neonA: '#ff2bd6', neonB: '#29f0ff' };
const cloth = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color(c).lerp(new THREE.Color('#fff'), 0.3), sheenRoughness: 0.8, ...o });
const glow = c => mat(c, { emissive: c, emissiveIntensity: 1.2 });

const TORSO = ['chest', 'back', 'pec', 'bust', 'abd', 'belly', 'trap', 'pelvis', 'glute'];
const LEGS = ['pelvis', 'glute', 'belly', 'th', 'knee', 'ca'];
const CACHE = new Map();

// keep = clip(x,y,z) <= 0. Limb cut: past fraction t along a limb (within its tube) is removed.
function limbCut(segs, t, rad = 0.11) {
  return (x, y, z) => { let s = -1;
    for (const [a, b] of segs) { const d = b.clone().sub(a), L = d.length(); d.divideScalar(L);
      const dx = x - a.x, dy = y - a.y, dz = z - a.z, u = dx * d.x + dy * d.y + dz * d.z;
      if (u > -0.02 && u < L + 0.15 && Math.hypot(dx - d.x * u, dy - d.y * u, dz - d.z * u) < rad) s = Math.max(s, u - L * t); }
    return s; };
}
const band = (lo, hi) => (x, y) => Math.max(lo - y, y - hi);
const sphereHole = (c, r) => (x, y, z) => r - Math.hypot(x - c.x, y - c.y, z - c.z);
const all = (...fs) => (x, y, z) => Math.max(...fs.map(f => f(x, y, z)));

function piece(key, prims, tags, pad, clip, { res = 0.0075, kMul = 1.4, extra = [] } = {}) {
  if (!CACHE.has(key)) {
    const ps = prims.filter(p => p.op === 'add' && tags.includes(p.tag)).concat(extra);
    const g = meshSDF(ps, primBox(ps, pad, 0.03 + 0.03 * kMul), res, { pad, kMul, clip }); g.userData.cached = true; CACHE.set(key, g);
  }
  return CACHE.get(key);
}

export function buildAttire(h, J, prims) {
  const g = new THREE.Group(), K = `${h.gender}|${h.build}|`, add = (geo, m) => g.add(shadow(new THREE.Mesh(geo, m)));
  const uaSegs = J.arms.map(a => [a.sh, a.el]), faSegs = J.arms.map(a => [a.el, a.wr]);
  const thSegs = J.legs.map(l => [l.hp, l.kn]), kneeSegs = J.legs.map(l => [l.kn, l.an]);
  const shY = 1.5, hem = J.waistY - 0.1, neck = sphereHole(V(0, 1.53, 0.012), J.fem ? 0.066 : 0.074);

  // ---- top ----
  const sleeves = { tshirt: [uaSegs, 0.5], hoodie: [faSegs, 0.93], jacket: [faSegs, 0.96] }[h.top];
  if (h.top === 'none' && J.fem) {
    add(piece(K + 'bra', prims, ['chest', 'back', 'bust'], 0.004, band(1.2, 1.4), { kMul: 1.8 }), cloth(C.bra));
    add(piece(K + 'braband', prims, ['chest', 'back', 'bust'], 0.007, band(1.2, 1.212), { kMul: 1.8 }), glow(C.neonA));
  } else if (h.top === 'tank') {
    const arm = (x, y) => Math.abs(x) - (J.shW * 0.62 + Math.max(0, 1.27 - y) * 3);
    add(piece(K + 'tank', prims, TORSO, 0.006, all(band(hem, shY), arm, sphereHole(V(0, 1.47, 0.06), 0.085), sphereHole(V(0, 1.5, -0.08), 0.06)), { kMul: 1.6 }), cloth(C.tank));
  } else if (sleeves) {
    const pad = { tshirt: 0.007, hoodie: 0.011, jacket: 0.012 }[h.top], tags = [...TORSO, 'delt', 'ua', ...(h.top === 'tshirt' ? [] : ['fa'])];
    const extra = h.top === 'hoodie' ? [E(V(0, 1.47, -0.1), [0.1, 0.06, 0.05], { k: 0.04, tag: 'hood' })] : [];
    const cut = limbCut(...sleeves);
    add(piece(K + h.top, prims, tags, pad, all(band(hem - (h.top === 'jacket' ? 0.02 : 0), 1.62), neck, cut), { extra }), cloth(C[h.top === 'tshirt' ? 'top' : h.top]));
    // cuffs / hem bands in neon
    const trim = h.top === 'jacket' ? C.neonB : C.neonA;
    add(piece(K + h.top + 'hem', prims, TORSO, pad + 0.003, band(hem, hem + 0.012)), glow(trim));
    if (h.top !== 'tshirt') add(piece(K + h.top + 'cuff', prims, ['fa'], pad + 0.003, all(limbCut(faSegs, sleeves[1]), (x, y, z) => -limbCut(faSegs, sleeves[1] - 0.07)(x, y, z)), { res: 0.005 }), glow(trim));
    if (h.top === 'hoodie') { // kangaroo pocket on the belly
      const z = surfaceZ(prims, 0, J.waistY + 0.02, pad);
      const pk = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 12), cloth(C.hoodie)); pk.rotation.z = Math.PI / 2; pk.scale.set(1, 1, 0.35);
      pk.position.set(0, J.waistY + 0.02, z - 0.004); g.add(shadow(pk));
    }
    if (h.top === 'jacket') { // zip line + collar
      const pts = []; for (let y = hem + 0.01; y <= 1.47; y += 0.02) pts.push(V(0, y, surfaceZ(prims.filter(p => TORSO.includes(p.tag)), 0, y, pad + 0.004)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0035, 6), glow(C.neonB)));
      add(piece(K + 'collar', prims, ['neck', 'trap'], 0.009, all(band(1.46, 1.525), (x, y, z) => z - 0.035), { kMul: 1.2 }), cloth(C.jacket));
    }
  }

  // ---- bottom ----
  const top = J.waistY + 0.01;
  if (h.bottom === 'skirt') {
    // flared skirt: follow the real hip outline from the waist down, then flare to the hem
    const tp = prims.filter(p => ['pelvis', 'glute', 'abd', 'belly', 'th'].includes(p.tag) && p.op === 'add'), pts = [];
    const scan = (y, dx, dz) => { let t = 0.35; for (let i = 0; i < 60; i++) { const d = evalSD(tp, t * dx, y, t * dz); if (d < 0.0005) break; t -= Math.max(0.0008, d * 0.8); } return t; };
    const rX = y => Math.max(scan(y, 1, 0), scan(y, -1, 0));
    let r = 0; const hemY = 0.6;
    for (let i = 0; i <= 16; i++) { const y = top - (top - hemY) * i / 16; r = Math.max(r, y > 0.82 ? rX(y) + 0.014 : r); pts.push(new THREE.Vector2(r + Math.max(0, 0.86 - y) * 0.32, y)); }
    const zr = (Math.max(scan(0.9, 0, 1), scan(0.9, 0, -1)) + 0.014) / (rX(0.9) + 0.012);
    const sk = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 56), cloth(C.skirt, { side: THREE.DoubleSide }));
    sk.scale.z = Math.min(1, Math.max(0.6, zr)); g.add(shadow(sk));
    add(piece(K + 'skirtBand', prims, ['pelvis', 'abd', 'belly'], 0.011, band(top - 0.014, top), { kMul: 1.6 }), glow(C.neonB));
  } else {
    const cfg = { shorts: [0.007, limbCut(thSegs, 0.62), C.shorts], pants: [0.007, (x, y) => 0.1 - y, C.pants], joggers: [0.011, (x, y) => 0.11 - y, C.jog] }[h.bottom];
    add(piece(K + h.bottom, prims, h.bottom === 'shorts' ? ['pelvis', 'glute', 'belly', 'th'] : LEGS, cfg[0], all((x, y) => y - top, cfg[1]), { kMul: 1.0 }), cloth(cfg[2]));
    add(piece(K + h.bottom + 'band', prims, ['pelvis', 'abd', 'belly', 'glute'], cfg[0] + 0.004, band(top - 0.016, top), { kMul: 1.3 }), glow(C.neonA));
    if (h.bottom === 'joggers') add(piece(K + 'cuffs', prims, ['ca'], 0.014, band(0.1, 0.13)), glow(C.neonB));
  }

  // ---- footwear ----
  const feet = ['foot', 'ca'], floor = (x, y) => -y;
  if (h.footwear === 'sneakers') {
    add(piece(K + 'snk', prims, feet, 0.008, all(floor, (x, y) => y - 0.105), { res: 0.0045 }), cloth(C.shoe, { roughness: 0.6 }));
    add(piece(K + 'snkSole', prims, ['foot'], 0.013, all(floor, (x, y) => y - 0.024), { res: 0.0045 }), cloth(C.sole, { roughness: 0.5 }));
    add(piece(K + 'snkLine', prims, ['foot'], 0.0105, band(0.03, 0.036), { res: 0.004 }), glow(C.neonB));
  } else if (h.footwear === 'boots') {
    add(piece(K + 'boot', prims, feet, 0.011, all(floor, (x, y) => y - 0.25), { res: 0.0045 }), cloth(C.boot, { roughness: 0.45, clearcoat: 0.4 }));
    add(piece(K + 'bootSole', prims, ['foot'], 0.015, all(floor, (x, y) => y - 0.022), { res: 0.0045 }), cloth('#0b0b0d'));
    add(piece(K + 'bootTop', prims, ['ca'], 0.014, band(0.235, 0.25), { res: 0.004 }), glow(C.neonA));
  } else if (h.footwear === 'sandals') {
    const fwd = J.legs.map(l => [l.an, V(Math.sin(l.toe), 0, Math.cos(l.toe))]);
    const along = (lo, hi) => (x, y, z) => { let v = 9; for (const [a, d] of fwd) { if (Math.abs(x - a.x) > 0.09) continue; const u = (x - a.x) * d.x + (z - a.z) * d.z; v = Math.min(v, Math.max(lo - u, u - hi)); } return v; };
    add(piece(K + 'sole', prims, ['foot'], 0.008, all(floor, (x, y) => y - 0.012), { res: 0.004 }), cloth(C.sandal));
    add(piece(K + 'strapA', prims, ['foot'], 0.004, all(floor, along(0.08, 0.1)), { res: 0.0035 }), cloth(C.sandal));
    add(piece(K + 'strapB', prims, ['foot', 'ca'], 0.004, band(0.07, 0.085), { res: 0.0035 }), glow(C.neonA));
  }

  // ---- headwear (sits over any hair) ----
  const head = ['head'];
  if (h.headwear === 'cap') {
    add(piece(K + 'cap', prims, head, 0.02, (x, y, z) => HEAD_Y + 0.035 - z * 0.25 - y, { res: 0.004, kMul: 1 }), cloth(C.cap));
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.006, 24, 1, false, -Math.PI / 2, Math.PI), cloth(C.cap));
    v.position.set(0, HEAD_Y + 0.035, 0.045); v.rotation.x = 0.12; v.scale.z = 1.1; g.add(v);
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.002, 6, 40, Math.PI), glow(C.neonB)); e.rotation.set(Math.PI / 2 + 0.12, 0, 0); e.position.copy(v.position); e.scale.y = 1.1; g.add(e);
  } else if (h.headwear === 'beanie') {
    add(piece(K + 'beanie', prims, head, 0.024, (x, y, z) => HEAD_Y + 0.035 - Math.max(0, -z) * 0.4 - y, { res: 0.004, kMul: 1 }), cloth(C.beanie, { roughness: 1 }));
    add(piece(K + 'beanieBand', prims, head, 0.028, (x, y, z) => Math.max(HEAD_Y + 0.035 - Math.max(0, -z) * 0.4 - y, y - (HEAD_Y + 0.062 - Math.max(0, -z) * 0.4)), { res: 0.004, kMul: 1 }), cloth(C.beanie, { roughness: 1, color: '#2c2c38' }));
  } else if (h.headwear === 'helmet') {
    const open = (x, y, z) => -Math.max(0.0 - z, y - (HEAD_Y + 0.045), Math.abs(x) - 0.068, HEAD_Y - 0.13 - y);
    add(piece(K + 'helmet', prims, head, 0.034, all(open, (x, y) => HEAD_Y - 0.1 - y), { res: 0.005, kMul: 1.2 }), cloth(C.helmet, { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }));
    add(piece(K + 'helmetLine', prims, head, 0.037, all(open, band(HEAD_Y + 0.045, HEAD_Y + 0.055)), { res: 0.004, kMul: 1.2 }), glow(C.neonA));
  } else if (h.headwear === 'headband') {
    add(piece(K + 'hb', prims, head, 0.014, band(HEAD_Y + 0.04, HEAD_Y + 0.062), { res: 0.0035, kMul: 1 }), glow(C.neonB));
  }
  return g;
}
