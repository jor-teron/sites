/*
  Globe - Earth Mesh
  Project: globe
  Purpose: Creates the textured Earth mesh and starfield.
  Author: Games Builder
  Date: 2026-11-11
*/

const EARTH_TEXTURE_URL = 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg';

/**
 * Load Earth texture and apply it.
 */
function loadEarthTexture() {
  const wrap = document.getElementById('progressWrap');
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  if (wrap) {
    wrap.style.display = 'block';
    fill.style.width = '0%';
    text.textContent = 'Loading Earth…';
  }

  const texture = textureLoader.load(EARTH_TEXTURE_URL, function () {
    if (wrap) wrap.style.display = 'none';
    applyEarthTexture(texture);
  });
}

/**
 * Create or update the Earth mesh with the given texture.
 * @param {THREE.Texture} texture
 */
function applyEarthTexture(texture) {
  if (earth) scene.remove(earth);
  const geometry = new THREE.SphereGeometry(2, 96, 96);
  const material = new THREE.MeshPhongMaterial({
    map: texture,
    shininess: 10,
    specular: new THREE.Color(0x333333)
  });
  earth = new THREE.Mesh(geometry, material);
  scene.add(earth);
}

/**
 * Create a simple starfield.
 */
function createStars() {
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 1500;
  const positions = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 200;
  }
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 });
  const stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);
}
