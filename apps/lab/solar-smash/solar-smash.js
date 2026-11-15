/*
  Solar Smash - Main Script
  Project: solar-smash
  Purpose: Core engine: globals, init, controls, input, animation loop.
  Loads after utils, planet, and weapons modules.
  Author: Games Builder
  Date: 2026-11-11
*/

// Global variables
let scene, camera, renderer, planet, controlsPaused = false;
let currentWeapon = 'asteroid';
let weaponSize = 1.0;
let timeScale = 1.0;
let projectiles = [];
let clock = new THREE.Clock();
let textureLoader = new THREE.TextureLoader();
let audioCtx = null;

/**
 * Initialize the Three.js scene, camera, renderer, lights, and planet.
 */
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000011);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 8);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('container').appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(5, 5, 5);
  scene.add(directional);

  createPlanet('earth');
  createStars();
  setupControls();
  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('click', onPlanetClick);

  animate();
}

/**
 * Setup UI button controls for weapons, size, pause, and reset.
 */
function setupControls() {
  document.getElementById('btnAsteroid').addEventListener('click', () => setWeapon('asteroid'));
  document.getElementById('btnLaser').addEventListener('click', () => setWeapon('laser'));
  document.getElementById('btnNuke').addEventListener('click', () => setWeapon('nuke'));
  document.getElementById('btnBlackHole').addEventListener('click', () => setWeapon('blackhole'));
  document.getElementById('btnPause').addEventListener('click', togglePause);
  document.getElementById('btnReset').addEventListener('click', resetPlanet);

  document.getElementById('btnSmall').addEventListener('click', () => setSize(0.6, 'S'));
  document.getElementById('btnMed').addEventListener('click', () => setSize(1.0, 'M'));
  document.getElementById('btnLarge').addEventListener('click', () => setSize(1.6, 'L'));

  document.getElementById('btnEarth').addEventListener('click', () => switchPlanet('earth'));
  document.getElementById('btnMars').addEventListener('click', () => switchPlanet('mars'));
  document.getElementById('btnMoon').addEventListener('click', () => switchPlanet('moon'));

  document.getElementById('btnSlow').addEventListener('click', () => setTimeScale(0.25, 'Slow'));
  document.getElementById('btnNormal').addEventListener('click', () => setTimeScale(1.0, 'Normal'));
  document.getElementById('btnFast').addEventListener('click', () => setTimeScale(2.0, 'Fast'));

  document.getElementById('btnAsteroid').classList.add('active');
  document.getElementById('btnMed').classList.add('active');
  document.getElementById('btnEarth').classList.add('active');
  document.getElementById('btnNormal').classList.add('active');
}

/**
 * Set the current weapon and update UI.
 * @param {string} weapon
 */
function setWeapon(weapon) {
  currentWeapon = weapon;
  document.querySelectorAll('#controls button').forEach(btn => {
    if (btn.id.startsWith('btn') && !btn.id.includes('Pause') && !btn.id.includes('Reset')) btn.classList.remove('active');
  });
  const btnId = 'btn' + weapon.charAt(0).toUpperCase() + weapon.slice(1);
  const btn = document.getElementById(btnId);
  if (btn) btn.classList.add('active');
  updateStatus();
}

/**
 * Set weapon size multiplier and update UI.
 * @param {number} size
 * @param {string} label
 */
function setSize(size, label) {
  weaponSize = size;
  document.querySelectorAll('#sizeControl button').forEach(btn => btn.classList.remove('active'));
  document.getElementById('btn' + label).classList.add('active');
  updateStatus();
}

/**
 * Set time scale multiplier.
 * @param {number} scale
 * @param {string} label
 */
function setTimeScale(scale, label) {
  timeScale = scale;
  document.querySelectorAll('#timeControl button').forEach(btn => btn.classList.remove('active'));
  document.getElementById('btn' + label).classList.add('active');
  updateStatus();
}

/**
 * Update the status text display.
 */
function updateStatus() {
  const sizeLabel = weaponSize < 0.8 ? 'S' : weaponSize > 1.2 ? 'L' : 'M';
  const timeLabel = timeScale < 0.5 ? '0.25x' : timeScale > 1.5 ? '2x' : '1x';
  const planetName = PLANETS[currentPlanetKey] ? PLANETS[currentPlanetKey].name : 'Earth';
  document.getElementById('status').textContent = `Weapon: ${currentWeapon.charAt(0).toUpperCase() + currentWeapon.slice(1)} | Size: ${sizeLabel} | Planet: ${planetName} | Time: ${timeLabel} | Click to fire`;
}

/**
 * Simple procedural impact sound using Web Audio.
 * @param {number} intensity
 */
function playImpactSound(intensity = 1) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120 + intensity * 40, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.15 * Math.min(intensity, 2), audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.4);
}

/**
 * Toggle pause state.
 */
function togglePause() {
  controlsPaused = !controlsPaused;
  document.getElementById('btnPause').textContent = controlsPaused ? 'Resume' : 'Pause';
}

/**
 * Handle window resize.
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Raycast click on planet to fire current weapon.
 * @param {MouseEvent} event
 */
function onPlanetClick(event) {
  if (controlsPaused) return;

  const mouse = new THREE.Vector2();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(planet);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    if (currentWeapon === 'asteroid') fireAsteroid(point);
    else if (currentWeapon === 'laser') fireLaser(point);
    else if (currentWeapon === 'nuke') fireNuke(point);
    else if (currentWeapon === 'blackhole') fireBlackHole(point);
  }
}

/**
 * Animation loop.
 */
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (!controlsPaused) {
    planet.rotation.y += 0.004 * timeScale;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const ud = p.userData;

      if (ud.type === 'asteroid') {
        const dir = ud.target.clone().sub(p.position).normalize();
        p.position.add(dir.multiplyScalar(ud.speed * timeScale));
        p.rotation.x += 0.05 * timeScale;
        p.rotation.y += 0.03 * timeScale;
        if (p.position.distanceTo(ud.target) < 0.4) {
          applyDamage(ud.target, ud.size * 1.2);
          scene.remove(p);
          projectiles.splice(i, 1);
        }
      } else if (ud.type === 'laser' || ud.type === 'particle') {
        if (ud.vel) p.position.add(ud.vel.clone().multiplyScalar(delta * 50 * timeScale));
        ud.life -= delta * timeScale;
        if (ud.life <= 0) {
          scene.remove(p);
          projectiles.splice(i, 1);
        }
      } else if (ud.type === 'boom') {
        ud.life -= delta * timeScale;
        const t = 1 - ud.life / 1.5;
        p.scale.setScalar(1 + t * ud.grow);
        p.material.opacity = Math.max(0, 1 - t);
        if (ud.life <= 0) {
          scene.remove(p);
          projectiles.splice(i, 1);
        }
      } else if (ud.type === 'blackhole') {
        ud.life -= delta * timeScale;
        p.rotation.y += 0.08 * timeScale;
        if (ud.life <= 0) {
          scene.remove(p);
          projectiles.splice(i, 1);
        }
      } else if (ud.type === 'disk') {
        ud.life -= delta * timeScale;
        p.rotation.z += 0.15 * timeScale;
        if (ud.life <= 0) {
          scene.remove(p);
          projectiles.splice(i, 1);
        }
      }
    }
  }

  renderer.render(scene, camera);
}

// Start the game
init();
