/*
  Earth Simulator - 2D Map
  Project: globe
  Purpose: Leaflet satellite (Esri World Imagery) + OSM option, shown at high zoom.
  Author: Games Builder
  Date: 2026-11-11
*/

let map2d = null;
let in2DMode = false;

/**
 * Initialize the Leaflet map (hidden by default).
 * Uses Esri World Imagery as default satellite layer.
 */
function initMap2D() {
  map2d = L.map('map2d', {
    zoomControl: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    dragging: true,
    touchZoom: true,
    boxZoom: true,
    keyboard: true,
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 25,
    zoomDelta: 1,
    zoomSnap: 1,
    attributionControl: true
  }).setView([20, 0], 4);

  // Esri World Imagery (satellite) - default
  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 25,
      maxNativeZoom: 19,
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics'
    }
  );

  // Hybrid (satellite + labels)
  const hybridLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 25,
    maxNativeZoom: 19,
    attribution: 'Esri'
  });
  // Note: true hybrid usually overlays labels; using Esri reference overlay if available
  const hybridLabels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 25,
    maxNativeZoom: 19,
    attribution: 'Esri'
  });

  // Topo
  const topoLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 25,
    maxNativeZoom: 19,
    attribution: 'Esri'
  });

  // Street (OSM)
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 25,
    maxNativeZoom: 19,
    attribution: '© OpenStreetMap'
  });

  // Dark
  const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 25,
    maxNativeZoom: 19,
    attribution: '© OpenStreetMap © CartoDB'
  });

  // Default: Hybrid
  hybridLayer.addTo(map2d);
  hybridLabels.addTo(map2d);

  // Zoom level display
  function updateZoomInfo() {
    const z = Math.round(map2d.getZoom());
    document.getElementById('zoomInfo').textContent = 'Zoom: ' + z + ' / 25';
  }
  map2d.on('zoomend', updateZoomInfo);
  updateZoomInfo();

  // Lat/Lon on click
  map2d.on('click', function (e) {
    const lat = e.latlng.lat.toFixed(6);
    const lon = e.latlng.lng.toFixed(6);
    document.getElementById('latInfo').textContent = 'Lat: ' + lat;
    document.getElementById('lonInfo').textContent = 'Long: ' + lon;
    window._lastCoord = lat + ', ' + lon;
  });

  // Store layers for manual switching
  window._satLayer = satelliteLayer;
  window._hybridLayer = hybridLayer;
  window._hybridLabels = hybridLabels;
  window._topoLayer = topoLayer;
  window._osmLayer = osmLayer;
  window._darkLayer = darkLayer;

  // No auto-switch — user controls mode manually

  // Restore last layer
  const lastLayer = localStorage.getItem('earthSimLayer') || 'hybrid';
  setTimeout(() => {
    if (typeof setMapLayer === 'function') setMapLayer(lastLayer);
  }, 100);
}

/**
 * Show 2D map centered on approximate lat/lon from camera.
 */
function show2DMap() {
  if (in2DMode) return;
  in2DMode = true;
  document.getElementById('container').style.display = 'none';
  document.getElementById('map2d').style.display = 'block';
  document.getElementById('mapLayerSection').style.display = 'block';

  // Restore last position or use camera-based default
  const saved = JSON.parse(localStorage.getItem('earthSim2D') || 'null');
  let lat = 20, lon = 0, zoom = 4;
  if (saved) {
    lat = saved.lat;
    lon = saved.lon;
    zoom = saved.zoom;
  } else {
    const dir = camera.position.clone().normalize();
    lat = Math.asin(dir.y) * (180 / Math.PI);
    lon = Math.atan2(dir.x, dir.z) * (180 / Math.PI);
    zoom = 6;
  }
  map2d.setView([lat, lon], zoom);
  setTimeout(() => map2d.invalidateSize(), 100);

  // Save on move/zoom
  map2d.on('moveend', save2DState);
}

/**
 * Hide 2D map and return to globe.
 */
function save2DState() {
  if (!map2d) return;
  const c = map2d.getCenter();
  localStorage.setItem('earthSim2D', JSON.stringify({
    lat: c.lat,
    lon: c.lng,
    zoom: map2d.getZoom()
  }));
}

function hide2DMap() {
  if (!in2DMode) return;
  in2DMode = false;
  document.getElementById('map2d').style.display = 'none';
  document.getElementById('container').style.display = 'block';
  
  document.getElementById('mapLayerSection').style.display = 'none';
  localStorage.setItem('earthSimMode', 'globe');
}
