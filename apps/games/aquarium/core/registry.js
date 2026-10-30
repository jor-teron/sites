// Aquarium AQQ1a/AQQ1c: species and tank registries. Each assets/species/*.js file registers itself; load order = spawn and save order.
window.AQ = window.AQ || {};
(function () {
  'use strict';
  var A = window.AQ; A.SPECIES = [];
  A.registerSpecies = function (s) { A.SPECIES.push(s); return s; };
  A.TANKS = [];   // AQQ1c: assets/tanks/*.js - scenery recipe + which species live there and how many
  A.registerTank = function (t) { A.TANKS.push(t); return t; };
  A.find = function (list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; };
})();
