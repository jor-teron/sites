/** Procedural low-poly meshes via THREE geometries. */
import {
  Mesh, MeshStandardNodeMaterial, Color,
  BoxGeometry, SphereGeometry, ConeGeometry, CylinderGeometry, CapsuleGeometry,
  PlaneGeometry, BufferAttribute
} from './three.js';

export function solidMat(hex, { emissive = 0x000000, emissiveIntensity = 0, metalness = 0, roughness = 0.85 } = {}) {
  const m = new MeshStandardNodeMaterial({
    color: new Color(hex),
    emissive: new Color(emissive),
    emissiveIntensity,
    metalness,
    roughness
  });
  return m;
}

export function boxMesh(w, h, d, color, opts) {
  return new Mesh(new BoxGeometry(w, h, d), solidMat(color, opts));
}
export function sphereMesh(r, color, opts) {
  return new Mesh(new SphereGeometry(r, 10, 8), solidMat(color, opts));
}
export function coneMesh(r, h, color, opts) {
  return new Mesh(new ConeGeometry(r, h, 7), solidMat(color, opts));
}
export function cylinderMesh(rt, rb, h, color, opts) {
  return new Mesh(new CylinderGeometry(rt, rb, h, 8), solidMat(color, opts));
}
export function capsuleMesh(r, len, color, opts) {
  return new Mesh(new CapsuleGeometry(r, len, 4, 8), solidMat(color, opts));
}

/** Displace a PlaneGeometry into rolling hills; returns { mesh, sample(x,z) }. */
export function heightfieldMesh({
  size = 160, segments = 64, heightFn, colorLow = 0x3d7a45, colorHigh = 0x8fbf5a
} = {}) {
  const geo = new PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new Color(colorLow), cHigh = new Color(colorHigh), c = new Color();
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightFn(x, z);
    pos.setY(i, y);
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const span = Math.max(0.001, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / span;
    c.copy(cLow).lerp(cHigh, t);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const mesh = new Mesh(geo, mat);
  mesh.receiveShadow = false;
  return {
    mesh,
    sample(x, z) { return heightFn(x, z); },
    size
  };
}
