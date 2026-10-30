// Aquarium AQQ1e: stingray - glides flat just above the sand with rippling wing edges ('glide' mode).
(function () {
  'use strict';
  function draw(c, L, ph) {
    var w = L * .5, i, n = 8;
    c.strokeStyle = '#6b6152'; c.lineWidth = Math.max(1, L * .025); c.beginPath(); c.moveTo(-w * .6, 0); c.quadraticCurveTo(-w * 1.1, Math.sin(ph * .5) * L * .04, -w * 1.5, Math.sin(ph * .5 + 1) * L * .06); c.stroke();   // tail
    c.fillStyle = '#a99880'; c.beginPath(); c.moveTo(w, 0);
    for (i = 0; i <= n; i++) { var x = w - i / n * w * 1.7; c.lineTo(x, -L * .12 - Math.sin(i / n * 3.14) * L * .05 + Math.sin(ph * 1.2 - i * .8) * L * .05); }   // top wing edge ripples
    for (i = n; i >= 0; i--) { x = w - i / n * w * 1.7; c.lineTo(x, L * .03 + Math.sin(ph * 1.2 - i * .8 + 1) * L * .025); }
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)'; for (i = 0; i < 5; i++) { c.beginPath(); c.arc(w * (.4 - i * .25), -L * .08, L * .02 + .3, 0, 6.3); c.fill(); }
    c.fillStyle = '#222'; c.beginPath(); c.arc(w * .55, -L * .1, L * .025 + .5, 0, 6.3); c.fill();
  }
  window.AQ.registerSpecies({ id: 'ray', name: 'Stingray', sci: 'Dasyatidae', L: 70, H: .3, spd: 26, z: 3, band: [.82, 1], mode: 'glide', tilt: .3, verb: 'Gliding', draw: draw,
    desc: 'Rays are flat cousins of sharks. They glide just above the sand by rippling the edges of their wide wing-like fins, and often settle under a dusting of sand.',
    facts: ['A ray\'s mouth and gills are on its underside.', 'Rays sense tiny electric signals from animals hidden in the sand.', 'Their skeleton is cartilage, like your ears, not bone.'],
    eat: 14, rest: { chance: .4, where: 'sand' }, sleep: { chance: .1 }, flee: { speed: 1.8 } });
})();
