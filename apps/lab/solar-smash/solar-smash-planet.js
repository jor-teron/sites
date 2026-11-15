/*
  Solar Smash - Planet
  Project: solar-smash
  Purpose: Planet creation, switching, and damage application.
  Author: Games Builder
  Date: 2026-11-11
*/

/**
 * Planet definitions (texture URL or color, name).
 */
const PLANETS = {
  earth: { name: 'Earth', texture: 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg', color: null },
  mars: { name: 'Mars', texture: null, color: 0xcc5533 },
  moon: { name: 'Moon', texture: null, color: 0xaaaaaa }
};

let currentPlanetKey = 'earth';

/**
 * Create or recreate the planet mesh.
 * @param {string} key - 'earth', 'mars', or 'moon'
 */
function createPlanet(key = 'earth') {
  if (planet) scene.remove(planet);
  currentPlanetKey = key;
  const def = PLANETS[key];
  const geometry = new THREE.SphereGeometry(2, 96, 96);
  let material;
  if (def.texture) {
    const tex = textureLoader.load(def.texture);
    material = new THREE.MeshPhongMaterial({ map: tex, shininess: 10, specular: new THREE.Color(0x333333) });
  } else {
    material = new THREE.MeshPhongMaterial({ color: def.color, shininess: 5 });
  }
  planet = new THREE.Mesh(geometry, material);
  scene.add(planet);
}

/**
 * Switch to a different planet and reset effects.
 * @param {string} key
 */
function switchPlanet(key) {
  if (!PLANETS[key]) return;
  projectiles.forEach(p => scene.remove(p));
  projectiles = [];
  createPlanet(key);
  document.querySelectorAll('#planetControl button').forEach(btn => btn.classList.remove('active'));
  document.getElementById('btn' + key.charAt(0).toUpperCase() + key.slice(1)).classList.add('active');
  updateStatus();
}

/**
 * Apply visual damage flash and particles.
 * @param {THREE.Vector3} point
 * @param {number} intensity
 */
function applyDamage(point, intensity = 1) {
  const original = planet.material.emissive ? planet.material.emissive.clone() : new THREE.Color(0x000000);
  planet.material.emissive = new THREE.Color(0xff4400);
  setTimeout(() => { planet.material.emissive = original; }, 250);
  spawnParticles(point, 15 * intensity, 0xff5500, 0.8);
  playImpactSound(intensity);
}

/**
 * Reset the current planet and clear effects.
 */
function resetPlanet() {
  projectiles.forEach(p => scene.remove(p));
  projectiles = [];
  createPlanet(currentPlanetKey);
  updateStatus();
}
