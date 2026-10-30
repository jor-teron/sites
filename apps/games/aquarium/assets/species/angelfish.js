// Aquarium AQQ1a: angelfish species - data, info text and code-drawn body pattern.
(function () {
  'use strict';
  function patAngel(c, L, h) {
    c.save(); c.transform(1, 0, -.3, 1, 0, 0); c.fillStyle = 'rgba(25,25,30,.72)';
    [.2, -.04, -.26].forEach(function (x) { c.fillRect(x * L, -h, .07 * L, 2 * h); }); c.restore();
  }
  function streamers(c, L, h) {   // angelfish pelvic streamers
    c.strokeStyle = 'rgba(235,235,225,.85)'; c.lineWidth = .025 * L; c.lineCap = 'round'; c.beginPath();
    c.moveTo(.14 * L, .3 * h); c.quadraticCurveTo(.1 * L, h * 1.1, -.02 * L, h * 1.45); c.stroke();
  }
  window.AQ.registerSpecies({ id: 'angelfish', name: 'Angelfish', sci: 'Pterophyllum scalare', n: 3, L: 54, H: .95, spd: 38, z: 2, band: [.35, .7], amp: .045, school: 1, R: 150,
      top: '#f0e9c8', bot: '#fffbe8', pat: patAngel, extra: streamers, eye: [.34, -.12, .045],
      tail: { tl: .3, ts: .55, fork: .3, col: 'rgba(235,230,200,.55)' }, dorsal: { x1: .12, xa: -.14, x2: -.26, dh: 1.0, col: 'rgba(235,230,200,.7)' }, anal: { x1: .06, xa: -.16, x2: -.26, dh: .95, col: 'rgba(235,230,200,.7)' },
      desc: 'Angelfish are tall, thin cichlids from the slow, weedy rivers of the Amazon basin. Their dark stripes blend with plant stems, and pairs guard their eggs on a broad leaf.',
      facts: ['They reach about 15 cm long and 20 cm tall, fins included.', 'Wild angelfish live in Amazon, Orinoco and Essequibo waters.', 'A well-kept angelfish can live around 10 years.'],
      eat: 14 });
})();
