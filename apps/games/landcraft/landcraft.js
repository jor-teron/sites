/*
  Landcraft Game - Main JavaScript
  Project: landcraft
  Location: apps/games/landcraft/landcraft.js
  Purpose: Core logic for a simple Minecraft-style voxel game using Three.js.
  Features: Grey scene background, basic block world, first-person controls with WASD + jump,
            raycast place/break, multiple block types.
  Author: Grok (updated for jor-teron)
  Date: 2026-10-22
*/

// Constants for world and rendering
const WORLD_SIZE = 20;
const BLOCK_SIZE = 1;
const MOVE_SPEED = 8;
const GRAVITY = 20;
const JUMP_FORCE = 8;

// Block types
const BLOCK_TYPES = [
  { name: 'dirt', color: 0x8B4513 },
  { name: 'grass', color: 0x4CAF50 },
  { name: 'stone', color: 0x808080 },
  { name: 'wood', color: 0x8B5A2B }
];

// Global scene objects
let scene, camera, renderer, controls;
let blocks = [];
let raycaster, mouse;
let selectedBlockIndex = 0;

// Movement state
const keys = {};
let velocity = new THREE.Vector3();
let canJump = false;

/**
 * Initialize the Three.js scene, camera, renderer, controls and world.
 * Sets grey background and lighting.
 */
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x808080);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 5, 8);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('game-container').appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0x404040, 1.2);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 10);
  scene.add(dir);

  controls = new THREE.PointerLockControls(camera, document.body);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  generateWorld();

  document.addEventListener('click', () => {
    if (!controls.isLocked) {
      controls.lock();
      document.getElementById('instructions').style.display = 'none';
    }
  });

  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' && canJump) {
      velocity.y = JUMP_FORCE;
      canJump = false;
    }
    if (e.code >= 'Digit1' && e.code <= 'Digit4') {
      selectedBlockIndex = parseInt(e.code.slice(-1)) - 1;
    }
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });

  document.addEventListener('mousedown', onMouseDown);
  window.addEventListener('resize', onWindowResize);

  animate();
}

/**
 * Generate a simple flat terrain of dirt blocks.
 */
function generateWorld() {
  const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  const dirtMat = new THREE.MeshLambertMaterial({ color: BLOCK_TYPES[0].color });

  for (let x = -WORLD_SIZE / 2; x < WORLD_SIZE / 2; x++) {
    for (let z = -WORLD_SIZE / 2; z < WORLD_SIZE / 2; z++) {
      const block = new THREE.Mesh(geometry, dirtMat.clone());
      block.position.set(x, 0, z);
      block.userData = { type: 0 };
      scene.add(block);
      blocks.push(block);
    }
  }
}

/**
 * Handle mouse clicks for breaking and placing blocks.
 * @param {MouseEvent} event
 */
function onMouseDown(event) {
  if (!controls.isLocked) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(blocks);

  if (intersects.length > 0) {
    const hit = intersects[0];
    if (event.button === 0) {
      // Break
      scene.remove(hit.object);
      blocks = blocks.filter(b => b !== hit.object);
    } else if (event.button === 2) {
      // Place
      const normal = hit.face.normal;
      const pos = hit.object.position.clone().add(normal);
      const type = BLOCK_TYPES[selectedBlockIndex];
      const mat = new THREE.MeshLambertMaterial({ color: type.color });
      const newBlock = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE),
        mat
      );
      newBlock.position.copy(pos);
      newBlock.userData = { type: selectedBlockIndex };
      scene.add(newBlock);
      blocks.push(newBlock);
    }
  }
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
 * Animation loop: handle movement, gravity, and render.
 */
function animate() {
  requestAnimationFrame(animate);

  const delta = 0.016; // approximate frame time

  if (controls.isLocked) {
    velocity.x = 0;
    velocity.z = 0;

    const direction = new THREE.Vector3();
    if (keys['KeyW']) direction.z -= 1;
    if (keys['KeyS']) direction.z += 1;
    if (keys['KeyA']) direction.x -= 1;
    if (keys['KeyD']) direction.x += 1;
    direction.normalize();

    if (direction.length() > 0) {
      velocity.x = direction.x * MOVE_SPEED;
      velocity.z = direction.z * MOVE_SPEED;
    }

    // Apply camera direction for movement
    const move = new THREE.Vector3();
    controls.getDirection(move);
    // Simplified forward/right movement
    if (keys['KeyW']) controls.moveForward(MOVE_SPEED * delta);
    if (keys['KeyS']) controls.moveForward(-MOVE_SPEED * delta);
    if (keys['KeyA']) controls.moveRight(-MOVE_SPEED * delta);
    if (keys['KeyD']) controls.moveRight(MOVE_SPEED * delta);

    // Gravity
    velocity.y -= GRAVITY * delta;
    camera.position.y += velocity.y * delta;

    // Simple ground check
    if (camera.position.y < 1.6) {
      camera.position.y = 1.6;
      velocity.y = 0;
      canJump = true;
    }
  }

  renderer.render(scene, camera);
}

// Start the game when DOM is ready
window.addEventListener('load', init);

// Prevent context menu on right-click
document.addEventListener('contextmenu', e => e.preventDefault());
