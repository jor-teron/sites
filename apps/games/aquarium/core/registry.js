// Aquarium AQQ1a: species registry. Each assets/species/*.js file registers itself; load order = spawn and save order.
window.AQ = window.AQ || {};
(function () {
  'use strict';
  var A = window.AQ; A.SPECIES = [];
  A.registerSpecies = function (s) { A.SPECIES.push(s); return s; };
})();
