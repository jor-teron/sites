/* Turbo Lap — car 2: Muscle car (TLQ1a). Wide and heavy: a fat rear on fat tyres, a low narrow glasshouse, a ducktail, four round
   tail lamps in a dark panel, a chrome bumper and big twin exhausts. Livery = twin racing stripes. */
window.TL = window.TL || {};
(() => {
  const A = TL.carArt, shade = A.shade;

  function draw(c, cx, by, w, color, o) {
    const K = A.kit(c, cx, by, w, o), l = K.lean / w;
    A.shadow(K, 0.59);
    A.tyre(K, 0, 0.26, 0.4, 0, 0.04); A.tyre(K, 0.74, 1, 0.4, 0, 0.04);
    // low glasshouse
    c.fillStyle = A.vgrad(K, 0.92, 0.58, [[0, shade(color, -0.25)], [1, shade(color, -0.05)]]);
    A.poly(K, [[0.16, 0.6], [0.28 + l, 0.92], [0.72 + l, 0.92], [0.84, 0.6]], c.fillStyle);
    A.poly(K, [[0.22, 0.66], [0.31 + l, 0.87], [0.69 + l, 0.87], [0.78, 0.66]], A.glass(K, 0.87, 0.64));
    if (o.detail) A.poly(K, [[0.33 + l, 0.85], [0.43 + l, 0.85], [0.33, 0.67], [0.26, 0.67]], 'rgba(255,255,255,0.16)');
    // heavy body with flared haunches
    c.fillStyle = A.paint(K, color, 0.7, 0.12); A.rr(K, 0, 0.7, 1, 0.58, 0.085); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.14)'; A.rr(K, 0.04, 0.68, 0.92, 0.035, 0.02); c.fill();      // shoulder highlight
    // ducktail
    A.poly(K, [[0.1, 0.7], [0.14, 0.78], [0.86, 0.78], [0.9, 0.7]], shade(color, -0.22));
    A.poly(K, [[0.14, 0.78], [0.86, 0.78], [0.84, 0.8], [0.16, 0.8]], shade(color, 0.12));
    if (o.accent) {                                                                                  // twin stripes
      c.fillStyle = o.accent;
      c.fillRect(K.X(0.405), K.Y(0.7), w * 0.07, K.h * 0.34); c.fillRect(K.X(0.525), K.Y(0.7), w * 0.07, K.h * 0.34);
    }
    // tail lamp panels with four round lamps
    c.fillStyle = '#101010'; A.rr(K, 0.03, 0.62, 0.27, 0.2, 0.02); c.fill(); A.rr(K, 0.7, 0.62, 0.27, 0.2, 0.02); c.fill();
    A.glowOn(K);
    [0.1, 0.215, 0.785, 0.9].forEach(fx => A.lamp(K, fx, 0.52, 0.048, A.tailColor(K)));
    A.glowOff(K);
    if (o.detail) [0.1, 0.215, 0.785, 0.9].forEach(fx => A.lamp(K, fx, 0.52, 0.017, 'rgba(255,200,120,0.75)'));
    A.plate(K, 0.37, 0.5, 0.26, 0.12);
    // chrome bumper + fat exhausts
    c.fillStyle = A.vgrad(K, 0.3, 0.12, [[0, '#e3e6ec'], [0.5, '#9aa0aa'], [1, '#575c66']]); A.rr(K, 0.02, 0.3, 0.96, 0.15, 0.04); c.fill();
    A.pipes(K, [[0.22, 0.1], [0.78, 0.1]], 0.05, '#b4b8c0'); A.pipes(K, [[0.22, 0.1], [0.78, 0.1]], 0.03, '#1a1a1a');
    A.flames(K, [[0.22, 0.1], [0.78, 0.1]], 1.25);
  }

  TL.carSet.register(TL.makeCar({ id: 'muscle', name: 'Muscle Car', short: 'Muscle', blurb: 'Wide, heavy, fat rear', draw }));
})();
