/*
  Earth Simulator - Controls
  Project: globe
  Purpose: OrbitControls setup, auto-rotate toggle, and view reset.
  Author: Games Builder
  Date: 2026-11-11
*/

/**
 * Initialize OrbitControls for pan / zoom / rotate.
 */
function initControls() {
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 3;
  controls.maxDistance = 20;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.enablePan = true;
}

/**
 * Toggle auto-rotation of the globe.
 */
function toggleAutoRotate() {
  controls.autoRotate = !controls.autoRotate;
  const btn = document.getElementById('btnRotate');
  btn.textContent = controls.autoRotate ? 'Auto-Rotate: On' : 'Auto-Rotate: Off';
  btn.classList.toggle('active', controls.autoRotate);
}

/**
 * Reset camera and controls to default view.
 */
function resetView() {
  camera.position.set(0, 0, 8);
  controls.target.set(0, 0, 0);
  controls.update();
}
