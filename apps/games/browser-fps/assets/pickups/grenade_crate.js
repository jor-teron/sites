/**
 * Browser FPS asset (pickup): grenade_crate — small ammo crate with two grenades on top and an amber floor glow.
 * Asset interface: default export { kind: 'pickup', name, build() -> { root, kit, glow } } (same as medkit).
 */
import * as THREE from 'three';
import grenade from '../weapons/grenade_frag.js';

const G = {
  box: new THREE.BoxGeometry(0.46, 0.2, 0.3),
  lid: new THREE.BoxGeometry(0.48, 0.03, 0.32),
  stripe: new THREE.BoxGeometry(0.47, 0.04, 0.305),
  glow: new THREE.CircleGeometry(0.6, 20),
};
const M = {
  box: new THREE.MeshStandardMaterial({ color: 0x5b6436, roughness: 0.8 }),
  lid: new THREE.MeshStandardMaterial({ color: 0x48502a, roughness: 0.8 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.6, emissive: 0x402800 }),
};
function glowMat() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,190,60,0.9)'); grd.addColorStop(1, 'rgba(255,190,60,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}
const GLOW = glowMat();

export function build() {
  const root = new THREE.Group(), kit = new THREE.Group();
  root.add(kit);
  const box = new THREE.Mesh(G.box, M.box); box.castShadow = true; kit.add(box);
  const lid = new THREE.Mesh(G.lid, M.lid); lid.position.y = 0.115; kit.add(lid);
  const st = new THREE.Mesh(G.stripe, M.stripe); kit.add(st);
  for (const x of [-0.1, 0.1]) { const g = grenade.build(); g.position.set(x, 0.22, 0); g.rotation.z = x * 2; kit.add(g); }
  const glow = new THREE.Mesh(G.glow, GLOW); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; root.add(glow);
  return { root, kit, glow };
}

export default { kind: 'pickup', name: 'grenade_crate', build };
