/* Turbo Lap — car 4: Rally hatch (TLQ1a). A small hatchback: tall near-vertical tailgate glass with a wiper, a roof scoop, chunky
   knobby tyres with black mud flaps, narrow tall tail lights and a red tow loop. Livery = a band across the tailgate. */
window.TL = window.TL || {};
(() => {
  const A = TL.carArt, shade = A.shade;

  function draw(c, cx, by, w, color, o) {
    const K = A.kit(c, cx, by, w, o), l = K.lean / w;
    A.shadow(K, 0.55);
    A.tyre(K, 0.01, 0.23, 0.4, 0, 0.04, true); A.tyre(K, 0.77, 0.99, 0.4, 0, 0.04, true);
    // roof and tall glasshouse
    A.poly(K, [[0.14, 0.46], [0.21 + l, 0.95], [0.79 + l, 0.95], [0.86, 0.46]], A.vgrad(K, 0.95, 0.46, [[0, shade(color, -0.2)], [1, shade(color, -0.05)]]));
    A.poly(K, [[0.19, 0.5], [0.255 + l, 0.9], [0.745 + l, 0.9], [0.81, 0.5]], A.glass(K, 0.9, 0.5));
    if (o.detail) A.poly(K, [[0.3 + l, 0.88], [0.4 + l, 0.88], [0.3, 0.52], [0.23, 0.52]], 'rgba(255,255,255,0.18)');
    // roof lip and scoop
    A.poly(K, [[0.17 + l, 0.955], [0.83 + l, 0.955], [0.84 + l, 0.925], [0.16 + l, 0.925]], shade(color, -0.35));
    A.poly(K, [[0.39 + l, 0.955], [0.43 + l, 0.995], [0.57 + l, 0.995], [0.61 + l, 0.955]], shade(color, -0.1));
    c.fillStyle = '#0c0c0c'; c.fillRect(K.X(0.44 + l), K.Y(0.985), w * 0.12, K.h * 0.02);
    // wiper
    c.strokeStyle = '#111'; c.lineWidth = Math.max(1, w * 0.01); c.beginPath(); c.moveTo(K.X(0.5), K.Y(0.53)); c.lineTo(K.X(0.64), K.Y(0.7)); c.stroke();
    // tailgate body
    c.fillStyle = A.paint(K, color, 0.52, 0.12); A.rr(K, 0.08, 0.52, 0.84, 0.4, 0.06); c.fill();
    if (o.accent) { c.fillStyle = o.accent; c.fillRect(K.X(0.1), K.Y(0.47), w * 0.8, K.h * 0.05); }
    // tall tail lights
    A.glowOn(K); c.fillStyle = A.tailColor(K); A.rr(K, 0.06, 0.5, 0.085, 0.3, 0.015); c.fill(); A.rr(K, 0.855, 0.5, 0.085, 0.3, 0.015); c.fill(); A.glowOff(K);
    if (o.detail) { c.fillStyle = 'rgba(255,200,120,0.8)'; c.fillRect(K.X(0.075), K.Y(0.47), w * 0.055, K.h * 0.04); c.fillRect(K.X(0.87), K.Y(0.47), w * 0.055, K.h * 0.04); }
    A.plate(K, 0.38, 0.38, 0.24, 0.11);
    // bumper, tow loop, exhaust, mud flaps
    c.fillStyle = '#1e1e1e'; A.rr(K, 0.05, 0.19, 0.9, 0.1, 0.03); c.fill();
    c.strokeStyle = '#d6322d'; c.lineWidth = Math.max(1, w * 0.016); c.beginPath(); c.ellipse(K.X(0.3), K.Y(0.075), w * 0.035, K.h * 0.05, 0, 0, A.TAU); c.stroke();
    A.pipes(K, [[0.72, 0.1]], 0.032, '#8a8a8a');
    c.fillStyle = '#0d0d0d'; A.rr(K, 0.04, 0.27, 0.13, 0.25, 0.012); c.fill(); A.rr(K, 0.83, 0.27, 0.13, 0.25, 0.012); c.fill();
    if (o.accent) { c.fillStyle = o.accent; c.fillRect(K.X(0.065), K.Y(0.17), w * 0.08, K.h * 0.035); c.fillRect(K.X(0.855), K.Y(0.17), w * 0.08, K.h * 0.035); }
    A.flames(K, [[0.72, 0.1]], 1.0);
  }

  TL.carSet.register(TL.makeCar({ id: 'rally', name: 'Rally Hatch', short: 'Rally', blurb: 'Small, scooped, mud flaps', draw }));
})();
