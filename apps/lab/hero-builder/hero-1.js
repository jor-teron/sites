// ---- More complex hero ----
const hero1 = new THREE.Group();

// helper — box
function box(w, h, d, color, x, y, z, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opts.metal ?? 0,
    roughness: opts.rough ?? 0.6,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  return mesh;
}

// helper — cylinder (for limbs, neck, weapon handle)
function cyl(rTop, rBot, h, color, x, y, z, opts = {}) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, opts.seg ?? 8);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opts.metal ?? 0,
    roughness: opts.rough ?? 0.6
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  return mesh;
}

// helper — sphere (joints, head, orbs)
function sph(r, color, x, y, z, opts = {}) {
  const geo = new THREE.SphereGeometry(r, opts.seg ?? 12, opts.seg ?? 12);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opts.metal ?? 0,
    roughness: opts.rough ?? 0.6,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// helper — cone (spikes, shoulder pads)
function cone(r, h, color, x, y, z, opts = {}) {
  const geo = new THREE.ConeGeometry(r, h, opts.seg ?? 6);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opts.metal ?? 0,
    roughness: opts.rough ?? 0.6
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  return mesh;
}

// ============================
// COLORS
// ============================
const SKIN    = 0xe8b98a;
const ARMOR   = 0x2a5bd7;   // blue armor
const ARMOR_D = 0x1a3a8f;   // darker blue
const RED     = 0xd43a2a;   // accents
const GOLD    = 0xd4a017;
const DARK    = 0x1a1a2e;   // dark cloth
const METAL   = 0x8899aa;
const GLOW    = 0x00e5ff;

// ============================
// HEAD
// ============================
hero.add(box(0.55, 0.55, 0.55, SKIN, 0, 2.05, 0));
hero.add(cyl(0.12, 0.12, 0.2, SKIN, 0, 1.72, 0));       // neck

// helmet crown
hero.add(box(0.65, 0.28, 0.65, DARK, 0, 2.25, 0, { metal: 0.7, rough: 0.3 }));
hero.add(cone(0.12, 0.35, RED, 0, 2.55, 0, { rot: [0, 0, 0] }));  // spike on top

// helmet side wings
hero.add(cone(0.08, 0.3, GOLD, -0.35, 2.3, 0, { rot: [0, 0, Math.PI / 2] }));
hero.add(cone(0.08, 0.3, GOLD, 0.35, 2.3, 0, { rot: [0, 0, -Math.PI / 2] }));

// eyes (glowing)
hero.add(sph(0.05, GLOW, -0.14, 2.08, 0.27, { emissive: GLOW, emissiveIntensity: 2 }));
hero.add(sph(0.05, GLOW, 0.14, 2.08, 0.27, { emissive: GLOW, emissiveIntensity: 2 }));

// ============================
// TORSO
// ============================
hero.add(box(0.9, 1.1, 0.5, ARMOR, 0, 1.2, 0));           // chest
hero.add(box(0.95, 0.65, 0.15, RED, 0, 1.4, 0.28, { metal: 0.8, rough: 0.3 })); // chest plate

// gold trim on chest
hero.add(box(0.9, 0.06, 0.16, GOLD, 0, 1.72, 0.28, { metal: 1, rough: 0.2 }));
hero.add(box(0.9, 0.06, 0.16, GOLD, 0, 1.08, 0.28, { metal: 1, rough: 0.2 }));

// belt
hero.add(box(0.95, 0.15, 0.55, DARK, 0, 0.6, 0, { metal: 0.5, rough: 0.4 }));
hero.add(box(0.15, 0.15, 0.1, GOLD, 0, 0.6, 0.3, { metal: 1, rough: 0.2 })); // buckle

// ============================
// SHOULDERS (big pauldrons)
// ============================
hero.add(sph(0.3, ARMOR_D, -0.65, 1.7, 0, { metal: 0.6, rough: 0.4 }));
hero.add(sph(0.3, ARMOR_D, 0.65, 1.7, 0, { metal: 0.6, rough: 0.4 }));

// spikes on shoulders
hero.add(cone(0.1, 0.35, GOLD, -0.8, 1.95, 0, { rot: [0, 0, -0.5] }));
hero.add(cone(0.1, 0.35, GOLD, 0.8, 1.95, 0, { rot: [0, 0, 0.5] }));

// ============================
// ARMS
// ============================
// left arm
hero.add(cyl(0.14, 0.14, 0.5, SKIN, -0.65, 1.4, 0));       // upper arm
hero.add(sph(0.14, DARK, -0.65, 1.15, 0));                  // elbow joint
hero.add(cyl(0.13, 0.13, 0.5, SKIN, -0.65, 0.9, 0));        // forearm
hero.add(box(0.28, 0.28, 0.28, ARMOR_D, -0.65, 0.6, 0, { metal: 0.7, rough: 0.3 })); // gauntlet

// right arm
hero.add(cyl(0.14, 0.14, 0.5, SKIN, 0.65, 1.4, 0));
hero.add(sph(0.14, DARK, 0.65, 1.15, 0));
hero.add(cyl(0.13, 0.13, 0.5, SKIN, 0.65, 0.9, 0));
hero.add(box(0.28, 0.28, 0.28, ARMOR_D, 0.65, 0.6, 0, { metal: 0.7, rough: 0.3 }));

// ============================
// LEGS
// ============================
// left leg
hero.add(cyl(0.16, 0.16, 0.6, DARK, -0.25, 0.2, 0));        // thigh
hero.add(sph(0.16, ARMOR_D, -0.25, -0.1, 0));               // knee
hero.add(cyl(0.14, 0.14, 0.6, DARK, -0.25, -0.4, 0));       // shin
hero.add(box(0.32, 0.2, 0.5, METAL, -0.25, -0.75, 0.1, { metal: 1, rough: 0.3 })); // boot

// right leg
hero.add(cyl(0.16, 0.16, 0.6, DARK, 0.25, 0.2, 0));
hero.add(sph(0.16, ARMOR_D, 0.25, -0.1, 0));
hero.add(cyl(0.14, 0.14, 0.6, DARK, 0.25, -0.4, 0));
hero.add(box(0.32, 0.2, 0.5, METAL, 0.25, -0.75, 0.1, { metal: 1, rough: 0.3 }));

// ============================
// CAPE (flat boxes down the back)
// ============================
hero.add(box(0.85, 1.4, 0.06, RED, 0, 1.0, -0.3, { rough: 0.8 }));
hero.add(box(0.7, 0.6, 0.06, RED, 0, 0.1, -0.32, { rough: 0.8 }));

// ============================
// WEAPON — sword on the back
// ============================
const sword = new THREE.Group();

// blade
sword.add(box(0.08, 1.4, 0.03, METAL, 0, 0.9, 0, { metal: 1, rough: 0.2 }));
// tip
sword.add(cone(0.06, 0.2, METAL, 0, 1.7, 0, { seg: 4 }));
// guard
sword.add(box(0.35, 0.06, 0.06, GOLD, 0, 0.2, 0, { metal: 1, rough: 0.2 }));
// handle
sword.add(cyl(0.04, 0.04, 0.35, DARK, 0, 0.0, 0));
// pommel
sword.add(sph(0.06, GOLD, 0, -0.2, 0, { metal: 1, rough: 0.2 }));

// position sword diagonally on the back
sword.position.set(0.4, 1.2, -0.35);
sword.rotation.z = 0.5;
sword.rotation.x = -0.2;
hero.add(sword);

// ============================
// FLOATING ORBS (magic accents)
// ============================
const orbL = sph(0.1, GLOW, -0.9, 1.6, 0, { emissive: GLOW, emissiveIntensity: 3 });
const orbR = sph(0.1, GLOW, 0.9, 1.6, 0, { emissive: GLOW, emissiveIntensity: 3 });
hero.add(orbL);
hero.add(orbR);

// ============================
// PLACE HERO
// ============================
hero.position.y = -0.8;   // adjust so feet sit on ground
scene.add(hero);
