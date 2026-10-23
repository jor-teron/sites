/*
 * Ping Pong — Neon Bar: a glowing tube. A dark glass body, a tube-coloured rim (the theme's paddle colour, so the two
 * sides stay apart) and a white-hot core; on a hit the tube flares: a brighter, bigger glow and a white flash that runs
 * from the contact point along the tube (a pulse of about 26 frames). Visual only; the body stays inside the hit box.
 */
PP.registerPaddle({
  id: "neon",
  name: "Neon Bar",
  hit: { kind: "spark", count: 6, colors: ["#ffffff", "#9ff4ff"], speed: 3.8, life: 18, size: 2.4, glow: true, ring: { color: "rgba(255,255,255,0.85)", size: 18, life: 14 } },
  draw(ctx, x, y, w, h, col, st) {
    const c = col.fill, p = PP.pulse(st.age, 26), r = w / 2;
    ctx.save();
    PP.glow(ctx, c, 9 + 16 * p);
    PP.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = "#0b1226";                               // dark glass: reads on a light court too
    ctx.fill();
    ctx.restore();
    ctx.save();
    PP.roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.fillStyle = PP.alpha(c, 0.28 + 0.4 * p);              // tube-coloured inner light
    ctx.fillRect(x, y, w, h);
    if (p > 0) {                                             // the flash: a bright spot at the contact point, spreading
      const fy = y + st.y * h, g = ctx.createRadialGradient(x + w / 2, fy, 0, x + w / 2, fy, h * (0.12 + 0.5 * (1 - p)));
      g.addColorStop(0, "rgba(255,255,255," + (0.95 * p) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    ctx.save();                                              // the hot core line
    ctx.strokeStyle = "rgba(255,255,255," + (0.8 + 0.2 * p) + ")";
    ctx.lineWidth = w * (0.22 + 0.14 * p);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + r + 1);
    ctx.lineTo(x + w / 2, y + h - r - 1);
    ctx.stroke();
    ctx.restore();
    ctx.save();                                              // the rim
    PP.glow(ctx, c, 6 + 10 * p);
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.8;
    PP.roundRect(ctx, x + 0.9, y + 0.9, w - 1.8, h - 1.8, r - 0.9);
    ctx.stroke();
    ctx.restore();
  },
});
