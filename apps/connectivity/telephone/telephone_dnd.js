/* Telephone TP7 — Do Not Disturb belongs to the Hub. Telephone has no DND switch of its own any more; it follows the Hub's.
   Inside a host (hub.html, /phone.html): window.parent.HubDnd (H82) isOn() / allowFavs() / on('change', fn) / off('change', fn).
   Standalone (or a host without HubDnd): localStorage 'sites-hub.dnd' === '1' and 'sites-hub.dndFavs' === '1' + the 'storage' event.
   Everything in try/catch. The old Telephone settings dnd / dndFav (telephone-settings-v1) are ignored on purpose. */
(function () {
  'use strict';
  var K_ON = 'sites-hub.dnd', K_FAVS = 'sites-hub.dndFavs', fns = [];
  function hub() {
    try { if (window.parent !== window && window.parent.HubDnd && typeof window.parent.HubDnd.isOn === 'function') return window.parent.HubDnd; } catch (_) { /* cross-origin */ }
    return null;
  }
  function key(k) { try { return localStorage.getItem(k) === '1'; } catch (_) { return false; } }
  function isOn() { var h = hub(); if (h) { try { return !!h.isOn(); } catch (_) { /* fall back */ } } return key(K_ON); }
  function allowFavs() { var h = hub(); if (h) { try { return !!h.allowFavs(); } catch (_) { /* fall back */ } } return key(K_FAVS); }
  function fire() { var s = { on: isOn(), favs: allowFavs() }; fns.slice().forEach(function (f) { try { f(s); } catch (_) { /* */ } }); }
  var h0 = hub();
  if (h0) { try { h0.on('change', fire); window.addEventListener('pagehide', function () { try { h0.off('change', fire); } catch (_) { /* */ } }); } catch (_) { /* */ } }
  window.addEventListener('storage', function (e) { if (!e || e.key === null || e.key === K_ON || e.key === K_FAVS) fire(); });   // standalone + backup
  window.TPDnd = { isOn: isOn, allowFavs: allowFavs, onChange: function (f) { if (typeof f === 'function') fns.push(f); }, _fire: fire };
})();
