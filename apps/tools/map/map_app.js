/* Map MAP1 — wires the My location button, the search form and the results list. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, noteT = 0, busy = false;
  function note(t) { var n = $('note'); n.textContent = t; n.hidden = !t; clearTimeout(noteT); if (t) noteT = setTimeout(function () { n.hidden = true; }, 5000); }
  MapView.init($('map'));
  $('me').addEventListener('click', function () {
    if (!navigator.geolocation) { note('Location is not available on this device.'); return; }
    note('Finding you…');
    navigator.geolocation.getCurrentPosition(function (p) {
      note(''); MapView.showMe(p.coords.latitude, p.coords.longitude, Math.round(p.coords.accuracy || 0));
    }, function (e) { note(e.code === 1 ? 'Location permission was denied.' : 'Could not get your location.'); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
  $('search').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('q').value.trim(), box = $('results');
    if (!q || busy) return;
    busy = true; box.hidden = true; note('Searching…');
    MapSearch.find(q).then(function (list) {
      note(list.length ? '' : 'No places found.');
      box.innerHTML = '';
      list.forEach(function (p) {
        var b = document.createElement('button'); b.className = 'jelly'; b.textContent = p.name;
        b.addEventListener('click', function () { box.hidden = true; MapView.drop(p.lat, p.lon, p.name.split(',')[0]); });
        box.appendChild(b);
      });
      box.hidden = !list.length;
      $('q').blur();
    }).catch(function () { note('Search failed. Check your internet.'); }).then(function () { busy = false; });
  });
  $('map').addEventListener('click', function () { $('results').hidden = true; });
})();
