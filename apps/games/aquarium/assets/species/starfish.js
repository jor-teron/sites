// Aquarium AQQ1d: starfish - creeps very slowly over the sand ('crawl' mode), mostly still.
(function () {
  'use strict';
  function draw(c, L, ph) {
    var R = L * .5, r = L * .2, a0 = -1.5708 + Math.sin(ph * .1) * .08, i, a;
    c.beginPath();
    for (i = 0; i < 10; i++) { a = a0 + i * .6283; var q = i % 2 ? r : R * (1 + Math.sin(ph * .3 + i) * .03); c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * q, Math.sin(a) * q); }
    c.closePath(); c.fillStyle = '#ff8a3d'; c.fill(); c.lineJoin = 'round'; c.strokeStyle = '#c95a1c'; c.lineWidth = Math.max(1, L * .04); c.stroke();
    c.fillStyle = '#ffd0a0'; for (i = 0; i < 5; i++) { a = a0 + i * 1.2566; for (var k = 1; k < 4; k++) { c.beginPath(); c.arc(Math.cos(a) * R * k / 4.3, Math.sin(a) * R * k / 4.3, L * .025 + .4, 0, 6.3); c.fill(); } }
  }
  window.AQ.registerSpecies({ id: 'starfish', name: 'Starfish', sci: 'Asteroidea', L: 30, H: 1, spd: 6, z: 5, band: [1, 1], mode: 'crawl', floor: 1, pause: .8, verb: 'Crawling', draw: draw,
    desc: 'Starfish (sea stars) glide very slowly on hundreds of tiny tube feet. They spend most of the day still, and slide over to food that lands near them.',
    facts: ['A starfish has no brain and no blood.', 'Many can regrow a lost arm.', 'Each arm tip has a simple eye spot.'],
    eat: 10, rest: { chance: .5, where: 'sand' }, sleep: { chance: .15 }, flee: { speed: 1.5 } });
})();
