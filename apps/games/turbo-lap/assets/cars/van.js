/* Turbo Lap — car 6: Van (TLQ1a). A boxy delivery van: a tall flat back with two rear doors (a seam, little windows and handles),
   tall vertical tail lights, roof ribs, a step bumper. Livery = a belt stripe across the doors. */
window.TL = window.TL || {};
(() => {
  const A = TL.carArt, shade = A.shade;

  function draw(c, cx, by, w, color, o) {
    const K = A.kit(c, cx, by, w, o), l = K.lean / w;
    A.shadow(K, 0.55);
    A.tyre(K, 0.08, 0.27, 0.3, 0, 0.04); A.tyre(K, 0.73, 0.92, 0.3, 0, 0.04);
    // the box (the top leans with the steering)
    A.poly(K, [[0.06, 0.14], [0.065 + l, 0.9], [0.1 + l, 0.985], [0.9 + l, 0.985], [0.935 + l, 0.9], [0.94, 0.14]], A.vgrad(K, 0.985, 0.14, [[0, shade(color, 0.22)], [0.3, color], [1, shade(color, -0.35)]]));
    A.poly(K, [[0.12 + l, 0.985], [0.88 + l, 0.985], [0.89 + l, 0.945], [0.11 + l, 0.945]], shade(color, -0.22));    // roof panel
    c.strokeStyle = shade(color, -0.3); c.lineWidth = Math.max(1, w * 0.007); c.beginPath();
    c.moveTo(K.X(0.5), K.Y(0.2)); c.lineTo(K.X(0.5 + l), K.Y(0.945));                                                 // door seam
    c.stroke();
    // rear door windows
    const win = (x0, x1) => A.poly(K, [[x0, 0.62], [x0 + 0.008 + l * 0.9, 0.9], [x1 + 0.008 + l * 0.9, 0.9], [x1, 0.62]], A.glass(K, 0.9, 0.62));
    win(0.13, 0.465); win(0.535, 0.87);
    if (o.detail) A.poly(K, [[0.2 + l, 0.88], [0.27 + l, 0.88], [0.2, 0.64], [0.15, 0.64]], 'rgba(255,255,255,0.16)');
    if (o.accent) { c.fillStyle = o.accent; c.fillRect(K.X(0.06), K.Y(0.57), w * 0.88, K.h * 0.07); }
    c.fillStyle = shade(color, -0.45);
    A.rr(K, 0.435, 0.44, 0.03, 0.08, 0.008); c.fill(); A.rr(K, 0.535, 0.44, 0.03, 0.08, 0.008); c.fill();             // handles
    // tail lights, plate, bumper
    A.glowOn(K); c.fillStyle = A.tailColor(K); A.rr(K, 0.04, 0.76, 0.06, 0.34, 0.012); c.fill(); A.rr(K, 0.9, 0.76, 0.06, 0.34, 0.012); c.fill(); A.glowOff(K);
    A.plate(K, 0.38, 0.38, 0.24, 0.11);
    c.fillStyle = '#242424'; A.rr(K, 0.03, 0.2, 0.94, 0.12, 0.03); c.fill();
    c.fillStyle = '#4a4a4a'; c.fillRect(K.X(0.08), K.Y(0.25), w * 0.84, K.h * 0.015);
    A.pipes(K, [[0.78, 0.09]], 0.03, '#8a8a8a');
    A.flames(K, [[0.78, 0.09]], 1.0);
  }

  TL.carSet.register(TL.makeCar({ id: 'van', name: 'Delivery Van', short: 'Van', blurb: 'Boxy, with tall rear doors', draw }));
})();
