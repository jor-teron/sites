/**
 * Browser FPS asset (gun): rifle_mk2 — rifle_hq's carbine with 512×512 code-painted textures and bevelled edges.
 * Textures (generated once, shared): worn anodised metal (scratches, edge wear, small markings) with matching
 * roughness + metalness maps, stippled polymer for the grip / foregrip / stock, rail texture, scope with a
 * reflective (env-mapped) coated lens. Boxes are RoundedBoxGeometry (bevelled), round parts get more segments.
 * Same anchors as rifle_hq (muzzle, sight, hands) so recoil / reload (mag group) / scope / flash all behave the same.
 * Gun space: forward = -Z, up = +Y (see assets/README.md).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const N = 512;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function cv(draw) { const c = document.createElement('canvas'); c.width = c.height = N; draw(c.getContext('2d')); return c; }
function tx(c, srgb) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

/** worn metal: colour (dark grey + lighter worn edges / scratches + markings), roughness, metalness */
function metalSet() {
  const r = rng(71), scratches = [];
  for (let i = 0; i < 90; i++) scratches.push([r() * N, r() * N, (r() - 0.5) * 70, (r() - 0.5) * 22, 0.5 + r() * 1.5]);
  const edges = (g, col) => { g.strokeStyle = col; g.lineWidth = 14; g.strokeRect(0, 0, N, N); g.lineWidth = 5; g.strokeRect(10, 10, N - 20, N - 20); };
  const color = cv((g) => {
    g.fillStyle = '#7d828a'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) { const v = 110 + r() * 40; g.fillStyle = `rgba(${v},${v + 3},${v + 8},0.35)`; g.fillRect(r() * N, r() * N, 2, 2); }
    edges(g, 'rgba(200,205,210,0.55)');                                   // worn edges (bare aluminium)
    for (const [x, y, dx, dy, w] of scratches) { g.strokeStyle = 'rgba(210,215,220,0.6)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke(); }
  });
  const rough = cv((g) => {
    g.fillStyle = 'rgb(140,140,140)'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) { const v = 110 + r() * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * N, r() * N, 2, 2); }
    edges(g, 'rgb(80,80,80)');
    for (const [x, y, dx, dy, w] of scratches) { g.strokeStyle = 'rgb(70,70,70)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke(); }
  });
  const metal = cv((g) => {   // blue channel = metalness: coating ~0.35, bare edges / scratches ~0.85
    g.fillStyle = 'rgb(90,90,90)'; g.fillRect(0, 0, N, N);
    edges(g, 'rgb(215,215,215)');
    for (const [x, y, dx, dy, w] of scratches) { g.strokeStyle = 'rgb(220,220,220)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke(); }
  });
  return { color: tx(color, true), rough: tx(rough), metal: tx(metal) };
}
/** stippled polymer (grip texture) + roughness */
function polySet() {
  const r = rng(73);
  const color = cv((g) => {
    g.fillStyle = '#4a4e40'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 26000; i++) { const v = r() < 0.5 ? 'rgba(20,22,16,0.45)' : 'rgba(120,124,104,0.35)'; g.fillStyle = v; const s = 1 + r() * 2; g.fillRect(r() * N, r() * N, s, s); }
    g.strokeStyle = 'rgba(25,26,20,0.8)'; g.lineWidth = 6; g.strokeRect(20, 20, N - 40, N - 40);   // panel border
    g.strokeStyle = 'rgba(140,140,120,0.35)'; g.lineWidth = 3; g.strokeRect(3, 3, N - 6, N - 6);    // worn edge
  });
  const rough = cv((g) => { g.fillStyle = 'rgb(225,225,225)'; g.fillRect(0, 0, N, N); for (let i = 0; i < 20000; i++) { const v = 180 + r() * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * N, r() * N, 2, 2); } });
  return { color: tx(color, true), rough: tx(rough) };
}
/** rail: alternating slots with numbered marks */
function railTex() {
  return tx(cv((g) => {
    g.fillStyle = '#3c4046'; g.fillRect(0, 0, N, N);
    for (let x = 0; x < N; x += 32) { g.fillStyle = '#1b1d20'; g.fillRect(x, 0, 12, N); g.fillStyle = 'rgba(190,195,200,0.5)'; g.fillRect(x + 12, 0, 2, N); }
    g.fillStyle = 'rgba(230,230,220,0.7)'; g.font = '14px monospace';
    for (let i = 0, x = 16; x < N; x += 64, i += 2) g.fillText(String(i), x, 30);
  }), true);
}
/** scope reflection env (sky / ground gradient) */
function envTex() {
  const t = tx(cv((g) => {
    const grd = g.createLinearGradient(0, 0, 0, N);
    grd.addColorStop(0, '#9fd0f0'); grd.addColorStop(0.5, '#e8f4ff'); grd.addColorStop(0.55, '#6a6a5a'); grd.addColorStop(1, '#2a2a22');
    g.fillStyle = grd; g.fillRect(0, 0, N, N);
  }), true);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
const MARK = tx(cv((g) => {   // small engraved markings (decal on the lower receiver sides)
  g.clearRect(0, 0, N, N); g.fillStyle = 'rgba(230,230,220,0.85)';
  g.font = 'bold 64px monospace'; g.fillText('MK2  5.56', 30, 200);
  g.font = '44px monospace'; g.fillText('SAFE  SEMI  AUTO', 20, 300); g.fillText('SN 0427-TR', 60, 390);
}), true);
const MT = metalSet(), PT = polySet(), RAIL = railTex(), ENV = envTex();
const lensTex = tx(cv((g) => {   // coated lens: violet / green tint rings + highlight
  const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grd.addColorStop(0, '#1a3a5a'); grd.addColorStop(0.6, '#2a5a7a'); grd.addColorStop(0.85, '#5a3a7a'); grd.addColorStop(1, '#1a1a22');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(190, 170, 70, 40, -0.6, 0, 7); g.fill();
}), true);
const M = {
  metal: new THREE.MeshStandardMaterial({ color: 0x6c7076, map: MT.color, roughnessMap: MT.rough, metalnessMap: MT.metal, roughness: 1, metalness: 1, envMap: ENV, envMapIntensity: 0.35 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x4a4e54, map: MT.color, roughnessMap: MT.rough, metalnessMap: MT.metal, roughness: 0.8, metalness: 1, envMap: ENV, envMapIntensity: 0.4 }),
  poly: new THREE.MeshStandardMaterial({ map: PT.color, roughnessMap: PT.rough, roughness: 1, metalness: 0 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.2, roughness: 0.6, roughnessMap: MT.rough }),
  rail: new THREE.MeshStandardMaterial({ map: RAIL, roughnessMap: MT.rough, roughness: 0.9, metalness: 0.6, envMap: ENV, envMapIntensity: 0.3 }),
  mark: new THREE.MeshStandardMaterial({ map: MARK, transparent: true, depthWrite: false, roughness: 0.6, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }),
  lens: new THREE.MeshStandardMaterial({ map: lensTex, metalness: 0.4, roughness: 0.05, envMap: ENV, envMapIntensity: 1.2, emissive: 0x081a2a }),
};

/** bevelled box (RoundedBoxGeometry; radius scales with the smallest side). Cached per size. */
const BOXES = new Map();
const box = (p, w, h, d, mat, x, y, z) => {
  const key = `${w}|${h}|${d}`;
  let geo = BOXES.get(key);
  if (!geo) { geo = (Math.min(w, h, d) < 0.01 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * 0.3)); BOXES.set(key, geo); }
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m;
};
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
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2, curveSegments: curves || 5 });
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
  for (const sx of [-1, 1]) { const mk = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.03), M.mark); mk.position.set(sx * 0.0255, -0.03, -0.03); mk.rotation.y = sx * Math.PI / 2; g.add(mk); }
  box(g, 0.054, 0.04, 0.075, M.metal, 0, -0.06, -0.12);               // mag well
  box(g, 0.003, 0.022, 0.06, M.dark, 0.0295, 0.016, -0.04);           // ejection port cover
  const fa = cylZ(g, 0.008, 0.008, 0.02, 8, M.steel, 0.031, 0.03, 0.04); fa.rotation.y = 0.5;   // forward assist
  box(g, 0.042, 0.012, 0.022, M.steel, 0, 0.045, 0.1);                // charging handle
  box(g, 0.012, 0.012, 0.03, M.steel, -0.03, -0.02, 0.0);             // bolt release / selector
  // ── Picatinny rail ──
  box(g, 0.026, 0.008, 0.42, M.rail, 0, 0.047, -0.13);
  for (let z = 0.07; z > -0.34; z -= 0.022) box(g, 0.032, 0.007, 0.009, M.rail, 0, 0.054, z);
  // ── Handguard (octagonal, flat top) with side rails + vents ──
  const hg = new THREE.CylinderGeometry(0.036, 0.036, 0.24, 8, 1); hg.rotateY(Math.PI / 8); hg.rotateX(Math.PI / 2);
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
  cylZ(g, 0.018, 0.018, 0.2, 20, M.steel, 0, 0.11, -0.055);
  cylZ(g, 0.019, 0.027, 0.05, 16, M.steel, 0, 0.11, -0.175);
  cylZ(g, 0.027, 0.027, 0.012, 16, M.dark, 0, 0.11, -0.206);
  cylZ(g, 0.024, 0.019, 0.04, 16, M.steel, 0, 0.11, 0.06);
  cylZ(g, 0.024, 0.024, 0.035, 16, M.dark, 0, 0.11, 0.095);           // rubber eyepiece
  const tTop = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10), M.steel); tTop.position.set(0, 0.136, -0.06); g.add(tTop);
  const tSide = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10), M.steel); tSide.rotation.z = Math.PI / 2; tSide.position.set(0.026, 0.11, -0.06); g.add(tSide);
  box(g, 0.026, 0.012, 0.03, M.steel, 0, 0.122, -0.06);               // turret saddle
  const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.023, 24), M.lens); lensF.position.set(0, 0.11, -0.2125); lensF.rotation.y = Math.PI; g.add(lensF);
  const lensR = new THREE.Mesh(new THREE.CircleGeometry(0.02, 24), M.lens); lensR.position.set(0, 0.11, 0.113); g.add(lensR);

  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return {
    group, mag,
    muzzle: new THREE.Vector3(0, 0.018, -0.645),
    sight: new THREE.Vector3(0, 0.11, 0.113),
    hands: { right: new THREE.Vector3(0.012, -0.095, 0.065), left: new THREE.Vector3(0, -0.07, -0.36) },
  };
}

export default { kind: 'gun', name: 'rifle_mk2', build };
