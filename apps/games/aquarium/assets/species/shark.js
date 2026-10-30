// Aquarium AQQ1e: reef shark - a slow cruising patrol ('cruise' mode). Others swim off when it passes; it never eats or hurts anyone.
(function () {
  'use strict';
  function draw(c, L, ph) {
    var t = Math.sin(ph * .5) * L * .06;
    c.fillStyle = '#7d8c99';
    c.beginPath(); c.moveTo(-L * .38, 0); c.lineTo(-L * .52, -L * .16 + t); c.lineTo(-L * .46, t * .5); c.lineTo(-L * .5, L * .1 + t); c.fill();   // tail sweeps
    c.beginPath(); c.moveTo(-L * .02, -L * .08); c.lineTo(-L * .1, -L * .2); c.lineTo(-L * .16, -L * .07); c.fill();   // dorsal fin
    c.beginPath(); c.moveTo(L * .08, L * .05); c.lineTo(-L * .06, L * .15); c.lineTo(-L * .02, L * .05); c.fill();   // pectoral fin
    c.beginPath(); c.moveTo(L * .5, -L * .005); c.quadraticCurveTo(L * .3, -L * .11, -L * .05, -L * .09); c.quadraticCurveTo(-L * .3, -L * .06, -L * .42, 0);
    c.quadraticCurveTo(-L * .2, L * .06, L * .1, L * .07); c.quadraticCurveTo(L * .42, L * .06, L * .5, -L * .005); c.fill();
    c.fillStyle = '#e8eef2'; c.beginPath(); c.moveTo(L * .46, L * .02); c.quadraticCurveTo(L * .2, L * .075, -L * .2, L * .03); c.quadraticCurveTo(L * .1, L * .03, L * .46, L * .02); c.fill();   // pale belly
    c.strokeStyle = 'rgba(40,50,60,.5)'; c.lineWidth = 1; for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(L * (.24 - i * .03), -L * .03); c.lineTo(L * (.23 - i * .03), L * .03); c.stroke(); }
    c.fillStyle = '#111'; c.beginPath(); c.arc(L * .37, -L * .03, L * .015 + .6, 0, 6.3); c.fill();
    c.strokeStyle = 'rgba(30,30,30,.6)'; c.beginPath(); c.arc(L * .4, L * .02, L * .03, .3, 1.6); c.stroke();   // a calm little smile
  }
  window.AQ.registerSpecies({ id: 'shark', name: 'Reef shark', sci: 'Triaenodon obesus', L: 120, H: .26, spd: 22, z: 1, band: [.3, .8], mode: 'cruise', scare: 120, k: .8, tilt: .2, verb: 'Patrolling', draw: draw,
    desc: 'A small whitetip reef shark slowly patrols the tank. The other animals give it room, but this one is a gentle sort: it ignores the food and never bothers anyone.',
    facts: ['Sharks have no bones, only cartilage.', 'Whitetip reef sharks rest in caves by day.', 'Sharks keep growing new teeth all their lives.'],
    eat: 0, rest: { chance: .2, where: 'sand' }, sleep: { chance: .05 }, flee: { speed: 1 } });
})();
