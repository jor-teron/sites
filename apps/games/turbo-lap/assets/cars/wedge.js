/* Turbo Lap — car 7: Supercar wedge (TLQ1a). Low and wide with a flat rear face: a slit of rear glass over slatted engine louvres,
   two big tail lights joined by a light bar, a black diffuser with four exhausts. Livery = twin centre stripes. */
window.TL = window.TL || {};
(() => {
  const A = TL.carArt, shade = A.shade;

  function draw(c, cx, by, w, color, o) {
    const K = A.kit(c, cx, by, w, o), l = K.lean / w;
    A.shadow(K, 0.58);
    A.tyre(K, 0, 0.25, 0.32, 0, 0.04); A.tyre(K, 0.75, 1, 0.32, 0, 0.04);
    // low cabin wedge
    A.poly(K, [[0.14, 0.5], [0.26 + l, 0.72], [0.74 + l, 0.72], [0.86, 0.5]], A.vgrad(K, 0.72, 0.5, [[0, shade(color, 0.1)], [1, shade(color, -0.2)]]));
    A.poly(K, [[0.24, 0.53], [0.31 + l, 0.67], [0.69 + l, 0.67], [0.76, 0.53]], A.glass(K, 0.67, 0.53));
    // wide flat body
    c.fillStyle = A.paint(K, color, 0.54, 0.12); A.rr(K, 0, 0.54, 1, 0.42, 0.08); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.15)'; A.rr(K, 0.05, 0.52, 0.9, 0.03, 0.015); c.fill();
    if (o.accent) {
      c.fillStyle = o.accent;
      A.poly(K, [[0.455, 0.7 + 0.015], [0.495, 0.7 + 0.015], [0.495, 0.14], [0.455, 0.14]], o.accent);
      A.poly(K, [[0.505, 0.715], [0.545, 0.715], [0.545, 0.14], [0.505, 0.14]], o.accent);
    }
    // engine louvres under the glass
    c.fillStyle = '#131313'; A.rr(K, 0.27, 0.53, 0.46, 0.1, 0.012); c.fill();
    c.strokeStyle = '#3d3d3d'; c.lineWidth = Math.max(1, w * 0.007); c.beginPath();
    for (let i = 1; i < 4; i++) { const y = K.Y(0.53 - 0.0 + i * 0.0 + 0.1 - i * 0.025); c.moveTo(K.X(0.28), y); c.lineTo(K.X(0.72), y); } c.stroke();
    // big tail lights and the bar
    A.glowOn(K); c.fillStyle = A.tailColor(K);
    A.poly(K, [[0.03, 0.5], [0.34, 0.5], [0.37, 0.4], [0.03, 0.36]], c.fillStyle);
    A.poly(K, [[0.97, 0.5], [0.66, 0.5], [0.63, 0.4], [0.97, 0.36]], c.fillStyle);
    A.rr(K, 0.36, 0.43, 0.28, 0.03, 0.01); c.fill();
    A.glowOff(K);
    if (o.detail) { c.fillStyle = 'rgba(255,180,150,0.55)'; A.rr(K, 0.06, 0.45, 0.24, 0.025, 0.01); c.fill(); A.rr(K, 0.7, 0.45, 0.24, 0.025, 0.01); c.fill(); }
    A.plate(K, 0.4, 0.37, 0.2, 0.09);
    // diffuser and four exhausts
    c.fillStyle = '#121212'; A.poly(K, [[0.03, 0.3], [0.97, 0.3], [0.94, 0.12], [0.06, 0.12]], c.fillStyle);
    c.strokeStyle = '#303030'; c.lineWidth = Math.max(1, w * 0.007); c.beginPath();
    for (let i = 1; i < 9; i++) { const f = 0.06 + i * 0.098; c.moveTo(K.X(f), K.Y(0.29)); c.lineTo(K.X(f), K.Y(0.13)); } c.stroke();
    const ex = [[0.4, 0.22], [0.47, 0.22], [0.53, 0.22], [0.6, 0.22]];
    A.pipes(K, ex, 0.032, '#a0a4ac'); A.pipes(K, ex, 0.019, '#0c0c0c');
    A.flames(K, [[0.435, 0.22], [0.565, 0.22]], 1.0);
  }

  TL.carSet.register(TL.makeCar({ id: 'wedge', name: 'Supercar Wedge', short: 'Wedge', blurb: 'Low, wide, flat tail', draw }));
})();
