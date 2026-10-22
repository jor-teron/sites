// Code-drawn ant: gaster, petiole, thorax, head, 6 animated legs, antennae.
AF.drawAnt = function (c, x, y, ang, s, phase, col, load, moving) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  var sw = moving ? Math.sin(phase) * 0.35 : 0;
  c.strokeStyle = col; c.lineWidth = 0.18; c.beginPath();
  for (var i = 0; i < 3; i++) {
    var bx = -0.15 + i * 0.25, sg = (i % 2 ? 1 : -1) * sw;
    c.moveTo(bx, 0); c.lineTo(bx - 0.25 + sg, -0.75);
    c.moveTo(bx, 0); c.lineTo(bx - 0.25 - sg, 0.75);
  }
  c.moveTo(0.75, -0.1); c.lineTo(1.15, -0.45); c.moveTo(0.75, 0.1); c.lineTo(1.15, 0.45);
  c.stroke(); c.fillStyle = col; c.beginPath();
  c.ellipse(-0.7, 0, 0.5, 0.36, 0, 0, 7); c.ellipse(0.05, 0, 0.32, 0.2, 0, 0, 7); c.ellipse(0.62, 0, 0.26, 0.24, 0, 0, 7);
  c.fill();
  if (load) { c.fillStyle = load === 2 ? '#9ce05a' : '#8a5a2b'; c.beginPath(); c.arc(1.05, 0, 0.3, 0, 7); c.fill(); }
  c.restore();
};
