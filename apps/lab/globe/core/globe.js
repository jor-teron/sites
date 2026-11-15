/*
  Earth Simulator - Main Script
  Project: globe
  Purpose: Core init, scene setup, animation loop.
  Loads after globe and controls modules.
  Author: Games Builder
  Date: 2026-11-11
*/

// Global variables
let scene, camera, renderer, earth, controls;
let textureLoader = new THREE.TextureLoader();
let clock = new THREE.Clock();

/**
 * Initialize the Three.js scene, camera, renderer, lights, Earth, stars, and controls.
 */
function init() {
  // Scene with same dark space background as Solar Smash
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000011);

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 8);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('container').appendChild(renderer.domElement);

  // Lights (same style as Solar Smash)
  const ambient = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(5, 5, 5);
  scene.add(directional);

  // Stars
  createStars();

  // Load Earth texture
  loadEarthTexture();

  // Controls
  initControls();

  // Init 2D map
  initMap2D();

  // Manual mode buttons
  document.getElementById('btnModeGlobe').addEventListener('click', function () {
    hide2DMap();
    document.getElementById('btnModeGlobe').classList.add('active');
    document.getElementById('btnModeMap').classList.remove('active');
    localStorage.setItem('earthSimMode', 'globe');
  });
  document.getElementById('btnModeMap').addEventListener('click', function () {
    show2DMap();
    document.getElementById('btnModeMap').classList.add('active');
    document.getElementById('btnModeGlobe').classList.remove('active');
    localStorage.setItem('earthSimMode', 'map');
  });

  // 2D layer buttons
  function setMapLayer(layerKey) {
    const layers = {
      sat: window._satLayer,
      hybrid: window._hybridLayer,
      topo: window._topoLayer,
      osm: window._osmLayer,
      };
    const btns = {
      sat: 'btnLayerSat',
      hybrid: 'btnLayerHybrid',
      topo: 'btnLayerTopo',
      osm: 'btnLayerOSM'
    };

    // Remove all
    Object.values(layers).forEach(l => { if (l && map2d.hasLayer(l)) map2d.removeLayer(l); });
    if (window._hybridLabels && map2d.hasLayer(window._hybridLabels)) map2d.removeLayer(window._hybridLabels);

    // Add selected
    if (layers[layerKey]) layers[layerKey].addTo(map2d);
    if (layerKey === 'hybrid' && window._hybridLabels) window._hybridLabels.addTo(map2d);

    // Update buttons
    Object.values(btns).forEach(id => document.getElementById(id).classList.remove('active'));
    if (btns[layerKey]) document.getElementById(btns[layerKey]).classList.add('active');

    localStorage.setItem('earthSimLayer', layerKey);
  }

  document.getElementById('btnLayerSat').addEventListener('click', () => setMapLayer('sat'));
  document.getElementById('btnLayerHybrid').addEventListener('click', () => setMapLayer('hybrid'));
  document.getElementById('btnLayerTopo').addEventListener('click', () => setMapLayer('topo'));
  document.getElementById('btnLayerOSM').addEventListener('click', () => setMapLayer('osm'));
  

  // Search functionality
  function doSearch() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q || !map2d) return;
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = 'Searching...';
    fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=5')
      .then(r => r.json())
      .then(data => {
        resultsDiv.innerHTML = '';
        if (!data.length) {
          resultsDiv.innerHTML = 'No results';
          return;
        }
        data.forEach(item => {
          const div = document.createElement('div');
          div.style.padding = '4px';
          div.style.cursor = 'pointer';
          div.style.borderBottom = '1px solid #444';
          div.textContent = item.display_name;
          div.onclick = function () {
            map2d.setView([parseFloat(item.lat), parseFloat(item.lon)], 14);
            resultsDiv.innerHTML = '';
            document.getElementById('searchInput').value = '';
          };
          resultsDiv.appendChild(div);
        });
      })
      .catch(() => {
        resultsDiv.innerHTML = 'Search error';
      });
  }

  document.getElementById('btnSearch').addEventListener('click', doSearch);
  document.getElementById('searchInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') doSearch();
  });

  // Copy coordinates
  document.getElementById('btnCopyCoord').addEventListener('click', function () {
    if (window._lastCoord) {
      navigator.clipboard.writeText(window._lastCoord).then(() => {
        this.textContent = 'Copied!';
        setTimeout(() => { this.textContent = 'Copy'; }, 1500);
      });
    }
  });

  // Restore last mode on load
  const lastMode = localStorage.getItem('earthSimMode') || 'globe';
  if (lastMode === 'map') {
    document.getElementById('btnModeMap').click();
  }

  

  window.addEventListener('resize', onWindowResize);

  // Start loop
  animate();
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
 * Animation loop.
 */
function animate() {
  requestAnimationFrame(animate);
  if (!in2DMode) {
    controls.update();
    renderer.render(scene, camera);
  }
}

// Start the app
init();
