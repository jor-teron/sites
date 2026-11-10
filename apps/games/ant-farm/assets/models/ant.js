// AF-4b side-view ant. Local +x is the head, local +y is toward the ground
// (the caller flips when the ant walks left so the legs stay world-down).
// Walk / dig / carry cycles share the same body; queen=true is a larger,
// clearer matriarch with a long gaster and folded wings.
// load: 1 soil grain, 2 food, 3 egg (carried in the mandibles).
// act: 'walk' | 'dig' | 'carry' | 'rest' (optional; inferred from load / moving).
// low: fewer leg segments and no gloss, for 300-ant colonies and lowGraphics.
AF.drawAnt = function (c, x, y, ang, s, phase, col, load, moving, queen, act, low) {
  if (!act) act = load && moving ? 'carry' : (moving ? 'walk' : 'rest');
  c.save(); c.translate(x, y); c.rotate(ang);
  if (Math.cos(ang) < -0.01) c.scale(1, -1);
  c.scale(s, s);
  var walk = (act === 'walk' || act === 'carry') && moving, dig = act === 'dig';
  var sw = walk ? Math.sin(phase) : (dig ? Math.sin(phase * 1.4) * 0.45 : 0);
  var bob = walk ? Math.abs(Math.sin(phase)) * 0.06 : (dig ? Math.sin(phase * 2) * 0.1 : 0);
  c.translate(0, bob);
  if (queen) {
    c.strokeStyle = col; c.lineWidth = 0.14; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    var i, qsw = Math.sin(phase * 0.5) * 0.12;
    for (i = 0; i < 3; i++) {
      var hxL = -0.05 + i * 0.22;
      c.moveTo(hxL, 0.12); c.lineTo(hxL + (i - 1) * 0.08 + qsw * (i % 2 ? 1 : -1), 0.4);
      c.lineTo(hxL + (i - 1) * 0.16 + qsw * (i % 2 ? 1 : -1), 0.7);
    }
    c.moveTo(0.7, -0.18); c.quadraticCurveTo(1.05, -0.7, 1.4, -0.5);
    c.moveTo(0.7, -0.1); c.quadraticCurveTo(1.15, -0.35, 1.45, -0.12);
    c.stroke();
    c.fillStyle = 'rgba(210,220,245,.4)'; c.beginPath();
    c.ellipse(-0.2, -0.28, 0.95, 0.16, 0.2, 0, 7); c.ellipse(0.05, -0.2, 0.7, 0.1, 0.12, 0, 7); c.fill();
    c.fillStyle = col; c.beginPath();
    c.ellipse(-0.95, 0.0, 0.95, 0.5, -0.1, 0, 7);       // long gaster
    c.ellipse(-0.05, 0.02, 0.16, 0.1, 0, 0, 7);
    c.ellipse(0.28, -0.04, 0.4, 0.26, 0, 0, 7);          // thorax
    c.ellipse(0.78, -0.08, 0.34, 0.3, 0.2, 0, 7);        // head
    c.fill();
    if (!low) {
      c.fillStyle = 'rgba(255,230,220,.28)'; c.beginPath();
      c.ellipse(-0.85, -0.22, 0.4, 0.14, -0.3, 0, 7);
      c.ellipse(0.85, -0.18, 0.12, 0.08, 0, 0, 7); c.fill();
    }
    c.restore(); return;
  }
  var gx = -0.72, gr = 0.48, hx = 0.72;

  // legs: 3 pairs under the thorax, tripod gait; dig = braced + scratch
  c.strokeStyle = col; c.lineWidth = queen ? 0.16 : 0.13; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  var i, hxLeg, swing, foot, knee;
  for (i = 0; i < 3; i++) {
    hxLeg = -0.08 + i * 0.2;
    swing = (i % 2 ? 1 : -1) * sw * (dig ? 0.35 : 0.55);
    knee = 0.42 + (dig && i === 0 ? 0.12 : 0);
    foot = 0.78 + swing * 0.25;
    c.moveTo(hxLeg, 0.08);
    c.lineTo(hxLeg + swing * 0.35 + (i - 1) * 0.08, knee);
    c.lineTo(hxLeg + swing * 0.7 + (i - 1) * 0.16, foot);
    if (!low) {
      // far-side legs, slightly lighter lift
      c.moveTo(hxLeg, 0.04);
      c.lineTo(hxLeg - swing * 0.25 + (i - 1) * 0.06, 0.32);
      c.lineTo(hxLeg - swing * 0.55 + (i - 1) * 0.12, 0.62);
    }
  }
  // antennae: from the head, twitching; more so when digging
  var tw = Math.sin(phase * 0.7) * (0.08 + (dig ? 0.08 : 0));
  c.moveTo(hx - 0.02, -0.12);
  c.quadraticCurveTo(hx + 0.35, -0.55, hx + 0.7 + tw, -0.42);
  c.moveTo(hx - 0.02, -0.04);
  c.quadraticCurveTo(hx + 0.4, -0.28, hx + 0.78 - tw, -0.08);
  c.stroke();

  if (queen) {
    c.fillStyle = 'rgba(220,230,255,.4)'; c.beginPath();
    c.ellipse(-0.25, -0.22, 0.85, 0.18, 0.18, 0, 7);
    c.ellipse(-0.15, -0.12, 0.7, 0.12, 0.1, 0, 7); c.fill();
  }

  // body: gaster, petiole, thorax, head
  c.fillStyle = col; c.beginPath();
  c.ellipse(gx, -0.02, gr, gr * (queen ? 0.62 : 0.7), queen ? -0.12 : -0.08, 0, 7);
  c.ellipse(-0.1, 0, 0.12, 0.09, 0, 0, 7);
  c.ellipse(0.18, -0.04, queen ? 0.38 : 0.3, queen ? 0.24 : 0.2, 0, 0, 7);
  c.ellipse(hx, -0.06, queen ? 0.36 : 0.28, queen ? 0.3 : 0.24, 0.15, 0, 7);
  c.fill();

  if (!low && s >= 3.2) {
    c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath();
    c.ellipse(gx + gr * 0.15, -gr * 0.35, gr * 0.45, gr * 0.16, -0.3, 0, 7);
    c.ellipse(hx + 0.05, -0.16, 0.12, 0.07, 0, 0, 7);
    c.ellipse(0.22, -0.12, 0.12, 0.05, 0, 0, 7);
    c.fill();
  }
  // mandible load
  if (load) {
    var lx = hx + 0.42, ly = 0.04, r = load === 3 ? 0.26 : 0.3;
    c.fillStyle = load === 2 ? '#9ce05a' : load === 3 ? '#fffbea' : '#8a5a2b';
    c.beginPath();
    if (load === 3) c.ellipse(lx, ly, r * 0.9, r * 0.65, 0.4, 0, 7);
    else c.arc(lx, ly, r, 0, 7);
    c.fill();
  }
  c.restore();
};
