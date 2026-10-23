/* Turbo Lap — car 3: Formula racer (TLQ1a). Open wheels (big rear slicks, suspension arms), a slim engine cover with an airbox and
   helmet, a big two-element rear wing on tall endplates (leans with the steering), a rain light and a single exhaust. */
window.TL = window.TL || {};
(() => {
  const A = TL.carArt, shade = A.shade;

  function draw(c, cx, by, w, color, o) {
    const K = A.kit(c, cx, by, w, o), l = K.lean / w, dark = shade(color, -0.5);
    A.shadow(K, 0.58);
    // rear slicks and suspension arms
    A.tyre(K, 0, 0.27, 0.52, 0, 0.05); A.tyre(K, 0.73, 1, 0.52, 0, 0.05);
    c.strokeStyle = '#2a2a2a'; c.lineWidth = Math.max(1, w * 0.016);
    c.beginPath();
    c.moveTo(K.X(0.28), K.Y(0.42)); c.lineTo(K.X(0.37), K.Y(0.3)); c.moveTo(K.X(0.28), K.Y(0.22)); c.lineTo(K.X(0.37), K.Y(0.24));
    c.moveTo(K.X(0.72), K.Y(0.42)); c.lineTo(K.X(0.63), K.Y(0.3)); c.moveTo(K.X(0.72), K.Y(0.22)); c.lineTo(K.X(0.63), K.Y(0.24)); c.stroke();
    // side pods + engine cover
    c.fillStyle = A.paint(K, color, 0.38, 0.12); A.rr(K, 0.27, 0.38, 0.46, 0.26, 0.04); c.fill();
    A.poly(K, [[0.33, 0.12], [0.67, 0.12], [0.6, 0.62], [0.4, 0.62]], A.paint(K, color, 0.62, 0.12));
    c.fillStyle = 'rgba(255,255,255,0.16)'; A.poly(K, [[0.44, 0.6], [0.48, 0.6], [0.44, 0.2], [0.41, 0.2]], c.fillStyle);
    // airbox and helmet behind the wing
    A.poly(K, [[0.44, 0.62], [0.56, 0.62], [0.55 + l * 0.6, 0.8], [0.45 + l * 0.6, 0.8]], shade(color, -0.2));
    A.lamp(K, 0.5 + l * 0.6, 0.78, 0.055, '#e9e9e9');
    c.fillStyle = '#16202e'; c.fillRect(K.X(0.46 + l * 0.6), K.Y(0.8), w * 0.08, K.h * 0.025);
    // diffuser, exhaust and rain light
    c.fillStyle = '#1a1a1a'; A.rr(K, 0.3, 0.2, 0.4, 0.1, 0.02); c.fill();
    c.strokeStyle = '#3a3a3a'; c.lineWidth = Math.max(1, w * 0.006); c.beginPath();
    for (let i = 1; i < 6; i++) { c.moveTo(K.X(0.3 + i * 0.0667), K.Y(0.2)); c.lineTo(K.X(0.3 + i * 0.0667), K.Y(0.1)); } c.stroke();
    A.pipes(K, [[0.5, 0.26]], 0.03, '#8a8a8a');
    A.glowOn(K); c.fillStyle = A.tailColor(K); A.rr(K, 0.455, 0.5, 0.09, 0.09, 0.012); c.fill(); A.glowOff(K);
    A.plate(K, 0.44, 0.42, 0.12, 0.1, '27');
    A.flames(K, [[0.5, 0.26]], 1.0);
    // rear wing: supports, main plane, flap, endplates (tilted by the steering)
    c.fillStyle = '#242424'; c.fillRect(K.X(0.46), K.Y(0.86), w * 0.08, K.h * 0.28);
    const s = l * 0.5;
    A.poly(K, [[0.1 + s, 0.86], [0.9 + s, 0.86], [0.9 + s, 0.78], [0.1 + s, 0.78]], A.vgrad(K, 0.86, 0.78, [[0, shade(color, -0.3)], [1, dark]]));
    A.poly(K, [[0.08 + s, 0.99], [0.92 + s, 0.99], [0.92 + s, 0.89], [0.08 + s, 0.89]], A.vgrad(K, 0.99, 0.89, [[0, shade(color, 0.2)], [1, color]]));
    if (o.accent) { c.fillStyle = o.accent; c.fillRect(K.X(0.08 + s), K.Y(0.99), w * 0.84, K.h * 0.025); }
    [[0.04, 0.0], [0.93, 0.0]].forEach(e => {
      A.poly(K, [[e[0] + s, 0.99], [e[0] + 0.03 + s, 0.99], [e[0] + 0.03 + s * 0.4, 0.58], [e[0] + s * 0.4, 0.58]], A.vgrad(K, 0.99, 0.58, [[0, shade(color, -0.2)], [1, dark]]));
    });
    A.glowOn(K); c.fillStyle = A.tailColor(K);
    A.rr(K, 0.045 + s * 0.6, 0.82, 0.02, 0.16, 0.006); c.fill(); A.rr(K, 0.935 + s * 0.6, 0.82, 0.02, 0.16, 0.006); c.fill(); A.glowOff(K);
  }

  TL.carSet.register(TL.makeCar({ id: 'formula', name: 'Formula Racer', short: 'Formula', blurb: 'Open wheels, big rear wing', draw }));
})();
