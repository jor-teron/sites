// Aquarium AQQ1a: guppy species - data, info text and code-drawn body pattern.
(function () {
  'use strict';
  function patGuppy(c, L, h) {
    var g = c.createLinearGradient(.1 * L, 0, -.36 * L, 0); g.addColorStop(0, 'rgba(255,140,40,0)'); g.addColorStop(1, 'rgba(255,120,30,.95)');
    c.fillStyle = g; c.fillRect(-.4 * L, -h, .55 * L, 2 * h);
    c.fillStyle = 'rgba(30,30,40,.7)'; c.beginPath(); c.arc(-.18 * L, -.05 * h, .09 * h, 0, 6.3); c.fill();
  }
  window.AQ.registerSpecies({ id: 'guppy', name: 'Guppy', sci: 'Poecilia reticulata', n: 6, L: 30, H: .3, spd: 60, z: 4, band: [.1, .45], amp: .08, school: 1, R: 130,
      top: '#9aa4aa', bot: '#e8dcc8', pat: patGuppy, eye: [.34, -.06, .06],
      tail: { tl: .6, ts: .65, fork: .1, col: 'rgba(255,90,60,.85)' }, dorsal: { x1: .1, xa: -.1, x2: -.2, dh: .5, col: 'rgba(80,140,255,.85)' }, anal: { x1: -.06, xa: -.14, x2: -.22, dh: .2, col: 'rgba(255,170,60,.8)' },
      desc: 'Guppies come from northeastern South America and the nearby islands. Males wear flashy fan tails to impress the larger, plainer females, and the young are born alive and swimming.',
      facts: ['They are livebearers, not egg-layers.', 'Females reach about 6 cm, males only about 3 cm.', 'They are nicknamed "million fish" because they breed so freely.'],
      eat: 10,
      rest: { chance: .12, where: 'plant' }, sleep: { chance: .06 }, flee: { speed: 2.6 } });
})();
