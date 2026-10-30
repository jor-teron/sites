// Aquarium AQQ1a: neon species - data, info text and code-drawn body pattern.
(function () {
  'use strict';
  function patNeon(c, L, h) {
    var g = c.createLinearGradient(.42 * L, 0, -.3 * L, 0); g.addColorStop(0, '#6af4ff'); g.addColorStop(1, '#2a7cff');
    c.strokeStyle = g; c.lineWidth = h * .22; c.lineCap = 'round'; c.beginPath(); c.moveTo(.4 * L, -.1 * h); c.lineTo(-.28 * L, -.03 * h); c.stroke();
    c.fillStyle = '#ee2a3c'; c.fillRect(-.4 * L, .1 * h, .52 * L, h);
  }
  window.AQ.registerSpecies({ id: 'neon', name: 'Neon Tetra', sci: 'Paracheirodon innesi', L: 24, H: .24, spd: 90, z: 5, band: [.25, .6], amp: .07, school: 1, R: 140,
      top: '#27406e', bot: '#dfe6ec', pat: patNeon, eye: [.36, -.06, .07],
      tail: { tl: .3, ts: .3, fork: .3, col: 'rgba(210,235,245,.6)' }, dorsal: { x1: .08, xa: -.05, x2: -.16, dh: .3, col: 'rgba(210,235,245,.7)' }, anal: { x1: -.04, xa: -.14, x2: -.22, dh: .2, col: 'rgba(235,90,100,.7)' },
      desc: 'Neon tetras are tiny schooling fish from the blackwater streams of the upper Amazon. Their glowing blue stripe helps the group stay together in dim water.',
      facts: ['They grow to only about 3-4 cm.', 'The blue stripe is structural colour, made by light-reflecting crystals in the skin.', 'They feel safest in a school of six or more.'],
      eat: 8,
      rest: { chance: .08, where: 'sand' }, sleep: { chance: .06 }, flee: { speed: 2.8 } });
})();
