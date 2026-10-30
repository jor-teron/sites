// Aquarium AQQ1a: goldfish species - data, info text and code-drawn body pattern.
(function () {
  'use strict';
  function patGold(c, L, h) {
    c.strokeStyle = 'rgba(255,240,190,.3)'; c.lineWidth = 1;
    for (var r = 0; r < 4; r++) for (var x = -.3; x < .3; x += .12) {
      c.beginPath(); c.arc((x + (r % 2) * .06) * L, (r - 1.5) * h * .24, .07 * L, 2, 4.3); c.stroke();
    }
  }
  window.AQ.registerSpecies({ id: 'goldfish', name: 'Goldfish', sci: 'Carassius auratus', n: 3, L: 62, H: .52, spd: 48, z: 1, band: [.3, .65], amp: .06, school: 1, R: 170,
      top: '#ffb42e', bot: '#ffe0a0', pat: patGold, eye: [.34, -.1, .05],
      tail: { tl: .55, ts: .6, fork: .35, col: 'rgba(255,130,30,.8)' }, dorsal: { x1: .22, xa: -.05, x2: -.2, dh: .55, col: 'rgba(255,125,30,.85)' }, anal: { x1: -.08, xa: -.16, x2: -.24, dh: .3, col: 'rgba(255,125,30,.85)' },
      desc: 'Goldfish were bred from a dull Asian carp in China more than a thousand years ago and are among the oldest domesticated fish. They are curious, sociable and quick to learn who feeds them.',
      facts: ['They can remember things for months, not seconds.', 'The oldest known goldfish lived about 43 years.', 'They have no true stomach and graze almost constantly.'],
      eat: 16,
      rest: { chance: .2, where: 'plant' }, sleep: { chance: .12 }, flee: { speed: 1.6 } });
})();
