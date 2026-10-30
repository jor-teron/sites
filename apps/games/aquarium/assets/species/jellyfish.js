// Aquarium AQQ1d: jellyfish - the bell pulses up, then it sinks slowly with tentacles trailing ('pulse' mode). Does not eat pellets.
(function () {
  'use strict';
  function draw(c, L, ph, f) {
    var p = f.pp || 0, deep = window.AQ.st.tank && window.AQ.st.tank.id === 'deepsea', bw = .42 * L * (1 + .12 * p), bh = .32 * L * (1 - .18 * p), y0 = -.28 * L, i;
    var col = deep ? 'rgba(120,230,255,' : 'rgba(255,170,210,';
    if (deep) { c.fillStyle = 'rgba(90,200,255,.12)'; c.beginPath(); c.arc(0, y0, L * .7, 0, 6.3); c.fill(); }   // deep-sea glow
    c.strokeStyle = col + '.55)'; c.lineWidth = Math.max(1, L * .025);
    for (i = 0; i < 6; i++) {   // tentacles trail and wave
      var x0 = (i / 5 - .5) * bw * 1.6; c.beginPath(); c.moveTo(x0, y0);
      for (var k = 1; k <= 6; k++) c.lineTo(x0 + Math.sin(ph * .5 + i + k * .8) * L * .06 * k / 3, y0 + k * L * .17);
      c.stroke();
    }
    c.fillStyle = col + '.35)'; c.beginPath(); c.ellipse(0, y0 + L * .2, L * .09, L * .26, 0, 0, 6.3); c.fill();   // oral arms
    c.fillStyle = col + '.6)'; c.beginPath(); c.ellipse(0, y0, bw, bh, 0, 3.1416, 0);
    for (i = 0; i <= 6; i++) c.lineTo(bw - i / 6 * 2 * bw, y0 + (i % 2 ? L * .05 : 0)); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(-bw * .3, y0 - bh * .55, bw * .3, bh * .2, -.3, 0, 6.3); c.fill();
  }
  window.AQ.registerSpecies({ id: 'jellyfish', name: 'Jellyfish', sci: 'Aurelia aurita', L: 36, H: 1.3, spd: 20, z: 1, band: [.1, .8], mode: 'pulse', verb: 'Drifting', draw: draw,
    desc: 'Jellyfish drift with the water and pulse their bell to rise. They catch tiny plankton with their tentacles, so they never eat the pellets, they just float along.',
    facts: ['Jellyfish have no brain, heart or bones.', 'They are about 95% water.', 'Jellyfish have drifted through the seas for over 500 million years.'],
    eat: 0, rest: { chance: .3, where: 'plant' }, sleep: { chance: .05 }, flee: { speed: 1.5 } });
})();
