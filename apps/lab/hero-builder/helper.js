// scaled sphere — for organic lumps
function orb(r, color, x, y, z, sx = 1, sy = 1, sz = 1, opts = {}) {
  const geo = new THREE.SphereGeometry(r, opts.seg ?? 24, opts.seg ?? 24);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opts.metal ?? 0,
    roughness: opts.rough ?? 0.7,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  return mesh;
}

// capsule — rounded cylinder for neck/limbs
function cap(r, len, color, x, y, z, opts = {}) {
  const geo = new THREE.CapsuleGeometry(r, len, opts.seg ?? 8, opts.seg ?? 12);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opts.metal ?? 0,
    roughness: opts.rough ?? 0.7
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  return mesh;
}

// scaled cone — for nose, chin
function cone2(r, h, color, x, y, z, sx = 1, sy = 1, sz = 1, opts = {}) {
  const geo = new THREE.ConeGeometry(r, h, opts.seg ?? 16);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opts.metal ?? 0,
    roughness: opts.rough ?? 0.7
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  return mesh;
}

// torus — for ears, rings
function ring(r, tube, color, x, y, z, opts = {}) {
  const geo = new THREE.TorusGeometry(r, tube, opts.seg ?? 8, opts.seg2 ?? 20);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opts.metal ?? 0,
    roughness: opts.rough ?? 0.7
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  return mesh;
}