/*
  Solar Smash - Utils
  Project: solar-smash
  Purpose: Helper functions (stars, particles).
  Author: Games Builder
  Date: 2026-11-11
*/

/**
 * Create a simple starfield using points.
 */
function createStars() {
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 1500;
  const positions = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 300;
  }
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 });
  const stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);
}

/**
 * Spawn varied particle debris.
 * @param {THREE.Vector3} origin
 * @param {number} count
 * @param {number} color
 * @param {number} life
 */
function spawnParticles(origin, count, color, life) {
  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.04 + Math.random() * 0.06, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: color });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(origin);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3
    ).normalize().multiplyScalar(0.4 + Math.random() * 0.8);
    p.userData = { life: life * (0.6 + Math.random() * 0.6), vel: vel, type: 'particle' };
    scene.add(p);
    projectiles.push(p);
  }
}
