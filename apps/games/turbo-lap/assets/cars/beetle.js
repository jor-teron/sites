/* Turbo Lap — car 8: Retro beetle (TLQ1a). Round and classic: a domed cabin with a little oval window, bulging fenders, a louvred
   engine lid, small round chrome-ringed tail lamps, a chrome bumper with guards. Livery = a belt stripe round the body. */
window.TL = window.TL || {};
(() => {
  const A = TL.carArt, shade = A.shade, TAU = A.TAU;

  function draw(c, cx, by, w, color, o) {
    const K = A.kit(c, cx, by, w, o), l = K.lean / w;
    const ell = (fx, fy, rx, ry, fill) => { c.fillStyle = fill; c.beginPath(); c.ellipse(K.X(fx), K.Y(fy), w * rx, K.h * ry, 0, 0, TAU); c.fill(); };
    A.shadow(K, 0.56);
    A.tyre(K, 0.06, 0.24, 0.3, 0, 0.04); A.tyre(K, 0.76, 0.94, 0.3, 0, 0.04);
    // dome, fenders, body
    ell(0.5 + l * 0.7, 0.69, 0.3, 0.27, A.vgrad(K, 0.96, 0.45, [[0, shade(color, 0.28)], [1, shade(color, -0.1)]]));
    ell(0.14, 0.3, 0.115, 0.22, A.paint(K, color, 0.52, 0.1)); ell(0.86, 0.3, 0.115, 0.22, A.paint(K, color, 0.52, 0.1));
    ell(0.5, 0.43, 0.46, 0.31, A.paint(K, color, 0.74, 0.12));
    // rubber-ringed oval window
    ell(0.5 + l * 0.9, 0.76, 0.17, 0.125, '#0f0f0f'); ell(0.5 + l * 0.9, 0.76, 0.15, 0.1, A.glass(K, 0.86, 0.66));
    if (o.detail) ell(0.45 + l * 0.9, 0.79, 0.05, 0.03, 'rgba(255,255,255,0.2)');
    // belt stripe
    if (o.accent) { c.strokeStyle = o.accent; c.lineWidth = Math.max(1, K.h * 0.035); c.beginPath(); c.moveTo(K.X(0.1), K.Y(0.515)); c.lineTo(K.X(0.9), K.Y(0.515)); c.stroke(); }
    // louvred engine lid
    c.fillStyle = shade(color, -0.18); A.rr(K, 0.32, 0.58, 0.36, 0.2, 0.025); c.fill();
    c.strokeStyle = shade(color, -0.5); c.lineWidth = Math.max(1, w * 0.007); c.beginPath();
    for (let i = 0; i < 5; i++) { const y = K.Y(0.55 - i * 0.032); c.moveTo(K.X(0.36), y); c.lineTo(K.X(0.64), y); } c.stroke();
    c.fillStyle = '#c8ccd2'; A.rr(K, 0.46, 0.6, 0.08, 0.02, 0.006); c.fill();
    // round tail lamps
    A.lamp(K, 0.215, 0.42, 0.052, '#c9ccd2'); A.lamp(K, 0.785, 0.42, 0.052, '#c9ccd2');
    A.glowOn(K); A.lamp(K, 0.215, 0.42, 0.04, A.tailColor(K)); A.lamp(K, 0.785, 0.42, 0.04, A.tailColor(K)); A.glowOff(K);
    A.plate(K, 0.38, 0.35, 0.24, 0.11);
    // chrome bumper with guards, pipes
    c.fillStyle = '#c9ccd2'; A.rr(K, 0.28, 0.27, 0.025, 0.12, 0.006); c.fill(); A.rr(K, 0.695, 0.27, 0.025, 0.12, 0.006); c.fill();
    c.fillStyle = A.vgrad(K, 0.24, 0.12, [[0, '#eef0f4'], [0.5, '#a9aeb7'], [1, '#666b75']]); A.rr(K, 0.1, 0.24, 0.8, 0.1, 0.05); c.fill();
    A.pipes(K, [[0.4, 0.08], [0.6, 0.08]], 0.03, '#8a8a8a');
    A.flames(K, [[0.4, 0.08], [0.6, 0.08]], 0.9);
  }

  TL.carSet.register(TL.makeCar({ id: 'beetle', name: 'Retro Beetle', short: 'Beetle', blurb: 'Round, classic and cute', draw }));
})();
