// AFV1 code-drawn ant. Drawn in local units (body ~2.4 long) after scale(s).
// Gaster, petiole, thorax, bigger head, 6 jointed two-segment legs, curved
// antennae and a cheap glossy highlight (flat translucent ellipses, no gradients
// or shadowBlur, so hundreds of ants stay fast on weak phones).
// queen=true adds small folded wings and a larger gaster.
AF.drawAnt = function (c, x, y, ang, s, phase, col, load, moving, queen) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  var sw = moving ? Math.sin(phase) * 0.3 : 0, gx = queen ? -0.85 : -0.7, gr = queen ? 0.66 : 0.5;
  // legs: hip on thorax -> knee pushed outward -> foot; tripod gait alternates sides
  c.strokeStyle = col; c.lineWidth = 0.13; c.lineJoin = 'round'; c.beginPath();
  for (var i = 0; i < 3; i++) {
    var hx = -0.12 + i * 0.17, swing = (i % 2 ? 1 : -1) * sw, kx = hx + (i - 1) * 0.3;
    c.moveTo(hx, -0.1); c.lineTo(kx + swing * .5, -0.5); c.lineTo(kx - 0.22 + (i - 1) * .25 + swing, -0.85);
    c.moveTo(hx, 0.1); c.lineTo(kx - swing * .5, 0.5); c.lineTo(kx - 0.22 + (i - 1) * .25 - swing, 0.85);
  }
  // antennae: bent (elbowed) curves that twitch slightly
  var tw = Math.sin(phase * 0.7) * 0.08;
  c.moveTo(0.8, -0.12); c.quadraticCurveTo(1.05, -0.5, 1.35 + tw, -0.38);
  c.moveTo(0.8, 0.12); c.quadraticCurveTo(1.05, 0.5, 1.35 - tw, 0.38);
  c.stroke();
  // wings (queen): folded over the back, translucent
  if (queen) { c.fillStyle = 'rgba(220,230,255,.45)'; c.beginPath();
    c.ellipse(-0.45, -0.18, 0.7, 0.2, 0.15, 0, 7); c.ellipse(-0.45, 0.18, 0.7, 0.2, -0.15, 0, 7); c.fill(); }
  // body
  c.fillStyle = col; c.beginPath();
  c.ellipse(gx, 0, gr, gr * 0.74, 0, 0, 7); c.ellipse(-0.12, 0, 0.12, 0.09, 0, 0, 7);
  c.ellipse(0.12, 0, 0.3, 0.19, 0, 0, 7); c.ellipse(0.66, 0, 0.3, 0.27, 0, 0, 7);
  c.fill();
  // gloss: one shared path of small highlights (skipped when the ant is tiny on
  // screen, where it would be invisible anyway - keeps 400-ant colonies fast)
  if (s >= 4) { c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath();
  c.ellipse(gx + gr * .2, -gr * .35, gr * .45, gr * .16, -0.2, 0, 7);
  c.ellipse(0.72, -0.12, 0.12, 0.06, 0, 0, 7); c.ellipse(0.16, -0.08, 0.12, 0.04, 0, 0, 7);
  c.fill(); }
  if (load) { c.fillStyle = load === 2 ? '#9ce05a' : '#8a5a2b'; c.beginPath(); c.arc(1.12, 0, 0.3, 0, 7); c.fill(); }
  c.restore();
};
