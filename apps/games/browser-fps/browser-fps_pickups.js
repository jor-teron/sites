/**
 * Browser FPS — pickups (medkits).
 *
 * createPickups(scene, cfg, hooks):
 *   cfg   = CONFIG.pickups
 *   hooks = { randomSpot(): [x, z] | null,  canPick(): bool,  onPick(amount) }
 * Returns { update(dt, playerPos), reset(), items }.
 *
 * Medkit: low-poly white case with red crosses, gentle bob + spin and a soft additive glow
 * on the floor. Blinks before it despawns. Meshes are pooled and share geometry/materials.
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

function makeMedkit() {
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

export function createPickups(scene, cfg, hooks) {
  const pool = [];
  const items = [];   // active: { mesh, x, z, age }
  let timer = cfg.firstDelay;

  function spawn() {
    if (items.length >= cfg.maxOnMap) return null;
    const spot = hooks.randomSpot();
    if (!spot) return null;
    const mesh = pool.pop() || makeMedkit();
    mesh.root.position.set(spot[0], 0, spot[1]);
    mesh.root.visible = true;
    scene.add(mesh.root);
    const it = { mesh, x: spot[0], z: spot[1], age: 0, phase: Math.random() * 6.28 };
    items.push(it);
    return it;
  }

  function remove(i) {
    const it = items[i];
    scene.remove(it.mesh.root);
    pool.push(it.mesh);
    items.splice(i, 1);
  }

  function update(dt, playerPos, playerFeetY) {
    timer -= dt;
    if (timer <= 0) {
      timer += cfg.interval;
      spawn();
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt;
      const t = it.age + it.phase;
      it.mesh.kit.position.y = cfg.hoverY + Math.sin(t * 2.2) * cfg.bobAmp;
      it.mesh.kit.rotation.y += cfg.spinSpeed * dt;
      it.mesh.glow.material.opacity = 0.55 + Math.sin(t * 3) * 0.2;   // shared material: gentle pulse
      // blink in the last few seconds
      const left = cfg.lifetime - it.age;
      it.mesh.root.visible = left > cfg.blinkTime || Math.floor(it.age * cfg.blinkHz * 2) % 2 === 0;
      if (left <= 0) { remove(i); continue; }
      // pickup: walk over it (feet near the floor), only if it would heal
      const d = Math.hypot(playerPos.x - it.x, playerPos.z - it.z);
      if (d < cfg.pickRadius && playerFeetY < 1.2 && hooks.canPick()) {
        hooks.onPick(cfg.heal);
        remove(i);
      }
    }
  }

  function reset() {
    while (items.length) remove(items.length - 1);
    timer = cfg.firstDelay;
  }

  return { update, reset, spawn, items, get timer() { return timer; } };
}
