// Aquarium AQQ1e: octopus - crawls over the sand and rocks, jets up when startled, and slowly shifts colour ('octo' mode).
(function () {
  'use strict';
  function draw(c, L, ph, f) {
    var h = f.hue || 0, p = f.pp || 0, col = 'hsl(' + (18 - h * 14) + ',' + (60 + h * 20) + '%,' + (52 - h * 8) + '%)', i;
    c.strokeStyle = col; c.lineCap = 'round';
    for (i = 0; i < 8; i++) {   // eight curling arms, bunched together when jetting
      var x0 = (i / 7 - .5) * L * .4, dir = x0 < 0 ? -1 : 1, sp = (1 - p * .7) * (.4 + Math.abs(i / 7 - .5)), wv = Math.sin(ph * .7 + i * 1.3) * L * .05;
      c.lineWidth = Math.max(1.5, L * .07); c.beginPath(); c.moveTo(x0, L * .05); c.quadraticCurveTo(x0 + dir * sp * L * .3 + wv, L * .25, x0 + dir * sp * L * .55, L * (.3 - p * .1) - Math.abs(wv)); c.stroke();
    }
    c.fillStyle = col; c.beginPath(); c.ellipse(0, -L * .12, L * .26, L * .25 * (1 + p * .15), 0, 0, 6.3); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)'; for (i = 0; i < 4; i++) { c.beginPath(); c.arc(-L * .1 + i * L * .07, -L * .25 + (i % 2) * L * .06, L * .025 + .4, 0, 6.3); c.fill(); }
    for (i = -1; i <= 1; i += 2) { c.fillStyle = '#fff4d0'; c.beginPath(); c.arc(i * L * .1, -L * .03, L * .05 + .5, 0, 6.3); c.fill(); c.fillStyle = '#111'; c.fillRect(i * L * .1 - L * .03, -L * .04, L * .06, L * .02 + .6); }
  }
  window.AQ.registerSpecies({ id: 'octopus', name: 'Octopus', sci: 'Octopus vulgaris', L: 44, H: .9, spd: 18, z: 4, band: [1, 1], mode: 'octo', floor: 1, pause: .6, verb: 'Crawling', draw: draw,
    desc: 'Octopuses crawl over rocks on eight arms lined with suckers. If something startles them they squirt water and jet away, and their skin can change colour in a blink.',
    facts: ['An octopus has three hearts and blue blood.', 'Each arm can taste what it touches.', 'With no bones, it can squeeze through any gap bigger than its beak.'],
    eat: 14, rest: { chance: .35, where: 'sand' }, sleep: { chance: .12 }, flee: { speed: 1.5 } });
})();
