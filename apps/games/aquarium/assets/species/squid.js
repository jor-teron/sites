// Aquarium AQQ1e: squid - coasts, then squirts forward in jet bursts ('jet' mode); arms trail behind.
(function () {
  'use strict';
  function draw(c, L, ph, f) {
    var p = f.pp || 0, w = L * .13 * (1 - .25 * p), i;
    c.strokeStyle = 'rgba(230,150,160,.85)'; c.lineCap = 'round'; c.lineWidth = Math.max(1, L * .03);
    for (i = 0; i < 6; i++) { var y = (i / 5 - .5) * w * 1.2; c.beginPath(); c.moveTo(-L * .15, y); c.quadraticCurveTo(-L * .32, y * (1.3 - p) + Math.sin(ph + i) * L * .04, -L * (.48 + (i % 2) * .06 - p * .08), y * (1.6 - p) + Math.sin(ph * .8 + i) * L * .05); c.stroke(); }
    c.fillStyle = '#f0a8b0'; c.beginPath(); c.moveTo(L * .52, 0); c.lineTo(L * .4, -w * 1.5); c.lineTo(L * .3, -w); c.lineTo(L * .3, w); c.lineTo(L * .4, w * 1.5); c.fill();   // tail fins
    var g = c.createLinearGradient(0, -w, 0, w); g.addColorStop(0, '#e98a96'); g.addColorStop(1, '#fbd6da');
    c.fillStyle = g; c.beginPath(); c.moveTo(L * .5, 0); c.quadraticCurveTo(L * .1, -w * 1.2, -L * .17, -w * .8); c.lineTo(-L * .17, w * .8); c.quadraticCurveTo(L * .1, w * 1.2, L * .5, 0); c.fill();
    c.fillStyle = 'rgba(160,40,70,.35)'; for (i = 0; i < 5; i++) { c.beginPath(); c.arc(L * (.3 - i * .09), (i % 2 - .5) * w * .7, L * .02 + .3, 0, 6.3); c.fill(); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(-L * .12, -w * .2, L * .05 + .5, 0, 6.3); c.fill(); c.fillStyle = '#123'; c.beginPath(); c.arc(-L * .13, -w * .2, L * .03 + .4, 0, 6.3); c.fill();
  }
  window.AQ.registerSpecies({ id: 'squid', name: 'Squid', sci: 'Loligo', L: 46, H: .32, spd: 40, z: 2, band: [.15, .75], mode: 'jet', verb: 'Jetting', draw: draw,
    desc: 'Squid squirt water out of a funnel to shoot through the sea in quick bursts, steering with the fins on their pointed mantle.',
    facts: ['Squid have three hearts and blue blood.', 'Many can squirt ink to hide.', 'The giant squid has eyes as big as dinner plates.'],
    eat: 14, rest: { chance: .25, where: 'plant' }, sleep: { chance: .08 }, flee: { speed: 2 } });
})();
