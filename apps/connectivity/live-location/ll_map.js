/* Live Location LL1 — Leaflet map (vendor/leaflet, OSM tiles) + device list.
   One circle marker per device; grey after 2 min of silence; tap a list row to fly there. */
(function () {
  'use strict';
  var map = null, devs = {}, STALE = 120000, fitted = false;
  function init(el) {
    if (!window.L) { el.textContent = 'Map could not load.'; return; }
    map = L.map(el, { zoomControl: true }).setView([22.5, 79], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    setInterval(render, 1000);
  }
  function ago(t) { var s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function put(id, d, mine) {
    var o = devs[id] || (devs[id] = {});
    o.name = String(d.name || 'Device').slice(0, 40); o.lat = +d.lat; o.lon = +d.lon; o.acc = +d.acc || 0; o.seen = Date.now(); o.mine = !!mine;
    if (!map || !isFinite(o.lat) || !isFinite(o.lon)) return;
    if (!o.m) { o.m = L.circleMarker([o.lat, o.lon], { radius: 11, weight: 3 }).addTo(map); o.m.bindTooltip('', { direction: 'top' }); }
    else o.m.setLatLng([o.lat, o.lon]);
    if (!fitted) { fitted = true; map.setView([o.lat, o.lon], 15); }
    render();
  }
  function drop(id) { var o = devs[id]; if (!o) return; if (o.m && map) map.removeLayer(o.m); delete devs[id]; render(); }
  function fly(id) { var o = devs[id]; if (o && map) { map.flyTo([o.lat, o.lon], Math.max(map.getZoom(), 16)); if (o.m) o.m.openTooltip(); } }
  function render() {
    var ids = Object.keys(devs), list = document.getElementById('list'), html = '';
    ids.sort(function (a, b) { return (devs[b].mine - devs[a].mine) || devs[a].name.localeCompare(devs[b].name); });
    ids.forEach(function (id) {
      var o = devs[id], stale = Date.now() - o.seen > STALE, col = o.mine ? '#1a73e8' : stale ? '#9aa0a6' : '#e8710a';
      if (o.m) { o.m.setStyle({ color: '#fff', fillColor: col, fillOpacity: stale ? 0.5 : 0.95 }); o.m.setTooltipContent(esc(o.name) + (o.mine ? ' (you)' : '') + ' · ' + ago(o.seen)); }
      html += '<button class="dev jelly' + (stale ? ' stale' : '') + '" data-id="' + esc(id) + '"><i style="background:' + col + '"></i><b>' + esc(o.name) + (o.mine ? ' (you)' : '') +
        '</b><span class="mut">last updated ' + ago(o.seen) + (o.acc ? ' · ±' + o.acc + ' m' : '') + '</span></button>';
    });
    list.innerHTML = html;
    document.getElementById('empty').hidden = ids.length > 0;
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.dev'); if (b) fly(b.getAttribute('data-id')); });
  window.LLMap = { init: init, put: put, drop: drop, fly: fly, devices: function () { return devs; } };
})();
