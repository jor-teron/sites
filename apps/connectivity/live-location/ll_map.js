/* Live Location LL2 — Leaflet map (vendor/leaflet, OSM tiles) + device list. invalidateSize() on resize / sheet toggle (LL1.1).
   One circle marker per member, keyed by the member key (dev id; LL1 senders 'n:'+name), not the peer id, so a member
   keeps its marker across reconnects. LL2: a member that goes offline (sent 'off', left the roster, or silent > 2 min)
   stays on the map, greyed, with "last seen X min ago"; members known only from history are placed the same way.
   Tap a list row = fly there and select it (trail). One trail polyline for the selected member (setTrail).
   legacy (LL1.1): devices were keyed by peer id, drop() removed the marker on 'off', label "last updated 5m ago". */
(function () {
  'use strict';
  var map = null, devs = {}, STALE = 120000, fitted = false, trail = null, trailDots = null, sel = '', onSel = null;
  function init(el) {
    if (!window.L) { el.textContent = 'Map could not load.'; return; }
    map = L.map(el, { zoomControl: true }).setView([22.5, 79], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    setInterval(render, 1000);
    addEventListener('resize', resize); setTimeout(resize, 50);
  }
  function resize() { if (map) map.invalidateSize(); }
  // legacy (LL1.1): function ago(t) { ... s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago'; }
  function ago(t) {
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 172800) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' days ago';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isOff(o) { return !o.online || Date.now() - o.seen > STALE; }
  function place(id, o) {
    if (!map || !isFinite(o.lat) || !isFinite(o.lon)) return;
    if (!o.m) { o.m = L.circleMarker([o.lat, o.lon], { radius: 11, weight: 3 }).addTo(map); o.m.bindTooltip('', { direction: 'top' }); o.m.on('click', function () { select(id); }); }
    else o.m.setLatLng([o.lat, o.lon]);
  }
  /* live position: d = {name, lat, lon, acc}; seen = now (receiver clock, as LL1) */
  function put(id, d, mine) {
    var o = devs[id] || (devs[id] = {});
    o.name = String(d.name || 'Device').slice(0, 40); o.lat = +d.lat; o.lon = +d.lon; o.acc = +d.acc || 0; o.seen = Date.now(); o.mine = !!mine; o.online = true;
    place(id, o);
    if (map && !fitted && isFinite(o.lat)) { fitted = true; map.setView([o.lat, o.lon], 15); }
    render();
  }
  /* last known spot from history (only when we have nothing newer live) */
  function known(id, w, mine) {
    var o = devs[id];
    if (o && (o.online || o.seen >= w.at)) return;
    o = o || (devs[id] = {});
    o.name = String(w.n || 'Device').slice(0, 40); o.lat = +w.lat; o.lon = +w.lon; o.acc = +w.acc || 0; o.seen = +w.at; o.mine = !!mine; o.online = false;
    place(id, o);
    render();
  }
  function offline(id) { var o = devs[id]; if (o && o.online) { o.online = false; render(); } }
  function drop(id) { var o = devs[id]; if (!o) return; if (o.m && map) map.removeLayer(o.m); delete devs[id]; if (sel === id) select(''); render(); }
  function fit() {
    if (!map) return; var pts = Object.keys(devs).map(function (k) { return [devs[k].lat, devs[k].lon]; }).filter(function (p) { return isFinite(p[0]); });
    if (pts.length && !fitted) { fitted = true; if (pts.length === 1) map.setView(pts[0], 15); else map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 }); }
  }
  function fly(id) { var o = devs[id]; if (o && map) { map.flyTo([o.lat, o.lon], Math.max(map.getZoom(), 16)); if (o.m) o.m.openTooltip(); } }
  function select(id) {
    sel = id && devs[id] ? id : '';
    if (!sel) setTrail([]);
    render();
    if (onSel) onSel(sel);
  }
  /* pts = [{lat, lon, at}] oldest first; draws one polyline + small dots for the selected member; fit = zoom to it (on select / range change) */
  function setTrail(pts, fit) {
    if (!map) return;
    if (trail) { map.removeLayer(trail); trail = null; }
    if (trailDots) { map.removeLayer(trailDots); trailDots = null; }
    if (!pts || !pts.length || !sel) return;
    var o = devs[sel] || {}, col = o.mine ? '#1a73e8' : '#e8710a', ll = pts.map(function (p) { return [p.lat, p.lon]; });
    trail = L.polyline(ll, { color: col, weight: 4, opacity: 0.8 }).addTo(map);
    trailDots = L.layerGroup(pts.length <= 400 ? pts.map(function (p) {
      return L.circleMarker([p.lat, p.lon], { radius: 3, weight: 0, fillColor: col, fillOpacity: 0.9 }).bindTooltip(new Date(p.at).toLocaleString());
    }) : []).addTo(map);
    trail.bringToBack();
    if (fit && ll.length > 1) map.fitBounds(trail.getBounds().extend([o.lat, o.lon]), { padding: [60, 60], maxZoom: 17 });   // show the whole trail when picked
  }
  function trailInfo() { return trail ? { n: trail.getLatLngs().length, sel: sel } : { n: 0, sel: sel }; }
  function render() {
    var ids = Object.keys(devs), list = document.getElementById('list'), html = '';
    ids.sort(function (a, b) { return (devs[b].mine - devs[a].mine) || (isOff(devs[a]) - isOff(devs[b])) || devs[a].name.localeCompare(devs[b].name); });
    ids.forEach(function (id) {
      var o = devs[id], off = isOff(o), col = off ? '#9aa0a6' : o.mine ? '#1a73e8' : '#e8710a';
      var when = (off ? 'last seen ' : 'live · updated ') + ago(o.seen);
      if (o.m) { o.m.setStyle({ color: id === sel ? '#202124' : '#fff', fillColor: col, fillOpacity: off ? 0.55 : 0.95 }); o.m.setTooltipContent(esc(o.name) + (o.mine ? ' (you)' : '') + ' · ' + when); }
      html += '<button class="dev jelly' + (off ? ' stale' : '') + (id === sel ? ' sel' : '') + '" data-id="' + esc(id) + '"><i style="background:' + col + '"></i><b>' + esc(o.name) + (o.mine ? ' (you)' : '') +
        '</b><span class="mut">' + when + (o.acc && !off ? ' · ±' + o.acc + ' m' : '') + '</span></button>';
    });
    list.innerHTML = html;
    document.getElementById('empty').hidden = ids.length > 0;
    var live = ids.filter(function (id) { return !isOff(devs[id]); }).length;
    var bl = document.getElementById('btn-list'); if (bl) bl.textContent = '👥 ' + live + (ids.length > live ? '/' + ids.length : '');
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.dev'); if (b) { var id = b.getAttribute('data-id'); fly(id); select(id); } });
  window.LLMap = { init: init, put: put, known: known, offline: offline, drop: drop, fly: fly, fit: fit, select: select, setTrail: setTrail, trailInfo: trailInfo,
    selected: function () { return sel; }, onSelect: function (f) { onSel = f; }, devices: function () { return devs; }, resize: resize, ago: ago, isOff: isOff, render: render };
})();
