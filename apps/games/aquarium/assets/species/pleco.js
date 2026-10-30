// Aquarium AQQ1a: pleco species - data, info text and code-drawn body pattern.
(function () {
  'use strict';
  function patPleco(c, L, h) {
    c.fillStyle = 'rgba(25,18,8,.55)';
    for (var i = 0; i < 16; i++) {
      c.beginPath(); c.arc((-.34 + ((i * 37) % 100) / 100 * .8) * L, (((i * 53) % 100) / 100 - .5) * h * .9, (.025 + .012 * (i % 3)) * L, 0, 6.3); c.fill();
    }
  }
  window.AQ.registerSpecies({ id: 'pleco', name: 'Pleco', sci: 'Hypostomus plecostomus', n: 1, L: 84, H: .27, spd: 26, z: 0, band: [.9, 1], amp: .035, school: 0,
      top: '#5a4a30', bot: '#a89a74', pat: patPleco, eye: [.34, -.1, .035],
      tail: { tl: .26, ts: .5, fork: .12, col: '#5a4a30' }, dorsal: { x1: .2, xa: -.02, x2: -.2, dh: .95, col: '#4e3f28', ribs: 1 }, anal: { x1: -.1, xa: -.2, x2: -.26, dh: .3, col: '#6a5a3c' },
      desc: 'Plecos are armoured catfish that spend their days clinging to rocks and glass, rasping algae off the surface with a sucker-like mouth. They are shy and mostly nocturnal, so this one patrols the sand floor.',
      facts: ['Its body is covered in bony plates instead of scales.', 'Common plecos can grow to about 50 cm.', 'The family has hundreds of species, all from South and Central America.'],
      eat: 22 });
})();
