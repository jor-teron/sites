// Aquarium AQ1a: six species (data + info text) and their procedural side-view drawing (nose towards +x).
window.AQ = window.AQ || {};
(function () {
  'use strict';
  // Curved triangle fin from (x1,y1) over apex (xa,ya) back to (x2,y2).
  function fin(c, x1, y1, xa, ya, x2, y2) {
    c.moveTo(x1, y1); c.quadraticCurveTo((x1 + xa) / 2, ya * .8 + y1 * .2, xa, ya);
    c.quadraticCurveTo((xa + x2) / 2, y2 * .7 + ya * .3, x2, y2); c.closePath();
  }
  function bands(c, L, h, list, edge) {   // vertical bands (optionally black-edged)
    list.forEach(function (b) {
      if (edge) { c.fillStyle = '#111'; c.fillRect((b[0] - b[1] / 2 - .02) * L, -h, (b[1] + .04) * L, 2 * h); }
      c.fillStyle = b[2]; c.fillRect((b[0] - b[1] / 2) * L, -h, b[1] * L, 2 * h);
    });
  }
  function patNeon(c, L, h) {
    var g = c.createLinearGradient(.42 * L, 0, -.3 * L, 0); g.addColorStop(0, '#6af4ff'); g.addColorStop(1, '#2a7cff');
    c.strokeStyle = g; c.lineWidth = h * .22; c.lineCap = 'round'; c.beginPath(); c.moveTo(.4 * L, -.1 * h); c.lineTo(-.28 * L, -.03 * h); c.stroke();
    c.fillStyle = '#ee2a3c'; c.fillRect(-.4 * L, .1 * h, .52 * L, h);
  }
  function patGuppy(c, L, h) {
    var g = c.createLinearGradient(.1 * L, 0, -.36 * L, 0); g.addColorStop(0, 'rgba(255,140,40,0)'); g.addColorStop(1, 'rgba(255,120,30,.95)');
    c.fillStyle = g; c.fillRect(-.4 * L, -h, .55 * L, 2 * h);
    c.fillStyle = 'rgba(30,30,40,.7)'; c.beginPath(); c.arc(-.18 * L, -.05 * h, .09 * h, 0, 6.3); c.fill();
  }
  function patAngel(c, L, h) {
    c.save(); c.transform(1, 0, -.3, 1, 0, 0); c.fillStyle = 'rgba(25,25,30,.72)';
    [.2, -.04, -.26].forEach(function (x) { c.fillRect(x * L, -h, .07 * L, 2 * h); }); c.restore();
  }
  function patClown(c, L, h) { bands(c, L, h, [[.24, .1, '#fff'], [-.02, .13, '#fff'], [-.3, .07, '#fff']], true); }
  function patGold(c, L, h) {
    c.strokeStyle = 'rgba(255,240,190,.3)'; c.lineWidth = 1;
    for (var r = 0; r < 4; r++) for (var x = -.3; x < .3; x += .12) {
      c.beginPath(); c.arc((x + (r % 2) * .06) * L, (r - 1.5) * h * .24, .07 * L, 2, 4.3); c.stroke();
    }
  }
  function patPleco(c, L, h) {
    c.fillStyle = 'rgba(25,18,8,.55)';
    for (var i = 0; i < 16; i++) {
      c.beginPath(); c.arc((-.34 + ((i * 37) % 100) / 100 * .8) * L, (((i * 53) % 100) / 100 - .5) * h * .9, (.025 + .012 * (i % 3)) * L, 0, 6.3); c.fill();
    }
  }
  function streamers(c, L, h) {   // angelfish pelvic streamers
    c.strokeStyle = 'rgba(235,235,225,.85)'; c.lineWidth = .025 * L; c.lineCap = 'round'; c.beginPath();
    c.moveTo(.14 * L, .3 * h); c.quadraticCurveTo(.1 * L, h * 1.1, -.02 * L, h * 1.45); c.stroke();
  }

  // z: draw order (back to front); band: preferred depth (0 = surface, 1 = sand); school: boids species.
  var S = [
    { id: 'pleco', name: 'Pleco', sci: 'Hypostomus plecostomus', n: 1, L: 84, H: .27, spd: 26, z: 0, band: [.9, 1], amp: .035, school: 0,
      top: '#5a4a30', bot: '#a89a74', pat: patPleco, eye: [.34, -.1, .035],
      tail: { tl: .26, ts: .5, fork: .12, col: '#5a4a30' }, dorsal: { x1: .2, xa: -.02, x2: -.2, dh: .95, col: '#4e3f28', ribs: 1 }, anal: { x1: -.1, xa: -.2, x2: -.26, dh: .3, col: '#6a5a3c' },
      desc: 'Plecos are armoured catfish that spend their days clinging to rocks and glass, rasping algae off the surface with a sucker-like mouth. They are shy and mostly nocturnal, so this one patrols the sand floor.',
      facts: ['Its body is covered in bony plates instead of scales.', 'Common plecos can grow to about 50 cm.', 'The family has hundreds of species, all from South and Central America.'] },
    { id: 'goldfish', name: 'Goldfish', sci: 'Carassius auratus', n: 3, L: 62, H: .52, spd: 48, z: 1, band: [.3, .65], amp: .06, school: 1, R: 170,
      top: '#ffb42e', bot: '#ffe0a0', pat: patGold, eye: [.34, -.1, .05],
      tail: { tl: .55, ts: .6, fork: .35, col: 'rgba(255,130,30,.8)' }, dorsal: { x1: .22, xa: -.05, x2: -.2, dh: .55, col: 'rgba(255,125,30,.85)' }, anal: { x1: -.08, xa: -.16, x2: -.24, dh: .3, col: 'rgba(255,125,30,.85)' },
      desc: 'Goldfish were bred from a dull Asian carp in China more than a thousand years ago and are among the oldest domesticated fish. They are curious, sociable and quick to learn who feeds them.',
      facts: ['They can remember things for months, not seconds.', 'The oldest known goldfish lived about 43 years.', 'They have no true stomach and graze almost constantly.'] },
    { id: 'angelfish', name: 'Angelfish', sci: 'Pterophyllum scalare', n: 3, L: 54, H: .95, spd: 38, z: 2, band: [.35, .7], amp: .045, school: 1, R: 150,
      top: '#f0e9c8', bot: '#fffbe8', pat: patAngel, extra: streamers, eye: [.34, -.12, .045],
      tail: { tl: .3, ts: .55, fork: .3, col: 'rgba(235,230,200,.55)' }, dorsal: { x1: .12, xa: -.14, x2: -.26, dh: 1.0, col: 'rgba(235,230,200,.7)' }, anal: { x1: .06, xa: -.16, x2: -.26, dh: .95, col: 'rgba(235,230,200,.7)' },
      desc: 'Angelfish are tall, thin cichlids from the slow, weedy rivers of the Amazon basin. Their dark stripes blend with plant stems, and pairs guard their eggs on a broad leaf.',
      facts: ['They reach about 15 cm long and 20 cm tall, fins included.', 'Wild angelfish live in Amazon, Orinoco and Essequibo waters.', 'A well-kept angelfish can live around 10 years.'] },
    { id: 'clownfish', name: 'Clownfish', sci: 'Amphiprion ocellaris', n: 3, L: 42, H: .4, spd: 46, z: 3, band: [.5, .85], amp: .06, school: 1, R: 120,
      top: '#ff8a1c', bot: '#ff6a0e', pat: patClown, eye: [.36, -.08, .05],
      tail: { tl: .24, ts: .4, fork: 0, col: '#ff7a14', edge: 1 }, dorsal: { x1: .15, xa: -.05, x2: -.25, dh: .3, col: '#ff7a14', edge: 1 }, anal: { x1: -.1, xa: -.18, x2: -.26, dh: .22, col: '#ff7a14', edge: 1 },
      desc: 'Clownfish live among the stinging tentacles of sea anemones, protected by a mucus coat. Here they swim free in a fantasy tank, a sea fish among river fish.',
      facts: ['All clownfish are born male; the dominant one becomes female.', 'They grow to about 8-11 cm.', 'They live in the warm Indo-Pacific, from Southeast Asia to northern Australia.'] },
    { id: 'guppy', name: 'Guppy', sci: 'Poecilia reticulata', n: 6, L: 30, H: .3, spd: 60, z: 4, band: [.1, .45], amp: .08, school: 1, R: 130,
      top: '#9aa4aa', bot: '#e8dcc8', pat: patGuppy, eye: [.34, -.06, .06],
      tail: { tl: .6, ts: .65, fork: .1, col: 'rgba(255,90,60,.85)' }, dorsal: { x1: .1, xa: -.1, x2: -.2, dh: .5, col: 'rgba(80,140,255,.85)' }, anal: { x1: -.06, xa: -.14, x2: -.22, dh: .2, col: 'rgba(255,170,60,.8)' },
      desc: 'Guppies come from northeastern South America and the nearby islands. Males wear flashy fan tails to impress the larger, plainer females, and the young are born alive and swimming.',
      facts: ['They are livebearers, not egg-layers.', 'Females reach about 6 cm, males only about 3 cm.', 'They are nicknamed "million fish" because they breed so freely.'] },
    { id: 'neon', name: 'Neon Tetra', sci: 'Paracheirodon innesi', n: 10, L: 24, H: .24, spd: 90, z: 5, band: [.25, .6], amp: .07, school: 1, R: 140,
      top: '#27406e', bot: '#dfe6ec', pat: patNeon, eye: [.36, -.06, .07],
      tail: { tl: .3, ts: .3, fork: .3, col: 'rgba(210,235,245,.6)' }, dorsal: { x1: .08, xa: -.05, x2: -.16, dh: .3, col: 'rgba(210,235,245,.7)' }, anal: { x1: -.04, xa: -.14, x2: -.22, dh: .2, col: 'rgba(235,90,100,.7)' },
      desc: 'Neon tetras are tiny schooling fish from the blackwater streams of the upper Amazon. Their glowing blue stripe helps the group stay together in dim water.',
      facts: ['They grow to only about 3-4 cm.', 'The blue stripe is structural colour, made by light-reflecting crystals in the skin.', 'They feel safest in a school of six or more.'] }
  ];

  function render(c, s, L, ph) {
    var h = s.H * L, b = Math.sin(ph) * s.amp * L, e = s.eye;
    c.lineJoin = 'round'; c.lineWidth = Math.max(1, L * .018); c.strokeStyle = '#111';
    if (s.extra) s.extra(c, L, h, b);
    [s.dorsal, s.anal].forEach(function (f, i) {
      var sg = i ? 1 : -1; c.beginPath(); fin(c, f.x1 * L, sg * h * .38, f.xa * L, sg * h * (.45 + f.dh), f.x2 * L, sg * h * .28 + b * .3);
      c.fillStyle = f.col; c.fill(); if (f.edge) c.stroke();
      if (f.ribs) { c.save(); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.beginPath();
        for (var k = 1; k < 5; k++) { c.moveTo((f.x1 - k * .07) * L, -h * .38); c.lineTo((f.xa - k * .035) * L, -h * (.45 + f.dh * (1 - k * .08))); } c.stroke(); c.restore(); }
    });
    var t = s.tail, x0 = -.32 * L, tx = -(.34 + t.tl) * L, sp = t.ts * h;   // tail pivots at the peduncle
    c.beginPath(); c.moveTo(x0, b - .1 * h); c.quadraticCurveTo(-(.34 + t.tl * .6) * L, b * 1.3 - sp, tx, b * 1.6 - sp * 1.1);
    c.quadraticCurveTo(-(.34 + t.tl * (1 - t.fork)) * L, b * 1.6, tx, b * 1.6 + sp * 1.1);
    c.quadraticCurveTo(-(.34 + t.tl * .6) * L, b * 1.3 + sp, x0, b + .1 * h); c.closePath(); c.fillStyle = t.col; c.fill(); if (t.edge) c.stroke();
    c.beginPath(); c.moveTo(.5 * L, 0); c.bezierCurveTo(.34 * L, -.62 * h, -.1 * L, -.6 * h + b * .3, -.34 * L, -.14 * h + b);
    c.lineTo(-.34 * L, .14 * h + b); c.bezierCurveTo(-.1 * L, .6 * h + b * .3, .34 * L, .62 * h, .5 * L, 0); c.closePath();
    var g = c.createLinearGradient(0, -h * .5, 0, h * .5); g.addColorStop(0, s.top); g.addColorStop(1, s.bot); c.fillStyle = g; c.fill();
    c.save(); c.clip(); s.pat(c, L, h); c.restore();
    if (s.id === 'clownfish') c.stroke();
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(.16 * L, .12 * h, .09 * L, .04 * h + 1, .4 + Math.sin(ph * .7) * .3, 0, 6.3); c.fill();   // pectoral fin
    c.fillStyle = '#fff'; c.beginPath(); c.arc(e[0] * L, e[1] * h, e[2] * L * 1.25 + .5, 0, 6.3); c.fill();
    c.fillStyle = '#000'; c.beginPath(); c.arc(e[0] * L + e[2] * L * .2, e[1] * h, e[2] * L * .7 + .3, 0, 6.3); c.fill();
  }
  window.AQ.SPECIES = S; window.AQ.render = render;
})();
