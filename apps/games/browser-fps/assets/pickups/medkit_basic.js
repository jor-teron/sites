/**
 * Browser FPS asset (pickup): medkit_basic — white case with red crosses and a soft floor glow.
 * Asset interface: default export { kind: 'medkit', name, build() -> { root, kit, glow } }
 *   root: placed at the floor spot (y = 0);  kit: bobbed/spun by the pickup logic;  glow: optional, opacity pulsed.
 */
import * as THREE from 'three';

const G = {
  body: new THREE.BoxGeometry(0.5, 0.32, 0.34),
  handle: new THREE.BoxGeometry(0.18, 0.05, 0.05),
  crossA: new THREE.BoxGeometry(0.2, 0.06, 0.012),
  crossB: new THREE.BoxGeometry(0.06, 0.2, 0.012),
  glow: new THREE.CircleGeometry(0.6, 20),
};
const M = {
  body: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5, emissive: 0x222222 }),
  handle: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6 }),
  cross: new THREE.MeshStandardMaterial({ color: 0xd81e1e, roughness: 0.5, emissive: 0x400000 }),
};

function makeGlowMaterial() {
  // soft radial glow drawn once into a small canvas
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(120,255,140,0.9)');
  grd.addColorStop(1, 'rgba(120,255,140,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}
const GLOW_MAT = makeGlowMaterial();

export function build() {
  const root = new THREE.Group();
  const kit = new THREE.Group();
  root.add(kit);
  const body = new THREE.Mesh(G.body, M.body);
  body.castShadow = true;
  kit.add(body);
  const handle = new THREE.Mesh(G.handle, M.handle);
  handle.position.y = 0.185;
  kit.add(handle);
  // red cross on front, back and top
  for (const [z, ry, y, rx] of [[0.171, 0, 0, 0], [-0.171, Math.PI, 0, 0], [0, 0, 0.161, -Math.PI / 2]]) {
    const a = new THREE.Mesh(G.crossA, M.cross), b = new THREE.Mesh(G.crossB, M.cross);
    for (const m of [a, b]) { m.position.set(0, y, z); m.rotation.set(rx, ry, 0); kit.add(m); }
  }
  const glow = new THREE.Mesh(G.glow, GLOW_MAT);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  root.add(glow);
  return { root, kit, glow };
}

export default { kind: 'medkit', name: 'medkit_basic', build };
