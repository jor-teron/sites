// Aquarium AQQ1d: seahorse - drifts upright, slowly ('upright' mode), and rests by its plants or kelp.
(function () {
  'use strict';
  function draw(c, L, ph) {
    var i, t, col = '#f2b33d';
    c.fillStyle = col; c.strokeStyle = 'rgba(120,70,0,.35)'; c.lineWidth = 1;
    for (i = 0; i <= 14; i++) {   // body: overlapping rings down an S-curve (belly forward), thinning to the tail
      t = i / 14; var x = Math.sin(t * 3.3 + .2) * .2 * L - .04 * L, y = (-.48 + t * 1.05) * L, r = L * (.04 + .17 * Math.sin(Math.min(1, t * 1.15) * 3.1416 * .9 + .25));
      c.beginPath(); c.arc(x, y, Math.max(1, r), 0, 6.3); c.fill(); if (i % 2) c.stroke();
    }
    c.lineWidth = Math.max(1.5, L * .07); c.strokeStyle = col; c.lineCap = 'round'; c.beginPath(); c.arc(-.03 * L, .66 * L, .09 * L, -1.4, 3.6); c.stroke();   // curled tail
    c.beginPath(); c.arc(.02 * L, -.6 * L, .15 * L, 0, 6.3); c.fill();   // head
    c.save(); c.translate(.1 * L, -.56 * L); c.rotate(.35); c.fillRect(0, -.045 * L, .3 * L, .09 * L); c.restore();   // snout
    c.fillStyle = '#e09a20'; c.beginPath(); c.moveTo(-.05 * L, -.75 * L); c.lineTo(.02 * L, -.88 * L); c.lineTo(.08 * L, -.74 * L); c.fill();   // crown
    c.fillStyle = 'rgba(255,240,200,.75)'; c.beginPath(); c.ellipse(-.2 * L, -.05 * L, .07 * L * (1 + .5 * Math.sin(ph * 3)), .14 * L, 0, 0, 6.3); c.fill();   // fluttering back fin
    c.fillStyle = '#fff'; c.beginPath(); c.arc(.06 * L, -.63 * L, .05 * L + .5, 0, 6.3); c.fill(); c.fillStyle = '#000'; c.beginPath(); c.arc(.07 * L, -.63 * L, .03 * L + .3, 0, 6.3); c.fill();
  }
  window.AQ.registerSpecies({ id: 'seahorse', name: 'Seahorse', sci: 'Hippocampus', L: 30, H: 1.65, spd: 12, z: 2, band: [.3, .85], mode: 'upright', bob: 6, verb: 'Drifting', draw: draw,
    desc: 'Seahorses swim upright, pushed along by a tiny fluttering back fin. To rest they curl their tail around a plant or kelp stalk and hold on.',
    facts: ['The father seahorse carries the eggs in a belly pouch.', 'Each eye can move on its own.', 'They are among the slowest fish in the sea.'],
    eat: 12, rest: { chance: .45, where: 'plant' }, sleep: { chance: .1 }, flee: { speed: 1.8 } });
})();
