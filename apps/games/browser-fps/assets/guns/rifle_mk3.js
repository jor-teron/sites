/**
 * Browser FPS asset (gun): rifle_mk3 — M4-style carbine after the user's reference (cyan anodised furniture,
 * black lower receiver, black scope, bronze muzzle brake). ~7k triangles, 512×512 code-painted textures:
 * colour + normal (from painted height) + roughness/metalness, worn bare-aluminium edges, cheap env reflection.
 * Receiver, stock (with cutouts), pistol grip, trigger guard, magazine and front sight are extruded side
 * profiles; round parts use 12–16 sides. Same anchors as rifle_mk2 (muzzle, sight, hands) so recoil / reload /
 * ADS / muzzle flash / grenade lowering behave the same. Gun space: forward = -Z, up = +Y.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const N = 512;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function cv(draw) { const c = document.createElement('canvas'); c.width = c.height = N; draw(c.getContext('2d')); return c; }
function tx(c, srgb) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
/** height canvas (grey) -> tangent-space normal map */
function normalFrom(hc, k = 2.5) {
  const src = hc.getContext('2d').getImageData(0, 0, N, N).data;
  const out = document.createElement('canvas'); out.width = out.height = N;
  const g = out.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  const h = (x, y) => src[(((y + N) % N) * N + ((x + N) % N)) * 4] / 255;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * k, dy = (h(x, y + 1) - h(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return tx(out);
}

/** one painted set: base colour, worn-edge colour, height features → { map, normalMap, roughnessMap, metalnessMap } */
function paintSet(seed, base, wear, feat, opts = {}) {
  const r = rng(seed), scr = [];
  for (let i = 0; i < 70; i++) scr.push([r() * N, r() * N, (r() - 0.5) * 60, (r() - 0.5) * 18, 0.5 + r() * 1.3]);
  const edges = (g, col, w = 1) => { g.strokeStyle = col; g.lineWidth = 12 * w; g.strokeRect(0, 0, N, N); };
  const lines = (g, col) => { for (const [x, y, dx, dy, w] of scr) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke(); } };
  const color = cv((g) => {
    g.fillStyle = base; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 8000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * N, r() * N, 2, 2); }
    if (feat) feat(g, 'color');
    edges(g, wear); lines(g, wear);
  });
  const height = cv((g) => { g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 6000; i++) { const v = 120 + r() * 16; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * N, r() * N, 2, 2); }
    if (feat) feat(g, 'height'); lines(g, '#6a6a6a'); });
  const rough = cv((g) => { g.fillStyle = `rgb(${opts.rough ?? 130},0,0)`; g.fillStyle = `rgb(${opts.rough ?? 130},${opts.rough ?? 130},${opts.rough ?? 130})`; g.fillRect(0, 0, N, N);
    edges(g, 'rgb(70,70,70)'); lines(g, 'rgb(70,70,70)'); });
  const metal = cv((g) => { const m = opts.metal ?? 110; g.fillStyle = `rgb(${m},${m},${m})`; g.fillRect(0, 0, N, N);
    edges(g, 'rgb(225,225,225)'); lines(g, 'rgb(225,225,225)'); });
  return { map: tx(color, true), normalMap: normalFrom(height), roughnessMap: tx(rough), metalnessMap: tx(metal) };
}
const WEAR = 'rgba(205,220,225,0.7)';
// rail slots / vent holes (handguard)
const railFeat = (g, mode) => { for (let x = 8; x < N; x += 40) { g.fillStyle = mode === 'color' ? 'rgba(0,30,40,0.55)' : '#303030'; g.fillRect(x, 0, 16, N); if (mode === 'height') { g.fillStyle = '#c0c0c0'; g.fillRect(x + 18, 0, 3, N); } } };
// pistol grip / stock stipple + finger grooves
const gripFeat = (g, mode) => { const r = rng(9); for (let i = 0; i < 14000; i++) { g.fillStyle = mode === 'color' ? 'rgba(0,40,55,0.25)' : (r() < 0.5 ? '#5a5a5a' : '#a8a8a8'); g.fillRect(r() * N, r() * N, 3, 3); }
  for (let y = 40; y < N; y += 56) { g.fillStyle = mode === 'color' ? 'rgba(0,25,35,0.4)' : '#404040'; g.fillRect(0, y, N, 10); } };
// magazine ribs
const magFeat = (g, mode) => { for (let x = 30; x < N; x += 60) { g.fillStyle = mode === 'color' ? 'rgba(255,255,255,0.12)' : '#d0d0d0'; g.fillRect(x, 0, 22, N); g.fillStyle = mode === 'color' ? 'rgba(0,30,40,0.3)' : '#505050'; g.fillRect(x + 22, 0, 4, N); } };
const plain = () => {};

const ENV = (() => { const t = tx(cv((g) => {
  const grd = g.createLinearGradient(0, 0, 0, N);
  grd.addColorStop(0, '#9fd0f0'); grd.addColorStop(0.48, '#f2f8ff'); grd.addColorStop(0.55, '#6a6a5a'); grd.addColorStop(1, '#22221c');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
}), true); t.mapping = THREE.EquirectangularReflectionMapping; return t; })();

const S_CYAN = paintSet(11, '#1fb4d8', WEAR, plain, { rough: 105, metal: 150 });
const S_RAIL = paintSet(12, '#1aa8cc', WEAR, railFeat, { rough: 110, metal: 150 });
const S_GRIP = paintSet(13, '#21b6da', 'rgba(170,230,245,0.6)', gripFeat, { rough: 200, metal: 30 });
const S_MAG = paintSet(14, '#22b8dc', WEAR, magFeat, { rough: 140, metal: 100 });
const S_BLACK = paintSet(15, '#1c1e21', 'rgba(150,155,160,0.55)', plain, { rough: 120, metal: 140 });
const MARK = tx(cv((g) => {
  g.clearRect(0, 0, N, N); g.fillStyle = 'rgba(235,235,230,0.9)';
  g.font = 'bold 70px sans-serif'; g.fillText('SAFE', 30, 170); g.fillText('FIRE', 30, 270);
  g.font = '40px monospace'; g.fillText('MK3  CAL 5.56', 30, 420);
  g.fillStyle = '#29c4e8'; g.beginPath(); g.arc(400, 210, 34, 0, 7); g.fill();   // cyan selector dot
}), true);
const LENS = tx(cv((g) => {
  const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grd.addColorStop(0, '#10202e'); grd.addColorStop(0.6, '#1f4a66'); grd.addColorStop(0.85, '#4a2f6a'); grd.addColorStop(1, '#101014');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(190, 170, 70, 40, -0.6, 0, 7); g.fill();
}), true);

const mat = (s, o = {}) => new THREE.MeshStandardMaterial({ ...s, roughness: 1, metalness: 1, envMap: ENV, envMapIntensity: 0.45, ...o });
const M = {
  cyan: mat(S_CYAN), rail: mat(S_RAIL), grip: mat(S_GRIP, { envMapIntensity: 0.2 }), mag: mat(S_MAG),
  black: mat(S_BLACK), blackMatte: mat(S_BLACK, { envMapIntensity: 0.15, color: 0xbbbbbb }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x9a5a32, roughnessMap: S_BLACK.roughnessMap, normalMap: S_BLACK.normalMap, roughness: 0.75, metalness: 0.9, envMap: ENV, envMapIntensity: 0.6 }),
  mark: new THREE.MeshStandardMaterial({ map: MARK, transparent: true, depthWrite: false, roughness: 0.6, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }),
  lens: new THREE.MeshStandardMaterial({ map: LENS, metalness: 0.4, roughness: 0.05, envMap: ENV, envMapIntensity: 1.2, emissive: 0x081a2a }),
};

// ── geometry helpers ──
const BOXES = new Map();
const box = (p, w, h, d, m, x, y, z) => { const k = `${w}|${h}|${d}`; let geo = BOXES.get(k);
  if (!geo) { geo = Math.min(w, h, d) < 0.012 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, Math.min(w, h, d) >= 0.02 ? 3 : 1, Math.min(w, h, d) * 0.25); BOXES.set(k, geo); }
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
const cylZ = (p, r0, r1, len, seg, m, x, y, z, open) => {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, !!open); g.rotateX(-Math.PI / 2);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o;
};
function path(target, pts) {
  target.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const q = pts[i]; if (q.length === 4) target.quadraticCurveTo(q[0], q[1], q[2], q[3]); else target.lineTo(q[0], q[1]); }
  target.closePath(); return target;
}
/** side profile in (gun z, gun y), extruded along x and centred; optional holes; UVs scaled so 512px ≈ 0.33 m */
function sideShape(p, pts, depth, m, { holes = [], curves = 10, bevel = 0.003, x = 0 } = {}) {
  const s = path(new THREE.Shape(), pts);
  for (const h of holes) s.holes.push(path(new THREE.Path(), h));
  const g = new THREE.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: curves });
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
  g.rotateY(-Math.PI / 2); g.translate(depth / 2 - bevel + x, 0, 0);
  const o = new THREE.Mesh(g, m); p.add(o); return o;
}

export function build() {
  const group = new THREE.Group(), g = group;

  // ── Upper receiver (cyan): flat-top with ejection port bump + forward assist + charging handle ──
  sideShape(g, [[0.105, -0.004], [-0.17, -0.004], [-0.17, 0.042], [0.09, 0.042], [0.105, 0.03]], 0.054, M.cyan);
  box(g, 0.003, 0.02, 0.06, M.black, 0.0275, 0.018, -0.04);                       // ejection port cover
  const fa = cylZ(g, 0.008, 0.008, 0.024, 12, M.cyan, 0.03, 0.03, 0.045); fa.rotation.y = 0.5;   // forward assist
  box(g, 0.04, 0.01, 0.024, M.black, 0, 0.044, 0.1);                               // charging handle
  // ── Lower receiver (black) with mag well, SAFE/FIRE markings, cyan selector & mag release ──
  sideShape(g, [[0.1, -0.004], [0.1, -0.03], [0.07, -0.05], [-0.075, -0.05], [-0.085, -0.075], [-0.16, -0.075], [-0.165, -0.004]], 0.05, M.black);
  for (const sx of [-1, 1]) { const mk = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.04), M.mark); mk.position.set(sx * 0.0256, -0.026, 0.035); mk.rotation.y = sx * Math.PI / 2; g.add(mk); }
  const sel = cylZ(g, 0.006, 0.006, 0.006, 12, M.cyan, 0.027, -0.024, 0.04); sel.rotation.y = Math.PI / 2;
  box(g, 0.006, 0.01, 0.012, M.cyan, 0.027, -0.03, -0.055);                       // mag release
  // trigger guard (profile with hole) + trigger
  sideShape(g, [[0.03, -0.05], [0.03, -0.088], [-0.055, -0.088], [-0.06, -0.05]], 0.012, M.black,
    { holes: [[[0.022, -0.054], [-0.05, -0.054], [-0.048, -0.081], [0.022, -0.081]]], bevel: 0.002 });
  const trig = box(g, 0.006, 0.024, 0.005, M.black, 0, -0.064, -0.004); trig.rotation.x = 0.35;
  // ── Pistol grip (cyan stippled polymer) — same outline / anchor as mk2 ──
  sideShape(g, [[0.025, -0.045], [0.078, -0.045], [0.108, -0.15], [0.104, -0.162, 0.09, -0.163], [0.064, -0.16], [0.05, -0.1, 0.034, -0.07]], 0.03, M.grip);
  // ── Top Picatinny rail (cyan) on receiver + handguard ──
  box(g, 0.024, 0.006, 0.6, M.rail, 0, 0.045, -0.13);
  for (let z = 0.08; z > -0.42; z -= 0.024) box(g, 0.03, 0.006, 0.01, M.cyan, 0, 0.051, z);
  // ── Quad-rail handguard (octagon) + side / bottom rails with slots ──
  const hg = new THREE.CylinderGeometry(0.034, 0.034, 0.26, 8, 1); hg.rotateY(Math.PI / 8); hg.rotateX(Math.PI / 2);
  const uv = hg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i));
  const hgm = new THREE.Mesh(hg, M.rail); hgm.position.set(0, 0.012, -0.3); g.add(hgm);
  for (const [x, y, w, h] of [[0.035, 0.012, 0.008, 0.02], [-0.035, 0.012, 0.008, 0.02], [0, -0.022, 0.02, 0.008]]) {
    box(g, w, h, 0.25, M.rail, x, y, -0.3);
    for (let z = -0.19; z > -0.42; z -= 0.024) box(g, x ? w + 0.004 : w + 0.008, x ? h + 0.006 : h + 0.004, 0.01, M.cyan, x, y, z);
  }
  // front sight post (cyan, triangular base) on the rail end
  sideShape(g, [[-0.4, 0.048], [-0.44, 0.048], [-0.44, 0.085], [-0.43, 0.095], [-0.425, 0.095], [-0.425, 0.066]], 0.018, M.cyan, { bevel: 0.002 });
  // ── Barrel (black), gas block, bronze muzzle brake ──
  cylZ(g, 0.0105, 0.0095, 0.17, 12, M.black, 0, 0.012, -0.515);
  box(g, 0.022, 0.024, 0.02, M.black, 0, 0.014, -0.44);
  cylZ(g, 0.0155, 0.0155, 0.05, 14, M.bronze, 0, 0.012, -0.615);
  for (const z of [-0.6, -0.615, -0.63]) box(g, 0.033, 0.005, 0.006, M.blackMatte, 0, 0.012, z);   // brake ports
  cylZ(g, 0.0155, 0.012, 0.006, 14, M.bronze, 0, 0.012, -0.642);
  // ── Magazine (cyan, ribbed; separate group animated by reload) ──
  const mag = new THREE.Group();
  sideShape(mag, [[-0.034, 0], [0.034, 0], [0.028, -0.1, -0.008, -0.17], [-0.072, -0.162], [-0.042, -0.09, -0.034, 0]], 0.032, M.mag, { curves: 12 });
  const plate = box(mag, 0.038, 0.01, 0.068, M.cyan, 0, -0.17, -0.04); plate.rotation.x = 0.32;
  mag.position.set(0, -0.05, -0.12);
  g.add(mag);
  // ── Buffer tube (cyan) + adjustable stock with cutouts ──
  cylZ(g, 0.0145, 0.0145, 0.1, 14, M.cyan, 0, 0.008, 0.15);
  for (let i = 0; i < 4; i++) cylZ(g, 0.0158, 0.0158, 0.004, 14, M.black, 0, 0.008, 0.13 + i * 0.012);   // adjustment notches
  { const S = 0.5, Z0 = 0.14, sc = (pts) => pts.map(([z, y]) => [Z0 + (z - 0.15) * S, y * 0.85]);
    sideShape(g, sc([[0.15, 0.03], [0.3, 0.032], [0.31, 0.02], [0.315, -0.085], [0.298, -0.09], [0.27, -0.075], [0.16, -0.012], [0.15, -0.006]]), 0.04, M.cyan,
      { holes: [sc([[0.2, -0.014], [0.27, -0.06], [0.285, -0.06], [0.285, -0.016]]), sc([[0.215, 0.018], [0.285, 0.02], [0.285, -0.004], [0.23, -0.004]])] }); }
  // ── Scope (black): mounts, tube, bells, eyepiece, turrets, lenses ──
  for (const z of [-0.12, 0.0]) {
    box(g, 0.034, 0.012, 0.022, M.black, 0, 0.06, z);
    box(g, 0.014, 0.03, 0.016, M.black, 0, 0.08, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0045, 6, 14), M.black); ring.position.set(0, 0.11, z); g.add(ring);
  }
  cylZ(g, 0.018, 0.018, 0.2, 16, M.black, 0, 0.11, -0.055);
  cylZ(g, 0.019, 0.027, 0.05, 16, M.black, 0, 0.11, -0.175);
  cylZ(g, 0.027, 0.027, 0.014, 16, M.blackMatte, 0, 0.11, -0.207);
  cylZ(g, 0.024, 0.019, 0.04, 16, M.black, 0, 0.11, 0.06);
  cylZ(g, 0.024, 0.024, 0.035, 16, M.blackMatte, 0, 0.11, 0.095);
  const tTop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 12), M.blackMatte); tTop.position.set(0, 0.138, -0.06); g.add(tTop);
  for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.018, 12), M.blackMatte); t.rotation.z = Math.PI / 2; t.position.set(sx * 0.027, 0.11, -0.06); g.add(t); }
  box(g, 0.03, 0.014, 0.032, M.black, 0, 0.122, -0.06);
  const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.023, 16), M.lens); lensF.position.set(0, 0.11, -0.2145); lensF.rotation.y = Math.PI; g.add(lensF);
  const lensR = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), M.lens); lensR.position.set(0, 0.11, 0.113); g.add(lensR);

  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return {
    group, mag,
    muzzle: new THREE.Vector3(0, 0.012, -0.645),
    sight: new THREE.Vector3(0, 0.11, 0.113),
    // left hand wraps the handguard bottom (no vertical foregrip on this carbine)
    hands: { right: new THREE.Vector3(0.012, -0.095, 0.065), left: new THREE.Vector3(0, -0.03, -0.33) },
  };
}

export default { kind: 'gun', name: 'rifle_mk3', build };
