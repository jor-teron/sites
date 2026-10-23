/* Turbo Lap — car 5: Pickup truck (TLQ1a). Tall and square: a cab behind the open bed, bed rails and a big embossed tailgate with a
   handle, vertical tail lights, a chrome step bumper with a tow hitch, tall tyres with plenty of ground clearance. */
window.TL = window.TL || {};
(() => {
  const A = TL.carArt, shade = A.shade;

  function draw(c, cx, by, w, color, o) {
    const K = A.kit(c, cx, by, w, o), l = K.lean / w;
    A.shadow(K, 0.57);
    A.tyre(K, 0.01, 0.23, 0.42, 0, 0.04); A.tyre(K, 0.77, 0.99, 0.42, 0, 0.04);
    // cab seen over the bed
    A.poly(K, [[0.17, 0.66], [0.22 + l, 0.98], [0.78 + l, 0.98], [0.83, 0.66]], A.vgrad(K, 0.98, 0.66, [[0, shade(color, -0.25)], [1, shade(color, -0.05)]]));
    A.poly(K, [[0.23, 0.7], [0.27 + l, 0.93], [0.73 + l, 0.93], [0.77, 0.7]], A.glass(K, 0.93, 0.7));
    if (o.detail) A.poly(K, [[0.33 + l, 0.91], [0.42 + l, 0.91], [0.33, 0.72], [0.27, 0.72]], 'rgba(255,255,255,0.16)');
    A.poly(K, [[0.26 + l, 0.99], [0.74 + l, 0.99], [0.75 + l, 0.96], [0.25 + l, 0.96]], '#222');         // roof rack bar
    // bed: rails, dark inside, tailgate
    c.fillStyle = '#141414'; A.rr(K, 0.05, 0.76, 0.9, 0.12, 0.015); c.fill();
    c.fillStyle = A.paint(K, color, 0.78, 0.2); A.rr(K, 0.03, 0.78, 0.1, 0.16, 0.02); c.fill(); A.rr(K, 0.87, 0.78, 0.1, 0.16, 0.02); c.fill();
    c.fillStyle = A.paint(K, color, 0.72, 0.2); A.rr(K, 0.04, 0.72, 0.92, 0.52, 0.035); c.fill();
    c.strokeStyle = shade(color, -0.3); c.lineWidth = Math.max(1, w * 0.008); A.rr(K, 0.11, 0.65, 0.78, 0.38, 0.02); c.stroke();
    c.fillStyle = shade(color, -0.4); A.rr(K, 0.44, 0.7, 0.12, 0.035, 0.01); c.fill();                  // latch handle
    if (o.accent) { c.fillStyle = o.accent; c.fillRect(K.X(0.04), K.Y(0.285), w * 0.92, K.h * 0.025); }
    // vertical tail lights
    A.glowOn(K); c.fillStyle = A.tailColor(K); A.rr(K, 0.045, 0.76, 0.065, 0.26, 0.012); c.fill(); A.rr(K, 0.89, 0.76, 0.065, 0.26, 0.012); c.fill(); A.glowOff(K);
    A.plate(K, 0.38, 0.5, 0.24, 0.11);
    // step bumper, hitch, tailpipe
    c.fillStyle = A.vgrad(K, 0.24, 0.12, [[0, '#d4d8de'], [0.5, '#8d939d'], [1, '#555a64']]); A.rr(K, 0.02, 0.24, 0.96, 0.12, 0.025); c.fill();
    c.fillStyle = '#222'; A.rr(K, 0.46, 0.16, 0.08, 0.1, 0.005); c.fill(); A.lamp(K, 0.5, 0.13, 0.026, '#8f959f');
    A.pipes(K, [[0.8, 0.1]], 0.03, '#8a8a8a');
    A.flames(K, [[0.8, 0.1]], 1.0);
  }

  TL.carSet.register(TL.makeCar({ id: 'pickup', name: 'Pickup Truck', short: 'Pickup', blurb: 'Tall, with a bed and tailgate', draw }));
})();
