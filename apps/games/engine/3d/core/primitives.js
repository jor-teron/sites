/** Procedural low-poly meshes via THREE geometries (HEX-2 terrain tint). */
import {
  Mesh, MeshStandardNodeMaterial, Color,
  BoxGeometry, SphereGeometry, ConeGeometry, CylinderGeometry, CapsuleGeometry,
  PlaneGeometry, BufferAttribute
} from './three.js';

export function solidMat(hex, { emissive = 0x000000, emissiveIntensity = 0, metalness = 0, roughness = 0.85 } = {}) {
  return new MeshStandardNodeMaterial({
    color: new Color(hex),
    emissive: new Color(emissive),
    emissiveIntensity,
    metalness,
    roughness
  });
}

export function boxMesh(w, h, d, color, opts) {
  const m = new Mesh(new BoxGeometry(w, h, d), solidMat(color, opts));
  m.castShadow = true; m.receiveShadow = true; return m;
}
export function sphereMesh(r, color, opts) {
  const m = new Mesh(new SphereGeometry(r, 10, 8), solidMat(color, opts));
  m.castShadow = true; m.receiveShadow = true; return m;
}
export function coneMesh(r, h, color, opts) {
  const m = new Mesh(new ConeGeometry(r, h, 7), solidMat(color, opts));
  m.castShadow = true; m.receiveShadow = true; return m;
}
export function cylinderMesh(rt, rb, h, color, opts) {
  const m = new Mesh(new CylinderGeometry(rt, rb, h, 8), solidMat(color, opts));
  m.castShadow = true; m.receiveShadow = true; return m;
}
export function capsuleMesh(r, len, color, opts) {
  const m = new Mesh(new CapsuleGeometry(r, len, 4, 8), solidMat(color, opts));
  m.castShadow = true; m.receiveShadow = true; return m;
}

/**
 * Displace a PlaneGeometry into rolling hills.
 * Vertex colors: sand (low) → green (mid) → rock (high / steep).
 * sample(x,z) uses the same heightFn as collision.
 */
export function heightfieldMesh({
  size = 160, segments = 72, heightFn,
  sand = 0xc2b280, grass = 0x3f8f4a, grassHigh = 0x7cb85a, rock = 0x6a6e74
} = {}) {
  const geo = new PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSand = new Color(sand), cGrass = new Color(grass), cGrassH = new Color(grassHigh), cRock = new Color(rock);
  const c = new Color();
  const step = size / segments;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightFn(x, z);
    pos.setY(i, y);
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const span = Math.max(0.001, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const elev = (y - minY) / span;
    const ddx = heightFn(x + step, z) - heightFn(x - step, z);
    const ddz = heightFn(x, z + step) - heightFn(x, z - step);
    const slope = Math.min(1, Math.hypot(ddx, ddz) / (step * 3.2));
    if (elev < 0.22) c.copy(cSand).lerp(cGrass, elev / 0.22);
    else if (elev < 0.7) c.copy(cGrass).lerp(cGrassH, (elev - 0.22) / 0.48);
    else c.copy(cGrassH).lerp(cRock, (elev - 0.7) / 0.3);
    c.lerp(cRock, slope * 0.75);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const mesh = new Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return {
    mesh,
    sample(x, z) { return heightFn(x, z); },
    size, minY, maxY
  };
}
