/* Turbo Lap — car 10: Hyper-wing prototype (TLQ1a). Futuristic: a slim armoured body with a central fin, a full-width glowing rear
   wing on tall endplates (tilts with the steering), a glowing tail-light bar, ion thrusters and glowing wheel rims. The glow uses the
   livery accent colour. Glows are cheap radial gradients, drawn only at detail. */
window.TL = window.TL || {};
(() => {
  const A = TL.carArt, shade = A.shade;

  // '#rrggbb' -> 'r,g,b'
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255); };

  function draw(c, cx, by, w, color, o) {
    const K = A.kit(c, cx, by, w, o), l = K.lean / w, acc = o.accent || '#7fe8ff', ar = rgb(/^#[0-9a-f]{6}$/i.test(acc) ? acc : '#7fe8ff');
    const detail = o.detail;
    A.shadow(K, 0.58);
    A.tyre(K, 0.0, 0.25, 0.36, 0, 0.05); A.tyre(K, 0.75, 1.0, 0.36, 0, 0.05);
    c.fillStyle = acc; c.globalAlpha = 0.9;                                       // glowing wheel rims
    c.fillRect(K.X(0.235), K.Y(0.3), w * 0.012, K.h * 0.22); c.fillRect(K.X(0.753), K.Y(0.3), w * 0.012, K.h * 0.22); c.globalAlpha = 1;
    // body: slim armoured wedge + central fin
    A.poly(K, [[0.1, 0.14], [0.9, 0.14], [0.88, 0.4], [0.72, 0.56], [0.28, 0.56], [0.12, 0.4]], A.paint(K, color, 0.56, 0.14));
    A.poly(K, [[0.1, 0.14], [0.9, 0.14], [0.9, 0.2], [0.1, 0.2]], '#15171c');
    A.poly(K, [[0.43, 0.56], [0.57, 0.56], [0.545 + l * 0.8, 0.8], [0.455 + l * 0.8, 0.8]], A.paint(K, color, 0.8, 0.56));
    c.strokeStyle = acc; c.lineWidth = Math.max(1, w * 0.008); c.beginPath();    // glow lines down the shoulders
    c.moveTo(K.X(0.15), K.Y(0.38)); c.lineTo(K.X(0.3), K.Y(0.52)); c.moveTo(K.X(0.85), K.Y(0.38)); c.lineTo(K.X(0.7), K.Y(0.52));
    c.moveTo(K.X(0.5), K.Y(0.56)); c.lineTo(K.X(0.5 + l * 0.8), K.Y(0.8)); c.stroke();
    // thrusters (ion engines) with plate between
    [0.3, 0.7].forEach(fx => {
      A.lamp(K, fx, 0.34, 0.075, '#0b0b0e'); A.lamp(K, fx, 0.34, 0.052, '#1f2430');
      A.lamp(K, fx, 0.34, 0.03, acc);
      if (detail) A.glow(K, fx, 0.34, 0.1, ar, 0.55);
    });
    A.plate(K, 0.4, 0.31, 0.2, 0.09);
    // tail-light bar across the rear
    A.glowOn(K, '#ff2a2a'); c.fillStyle = A.tailColor(K); A.rr(K, 0.18, 0.47, 0.64, 0.035, 0.012); c.fill(); A.glowOff(K);
    if (detail) { A.glow(K, 0.2, 0.485, 0.08, '255,40,40', o.braking ? 0.9 : 0.4); A.glow(K, 0.8, 0.485, 0.08, '255,40,40', o.braking ? 0.9 : 0.4); }
    // wing supports, then the full-width wing with a glowing leading edge and endplates
    const s = l * 0.6;
    c.fillStyle = '#1b1d22'; A.poly(K, [[0.27, 0.56], [0.31, 0.56], [0.31 + s, 0.86], [0.27 + s, 0.86]], c.fillStyle); A.poly(K, [[0.69, 0.56], [0.73, 0.56], [0.73 + s, 0.86], [0.69 + s, 0.86]], c.fillStyle);
    const wx = f => 0.03 + f * 0.94;                                              // the wing spans the car, inside the box even when tilted
    A.poly(K, [[wx(0) + s, 0.97], [wx(1) + s, 0.97], [wx(1) + s, 0.84], [wx(0) + s, 0.84]], A.vgrad(K, 0.97, 0.84, [[0, shade(color, 0.1)], [0.5, shade(color, -0.45)], [1, '#14161b']]));
    A.poly(K, [[wx(0) + s, 0.975], [wx(1) + s, 0.975], [wx(1) + s, 0.955], [wx(0) + s, 0.955]], acc);
    if (detail) { A.glow(K, wx(0.2) + s, 0.965, 0.09, ar, 0.5); A.glow(K, wx(0.8) + s, 0.965, 0.09, ar, 0.5); A.glow(K, 0.5 + s, 0.965, 0.12, ar, 0.4); }
    c.fillStyle = '#16181d';
    A.poly(K, [[wx(0) + s, 0.995], [wx(0.045) + s, 0.995], [wx(0.04) + s * 0.4, 0.5], [wx(0.005) + s * 0.4, 0.5]], c.fillStyle);
    A.poly(K, [[wx(0.955) + s, 0.995], [wx(1) + s, 0.995], [wx(0.995) + s * 0.4, 0.5], [wx(0.96) + s * 0.4, 0.5]], c.fillStyle);
    A.glowOn(K, '#ff2a2a'); c.fillStyle = A.tailColor(K);
    A.rr(K, wx(0.012) + s * 0.6, 0.88, 0.02, 0.28, 0.006); c.fill(); A.rr(K, wx(0.968) + s * 0.6, 0.88, 0.02, 0.28, 0.006); c.fill(); A.glowOff(K);
    A.flames(K, [[0.3, 0.34], [0.7, 0.34]], 1.35);
  }

  TL.carSet.register(TL.makeCar({ id: 'proto', name: 'Hyper-Wing', short: 'Hyper', blurb: 'Futuristic, huge glowing wing', draw }));
})();
