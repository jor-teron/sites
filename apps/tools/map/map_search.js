/* Map MAP1 — place search via Nominatim; runs only on submit (never as-you-type) per their usage policy. */
(function () {
  'use strict';
  function find(q) {
    var u = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q);
    return fetch(u, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (a) {
      return (a || []).map(function (p) { return { name: String(p.display_name || ''), lat: +p.lat, lon: +p.lon }; })
        .filter(function (p) { return isFinite(p.lat) && isFinite(p.lon); });
    });
  }
  window.MapSearch = { find: find };
})();
