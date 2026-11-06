import { createRng } from '../../../engine/shared/rng.js';
import { makeHeightFn } from './height.js';
import { heightfieldMesh, sphereMesh, solidMat } from '../../../engine/3d/core/primitives.js';
import { makeInstanced } from '../../../engine/3d/core/instancing.js';
import {
  Group, Mesh, CircleGeometry, MeshStandardNodeMaterial, Color,
  BoxGeometry, ConeGeometry, CylinderGeometry
} from '../../../engine/3d/core/three.js';

export { makeHeightFn };

export function buildValley(seed = 0x4E501) {
  const world = 160;
  const heightFn = makeHeightFn(seed, world);
  const ground = heightfieldMesh({ size: world, segments: 80, heightFn });
  const root = new Group();
  root.add(ground.mesh);

  const waterMat = new MeshStandardNodeMaterial({
    color: new Color(0x2a6ea8), metalness: 0.15, roughness: 0.22, transparent: true, opacity: 0.82
  });
  const water = new Mesh(new CircleGeometry(world * 0.52, 48), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.12;
  water.receiveShadow = true;
  root.add(water);

  const rng = createRng(seed ^ 0xABC);

  // --- Instanced static rocks ---
  const rockItems = [];
  for (let i = 0; i < 28; i++) {
    const x = rng.range(-70, 70), z = rng.range(-70, 70);
    if (Math.hypot(x, z) < 12) continue;
    const y = heightFn(x, z);
    const sx = rng.range(0.8, 2.2), sy = rng.range(0.6, 1.8), sz = rng.range(0.8, 2.2);
    rockItems.push({ x, y: y + sy * 0.35, z, ry: rng.range(0, Math.PI), sx, sy, sz });
  }
  if (rockItems.length) {
    root.add(makeInstanced(new BoxGeometry(1, 1, 1), solidMat(0x6a6e74), rockItems));
  }

  // --- Instanced trunks + crowns (two draws for all trees) ---
  const trunkItems = [], crownItems = [];
  for (let i = 0; i < 22; i++) {
    const x = rng.range(-65, 65), z = rng.range(-65, 65);
    if (Math.hypot(x, z) < 14) continue;
    const y = heightFn(x, z);
    const cr = rng.range(0.9, 1.5), ch = rng.range(2.2, 3.4);
    trunkItems.push({ x, y: y + 0.7, z, sx: 1, sy: 1, sz: 1 });
    crownItems.push({ x, y: y + 2.2, z, sx: cr, sy: ch, sz: cr });
  }
  if (trunkItems.length) {
    root.add(makeInstanced(new CylinderGeometry(0.18, 0.28, 1.4, 8), solidMat(0x5a3a22), trunkItems));
    root.add(makeInstanced(new ConeGeometry(1, 1, 7), solidMat(0x2f7a3a), crownItems));
  }

  const landmarks = [];
  const colors = [0x3ce0c8, 0xffc14a, 0xc48cff, 0x7dffb0, 0xff6b8a, 0x6ff0d8, 0xffe08a, 0x9ad7ff, 0xff9f6b, 0xb8ffd4];
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const dist = rng.range(18, 55);
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const y = heightFn(x, z);
    const col = colors[i % colors.length];
    const orb = sphereMesh(0.7, col, { emissive: col, emissiveIntensity: 1.4, roughness: 0.35 });
    orb.position.set(x, y + 1.3, z);
    orb.userData.landmark = true;
    orb.userData.taken = false;
    orb.userData.baseY = y + 1.3;
    root.add(orb);
    landmarks.push(orb);
  }

  return {
    root, sample: ground.sample, world, landmarks, heightFn,
    stats: { rocks: rockItems.length, trees: trunkItems.length, drawsStatic: (rockItems.length ? 1 : 0) + (trunkItems.length ? 2 : 0) }
  };
}
