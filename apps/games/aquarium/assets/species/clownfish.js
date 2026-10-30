// Aquarium AQQ1a: clownfish species - data, info text and code-drawn body pattern.
(function () {
  'use strict';
  function bands(c, L, h, list, edge) {   // vertical bands (optionally black-edged)
    list.forEach(function (b) {
      if (edge) { c.fillStyle = '#111'; c.fillRect((b[0] - b[1] / 2 - .02) * L, -h, (b[1] + .04) * L, 2 * h); }
      c.fillStyle = b[2]; c.fillRect((b[0] - b[1] / 2) * L, -h, b[1] * L, 2 * h);
    });
  }
  function patClown(c, L, h) { bands(c, L, h, [[.24, .1, '#fff'], [-.02, .13, '#fff'], [-.3, .07, '#fff']], true); }
  window.AQ.registerSpecies({ id: 'clownfish', name: 'Clownfish', sci: 'Amphiprion ocellaris', L: 42, H: .4, spd: 46, z: 3, band: [.5, .85], amp: .06, school: 1, R: 120,
      top: '#ff8a1c', bot: '#ff6a0e', pat: patClown, eye: [.36, -.08, .05],
      tail: { tl: .24, ts: .4, fork: 0, col: '#ff7a14', edge: 1 }, dorsal: { x1: .15, xa: -.05, x2: -.25, dh: .3, col: '#ff7a14', edge: 1 }, anal: { x1: -.1, xa: -.18, x2: -.26, dh: .22, col: '#ff7a14', edge: 1 },
      desc: 'Clownfish live among the stinging tentacles of sea anemones, protected by a mucus coat. Here they swim free over the reef.',
      facts: ['All clownfish are born male; the dominant one becomes female.', 'They grow to about 8-11 cm.', 'They live in the warm Indo-Pacific, from Southeast Asia to northern Australia.'],
      eat: 14,
      rest: { chance: .25, where: 'plant' }, sleep: { chance: .1 }, flee: { speed: 2.2 } });
})();
