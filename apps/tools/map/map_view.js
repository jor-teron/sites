/* Map MAP1 — Leaflet map (vendor/leaflet, OSM tiles, from LL1's ll_map.js); remembers last view in 'map-settings-v1'. */
(function () {
  'use strict';
  var KEY = 'map-settings-v1', map = null, me = null, meAcc = null, pin = null;
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } }
  function save() { try { var c = map.getCenter(); localStorage.setItem(KEY, JSON.stringify({ lat: c.lat, lon: c.lng, zoom: map.getZoom() })); } catch (_) { /* blocked */ } }
  function init(el) {
    if (!window.L) { el.textContent = 'Map could not load.'; return; }
    var s = load(), ok = isFinite(s.lat) && isFinite(s.lon) && isFinite(s.zoom);
    map = L.map(el, { zoomControl: true }).setView(ok ? [s.lat, s.lon] : [22.5, 79], ok ? s.zoom : 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    map.on('moveend', save);
  }
  function showMe(lat, lon, acc) {
    if (!map) return;
    if (!meAcc) meAcc = L.circle([lat, lon], { radius: acc, weight: 1, color: '#1a73e8', fillOpacity: 0.12 }).addTo(map);
    else meAcc.setLatLng([lat, lon]).setRadius(acc);
    if (!me) me = L.circleMarker([lat, lon], { radius: 10, weight: 3, color: '#fff', fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
    else me.setLatLng([lat, lon]);
    map.flyTo([lat, lon], Math.max(map.getZoom(), 16));
  }
  function drop(lat, lon, label) {
    if (!map) return;
    if (pin) map.removeLayer(pin);
    pin = L.marker([lat, lon]).addTo(map).bindPopup(label);
    map.flyTo([lat, lon], Math.max(map.getZoom(), 15));
    pin.openPopup();
  }
  window.MapView = { init: init, showMe: showMe, drop: drop };
})();
