/*
 * AR Theme Game — Overlay renderer
 * Three.js scene drawn on top of the live camera.
 * Placeholder meshes only (no GLB yet).
 * Header: ar.js
 */

/**
 * Three.js renderer attached to #view
 */
let renderer = null;

/**
 * Perspective camera looking at the overlay scene
 */
let sceneCam = null;

/**
 * Scene that holds the current theme target
 */
let scene = null;

/**
 * Clock used for theme animation dt
 */
let clock = null;

/**
 * Mesh currently shown (pet / zombie / ghost placeholder)
 */
let targetMesh = null;

/**
 * Build the overlay renderer and empty scene.
 * @param {HTMLCanvasElement} canvas - #view canvas
 */
function initAR(canvas) {
  const R = AR_GAME_CONFIG.render;
  // WebGL renderer, transparent so the camera video shows through
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, R.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  // Simple perspective camera
  sceneCam = new THREE.PerspectiveCamera(
    R.fov,
    window.innerWidth / window.innerHeight,
    R.near,
    R.far
  );
  sceneCam.position.set(0, 0, R.cameraZ);

  scene = new THREE.Scene();
  clock = new THREE.Clock();

  // Soft light so placeholders read well on camera video
  const light = new THREE.HemisphereLight(R.lightSky, R.lightGround, R.lightIntensity);
  scene.add(light);

  window.addEventListener("resize", onResize);
}

/**
 * Keep the overlay sized to the phone screen.
 */
function onResize() {
  if (!renderer || !sceneCam) {
    return;
  }
  sceneCam.aspect = window.innerWidth / window.innerHeight;
  sceneCam.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Replace the current target mesh with a new placeholder.
 * @param {THREE.Object3D} mesh - Theme mesh
 */
function setTarget(mesh) {
  if (targetMesh) {
    scene.remove(targetMesh);
  }
  targetMesh = mesh;
  scene.add(targetMesh);
}

/**
 * Draw one frame and let the active theme move the target.
 * @param {object} theme - Loaded theme module
 */
function renderFrame(theme) {
  const dt = clock.getDelta();
  if (theme && typeof theme.update === "function" && targetMesh) {
    theme.update(targetMesh, dt);
  }
  renderer.render(scene, sceneCam);
}

/**
 * Convert a canvas click/tap into NDC and test against the target.
 * @param {number} clientX
 * @param {number} clientY
 * @returns {boolean} true if the tap hit the target
 */
function hitTest(clientX, clientY) {
  if (!targetMesh || !sceneCam) {
    return false;
  }

  // Normalized device coords from tap
  const ndc = new THREE.Vector2(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, sceneCam);
  const hits = raycaster.intersectObject(targetMesh, true);
  return hits.length > 0;
}
