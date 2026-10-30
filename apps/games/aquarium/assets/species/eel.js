// Aquarium AQQ1d: moray eel - long body of segments waving like a snake ('snake' mode); hides in rock dens and peeks out.
(function () {
  'use strict';
  function draw(c, L, ph, f) {
    var N = 14, i, pts = [];
    for (i = 0; i <= N; i++) { var q = i / N; pts.push([(.5 - q) * L, Math.sin(ph * .6 - q * 6) * L * .06 * (q + .25)]); }
    c.lineCap = 'round';
    for (i = N; i > 0; i--) {   // tail first so the head sits on top
      var a = pts[i], b = pts[i - 1], w = L * .11 * (1 - .65 * i / N);
      c.strokeStyle = '#4e5e24'; c.lineWidth = w + 2; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      c.strokeStyle = i % 2 ? '#7d8f36' : '#73852f'; c.lineWidth = w; c.stroke();
      if (i % 3 === 1) { c.fillStyle = '#d8d070'; c.beginPath(); c.arc(b[0], b[1] - w * .15, w * .14, 0, 6.3); c.fill(); }
    }
    var h = pts[0]; c.fillStyle = '#7d8f36'; c.beginPath(); c.ellipse(h[0] - L * .02, h[1], L * .07, L * .055, 0, 0, 6.3); c.fill();
    c.strokeStyle = '#2c3412'; c.lineWidth = 1; c.beginPath(); c.moveTo(h[0] + L * .04, h[1] + L * .015); c.lineTo(h[0] - L * .03, h[1] + L * .02 + Math.abs(Math.sin(ph * .3)) * L * .015); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(h[0], h[1] - L * .02, L * .016 + .6, 0, 6.3); c.fill(); c.fillStyle = '#000'; c.beginPath(); c.arc(h[0] + .4, h[1] - L * .02, L * .009 + .4, 0, 6.3); c.fill();
  }
  window.AQ.registerSpecies({ id: 'eel', name: 'Moray eel', sci: 'Gymnothorax', L: 100, H: .14, spd: 30, z: 0, band: [.65, .95], mode: 'snake', hide: 1, tilt: .5, draw: draw,
    verb: function (f) { return f.hide ? 'Hiding' : 'Swimming'; },
    desc: 'Moray eels spend the day tucked into rocky dens with just their head peeking out, then slide out like a ribbon to look around.',
    facts: ['Morays open and close their mouth to pump water over their gills.', 'They have a second set of jaws in their throat.', 'Some live 30 years or more.'],
    eat: 18, rest: { chance: .3, where: 'sand' }, sleep: { chance: .12 }, flee: { speed: 2 } });
})();
