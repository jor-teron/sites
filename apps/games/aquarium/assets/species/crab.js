// Aquarium AQQ1d: crab - walks sideways along the sand ('walk' mode), code-drawn from the front.
(function () {
  'use strict';
  function draw(c, L, ph) {
    var w = L * .5, h = L * .26, k, i;
    c.lineCap = 'round'; c.strokeStyle = '#a8321a'; c.lineWidth = Math.max(1.5, L * .06);
    for (k = -1; k <= 1; k += 2) for (i = 0; i < 3; i++) {   // three walking legs a side, stepping in turn
      var lift = Math.max(0, Math.sin(ph * 1.5 + i * 2.1 + k)) * h * .5;
      c.beginPath(); c.moveTo(k * w * .6, h * .1); c.lineTo(k * (w * .95 + i * w * .14), -h * .35 - lift); c.lineTo(k * (w * 1.1 + i * w * .22), h * 1.1 - lift); c.stroke();
    }
    for (k = -1; k <= 1; k += 2) {   // claws, opening and closing a little
      c.beginPath(); c.moveTo(k * w * .55, -h * .4); c.lineTo(k * w * .95, -h * 1.25); c.stroke();
      c.fillStyle = '#e8562c'; c.beginPath(); c.ellipse(k * w * 1.02, -h * 1.5, L * .13, L * .09, k * .6, 0, 6.3); c.fill();
      c.fillStyle = '#c33f1e'; c.beginPath(); c.ellipse(k * w * 1.12, -h * 1.75 - Math.abs(Math.sin(ph)) * L * .03, L * .07, L * .04, k * .9, 0, 6.3); c.fill();
    }
    var g = c.createLinearGradient(0, -h, 0, h); g.addColorStop(0, '#f2683a'); g.addColorStop(1, '#b8341a');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, w * .85, h, 0, 0, 6.3); c.fill();
    c.fillStyle = 'rgba(255,220,180,.35)'; c.beginPath(); c.ellipse(0, -h * .4, w * .5, h * .3, 0, 0, 6.3); c.fill();
    for (k = -1; k <= 1; k += 2) { c.strokeStyle = '#a8321a'; c.lineWidth = Math.max(1, L * .04); c.beginPath(); c.moveTo(k * w * .2, -h * .8); c.lineTo(k * w * .25, -h * 1.5); c.stroke(); c.fillStyle = '#111'; c.beginPath(); c.arc(k * w * .25, -h * 1.55, L * .05 + .5, 0, 6.3); c.fill(); }
  }
  window.AQ.registerSpecies({ id: 'crab', name: 'Crab', sci: 'Brachyura', L: 34, H: .62, spd: 34, z: 6, band: [1, 1], mode: 'walk', floor: 1, pause: .45, verb: 'Scuttling', draw: draw,
    desc: 'Crabs walk sideways on eight legs and use their two claws to pick up scraps from the sand. They wait for food to sink to the floor.',
    facts: ['Most crabs walk sideways because their leg joints bend that way.', 'A crab grows by shedding its whole shell (moulting).', 'Crabs breathe with gills, kept wet under their shell.'],
    eat: 16, rest: { chance: .3, where: 'sand' }, sleep: { chance: .1 }, flee: { speed: 2.2 } });
})();
