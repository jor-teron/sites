/* Find My Device FD1 — locate. FDLocate.get() (target): one getCurrentPosition, high accuracy, 15 s timeout →
   {lat, lon, acc, at} or {error}. FDLocate.show(r, label) (finder): full-screen Leaflet map + accuracy circle + Google Maps link. */
(function () {
  'use strict';
  var map = null, mk = null, circ = null;
  function $(id) { return document.getElementById(id); }
  function get() {
    return new Promise(function (res) {
      if (!navigator.geolocation) return res({ error: 'This device has no location support.' });
      navigator.geolocation.getCurrentPosition(function (p) {
        res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0), at: Date.now() });
      }, function (e) {
        res({ error: e.code === 1 ? 'Location permission is off on that device.' : e.code === 3 ? 'That device could not get a location in time.' : 'That device could not get a location.' });
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }
  function hm(t) { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function show(r, label) {
    $('mapbox').hidden = false;
    $('m-info').textContent = label + ' · located ' + hm(r.at) + (r.acc ? ' · ±' + r.acc + ' m' : '');
    $('m-g').href = 'https://maps.google.com/?q=' + r.lat + ',' + r.lon;
    if (!window.L) { $('map').textContent = 'Map could not load.'; return; }
    if (!map) {
      map = L.map($('map'));
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      addEventListener('resize', function () { map.invalidateSize(); });
    }
    if (mk) map.removeLayer(mk); if (circ) map.removeLayer(circ);
    circ = L.circle([r.lat, r.lon], { radius: r.acc || 20, weight: 1, fillOpacity: 0.15 }).addTo(map);
    mk = L.circleMarker([r.lat, r.lon], { radius: 11, weight: 3, color: '#fff', fillColor: '#e8710a', fillOpacity: 1 }).addTo(map).bindTooltip(label).openTooltip();
    setTimeout(function () { map.invalidateSize(); map.setView([r.lat, r.lon], 16); }, 30);
  }
  window.FDLocate = { get: get, show: show, valid: function (r) { return r && isFinite(+r.lat) && isFinite(+r.lon) && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180; } };
})();
