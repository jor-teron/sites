/*
  Solar Smash - Weapons
  Project: solar-smash
  Purpose: All weapon firing functions (asteroid, laser, nuke, black hole).
  Author: Games Builder
  Date: 2026-11-11
*/

/**
 * Fire an irregular asteroid towards the impact point.
 * @param {THREE.Vector3} target
 */
function fireAsteroid(target) {
  const size = 0.25 * weaponSize;
  const asteroidGeo = new THREE.IcosahedronGeometry(size, 1);
  const pos = asteroidGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    v.multiplyScalar(0.8 + Math.random() * 0.4);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  asteroidGeo.computeVertexNormals();
  const asteroidMat = new THREE.MeshPhongMaterial({ color: 0x886644, flatShading: true });
  const asteroid = new THREE.Mesh(asteroidGeo, asteroidMat);
  const direction = target.clone().normalize();
  asteroid.position.copy(direction.multiplyScalar(12));
  asteroid.userData = { target: target.clone(), speed: 0.18, type: 'asteroid', size: weaponSize };
  scene.add(asteroid);
  projectiles.push(asteroid);
}

/**
 * Fire a glowing laser beam to the impact point.
 * @param {THREE.Vector3} target
 */
function fireLaser(target) {
  const start = camera.position.clone().multiplyScalar(0.4);
  const dir = target.clone().sub(start).normalize();
  const length = start.distanceTo(target);
  const beamGeo = new THREE.CylinderGeometry(0.03 * weaponSize, 0.03 * weaponSize, length, 8);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.copy(start).add(dir.clone().multiplyScalar(length / 2));
  beam.lookAt(target);
  beam.rotateX(Math.PI / 2);
  beam.userData = { life: 0.35, type: 'laser' };
  scene.add(beam);
  projectiles.push(beam);

  const coreGeo = new THREE.CylinderGeometry(0.01 * weaponSize, 0.01 * weaponSize, length, 6);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.copy(beam.position);
  core.quaternion.copy(beam.quaternion);
  core.userData = { life: 0.35, type: 'laser' };
  scene.add(core);
  projectiles.push(core);

  applyDamage(target, weaponSize * 0.9);
}

/**
 * Fire a nuke with shockwave and dense particles.
 * @param {THREE.Vector3} target
 */
function fireNuke(target) {
  applyDamage(target, weaponSize * 1.8);
  spawnParticles(target, 40 * weaponSize, 0xffaa00, 1.0);
  spawnParticles(target, 20 * weaponSize, 0xff4400, 0.7);

  const ringGeo = new THREE.RingGeometry(0.1, 0.3, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6600, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(target);
  ring.lookAt(camera.position);
  ring.userData = { life: 1.5, type: 'boom', grow: 4 * weaponSize };
  scene.add(ring);
  projectiles.push(ring);
}

/**
 * Place a black hole with accretion disk.
 * @param {THREE.Vector3} target
 */
function fireBlackHole(target) {
  const pos = target.clone().normalize().multiplyScalar(2.8);
  const geo = new THREE.SphereGeometry(0.25 * weaponSize, 24, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const bh = new THREE.Mesh(geo, mat);
  bh.position.copy(pos);
  bh.userData = { life: 6.0, type: 'blackhole', strength: weaponSize };
  scene.add(bh);
  projectiles.push(bh);

  const diskGeo = new THREE.TorusGeometry(0.6 * weaponSize, 0.08 * weaponSize, 8, 32);
  const diskMat = new THREE.MeshBasicMaterial({ color: 0x4400aa, transparent: true, opacity: 0.7 });
  const disk = new THREE.Mesh(diskGeo, diskMat);
  disk.position.copy(pos);
  disk.rotation.x = Math.PI / 2;
  disk.userData = { life: 6.0, type: 'disk' };
  scene.add(disk);
  projectiles.push(disk);

  spawnParticles(target, 20, 0x6600ff, 2.0);
}
