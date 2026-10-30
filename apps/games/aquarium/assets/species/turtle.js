// Aquarium AQQ1e: sea turtle - slow flipper strokes, now and then swims up to the surface to breathe ('drift' mode + surface).
(function () {
  'use strict';
  function draw(c, L, ph) {
    var s = Math.sin(ph * .6), i;
    c.fillStyle = '#7fae6a';
    c.save(); c.translate(L * .12, L * .06); c.rotate(.5 + s * .5); c.beginPath(); c.ellipse(-L * .14, 0, L * .2, L * .06, 0, 0, 6.3); c.fill(); c.restore();   // front flipper rowing
    c.beginPath(); c.ellipse(-L * .3, L * .08, L * .09, L * .04, -.4 - s * .3, 0, 6.3); c.fill();   // back flipper
    c.beginPath(); c.ellipse(L * .4, -L * .02, L * .12, L * .09, .1, 0, 6.3); c.fill();   // head
    var g = c.createLinearGradient(0, -L * .25, 0, L * .1); g.addColorStop(0, '#6b5233'); g.addColorStop(1, '#a08050');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, -L * .03, L * .33, L * .2, 0, 3.1416, 0); c.quadraticCurveTo(0, L * .14, -L * .33, -L * .03); c.fill();
    c.strokeStyle = 'rgba(40,30,10,.4)'; c.lineWidth = 1; for (i = -1; i <= 1; i++) { c.beginPath(); c.arc(i * L * .16, -L * .1, L * .08, 0, 6.3); c.stroke(); }
    c.fillStyle = '#111'; c.beginPath(); c.arc(L * .45, -L * .04, L * .02 + .5, 0, 6.3); c.fill();
  }
  window.AQ.registerSpecies({ id: 'turtle', name: 'Sea turtle', sci: 'Chelonia mydas', L: 70, H: .55, spd: 30, z: 2, band: [.2, .8], mode: 'drift', surface: .25, tilt: .4, verb: function (f) { return f.y < window.AQ.sim.bounds(f).y0 + 40 * window.AQ.st.U ? 'Taking a breath' : 'Swimming'; }, draw: draw,
    desc: 'Sea turtles row through the water with their front flippers. They breathe air, so every so often they swim up to the surface for a breath.',
    facts: ['Sea turtles can hold their breath for hours while resting.', 'They return to the beach where they hatched to lay eggs.', 'Green sea turtles are named for the colour of their fat, not their shell.'],
    eat: 16, rest: { chance: .3, where: 'sand' }, sleep: { chance: .12 }, flee: { speed: 1.5 } });
})();
