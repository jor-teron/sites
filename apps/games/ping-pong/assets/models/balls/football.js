/*
 * Ping Pong — Football: a black-and-white soccer ball that rolls as it moves. The spin angle is fx.spin (the distance
 * the ball has travelled / its radius, signed by direction), so it is purely visual and never touches physics.
 * White body with black pentagon patches and seams, a dark outline (visible on a light court), a short dust trail, and a
 * few grey / black / grass specks on a hit. Own colours on every theme.
 */
(function () {
  /** Regular pentagon path, centre (cx, cy), circumradius s, rotated by rot. */
  function pent(ctx, cx, cy, s, rot) {
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = rot + k * Math.PI * 2 / 5, px = cx + Math.cos(a) * s, py = cy + Math.sin(a) * s;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  PP.registerBall({
    id: "football",
    name: "Football",
    trail: { len: 6, colors: ["#aab4be", "#e8eef5"], alpha: 0.3, glow: null },
    hit: { kind: "spark", count: 6, colors: ["#ffffff", "#2a2a2a", "#7bc47f"], speed: 3, life: 16, size: 2.4, glow: false },
    draw(ctx, x, y, r, col, fx) {
      const spin = fx ? fx.spin : 0;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#f7f7f4";
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.fillStyle = "#1b1b1f";
      ctx.strokeStyle = "#1b1b1f";
      ctx.lineWidth = Math.max(0.6, r * 0.09);
      ctx.lineJoin = "round";
      pent(ctx, 0, 0, r * 0.4, -Math.PI / 2);
      ctx.fill();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * Math.PI * 2 / 5, c = Math.cos(a), s = Math.sin(a);
        ctx.beginPath();                                     // seam: centre patch corner -> outer patch
        ctx.moveTo(c * r * 0.4, s * r * 0.4);
        ctx.lineTo(c * r * 0.68, s * r * 0.68);
        ctx.stroke();
        pent(ctx, c * r * 0.98, s * r * 0.98, r * 0.42, a + Math.PI);
        ctx.fill();
        const b = a + Math.PI / 5, cb = Math.cos(b), sb = Math.sin(b);   // seam between two outer patches
        ctx.beginPath();
        ctx.moveTo(cb * r * 0.72, sb * r * 0.72);
        ctx.lineTo(cb * r * 1.05, sb * r * 1.05);
        ctx.stroke();
      }
      ctx.restore();
      const sh = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.2, x, y, r);   // soft ball shading
      sh.addColorStop(0, "rgba(255,255,255,0.28)");
      sh.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      PP.outline(ctx, x, y, r, "rgba(20, 24, 32, 0.85)");
    },
  });
})();
