// Edit this. Hit Run (or Ctrl+Enter).
// Available: THREE, scene, hero helpers: box, cyl, sph, cone
// 'hero' is a THREE.Group() already added to the scene.

const SKIN  = 0xe8b98a;
const ARMOR = 0x2a5bd7;
const RED   = 0xd43a2a;
const DARK  = 0x1a1a2e;
const GLOW  = 0x00e5ff;

// torso
hero.add(box(0.9, 1.1, 0.5, ARMOR, 0, 1.2, 0));
hero.add(box(0.95, 0.65, 0.15, RED, 0, 1.4, 0.28, { metal: 0.8, rough: 0.3 }));

// head
hero.add(box(0.55, 0.55, 0.55, SKIN, 0, 2.05, 0));
hero.add(box(0.65, 0.28, 0.65, DARK, 0, 2.25, 0, { metal: 0.7, rough: 0.3 }));
hero.add(sph(0.05, GLOW, -0.14, 2.08, 0.27, { emissive: GLOW, emissiveIntensity: 2 }));
hero.add(sph(0.05, GLOW,  0.14, 2.08, 0.27, { emissive: GLOW, emissiveIntensity: 2 }));

// arms
hero.add(cyl(0.14, 0.14, 0.5, SKIN, -0.65, 1.4, 0));
hero.add(cyl(0.14, 0.14, 0.5, SKIN,  0.65, 1.4, 0));
hero.add(box(0.28, 0.28, 0.28, DARK, -0.65, 0.85, 0, { metal: 0.7, rough: 0.3 }));
hero.add(box(0.28, 0.28, 0.28, DARK,  0.65, 0.85, 0, { metal: 0.7, rough: 0.3 }));

// legs
hero.add(cyl(0.16, 0.16, 0.6, DARK, -0.25, 0.2, 0));
hero.add(cyl(0.16, 0.16, 0.6, DARK,  0.25, 0.2, 0));
hero.add(cyl(0.14, 0.14, 0.6, DARK, -0.25, -0.4, 0));
hero.add(cyl(0.14, 0.14, 0.6, DARK,  0.25, -0.4, 0));
hero.add(box(0.32, 0.2, 0.5, 0x8899aa, -0.25, -0.75, 0.1, { metal: 1, rough: 0.3 }));
hero.add(box(0.32, 0.2, 0.5, 0x8899aa,  0.25, -0.75, 0.1, { metal: 1, rough: 0.3 }));

hero.position.y = -0.8;
