/* Turbo Lap — car 9: Buggy (TLQ1a). An open tube frame on huge knobby tyres: a roll cage, a driver's helmet and seat back, an
   exposed engine with cooling fins, a rear bumper tube and small tail lamps. The frame is the body paint (tubes with a highlight). */
window.TL = window.TL || {};
(() => {
  const A = TL.carArt, shade = A.shade;

  function draw(c, cx, by, w, color, o) {
    const K = A.kit(c, cx, by, w, o), l = K.lean / w;
    A.shadow(K, 0.58);
    A.tyre(K, 0, 0.3, 0.6, 0, 0.06, true); A.tyre(K, 0.70, 1, 0.6, 0, 0.06, true);
    // driver: seat back, shoulders and helmet
    c.fillStyle = shade(color, -0.55); A.rr(K, 0.37, 0.64, 0.26, 0.38, 0.03); c.fill();
    c.fillStyle = o.accent || '#d6322d'; A.rr(K, 0.4 + l * 0.3, 0.72, 0.2, 0.09, 0.03); c.fill();
    A.lamp(K, 0.5 + l * 0.8, 0.8, 0.062, '#ececec');
    c.fillStyle = '#10161f'; c.fillRect(K.X(0.45 + l * 0.8), K.Y(0.815), w * 0.1, K.h * 0.03);
    // exposed engine with fins
    c.fillStyle = '#2d3037'; A.rr(K, 0.36, 0.42, 0.28, 0.3, 0.02); c.fill();
    c.fillStyle = '#4a4e57'; A.rr(K, 0.33, 0.4, 0.07, 0.14, 0.012); c.fill(); A.rr(K, 0.6, 0.4, 0.07, 0.14, 0.012); c.fill();
    c.strokeStyle = '#6b707b'; c.lineWidth = Math.max(1, w * 0.007); c.beginPath();
    for (let i = 0; i < 5; i++) { const y = K.Y(0.4 - i * 0.05); c.moveTo(K.X(0.38), y); c.lineTo(K.X(0.62), y); } c.stroke();
    // roll cage tubes: a dark outline then the paint on top
    const tube = (pts, lw) => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      [['#14161a', lw * 1.5], [color, lw]].forEach(s => {
        c.strokeStyle = s[0]; c.lineWidth = s[1]; c.beginPath();
        pts.forEach((p, i) => i ? c.lineTo(K.X(p[0]), K.Y(p[1])) : c.moveTo(K.X(p[0]), K.Y(p[1]))); c.stroke();
      });
    };
    const lw = Math.max(1.5, w * 0.022);
    tube([[0.31, 0.2], [0.32, 0.55], [0.35 + l, 0.97], [0.65 + l, 0.97], [0.68, 0.55], [0.69, 0.2]], lw);   // main hoop
    tube([[0.32, 0.55], [0.68, 0.55]], lw * 0.8);                                                           // lower cross bar
    tube([[0.32, 0.55], [0.5 + l * 0.6, 0.76], [0.68, 0.55]], lw * 0.55);                                   // brace
    tube([[0.2, 0.18], [0.8, 0.18]], lw * 1.1);                                                             // bumper tube
    tube([[0.31, 0.2], [0.2, 0.18]], lw * 0.8); tube([[0.69, 0.2], [0.8, 0.18]], lw * 0.8);
    // tail lamps, plate, exhaust
    A.glowOn(K); c.fillStyle = A.tailColor(K); A.rr(K, 0.255, 0.4, 0.07, 0.07, 0.012); c.fill(); A.rr(K, 0.675, 0.4, 0.07, 0.07, 0.012); c.fill(); A.glowOff(K);
    A.plate(K, 0.4, 0.58, 0.2, 0.09);
    A.pipes(K, [[0.57, 0.12]], 0.03, '#b4b8c0');
    A.flames(K, [[0.57, 0.12]], 1.0);
  }

  TL.carSet.register(TL.makeCar({ id: 'buggy', name: 'Dune Buggy', short: 'Buggy', blurb: 'Open frame, huge tyres', draw }));
})();
