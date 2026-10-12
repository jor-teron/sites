/**
 * Browser FPS asset (gun): rifle_hq — detailed low-poly carbine with a 4x scope.
 * Upper/lower receiver, picatinny rail, octagonal handguard with side rails + vents, vertical foregrip,
 * muzzle brake with ports, curved magazine, angled pistol grip, trigger guard, buffer tube + stock.
 * MeshStandard metal / matte polymer with procedural wear + roughness maps (assets/wear.js).
 * ~1.5k tris, shared materials. Gun space: forward = -Z, up = +Y (see assets/README.md).
 */
import * as THREE from 'three';
import { wearTexture } from '../wear.js';

const wearC = wearTexture('gun-color', { base: 225, noise: 26, scratches: 16, spots: 5, edge: 0.25, color: true });
const wearR = wearTexture('gun-rough', { base: 150, noise: 60, scratches: 12, spots: 8 });
const M = {
  metal: new THREE.MeshStandardMaterial({ color: 0x50555c, metalness: 0.3, roughness: 0.55, map: wearC, roughnessMap: wearR }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2e3135, metalness: 0.35, roughness: 0.4, roughnessMap: wearR }),
  poly: new THREE.MeshStandardMaterial({ color: 0x484c3e, metalness: 0.0, roughness: 0.88, map: wearC }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.15, roughness: 0.7 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x2b6ea0, metalness: 0.3, roughness: 0.08, emissive: 0x0b2236 }),
};

const box = (p, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); p.add(m); return m; };
/** cylinder along Z (gun axis) */
const cylZ = (p, r0, r1, len, seg, mat, x, y, z) => {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateX(-Math.PI / 2);   // r0 at +z (rear), r1 at -z (front)
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); p.add(m); return m;
};
/** shape drawn in the (gun z, gun y) plane, extruded along gun x, centred on x = 0 */
function sideShape(p, pts, depth, mat, curves) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    if (q.length === 4) s.quadraticCurveTo(q[0], q[1], q[2], q[3]); else s.lineTo(q[0], q[1]);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: curves || 5 });
  g.rotateY(-Math.PI / 2);          // shape x -> gun z, extrusion -> gun -x
  g.translate(depth / 2, 0, 0);
  const m = new THREE.Mesh(g, mat); p.add(m); return m;
}

export function build() {
  const group = new THREE.Group();
  const g = group;

  // ── Receiver ──
  box(g, 0.056, 0.05, 0.3, M.metal, 0, 0.018, -0.06);                // upper
  box(g, 0.05, 0.045, 0.2, M.metal, 0, -0.028, -0.02);                // lower
  box(g, 0.054, 0.04, 0.075, M.metal, 0, -0.06, -0.12);               // mag well
  box(g, 0.003, 0.022, 0.06, M.dark, 0.0295, 0.016, -0.04);           // ejection port cover
  const fa = cylZ(g, 0.008, 0.008, 0.02, 8, M.steel, 0.031, 0.03, 0.04); fa.rotation.y = 0.5;   // forward assist
  box(g, 0.042, 0.012, 0.022, M.steel, 0, 0.045, 0.1);                // charging handle
  box(g, 0.012, 0.012, 0.03, M.steel, -0.03, -0.02, 0.0);             // bolt release / selector
  // ── Picatinny rail ──
  box(g, 0.026, 0.008, 0.42, M.metal, 0, 0.047, -0.13);
  for (let z = 0.07; z > -0.34; z -= 0.022) box(g, 0.032, 0.007, 0.009, M.metal, 0, 0.054, z);
  // ── Handguard (octagonal, flat top) with side rails + vents ──
  const hg = new THREE.CylinderGeometry(0.036, 0.036, 0.24, 8); hg.rotateY(Math.PI / 8); hg.rotateX(Math.PI / 2);
  const hgm = new THREE.Mesh(hg, M.poly); hgm.position.set(0, 0.012, -0.32); g.add(hgm);
  for (const sx of [-1, 1]) {
    box(g, 0.006, 0.012, 0.12, M.metal, sx * 0.036, 0.012, -0.36);
    for (let i = 0; i < 3; i++) box(g, 0.004, 0.006, 0.03, M.dark, sx * 0.034, 0.034, -0.24 - i * 0.045);
  }
  // ── Barrel, gas block, muzzle brake ──
  cylZ(g, 0.011, 0.01, 0.15, 10, M.steel, 0, 0.018, -0.505);
  box(g, 0.024, 0.026, 0.02, M.steel, 0, 0.02, -0.455);
  cylZ(g, 0.017, 0.017, 0.06, 10, M.steel, 0, 0.018, -0.605);
  for (const z of [-0.59, -0.61]) box(g, 0.037, 0.007, 0.009, M.dark, 0, 0.018, z);   // side ports
  cylZ(g, 0.017, 0.013, 0.008, 10, M.steel, 0, 0.018, -0.639);
  // ── Vertical foregrip ──
  box(g, 0.026, 0.012, 0.04, M.metal, 0, -0.026, -0.36);
  const fg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.016, 0.085, 10), M.poly); fg.position.set(0, -0.072, -0.36); g.add(fg);
  const fgc = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 10), M.metal); fgc.position.set(0, -0.117, -0.36); g.add(fgc);
  // ── Pistol grip, trigger guard, trigger ──
  sideShape(g, [[0.025, -0.045], [0.078, -0.045], [0.108, -0.15], [0.104, -0.162, 0.09, -0.163], [0.064, -0.16], [0.05, -0.1, 0.034, -0.07]], 0.03, M.poly);
  box(g, 0.008, 0.005, 0.07, M.metal, 0, -0.082, -0.005);
  box(g, 0.008, 0.032, 0.006, M.metal, 0, -0.066, -0.04);
  const trig = box(g, 0.006, 0.026, 0.006, M.steel, 0, -0.063, -0.002); trig.rotation.x = 0.35;
  // ── Curved magazine (separate group: animated by reload) ──
  const mag = new THREE.Group();
  sideShape(mag, [[-0.032, 0], [0.032, 0], [0.026, -0.1, -0.012, -0.172], [-0.074, -0.164], [-0.04, -0.09, -0.032, 0]], 0.032, M.dark, 6);
  const plate = box(mag, 0.04, 0.01, 0.068, M.metal, 0, -0.172, -0.042); plate.rotation.x = 0.32;
  mag.position.set(0, -0.05, -0.12);
  g.add(mag);
  // ── Buffer tube + stock ──
  cylZ(g, 0.014, 0.014, 0.08, 10, M.metal, 0, 0.004, 0.14);
  sideShape(g, [[0.12, 0.02], [0.2, 0.026], [0.205, -0.05], [0.178, -0.054], [0.12, -0.016]], 0.036, M.poly);   // short stock (stays out of the view)
  box(g, 0.04, 0.078, 0.01, M.dark, 0, -0.012, 0.208);              // butt pad
  // ── 4x scope: rings on the rail, tube, bells, eyepiece, turrets, lenses ──
  for (const z of [-0.12, 0.0]) {
    box(g, 0.032, 0.012, 0.022, M.metal, 0, 0.064, z);
    box(g, 0.016, 0.03, 0.018, M.metal, 0, 0.082, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0045, 6, 14), M.metal); ring.position.set(0, 0.11, z); g.add(ring);
  }
  cylZ(g, 0.018, 0.018, 0.2, 16, M.steel, 0, 0.11, -0.055);
  cylZ(g, 0.019, 0.027, 0.05, 16, M.steel, 0, 0.11, -0.175);
  cylZ(g, 0.027, 0.027, 0.012, 16, M.dark, 0, 0.11, -0.206);
  cylZ(g, 0.024, 0.019, 0.04, 16, M.steel, 0, 0.11, 0.06);
  cylZ(g, 0.024, 0.024, 0.035, 16, M.dark, 0, 0.11, 0.095);           // rubber eyepiece
  const tTop = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10), M.steel); tTop.position.set(0, 0.136, -0.06); g.add(tTop);
  const tSide = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10), M.steel); tSide.rotation.z = Math.PI / 2; tSide.position.set(0.026, 0.11, -0.06); g.add(tSide);
  box(g, 0.026, 0.012, 0.03, M.steel, 0, 0.122, -0.06);               // turret saddle
  const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.023, 16), M.lens); lensF.position.set(0, 0.11, -0.2125); lensF.rotation.y = Math.PI; g.add(lensF);
  const lensR = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), M.lens); lensR.position.set(0, 0.11, 0.113); g.add(lensR);

  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return {
    group, mag,
    muzzle: new THREE.Vector3(0, 0.018, -0.645),
    sight: new THREE.Vector3(0, 0.11, 0.113),
    hands: { right: new THREE.Vector3(0.012, -0.095, 0.065), left: new THREE.Vector3(0, -0.07, -0.36) },
  };
}

export default { kind: 'gun', name: 'rifle_hq', build };
